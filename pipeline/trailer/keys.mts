// Keyframes and the clip plan of a /trailer-clip (verbs `keys`, `keysheet` and `plan` of pipeline/trailer.mts).
//
// <folder>/music-clip/keyframes.json:
//   { "v": 1, "who": { "RIVET": "<fixed phrase>", ... },
//     "bible": [ { "id": "plate-floor", "prompt": "...", "refs": [] } ],
//     "frames": [ { "id": "GM06", "concept": "good-morning", "beat": "blast", "refs": ["plate-floor", "cast"],
//                   "who": ["RIVET"], "scene": "...", "motion": "...", "end": "GM06e" },
//                 { "id": "GM06e", "concept": "good-morning", "beat": "blast", "refs": ["GM06"], "who": ["RIVET"],
//                   "scene": "...", "endOnly": true } ] }
//
// One world for all concepts: the plates and the crew are shared, so a winning shot of one concept can sit beside a
// winning shot of another when they are fused. `scene` stays short and plain because clips-h3.py quotes it after
// "The shot ends on:"; `who` is expanded into the image prompt only.
//
// A ref is a bible id, `cast` (the Rivet sheet), or another frame's id: frames are drawn in dependency order, so an end
// frame is painted from its own start frame at the same camera and distance. A different framing at the end makes H3
// cut inside the clip (Stay Here v5).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { codexImage } from "./codex.mts";

export type Frame = { id: string; concept: string; beat: "shift" | "blast"; refs: string[]; who?: string[]; scene: string; motion?: string; end?: string; endOnly?: boolean };
export type Keys = { v: 1; who: Record<string, string>; bible: { id: string; prompt: string; refs?: string[] }[]; frames: Frame[] };
type Ctx = { clip: string; look: string; again: boolean; dry: boolean; yes: boolean; jobs: number; only?: string[] };

export function loadKeys(clip: string, conceptIds: string[]): Keys {
  const p = path.join(clip, "keyframes.json");
  if (!fs.existsSync(p)) { console.error(`no ${p}`); process.exit(2); }
  const k = JSON.parse(fs.readFileSync(p, "utf8")) as Keys;
  const bad: string[] = [];
  const bibleIds = new Set(k.bible.map((b) => b.id)), byId = new Map(k.frames.map((f) => [f.id, f]));
  if (byId.size !== k.frames.length) bad.push("a frame id repeats");
  for (const f of k.frames) {
    if (!conceptIds.includes(f.concept)) bad.push(`${f.id}: unknown concept ${f.concept}`);
    if (f.beat !== "shift" && f.beat !== "blast") bad.push(`${f.id}: beat ${f.beat}`);
    if (!f.scene?.trim()) bad.push(`${f.id}: no scene`);
    for (const r of f.refs) if (r !== "cast" && !bibleIds.has(r) && !byId.has(r)) bad.push(`${f.id}: unknown ref ${r}`);
    for (const w of f.who ?? []) if (!k.who[w]) bad.push(`${f.id}: unknown who ${w}`);
    if (!f.endOnly && !/no music/i.test(f.motion ?? "")) bad.push(`${f.id}: motion must exist and say "No music" (H3 scores a clip when it is not told otherwise)`);
    if (!f.endOnly && !/sound:/i.test(f.motion ?? "")) bad.push(`${f.id}: motion must name its sound ("Sound: ...")`);
    if (f.end) {
      const e = byId.get(f.end);
      if (!e?.endOnly) bad.push(`${f.id}: end ${f.end} is not an endOnly frame`);
      else if (!e.refs.includes(f.id)) bad.push(`${f.end}: an end frame is painted from its start, so refs must name ${f.id}`);
    }
  }
  if (bad.length) { console.error(`keyframes.json refused:\n- ${bad.join("\n- ")}`); process.exit(2); }
  return k;
}

