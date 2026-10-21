import "server-only";

import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";
import type { JobState } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";

import { LEASE_TTL_MS } from "../../../../lib/foundry/extract/lease.ts";
import { getExtractRun, listExtractRuns } from "../../../../lib/foundry/extract/store.ts";
import { EXTRACT_COMMITTABLE, EXTRACT_LIVE } from "../../../foundry/plant.ts";
import { errorMessage } from "@gt/domain/errors";

import { bump, facts, instant, laneOfEngine, readEach, seg } from "../facts.ts";
import type { IngestEvent, LiveJob, ProjectCtx, Projection, Skipped, Source, WeirItem } from "../types.ts";

// THE STYLE EXTRACTOR, PROJECTED - foundry-out/extract/<id>/run.json (written
// by lib/foundry/extract/engine.ts, one unit per driver step) and its
// verdicts.json, read through v1's `listExtractRuns` and `getExtractRun`.
//
// Event-grade, recorded: run.start (`created`), run.log (the journal,
// lib/foundry/extract/journal.ts - capped at 400 lines, which is why log keys
// are content digests, facts.ts), run.end (`finished`), run.stop (`stopped.at`:
// a MONEY stop, kept apart from a vendor failure as v1 keeps it apart from
// `fail_streak`), verdict.keep|reject (`at` per style), commit (`committed.at`).
// Observed: run.status. Not events: the driver lease (`lease.at` is rewritten on
// every save - a heartbeat, which kernel/lease also refuses to log) and the
// spend total (it grows until the run ends; it rides in `data.spendUsd` on
// commit, never as a `cost`, because Phase 2's spend adapter projects the money
// ledger itself and the two would count the same dollars twice).
//
// LIVE IS STATUS AND A HOLDER. EXTRACT_LIVE (lib/foundry/plant.ts) is what the
// Extract tab calls live, but an extract run only moves while a driver steps it
// (the tab's loop or the CLI) and every step stamps `lease`. So:
//   fresh lease (within LEASE_TTL_MS, lib/foundry/extract/lease.ts) -> running;
//   `created`, never stamped                                       -> queued;
//   a stamp past its TTL - a driver that died mid-unit, possibly
//   after its vendor call was paid                                 -> interrupted;
//   mid-run with no stamp at all (a manifest older than the lease) -> paused.
// The Extract tab shows all four as "live"; Runs shows them, honestly worded.
// A run with a `job` (Phase 4, L29) is not drawn here at all: Runs reads its
// kernel job, which holds a fenced lease where the manifest held a stamp.

const EXTRACT_STATUSES = ["created", "reading", "grouping", "replicating", "transferring", "done", "failed", "committed"] as const;
type ExtractStatus = (typeof EXTRACT_STATUSES)[number];

const manifestSchema = z.object({
  id: z.string().min(1),
  slug: z.string(),
  created: z.string(),
  finished: z.string().optional(),
  status: z.enum(EXTRACT_STATUSES),
  progress: z.object({ stage: z.string(), done: z.number(), total: z.number() }),
  styles: z.array(z.object({ id: z.string().min(1), name: z.string() })),
  engines: z.object({ vision: z.string().optional(), generator: z.string().optional(), reasoner: z.string().optional() }),
  lease: z.object({ owner: z.string(), at: z.string() }).optional(),
  job: z.string().min(1).optional(),
  dry: z.literal(true).optional(),
  fail_streak: z.number().optional(),
  spend: z.object({ usd: z.number(), basis: z.enum(["reported", "estimate"]) }).optional(),
  stopped: z.object({ by: z.enum(["run-ceiling", "period-ceiling"]), spentUsd: z.number(), ceilingUsd: z.number().optional(), at: z.string() }).optional(),
  log: z.array(z.object({ at: z.string(), msg: z.string() })),
  error: z.string().optional(),
  committed: z
    .object({ at: z.string(), kept: z.array(z.string()), rejected: z.array(z.string()), written: z.array(z.string()).optional(), spendUsd: z.number().optional(), costPerKeptUsd: z.number().optional() })
    .optional(),
});
const verdictsSchema = z
  .record(z.string(), z.object({ verdict: z.enum(["keep", "reject"]), at: z.string(), reasons: z.array(z.string()).optional(), note: z.string().optional(), by: z.enum(["human", "model"]).optional() }))
  .transform((m) => Object.entries(m).map(([key, v]) => ({ key, ...v })));

