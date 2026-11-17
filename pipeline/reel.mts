// REEL - one stat reel walked from an idea to its cuts through stop-and-resume stages. The /reel skill wraps
// it; the session writes the idea, assembles the table and authors the page between the verbs, and this CLI
// validates, measures, plans, issues the data, photographs and renders.
//
//   npx tsx pipeline/reel.mts new <dir> --idea <file.json>
//   npx tsx pipeline/reel.mts data <dir> --table <file.json> [--thin "<the operator's reason>"]
//   npx tsx pipeline/reel.mts track <dir> short|long --file <audio>
//   npx tsx pipeline/reel.mts plan <dir>
//   npx tsx pipeline/reel.mts brief <dir> short|long
//   npx tsx pipeline/reel.mts proof <dir> short|long [--cpu]
//   npx tsx pipeline/reel.mts shot <dir> short|long [--at <frame>] [--seconds <n>] [--cpu]
//   npx tsx pipeline/reel.mts cut <dir> short|long [--cpu]
//   npx tsx pipeline/reel.mts status <dir>
//
//   new     record the idea: {title, hook, path}. The hook is a question; the path says why someone keeps watching.
//   data    the table door (lib/reel/table.ts) and the continuity gate, MEASURED on the rows (lib/reel/
//           continuity.ts). Under a floor it refuses and says which; --thin records the operator's reason for
//           going on anyway. A different table forgets the plan and every cut.
//   track   attach a music bed to a cut BEFORE it is planned. The whole track plays, so the cut is planned to
//           the track's length; a track outside the cut's range (30-60 s, 120-240 s) is refused.
//   plan    the timing plan of both cuts (lib/reel/timing.ts), each warped so change per second stays even.
//   brief   issue one cut's inputs: the contracts, brief.json, data.json (the table and its plan, the ONLY
//           numbers the page may hold) and data.sample.json (the same shape, a few rows, for the author).
//   proof   fill the page's empty blocks (pipeline/reel/page.mts), lint it, photograph twelve cold frames to
//           <cut>/proof/, and re-draw two of them warm: a frame that depends on its predecessors is refused
//           here, in a minute, not after a full render. No encode.
//   shot    a few seconds from the middle of the video, encoded, with one still: a look before a full render.
//           No gate, no stage.
//   cut     the full render with its four gates ENFORCED: a failed gate leaves the files to look at and exits
//           1. With a track attached, the bed is laid under the picture as render/final.mp4.
//
//   THREE STOPS ARE THE OPERATOR'S, and each leaves one thing to judge on the Board (pkt:reel:<slug>:data,
//   :<cut>:proof, :<cut>:cut): `data` draws data-card.png, `proof` tiles its frames as proof/sheet.png, `cut`
//   writes <cut>/publish.json once (title, description, tags: the operator's to edit). The verdicts come back as
//   verdicts.json, which this CLI only reads: `status` prints them and `cut` refuses a proof that was rejected.
//
//   Frames are drawn on the GPU (pipeline/reel/gpu.mts) and on the CPU when there is none or with --cpu; the
//   renderer that drew them is printed. --json on any verb: one JSON document on stdout. Exit 0 ok, 1 refused
//   or failed (one line), 2 usage.
//
// SPEND: none. No vendor, no model call, no store: this CLI reads and writes one folder. The only generated
// thing in a reel's picture is the page's code, written by the session that runs the skill.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { measureContinuity } from "../lib/reel/continuity";
import { advanceCut, CUT_NAMES, cutOf, newReel, nextVerb, parseIdea, parseState, trackFrames, withBrief, withPlan, withTable, withTrack } from "../lib/reel/state";
import { canonical, parseTable } from "../lib/reel/table";
import { computeTimingPlan } from "../lib/reel/timing";
import { CUTS, REEL_FPS, ReelError, type ReelCut, type ReelState, type ReelTable } from "../lib/reel/types";
import { drawDataCard } from "./reel/card.mts";
import { launchReelBrowser } from "./reel/gpu.mts";
import { lintPage, prepare, sampleOf, type Block } from "./reel/page.mts";
import { renderSpan } from "./reel/span.mts";
import { dropSheet, ensurePublish, proofSheet, recordedVerdicts, refuseRejectedProof } from "./reel/stops.mts";
import { ffmpegTo } from "./strips/deadline.mts";
import { imageLab, renderFrame, renderStrip, renderWalk } from "./strips/render.mts";

