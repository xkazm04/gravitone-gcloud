import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import { COVER_TAKE_COUNT, type CoverRecord, type CoverTake } from "@gt/domain/cover";
import { AppError, errorMessage, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { Ending, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import { tagsFromScore, TRANSCRIBE_STEP, type CoverPorts, type CoverRequest } from "@gt/producers/cover/define";

import { cutSection } from "../sound/cover/cut.ts";
import { coverFileAbs, mutateCover, readCover, writeCoverFile } from "../sound/cover/store.ts";
import { renderTake, transcribeAbc, type Yue2Deps } from "../sound/cover/yue2.ts";

// THE COVER'S ACTS - the ports of packages/producers/src/cover/define.ts over ffmpeg, this box's ComfyUI and the cover
// store (spark track-mirror-studio).
//
//   transcribe  the section cut to section.wav unless it is there, SheetSage2 over it, score.abc written and named on
//               the record. The lyrics the takes are sung from are decided HERE and booked on this step's output: the
//               request's, or - when the owner gave none - the score's own section labels (define.ts tagsFromScore).
//               The request was written at launch, before any score existed, so it cannot hold them.
//   render-n    take n from score.abc, the request's style, the booked lyrics and the take's seed; takes/s<seed>.flac
//               written and the take marked done with its seconds. A failed render marks the take failed with
//               ComfyUI's sentence verbatim and answers vendor-failure with the same sentence (the kernel's breaker
//               decides whether it is tried again).
//   ended       the record told the job's ending: judging when all five takes are done, else failed.
//
// Every record write is fenced against the job's slot first (the sheet acts' `fence`). A cover renders live, on this
// box, free: a job whose mode is not live is refused here as it is at the launch.

/** What a test replaces: ffmpeg's section cut, the ComfyUI client's transport, the clock. */
export type CoverActEngines = {
  readonly cut?: typeof cutSection;
  readonly comfy?: Yue2Deps;
  readonly now?: () => number;
};

const SECTION = "section.wav";
const SCORE = "score.abc";
const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;
const produced = (output: unknown): StepOutcome => ({ kind: "produced", output: data(output), costUsd: 0 });
const fatal = (e: unknown): StepOutcome => ({ kind: "fatal", code: e instanceof AppError ? e.code : "internal", message: errorMessage(e) });

function fence(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; cover.json is not written`);
  const r = ctx.fx.tx("cover.fence", (t) => assertFence(t, slot, lease.fence));
  if (!r.ok) throw r.error;
}

async function coverOf(req: CoverRequest): Promise<CoverRecord> {
  const c = await readCover(req.coverId);
  if (c === undefined) throw new AppError("not-found", `no cover ${req.coverId}`);
  return c;
}

/** The first step a drive performs moves the cover to rendering (from queued, or from failed on a retry). */
async function rendering(req: CoverRequest, ctx: StepContext): Promise<CoverRecord> {
  const c = await coverOf(req);
  if (c.state === "rendering") return c;
  fence(ctx);
  return mutateCover(req.coverId, (x) => (x.state === "queued" || x.state === "failed" ? { ...x, state: "rendering" } : x));
}

const withTake = (c: CoverRecord, t: CoverTake): CoverRecord => ({ ...c, takes: [...c.takes.filter((x) => x.n !== t.n), t].sort((a, b) => a.n - b.n) });

async function transcribeAct(e: CoverActEngines, req: CoverRequest, ctx: StepContext): Promise<StepOutcome> {
  if (ctx.job.mode.kind !== "live") return { kind: "fatal", code: "refused", message: "a cover renders live on this box's card; a dry job renders none" };
  const c = await rendering(req, ctx);
  const now = e.now ?? Date.now;
  const t0 = now();
  let abc: string;
  let held = false;
  if (c.score !== undefined && existsSync(coverFileAbs(c.id, c.score))) {
    // A drive that died between the score and the booking: the score is the cover's.
    abc = await readFile(coverFileAbs(c.id, c.score), "utf8");
    held = true;
  } else {
    const wav = coverFileAbs(c.id, SECTION);
    if (!existsSync(wav)) {
      const cut = await (e.cut ?? cutSection)(coverFileAbs(c.id, c.source.file), req.startS, req.endS, wav);
      if (!cut.ok) return { kind: "fatal", code: cut.error.code, message: cut.error.message };
    }
    try {
      abc = (await transcribeAbc(new Uint8Array(await readFile(wav)), c.id, e.comfy)).abc;
    } catch (x) {
      if (x instanceof AppError && x.code === "unavailable") return { kind: "vendor-failure", message: x.message };
      throw x;
    }
    fence(ctx);
    await writeCoverFile(c.id, SCORE, new TextEncoder().encode(abc));
    await mutateCover(c.id, (x) => ({ ...x, score: SCORE }));
  }
  const lyrics = req.lyrics.trim() === "" ? tagsFromScore(abc) : req.lyrics;
  return produced({ score: SCORE, chars: abc.length, lyrics, derived: req.lyrics.trim() === "", held, seconds: Math.round((now() - t0) / 100) / 10 });
}

function lyricsOf(ctx: StepContext): Result<string> {
  const v = ctx.outputs.get(TRANSCRIBE_STEP)?.value as { readonly lyrics?: unknown } | undefined;
  return typeof v?.lyrics === "string" ? { ok: true, value: v.lyrics } : { ok: false, error: new AppError("internal", `job ${ctx.job.id} renders before its transcribe step was booked`) };
}

async function renderAct(e: CoverActEngines, req: CoverRequest, n: number, ctx: StepContext): Promise<StepOutcome> {
  if (ctx.job.mode.kind !== "live") return { kind: "fatal", code: "refused", message: "a cover renders live on this box's card; a dry job renders none" };
  const c = await rendering(req, ctx);
  const seed = req.seeds[n - 1];
  if (seed === undefined) return { kind: "fatal", code: "internal", message: `cover ${c.id} has no seed for take ${n}` };
  const rel = `takes/s${seed}.flac`;
  const was = c.takes.find((t) => t.n === n);
  // A drive that died between the take and the booking: the take is the cover's.
  if (was?.state === "done" && was.file === rel && existsSync(coverFileAbs(c.id, rel))) return produced({ take: n, seed, file: rel, renderS: was.renderS, held: true });
  const lyrics = lyricsOf(ctx);
  if (!lyrics.ok) return fatal(lyrics.error);
  if (c.score === undefined) return { kind: "fatal", code: "internal", message: `cover ${c.id} has no score to render take ${n} from` };
  const abc = await readFile(coverFileAbs(c.id, c.score), "utf8");
  const now = e.now ?? Date.now;
  const t0 = now();
  let flac: Uint8Array;
  let promptId: string;
  try {
    ({ flac, promptId } = await renderTake({ abc, style: req.style, lyrics: lyrics.value, seed, prefix: `audio/gravitone-cover/${c.id}-s${seed}` }, e.comfy));
  } catch (x) {
    if (!(x instanceof AppError) || x.code !== "unavailable") throw x;
    fence(ctx);
    await mutateCover(c.id, (r) => withTake(r, { n, seed, state: "failed", error: x.message.slice(0, 2000) }));
    return { kind: "vendor-failure", message: x.message };
  }
  const renderS = Math.round((now() - t0) / 100) / 10;
  fence(ctx);
  await writeCoverFile(c.id, rel, flac);
  await mutateCover(c.id, (r) => withTake(r, { n, seed, state: "done", file: rel, renderS }));
  return produced({ take: n, seed, file: rel, renderS, bytes: flac.byteLength, promptId });
}

/** The state a finished job leaves its cover in, or null when the ending leaves it as it is (an interruption or a stop:
 *  the job may yet resume). A picked cover keeps its pick. */
export function settledCover(c: CoverRecord, job: { readonly id: string }, ending: Ending): CoverRecord | null {
  if (ending !== "done" && ending !== "failed") return null;
  if (c.jobId !== undefined && c.jobId !== job.id) return null;
  if (c.state === "picked") return null;
  const done = c.takes.filter((t) => t.state === "done").length;
  return { ...c, state: ending === "done" && done === COVER_TAKE_COUNT ? "judging" : "failed" };
}

async function ended(req: CoverRequest, job: Job, ending: Ending): Promise<void> {
  const c = await readCover(req.coverId);
  if (c === undefined || settledCover(c, job, ending) === null) return;
  await mutateCover(req.coverId, (x) => settledCover(x, job, ending) ?? x);
}

const guarded =
  <A extends unknown[]>(f: (...a: A) => Promise<StepOutcome>) =>
  async (...a: A): Promise<StepOutcome> => {
    try {
      return await f(...a);
    } catch (x) {
      return fatal(x);
    }
  };

export function coverActs(e: CoverActEngines = {}): Pick<CoverPorts, "transcribe" | "render" | "ended"> {
  return {
    transcribe: guarded((req: CoverRequest, ctx: StepContext) => transcribeAct(e, req, ctx)),
    render: guarded((req: CoverRequest, n: number, ctx: StepContext) => renderAct(e, req, n, ctx)),
    ended,
  };
}
