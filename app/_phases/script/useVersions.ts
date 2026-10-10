"use client";

// The notes-and-versions layer for one project.
//
// Three rules it enforces, all of them the user's:
//   1. Feedback AGGREGATES. Notes stack against tracks and nothing regenerates
//      until you ask for it once, against all of them.
//   2. One recalibration per project at a time. While one runs you cannot start
//      another AND you cannot write notes — a note added mid-flight would not be
//      in the run that is producing the result you are about to compare.
//   3. A candidate is not a baseline until you accept it. Accepting is the only
//      thing that changes what Candidates and Tracks show.
//
// Rule 2 is enforced against the REAL run, not a timer in front of it — and
// since AIO-A stage 2 (2026-10-06) the real run is a TURN THE SERVER OWNS. The
// click asks /api/recalibrate through the one client door (lib/turns/client.ts);
// the route answers 202 with a turn id as soon as the ledger has the record,
// and the job the pad locks on is that turn, read from the ledger by the jobs
// provider. A second click in this tab, another tab or another device meets
// the server's 409, which names the turn already holding the slot.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { useJobs } from "@/lib/jobs";
import { dispatchBlock, getTurn, resumeTurn, startRecalibrate, type TurnRecord } from "@/lib/turns/client";
import { useTurnPreview } from "@/lib/turns/usePreview";
import { loadStep, saveStep } from "../_shared/stepStore";
import type { NotebookSource } from "../_shared/notebook/source";
import { renderPayloadFor } from "./chainBase";
import { padBasis, padInit, padRecordOf, padReduce, type PadRecord } from "./padState";
import type { GateOverride, Note, NoteKind, Version } from "./versions";
import type { Card } from "../_shared/notebook/cards";
import type { Scope } from "../research/scope";

const PHASE = "script-versions";
const KIND = "recalibrate";
const NO_VERSIONS: Version[] = [];

export type { LostCandidate, PadOrphan } from "./padState";

