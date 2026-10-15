import "server-only";

import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";

import { getRun, listRuns } from "../../../../lib/foundry/store.ts";
import { COMMITTABLE, LIVE } from "../../../foundry/plant.ts";
import { bump, facts, instant, readEach, seg, words } from "../facts.ts";
import type { IngestEvent, LiveJob, ProjectCtx, Projection, Skipped, Source, WeirItem } from "../types.ts";

// THE FORGE, PROJECTED - foundry-out/runs/<id>/run.json (written by
// pipeline/foundry/forge.py) and the cull's verdicts.json (lib/foundry/store.ts,
// lib/foundry/verdictLog.ts), read through v1's own `listRuns` and `getRun`.
//
// What is event-grade here, and so becomes an event with a recorded instant:
//   run.start         `created`, written once by forge.py
//   run.log           each `log[]` line (forge.py appends; never rewrites)
//   candidate.grade   each candidate's `grade.at` (stamped once per grade)
//   run.end           `finished`
//   verdict.keep|reject  each verdict record's `at`; a changed verdict has a new
//                     `at`, so it is a NEW key and the old one stays as history
//   commit            `committed.at` (lib/foundry/store.ts commitRun)
// What is a snapshot, and so only "observed by this sync" (`derived`):
//   run.status        the status field, which forge.py rewrites in place. Not
//                     emitted for `created` (that is run.start) or `committed`
//                     (that is commit, which carries its own instant).
// Dropped, with the reason: candidate generation has no timestamp (only a
// duration in `timings`), so there is no `candidate.mint` - the prototype drew
// one at an invented time (ledger-data.js), which decision 3 forbids. A cleared
// verdict leaves no trace in verdicts.json; its history is in
// verdicts.log.jsonl, which lib/ has no reader for yet (a Phase 3 seam).
//
// v1 READS BY CAST (`readJson<T>` is `JSON.parse(...) as T`). The adapter
// reads through a door instead: the fields it projects are parsed per record,
// and a manifest that has drifted from them is skipped with the door's words,
// not projected as `undefined`.

const RUN_STATUSES = ["created", "annotating", "generating", "grading", "done", "incomplete", "failed", "committed"] as const;

const manifestSchema = z.object({
  id: z.string().min(1),
  created: z.string(),
  finished: z.string().optional(),
  status: z.enum(RUN_STATUSES),
  progress: z.object({ stage: z.string(), done: z.number(), total: z.number() }),
  candidates: z.array(
    z.object({
      id: z.string().min(1),
      status: z.string(),
      deleted: z.boolean().optional(),
      grade: z
        .object({
          at: z.string(),
          grader: z.string(),
          grader_digest: z.string().optional(),
          craft: z.object({ score: z.number().nullable() }).nullable(),
          style: z.object({ score: z.number().nullable() }).nullable(),
        })
        .nullable(),
    }),
  ),
  log: z.array(z.object({ at: z.string(), msg: z.string() })),
  error: z.string().optional(),
  committed: z.object({ at: z.string(), deleted: z.number(), kept: z.number(), undecided: z.number() }).optional(),
});
// Keyed by candidate id in v1; an array of entries here, so an absent key is not a possibly-undefined value.
const verdictsSchema = z
  .record(z.string(), z.object({ verdict: z.enum(["keep", "reject"]), at: z.string(), note: z.string().optional(), by: z.enum(["human", "model"]).optional() }))
  .transform((m) => Object.entries(m).map(([key, v]) => ({ key, ...v })));

type ForgeRun = { readonly run: Parsed<z.output<typeof manifestSchema>>; readonly verdicts: Parsed<z.output<typeof verdictsSchema>> };
export type ForgeSnapshot = { readonly runs: readonly ForgeRun[]; readonly skipped: readonly Skipped[] };

/** The most runs one read takes, newest first: a sync is bounded even over years of runs. */
export const FORGE_READ_CAP = 500;

const FORGE: Actor = { kind: "machine", id: "forge" };
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const CULL_MODEL: Actor = { kind: "agent", id: "forge-cull-model" };
const HREF = "/foundry";

/** v1's reader, through the door. A failed listing fails the source; a failed record is skipped. */
async function read(): Promise<Result<ForgeSnapshot>> {
  let ids: string[];
  try {
    ids = (await listRuns()).slice(0, FORGE_READ_CAP).map((r) => r.id);
  } catch (e) {
    return err("unavailable", `forge: listRuns failed: ${words(e)}`, { cause: e });
  }
  const got = await readEach(ids, getRun);
  const runs: ForgeRun[] = [];
  const skipped: Skipped[] = [...got.skipped];
  for (const d of got.items) {
    const run = parseAt(`forge run ${d.run.id}`, manifestSchema, d.run);
    const verdicts = parseAt(`forge run ${d.run.id} verdicts`, verdictsSchema, d.verdicts);
    if (!run.ok) skipped.push({ id: d.run.id, reason: run.error.message });
    else if (!verdicts.ok) skipped.push({ id: d.run.id, reason: verdicts.error.message });
    else runs.push({ run: run.value, verdicts: verdicts.value });
  }
  return ok({ runs, skipped });
}

