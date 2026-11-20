// THE REEL'S TWO SEAT TURNS (spark reel-studio WP2): `data` researches a table, `author` writes the film's pages.
//
// Each turn runs in an isolated workspace (`<reel>/_ws/<kind>/`: inputs/ and out/ only, lib/agent/cliSeam.ts) and
// is metered as the strips turns are: the seat's own report booked against the job under a `claude-seat/<model>`
// model axis, never capped; a DRY job is answered by a stand-in that writes what a turn would and never enters the
// seat. inputs/JOB.md names the job that prepared the workspace, so a drive that died after a paid turn finds this
// job's out/ and collects it instead of buying the turn again (the strips rule: landing is the marker).
//
// The author's check runs BEFORE the pages land in `film/`: a film that fails its check after the one fix turn never
// replaces the pages under review. Landed pages move the last pair to `film/history/<at>/` first.

import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EventData } from "@gt/domain/event";
import type { CallIntent } from "@gt/kernel/dryrun";
import type { StepContext, StepOutcome } from "@gt/kernel/job-core";
import type { SettleEntry } from "@gt/kernel/spend/ledger";
import { JOB_USD } from "@gt/kernel/spend/meter";
import { madePaid } from "@gt/producers/research/partAct";
import { declaredFrames, fixMarkdown, ideaMarkdown, lintFilm, notesMarkdown, type FilmFile, type Pin } from "@gt/producers/reel/brief";
import type { ReelJobRequest } from "@gt/producers/reel/define";

import type { AgentResult, AgentTool, AgentTurnClass, RunAgentInput } from "../../agent/cliSeam.ts";
import { MODEL } from "../../model.ts";
import { FLOORS, measureContinuity } from "../../reel/continuity.ts";
import { withTable } from "../../reel/state.ts";
import { readVerdicts } from "../../reel/store.ts";
import { parseTable } from "../../reel/table.ts";
import { FILM_DIR, ReelError, type FilmRecord, type ReelState } from "../../reel/types.ts";
import type { ReelEngines } from "./engines.ts";
import { filmDirOf, mutateState, readState, readTable, sharedDataDir, tableSha, workspaceOf } from "./folder.ts";
import { standInFilm, standInTable } from "./standIn.ts";

const SEAT_NOTE = "a seat turn is priced by the seat's own report after it ends";
/** The data turn researches the web; the author turn has no web, only its inputs. */
const DATA_TOOLS: readonly AgentTool[] = ["WebSearch", "WebFetch", "Read", "Write", "Edit"];
const AUTHOR_TOOLS: readonly AgentTool[] = ["Read", "Write", "Edit"];
const EFFORT = "high";
const TIMEOUT_MIN = 75;

const pipelineFile = (name: string): string => path.join(process.cwd(), "pipeline", name);
const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;
const now = (): string => new Date().toISOString();

/* ── one turn ─────────────────────────────────────────────────────────────── */

type Turn = { readonly ws: string; readonly agent: RunAgentInput; readonly label: string };

/** A fresh workspace for this job: inputs/ written by `fill`, an empty out/. */
async function prepare(ws: string, jobId: string, fill: (inputs: string) => Promise<void>): Promise<void> {
  await rm(ws, { recursive: true, force: true });
  await mkdir(path.join(ws, "inputs"), { recursive: true });
  await mkdir(path.join(ws, "out"), { recursive: true });
  await writeFile(path.join(ws, "inputs", "JOB.md"), `${jobId}\n`);
  await fill(path.join(ws, "inputs"));
}

/** This job prepared the workspace and its turn left `marker` in out/: the turn was paid, collect it. */
async function landedBy(ws: string, jobId: string, marker: string): Promise<boolean> {
  const job = path.join(ws, "inputs", "JOB.md");
  if (!existsSync(job) || !existsSync(path.join(ws, "out", marker))) return false;
  return (await readFile(job, "utf8")).trim() === jobId;
}

function seatEntry(r: AgentResult, req: ReelJobRequest, label: string): SettleEntry {
  const axes = { producer: req.kind, reel: req.slug, turn: label, model: `claude-seat/${MODEL}` };
  const outcome = r.outcome === "completed" ? "served" : "failed";
  return r.costUsd === undefined ? { amount: undefined, outcome, basis: "seat-report", axes, reason: "seat reported no cost" } : { amount: r.costUsd, outcome, basis: "seat-report", axes };
}

