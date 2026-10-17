import "server-only";

import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";
import type { JobState } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";

import { getCycle, listCycles } from "../../../../lib/foundry/training/store.ts";
import { cycleKind } from "../../../foundry/plant.ts";
import { bump, facts, instant, readEach, seg, words } from "../facts.ts";
import type { IngestEvent, LiveJob, ProjectCtx, Projection, Skipped, Source, WeirItem } from "../types.ts";

// THE DOJO, PROJECTED - foundry-out/training/<id>/cycle.json (written by the
// autonomous training loop, often on another machine) and the gate's
// verdicts.json, read through v1's `listCycles` and `getCycle`.
//
// The Dojo records FEWER instants than the forge, and the projection says so
// rather than inventing them. Recorded: run.start (`at`), run.log (`log[]`),
// commit (the "committed: ..." line lib/foundry/training/store.ts commitCycle
// appends with the commit's own instant - the cycle has no `committed` block).
// Observed at sync (`derived`), because v1 keeps no time for them:
//   judge.pick       one per A/B pair; a pair carries a pick and a reason, never when
//   verdict.keep|reject  the gate's map is `{imp: "approve" | "reject" | null}`,
//                    bare values; keyed by value, so a changed verdict is a new fact
//   run.status / gate.arrive   the status field, rewritten in place;
//                    `awaiting-gate` is the loop parking a pile for the human, so it
//                    is the prototype's `gate.arrive` rather than a status line.
//
// LIVE: the plant's own reading (lib/foundry/plant.ts `cycleKind`: anything
// not gated, failed or committed is live - DojoView.tsx's DOJO_LIVE). The lane
// follows the phase: planning is the agent's text turn (seat.text); generating
// and judging run on the stack the cycle uses, which v1 records only in the
// cycle's id - `-nb-` is the Google stack (Nano Banana + Gemini judge), the
// rest the local stack (Flux 2 + Ollama). The prototype read it the same way
// (docs/next/prototype/app/ledger-data.js); `laneFrom` says so on the row.
//
// THE WEIR: a cycle the gate may commit (DojoView.tsx GATEABLE: awaiting-gate,
// failed - "pairs kept for a manual gate") is a `gate` pile.

const CYCLE_STATUSES = ["planning", "generating", "judging", "awaiting-gate", "committed", "failed"] as const;
const PICK = z.enum(["baseline", "challenger", "tie"]);

const cycleSchema = z.object({
  id: z.string().min(1),
  at: z.string(),
  dimension: z.string(),
  subject: z.string(),
  status: z.enum(CYCLE_STATUSES),
  media: z.enum(["image", "video"]),
  improvements: z.array(
    z.object({
      id: z.string().min(1),
      technique: z.string(),
      // Absent on an improvement the loop planned and never generated: measured
      // 2026-10-15 on this machine's 2026-09-06-state-coupling (status failed),
      // which v1's type calls impossible and the door first skipped whole.
      pairs: z.array(z.object({ id: z.string().min(1), scene: z.string(), judge_pick: PICK, gemini_pick: PICK.optional(), gemini_error: z.string().optional() })).default([]),
    }),
  ),
  fail_streak: z.number().optional(),
  costUsd: z.number().optional(),
  // A bare string is a log line with no instant: measured on the same cycle,
  // whose loop wrote its plan as prose lines. Projected as observed, not skipped.
  log: z.array(z.union([z.object({ at: z.string(), msg: z.string() }), z.string().transform((msg) => ({ at: null, msg }))])),
});
const verdictsSchema = z
  .record(z.string(), z.enum(["approve", "reject"]).nullable())
  .transform((m) => Object.entries(m).flatMap(([key, v]) => (v === null ? [] : [{ key, verdict: v }])));

type Cycle = { readonly cycle: Parsed<z.output<typeof cycleSchema>>; readonly verdicts: Parsed<z.output<typeof verdictsSchema>> };
export type TrainingSnapshot = { readonly cycles: readonly Cycle[]; readonly skipped: readonly Skipped[] };

export const TRAINING_READ_CAP = 500;
/** DojoView.tsx GATEABLE: the statuses commitCycle accepts. */
const GATEABLE: readonly string[] = ["awaiting-gate", "failed"];
/** The prefix of the commit line commitCycle writes (lib/foundry/training/store.ts). */
const COMMIT_LINE = "committed:";

const LOOP: Actor = { kind: "agent", id: "dojo" };
const JUDGE: Actor = { kind: "agent", id: "dojo-judge" };
const OPERATOR: Actor = { kind: "operator", id: "operator" };
// Where a cycle is seen now: the Floor lane of its own medium - its cells the running cycle, its
// Weir the gate (v1's /foundry page retired in Phase 6 wave C and redirects).
const hrefOf = (media: string): string => `/floor?lane=${media}`;

async function read(): Promise<Result<TrainingSnapshot>> {
  let ids: string[];
  try {
    ids = (await listCycles()).slice(0, TRAINING_READ_CAP).map((c) => c.id);
  } catch (e) {
    return err("unavailable", `dojo: listCycles failed: ${words(e)}`, { cause: e });
  }
  const got = await readEach(ids, getCycle);
  const cycles: Cycle[] = [];
  const skipped: Skipped[] = [...got.skipped];
  for (const d of got.items) {
    const cycle = parseAt(`dojo cycle ${d.cycle.id}`, cycleSchema, d.cycle);
    const verdicts = parseAt(`dojo cycle ${d.cycle.id} verdicts`, verdictsSchema, d.verdicts);
    if (!cycle.ok) skipped.push({ id: d.cycle.id, reason: cycle.error.message });
    else if (!verdicts.ok) skipped.push({ id: d.cycle.id, reason: verdicts.error.message });
    else cycles.push({ cycle: cycle.value, verdicts: verdicts.value });
  }
  return ok({ cycles, skipped });
}

