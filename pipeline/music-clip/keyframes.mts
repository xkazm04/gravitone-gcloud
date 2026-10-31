// Keyframe stills for a /music-clip film through Leonardo's v2 API (GPT Image 2.5 Sunburst by default).
//
//   npx tsx pipeline/music-clip/keyframes.mts <clip dir> [--only K01,K02] [--again] [--dry | --yes] [--jobs 3]
//
// Reads <clip>/music-clip/keyframes.json:
//   { "v": 1,
//     "request": { "model": "openai/gpt-image-2.5-sunburst", "width": 2048, "height": 1136, "quality": "LOW",
//                  "style_ids": ["..."], "prompt_enhance": "OFF" },
//     "frames": [ { "id": "K01", "t": 0, "prompt": "..." }, ... ] }
// and writes <clip>/music-clip/keyframes/<id>.<ext> plus one line per call to keyframes/ledger.jsonl
// (generation id, credits, seconds, cleanup). A frame whose image exists is skipped unless --again.
//
// The setup is the operator's (2026-10-31, Stay Here v3): Sunburst, LOW quality, 2048x1136, one style id,
// prompt_enhance OFF - "low quality, medium resolution" keyframes for image-to-video.
// Spend: nothing runs without --yes (--dry prints the plan). Hygiene: every generation is deleted from the
// operator's Leonardo library once its pixels are on disk (memory: leonardo-studio-hygiene). The key comes
// from LEONARDO_API_KEY or the repo's .env.local and never reaches the console or a file.
import fs from "node:fs";
import path from "node:path";