/** One metered turn: the seat live, the stand-in dry. */
async function seatTurn(e: ReelEngines, ctx: StepContext, req: ReelJobRequest, t: Turn, stand: () => Promise<void>): Promise<AgentResult> {
  const intent: CallIntent<Promise<AgentResult>> = {
    provider: "claude-seat",
    model: t.agent.model,
    usage: {},
    quote: { usd: null, basis: "unpriced", note: SEAT_NOTE },
    payload: { turn: `${req.kind}:${t.label}`, reel: req.slug, model: t.agent.model, effort: t.agent.effort, promptChars: t.agent.prompt.length },
    subject: { kind: "job", id: ctx.job.id },
    stand: async () => {
      await stand();
      return { outcome: "completed", final: "dry stand-in: no seat was called", turns: 0, durationMs: 0, exitCode: 0, errors: [] };
    },
  };
  const r = await ctx.meter.paid(JOB_USD, 0, intent, async () => {
    const out = await e.seat(t.agent);
    return { value: Promise.resolve(out), entries: [seatEntry(out, req, t.label)] };
  });
  if (!r.ok) throw r.error;
  return r.value;
}

/** A turn that did not complete, as the job's outcome: a spent window waits; anything else fails with its words. */
function notServed(r: AgentResult, what: string): StepOutcome | undefined {
  const why = r.errors.join(" | ");
  if (r.outcome === "completed") return undefined;
  if (r.outcome === "seat-limit") return { kind: "money-stop", message: `the text seat's usage window is spent: ${why || "seat limit"}` };
  return { kind: "fatal", code: "unavailable", message: `${what}: ${r.outcome}${why === "" ? "" : `: ${why}`}` };
}

const agentOf = (ws: string, prompt: string, tools: readonly AgentTool[], turn: AgentTurnClass): RunAgentInput => ({ cwd: ws, prompt, model: MODEL, effort: EFFORT, tools, timeoutMin: TIMEOUT_MIN, turn });

/* ── data ─────────────────────────────────────────────────────────────────── */

/** inputs/TABLE-CONTRACT.md: the ReelTable shape as lib/reel/types.ts states it (read, so it never drifts), and the gate. */
async function tableContract(): Promise<string> {
  const src = await readFile(path.join(process.cwd(), "lib", "reel", "types.ts"), "utf8");
  const from = src.indexOf("/** Where the numbers came from.");
  const end = src.indexOf("}", src.indexOf("export interface ReelTable"));
  const shape = from >= 0 && end > from ? src.slice(from, end + 1) : "(lib/reel/types.ts could not be read: see REEL-DATA-PROMPT.md)";
  return ["# The table contract", "", "Write `out/table.json` as this shape, `v: 1`. Source and licence are stated as the source states them, never guessed.", "", "```ts", shape, "```", "", "## The continuity gate it is measured against", "", "```json", JSON.stringify(FLOORS, null, 2), "```", ""].join("\n");
}

const DATA_PROMPT = "Read inputs/REEL-DATA-PROMPT.md first and follow it exactly, then inputs/IDEA.md and inputs/TABLE-CONTRACT.md (and inputs/previous-table.json when it exists). Write out/table.json and out/SOURCES.md.";

export async function dataAct(e: ReelEngines, req: ReelJobRequest, dir: string, ctx: StepContext): Promise<StepOutcome> {
  const state = await readState(dir);
  const ws = workspaceOf(dir, "data");
  const t: Turn = { ws, agent: agentOf(ws, DATA_PROMPT, DATA_TOOLS, "article-research"), label: "data" };
  if (!(await landedBy(ws, ctx.job.id, "table.json"))) {
    await prepare(ws, ctx.job.id, async (inputs) => {
      await copyFile(pipelineFile("REEL-DATA-PROMPT.md"), path.join(inputs, "REEL-DATA-PROMPT.md"));
      await writeFile(path.join(inputs, "IDEA.md"), ideaMarkdown(state.idea, req.note));
      await writeFile(path.join(inputs, "TABLE-CONTRACT.md"), await tableContract());
      if (existsSync(path.join(dir, "table.json"))) await copyFile(path.join(dir, "table.json"), path.join(inputs, "previous-table.json"));
    });
    const r = await seatTurn(e, ctx, req, t, () => writeFile(path.join(ws, "out", "table.json"), JSON.stringify(standInTable(state.idea.title), null, 2)));
    const stop = notServed(r, "the data turn");
    if (stop !== undefined) return stop;
  }
  const file = path.join(ws, "out", "table.json");
  if (!existsSync(file)) return { kind: "fatal", code: "invalid", message: "the data turn wrote no out/table.json" };
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch (x) {
    return { kind: "fatal", code: "invalid", message: `out/table.json is not JSON: ${x instanceof Error ? x.message : String(x)}` };
  }
  const table = parseTable(raw);
  if (typeof table === "string") return { kind: "fatal", code: "invalid", message: `table: ${table}` };
  const continuity = measureContinuity(table);
  // The table lands whatever the gate says: the data stop shows the operator the failures and the operator decides.
  await writeFile(path.join(dir, "table.json"), `${JSON.stringify(table, null, 2)}\n`);
  await writeFile(path.join(dir, "continuity.json"), `${JSON.stringify(continuity, null, 2)}\n`);
  if (existsSync(path.join(ws, "out", "SOURCES.md"))) await copyFile(path.join(ws, "out", "SOURCES.md"), path.join(dir, "SOURCES.md"));
  const moved = await mutateState(dir, (s) => withTable(s, tableSha(table), now()).state);
  return madePaid(data({ table: "table.json", sha: moved.tableSha, continuity: { ok: continuity.ok, failures: continuity.failures }, dry: ctx.job.mode.kind === "dry" }), ctx);
}

