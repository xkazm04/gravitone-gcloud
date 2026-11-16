import type { Store } from "@gt/kernel/store";

import { storyboardJobId } from "../../producers/scoutStoryboard.ts";
import { followEpisodes } from "./episodeMoves";
import { mutateNight, withCandidate } from "./store";
import type { Candidate, Night } from "./types";

// A NIGHT THAT DIED BEFORE IT HAD A PLAN (perfect 2026-11-08, held-lanes-dead-nights). The seat opens a night with
// an `until` and writes a plan before ending its turn; a seat that died first leaves a night that is open, past its
// until, with no plan - and the tick only ever looked at nights with a plan, so it stayed open for good, its
// pending candidates pending, and the episodes they had taken stayed in production. The tick now closes such a night
// the way the deadline always closes one (./acts.ts closeAct, stop `deadline`), and this file settles what it left.
//
// WHICH PENDING CANDIDATES ARE FAILED. Only one whose job is provably not coming back, by the kernel's own record:
//
//   job absent       the launch never enqueued it (a storyboard's job id is derived from the night and the candidate,
//                    so its absence is a fact; another kind's absence is not, and that candidate is left)
//   job failed       a known outcome, a retry has not taken it
//   job cancelled    the operator ended it
//
// Left alone and reported: a job still queued, planned, running or paused (alive: the worker will settle it), an
// INTERRUPTED one (an unknown outcome - a paid step may have died unbooked; the lane holds it and only the operator
// looks), and a DONE one (it rendered; the candidate wants a collect, and failing it would throw a real render away).
// Failing is the candidate's own `failed` with a sentence; followEpisodes (./episodeMoves.ts) then frees the episode
// each held, as it does for every failed candidate.

const ALIVE = new Set(["queued", "planned", "running", "paused"]);

export type DeadNightSettled = { readonly failed: readonly string[]; readonly left: readonly string[] };

const stateOf = (store: Store, jobId: string): string | undefined => {
  const got = store.read((r) => r.get("SELECT state FROM jobs WHERE id = ?", jobId)?.["state"]);
  if (!got.ok) throw got.error;
  return typeof got.value === "string" ? got.value : undefined;
};

/** What a pending candidate's job says of it: a sentence to fail it with, or why it is left alone. */
function verdict(store: Store, n: Night, c: Candidate): { readonly fail: string } | { readonly leave: string } {
  const jobId = c.jobId ?? (c.kind === "storyboard" ? storyboardJobId({ nightId: n.id, candidateId: c.id }) : undefined);
  if (jobId === undefined) return { leave: `${c.id}: no job is recorded for it, so whether one is alive cannot be told` };
  let state: string | undefined;
  try {
    state = stateOf(store, jobId);
  } catch (e) {
    return { leave: `${c.id}: its job ${jobId} did not read (${e instanceof Error ? e.message : String(e)})` };
  }
  const why = `the night died: its until ${n.deadline ?? ""} passed with no plan`;
  if (state === undefined) return c.kind === "storyboard" ? { fail: `${why}, and its job was never launched` } : { leave: `${c.id}: job ${jobId} is not in the kernel, and a ${c.kind} may have been launched without it` };
  if (state === "failed" || state === "cancelled") return { fail: `${why}, and its job ${jobId} ${state}` };
  return { leave: `${c.id}: job ${jobId} is ${ALIVE.has(state) ? "still alive" : state === "interrupted" ? "interrupted (an unknown outcome: look before anything resumes it)" : state}` };
}

/** Fail the dead night's stranded pending candidates, then free their episodes. Never throws for one candidate's sake. */
export async function settleDeadNight(store: Store, n: Night): Promise<DeadNightSettled> {
  const fails = new Map<string, string>();
  const left: string[] = [];
  for (const c of n.candidates) {
    if (c.status !== "pending") continue;
    const v = verdict(store, n, c);
    if ("fail" in v) fails.set(c.id, v.fail);
    else left.push(v.leave);
  }
  if (fails.size > 0) {
    await mutateNight(n.id, (cur) => {
      let next = cur;
      for (const c of cur.candidates) {
        const why = fails.get(c.id);
        if (why !== undefined && c.status === "pending") next = withCandidate(next, { ...c, status: "failed", error: why });
      }
      return next;
    });
    await followEpisodes(n.id, [...fails.keys()]);
  }
  return { failed: [...fails.keys()], left };
}