const API = "https://cloud.leonardo.ai/api/rest";
const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const opt = (n: string) => { const i = argv.indexOf(n); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const dry = flag("--dry"), yes = flag("--yes"), again = flag("--again");
const only = opt("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
const jobs = Math.max(1, Number(opt("--jobs") ?? 3));
const [dir] = argv;
if (!dir) { console.error("usage: keyframes.mts <clip dir> [--only K01,K02] [--again] [--dry | --yes] [--jobs 3]"); process.exit(2); }

const clip = path.join(dir, "music-clip");
const spec = JSON.parse(fs.readFileSync(path.join(clip, "keyframes.json"), "utf8")) as {
  v: 1; request: Record<string, unknown> & { model: string; width: number; height: number };
  frames: { id: string; t?: number; prompt: string }[];
};
const outDir = path.join(clip, "keyframes");
fs.mkdirSync(outDir, { recursive: true });
const existing = (id: string) => fs.readdirSync(outDir).find((f) => f.startsWith(id + ".") && !f.endsWith(".json"));
const todo = spec.frames.filter((f) => (!only || only.includes(f.id)) && (again || !existing(f.id)));
const bad = spec.frames.filter((f) => f.prompt.length > 2000).map((f) => `${f.id} (${f.prompt.length} chars)`);
if (bad.length) { console.error(`prompts over v2's 2000 chars: ${bad.join(", ")}`); process.exit(2); }

console.log(`${todo.length} keyframe(s) to make with ${spec.request.model} ${spec.request.width}x${spec.request.height} ${spec.request.quality ?? ""}: ${todo.map((f) => f.id).join(" ")}`);
if (dry || !yes) { console.log(dry ? "dry: nothing sent" : "refusing to spend without --yes (or --dry for the plan)"); process.exit(dry ? 0 : 2); }

function apiKey(): string {
  if (process.env.LEONARDO_API_KEY) return process.env.LEONARDO_API_KEY;
  const env = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../../.env.local");
  const line = fs.existsSync(env) ? fs.readFileSync(env, "utf8").split(/\r?\n/).find((l) => l.startsWith("LEONARDO_API_KEY=")) : undefined;
  const v = line?.slice("LEONARDO_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  if (!v) { console.error("no LEONARDO_API_KEY in the environment or .env.local"); process.exit(2); }
  return v;
}
const key = apiKey();
const H = { authorization: `Bearer ${key}`, accept: "application/json", "content-type": "application/json" };
const hide = (s: string) => s.split(key).join("[redacted]").slice(0, 400);
type J = Record<string, any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(url: string, init: RequestInit = {}): Promise<J> {
  const r = await fetch(url, { ...init, headers: H });
  const text = await r.text();
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${url.replace(API, "")} -> ${r.status}: ${hide(text)}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
async function balance(): Promise<number | null> {
  try {
    const me = await api(`${API}/v1/me`);
    const d = Array.isArray(me.user_details) ? me.user_details[0] : undefined;
    if (!d) return null;
    return Object.entries(d).filter(([k, v]) => /tokens$/i.test(k) && typeof v === "number").reduce((n, [, v]) => n + (v as number), 0);
  } catch { return null; }
}
function reported(o: J | undefined): number | undefined {
  const g = o?.generate ?? o;
  const c = g?.cost?.amount ?? g?.apiCreditCost ?? g?.cost;
  const n = Number(c);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function one(f: { id: string; prompt: string }): Promise<{ credits?: number; ok: boolean }> {
  const t0 = Date.now();
  const { model, ...params } = spec.request;
  const body = { model, public: false, parameters: { ...params, quantity: 1, prompt: f.prompt } };
  let id: string | undefined, credits: number | undefined, cleanup = "none", file = "";
  try {
    const start = await api(`${API}/v2/generations`, { method: "POST", body: JSON.stringify(body) });
    id = start.generate?.generationId ?? start.generationId ?? start.id;
    if (!id) throw new Error(`no generation id: ${hide(JSON.stringify(start))}`);
    credits = reported(start);
    let url: string | undefined;
    for (let i = 0; i < 60 && !url; i++) {
      await sleep(5000);
      let job: J;
      try { const res = await api(`${API}/v1/generations/${id}`); job = res.generations_by_pk ?? res.generation ?? {}; } catch { continue; }
      const st = String(job.status ?? "").toUpperCase();
      if (st === "FAILED" || ["NSFW", "CONTENT_FILTERED", "MODERATED", "BLOCKED"].includes(st)) throw new Error(`generation ${st}`);
      if (st === "COMPLETE") { url = job.generated_images?.[0]?.url; credits ??= reported(job); if (!url) throw new Error("COMPLETE with no image"); }
    }
    if (!url) throw new Error("not finished within 300 s");
    const img = await fetch(url);
    if (!img.ok) throw new Error(`download ${img.status}`);
    const ext = (img.headers.get("content-type") ?? "image/png").includes("jpeg") ? "jpg" : (url.split("?")[0].split(".").pop() ?? "png");
    for (const old of fs.readdirSync(outDir).filter((x) => x.startsWith(f.id + "."))) fs.rmSync(path.join(outDir, old));
    file = `${f.id}.${ext}`;
    fs.writeFileSync(path.join(outDir, file), Buffer.from(await img.arrayBuffer()));
    return { credits, ok: true };
  } catch (e) {
    console.error(`${f.id}: ${hide(String((e as Error).message ?? e))}`);
    return { credits, ok: false };
  } finally {
    if (id) { try { await api(`${API}/v1/generations/${id}`, { method: "DELETE" }); cleanup = "deleted"; } catch { cleanup = "failed"; } }
    const line = { id: f.id, generationId: id, file, credits: credits ?? null, creditsSource: credits === undefined ? null : "api", s: Math.round((Date.now() - t0) / 1000), cleanup, at: new Date().toISOString() };
    fs.appendFileSync(path.join(outDir, "ledger.jsonl"), JSON.stringify(line) + "\n");
    console.log(`${f.id} ${file || "FAILED"} ${credits ?? "?"} cr ${line.s}s cleanup=${cleanup}`);
  }
}

const before = await balance();
const queue = [...todo];
let made = 0, failed = 0, reportedTotal = 0;
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  for (let f = queue.shift(); f; f = queue.shift()) { const r = await one(f); r.ok ? made++ : failed++; reportedTotal += r.credits ?? 0; }
}));
const after = await balance();
const delta = before !== null && after !== null ? before - after : null;
console.log(`made ${made}, failed ${failed}; credits reported ${reportedTotal || "?"}, balance delta ${delta ?? "?"}${after !== null ? `, balance now ${after}` : ""}`);
process.exit(failed ? 1 : 0);
