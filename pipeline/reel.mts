// REEL - one stat reel walked from an idea to its cuts through stop-and-resume stages. The /reel skill wraps
// it; the session writes the idea, assembles the table and authors the page between the verbs, and this CLI
// validates, measures, plans, issues the data, photographs and renders.
//
//   npx tsx pipeline/reel.mts new <dir> --idea <file.json>
//   npx tsx pipeline/reel.mts data <dir> --table <file.json> [--thin "<the operator's reason>"]
//   npx tsx pipeline/reel.mts plan <dir>
//   npx tsx pipeline/reel.mts brief <dir> short|long
//   npx tsx pipeline/reel.mts proof <dir> short|long
//   npx tsx pipeline/reel.mts cut <dir> short|long
//   npx tsx pipeline/reel.mts status <dir>
//
//   new     record the idea: {title, hook, path}. The hook is a question; the path says why someone keeps watching.
//   data    the table door (lib/reel/table.ts) and the continuity gate, MEASURED on the rows (lib/reel/
//           continuity.ts): steps, entities on screen, lead changes, overtakes, dated events. Under a floor it
//           refuses and says which; --thin records the operator's reason for going on anyway. A different table
//           forgets the plan and every cut.
//   plan    the timing plan of both cuts (lib/reel/timing.ts): a 30-60 s vertical Short and a 2-4 min landscape
//           cut, each warped so change per second stays even.
//   brief   issue one cut's inputs: the strip contract, the reel addendum, CUT.md, brief.json, data.json (the
//           table and its plan, the ONLY numbers the page may hold) and data.sample.json (the same shape, cut
//           down to a few rows, for the author to read).
//   proof   put the issued block into the page's empty strip-data block (the author never types a number),
//           lint it (frame purity; the block is the issued block, unchanged), then photograph twelve cold
//           frames to <cut>/proof/ for the eye, and re-draw two of them warm (after the forty frames before
//           each): a frame that depends on its predecessors is refused here, in a minute, not after a full
//           render. No encode.
//   cut     the full render with its four gates ENFORCED: a failed seek, legibility or motion gate leaves the
//           files to look at and exits 1; the cut is not marked made.
//
//   --json on any verb: one JSON document on stdout. Exit 0 ok, 1 refused or failed (one line), 2 usage.
//
// SPEND: none. No vendor, no model call, no store: this CLI reads and writes one folder. The only generated
// thing in a reel is the page's code, written by the session that runs the skill.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { formatLint, lintStrip, stripDataEquals, stripDataRule } from "../lib/foundry/strips/lint";
import { measureContinuity } from "../lib/reel/continuity";
import { advanceCut, CUT_NAMES, cutOf, newReel, nextVerb, parseIdea, parseState, withBrief, withPlan, withTable } from "../lib/reel/state";
import { canonical, parseTable } from "../lib/reel/table";
import { computeTimingPlan } from "../lib/reel/timing";
import { CUTS, REEL_FPS, ReelError, type ReelCut, type ReelState, type ReelTable } from "../lib/reel/types";
import { launchHeadless, renderFrame, renderStrip, renderWalk } from "./strips/render.mts";

const HERE = import.meta.dirname;
const DATA_ID = "strip-data";
const PROOF_FRAMES = 12;
/** The proof frames re-drawn warm, and how many frames lead up to each. */
const SEEK_AT = [3, 8];
const SEEK_WALK = 40;
const THIN_MIN = 20;

const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
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

/** The block a cut's page must hold: the table and that cut's plan, issued whole. */
const blockOf = (table: ReelTable, cut: ReelCut): { table: ReelTable; plan: ReturnType<typeof computeTimingPlan> } => ({ table, plan: computeTimingPlan(table, cut) });

/** The block cut down to a few rows: the shape an author reads, small enough to read. Never rendered. */
function sampleOf(block: ReturnType<typeof blockOf>): unknown {
  const P = 4;
  const { table, plan } = block;
  return {
    note: `SHAPE ONLY: ${table.periods.length} periods, ${table.entities.length} entities, ${table.events.length} events, ${plan.knots.length} knots in the real block. The CLI injects the real one.`,
    table: { ...table, periods: table.periods.slice(0, P), entities: table.entities.slice(0, 3).map((e) => ({ ...e, values: e.values.slice(0, P) })), events: table.events.slice(0, 2) },
    plan: { ...plan, knots: plan.knots.slice(0, P), orders: plan.orders.slice(0, P), events: plan.events.slice(0, 2) },
  };
}

