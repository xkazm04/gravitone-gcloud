import { AppError, type Result } from "@gt/domain/errors";
import type { Estimate } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { MissingStep, Producer, StepContext } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";

// THE SCOUT INGEST AS A JOB (spark media-training-loop WP1) - one unit per
// pending source of a /scout night: a picture fetched, a page's pictures fetched,
// or a video downloaded, cut into gated keyframes and DELETED. The night's
// manifest (lib/foundry/scout night.json) is the artefact store; the job is the
// driver's record and its lane slot the lock, as extract's is (../extract/define.ts).
//
// FREE AND LOCAL, AS MEDIA-FACTS IS (../media-facts/run.ts): lane box.render, every
// unit estimated at $0 and reported at `costUsd: 0`, no meter, no receipt. The
// fetch and the download are not vendor calls anyone bills, so dry and live are
// the same act for this job, and a dry-only process can drive it.
//
// A SOURCE THAT FAILS IS A FACT, NOT A JOB FAILURE. A 404, a video over the
// night's length cap, a tool that exits non-zero - each is written onto its source
// (`status: "failed"`, the tool's sentence verbatim) and the unit is PRODUCED: the
// breaker is for a box that cannot work, not for a web that has dead links in it.
// Only a night that cannot be read or written is fatal.
//
// THE PLAN IS THE MANIFEST: a unit is planned for every source that is still
// `pending`, in the job's scope, and not already booked. A unit booked whose
// source still reads pending (a drive that died between its write and its book)
// is not planned again - the next ingest launch is a new job that takes it.

export const SCOUT_INGEST = "scout-ingest";
export const SCOUT_INGEST_LANE = "box.render";

/** What the plan reads of a night: its sources' ids, kinds and states. */
export type IngestSourceView = { readonly id: string; readonly kind: "image" | "video" | "page"; readonly status: "pending" | "ingested" | "failed" };
export type IngestNightView = { readonly id: string; readonly sources: readonly IngestSourceView[] };

/** A night, or one source of it. */
export type IngestTarget = { readonly nightId: string; readonly sourceId?: string };

/** What one unit wrote onto its source. */
export type IngestOutcome = { readonly status: "ingested" | "failed"; readonly files: number; readonly error?: string };

export type IngestPorts = {
  /** night.json, synchronously: the plan is read inside the job's store transaction. */
  load(nightId: string): Result<IngestNightView>;
  /** Bring one source onto the box and write the outcome onto it. Err only when the night itself is unusable. */
  ingest(nightId: string, sourceId: string, io: { readonly stillHeld: () => void }): Promise<Result<IngestOutcome>>;
};

const PREFIX = "scout-ingest:";

/** The run a job serves: `scout-ingest:<night>` or `scout-ingest:<night>:<source>`. */
export const ingestRunId = (t: IngestTarget): string => `${PREFIX}${t.nightId}${t.sourceId === undefined ? "" : `:${t.sourceId}`}`;

export function parseIngestRunId(id: string): IngestTarget | null {
  if (!id.startsWith(PREFIX)) return null;
  const [nightId, sourceId, extra] = id.slice(PREFIX.length).split(":");
  if (nightId === undefined || nightId === "" || extra !== undefined || sourceId === "") return null;
  return sourceId === undefined ? { nightId } : { nightId, sourceId };
}

const STEP = "ingest:";
export const ingestStep = (sourceId: string): string => `${STEP}${sourceId}`;

/** Seconds a unit is expected to take: a download and a scene pass dominate a video. */
const ESTIMATE: Readonly<Record<IngestSourceView["kind"], Estimate>> = {
  image: { seconds: 5, usd: 0 },
  page: { seconds: 20, usd: 0 },
  video: { seconds: 180, usd: 0 },
};

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

function targetOf(job: Job): IngestTarget {
  const t = parseIngestRunId(job.of.id);
  if (t === null) throw new AppError("invalid", `job ${job.id} serves ${job.of.id}, which is not a scout ingest run`);
  return t;
}

/** The units still to do: pending sources in scope that this job has not booked. */
export function planIngest(target: IngestTarget, night: IngestNightView, booked: ReadonlySet<string>): MissingStep[] {
  return night.sources
    .filter((s) => s.status === "pending" && (target.sourceId === undefined || s.id === target.sourceId) && !booked.has(ingestStep(s.id)))
    .map((s) => ({ name: ingestStep(s.id), estimate: ESTIMATE[s.kind] }));
}

function stillHeld(ctx: StepContext): () => void {
  return () => {
    const { slot, lease } = ctx.job;
    if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; night.json is not written`);
    must(ctx.fx.tx("scout-ingest.fence", (t) => assertFence(t, slot, lease.fence)));
  };
}

export function defineScoutIngest(ports: IngestPorts): Producer {
  return {
    lane: SCOUT_INGEST_LANE,
    plan(job, outputs) {
      const target = targetOf(job);
      return planIngest(target, must(ports.load(target.nightId)), new Set(outputs.keys()));
    },
    async perform(step, ctx) {
      const target = targetOf(ctx.job);
      if (!step.name.startsWith(STEP)) return { kind: "fatal", code: "internal", message: `scout ingest planned ${step.name}, which is not an ingest unit` };
      const sourceId = step.name.slice(STEP.length);
      const r = await ports.ingest(target.nightId, sourceId, { stillHeld: stillHeld(ctx) });
      if (!r.ok) return { kind: "fatal", code: r.error.code, message: r.error.message };
      return { kind: "produced", output: { source: sourceId, status: r.value.status, files: r.value.files, ...(r.value.error === undefined ? {} : { error: r.value.error }) }, costUsd: 0 };
    },
  };
}
