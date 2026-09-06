// LANE — CANCEL/SETTLE SYMMETRY (dynamic).
//
// WHAT WAS WRONG. lib/jobs.tsx states the rule in `settle`'s own docstring: a
// job that is not `running` is not touched, "so a late resolve after a cancel
// cannot resurrect it". `cancel` did not hold the mirror of it. It found the
// job by id and rewrote it to `failed` / "Stopped by you." whatever its status
// was — so a run that had already settled `done`, with its results on the
// notebook and "Research returned" already in the bell, could be relabelled a
// failure by a stop pressed a beat too late.
//
// The race is not hypothetical and it has exactly one caller:
// app/_phases/research/guided/useEducationalResearch.ts reads `run.jobId` and
// then calls `jobs.cancel(live)`. Between the read and the call the run can
// settle. The tray then contradicts the notebook, and the notebook is right.
//
// WHAT THIS PROBE DRIVES. `applyCancel` — the transition itself, lifted out of
// the provider's `useCallback` so it is reachable at all. The guard used to be
// unwritable as a claim in either lane: the Node lane has no renderer for a
// React provider, and the live lane's header refuses assertions a probe could
// witness. Extracting the reducer is what turns "read the diff and agree" into
// a measurement, which for a one-line guard is the difference between a real
// instrument and a source ratchet that only proves somebody typed the words.
//
// WHAT IT DOES NOT COVER: the `live.current` slot release and the early return
// in the `cancel` callback around it. Those need the provider. What they guard
// is stated where they sit — `finish` has already released the slot of anything
// that left `running`, so the release skipped here was always a second one.
import { test, expect } from "@playwright/test";

import { applyCancel, type Job, type JobStatus } from "@/lib/jobs";

const AT = 1_700_000_000_000;

function job(id: string, status: JobStatus, extra: Partial<Job> = {}): Job {
  return {
    id,
    projectId: "p1",
    kind: "research",
    label: "why do stars twinkle",
    status,
    startedAt: AT,
    progress: 0,
    measured: false,
    ...(status === "running" ? {} : { endedAt: AT + 1000 }),
    ...extra,
  };
}

/** Every status a job can be in, as a TOTAL record rather than an array: a
 *  sixth status added to `JobStatus` fails typecheck on this line instead of
 *  quietly falling outside a hand-listed set. */
const ALL_STATUSES: Record<JobStatus, true> = {
  running: true,
  done: true,
  failed: true,
  interrupted: true,
};
const SETTLED = (Object.keys(ALL_STATUSES) as JobStatus[]).filter((s) => s !== "running");

test("a running job is still cancelled, exactly as before", () => {
  const before = [job("a", "running"), job("b", "done")];
  const after = applyCancel(before, "a");
  const cancelled = after.find((j) => j.id === "a")!;
  expect(cancelled.status).toBe("failed");
  expect(cancelled.error).toBe("Stopped by you.");
  expect(cancelled.endedAt).toBeGreaterThan(0);
  console.log(`[cancel] running -> ${cancelled.status} / ${cancelled.error}`);
});

test("a SETTLED job is not relabelled by a late cancel", () => {
  for (const status of SETTLED) {
    const original = job("a", status, status === "done" ? {} : { error: "the model timed out" });
    const after = applyCancel([original], "a");
    const seen = after.find((j) => j.id === "a")!;
    console.log(`[cancel] ${status} -> ${seen.status} / ${seen.error ?? "(no error)"}`);
    // The status the job actually reached is the truth. "Stopped by you." over a
    // `done` run is the tray telling the creator their results are not there,
    // while the notebook shows them.
    expect(seen.status).toBe(status);
    // ...and it must not acquire a cancellation message either. A `done` job has
    // no error at all; a job that failed for a real reason keeps that reason,
    // which is the one the creator needs.
    expect(seen.error).toBe(original.error);
    expect(seen.endedAt).toBe(original.endedAt);
  }
});

test("a no-op cancel does not churn identity", () => {
  // Referential equality, not deep equality: a memoised tray row compares on
  // identity, and a "no-op" that hands back a fresh object re-renders every
  // settled job in the list on every late stop.
  const original = job("a", "done");
  const list = [original];
  const after = applyCancel(list, "a");
  expect(after[0]).toBe(original);
});

test("cancel touches only the job it names", () => {
  const others = [job("b", "running"), job("c", "done"), job("d", "interrupted")];
  const list = [job("a", "running"), ...others];
  const after = applyCancel(list, "a");
  for (const o of others) expect(after.find((j) => j.id === o.id)).toBe(o);
  // An id nobody holds changes nothing at all.
  const missing = applyCancel(list, "zzz");
  for (const j of list) expect(missing.find((x) => x.id === j.id)).toBe(j);
});

test("cancel and settle refuse on the SAME predicate", () => {
  // The symmetry is the point, and it is what was broken: `settle` refused a
  // non-running job and `cancel` did not. Asserted here as a property over the
  // whole status union rather than as a sentence in a comment, so a future
  // status is forced through both branches.
  for (const status of Object.keys(ALL_STATUSES) as JobStatus[]) {
    const original = job("a", status);
    const changed = applyCancel([original], "a")[0] !== original;
    expect(changed).toBe(status === "running");
  }
});
