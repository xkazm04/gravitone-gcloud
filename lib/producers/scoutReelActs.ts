import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseJsonAt } from "@gt/domain/door";
import { AppError, err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { CallIntent } from "@gt/kernel/dryrun";
import type { StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import type { SettleEntry } from "@gt/kernel/spend/ledger";
import { JOB_USD } from "@gt/kernel/spend/meter";
import { madePaid } from "@gt/producers/research/partAct";
import { failureOf } from "@gt/producers/research/metered";
import { reelApproachSchema, reelBriefSchema, type ReelApproachIn, type ReelBriefIn, type ReelsPorts, type ReelsRequest } from "@gt/producers/scout-reels/define";

import type { AgentResult, RunAgentInput } from "../agent/cliSeam.ts";
import { collectTurn, prepareTurn, standInPage, standInTurn, type StripTurn } from "../foundry/strips/author.ts";
import { DEFAULT_OPTIONS, DEFAULT_SELECTION } from "../foundry/strips/cards.ts";
import { formatLint, lintStrip, stripDataRule } from "../foundry/strips/lint.ts";
import type { Approach, MotionGrammar, StripLane, StripMedium, SupportAsset } from "../foundry/strips/types.ts";
import { followEpisodes } from "../foundry/scout/episodeMoves.ts";
import { mutateNight, readNight, resolveInNight, withCandidate } from "../foundry/scout/store.ts";
import { REEL_DATA_ID, REEL_DENSITIES, REEL_GRAMMARS, REEL_MEDIA, type ReelFiles } from "../foundry/scout/types.ts";
import { standIdea } from "./scoutIdeaActs.ts";
import { cutOutDir, isHolder, renderedAs, subjectOf, type ReelHolder, type ReelLayout } from "./scoutReelKinds.ts";

export type { ReelLayout } from "./scoutReelKinds.ts";

// THE REELS' ACTS - the ports of packages/producers/src/scout-reels/define.ts over the strips author
// seam, the lint, the headless frame and the night store.
//
//   reel   the idea's brief and approach read off the night; the author turn on the seat (metered:
//          the seat's own report booked against the job with a `claude-seat/<model>` model axis,
//          which the night's ceiling does not cap - lib/foundry/scout/budget.ts `capped`); the
//          frame-purity lint and the data-block rule; ONE fix turn on findings, then the lint again;
//          frame 120 rendered cold as ideas/<c-NN>.png. A dry job is answered by the strips stand-in
//          page holding the brief's numbers in its data block (so the rule passes as it must on a
//          real strip) and a stand-in tile, OUR picture: no seat, no browser.
//   ended  a failed job's sentence on every idea of it still pending, verbatim
//
// A KEPT IDEA ON REAL DATA and A FULL CUT (spark scout-vision S5) are the same step over a `reel` or a `reel-cut`
// candidate (./scoutReelKinds.ts says where each lives): the lint holds a cut's page to its own frame count, and a cut
// ends in a whole render to mp4 (`render`, pipeline/strips/render.mts renderStrip) instead of one frame - its poster
// the tile. A dry cut renders nothing: its strip is its record.
//
// LANDING IS THE MARKER (the strips steps' rule). The author turn's page is copied to
// ideas/<c-NN>/strip.html as soon as the turn leaves it, before the lint: a drive that died after a
// paid turn finds the page there and lints it instead of buying the turn again. The candidate's
// `reel.strip` is written only once the strip passed and its tile is drawn.
//
// Every night write is fenced against the job's slot first (the ideas acts' `fence`).

export type ReelEngines = {
  /** The seat (lib/agent/cliSeam.ts `runAgent`); a test hands a counted fake. */
  readonly seat: (input: RunAgentInput) => Promise<AgentResult>;
  /** Frame `i` of the strip at `htmlPath`, drawn cold in a fresh page (pipeline/strips/render.mts renderFrame). */
  readonly frame: (htmlPath: string, lane: StripLane, i: number) => Promise<Buffer>;
  /** A full cut's whole render: strip.mp4 and poster.jpg written into `outDir`; throws the render's sentence. Absent: a cut fails saying so. */
  readonly render?: (htmlPath: string, lane: StripLane, frames: number, outDir: string) => Promise<void>;
};

/* ── The card the strips turn takes ───────────────────────────────────────── */

/** A reel draws in the vertical stat lane: 1080x1920. */
export const REEL_LANE: StripLane = "stat";
/** The card id a reel's approach carries: it is the seat's own design, not a card of approaches.json. */
export const REEL_APPROACH_ID = "REEL";
/** No supporting image on the night that proposes a reel: the idea is triaged on its own frame. */
export const REEL_SUPPORT: SupportAsset = "none";
/** The strips default effort (`--effort`, cards.ts DEFAULT_SELECTION). */
export const REEL_EFFORT = DEFAULT_SELECTION.effort;

/** What the chromium the harness runs can draw: webgl renders black under --disable-gpu (REEL.md). The ideas
 *  door refuses any other word first (lib/foundry/scout/idea.ts); this holds a brief.json written by hand. */
const MEDIA: readonly StripMedium[] = REEL_MEDIA;
const GRAMMARS: readonly MotionGrammar[] = REEL_GRAMMARS;
const DENSITIES: readonly Approach["density"][] = REEL_DENSITIES;

const REEL_PROMPT = "Then read inputs/REEL.md: it is this strip's addendum to the contract, and it wins where the two differ.";
const SEAT_NOTE = "a seat turn is priced by the seat's own report after it ends";

function oneOf<T extends string>(field: string, said: string, vocab: readonly T[]): Result<T> {
  const w = said.trim().toLowerCase();
  const hit = vocab.find((v) => v === w);
  return hit === undefined ? err("invalid", `approach.${field} "${said}" is not one the strips harness draws (${vocab.join(", ")})`) : ok(hit);
}

/** The seat's approach as a strips card: its words where the card vocabulary has them, the constants above for what an idea has no word for. */
export function approachOf(a: ReelApproachIn, kase: string): Result<Approach> {
  const medium = oneOf("medium", a.medium, MEDIA);
  if (!medium.ok) return medium;
  const grammar = oneOf("grammar", a.grammar, GRAMMARS);
  if (!grammar.ok) return grammar;
  const density = oneOf("density", a.density, DENSITIES);
  if (!density.ok) return density;
  return ok({ id: REEL_APPROACH_ID, lane: REEL_LANE, case: kase, name: a.name, medium: medium.value, grammar: grammar.value, density: density.value, leonardo: REEL_SUPPORT, direction: a.direction, falsifier: a.falsifier });
}

/** The lint a reel answers to: the strips frame-purity lint (a cut's at its own frame count) and the data-block rule, as one list of lines. */
export const reelLint = (html: string, frames?: number): string[] => formatLint([...lintStrip(html, frames === undefined ? {} : { frames }), ...stripDataRule(html, REEL_DATA_ID)]);

/* ── The night ────────────────────────────────────────────────────────────── */

const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;
const fatal = (code: "not-found" | "unavailable" | "internal", message: string): StepOutcome => ({ kind: "fatal", code, message });

function fence(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; night.json is not written`);
  const r = ctx.fx.tx("scout.fence", (t) => assertFence(t, slot, lease.fence));
  if (!r.ok) throw r.error;
}

async function writeIdeas(req: ReelsRequest, jobId: string, which: readonly string[], fn: (c: ReelHolder) => ReelHolder): Promise<void> {
  await mutateNight(req.nightId, (n) => {
    let m = n;
    for (const cid of which) {
      const c = m.candidates.find(isHolder(cid));
      if (c !== undefined) m = withCandidate(m, { ...fn(c), jobId });
    }
    return m.jobs.includes(jobId) ? m : { ...m, jobs: [...m.jobs, jobId] };
  });
  // A channel episode's reel moves its episode: made, or back to outline-kept (lib/foundry/scout/episodeMoves.ts).
  await followEpisodes(req.nightId, which);
}

const failed = (why: string) => (c: ReelHolder): ReelHolder => ({ ...c, status: "failed", error: why });

/** One idea failed with its sentence, and its step booked: the batch goes on. */
async function failOne(req: ReelsRequest, ctx: StepContext, cid: string, why: string): Promise<StepOutcome> {
  fence(ctx);
  await writeIdeas(req, ctx.job.id, [cid], failed(why));
  return madePaid(data({ reel: cid, failed: why }), ctx);
}

async function inputsOf(nightId: string, files: Required<ReelFiles>): Promise<Result<{ brief: ReelBriefIn; approach: ReelApproachIn }>> {
  const text = async (rel: string): Promise<Result<string>> => {
    const abs = resolveInNight(nightId, rel);
    return existsSync(abs) ? ok(await readFile(abs, "utf8")) : err("not-found", `${rel} is not in night ${nightId}: the ideas door writes it before the launch`);
  };
  const b = await text(files.brief);
  if (!b.ok) return b;
  const a = await text(files.approach);
  if (!a.ok) return a;
  const brief = parseJsonAt(files.brief, reelBriefSchema, b.value);
  if (!brief.ok) return brief;
  const approach = parseJsonAt(files.approach, reelApproachSchema, a.value);
  return approach.ok ? ok({ brief: brief.value, approach: approach.value }) : approach;
}

/* ── One turn on the seat ─────────────────────────────────────────────────── */

type TurnKind = "author" | "fix";

function seatEntry(r: AgentResult, cid: string, turn: TurnKind, model: string): SettleEntry {
  const axes = { producer: "scout-reels", idea: cid, turn, model: `claude-seat/${model}` };
  const outcome = r.outcome === "completed" ? "served" : "failed";
  return r.costUsd === undefined ? { amount: undefined, outcome, basis: "seat-report", axes, reason: "seat reported no cost" } : { amount: r.costUsd, outcome, basis: "seat-report", axes };
}

/** The dry answer: the strips stand-in, its page holding the brief's numbers in the data block. */
async function standReel(t: StripTurn, numbers: unknown, frames: number): Promise<AgentResult> {
  const r = await standInTurn(t);
  if (!t.fix) await writeFile(path.join(t.ws, "out", "strip.html"), standInPage(t.lane, numbers, frames));
  return r;
}

async function seatTurn(e: ReelEngines, ctx: StepContext, t: StripTurn, cid: string, turn: TurnKind, numbers: unknown, frames: number): Promise<AgentResult> {
  const { model, effort, prompt } = t.agent;
  const intent: CallIntent<Promise<AgentResult>> = {
    provider: "claude-seat",
    model,
    usage: {},
    quote: { usd: null, basis: "unpriced", note: SEAT_NOTE },
    payload: { turn: `reel-${turn}`, idea: cid, model, effort, promptChars: prompt.length },
    subject: { kind: "job", id: ctx.job.id },
    stand: () => standReel(t, numbers, frames),
  };
  // No ceiling to lower the writer's budget to: the seat is reported, never capped (19b0b8e1).
  const r = await ctx.meter.paid(JOB_USD, 0, intent, async () => {
    const out = await e.seat(t.agent);
    return { value: Promise.resolve(out), entries: [seatEntry(out, cid, turn, model)] };
  });
  if (!r.ok) throw r.error;
  return r.value;
}

/** A turn's ending that is not this idea's: a spent window waits, a seat that never served fails the rest. */
async function everyones(req: ReelsRequest, k: number, ctx: StepContext, r: AgentResult): Promise<StepOutcome | undefined> {
  const why = r.errors.join(" | ");
  if (r.outcome === "seat-limit") return { kind: "money-stop", message: `the text seat's usage window is spent (${req.reels[k - 1]?.candidateId ?? `reel ${k}`}): ${why || "seat limit"}` };
  if (r.outcome !== "unavailable" || r.costUsd !== undefined) return undefined;
  const sentence = why || "the text seat is unavailable";
  fence(ctx);
  const night = await readNight(req.nightId);
  const open = req.reels.slice(k - 1).map((x) => x.candidateId).filter((cid) => night.candidates.find(isHolder(cid))?.status !== "rendered");
  await writeIdeas(req, ctx.job.id, open, failed(sentence));
  return fatal("unavailable", sentence);
}

/** What the turn left in out/, landed beside the idea's inputs. False: it left no page. */
async function landTurn(ctx: StepContext, t: StripTurn, stripAbs: string): Promise<boolean> {
  const got = await collectTurn(t);
  if (got.html === undefined) return false;
  fence(ctx);
  await mkdir(path.dirname(stripAbs), { recursive: true });
  await copyFile(got.html, stripAbs);
  if (got.style !== undefined) await copyFile(got.style, path.join(path.dirname(stripAbs), "style.json"));
  return true;
}

function feedbackText(findings: readonly string[]): string {
  return ["# Lint of your strip", "", "## Lint errors (the strip was NOT rendered)", ...findings.map((l) => `- ${l}`), "", "inputs/REEL.md says how the numbers are held."].join("\n");
}

/* ── reel ─────────────────────────────────────────────────────────────────── */

/** The subject's last move: frame 120 as the tile, or - a full cut - the whole render to mp4 with its poster as the tile. */
async function draw(e: ReelEngines, req: ReelsRequest, c: ReelHolder, s: ReturnType<typeof subjectOf>, stripAbs: string, k: number, at: ReelLayout, ctx: StepContext): Promise<Result<{ tile?: string; video?: string }>> {
  if (c.kind === "reel-cut") {
    // A dry cut renders nothing: its strip, linted at its own length, is its record.
    if (ctx.job.mode.kind === "dry") return ok({});
    const out = cutOutDir(req.nightId, s);
    if (e.render === undefined || out === undefined || s.video === undefined) return err("unavailable", "no full-cut renderer is bound to this process");
    try {
      await e.render(stripAbs, REEL_LANE, s.frames, out);
    } catch (x) {
      if (!(x instanceof Error)) throw x;
      return err("unavailable", errorMessage(x));
    }
    return ok({ video: s.video, ...(existsSync(resolveInNight(req.nightId, s.tile)) ? { tile: s.tile } : {}) });
  }
  let png: Buffer;
  if (ctx.job.mode.kind === "dry") png = standIdea(k);
  else {
    try {
      png = await e.frame(stripAbs, REEL_LANE, at.frame);
    } catch (x) {
      if (!(x instanceof Error)) throw x;
      return err("unavailable", errorMessage(x));
    }
  }
  fence(ctx);
  const abs = resolveInNight(req.nightId, s.tile);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, png);
  return ok({ tile: s.tile });
}

async function reelAct(e: ReelEngines, at: ReelLayout, req: ReelsRequest, k: number, ctx: StepContext): Promise<StepOutcome> {
  const ask = req.reels[k - 1];
  if (ask === undefined) return fatal("internal", `the reels request has no reel ${k}`);
  const c = (await readNight(req.nightId)).candidates.find(isHolder(ask.candidateId));
  if (c === undefined) return fatal("not-found", `no idea ${ask.candidateId} in night ${req.nightId}`);
  const s = subjectOf(at, req.nightId, c);
  const files = s.files;
  // A drive that died between the tile and the booking: the reel is the candidate's.
  if (s.held) return madePaid(data({ reel: c.id, file: c.image ?? files.strip, held: true }), ctx);

  const inputs = await inputsOf(req.nightId, files);
  if (!inputs.ok) return failOne(req, ctx, c.id, inputs.error.message);
  const approach = approachOf(inputs.value.approach, inputs.value.brief.case);
  if (!approach.ok) return failOne(req, ctx, c.id, approach.error.message);
  const numbers = inputs.value.brief.data;
  const stripAbs = resolveInNight(req.nightId, files.strip);
  const styleAbs = path.join(path.dirname(stripAbs), "style.json");
  const turnIn = {
    ws: resolveInNight(req.nightId, `_ws/${c.id}`),
    lane: REEL_LANE,
    brief: inputs.value.brief,
    approach: approach.value,
    effort: REEL_EFFORT,
    timeoutMin: DEFAULT_OPTIONS.authorTimeoutMin,
    addendum: { inputs: [path.join(process.cwd(), "pipeline", "strips", "REEL.md")], prompt: REEL_PROMPT },
    ...(s.styleRef === undefined ? {} : { styleRef: s.styleRef }),
  };

  // The author turn, unless a paid one already landed its page (see LANDING above).
  if (!existsSync(stripAbs)) {
    const t = await prepareTurn(turnIn);
    const r = await seatTurn(e, ctx, t, c.id, "author", numbers, s.frames);
    const stop = await everyones(req, k, ctx, r);
    if (stop !== undefined) return stop;
    if (r.outcome !== "completed" || !(await landTurn(ctx, t, stripAbs))) return failOne(req, ctx, c.id, `${r.outcome}: ${r.errors.join(" | ") || "no out/strip.html written"}`);
  }

  let findings = reelLint(await readFile(stripAbs, "utf8"), s.frames);
  if (findings.length > 0) {
    const t = await prepareTurn({ ...turnIn, feedback: { text: feedbackText(findings), current: stripAbs, ...(existsSync(styleAbs) ? { style: styleAbs } : {}) } });
    const r = await seatTurn(e, ctx, t, c.id, "fix", numbers, s.frames);
    const stop = await everyones(req, k, ctx, r);
    if (stop !== undefined) return stop;
    // A fix that failed or changed nothing leaves the page it was shown: the lint says what is still wrong.
    if (r.outcome === "completed") await landTurn(ctx, t, stripAbs);
    findings = reelLint(await readFile(stripAbs, "utf8"), s.frames);
    if (findings.length > 0) return failOne(req, ctx, c.id, `lint: ${findings.join(" | ")}`);
  }

  const drawn = await draw(e, req, c, s, stripAbs, k, at, ctx);
  if (!drawn.ok) return failOne(req, ctx, c.id, drawn.error.message);
  fence(ctx);
  await writeIdeas(req, ctx.job.id, [c.id], (x) => renderedAs(x, s, drawn.value));
  return madePaid(data({ reel: c.id, ...(drawn.value.tile === undefined ? {} : { file: drawn.value.tile }), ...(drawn.value.video === undefined ? {} : { video: drawn.value.video }), strip: files.strip, dry: ctx.job.mode.kind === "dry" }), ctx);
}

/* ── The ending ───────────────────────────────────────────────────────────── */

/** A failed job's sentence on every candidate of its request that is still pending and still this job's. */
async function ended(req: ReelsRequest, job: Job, ending: string): Promise<void> {
  if (ending !== "failed") return;
  const why = job.error?.message ?? `job ${job.id} failed`;
  const night = await readNight(req.nightId);
  const open = req.reels
    .map((i) => night.candidates.find(isHolder(i.candidateId)))
    .filter((c): c is ReelHolder => c !== undefined && c.status === "pending" && (c.jobId === undefined || c.jobId === job.id))
    .map((c) => c.id);
  if (open.length > 0) await writeIdeas(req, job.id, open, failed(why));
}

export function reelActs(e: ReelEngines, at: ReelLayout): Pick<ReelsPorts, "reel" | "ended"> {
  return {
    reel: async (req, k, ctx) => {
      try {
        return await reelAct(e, at, req, k, ctx);
      } catch (x) {
        return failureOf(x);
      }
    },
    ended,
  };
}