function eventsOf(r: ForgeRun, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("forge", ctx);
  const { run } = r;
  const subject = { kind: "run", id: run.id };
  const data: EventData = { runId: run.id };
  const out: IngestEvent[] = [
    f.recorded(run.id, "run.start", run.created, { actor: FORGE, type: "run.start", subject, lane: "gpu.local", data }),
    ...f.logged(run.id, run.log, { actor: FORGE, subject, lane: "gpu.local", data }),
  ];
  for (const c of run.candidates) {
    if (c.grade === null) continue;
    const scores: EventData = { craft: c.grade.craft?.score ?? null, style: c.grade.style?.score ?? null, grader: c.grade.grader };
    out.push(
      f.recorded(run.id, `grade.${seg(c.id)}.${c.grade.at}`, c.grade.at, {
        actor: { kind: "machine", id: c.grade.grader },
        type: "candidate.grade",
        subject: { kind: "candidate", id: `${run.id}/${c.id}` },
        lane: "gpu.local",
        data: { ...data, ...scores, ...(c.grade.grader_digest === undefined ? {} : { graderDigest: c.grade.grader_digest }) },
      }),
    );
  }
  if (run.finished !== undefined) out.push(f.recorded(run.id, "run.end", run.finished, { actor: FORGE, type: "run.end", subject, lane: "gpu.local", data: run.error === undefined ? data : { ...data, error: run.error } }));
  if (run.status !== "created" && run.status !== "committed") {
    out.push(f.observed(run.id, `status.${run.status}`, { actor: FORGE, type: "run.status", subject, data: { ...data, status: run.status } }));
  }
  for (const v of r.verdicts) {
    out.push(
      f.recorded(run.id, `verdict.${seg(v.key)}.${v.verdict}.${v.at}`, v.at, {
        actor: v.by === "model" ? CULL_MODEL : OPERATOR,
        type: `verdict.${v.verdict}`,
        subject: { kind: "candidate", id: `${run.id}/${v.key}` },
        data: v.note === undefined ? data : { ...data, note: v.note },
      }),
    );
  }
  if (run.committed !== undefined) {
    const { at, ...counts } = run.committed;
    out.push(f.recorded(run.id, "commit", at, { actor: OPERATOR, type: "commit", subject, data: { ...data, ...counts } }));
  }
  return out;
}

/** Counted from the manifest directly, never from `eventsOf` (types.ts says why). */
function tallyOf(runs: readonly ForgeRun[]): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const { run, verdicts } of runs) {
    bump(records, `run.${run.status}`);
    bump(fs, "run.start");
    bump(fs, "run.log", run.log.length);
    bump(fs, "candidate.grade", run.candidates.filter((c) => c.grade !== null).length);
    if (run.finished !== undefined) bump(fs, "run.end");
    if (run.status !== "created" && run.status !== "committed") bump(fs, "run.status");
    for (const v of verdicts) bump(fs, `verdict.${v.verdict}`);
    if (run.committed !== undefined) bump(fs, "commit");
  }
  return { records, facts: fs };
}

/** LIVE is the /foundry page's own set (lib/foundry/plant.ts), so Runs and v1 agree by construction. */
function liveOf({ run }: ForgeRun): LiveJob | null {
  if (!LIVE.includes(run.status)) return null;
  const startedAt = instant(run.created);
  return {
    source: "forge",
    id: run.id,
    title: `forge ${run.id}`,
    lane: "gpu.local",
    media: "image",
    // `created` is a run forge.py has written but not begun: it waits for the card.
    state: run.status === "created" ? "queued" : "running",
    ...(startedAt === null ? {} : { startedAt }),
    progress: run.progress,
    href: HREF,
  };
}

/** A run the cull may commit (COMMITTABLE, the same set commitRun enforces) is a pile on the Weir. */
function weirOf({ run, verdicts }: ForgeRun): WeirItem | null {
  if (!COMMITTABLE.includes(run.status)) return null;
  const plates = run.candidates.filter((c) => c.status !== "pending" && c.status !== "failed" && c.deleted !== true);
  if (plates.length === 0) return null;
  const judged = new Set(verdicts.map((v) => v.key));
  const decided = plates.filter((c) => judged.has(c.id)).length;
  const since = instant(run.finished);
  return { source: "forge", id: run.id, title: `forge ${run.id}`, media: "image", kind: "cull", ...(since === null ? {} : { since }), decided, pending: plates.length - decided, href: HREF };
}

export function projectForge(s: ForgeSnapshot, ctx: ProjectCtx): Projection {
  return {
    events: s.runs.flatMap((r) => eventsOf(r, ctx)),
    live: s.runs.map(liveOf).filter((j) => j !== null),
    weir: s.runs.map(weirOf).filter((w) => w !== null),
    tally: tallyOf(s.runs),
    skipped: s.skipped,
  };
}

export const forgeSource: Source<ForgeSnapshot> = { id: "forge", read, project: projectForge };