const HERE = import.meta.dirname;
const PROOF_FRAMES = 12;
/** The proof frames re-drawn warm, and how many frames lead up to each. */
const SEEK_AT = [3, 8];
const SEEK_WALK = 40;
/** The share of pixels that may differ between a frame drawn cold and warm: the seek gate's bar (render.mts). */
const SEEK_BAR = 0.0005;
const THIN_MIN = 20;
const SHOT_SECONDS = 6;
const SHOT_MAX_SECONDS = 12;

const run = promisify(execFile);
const sha = (s: string | Buffer): string => createHash("sha256").update(s).digest("hex");
const now = (): string => new Date().toISOString();
const readJson = async (file: string): Promise<unknown> => {
  if (!existsSync(file)) throw new ReelError(`${file} does not exist`);
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    throw new ReelError(`${file} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
};
const writeJson = (file: string, value: unknown): Promise<void> => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

async function loadState(dir: string): Promise<ReelState> {
  const file = path.join(dir, "reel.json");
  if (!existsSync(file)) throw new ReelError(`${dir} holds no reel.json: start with \`new ${dir} --idea <file.json>\``);
  const state = parseState(await readJson(file));
  if (typeof state === "string") throw new ReelError(`${file}: ${state}`);
  return state;
}
const saveState = (dir: string, state: ReelState): Promise<void> => writeJson(path.join(dir, "reel.json"), state);

async function loadTable(dir: string, state: ReelState): Promise<ReelTable> {
  const table = parseTable(await readJson(path.join(dir, "table.json")));
  if (typeof table === "string") throw new ReelError(`table.json: ${table}`);
  if (sha(canonical(table)) !== state.tableSha) throw new ReelError("table.json was edited after `data` read it: run `data` again so the gate measures what the reel will show");
  return table;
}

const cutArg = (x: string | undefined): ReelCut => {
  if (x === "short" || x === "long") return x;
  throw new ReelError(`name the cut: ${CUT_NAMES.join(" or ")}`, "usage");
};

/** The block a cut's page must hold: the table and that cut's plan (as long as its track, when it has one). */
const blockOf = (table: ReelTable, state: ReelState, cut: ReelCut): Block => ({ table, plan: computeTimingPlan(table, cut, undefined, trackFrames(state, cut)) });

/* ── The verbs ────────────────────────────────────────────────────────────── */

async function verbNew(dir: string, flags: Flags): Promise<unknown> {
  if (flags.idea === undefined) throw new ReelError("new needs --idea <file.json> holding {title, hook, path}", "usage");
  const idea = parseIdea(await readJson(flags.idea));
  if (typeof idea === "string") throw new ReelError(`idea: ${idea}`);
  await mkdir(dir, { recursive: true });
  const had = existsSync(path.join(dir, "reel.json")) ? await loadState(dir) : undefined;
  const state: ReelState = had === undefined ? newReel(path.basename(path.resolve(dir)), idea, now()) : { ...had, idea, updatedAt: now() };
  await saveState(dir, state);
  return { stage: state.stage, slug: state.slug, next: nextVerb(state, dir) };
}

async function verbData(dir: string, flags: Flags): Promise<unknown> {
  const state = await loadState(dir);
  if (flags.table === undefined) throw new ReelError("data needs --table <file.json>", "usage");
  const table = parseTable(await readJson(flags.table));
  if (typeof table === "string") throw new ReelError(`table: ${table}`);
  const continuity = measureContinuity(table);
  const thin = flags.thin?.trim();
  if (!continuity.ok && (thin === undefined || thin.length < THIN_MIN)) {
    await writeJson(path.join(dir, "continuity.json"), continuity);
    throw new ReelError(`the table is under the continuity gate: ${continuity.failures.join("; ")}. Reframe it (finer steps, more entities, the chasers), or pass --thin "<the operator's reason>"`);
  }
  await writeJson(path.join(dir, "table.json"), table);
  await writeJson(path.join(dir, "continuity.json"), continuity.ok ? continuity : { ...continuity, accepted: thin });
  const moved = withTable(state, sha(canonical(table)), now());
  await saveState(dir, moved.state);
  // The first stop's picture. A card that could not be drawn never refuses a table that passed its door.
  const card = await drawDataCard(dir, state.idea, table, continuity, continuity.ok ? undefined : thin).catch((e: unknown) => `not drawn: ${e instanceof Error ? e.message : String(e)}`);
  return { stage: moved.state.stage, reset: moved.reset, continuity, source: table.source, card, next: nextVerb(moved.state, dir) };
}