/* ── author ───────────────────────────────────────────────────────────────── */

const AUTHOR_PROMPT = "Read inputs/REEL-FILM-PROMPT.md first and follow it exactly: it is the page contract. Then inputs/IDEA.md, inputs/table.json, inputs/continuity.json, inputs/LOOK.md, inputs/SHARED-DATA.md, and inputs/NOTES.md and inputs/previous/ when they exist. Write the film into out/.";
const FIX_PROMPT = "You are revising a film you wrote. Read inputs/REEL-FILM-PROMPT.md again, then inputs/feedback.md. out/ holds the current version: fix each finding there in place and change nothing else.";

/** The film's files a turn may land: the two pages, their modules and styles, top level of out/ only. */
const LANDS = /\.(html|m?js|css)$/i;

async function filmFiles(dir: string): Promise<FilmFile[]> {
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isFile() && LANDS.test(d.name)).map((d) => d.name).sort();
  return Promise.all(names.map(async (name) => ({ name, text: await readFile(path.join(dir, name), "utf8") })));
}

async function checkOut(out: string): Promise<{ findings: string[]; frames?: number }> {
  const reelJson = path.join(out, "reel.json");
  let declared: number | string = "out/reel.json is missing: declare the film's length as {\"frames\": N}";
  if (existsSync(reelJson)) {
    try {
      declared = declaredFrames(JSON.parse(await readFile(reelJson, "utf8")));
    } catch {
      declared = "out/reel.json is not JSON";
    }
  }
  const findings = lintFilm(await filmFiles(out), declared);
  return typeof declared === "number" && findings.length === 0 ? { findings, frames: declared } : { findings };
}

/** The shared data's names, two levels deep, so the author knows which flags, maps and fonts exist. */
async function sharedListing(): Promise<string> {
  const root = sharedDataDir();
  const lines = ["# /data/ (shared)", "", "A film's own `data/` answers first (it holds table.json and continuity.json); these answer after it.", ""];
  if (!existsSync(root)) return `${lines.join("\n")}(the shared folder is empty on this machine)\n`;
  for (const d of await readdir(root, { withFileTypes: true })) {
    if (!d.isDirectory()) {
      lines.push(`- /data/${d.name}`);
      continue;
    }
    const inner = await readdir(path.join(root, d.name)).catch(() => [] as string[]);
    lines.push(`- /data/${d.name}/ (${inner.length} files${inner.length === 0 ? "" : `: ${inner.slice(0, 12).join(", ")}${inner.length > 12 ? ", ..." : ""}`})`);
  }
  return `${lines.join("\n")}\n`;
}

/** The pins a redo is authored against: the request's, else the film verdict's when it sent the film back. */
async function notesOf(req: ReelJobRequest, dir: string): Promise<{ pins: readonly Pin[]; note?: string } | undefined> {
  const held = (await readVerdicts(dir)).stops.film;
  const fromVerdict = held?.verdict === "reject" ? held : undefined;
  const pins: readonly Pin[] = req.notes ?? fromVerdict?.pins ?? [];
  const note = fromVerdict?.note;
  if (pins.length === 0 && note === undefined) return undefined;
  return { pins, ...(note === undefined ? {} : { note }) };
}

