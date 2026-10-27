import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { AppError, errorMessage } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import { madePaid } from "@gt/producers/research/partAct";
import { meteredCall } from "@gt/producers/research/metered";
import type { StoryboardPorts, StoryboardRequest } from "@gt/producers/scout-storyboard/define";

import { FLUX_MODEL, type FluxAspect } from "../imaging/local/flux2.ts";
import { mutateNight, readNight, resolveInNight, withCandidate } from "../foundry/scout/store.ts";
import type { CandidateId, StoryboardCandidate } from "../foundry/scout/types.ts";
import { standIdea } from "./scoutIdeaActs.ts";

// THE STORYBOARD'S ACTS - the ports of packages/producers/src/scout-storyboard/define.ts over the local Flux
// client and the night store.
//
//   panel  one Flux 2 frame from the panel's prompt and its launch-chosen seed, written to
//          storyboards/<c-NN>/panel-N.png and recorded at its index in the candidate's `images` and `seeds`.
//          A LOCAL FRAME IS FREE, so a live one is not a paid call: it is made directly, books no spend
//          row, and the step reports $0 (the scene's local clip rule, scoutSceneActs.ts `clipAct`). A dry
//          job declares it to the meter and is answered by a stand-in picture, so it never reaches the card.
//          A frame the engine refused leaves its index null and its sentence in `error` (`panel N: ...`);
//          the step is booked and the storyboard goes on.
//   ended  the candidate told how its job ended (`settledBoard`): rendered while any frame landed, failed
//          with every panel's sentence when none did.
//
// Every night write is fenced against the job's slot first (the scene and ideas acts' `fence`).

/** The frame engine a storyboard draws with: production's is lib/imaging/local/flux2.ts; a test hands a fake. */
export type StoryboardDraw = (prompt: string, o: { readonly aspect: FluxAspect; readonly seed?: number }) => Promise<{ readonly png: Uint8Array; readonly seed: number }>;
export type StoryboardActEngines = { readonly draw: StoryboardDraw };

const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;
const fatal = (code: "not-found" | "internal", message: string): StepOutcome => ({ kind: "fatal", code, message });

/** Night-relative: `storyboards/c-12/panel-3.png`. */
export const panelFile = (cid: CandidateId, k: number): string => `storyboards/${cid}/panel-${k}.png`;

