// MUSIC-CLIP - one finished Suno track (mp3 + lyrics + style prompt) walked
// to a clip through stop-and-resume gates. The /music-clip skill wraps it; the
// model session authors the directions, the story and the hero page between
// the verbs, and this CLI validates, assembles, photographs and remembers.
//
//   npx tsx pipeline/music-clip.mts analyze <dir> (--yes | --dry) [--audio <file>]
//   npx tsx pipeline/music-clip.mts status <dir>
//   npx tsx pipeline/music-clip.mts board a|b <dir>
//   npx tsx pipeline/music-clip.mts pick <dir> a:<id> | b:<id> | stack:<kernel|hyperframes|remotion>
//   npx tsx pipeline/music-clip.mts pack <dir> [--audio <file>]
//   npx tsx pipeline/music-clip.mts compare <dir>
//
//   analyze  beats, tempo, bands, sections and lyric times -> music-clip/timeline.json
//   status   the stage, the picks, which artifacts exist, the next verb
//   board    validate the authored files, assemble board-a.html / board-b.html,
//            and photograph them to board-a-sheet.png / board-b-sheet.png
//   pick     record a choice; picking the same thing twice changes nothing.
//            stack:<name> copies that stack's full render to final.mp4
//   pack     seal the bake-off input into music-clip/bakeoff/pack/ with its sha1
//   compare  the stacks' results side by side -> music-clip/compare.html
//
//   --json on any verb: one JSON document on stdout, progress on stderr.
//   Exit 0 ok · 1 refused or failed (one line saying what to do) · 2 usage, or
//   analyze asked to spend without --yes/--dry.
//
// SPEND: the only vendor is Gemini (lyric line times), and only `analyze --yes`
// calls it. With neither flag, analyze prints what it would do and stops; it
// does not decide for the operator. GOOGLE_AI_API_KEY comes from the
// environment or .env.local at the repo root and is never printed.
//
// WRITES: only under <dir>/music-clip/ (lib/music-clip/folder.ts clipPath).
// It opens no store; nothing here reaches foundry-out.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const YES = argv.includes("--yes");
const DRY = argv.includes("--dry");
const BOOL = ["--json", "--yes", "--dry"];
const rest = argv.filter((a) => !BOOL.includes(a));
const audioAt = rest.indexOf("--audio");
const AUDIO = audioAt >= 0 ? rest[audioAt + 1] : undefined;
const args = audioAt >= 0 ? rest.filter((_, i) => i !== audioAt && i !== audioAt + 1) : rest;
const cmd = args[0];

const emit = (v: unknown) => process.stdout.write(`${JSON.stringify(v)}\n`);
const say = (s: string) => (JSON_OUT ? process.stderr : process.stdout).write(`${s}\n`);

function usage(msg: string): never {
  if (JSON_OUT) emit({ ok: false, error: msg, usage: true });
  else {
    console.error(`music-clip: ${msg}`);
    console.error("usage: npx tsx pipeline/music-clip.mts <analyze|status|board a|board b|pick|pack|compare> <dir> [--json]");
  }
  process.exit(2);
}

