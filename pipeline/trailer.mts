// /trailer-clip: one game or film trailer from concepts through stop-and-resume gates (skill: .claude/skills/trailer-clip).
//
//   npx tsx pipeline/trailer.mts status "<folder>" [--json]
//   npx tsx pipeline/trailer.mts art "<folder>" [--only a,b] [--again] [--jobs 3] --dry|--yes
//   npx tsx pipeline/trailer.mts board "<folder>"
//   npx tsx pipeline/trailer.mts pick "<folder>" <concept id>
//
// Everything lives in <folder>/music-clip/ on purpose: clips-h3.py and deliver.mts read that path, so the trailer
// runs on them unchanged. What differs from /music-clip is that there is no track and no beat grid. The timeline is
// the concept's own beats, and the sound is what H3 draws with each clip (pipeline/trailer/cut.mts). Native sound only
// for now (operator, 2026-11-05): a custom layer, probably ElevenLabs, comes only after this proves the quality.
//
// Art: one `codex exec` turn per image on the operator's ChatGPT seat (built-in image_gen, measured on Unlatched at
// 1672x941, 3 in parallel). The prompt goes in on stdin: `-i` takes several files and would swallow an argument.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { boardPage, BEATS, type Concepts } from "./trailer/board.mts";

const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const opt = (n: string) => { const i = argv.indexOf(n); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const dry = flag("--dry"), yes = flag("--yes"), again = flag("--again"), asJson = flag("--json");
const only = opt("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
const jobs = Math.max(1, Number(opt("--jobs") ?? 3));
const [verb, folder, arg] = argv;
if (!verb || !folder) { console.error('usage: trailer.mts <status|art|board|pick> "<folder>" [...]'); process.exit(2); }

const clip = path.join(path.resolve(folder), "music-clip");
const file = (...p: string[]) => path.join(clip, ...p);
const artDir = file("art");

function load(): Concepts {
  if (!fs.existsSync(file("concepts.json"))) { console.error(`no ${file("concepts.json")}`); process.exit(2); }
  const c = JSON.parse(fs.readFileSync(file("concepts.json"), "utf8")) as Concepts;
  const bad = violations(c);
  if (bad.length) { console.error(`concepts.json refused:\n- ${bad.join("\n- ")}`); process.exit(2); }
  return c;
}

/** Every violation at once, as `board t` lists them: a refusal that names one at a time costs a round per defect. */
function violations(c: Concepts): string[] {
  const out: string[] = [];
  for (const k of ["title", "look", "rivet", "castPrompt"] as const) if (!c[k]?.trim()) out.push(`${k} is empty`);
  if (!c.concepts?.length || c.concepts.length > 6) out.push("1-6 concepts");
  const ids = new Set<string>();
  for (const x of c.concepts ?? []) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(x.id)) out.push(`${x.id}: id is not kebab-case`);
    if (ids.has(x.id)) out.push(`${x.id}: id repeats`);
    ids.add(x.id);
    for (const k of ["name", "logline", "device", "motif", "ghosts", "sound", "risk", "art"] as const) if (!x[k]?.trim()) out.push(`${x.id}: ${k} is empty`);
    const got = (x.beats ?? []).map((b) => b.beat).filter((b) => b !== "sting");
    if (got.join() !== BEATS.join()) out.push(`${x.id}: beats must run ${BEATS.join(" > ")} (a sting may follow), got ${got.join(" > ")}`);
    for (const b of x.beats ?? []) {
      if (!(b.seconds > 0)) out.push(`${x.id}/${b.beat}: seconds must be positive`);
      if (!b.picture?.trim() || !b.sound?.trim()) out.push(`${x.id}/${b.beat}: picture and sound are both required`);
    }
    const total = (x.beats ?? []).reduce((n, b) => n + b.seconds, 0);
    if (total < 45 || total > 150) out.push(`${x.id}: runs ${total} s, outside 45-150 s`);
    const black = x.beats?.find((b) => b.beat === "black");
    if (black && black.seconds < 2) out.push(`${x.id}: the black lasts ${black.seconds} s, under the 2 s a held silence needs`);
  }
  return out;
}

const stateFile = file("trailer-state.json");
const state = (): { pick?: string; pickedAt?: string } => fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};
const artOf = (id: string) => path.join(artDir, `${id}.png`);
const CAST = "cast";

function fullPrompt(c: Concepts, id: string): { prompt: string; refs: string[] } {
  const tail = "No captions, no title, no logo, no watermark, no border: one continuous film frame.";
  if (id === CAST) return { prompt: `${c.look} ${c.rivet} ${c.castPrompt}`, refs: [] };
  const x = c.concepts.find((k) => k.id === id)!;
  const cast = artOf(CAST);
  const refs = fs.existsSync(cast) ? [cast] : [];
  // Measured on Unlatched: with this instruction references keep who the character is and do not lock the composition.
  const lead = refs.length ? "The attached image shows only who Rivet is, his build, paint, visor and tools: take nothing else from it. The place, camera angle, distance, light and pose are new. " : "";
  return { prompt: `${lead}${c.look} ${c.rivet} ${x.art} ${tail}`, refs };
}

