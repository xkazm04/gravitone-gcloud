// Image-to-video clips for a /music-clip film from its keyframes, on the box's own LTX (ComfyUI) - $0.
//
//   npx tsx pipeline/music-clip/clips.mts <clip dir> [--only K01,K02] [--again] [--seed 1000] [--dry | --yes] [--size 1280x704]
//
// Reads <clip>/music-clip/keyframes.json (frames: id, t, motion) and keyframes/<id>.<ext>; writes
// clips/<id>.mp4 and one line per clip to clips/ledger.jsonl. A clip runs from its keyframe's t to the
// next one's (the last to the track's end), in whole seconds, 2..10 (LTX's range is 1..10). A frame's own
// `seconds` overrides the span (a validation set of a few frames far apart on the track).
//
// The engine is lib/imaging/video/comfyLtx.ts renderLtxClip (LTX-2.5 i2v, two passes, ~6-7 min per 5 s at
// 1280x704 alone on the card). THE QUEUE IS SHARED with other sessions: a clip is only queued when ComfyUI's
// queue is empty, and models are released after it (the commit-charge lesson) only when no other prompt is
// waiting. Run it when the box is free (Stay Here, 2026-10-31: "once in the night the resources are free").
import fs from "node:fs";
import path from "node:path";
import { renderLtxClip } from "../../lib/imaging/video/comfyLtx";

const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const opt = (n: string) => { const i = argv.indexOf(n); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const dry = flag("--dry"), yes = flag("--yes"), again = flag("--again");
const only = opt("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
const [W, H] = (opt("--size") ?? "1280x704").split("x").map(Number);
const seedBase = Number(opt("--seed") ?? 1000); // a re-render of a drifted clip takes another seed (--again --seed 2000)
const [dir] = argv;
if (!dir) { console.error("usage: clips.mts <clip dir> [--only K01] [--again] [--dry | --yes] [--size 1280x704]"); process.exit(2); }

const clip = path.join(dir, "music-clip");
const spec = JSON.parse(fs.readFileSync(path.join(clip, "keyframes.json"), "utf8")) as { frames: { id: string; t: number; motion?: string; seconds?: number }[] };
const duration = JSON.parse(fs.readFileSync(path.join(clip, "timeline.json"), "utf8")).track.durationS as number;
const kfDir = path.join(clip, "keyframes"), outDir = path.join(clip, "clips");
fs.mkdirSync(outDir, { recursive: true });
const frames = [...spec.frames].sort((a, b) => a.t - b.t);
const plan = frames.map((f, i) => {
  const span = (frames[i + 1]?.t ?? duration) - f.t;
  const still = fs.readdirSync(kfDir).find((x) => x.startsWith(f.id + ".") && /\.(jpe?g|png|webp)$/i.test(x));
  return { ...f, seconds: Math.min(10, Math.max(2, Math.ceil(f.seconds ?? span))), still };
}).filter((f) => (!only || only.includes(f.id)) && (again || !fs.existsSync(path.join(outDir, `${f.id}.mp4`))));
const missing = plan.filter((f) => !f.still || !f.motion).map((f) => `${f.id}${!f.still ? " (no still)" : ""}${!f.motion ? " (no motion)" : ""}`);
if (missing.length) { console.error(`cannot render: ${missing.join(", ")}`); process.exit(2); }
const total = plan.reduce((n, f) => n + f.seconds, 0);
console.log(`${plan.length} clip(s), ${total} s of video at ${W}x${H} on local LTX ($0), est ${Math.round((total / 5) * 6.5 / 60 * 10) / 10} h alone on the card: ${plan.map((f) => `${f.id}:${f.seconds}s`).join(" ")}`);
if (dry || !yes) { console.log(dry ? "dry: nothing queued" : "refusing to queue without --yes (or --dry for the plan)"); process.exit(dry ? 0 : 2); }

const base = process.env.COMFY_URL ?? "http://127.0.0.1:8188";
const queueSize = async () => { try { const q = await (await fetch(`${base}/queue`)).json(); return q.queue_running.length + q.queue_pending.length; } catch { return -1; } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let made = 0, failed = 0;
for (const f of plan) {
  // wait for an empty queue: never stack ours on another session's run
  for (let n = await queueSize(); n !== 0; n = await queueSize()) {
    console.log(`${new Date().toISOString()} queue ${n < 0 ? "unreachable" : `busy (${n})`}; waiting 60 s before ${f.id}`);
    await sleep(60_000);
  }
  const bytes = new Uint8Array(fs.readFileSync(path.join(kfDir, f.still!)));
  const mime = /\.png$/i.test(f.still!) ? "image/png" : /\.webp$/i.test(f.still!) ? "image/webp" : "image/jpeg";
  const t0 = Date.now();
  try {
    const r = await renderLtxClip({ image: { bytes, mime }, prompt: f.motion!, width: W, height: H, seconds: f.seconds, seed: seedBase + frames.findIndex((x) => x.id === f.id) },
      { root: path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../.."), release: (await queueSize()) <= 1 });
    fs.writeFileSync(path.join(outDir, `${f.id}.mp4`), r.bytes);
    made++;
    const line = { id: f.id, seed: seedBase + frames.findIndex((x) => x.id === f.id), seconds: f.seconds, frames: r.frames, size: `${r.width}x${r.height}`, wallS: Math.round(r.wallMs / 1000), promptId: r.promptId, at: new Date().toISOString() };
    fs.appendFileSync(path.join(outDir, "ledger.jsonl"), JSON.stringify(line) + "\n");
    console.log(`${f.id} ${f.seconds}s ${line.wallS}s wall`);
  } catch (e) {
    failed++;
    const msg = String((e as Error).message ?? e).slice(0, 400);
    fs.appendFileSync(path.join(outDir, "ledger.jsonl"), JSON.stringify({ id: f.id, error: msg, wallS: Math.round((Date.now() - t0) / 1000), at: new Date().toISOString() }) + "\n");
    console.error(`${f.id} FAILED: ${msg}`);
  }
}
console.log(`made ${made}, failed ${failed}`);
process.exit(failed ? 1 : 0);