const BLOCK_RE = /(<script\b[^>]*\bid\s*=\s*["']strip-data["'][^>]*>)([\s\S]*?)(<\/script>)/gi;

/**
 * THE AUTHOR NEVER TYPES A NUMBER. The page carries one empty strip-data block and the CLI writes the issued
 * block into it, so a reel's numbers cannot be rounded, dropped or invented on the way to the screen. A page
 * with no block, or more than one, is left alone for the lint to name.
 */
function inject(html: string, block: unknown): string {
  const found = [...html.matchAll(BLOCK_RE)];
  if (found.length !== 1) return html;
  // "<" is escaped so no value can close the script element early.
  const body = JSON.stringify(block).replace(/</g, "\\u003c");
  return html.replace(BLOCK_RE, (_m, open: string, _old: string, close: string) => `${open}${body}${close}`);
}

/* ── The verbs ────────────────────────────────────────────────────────────── */

async function verbNew(dir: string, flags: Flags): Promise<unknown> {
  const file = flags.idea;
  if (file === undefined) throw new ReelError("new needs --idea <file.json> holding {title, hook, path}", "usage");
  const idea = parseIdea(await readJson(file));
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
  return { stage: moved.state.stage, reset: moved.reset, continuity, source: table.source, next: nextVerb(moved.state, dir) };
}

async function verbPlan(dir: string): Promise<unknown> {
  const state = await loadState(dir);
  if (state.tableSha === undefined) throw new ReelError("no table yet: run `data` first");
  const table = await loadTable(dir, state);
  const out: Record<string, unknown> = {};
  for (const cut of CUT_NAMES) {
    const plan = computeTimingPlan(table, cut);
    await writeJson(path.join(dir, `plan-${cut}.json`), plan);
    out[cut] = { frames: plan.sections.total, seconds: Math.round(plan.sections.total / REEL_FPS), evenness: plan.evenness, events: plan.events.length };
  }
  const moved = withPlan(state, now());
  await saveState(dir, moved);
  return { stage: moved.stage, cuts: out, next: nextVerb(moved, dir) };
}

async function verbBrief(dir: string, cut: ReelCut): Promise<unknown> {
  const state = await loadState(dir);
  if (state.stage !== "planned") throw new ReelError("no plan yet: run `plan` first");
  const table = await loadTable(dir, state);
  const block = blockOf(table, cut);
  const spec = CUTS[cut];
  const frames = block.plan.sections.total;
  const inputs = path.join(dir, cut, "inputs");
  await mkdir(inputs, { recursive: true });
  await mkdir(path.join(dir, cut, "out"), { recursive: true });
  await copyFile(path.join(HERE, "strips", "CONTRACT.md"), path.join(inputs, "CONTRACT.md"));
  await copyFile(path.join(HERE, "strips", "REEL.md"), path.join(inputs, "REEL.md"));
  await copyFile(path.join(HERE, "reel", "CUT.md"), path.join(inputs, "CUT.md"));
  await writeFile(path.join(inputs, "data.json"), `${JSON.stringify(block)}
`);
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

/** The page, linted against the block this cut was issued. Refuses with every finding in one line. */
async function lintedPage(dir: string, state: ReelState, cut: ReelCut): Promise<{ page: string; frames: number }> {
  const rec = cutOf(state, cut);
  const page = path.join(dir, cut, "out", "strip.html");
  if (!existsSync(page)) throw new ReelError(`${page} is not written yet: read ${path.join(dir, cut, "inputs")} and author it`);
  const block = blockOf(await loadTable(dir, state), cut);
  if (sha(canonical(block)) !== rec.dataSha) throw new ReelError(`the ${cut} cut was briefed on an older table or plan: run \`brief ${dir} ${cut}\` again`);
  const authored = await readFile(page, "utf8");
  const html = inject(authored, block);
  if (html !== authored) await writeFile(page, html);
  const findings = formatLint([...lintStrip(html, { frames: rec.frames }), ...stripDataRule(html, DATA_ID), ...stripDataEquals(html, block, DATA_ID)]);
  if (findings.length > 0) throw new ReelError(`lint: ${findings.join(" | ")}`);
  return { page, frames: rec.frames };
}

async function verbProof(dir: string, cut: ReelCut): Promise<unknown> {
  const state = await loadState(dir);
  const { page, frames } = await lintedPage(dir, state, cut);
  const out = path.join(dir, cut, "proof");
  await mkdir(out, { recursive: true });
  const at = Array.from({ length: PROOF_FRAMES }, (_, k) => Math.min(frames - 1, Math.round((k * (frames - 1)) / (PROOF_FRAMES - 1))));
  const browser = await launchHeadless();
  const files: string[] = [];
  const drifted: number[] = [];
  try {
    const cold = new Map<number, Buffer>();
    for (const i of at) {
      const file = path.join(out, `f-${String(i).padStart(5, "0")}.png`);
      const png = await renderFrame({ browser, htmlPath: page, lane: CUTS[cut].lane, i });
      cold.set(i, png);
      await writeFile(file, png);
      files.push(file);
    }
    // The seek gate in miniature: the same frame, reached through the frames before it, is the same picture.
    for (const k of SEEK_AT) {
      const i = at[k] as number;
      const warm = await renderWalk({ browser, htmlPath: page, lane: CUTS[cut].lane, from: i - SEEK_WALK, to: i });
      if (!warm.equals(cold.get(i) as Buffer)) {
        drifted.push(i);
        await writeFile(path.join(out, `warm-${String(i).padStart(5, "0")}.png`), warm);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  if (drifted.length > 0) {
    throw new ReelError(`seek: frame ${drifted.join(", ")} drawn after the ${SEEK_WALK} frames before it is not the frame drawn cold (compare f-*.png with warm-*.png in ${out}). The page carries something from one frame to the next: state kept between calls, a property set only on some frames, or a composited layer (will-change, a fractional transform on text)`);
  }
  const moved = advanceCut(state, cut, "proofed", now());
  await saveState(dir, moved);
  return { cut, lint: "clean", seek: `frames ${SEEK_AT.map((k) => at[k]).join(", ")} match cold and warm`, frames: files, next: nextVerb(moved, dir) };
}

async function verbCut(dir: string, cut: ReelCut): Promise<unknown> {
  const state = await loadState(dir);
  if (cutOf(state, cut).stage === "briefed") throw new ReelError(`the ${cut} cut has no proof: run \`proof ${dir} ${cut}\` and look at the frames first`);
  const { page, frames } = await lintedPage(dir, state, cut);
  const outDir = path.join(dir, cut, "render");
  const browser = await launchHeadless();
  let result: Awaited<ReturnType<typeof renderStrip>>;
  try {
    result = await renderStrip({ browser, htmlPath: page, outDir, lane: CUTS[cut].lane, frames });
  } finally {
    await browser.close().catch(() => {});
  }
  if (!result.ok || result.gates === undefined) throw new ReelError(`render failed: ${result.error ?? "no gates recorded"}`);
  await writeJson(path.join(outDir, "gates.json"), { ...result.gates, renderMs: result.renderMs });
  const failed = Object.entries(result.gates).filter(([, g]) => !g.ok).map(([name, g]) => `${name}: ${g.detail}`);
  if (failed.length > 0) throw new ReelError(`the render is in ${outDir} but a gate failed, so the cut is not made - ${failed.join(" | ")}`);
  const moved = advanceCut(state, cut, "cut", now());
  await saveState(dir, moved);
  return { cut, video: path.join(outDir, "strip.mp4"), sheet: path.join(outDir, "sheet.png"), seconds: Math.round(frames / REEL_FPS), renderMs: result.renderMs, gates: result.gates, next: nextVerb(moved, dir) };
}

async function verbStatus(dir: string): Promise<unknown> {
  const state = await loadState(dir);
  return { slug: state.slug, stage: state.stage, idea: state.idea, cuts: state.cuts, next: nextVerb(state, dir) };
}

/* ── The command line ─────────────────────────────────────────────────────── */

interface Flags {
  idea?: string;
  table?: string;
  thin?: string;
  json: boolean;
}

function parseArgs(argv: readonly string[]): { verb: string; rest: string[]; flags: Flags } {
  const flags: Flags = { json: false };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--json") flags.json = true;
    else if (a === "--idea" || a === "--table" || a === "--thin") {
      const v = argv[++i];
      if (v === undefined) throw new ReelError(`${a} needs a value`, "usage");
      flags[a.slice(2) as "idea" | "table" | "thin"] = v;
    } else if (a.startsWith("--")) throw new ReelError(`unknown flag ${a}`, "usage");
    else rest.push(a);
  }
  return { verb: rest[0] ?? "", rest: rest.slice(1), flags };
}

async function main(): Promise<number> {
  let json = false;
  try {
    const { verb, rest, flags } = parseArgs(process.argv.slice(2));
    json = flags.json;
    const dir = rest[0];
    if (dir === undefined) throw new ReelError("usage: reel.mts new|data|plan|brief|proof|cut|status <dir> ...", "usage");
    let out: unknown;
    if (verb === "new") out = await verbNew(dir, flags);
    else if (verb === "data") out = await verbData(dir, flags);
    else if (verb === "plan") out = await verbPlan(dir);
    else if (verb === "brief") out = await verbBrief(dir, cutArg(rest[1]));
    else if (verb === "proof") out = await verbProof(dir, cutArg(rest[1]));
    else if (verb === "cut") out = await verbCut(dir, cutArg(rest[1]));
    else if (verb === "status") out = await verbStatus(dir);
    else throw new ReelError(`unknown verb "${verb}": new, data, plan, brief, proof, cut, status`, "usage");
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