function codexOne(id: string): Promise<boolean> {
  const c = load();
  const { prompt, refs } = fullPrompt(c, id);
  const full = `Use your built-in image_gen tool to make exactly ONE image, wide 16:9 landscape (the widest landscape size you have). ${prompt} After generating, copy the image file into the current working directory as ${id}.png and print its pixel size. Do nothing else.`;
  const log = fs.openSync(path.join(artDir, `${id}.log`), "w");
  const args = ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", `"${artDir}"`, ...refs.flatMap((r) => ["-i", `"${r}"`]), "--", "-"];
  return new Promise((resolve) => {
    const t0 = Date.now();
    // shell: the npm shim is a .cmd on Windows, and spawn refuses a .cmd without one
    const p = spawn("codex", args, { shell: true, stdio: ["pipe", log, log], windowsHide: true });
    p.stdin.end(full);
    const finish = (code: number | null) => {
      fs.closeSync(log);
      const ok = code === 0 && fs.existsSync(artOf(id));
      const line = { id, ok, code, seconds: Math.round((Date.now() - t0) / 1000), refs: refs.length, at: new Date().toISOString() };
      fs.appendFileSync(path.join(artDir, "ledger.jsonl"), JSON.stringify(line) + "\n");
      console.log(`${id}: ${ok ? "ok" : `FAILED (see ${path.join(artDir, id + ".log")})`} in ${line.seconds} s`);
      resolve(ok);
    };
    p.on("error", () => finish(-1));
    p.on("close", finish);
  });
}

async function art() {
  const c = load();
  fs.mkdirSync(artDir, { recursive: true });
  const all = [CAST, ...c.concepts.map((x) => x.id)];
  const known = new Set(all);
  const unknown = (only ?? []).filter((o) => !known.has(o));
  if (unknown.length) { console.error(`unknown id(s): ${unknown.join(", ")}; valid: ${all.join(", ")}`); process.exit(2); }
  const todo = all.filter((id) => (!only || only.includes(id)) && (again || !fs.existsSync(artOf(id))));
  console.log(`${todo.length} image(s) on Codex image_gen (the operator's ChatGPT seat), ${jobs} at a time: ${todo.join(" ")}`);
  if (dry) { for (const id of todo) console.log(`\n${id}: ${fullPrompt(c, id).prompt}`); return; }
  if (!yes) { console.error("refusing without --yes (or --dry for the prompts)"); process.exit(2); }
  let failed = 0;
  // The cast comes first and alone: every concept image attaches it.
  if (todo.includes(CAST)) {
    if (again) fs.rmSync(artOf(CAST), { force: true });
    if (!(await codexOne(CAST))) failed++;
  }
  const rest = todo.filter((id) => id !== CAST);
  if (again) for (const id of rest) fs.rmSync(artOf(id), { force: true });
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, rest.length) }, async () => {
    while (next < rest.length) { if (!(await codexOne(rest[next++]))) failed++; }
  }));
  console.log(`made ${todo.length - failed}, failed ${failed}`);
  if (failed) process.exit(1);
}

async function board() {
  const c = load();
  const missing = c.concepts.filter((x) => !fs.existsSync(artOf(x.id))).map((x) => x.id);
  const html = file("board.html");
  fs.writeFileSync(html, boardPage(c, (id) => fs.existsSync(artOf(id)), state().pick));
  const { chromium } = await import("playwright");
  const b = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  try {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.goto("file:///" + html.replace(/\\/g, "/"));
    await p.waitForLoadState("networkidle");
    await p.screenshot({ path: file("board-sheet.png"), fullPage: true });
  } finally { await b.close(); }
  console.log(JSON.stringify({ html, sheet: file("board-sheet.png"), concepts: c.concepts.length, missingArt: missing }, null, 2));
}

function status() {
  const has = fs.existsSync(file("concepts.json"));
  const c = has ? load() : undefined;
  const missing = c ? [CAST, ...c.concepts.map((x) => x.id)].filter((id) => !fs.existsSync(artOf(id))) : [];
  const clips = fs.existsSync(file("clips")) ? fs.readdirSync(file("clips")).filter((f) => f.endsWith(".mp4")).length : 0;
  const s = state();
  const next = !has ? "write concepts.json"
    : missing.length ? "art --yes"
    : !fs.existsSync(file("board.html")) ? "board"
    : !s.pick ? "STOP: waiting for pick <id>"
    : !fs.existsSync(file("keyframes.json")) ? "write the shot plan and keyframes.json"
    : !clips ? "sound test on H3 (clips-h3.py), then the clips"
    : !fs.existsSync(file("edit.json")) ? "write edit.json"
    : "cut";
  const out = { folder: path.resolve(folder), concepts: c?.concepts.map((x) => x.id) ?? [], missingArt: missing, pick: s.pick ?? null, clips, next };
  console.log(asJson ? JSON.stringify(out, null, 2) : Object.entries(out).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : v}`).join("\n"));
}

function pick() {
  const c = load();
  if (!arg || !c.concepts.some((x) => x.id === arg)) { console.error(`pick one of: ${c.concepts.map((x) => x.id).join(", ")}`); process.exit(2); }
  fs.writeFileSync(stateFile, JSON.stringify({ ...state(), pick: arg, pickedAt: new Date().toISOString() }, null, 2));
  console.log(`picked ${arg}`);
}

if (verb === "art") await art();
else if (verb === "board") await board();
else if (verb === "status") status();
else if (verb === "pick") pick();
else { console.error(`unknown verb ${verb}`); process.exit(2); }