/** The stack, from the id, as the prototype read it. */
const stackLane = (id: string): ResourceLane => (id.includes("-nb-") ? "cloud.google" : "gpu.local");
const STACK_RULE = "stack read from the cycle id (-nb- = Google stack), as v1 records no stack";

function eventsOf({ cycle, verdicts }: Cycle, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("dojo", ctx);
  const subject = { kind: "run", id: cycle.id };
  const data: EventData = { runId: cycle.id };
  const out: IngestEvent[] = [
    f.recorded(cycle.id, "run.start", cycle.at, { actor: LOOP, type: "run.start", subject, data: { ...data, dimension: cycle.dimension, subject: cycle.subject, media: cycle.media } }),
    ...f.logged(cycle.id, cycle.log, { actor: LOOP, subject, data }),
  ];
  for (const imp of cycle.improvements) {
    for (const p of imp.pairs) {
      const gemini: EventData = { ...(p.gemini_pick === undefined ? {} : { geminiPick: p.gemini_pick }), ...(p.gemini_error === undefined ? {} : { geminiError: p.gemini_error }) };
      out.push(
        f.observed(cycle.id, `judge.${seg(imp.id)}.${seg(p.id)}`, {
          actor: JUDGE,
          type: "judge.pick",
          subject: { kind: "pair", id: `${cycle.id}/${p.id}` },
          lane: stackLane(cycle.id),
          data: { ...data, improvement: imp.id, scene: p.scene, pick: p.judge_pick, ...gemini },
        }),
      );
    }
  }
  if (cycle.status === "awaiting-gate") out.push(f.observed(cycle.id, "status.awaiting-gate", { actor: LOOP, type: "gate.arrive", subject, data: { ...data, improvements: cycle.improvements.length } }));
  else if (cycle.status !== "committed") out.push(f.observed(cycle.id, `status.${cycle.status}`, { actor: LOOP, type: "run.status", subject, data: { ...data, status: cycle.status } }));
  for (const v of verdicts) {
    const type = v.verdict === "approve" ? "verdict.keep" : "verdict.reject";
    out.push(f.observed(cycle.id, `verdict.${seg(v.key)}.${v.verdict}`, { actor: OPERATOR, type, subject: { kind: "improvement", id: `${cycle.id}/${v.key}` }, data: { ...data, verdict: v.verdict } }));
  }
  if (cycle.status === "committed") {
    const line = cycle.log.findLast((l) => l.msg.startsWith(COMMIT_LINE) && l.at !== null);
    const commit = { actor: OPERATOR, type: "commit", subject, data: { ...data, ...(line === undefined ? {} : { note: line.msg }) } };
    out.push(line === undefined ? f.observed(cycle.id, "commit", commit) : f.recorded(cycle.id, "commit", line.at, commit));
  }
  return out;
}

function tallyOf(cycles: readonly Cycle[]): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const { cycle, verdicts } of cycles) {
    bump(records, `run.${cycle.status}`);
    bump(fs, "run.start");
    bump(fs, "run.log", cycle.log.length);
    bump(fs, "judge.pick", cycle.improvements.reduce((n, i) => n + i.pairs.length, 0));
    if (cycle.status === "awaiting-gate") bump(fs, "gate.arrive");
    else if (cycle.status !== "committed") bump(fs, "run.status");
    for (const v of verdicts) bump(fs, v.verdict === "approve" ? "verdict.keep" : "verdict.reject");
    if (cycle.status === "committed") bump(fs, "commit");
  }
  return { records, facts: fs };
}

function liveOf({ cycle }: Cycle): LiveJob | null {
  if (cycleKind(cycle.status) !== "live") return null;
  const startedAt = instant(cycle.at);
  const lane = cycle.status === "planning" ? { lane: "seat.text" as const } : { lane: stackLane(cycle.id), laneFrom: STACK_RULE };
  const state: JobState = "running";
  return {
    source: "dojo",
    id: cycle.id,
    title: `dojo ${cycle.subject} · ${cycle.id}`,
    ...lane,
    media: cycle.media,
    state,
    ...(startedAt === null ? {} : { startedAt }),
    href: hrefOf(cycle.media),
  };
}

function weirOf({ cycle, verdicts }: Cycle): WeirItem | null {
  if (!GATEABLE.includes(cycle.status) || cycle.improvements.length === 0) return null;
  const decided = new Set(verdicts.map((v) => v.key));
  const n = cycle.improvements.filter((i) => decided.has(i.id)).length;
  return { source: "dojo", id: cycle.id, title: `dojo ${cycle.subject} · ${cycle.id}`, media: cycle.media, kind: "gate", decided: n, pending: cycle.improvements.length - n, href: hrefOf(cycle.media) };
}

export function projectTraining(s: TrainingSnapshot, ctx: ProjectCtx): Projection {
  return {
    events: s.cycles.flatMap((c) => eventsOf(c, ctx)),
    live: s.cycles.map(liveOf).filter((j) => j !== null),
    weir: s.cycles.map(weirOf).filter((w) => w !== null),
    tally: tallyOf(s.cycles),
    skipped: s.skipped,
  };
}

export const trainingSource: Source<TrainingSnapshot> = { id: "dojo", read, project: projectTraining };
