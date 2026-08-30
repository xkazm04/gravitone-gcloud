"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { saveStep, type ScopeStepData } from "../_shared/stepStore";
import { useStepFor } from "../_shared/useLoadFor";
import { buildCards, scopeDiffs, scopeSummary, stateOf, type Card, type Scope } from "./scope";

const PHASE = "research-scope";

/** Scope state for a project.
 *
 *  WHAT CONFIRMING ACTUALLY DOES, corrected. This comment used to say the
 *  Script step reads the confirmed scope and never a live one. It does not, and
 *  it never did: `ScriptStep` calls this hook and every consumer of it —
 *  `_matrix/{MatrixCoverage,MatrixSpend,MatrixTracks,shared}` — reads
 *  `stateOf(api.scope, …)`. Nothing outside this directory has ever read
 *  `confirmed`.
 *
 *  And the promise cannot simply be honoured where it stands, because Step 2 is
 *  not a reader. `_matrix/shared.tsx`'s ScopePip DESCOPES FROM THE MATRIX, into
 *  this same record, on purpose ("this is not a Step 2 shadow copy"). Pointing
 *  the matrix at a frozen snapshot would leave that control clicking against a
 *  document nothing on screen renders — a worse failure than the one it fixes,
 *  and an invented mechanism on top of a false claim.
 *
 *  So the claim is cut and `confirmed` is given the job it can actually do: it
 *  is a CHECKPOINT. It records what the board said when the creator declared it
 *  settled, and `diverged` reports every card that has moved since — which was
 *  invisible before, on both steps. The same treatment `followup.ts` gives an
 *  effect it cannot apply, for the same reason.
 *
 *  PERSISTED, and shared by both steps. It used to be per-mount React state,
 *  which meant Step 2 mounting its own copy would have shown an empty scope
 *  while Step 1 showed the real one — and any scope control in Step 2 would have
 *  been writing to a document nobody else could see. A decision the creator made
 *  on the triage board has to still be true when they open the matrix. */
export function useScope(projectId: string) {
  const cards = useMemo(() => buildCards(), []);
  const [scope, setScope] = useState<Scope>({});
  const [confirmed, setConfirmed] = useState<Scope | null>(null);

  // Keyed to the project rather than a boolean reset in the effect — the reset
  // was a synchronous setState inside an effect body (the area's only lint
  // finding), and "hydrated for THIS id" covers a project switch better than
  // the flag did: the flag was still true for one commit after the id changed,
  // which is the window the save effect below runs in. That argument now lives
  // in _shared/useLoadFor.ts, which is the only place it has to be made.
  const hydrated = useStepFor<ScopeStepData>(projectId, PHASE, (saved) => {
    setScope(saved?.scope ?? {});
    setConfirmed(saved?.confirmed ?? null);
  });

  // Never before hydration — writing the initial {} over a stored record is the
  // exact bug that silently emptied the job store (see lib/jobs.tsx).
  useEffect(() => {
    if (!hydrated) return;
    void saveStep<ScopeStepData>(projectId, PHASE, { scope, confirmed });
  }, [projectId, scope, confirmed, hydrated]);

  const patch = useCallback(
    (id: string, p: Partial<{ descoped: boolean; liked: boolean; deepen: boolean }>) =>
      setScope((s) => ({ ...s, [id]: { ...stateOf(s, id), ...p } })),
    [],
  );

  const toggle = useCallback(
    (id: string, key: "descoped" | "liked" | "deepen") =>
      setScope((s) => ({ ...s, [id]: { ...stateOf(s, id), [key]: !stateOf(s, id)[key] } })),
    [],
  );

  const reset = useCallback(() => { setScope({}); setConfirmed(null); }, []);

  const summary = useMemo(() => scopeSummary(cards, scope), [cards, scope]);

  /** Cards whose kept-or-cut has moved since the scope was confirmed. Empty
   *  when nothing is confirmed — there is no checkpoint to have drifted from. */
  const diverged = useMemo(
    () => (confirmed ? scopeDiffs(cards, scope, confirmed) : []),
    [cards, scope, confirmed],
  );

  return {
    cards,
    scope,
    diverged,
    hydrated,
    patch,
    toggle,
    reset,
    summary,
    confirmed,
    confirm: useCallback(() => setConfirmed(scope), [scope]),
    unconfirm: useCallback(() => setConfirmed(null), []),
  };
}

export type ScopeApi = ReturnType<typeof useScope>;
export type { Card };
