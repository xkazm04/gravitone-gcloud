// PART AND RUN STATE, DERIVED - zod-free, so the Plan's client and the kernel read one rule.
//
// A part's state is never stored (COMMON decision on records): it is a function of its job, its
// gate packet and its upstream parts, computed at read. v1 kept two stores of the same fact - the
// job's state in lib/jobs.tsx and the step's `progress` in lib/projects.ts, written by the surface
// that happened to watch - and they disagreed whenever a tab closed mid-run. One function over
// facts that are each written once cannot disagree with itself.

import type { JobState } from "./job.machine.ts";
import type { PartState } from "./part.machine.ts";
import type { ProjectState } from "./project.machine.ts";
import type { RunState } from "./run.machine.ts";

/** What a gate's Board packet says, when it has one. */
export type PacketFact = "open" | "committed" | "rejected";

export type PartFacts = {
  /** The part's job state, when it has a job (a launched work part). */
  readonly job?: JobState;
  /** A gate's packet. */
  readonly packet?: PacketFact;
  /** A slot placed on the calendar. */
  readonly slotted?: boolean;
};

export type PlanNode = { readonly id: string; readonly kind: string; readonly after: readonly string[] };

const STUCK: ReadonlySet<PartState> = new Set<PartState>(["failed", "blocked", "paused"]);

/** A job's state in the Plan's words (part.machine.ts). Interrupted and cancelled are `failed`:
 *  both need the operator before anything after them moves. */
function ofJob(job: JobState): PartState {
  switch (job) {
    case "planned":
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "paused":
      return "paused";
    case "done":
      return "ratified";
    case "failed":
    case "interrupted":
    case "cancelled":
      return "failed";
  }
}

/**
 * Every part's state, in plan order. Unlaunched: all `draft`. Launched:
 *   work part      its job's state; a `planned` job (enqueued at launch, waiting for its upstream)
 *                  reads `queued`, or `blocked` when that upstream is stuck (failed, blocked,
 *                  paused - the prototype's `blockedBy`);
 *   gate           `awaiting_gate` once the part it judges is ratified and its packet is not
 *                  committed; `ratified` on commit, `failed` on reject;
 *   slot           `awaiting_gate` once everything before it is ratified, until it is placed.
 */
export function partStatesOf(nodes: readonly PlanNode[], facts: ReadonlyMap<string, PartFacts>, launched: boolean): Map<string, PartState> {
  const out = new Map<string, PartState>();
  if (!launched) {
    for (const n of nodes) out.set(n.id, "draft");
    return out;
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visit = (id: string): PartState => {
    const known = out.get(id);
    if (known !== undefined) return known;
    const n = byId.get(id);
    if (n === undefined) return "blocked";
    out.set(id, "blocked"); // a cycle (refused at the door) reads blocked instead of recursing forever
    const ups = n.after.map(visit);
    const upStuck = ups.some((s) => STUCK.has(s));
    const upDone = ups.every((s) => s === "ratified");
    const f = facts.get(id) ?? {};
    let s: PartState;
    if (n.kind === "gate" || n.kind === "slot") {
      if (!upDone) s = upStuck ? "blocked" : "queued";
      else if (n.kind === "slot") s = f.slotted === true ? "ratified" : "awaiting_gate";
      else s = f.packet === "committed" ? "ratified" : f.packet === "rejected" ? "failed" : "awaiting_gate";
    } else if (f.job === undefined) {
      s = upStuck ? "blocked" : "queued";
    } else if (f.job === "planned") {
      s = upStuck ? "blocked" : "queued";
    } else {
      s = ofJob(f.job);
    }
    out.set(id, s);
    return s;
  };
  for (const n of nodes) visit(n.id);
  return new Map(nodes.map((n) => [n.id, out.get(n.id) ?? "blocked"]));
}

/** A Floor run's state from its job and its pile's packet (run.machine.ts words). */
export function runStateOf(job: JobState, packet?: PacketFact): RunState {
  switch (job) {
    case "planned":
    case "queued":
    case "paused":
      return "queued";
    case "running":
      return "running";
    case "done":
      return packet === "committed" ? "ratified" : packet === "rejected" ? "blocked" : "awaiting_gate";
    case "failed":
    case "interrupted":
      return "blocked";
    case "cancelled":
      return "cancelled";
  }
}

/** The weakest source among figures: one illustrative figure makes a sum illustrative. */
export function weakest(srcs: Iterable<"real" | "model" | "illustrative">): "real" | "model" | "illustrative" {
  let w: "real" | "model" | "illustrative" = "real";
  for (const s of srcs) {
    if (s === "illustrative") return s;
    if (s === "model") w = "model";
  }
  return w;
}

/**
 * A project's state from its parts' - the prototype's precedence, kept: anything stuck outranks
 * anything at the Weir, which outranks anything running. One change: a `paused` part counts as
 * waiting (queued). The prototype let it fall through to `draft`, so pausing the last open part of
 * a launched project read as an unlaunched plan.
 */
export function projectStateOf(parts: readonly { readonly state: PartState }[]): ProjectState {
  const has = (...s: PartState[]) => parts.some((p) => s.includes(p.state));
  if (has("failed", "blocked")) return "blocked";
  if (has("awaiting_gate")) return "awaiting_gate";
  if (has("running")) return "running";
  if (parts.length > 0 && parts.every((p) => p.state === "ratified")) return "ratified";
  if (has("queued", "paused")) return "queued";
  return "draft";
}
