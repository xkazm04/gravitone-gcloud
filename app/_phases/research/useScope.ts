"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fixtureSource, type NotebookSource } from "../_shared/notebook/source";
import { saveStep, type ScopeStepData } from "../_shared/stepStore";
import { useStepFor } from "../_shared/useLoadFor";
import { buildCards, optInIds, scopeDiffs, scopeSummary, stateOf, type Card, type Scope } from "./scope";

const PHASE = "research-scope";

/** The record as this hook holds it: the decisions, and the digest of the
 *  notebook they were made on (`undefined` until something is stored). */
interface Held {
  scope: Scope;
  confirmed: Scope | null;
  digest: string | undefined;
}

const FRESH: Held = { scope: {}, confirmed: null, digest: undefined };
const NO_SCOPE: Scope = {};

/** A scope decided on a notebook other than the one being dealt. */
export interface Orphan {
  /** The digest it was decided on. */
  digest: string;
  /** Cards it holds a decision for. */
  decisions: number;
}

/** The digest a stored scope was decided on. A scope with none was written
 *  before the stamp existed, and every one of those was written against the
 *  fixture — so it carries the fixture's, and keeps applying on the replay. */
export function digestOf(saved: ScopeStepData | undefined): string | undefined {
  if (!saved) return undefined;
  return saved.digest ?? fixtureSource().digest;
}

/** Is this scope ORPHANED from `digest` — decided on another notebook? A scope
 *  with nothing in it is nobody's orphan: applying it and not applying it are
 *  the same board. */
export function orphanOf(held: Held, digest: string): Orphan | null {
  if (held.digest === undefined || held.digest === digest) return null;
  const decisions = Object.keys(held.scope).length;
  if (decisions === 0 && held.confirmed === null) return null;
  return { digest: held.digest, decisions };
}

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
 *  on the triage board has to still be true when they open the matrix.
 *
 *  THE CARDS ARE DEALT FROM `source` (_shared/notebook/source.ts). Pass a
 *  referentially stable source: the board is re-dealt when it changes.
 *
 *  THE SCOPE IS STAMPED WITH THE DIGEST OF THE NOTEBOOK IT WAS DECIDED ON, and
 *  applies only to that notebook. A verdict is keyed by card id, and a creator's
 *  own notebook and the replay can both hold an `f-1` that means different
 *  things, so a scope loaded against a source with another digest is ORPHANED:
 *  `orphaned` says so, no verdict of it applies, and it is left on disk exactly
 *  as it was rather than re-saved under the wrong notebook.
 *
 *  WHO MAY REPLACE AN ORPHAN. A caller that passes `source` is dealing the
 *  project's active notebook (ResearchStep, through useActiveNotebook), and a
 *  decision there starts that notebook's scope. A caller that passes none is
 *  dealt the fixture — the Script step, until research-scope-board-A stage 4
 *  hands it the active notebook — and to it an orphaned scope is read-only: a
 *  click on a fixture card must not overwrite the decisions a creator made on
 *  their own notebook. */
export function useScope(projectId: string, source?: NotebookSource) {
  const dealt = source ?? fixtureSource();
  const owns = source !== undefined;
  const cards = useMemo(() => buildCards(dealt), [dealt]);
  const optIn = optInIds(dealt);
  const [held, setHeld] = useState<Held>(FRESH);

  // Keyed to the project rather than a boolean reset in the effect — the reset
  // was a synchronous setState inside an effect body (the area's only lint
  // finding), and "hydrated for THIS id" covers a project switch better than
  // the flag did: the flag was still true for one commit after the id changed,
  // which is the window the save effect below runs in. That argument now lives
  // in _shared/useLoadFor.ts, which is the only place it has to be made.
  const hydrated = useStepFor<ScopeStepData>(projectId, PHASE, (saved) =>
    setHeld(
      saved ? { scope: saved.scope ?? {}, confirmed: saved.confirmed ?? null, digest: digestOf(saved) } : FRESH,
    ),
  );

  const orphaned = useMemo(() => orphanOf(held, dealt.digest), [held, dealt]);
  const scope = orphaned ? NO_SCOPE : held.scope;
  const confirmed = orphaned ? null : held.confirmed;

  // Never before hydration — writing the initial {} over a stored record is the
  // exact bug that silently emptied the job store (see lib/jobs.tsx). And never
  // over an orphan, which belongs to another notebook and is not this board's
  // to rewrite.
  useEffect(() => {
    if (!hydrated || orphaned) return;
    void saveStep<ScopeStepData>(projectId, PHASE, {
      scope: held.scope,
      confirmed: held.confirmed,
      digest: dealt.digest,
    });
  }, [projectId, held, hydrated, orphaned, dealt]);

  /** Every decision passes through here: on an orphan it starts this notebook's
   *  scope if the caller owns the active notebook, and is refused otherwise. */
  const decide = useCallback(
    (next: (h: Held) => Held) =>
      setHeld((h) => {
        const orphan = orphanOf(h, dealt.digest) !== null;
        if (orphan && !owns) return h;
        return { ...next(orphan ? FRESH : h), digest: dealt.digest };
      }),
    [dealt, owns],
  );

  const patch = useCallback(
    (id: string, p: Partial<{ descoped: boolean; liked: boolean; deepen: boolean }>) =>
      decide((h) => ({ ...h, scope: { ...h.scope, [id]: { ...stateOf(h.scope, id, optIn), ...p } } })),
    [decide, optIn],
  );

  const toggle = useCallback(
    (id: string, key: "descoped" | "liked" | "deepen") =>
      decide((h) => {
        const now = stateOf(h.scope, id, optIn);
        return { ...h, scope: { ...h.scope, [id]: { ...now, [key]: !now[key] } } };
      }),
    [decide, optIn],
  );

  const reset = useCallback(() => setHeld(FRESH), []);

  const summary = useMemo(() => scopeSummary(cards, scope, dealt), [cards, scope, dealt]);

  /** Cards whose kept-or-cut has moved since the scope was confirmed. Empty
   *  when nothing is confirmed — there is no checkpoint to have drifted from. */
  const diverged = useMemo(
    () => (confirmed ? scopeDiffs(cards, scope, confirmed, optIn) : []),
    [cards, scope, confirmed, optIn],
  );

  return {
    source: dealt,
    optIn,
    cards,
    scope,
    orphaned,
    diverged,
    hydrated,
    patch,
    toggle,
    reset,
    summary,
    confirmed,
    confirm: useCallback(() => decide((h) => ({ ...h, confirmed: h.scope })), [decide]),
    unconfirm: useCallback(() => decide((h) => ({ ...h, confirmed: null })), [decide]),
  };
}

export type ScopeApi = ReturnType<typeof useScope>;
export type { Card };