/** The checked out/ into film/: the last pair kept under history/, the issued table beside the pages, the state reset to a film of `frames`. */
async function landFilm(dir: string, out: string, frames: number): Promise<string[]> {
  const film = filmDirOf(dir);
  await mkdir(film, { recursive: true });
  const old = await filmFiles(film);
  if (old.length > 0) {
    const keep = path.join(film, "history", now().replace(/[:.]/g, "-"));
    await mkdir(keep, { recursive: true });
    for (const f of old) await rename(path.join(film, f.name), path.join(keep, f.name));
  }
  const landed = (await filmFiles(out)).map((f) => f.name);
  for (const name of landed) await copyFile(path.join(out, name), path.join(film, name));
  // The numbers the pages read are the ones this reel issued, never the turn's copy of them.
  await mkdir(path.join(film, "data"), { recursive: true });
  for (const f of ["table.json", "continuity.json"]) if (existsSync(path.join(dir, f))) await copyFile(path.join(dir, f), path.join(film, "data", f));
  await mutateState(dir, (s): ReelState => {
    // `authoredAt` is the instant this pair was written (lib/reel/film.ts): every render older than it is a picture of
    // the previous pages, so the stage reads `rendering` and the render job draws both faces again.
    const at = now();
    const next: FilmRecord = s.film === undefined ? { frames, renders: {}, copies: {}, authoredAt: at } : { ...s.film, frames, authoredAt: at };
    return { ...s, film: next, updatedAt: at };
  });
  return landed;
}

export async function authorAct(e: ReelEngines, req: ReelJobRequest, dir: string, ctx: StepContext): Promise<StepOutcome> {
  const state = await readState(dir);
  try {
    await readTable(dir, state);
  } catch (x) {
    if (x instanceof ReelError) return { kind: "fatal", code: "refused", message: x.message };
    throw x;
  }
  const ws = workspaceOf(dir, "author");
  const out = path.join(ws, "out");
  const first: Turn = { ws, agent: agentOf(ws, AUTHOR_PROMPT, AUTHOR_TOOLS, "strip-author"), label: "author" };
  const stand = (): Promise<void> => standInFilm(out);
  if (!(await landedBy(ws, ctx.job.id, "reel-desktop.html"))) {
    const notes = await notesOf(req, dir);
    await prepare(ws, ctx.job.id, async (inputs) => {
      await copyFile(pipelineFile("REEL-FILM-PROMPT.md"), path.join(inputs, "REEL-FILM-PROMPT.md"));
      await copyFile(path.join(process.cwd(), "knowledge", "reel", "look.md"), path.join(inputs, "LOOK.md"));
      await writeFile(path.join(inputs, "IDEA.md"), ideaMarkdown(state.idea));
      await copyFile(path.join(dir, "table.json"), path.join(inputs, "table.json"));
      if (existsSync(path.join(dir, "continuity.json"))) await copyFile(path.join(dir, "continuity.json"), path.join(inputs, "continuity.json"));
      await writeFile(path.join(inputs, "SHARED-DATA.md"), await sharedListing());
      if (notes !== undefined) await writeFile(path.join(inputs, "NOTES.md"), notesMarkdown(notes.pins, notes.note));
      const prev = await filmFiles(path.join(dir, FILM_DIR));
      if (prev.length > 0) {
        await mkdir(path.join(inputs, "previous"), { recursive: true });
        for (const f of prev) await writeFile(path.join(inputs, "previous", f.name), f.text);
      }
    });
    const r = await seatTurn(e, ctx, req, first, stand);
    const stop = notServed(r, "the author turn");
    if (stop !== undefined) return stop;
  }
  let check = await checkOut(out);
  if (check.findings.length > 0) {
    await writeFile(path.join(ws, "inputs", "feedback.md"), fixMarkdown(check.findings));
    const fix: Turn = { ws, agent: agentOf(ws, FIX_PROMPT, AUTHOR_TOOLS, "strip-author"), label: "fix" };
    // A dry fix changes nothing, as a seat shown a passing film may.
    const r = await seatTurn(e, ctx, req, fix, async () => {});
    const stop = notServed(r, "the fix turn");
    if (stop !== undefined) return stop;
    check = await checkOut(out);
    if (check.findings.length > 0) return { kind: "fatal", code: "invalid", message: `the film fails its check after the fix turn: ${check.findings.join(" | ")}` };
  }
  const frames = check.frames ?? 0;
  const landed = await landFilm(dir, out, frames);
  return madePaid(data({ film: landed, frames, seconds: frames / 30, dry: ctx.job.mode.kind === "dry" }), ctx);
}