async function verbTrack(dir: string, cut: ReelCut, flags: Flags): Promise<unknown> {
  const state = await loadState(dir);
  if (flags.file === undefined || !existsSync(flags.file)) throw new ReelError("track needs --file <audio> that exists", "usage");
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", flags.file]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new ReelError(`ffprobe read no duration from ${flags.file}`);
  const name = `track${path.extname(flags.file).toLowerCase()}`;
  const moved = withTrack(state, cut, { file: name, seconds, sha: sha(await readFile(flags.file)) }, now());
  await mkdir(path.join(dir, cut), { recursive: true });
  await copyFile(flags.file, path.join(dir, cut, name));
  await saveState(dir, moved);
  return { cut, track: name, seconds, frames: trackFrames(moved, cut), replanned: moved !== state, next: nextVerb(moved, dir) };
}

async function verbPlan(dir: string): Promise<unknown> {
  const state = await loadState(dir);
  if (state.tableSha === undefined) throw new ReelError("no table yet: run `data` first");
  const table = await loadTable(dir, state);
  const out: Record<string, unknown> = {};
  for (const cut of CUT_NAMES) {
    const { plan } = blockOf(table, state, cut);
    await writeJson(path.join(dir, `plan-${cut}.json`), plan);
    out[cut] = { frames: plan.sections.total, seconds: Math.round(plan.sections.total / REEL_FPS), to: state.tracks?.[cut] === undefined ? "the table" : "its track", evenness: plan.evenness, events: plan.events.length };
  }
  const moved = withPlan(state, now());
  await saveState(dir, moved);
  return { stage: moved.stage, cuts: out, next: nextVerb(moved, dir) };
}

async function verbBrief(dir: string, cut: ReelCut): Promise<unknown> {
  const state = await loadState(dir);
  if (state.stage !== "planned") throw new ReelError("no plan yet: run `plan` first");
  const table = await loadTable(dir, state);
  const block = blockOf(table, state, cut);
  const spec = CUTS[cut];
  const frames = block.plan.sections.total;
  const inputs = path.join(dir, cut, "inputs");
  await mkdir(inputs, { recursive: true });
  await mkdir(path.join(dir, cut, "out"), { recursive: true });
  await copyFile(path.join(HERE, "strips", "CONTRACT.md"), path.join(inputs, "CONTRACT.md"));
  await copyFile(path.join(HERE, "strips", "REEL.md"), path.join(inputs, "REEL.md"));
  await copyFile(path.join(HERE, "reel", "CUT.md"), path.join(inputs, "CUT.md"));
  await writeFile(path.join(inputs, "data.json"), `${JSON.stringify(block)}\n`);
  await writeJson(path.join(inputs, "data.sample.json"), sampleOf(block));
  await writeJson(path.join(inputs, "brief.json"), {
    case: state.slug,
    cut,
    lane: spec.lane,
    width: spec.width,
    height: spec.height,
    frames,
    seconds: Math.round(frames / REEL_FPS),
    title: state.idea.title,
    hook: state.idea.hook,
    path: state.idea.path,
    unit: table.unit,
    source: { name: `Source: ${table.source.name}`, url: table.source.url, licence: table.source.licence },
    data: "inputs/data.json is issued into the page's empty strip-data block by `proof`; read inputs/data.sample.json for its shape",
  });
  const moved = withBrief(state, cut, frames, sha(canonical(block)), now());
  await saveState(dir, moved);
  return { cut, frames, seconds: Math.round(frames / REEL_FPS), size: `${spec.width}x${spec.height}`, inputs, page: path.join(dir, cut, "out", "strip.html"), next: nextVerb(moved, dir) };
}

/** The page, its blocks filled and linted against what this cut was issued. Refuses with every finding in one line. */
async function lintedPage(dir: string, state: ReelState, cut: ReelCut): Promise<{ page: string; frames: number }> {
  const rec = cutOf(state, cut);
  const page = path.join(dir, cut, "out", "strip.html");
  if (!existsSync(page)) throw new ReelError(`${page} is not written yet: read ${path.join(dir, cut, "inputs")} and author it`);
  const block = blockOf(await loadTable(dir, state), state, cut);
  if (sha(canonical(block)) !== rec.dataSha) throw new ReelError(`the ${cut} cut was briefed on an older table, plan or track: run \`brief ${dir} ${cut}\` again`);
  const authored = await readFile(page, "utf8");
  const html = await prepare(authored, block);
  if (html !== authored) await writeFile(page, html);
  const findings = await lintPage(html, block, rec.frames);
  if (findings.length > 0) throw new ReelError(`lint: ${findings.join(" | ")}`);
  return { page, frames: rec.frames };
}