const LABEL = (r: string, frames: Set<string>) =>
  r === "cast" ? "shows only who Rivet is, his build, paint, visor and tools; take nothing else from it"
  : r === "crew" ? "shows only who the four coworkers are, their builds, paint and tools; take nothing else from it"
  : r.startsWith("plate-") ? "is the set: this same place, its machines and its light; the camera may stand anywhere in it"
  : frames.has(r) ? "is the same shot a moment earlier: keep the camera, lens, distance and framing exactly, and every figure the same; change only what this prompt says"
  : "is a reference";

function refPath(clip: string, r: string): string {
  if (r === "cast") return path.join(clip, "art", "cast.png");
  return fs.existsSync(path.join(clip, "bible", `${r}.png`)) ? path.join(clip, "bible", `${r}.png`) : path.join(clip, "keyframes", `${r}.png`);
}

function leadOf(refs: string[], frames: Set<string>): string {
  return refs.map((r, i) => `Image ${i + 1} ${LABEL(r, frames)}.`).join(" ") + (refs.length ? " " : "");
}

const TAIL = "No captions, no title, no logo, no watermark, no border, no on-screen text: one continuous film frame.";

function framePrompt(k: Keys, f: Frame, look: string, frames: Set<string>): string {
  return `${leadOf(f.refs, frames)}${look} ${(f.who ?? []).map((w) => k.who[w]).join(" ")} ${f.scene} ${TAIL}`;
}

/** Runs tasks whose refs are all drawn; a sweep per dependency level, `jobs` at a time. */
async function sweep(tasks: { id: string; deps: string[]; run: () => Promise<boolean> }[], jobs: number): Promise<number> {
  const pending = new Set(tasks.map((t) => t.id));
  let failed = 0;
  while (pending.size) {
    const ready = tasks.filter((t) => pending.has(t.id) && !t.deps.some((d) => pending.has(d)));
    if (!ready.length) { console.error(`stuck, a ref cycle or a failed ref: ${[...pending].join(" ")}`); return failed + pending.size; }
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(jobs, ready.length) }, async () => {
      while (next < ready.length) {
        const t = ready[next++];
        if (await t.run()) pending.delete(t.id);
        else { failed++; pending.delete(t.id); for (const o of tasks) if (o.deps.includes(t.id)) { pending.delete(o.id); failed++; console.error(`${o.id}: skipped, ${t.id} failed`); } }
      }
    }));
  }
  return failed;
}

export async function runKeys(k: Keys, c: Ctx) {
  const frameIds = new Set(k.frames.map((f) => f.id));
  const bibleDir = path.join(c.clip, "bible"), keyDir = path.join(c.clip, "keyframes");
  fs.mkdirSync(bibleDir, { recursive: true }); fs.mkdirSync(keyDir, { recursive: true });
  const allIds = [...k.bible.map((b) => b.id), ...frameIds];
  const unknown = (c.only ?? []).filter((o) => !allIds.includes(o));
  if (unknown.length) { console.error(`unknown id(s): ${unknown.join(", ")}`); process.exit(2); }
  const wanted = (id: string) => !c.only || c.only.includes(id);
  const bibleTodo = k.bible.filter((b) => wanted(b.id) && (c.again || !fs.existsSync(path.join(bibleDir, `${b.id}.png`))));
  const frameTodo = k.frames.filter((f) => wanted(f.id) && (c.again || !fs.existsSync(path.join(keyDir, `${f.id}.jpg`))));
  console.log(`${bibleTodo.length} bible image(s), ${frameTodo.length} keyframe(s) on Codex image_gen, ${c.jobs} at a time`);
  if (c.dry) {
    for (const b of bibleTodo) console.log(`\n${b.id}: ${leadOf(b.refs ?? [], frameIds)}${c.look} ${b.prompt}`);
    for (const f of frameTodo) console.log(`\n${f.id} [${f.refs.join(", ")}]: ${framePrompt(k, f, c.look, frameIds)}`);
    return;
  }
  if (!c.yes) { console.error("refusing without --yes (or --dry for the prompts)"); process.exit(2); }
  const todoIds = new Set([...bibleTodo.map((b) => b.id), ...frameTodo.map((f) => f.id)]);
  const tasks = [
    ...bibleTodo.map((b) => ({ id: b.id, deps: (b.refs ?? []).filter((r) => todoIds.has(r)),
      run: () => codexImage(bibleDir, b.id, `${leadOf(b.refs ?? [], frameIds)}${c.look} ${b.prompt} ${TAIL}`, (b.refs ?? []).map((r) => refPath(c.clip, r))) })),
    ...frameTodo.map((f) => ({ id: f.id, deps: f.refs.filter((r) => todoIds.has(r)),
      run: async () => {
        const ok = await codexImage(keyDir, f.id, framePrompt(k, f, c.look, frameIds), f.refs.map((r) => refPath(c.clip, r)));
        if (!ok) return false;
        // clips-h3.py uploads <id>.jpg; the png stays as the reference an end frame is painted from
        const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(keyDir, `${f.id}.png`), "-q:v", "2", path.join(keyDir, `${f.id}.jpg`)]);
        return r.status === 0;
      } })),
  ];
  const failed = await sweep(tasks, c.jobs);
  console.log(`made ${tasks.length - failed}, failed ${failed}`);
  if (failed) process.exit(1);
}