// THE RULES LIVE IN padState.ts. This hook is the React shell around them:
// loading and saving the record, the turn ledger, and the pre-flight. Every
// transition - rule 2's lock included - is a `padReduce` case, so the probe
// lane executes it (tests/golden-path/script-pad-state.probe.spec.ts).
export function useVersions(projectId: string, ctx: { cards: Card[]; scope: Scope; source: NotebookSource; optIn?: ReadonlySet<string> }) {
  const jobs = useJobs();
  const { busy, track, cancel: cancelJob } = jobs;
  const [pad, dispatch] = useReducer(padReduce, undefined, padInit);
  // Keyed to the project rather than a boolean reset in the effect: "hydrated
  // for THIS id" is the stronger guard (research/useScope.ts, useBeatPicks).
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const hydrated = hydratedFor === projectId;

  // THE LEDGER AND THE DEALT NOTEBOOK, fed in during render - the adjust-state-
  // while-rendering shape, so no frame is committed with a pad that disagrees
  // with either. A turn started in another tab locks this pad through here.
  const live = busy(projectId, KIND);
  if (pad.live !== live || pad.dealt !== ctx.source.digest) dispatch({ type: "sync", live, dealt: ctx.source.digest });

  // What a landing reads of the board when the answer arrives - the guards in
  // recalibrate.ts need the cards and scope as they are THEN. Written in an
  // effect, never during render.
  const board = useRef({ cards: ctx.cards, scope: ctx.scope, optIn: ctx.optIn });
  useEffect(() => {
    board.current = { cards: ctx.cards, scope: ctx.scope, optIn: ctx.optIn };
  });

  /** Take a settled turn's answer onto the pad - at most once per turn (the
   *  reducer's `consumed` check). */
  const land = useCallback((rec: TurnRecord) => dispatch({ type: "land", turn: rec, at: Date.now(), ctx: board.current }), []);

  // LEAVING THE STEP NO LONGER STOPS THE RUN — operator decision, 2026-10-06
  // (AIO-A stage 2). The old rule aborted the fetch on unmount and settled the
  // job `interrupted`, on the reasoning that the answer had nowhere to land. It
  // also never stopped the engine: the abort ended at the fetch while the
  // `claude` process ran on to its ceiling. The turn is the server's now, so
  // the answer has somewhere to land — the ledger — and THIS is where it is
  // picked up: on mount, the project's newest recalibration is asked for. A
  // live one is watched (the pad stays locked and offers a stop that really
  // ends the engine); a settled one this pad has not taken is staged, once.
  // The record loads first, so the ask carries the last turn this pad took.
  useEffect(() => {
    let alive = true;
    void loadStep<PadRecord>(projectId, PHASE).then((s) => {
      if (!alive) return;
      dispatch({ type: "hydrate", record: s });
      setHydratedFor(projectId);
      void resumeTurn(projectId, KIND, s?.turn ?? null)
        .then((l) => {
          if (!alive) return;
          if (l.action === "watch") track({ turnId: l.turn.id, projectId, kind: KIND, label: "recalibration", record: l.turn });
          else if (l.action === "land") land(l.turn);
        })
        .catch(() => undefined);
    });
    return () => { alive = false; };
  }, [projectId, track, land]);

  /** What the pad shows on the notebook in front of it: a ledger written on
   *  another notebook is held, not applied (padState.ts). */
  const basis = useMemo(() => padBasis(pad, ctx.source.digest), [pad, ctx.source.digest]);
  const { baseline, notes, orphan } = basis;
  const accepted = orphan ? NO_VERSIONS : pad.accepted;
  const { candidate, engineNote, forceRenders, forceConclusions, lost: lostCandidate } = pad;
  const running = pad.phase === "starting" || pad.phase === "running";

  // Never before hydration, and never over an orphan - it belongs to another
  // notebook and stays on disk until this one is written.
  const record = useMemo(() => padRecordOf(pad), [pad]);
  useEffect(() => {
    if (!hydrated || orphan) return;
    void saveStep<PadRecord>(projectId, PHASE, record);
  }, [projectId, record, hydrated, orphan]);

  /** This project's newest turn-backed recalibration, as the ledger reports it. */
  const turnJob = jobs.jobs.find((j) => j.turnId && j.projectId === projectId && j.kind === KIND);

  // The watched turn ENDING while the pad is mounted: read its whole record
  // (the list the provider polls carries no result) and land it.
  const endedTurn = turnJob && turnJob.status !== "running" ? turnJob.id : null;
  useEffect(() => {
    if (!hydrated || !endedTurn || endedTurn === pad.consumed) return;
    let alive = true;
    void getTurn(endedTurn)
      .then((rec) => {
        if (alive && rec) land(rec);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [hydrated, endedTurn, pad.consumed, land]);

  // RULE 2 is padReduce's: these hand it the action and it refuses one while a
  // run is starting or live. `addNote` reports whether the note was taken.
  const addNote = useCallback(
    (cardId: string, kind: NoteKind, text?: string) => {
      if (padReduce(pad, { type: "add-note", cardId, kind, text }) === pad) return false;
      dispatch({ type: "add-note", cardId, kind, text });
      return true;
    },
    [pad],
  );
  const removeNote = useCallback((id: string) => dispatch({ type: "remove-note", id }), []);
  const clearNotes = useCallback(() => dispatch({ type: "clear-notes" }), []);

  /** Renders and conclusions the creator put back into the run (AIO-B). The
   *  assembler sends only what the notes touch; a forced one goes in whole.
   *  Decisions about the NEXT run: not persisted, and accepting answers them. */
  const toggleForceRender = useCallback((id: string) => dispatch({ type: "force-render", id }), []);
  const toggleForceConclusion = useCallback((id: string) => dispatch({ type: "force-conclusion", id }), []);

  /** THE ONE BODY a click sends and the preview reads. Built once, here, so
   *  the strip beside the button cannot describe a different payload from the
   *  one the button dispatches. */
  const runInput = useMemo(
    () => ({
      notebook: ctx.source.notebook,
      renders: renderPayloadFor(baseline),
      scope: ctx.scope,
      // Beside the notebook, never in it: the source's own conclusions, so the turn
      // rests edits on what this notebook reasoned and not on the fixture's seven.
      conclusions: ctx.source.conclusions,
      notes,
      ...(forceRenders.length ? { forceRenders } : {}),
      ...(forceConclusions.length ? { forceConclusions } : {}),
    }),
    [baseline, ctx.scope, ctx.source, notes, forceRenders, forceConclusions],
  );

  /** What the next run would send and who would serve it — free, debounced,
   *  and only while there is a run to describe. */
  const preview = useTurnPreview(KIND, runInput, hydrated && notes.length > 0 && !running && !candidate);
  const blocked = dispatchBlock(preview);

  /** Ask the server for a recalibration turn.
   *
   *  A user action, once per click. The pad locks at the click (`starting`)
   *  and stays locked for as long as the ledger says the turn is live — the
   *  provider's poll, not this closure, is what ends it, so leaving the step,
   *  reloading or closing the tab changes nothing about the run. */
  const run = useCallback(() => {
    if (padReduce(pad, { type: "run", blocked: Boolean(blocked) }) === pad) return;
    dispatch({ type: "run", blocked: Boolean(blocked) });

    const label = `${notes.length} note${notes.length === 1 ? "" : "s"}`;
    const refused = (why: string) => dispatch({ type: "refused", why, at: Date.now(), ctx: board.current });

    void startRecalibrate(projectId, runInput)
      .then((out) => {
        if (out.ok) {
          dispatch({ type: "started" });
          track({ turnId: out.turnId, projectId, kind: KIND, label });
          return;
        }
        // The rule working, server-side: another tab or device holds the slot.
        // Watch that turn instead of starting a second one.
        if (out.status === 409 && out.holder) {
          dispatch({ type: "started" });
          track({ turnId: out.holder, projectId, kind: KIND, label: "recalibration" });
          return;
        }
        // Refused before any turn existed (401, 413, no notes, a missing prompt
        // file): the simulated fallback, with the server's sentence beside it.
        refused(out.detail || "The recalibration could not be started.");
      })
      .catch(() => refused("The recalibration request failed. Nothing was changed."));
  }, [pad, notes.length, projectId, track, blocked, runInput]);

  /** Stop the live turn. On the server: the record says `cancelled` and the
   *  engine's process tree is ended (lib/turns/runner.ts `cancelTurn`). */
  const cancel = useCallback(() => {
    if (turnJob && turnJob.status === "running") cancelJob(turnJob.id);
  }, [turnJob, cancelJob]);

  /** Accept the candidate as the new baseline. The notes that produced it travel
   *  with the version and are cleared from the pad — they have been answered.
   *
   *  `override` is passed only when the accept happened over a BLOCKING gate
   *  verdict, and it is stamped onto the version rather than held beside it: the
   *  receipt has to survive the reload that persists `accepted`, and a record of
   *  an override that outlives the version it describes is worse than none.
   *  Call it explicitly — `onClick={api.accept}` would hand it a MouseEvent. */
  const accept = useCallback(
    (override?: GateOverride) => dispatch({ type: "accept", override, digest: ctx.source.digest }),
    [ctx.source.digest],
  );

  const discard = useCallback(() => dispatch({ type: "discard" }), []);

  const notesFor = useCallback((cardId: string) => notes.filter((n) => n.cardId === cardId), [notes]);

  /** When the live run started, so a surface can show elapsed time. Null when
   *  nothing is running. There is deliberately no percentage: the run is a
   *  local Claude Opus 5 turn and nothing here knows how long it will take.
   *
   *  Hoisted out of the returned literal so the memo below can depend on the
   *  value rather than on `turnJob`, which is re-found on every render. The
   *  start is the ledger's, so it survives a reload. */
  const runningSince = running && turnJob?.status === "running" ? turnJob.startedAt : null;

  /** THE RETURNED OBJECT HAS A STABLE IDENTITY, and it used to be a fresh literal
   *  on every render. `VersionsApi` is `ReturnType<typeof useVersions>`, and the
   *  notes context is built out of it — `_notes/NotesContext.tsx` derives `count`
   *  with `useCallback(…, [api])` and its provider value with `useMemo(…, [api, …])`.
   *  A new object here made both of those dead: the context value was rebuilt on
   *  every render of ScriptStep, and every `useNotes()` consumer re-rendered with it.
   *
   *  That is not a couple of components. `buildCards()` yields 39 cards and each one
   *  renders a `<NoteHandle>` (`_matrix/Matrix{Coverage,Spend,Tracks}.tsx`) that calls
   *  `useNotes()`, so twenty characters typed into the composer was ~780 handle
   *  re-renders, each recomputing `count(cardId)` — an O(notes) filter — for a change
   *  that touched one field.
   *
   *  The dep list is every property the object exposes, derived from the literal
   *  rather than guessed: a memo that misses one returns a STALE api, which is a
   *  worse defect than the slow one it replaces. The functions in it are already
   *  `useCallback`ed and `baseline` is already `useMemo`ed, so in practice this
   *  changes identity exactly when one of the values it carries changes.
   *
   *  Deliberately NOT done here: moving churning state out of the context value the
   *  way `lib/announcer.tsx` does. That is the stronger shape and a separate call —
   *  this is the one-line root fix, and it makes the two memos downstream live. */
  return useMemo(
    () => ({
      hydrated,
      notes,
      notesFor,
      addNote,
      removeNote,
      clearNotes,
      baseline,
      candidate,
      accepted,
      running,
      runningSince,
      run,
      /** Stop the live run — the server ends the engine. */
      cancel,
      accept,
      discard,
      /** Why the simulated engine ran, when it did. Null on a real model result. */
      engineNote,
      /** The pre-flight read for the next run, and why it may not dispatch. */
      preview,
      blocked,
      forceRenders,
      toggleForceRender,
      forceConclusions,
      toggleForceConclusion,
      /** The conclusions the next run holds, in the notebook's own order. */
      conclusions: ctx.source.conclusions,
      /** A candidate that was staged when this project was last closed and is now
       *  gone. Shown once, cleared by the next run. */
      lostCandidate,
      /** A ledger written on another notebook: held, not applied. */
      orphan,
    }),
    [
      hydrated,
      notes,
      notesFor,
      addNote,
      removeNote,
      clearNotes,
      baseline,
      candidate,
      accepted,
      running,
      runningSince,
      run,
      cancel,
      accept,
      discard,
      engineNote,
      preview,
      blocked,
      forceRenders,
      toggleForceRender,
      forceConclusions,
      toggleForceConclusion,
      ctx.source.conclusions,
      lostCandidate,
      orphan,
    ],
  );
}

export type VersionsApi = ReturnType<typeof useVersions>;
export type { Version, Note };