async function verbProof(dir: string, cut: ReelCut, flags: Flags): Promise<unknown> {
  const state = await loadState(dir);
  const { page, frames } = await lintedPage(dir, state, cut);
  const out = path.join(dir, cut, "proof");
  await mkdir(out, { recursive: true });
  await dropSheet(dir, cut);
  const at = Array.from({ length: PROOF_FRAMES }, (_, k) => Math.min(frames - 1, Math.round((k * (frames - 1)) / (PROOF_FRAMES - 1))));
  const { browser, renderer } = await launchReelBrowser(flags.cpu ? "cpu" : "gpu");
  const lane = CUTS[cut].lane;
  const files: string[] = [];
  const drifted: number[] = [];
  try {
    const cold = new Map<number, Buffer>();
    for (const i of at) {
      const file = path.join(out, `f-${String(i).padStart(5, "0")}.png`);
      const png = await renderFrame({ browser, htmlPath: page, lane, i });
      cold.set(i, png);
      await writeFile(file, png);
      files.push(file);
    }
    // The seek gate in miniature: the same frame, reached through the frames before it, is the same picture -
    // by the full render's own measure (pixels more than two levels apart, bar 0.05%), not byte equality:
    // antialiased WebGL on this GPU is not byte-stable (measured 2026-11-17: 1-3% of identical cold draws
    // differ by a few pixels at one level), and a check stricter than the gate refuses pages the gate passes.
    const lab = await imageLab(browser);
    for (const k of SEEK_AT) {
      const i = at[k] as number;
      const warm = await renderWalk({ browser, htmlPath: page, lane, from: i - SEEK_WALK, to: i });
      if ((await lab.diffFraction(warm, cold.get(i) as Buffer)) > SEEK_BAR) {
        drifted.push(i);
        await writeFile(path.join(out, `warm-${String(i).padStart(5, "0")}.png`), warm);
      }
    }
    await lab.close();
  } finally {
    await browser.close().catch(() => {});
  }
  if (drifted.length > 0) {
    throw new ReelError(`seek (${renderer}): frame ${drifted.join(", ")} drawn after the ${SEEK_WALK} frames before it is not the frame drawn cold (compare f-*.png with warm-*.png in ${out}). The page carries something from one frame to the next: state kept between calls, a property set only on some frames, or a composited layer (will-change, a fractional transform on text)`);
  }
  const sheet = await proofSheet(dir, cut, files, lane).catch((e: unknown) => `not tiled: ${e instanceof Error ? e.message : String(e)}`);
  const moved = advanceCut(state, cut, "proofed", now());
  await saveState(dir, moved);
  return { cut, lint: "clean", renderer, seek: `frames ${SEEK_AT.map((k) => at[k]).join(", ")} match cold and warm`, frames: files, sheet, next: nextVerb(moved, dir) };
}

