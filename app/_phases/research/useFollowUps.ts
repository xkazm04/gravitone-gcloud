"use client";

// The follow-up queue's record, held ABOVE REACT — the same shape as
// run/useResearchRun.ts, and for the same reason.
//
// It used to be `useState` inside FollowUpQueue, which made the queue's whole
// memory mount-scoped. The queue draws on the Board tab only, and StudioView
// renders one step at a time, so switching tab or step tore the record down: an
// unmount cleanup settled any live dispatch `interrupted`, and every result
// already returned went with it, silently. The queue was the one piece of work
// in this step that could not survive navigating away from it — on a step whose
// stated promise, in its own header, is that work survives navigating away.
//
// At DISPATCH_MS = 700 the losing window is narrow. It is not the measure of the
// bug: FollowUpQueue's note says a real dispatch replaces that timeout and
// nothing else in the file changes, so today's fixture is the only reason this
// looks small. And the RESULTS were lost on any navigation whatever the timing.
//
// One record per project — two projects' follow-ups are independent, exactly as
// two projects' runs are. Session-lived, like the run: nothing here is written
// to disk, and a reload starts clean, which is what `lib/jobs` already tells the
// user happened.

import { useCallback, useSyncExternalStore } from "react";

import type { FollowUpRequest } from "./followup";

/** Stable identity — `useSyncExternalStore` compares snapshots by reference, so
 *  the empty case must not be a fresh array each read. */
const NONE: readonly FollowUpRequest[] = [];

const records = new Map<string, readonly FollowUpRequest[]>();
const subs = new Map<string, Set<() => void>>();

const read = (key: string): readonly FollowUpRequest[] => records.get(key) ?? NONE;

function write(key: string, next: readonly FollowUpRequest[]) {
  records.set(key, next);
  subs.get(key)?.forEach((f) => f());
}

function subscribe(key: string, f: () => void) {
  let set = subs.get(key);
  if (!set) {
    set = new Set();
    subs.set(key, set);
  }
  set.add(f);
  return () => void set!.delete(f);
}

/** The project's follow-up requests, and the updater that moves them. Shaped
 *  like `useState`'s functional form so the call sites read the same as before. */
export function useFollowUps(projectId: string) {
  const asked = useSyncExternalStore(
    useCallback((f: () => void) => subscribe(projectId, f), [projectId]),
    useCallback(() => read(projectId), [projectId]),
    () => NONE,
  );

  const update = useCallback(
    (fn: (prev: readonly FollowUpRequest[]) => readonly FollowUpRequest[]) =>
      write(projectId, fn(read(projectId))),
    [projectId],
  );

  return [asked, update] as const;
}