/** .env then .env.local, never clobbering an exported value. Only GOOGLE_AI_API_KEY is wanted. */
function loadKey() {
  for (const f of [".env", ".env.local"]) {
    const at = path.join(ROOT, f);
    if (!fs.existsSync(at)) continue;
    for (const line of fs.readFileSync(at, "utf8").split(/\r?\n/)) {
      const m = /^\s*GOOGLE_AI_API_KEY\s*=\s*(.+?)\s*$/.exec(line);
      if (m && m[1] && process.env["GOOGLE_AI_API_KEY"] === undefined) process.env["GOOGLE_AI_API_KEY"] = m[1].replace(/^["']|["']$/g, "");
    }
  }
}

const { ClipError, clipPath, clipRoot, readState, readTimeline, writeState, runAnalyze } = await import("../lib/music-clip/folder.ts");
const { applyPick, nextVerb, parsePick, STACKS } = await import("../lib/music-clip/state.ts");

function dirArg(i: number): string {
  const d = args[i];
  if (!d || d.startsWith("--")) usage("name the clip folder");
  return path.resolve(d);
}

const ARTIFACTS = [
  "state.json", "timeline.json", "directions.json", "board-a.html", "board-a-sheet.png", "story.json",
  "board-b/hero.html", "board-b.html", "board-b-sheet.png", "bakeoff/pack/pack.json",
  ...STACKS.map((s) => `bakeoff/${s}/result.json`), "compare.html", "final.mp4",
];

async function main(): Promise<void> {
  if (cmd === "analyze") {
    const dir = dirArg(1);
    if (YES) loadKey();
    if (YES && !process.env["GOOGLE_AI_API_KEY"]) throw new ClipError("analyze --yes needs GOOGLE_AI_API_KEY (environment or .env.local); --dry needs none", "env");
    const { analyzeTrack } = await import("../lib/music-clip/analyze.ts");
    const out = await runAnalyze(dir, { yes: YES, dry: DRY, ...(AUDIO ? { audio: AUDIO } : {}) }, analyzeTrack);
    if (out.status === "refused") {
      if (JSON_OUT) emit({ ok: false, refused: true, plan: out.plan });
      else for (const l of out.plan) console.error(l);
      process.exit(2);
    }
    if (JSON_OUT) emit({ ok: true, verb: "analyze", ...out });
    else {
      say(`${out.dry ? "dry" : "live"} analysis -> ${out.timeline}`);
      if (out.reset) say("the track changed since the last analysis: state reset to analyzed, picks dropped");
      say(`stage ${out.state.stage}`);
      for (const w of out.warnings) say(`warning: ${w}`);
    }
    return;
  }

  if (cmd === "status") {
    const dir = dirArg(1);
    const state = readState(dir);
    const exists = Object.fromEntries(ARTIFACTS.map((a) => [a, fs.existsSync(clipPath(dir, a))]));
    const results = STACKS.filter((s) => exists[`bakeoff/${s}/result.json`]).length;
    const next = nextVerb(state, { directions: !!exists["directions.json"], story: !!exists["story.json"] && !!exists["board-b/hero.html"], results });
    if (JSON_OUT) emit({ ok: true, verb: "status", dir: clipRoot(dir), stage: state?.stage ?? null, picks: state?.picks ?? {}, artifacts: exists, next });
    else {
      say(`${clipRoot(dir)}`);
      say(`stage ${state?.stage ?? "(none)"}  picks ${JSON.stringify(state?.picks ?? {})}`);
      for (const a of ARTIFACTS) say(`  ${exists[a] ? "x" : " "} ${a}`);
      say(`next: ${next}`);
    }
    return;
  }

  if (cmd === "board") {
    const which = args[1];
    if (which !== "a" && which !== "b") usage("board a <dir> | board b <dir>");
    const dir = dirArg(2);
    const { renderBoardA, renderBoardB } = await import("../lib/music-clip/boards.ts");
    const r = which === "a" ? await renderBoardA(dir) : await renderBoardB(dir);
    if (JSON_OUT) emit({ ok: true, verb: `board ${which}`, ...r });
    else {
      say(`${r.html}\n${r.sheet}\nstage ${r.stage}${r.framesDiffer === undefined ? "" : `  hero frames ${r.framesDiffer ? "differ" : "IDENTICAL"}`}`);
      for (const w of r.warnings) say(`warning: ${w}`);
    }
    return;
  }

  if (cmd === "pick") {
    const dir = dirArg(1);
    const pick = parsePick(args[2]);
    const state = readState(dir);
    if (!state) throw new ClipError(`no state in ${clipRoot(dir)}; run analyze first`, "missing");
    let valid: readonly string[];
    if (pick.kind === "a") {
      const { readDirections } = await import("../lib/music-clip/boards.ts");
      valid = readDirections(dir).directions.map((d) => d.id);
    } else if (pick.kind === "b") {
      const { readStory } = await import("../lib/music-clip/boards.ts");
      valid = [readStory(dir, readTimeline(dir), state.picks.a).direction];
    } else valid = STACKS;
    const { state: next, changed } = applyPick(state, pick, valid, new Date().toISOString());
    let final: string | undefined;
    if (changed && pick.kind === "stack") {
      const { finalizeStack } = await import("../lib/music-clip/compare.ts");
      final = finalizeStack(dir, pick.id as (typeof STACKS)[number]);
    }
    if (changed) writeState(dir, next);
    if (JSON_OUT) emit({ ok: true, verb: "pick", pick, changed, stage: next.stage, picks: next.picks, ...(final ? { final } : {}) });
    else say(`${changed ? "picked" : "already picked"} ${pick.kind}:${pick.id}  stage ${next.stage}${final ? `\n${final}` : ""}`);
    return;
  }

  if (cmd === "pack") {
    const dir = dirArg(1);
    const { runPack } = await import("../lib/music-clip/pack.ts");
    const r = runPack(dir, AUDIO);
    if (JSON_OUT) emit({ ok: true, verb: "pack", ...r });
    else {
      say(`${r.dir}\npackSha1 ${r.pack.packSha1}  ${Object.keys(r.pack.files).length} files  stage ${r.stage}`);
      for (const w of r.warnings) say(`warning: ${w}`);
    }
    return;
  }

  if (cmd === "compare") {
    const dir = dirArg(1);
    const { runCompare } = await import("../lib/music-clip/compare.ts");
    let title = path.basename(dir);
    try {
      const t = readTimeline(dir);
      title = (t.track.file.split(/[\\/]/).pop() ?? title).replace(/\.[^.]+$/, "");
    } catch {
      // No timeline: the folder's name is title enough for a comparison.
    }
    const r = runCompare(dir, title);
    if (JSON_OUT) emit({ ok: true, verb: "compare", ...r });
    else say(`${r.html}\n${r.stacks.map((s) => `${s.stack} ${s.present ? (s.error ? `invalid: ${s.error}` : "result") : "no result"}`).join("  ")}`);
    return;
  }

  usage(cmd ? `unknown verb ${cmd}` : "name a verb");
}

try {
  await main();
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (JSON_OUT) emit({ ok: false, error: msg, code: e instanceof ClipError ? e.code : "error" });
  else console.error(`music-clip: ${msg}`);
  process.exit(1);
}