function fence(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; night.json is not written`);
  const r = ctx.fx.tx("scout.fence", (t) => assertFence(t, slot, lease.fence));
  if (!r.ok) throw r.error;
}

const isBoard = (cid: string) => (x: { readonly id: string; readonly kind: string }): x is StoryboardCandidate => x.id === cid && x.kind === "storyboard";

/** One candidate write: `fn` over the storyboard as it is NOW, the job named on it and on `night.jobs`. */
async function writeBoard(req: StoryboardRequest, jobId: string, fn: (c: StoryboardCandidate) => StoryboardCandidate): Promise<void> {
  await mutateNight(req.nightId, (n) => {
    const c = n.candidates.find(isBoard(req.candidateId));
    if (c === undefined) return n;
    const m = withCandidate(n, { ...fn(c), jobId });
    return m.jobs.includes(jobId) ? m : { ...m, jobs: [...m.jobs, jobId] };
  });
}

/** The storyboard with panel `k` (1-based) recorded: its file (null when it failed), its seed, and a failure's sentence appended. */
export function withPanel(c: StoryboardCandidate, of: number, k: number, file: string | null, seed: number, why?: string): StoryboardCandidate {
  const images = Array.from({ length: of }, (_, i) => c.images?.[i] ?? null);
  const seeds = Array.from({ length: of }, (_, i) => c.seeds?.[i] ?? 0);
  images[k - 1] = file;
  seeds[k - 1] = seed;
  const said = `panel ${k}: `;
  const errors = (c.error ?? "").split("; ").filter((e) => e !== "" && !e.startsWith(said));
  if (why !== undefined) errors.push(`${said}${why}`);
  const { error: _e, ...base } = c;
  return { ...base, images, seeds, ...(errors.length === 0 ? {} : { error: errors.join("; ") }) };
}

/* ── panel ────────────────────────────────────────────────────────────────── */

async function panelAct(e: StoryboardActEngines, req: StoryboardRequest, k: number, ctx: StepContext): Promise<StepOutcome> {
  const ask = req.panels[k - 1];
  if (ask === undefined) return fatal("internal", `the storyboard request has no panel ${k}`);
  const c = (await readNight(req.nightId)).candidates.find(isBoard(req.candidateId));
  if (c === undefined) return fatal("not-found", `no storyboard ${req.candidateId} in night ${req.nightId}`);
  // A drive that died between the frame and the booking: the frame is the panel's.
  const held = c.images?.[k - 1];
  if (typeof held === "string") return madePaid(data({ panel: k, file: held, held: true }), ctx);

  const of = req.panels.length;
  let got: { readonly png: Uint8Array; readonly seed: number; readonly model: string };
  try {
    got =
      ctx.job.mode.kind === "live"
        ? { ...(await e.draw(ask.prompt, { aspect: req.aspect, seed: ask.seed })), model: FLUX_MODEL }
        : await meteredCall<{ png: Uint8Array; seed: number; model: string }>(ctx, {
            provider: "comfyui",
            model: FLUX_MODEL,
            payload: { prompt: ask.prompt, aspect: req.aspect, seed: ask.seed },
            estimate: req.estimates.panel,
            stand: () => ({ png: new Uint8Array(standIdea(k)), seed: ask.seed, model: "dry stand-in" }),
            live: async () => ({ value: { ...(await e.draw(ask.prompt, { aspect: req.aspect, seed: ask.seed })), model: FLUX_MODEL }, unpriced: "free: a local model" }),
          });
  } catch (x) {
    const why = errorMessage(x);
    fence(ctx);
    await writeBoard(req, ctx.job.id, (b) => withPanel(b, of, k, null, ask.seed, why));
    return madePaid(data({ panel: k, failed: why }), ctx);
  }
  const rel = panelFile(c.id, k);
  fence(ctx);
  const abs = resolveInNight(req.nightId, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, got.png);
  await writeBoard(req, ctx.job.id, (b) => withPanel(b, of, k, rel, got.seed));
  return madePaid(data({ panel: k, file: rel, seed: got.seed, provider: "comfyui", model: got.model, dry: got.model === "dry stand-in", costUsd: 0 }), ctx);
}

/* ── The ending ───────────────────────────────────────────────────────────── */

/**
 * The storyboard a finished job leaves, or null when the ending leaves it as it is (an interruption or an
 * operator's stop: the job may yet be retried). Any frame landed: `rendered`, the failed panels' sentences
 * kept in `error`. No frame: `failed`, with those sentences - or the job's own when no panel said one.
 */
export function settledBoard(c: StoryboardCandidate, ending: string, job: { readonly id: string; readonly error?: { readonly message: string } }): StoryboardCandidate | null {
  if (ending !== "done" && ending !== "failed") return null;
  const frames = (c.images ?? []).filter((f) => typeof f === "string").length;
  const jobSaid = ending === "failed" ? (job.error?.message ?? `job ${job.id} failed`) : undefined;
  const said = [c.error, jobSaid].filter((s): s is string => s !== undefined && s !== "").join("; ");
  const { error: _e, ...base } = c;
  if (frames > 0) return { ...base, status: "rendered", jobId: job.id, ...(said === "" ? {} : { error: said }) };
  return { ...base, status: "failed", jobId: job.id, error: said === "" ? `job ${job.id} drew no frame` : said };
}

async function ended(req: StoryboardRequest, job: Job, ending: string): Promise<void> {
  await mutateNight(req.nightId, (n) => {
    const c = n.candidates.find(isBoard(req.candidateId));
    if (c === undefined || (c.jobId !== undefined && c.jobId !== job.id)) return n;
    const next = settledBoard(c, ending, job);
    if (next === null) return n;
    const m = withCandidate(n, next);
    return m.jobs.includes(job.id) ? m : { ...m, jobs: [...m.jobs, job.id] };
  });
}

export function storyboardActs(e: StoryboardActEngines): Pick<StoryboardPorts, "panel" | "ended"> {
  return {
    panel: async (req, k, ctx) => {
      try {
        return await panelAct(e, req, k, ctx);
      } catch (x) {
        // A night write that lost its slot, a disk that refused the frame: the job's, never a panel's.
        return { kind: "fatal", code: x instanceof AppError ? x.code : "internal", message: errorMessage(x) };
      }
    },
    ended,
  };
}