async function verbShot(dir: string, cut: ReelCut, flags: Flags): Promise<unknown> {
  const state = await loadState(dir);
  const { page, frames } = await lintedPage(dir, state, cut);
  const seconds = flags.seconds === undefined ? SHOT_SECONDS : Number(flags.seconds);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > SHOT_MAX_SECONDS) throw new ReelError(`--seconds is 1 to ${SHOT_MAX_SECONDS}`, "usage");
  const count = Math.min(frames, Math.round(seconds * REEL_FPS));
  const wanted = flags.at === undefined ? (frames >> 1) - (count >> 1) : Number(flags.at);
  if (!Number.isInteger(wanted)) throw new ReelError("--at is a whole frame number", "usage");
  const from = Math.max(0, Math.min(frames - count, wanted));
  const { browser, renderer } = await launchReelBrowser(flags.cpu ? "cpu" : "gpu");
  try {
    const span = await renderSpan({ browser, htmlPath: page, lane: CUTS[cut].lane, from, count, outDir: path.join(dir, cut, "shot") });
    return { cut, renderer, ...span, of: frames };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function verbCut(dir: string, cut: ReelCut, flags: Flags): Promise<unknown> {
  const state = await loadState(dir);
  if (cutOf(state, cut).stage === "briefed") throw new ReelError(`the ${cut} cut has no proof: run \`proof ${dir} ${cut}\` and look at the frames first`);
  await refuseRejectedProof(dir, cut);
  const { page, frames } = await lintedPage(dir, state, cut);
  const outDir = path.join(dir, cut, "render");
  const { browser, renderer } = await launchReelBrowser(flags.cpu ? "cpu" : "gpu");
  let result: Awaited<ReturnType<typeof renderStrip>>;
  try {
    result = await renderStrip({ browser, htmlPath: page, outDir, lane: CUTS[cut].lane, frames });
  } finally {
    await browser.close().catch(() => {});
  }
  if (!result.ok || result.gates === undefined) throw new ReelError(`render failed (${renderer}): ${result.error ?? "no gates recorded"}`);
  await writeJson(path.join(outDir, "gates.json"), { ...result.gates, renderer, renderMs: result.renderMs });
  const failed = Object.entries(result.gates).filter(([, g]) => !g.ok).map(([name, g]) => `${name}: ${g.detail}`);
  if (failed.length > 0) throw new ReelError(`the render is in ${outDir} but a gate failed, so the cut is not made (${renderer}) - ${failed.join(" | ")}`);
  const video = path.join(outDir, "strip.mp4");
  const track = state.tracks?.[cut];
  let final: string | undefined;
  if (track !== undefined) {
    // The whole bed under the picture, levelled to the streaming target, with a short tail fade.
    final = path.join(outDir, "final.mp4");
    const fade = Math.max(0, track.seconds - 1.2).toFixed(2);
    await ffmpegTo(["-i", video, "-i", path.join(dir, cut, track.file), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", `loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=out:st=${fade}:d=1.2`, "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart"], final, 120_000 + frames * 100);
  }
  const moved = advanceCut(state, cut, "cut", now());
  await saveState(dir, moved);
  const publish = await ensurePublish(dir, cut, state.idea, await loadTable(dir, state));
  return { cut, renderer, video, ...(final === undefined ? { sound: "none: silent cut" } : { final }), sheet: path.join(outDir, "sheet.png"), publish, seconds: Math.round(frames / REEL_FPS), renderMs: result.renderMs, gates: result.gates, next: nextVerb(moved, dir) };
}

async function verbStatus(dir: string): Promise<unknown> {
  const state = await loadState(dir);
  return { slug: state.slug, stage: state.stage, idea: state.idea, tracks: state.tracks ?? {}, cuts: state.cuts, verdicts: await recordedVerdicts(dir), next: nextVerb(state, dir) };
}

/* ── The command line ─────────────────────────────────────────────────────── */

const VALUE_FLAGS = ["idea", "table", "thin", "file", "at", "seconds"] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];
type Flags = Partial<Record<ValueFlag, string>> & { json: boolean; cpu: boolean };

function parseArgs(argv: readonly string[]): { verb: string; rest: string[]; flags: Flags } {
  const flags: Flags = { json: false, cpu: false };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    const name = a.slice(2) as ValueFlag;
    if (a === "--json") flags.json = true;
    else if (a === "--cpu") flags.cpu = true;
    else if (a.startsWith("--") && VALUE_FLAGS.includes(name)) {
      const v = argv[++i];
      if (v === undefined) throw new ReelError(`${a} needs a value`, "usage");
      flags[name] = v;
    } else if (a.startsWith("--")) throw new ReelError(`unknown flag ${a}`, "usage");
    else rest.push(a);
  }
  return { verb: rest[0] ?? "", rest: rest.slice(1), flags };
}

const VERBS = "new, data, track, plan, brief, proof, shot, cut, status";

async function main(): Promise<number> {
  let json = false;
  try {
    const { verb, rest, flags } = parseArgs(process.argv.slice(2));
    json = flags.json;
    const dir = rest[0];
    if (dir === undefined) throw new ReelError(`usage: reel.mts <verb> <dir> ... (${VERBS})`, "usage");
    let out: unknown;
    if (verb === "new") out = await verbNew(dir, flags);
    else if (verb === "data") out = await verbData(dir, flags);
    else if (verb === "track") out = await verbTrack(dir, cutArg(rest[1]), flags);
    else if (verb === "plan") out = await verbPlan(dir);
    else if (verb === "brief") out = await verbBrief(dir, cutArg(rest[1]));
    else if (verb === "proof") out = await verbProof(dir, cutArg(rest[1]), flags);
    else if (verb === "shot") out = await verbShot(dir, cutArg(rest[1]), flags);
    else if (verb === "cut") out = await verbCut(dir, cutArg(rest[1]), flags);
    else if (verb === "status") out = await verbStatus(dir);
    else throw new ReelError(`unknown verb "${verb}": ${VERBS}`, "usage");
    process.stdout.write(`${JSON.stringify(out, null, json ? 0 : 2)}\n`);
    return 0;
  } catch (e) {
    const usage = e instanceof ReelError && e.code === "usage";
    const message = e instanceof Error ? e.message : String(e);
    if (json) process.stdout.write(`${JSON.stringify({ error: message })}\n`);
    process.stderr.write(`reel: ${message}\n`);
    return usage ? 2 : 1;
  }
}

process.exitCode = await main();