type ExtractRun = { readonly run: Parsed<z.output<typeof manifestSchema>>; readonly verdicts: Parsed<z.output<typeof verdictsSchema>> };
export type ExtractSnapshot = { readonly runs: readonly ExtractRun[]; readonly skipped: readonly Skipped[] };

export const EXTRACT_READ_CAP = 500;

const ENGINE: Actor = { kind: "machine", id: "extract" };
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const CULL_MODEL: Actor = { kind: "agent", id: "extract-cull-model" };
// Where the work is seen now: the Floor's image lane - its cells the running work, its Weir the
// pile (v1's /foundry page retired in Phase 6 wave C and redirects; a redirect is not a link to keep).
const HREF = "/floor?lane=image";

async function read(): Promise<Result<ExtractSnapshot>> {
  let ids: string[];
  try {
    ids = (await listExtractRuns()).slice(0, EXTRACT_READ_CAP).map((r) => r.id);
  } catch (e) {
    return err("unavailable", `extract: listExtractRuns failed: ${errorMessage(e)}`, { cause: e });
  }
  const got = await readEach(ids, getExtractRun);
  const runs: ExtractRun[] = [];
  const skipped: Skipped[] = [...got.skipped];
  for (const d of got.items) {
    const run = parseAt(`extract run ${d.run.id}`, manifestSchema, d.run);
    const verdicts = parseAt(`extract run ${d.run.id} verdicts`, verdictsSchema, d.verdicts);
    if (!run.ok) skipped.push({ id: d.run.id, reason: run.error.message });
    else if (!verdicts.ok) skipped.push({ id: d.run.id, reason: verdicts.error.message });
    else runs.push({ run: run.value, verdicts: verdicts.value });
  }
  return ok({ runs, skipped });
}

/** The unit a status is running, and so the engine (and lane) it occupies. */
function engineFor(run: ExtractRun["run"]): string | undefined {
  const s: ExtractStatus = run.status;
  if (s === "grouping") return run.engines.reasoner;
  if (s === "replicating" || s === "transferring") return run.engines.generator;
  return run.engines.vision;
}

function laneOf(run: ExtractRun["run"]): { lane: ResourceLane; laneFrom?: string } {
  const engine = engineFor(run);
  const lane = laneOfEngine(engine);
  if (lane !== null) return { lane };
  const vision = laneOfEngine(run.engines.vision);
  const shown: ResourceLane = vision ?? "cloud.google";
  return { lane: shown, laneFrom: `no resource lane for engine "${engine ?? "unknown"}"; drawn on the vision engine's ${shown}` };
}

/** lib/foundry/extract/lease.ts activeLease, over the parsed record: a stamp younger than the TTL on an unfinished run. */
export function leaseState(run: Pick<ExtractRun["run"], "lease" | "status">, nowMs: number): "fresh" | "stale" | "none" {
  if (run.lease === undefined || !EXTRACT_LIVE.includes(run.status)) return "none";
  const at = Date.parse(run.lease.at);
  return Number.isFinite(at) && nowMs - at <= LEASE_TTL_MS ? "fresh" : "stale";
}

function stateOf(run: ExtractRun["run"], nowMs: number): JobState {
  const lease = leaseState(run, nowMs);
  if (lease === "fresh") return "running";
  if (lease === "stale") return "interrupted";
  return run.status === "created" ? "queued" : "paused";
}