/** Order the day so a short day still compares like with like: every concept's opening, then every blast, then the rest. */
export function writePlan(k: Keys, clip: string, drop: string[]) {
  const shots = k.frames.filter((f) => !f.endOnly && !drop.includes(f.concept));
  const concepts = [...new Set(shots.map((f) => f.concept))];
  const of = (c: string, beat: Frame["beat"]) => shots.filter((f) => f.concept === c && f.beat === beat);
  const first = concepts.map((c) => of(c, "shift")[0]), blast = concepts.map((c) => of(c, "blast")[0]);
  const lead = new Set([...first, ...blast]);
  const rest: Frame[] = [];
  const queues = concepts.map((c) => shots.filter((f) => f.concept === c && !lead.has(f)));
  while (queues.some((q) => q.length)) for (const q of queues) { const f = q.shift(); if (f) rest.push(f); }
  const ordered = [...first, ...blast, ...rest];
  const plan = ordered.map((f) => (f.end ? { id: f.id, end: f.end } : { id: f.id }));
  fs.writeFileSync(path.join(clip, "clips-plan.json"), JSON.stringify(plan, null, 2));
  const hours = (min: number) => (ordered.length * min / 60).toFixed(1);
  console.log(`${ordered.length} clips across ${concepts.length} concept(s), ${hours(8)} h at 8 min a clip alone on the card (Stay Here: 7-8.5), ${hours(23)} h at the 23 min seen sharing it`);
  console.log(`first ${first.length + blast.length}: ${[...first, ...blast].map((f) => f.id).join(" ")}`);
}

export function keysPage(k: Keys, titleOf: (concept: string) => string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fig = (f: Frame) => `<figure><img src="keyframes/${esc(f.id)}.jpg" alt="${esc(f.scene)}"><figcaption><b>${esc(f.id)}</b> ${esc(f.beat)}${f.endOnly ? " end" : ""}</figcaption></figure>`;
  const concepts = [...new Set(k.frames.map((f) => f.concept))];
  const rows = concepts.map((c) => `<h2>${esc(titleOf(c))}</h2><div class="row">${k.frames.filter((f) => f.concept === c).map(fig).join("")}</div>`).join("\n");
  const bible = k.bible.map((b) => `<figure><img src="bible/${esc(b.id)}.png" alt="${esc(b.id)}"><figcaption><b>${esc(b.id)}</b></figcaption></figure>`).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>keyframes</title><style>
body{margin:0;padding:24px;background:#0e0f11;color:#e8e4da;font:14px/1.3 system-ui,sans-serif}h2{margin:18px 0 6px;font-size:18px}
.row{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:6px}figure{margin:0}img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}figcaption{padding:2px 0;color:#bdbbb1;font-size:12px}b{color:#e8e4da}
</style><h2>bible</h2><div class="row">${bible}</div>${rows}</html>`;
}
