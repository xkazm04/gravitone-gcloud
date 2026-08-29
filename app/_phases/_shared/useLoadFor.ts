"use client";

// LOADING SOMETHING FOR A KEY, WITHOUT APPLYING IT TO THE WRONG ONE.
//
// Fourteen effects in this app opened with `let alive = true`, awaited something,
// checked the flag, set state and returned a cleanup that flipped it. They were
// byte-identical, and they were arrived at separately — the reasoning was
// rediscovered and retyped at each site, which is the failure this file exists to
// stop. `research/useScope.ts` even wrote down WHY the hydration flag has to be
// keyed to the project rather than reset in the effect body, and that argument had
// to be repeated in `research/beats/useBeatPicks.ts` and again in `cut/CutTimeline.tsx`.
//
// The lesson is cheap to state and expensive to keep relearning: a load is issued
// for a KEY, and by the time it lands, the key may have changed or the component
// may be gone. Both are the same bug — a result applied to something that did not
// ask for it — and both are invisible in testing, because the fast case always
// wins locally.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It covers the dominant shape: one load, one
// key, apply the result. It is NOT a data-fetching layer and it does not own
// caching, retries, deduping or error taxonomy — those belong to the callers that
// already have opinions about them (`stepStore`'s ReadOutcome, `useFrames`'
// separation of read-failure from operation-failure). Three call sites in this
// repository do something genuinely different and are LEFT ALONE on purpose:
//
//   · `script/trailer/useTrailerCut.ts` — a branching two-stage load (try the
//     saved cut, else compose one from the confirmed picks) with two distinct
//     guard points. Flattening it into one `load` would hide the branch that is
//     the entire logic of the hook.
//   · `script/useVersions.ts` — carries an AbortController as well, because it
//     can cancel a model turn in flight rather than merely ignore its answer.
//     Ignoring a result and cancelling the work that produces it are different
//     acts and cost different money.
//   · `frames/useFrames.ts` — separates a read failure from an operation failure
//     into two distinct fields a surface renders differently, and gates its save
//     on both. `useStepFor` below takes the half of that lesson which every
//     surface needs (never hydrate on a failed read); the other half — telling
//     the user WHICH failed, and in what words — stays where it is earned.
//
// A primitive whose adoption has to be argued site by site is doing its job. One
// that every site is forced through has stopped being a primitive and become a
// framework.

import { useEffect, useRef, useState } from "react";

import { readStep } from "./stepStore";

/**
 * Load something for `key`, and apply it only if `key` is still the one being
 * asked about and this component is still mounted.
 *
 * Returns whether the CURRENT key has been hydrated — not a bare boolean flag.
 * That difference is load-bearing and was found the expensive way (see
 * `research/useScope.ts`): a boolean stays true for one commit after the key
 * changes, and that commit is exactly the window a save effect runs in, so it
 * writes the previous key's data onto the new key. `hydratedFor === key` cannot
 * express that state at all.
 *
 * `load` and `apply` are read from refs, so a caller may pass inline closures
 * without re-issuing the load on every render. The refs are written in an effect
 * and never during render — `react-hooks/refs` objects to the render-phase form,
 * and `script/trailer/BeatEditor.tsx` records why it is right to.
 *
 * `apply` MAY RETURN `false` to mean "this result must not count as hydrated".
 * That exists for one specific and expensive case: a load that FAILED rather than
 * found nothing. Marking hydrated on a failed read is what lets the caller's save
 * effect fire and write its empty initial state over a record that is still on
 * disk — the failure `frames/useFrames.ts` describes as a whole cut destroyed by
 * a transient quota error nobody saw. Returning `false` leaves the surface
 * un-hydrated, which is honest: nothing was read, so nothing may be written.
 * See `useStepFor` below, which is this rule applied to the step store.
 */
export function useLoadFor<T>(
  key: string,
  load: (key: string) => Promise<T>,
  apply: (value: T, key: string) => boolean | void,
): boolean {
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  const loadRef = useRef(load);
  const applyRef = useRef(apply);
  useEffect(() => {
    loadRef.current = load;
    applyRef.current = apply;
  });

  useEffect(() => {
    let alive = true;
    void loadRef.current(key).then((value) => {
      // The one check, in the one place. `alive` covers unmount; re-running the
      // effect on a key change flips the previous run's flag before the new one
      // starts, so a slow load for the old key cannot land on the new one.
      if (!alive) return;
      if (applyRef.current(value, key) === false) return;
      setHydratedFor(key);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  return hydratedFor === key;
}

/**
 * `useLoadFor` over the step store, reading HONESTLY.
 *
 * Every hydrating surface in this app reached for `loadStep`, which returns the
 * seeded default both when nothing was ever written AND when the read failed.
 * The store says so itself and names the alternative: "a caller that needs to
 * tell the two apart calls `readStep` instead". Exactly one caller did
 * (`frames/useFrames.ts`), and it wrote down what the other seven were risking —
 * a failed read presents as an empty record, the surface marks itself hydrated,
 * its save effect fires, and the empty state lands on top of work that was still
 * on disk a moment ago. A transient quota error is enough.
 *
 * So the honest read is the DEFAULT here rather than the expert option. A failed
 * read returns `false` from `apply` and the surface stays un-hydrated: nothing
 * was read, so nothing may be written, and the trouble is already on its way to
 * the bell through the store's own channel. A never-written key still hydrates
 * with `undefined`, because that is a real answer and the caller's `?? {}`
 * fallbacks are the right response to it.
 */
export function useStepFor<T>(
  projectId: string,
  phase: string,
  apply: (data: T | undefined) => void,
): boolean {
  return useLoadFor(
    `${projectId}:${phase}`,
    () => readStep<T>(projectId, phase),
    (outcome) => {
      if (!outcome.ok) return false;
      apply(outcome.data);
    },
  );
}