function eventsOf(r: ExtractRun, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("extract", ctx);
  const { run } = r;
  const subject = { kind: "run", id: run.id };
  const data: EventData = { runId: run.id };
  const out: IngestEvent[] = [
    f.recorded(run.id, "run.start", run.created, { actor: ENGINE, type: "run.start", subject, data: { ...data, slug: run.slug } }),
    ...f.logged(run.id, run.log, { actor: ENGINE, subject, data }),
  ];
  if (run.stopped !== undefined) {
    const { at, ...stop } = run.stopped;
    out.push(f.recorded(run.id, `stop.${at}`, at, { actor: ENGINE, type: "run.stop", subject, data: { ...data, ...stop } }));
  }
  if (run.finished !== undefined) out.push(f.recorded(run.id, "run.end", run.finished, { actor: ENGINE, type: "run.end", subject, data: run.error === undefined ? data : { ...data, error: run.error } }));
  if (run.status !== "created" && run.status !== "committed") {
    out.push(f.observed(run.id, `status.${run.status}`, { actor: ENGINE, type: "run.status", subject, data: { ...data, status: run.status } }));
  }
  for (const v of r.verdicts) {
    const extra: EventData = { ...(v.note === undefined ? {} : { note: v.note }), ...(v.reasons === undefined ? {} : { reasons: v.reasons }) };
    out.push(
      f.recorded(run.id, `verdict.${seg(v.key)}.${v.verdict}.${v.at}`, v.at, {
        actor: v.by === "model" ? CULL_MODEL : OPERATOR,
        type: `verdict.${v.verdict}`,
        subject: { kind: "style", id: `${run.id}/${v.key}` },
        data: { ...data, ...extra },
      }),
    );
  }
  if (run.committed !== undefined) {
    const { at, ...what } = run.committed;
    out.push(f.recorded(run.id, "commit", at, { actor: OPERATOR, type: "commit", subject, data: { ...data, ...what } }));
  }
  return out;
}

function tallyOf(runs: readonly ExtractRun[]): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const { run, verdicts } of runs) {
    bump(records, `run.${run.status}`);
    bump(fs, "run.start");
    bump(fs, "run.log", run.log.length);
    if (run.stopped !== undefined) bump(fs, "run.stop");
    if (run.finished !== undefined) bump(fs, "run.end");
    if (run.status !== "created" && run.status !== "committed") bump(fs, "run.status");
    for (const v of verdicts) bump(fs, `verdict.${v.verdict}`);
    if (run.committed !== undefined) bump(fs, "commit");
  }
  return { records, facts: fs };
}

function liveOf({ run }: ExtractRun, nowMs: number): LiveJob | null {
  if (!EXTRACT_LIVE.includes(run.status)) return null;
  // A run driven by a kernel job (L29, `run.job`) is live on Runs as THAT job -
  // the job record is the truth for running state (plan §5.4) - so it is not
  // drawn a second time from its manifest, which no longer carries a lease.
  if (run.job !== undefined) return null;
  const startedAt = instant(run.created);
  return {
    source: "extract",
    id: run.id,
    title: `extract ${run.slug}`,
    ...laneOf(run),
    media: "image",
    state: stateOf(run, nowMs),
    ...(startedAt === null ? {} : { startedAt }),
    progress: run.progress,
    ...(run.error === undefined ? {} : { error: run.error }),
    href: HREF,
  };
}

function weirOf({ run, verdicts }: ExtractRun): WeirItem | null {
  // A dry run's images are stand-ins: nothing to cull, and v1's commit refuses it.
  if (!EXTRACT_COMMITTABLE.includes(run.status) || run.styles.length === 0 || run.dry === true) return null;
  const judged = new Set(verdicts.map((v) => v.key));
  const decided = run.styles.filter((s) => judged.has(s.id)).length;
  const since = instant(run.finished);
  return { source: "extract", id: run.id, title: `extract ${run.slug}`, media: "image", kind: "cull", ...(since === null ? {} : { since }), decided, pending: run.styles.length - decided, href: HREF };
}

export function projectExtract(s: ExtractSnapshot, ctx: ProjectCtx): Projection {
  const nowMs = ctx.now.getTime();
  return {
    events: s.runs.flatMap((r) => eventsOf(r, ctx)),
    live: s.runs.map((r) => liveOf(r, nowMs)).filter((j) => j !== null),
    weir: s.runs.map(weirOf).filter((w) => w !== null),
    tally: tallyOf(s.runs),
    skipped: s.skipped,
  };
}

export const extractSource: Source<ExtractSnapshot> = { id: "extract", read, project: projectExtract };
