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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useJobs } from "@/lib/jobs";
import { dispatchBlock, getTurn, resumeTurn, startRecalibrate, type TurnRecord } from "@/lib/turns/client";
import { useTurnPreview } from "@/lib/turns/usePreview";
import { loadStep, saveStep } from "../_shared/stepStore";
import { recalibrate, recalibrateFromPlan } from "./recalibrate";
import type { NotebookSource } from "../_shared/notebook/source";
import { renderPayloadFor } from "./chainBase";
import { BASELINE, engineRunWith, type GateOverride, type Note, type NoteKind, type Version } from "./versions";
import type { EditPlan } from "./editPlan";
import type { Card } from "../_shared/notebook/cards";
import type { Scope } from "../research/scope";

const PHASE = "script-versions";
const KIND = "recalibrate";

/** `ids` with `id` added, or removed if it was there. */
const flip = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

/** The receipt for a candidate that was staged when the project last closed.
 *
 *  Staging itself is deliberately NOT persisted — a version the creator never
 *  accepted is not a version, and restoring one would put an unreviewed result
 *  back on the pad as if it had been decided. What persists is the fact that one
 *  was lost, so the reload can say so instead of quietly emptying the pad and
 *  leaving the creator to wonder whether the run ever happened. */
export interface LostCandidate {
  label: string;
  at: number;
  notes: number;
}

interface Stored {
  notes: Note[];
  /** Accepted versions, oldest first. The baseline itself is never stored. */
  accepted: Version[];
  staged?: LostCandidate;
  /** The last turn whose answer this pad took (staged, or found to have
   *  nothing to stage). A mount never takes it a second time. */
  turn?: string;
  savedAt?: number;
}

export function useVersions(projectId: string, ctx: { cards: Card[]; scope: Scope; source: NotebookSource; optIn?: ReadonlySet<string> }) {
  const jobs = useJobs();
  const { busy, track, cancel: cancelJob } = jobs;
  const [notes, setNotes] = useState<Note[]>([]);
  const [accepted, setAccepted] = useState<Version[]>([]);
  const [candidate, setCandidate] = useState<Version | null>(null);
  // Keyed to the project rather than a boolean reset in the effect. The reset
  // was a synchronous setState inside an effect body — the area's own ratcheted
  // lint finding — and "hydrated for THIS id" is also the stronger guard: the
  // flag stayed true for one commit after `projectId` changed, which is the
  // commit the save effect below runs in. Third hook in this family to take the
  // shape; research/useScope.ts and research/beats/useBeatPicks.ts hold the
  // other two, and useBeatPicks wrote down why first.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const hydrated = hydratedFor === projectId;
  const [lostCandidate, setLostCandidate] = useState<LostCandidate | null>(null);
  /** The last turn this pad took — persisted, so "exactly once" survives a
   *  reload. The ref is the synchronous guard; the state is what is saved. */
  const [consumed, setConsumed] = useState<string | null>(null);
  const consumedRef = useRef<string | null>(null);
  /** Between the click and the 202: no turn id exists yet, and the pad must
   *  already be locked. */
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);

  /** THE NOTE ORDINAL, AND IT MUST NOT REWIND.
   *
   *  Both the id and `Note.at` used to be minted from `notes.length`, which goes
   *  DOWN when a note is removed. Stack two "more focus" bullets on one track,
   *  delete the first, stack another: the third is minted `n-<card>-more-focus-1`,
   *  which the second already holds. `removeNote` filters by id, so one ✕ then
   *  deletes both, and React draws two list children under one key. A counter
   *  that only ever climbs cannot do that — and it is seeded past whatever the
   *  stored notes already used, so a reload cannot collide with them either. */
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;
    void loadStep<Stored>(projectId, PHASE).then((s) => {
      if (!alive) return;
      const loaded = s?.notes ?? [];
      seq.current = loaded.reduce((n, x) => Math.max(n, Number.isFinite(x.at) ? x.at + 1 : 0), 0);
      setNotes(loaded);
      setAccepted(s?.accepted ?? []);
      setCandidate(null);
      setLostCandidate(s?.staged ?? null);
      consumedRef.current = s?.turn ?? null;
      setConsumed(s?.turn ?? null);
      setHydratedFor(projectId);
    });
    return () => { alive = false; };
  }, [projectId]);

  useEffect(() => {
    if (!hydrated) return;
    void saveStep<Stored>(projectId, PHASE, {
      notes,
      accepted,
      staged: candidate
        ? { label: candidate.label, at: candidate.createdAt, notes: candidate.notes.length }
        : undefined,
      ...(consumed ? { turn: consumed } : {}),
    });
  }, [projectId, notes, accepted, candidate, consumed, hydrated]);

  /** What Candidates and Tracks read: the latest ACCEPTED version. */
  const baseline = useMemo(() => accepted[accepted.length - 1] ?? BASELINE, [accepted]);

  /** This project's newest turn-backed recalibration, as the ledger reports it. */
  const turnJob = jobs.jobs.find((j) => j.turnId && j.projectId === projectId && j.kind === KIND);
  const running = busy(projectId, KIND) || starting;

  const [engineNote, setEngineNote] = useState<string | null>(null);

  // What a landing reads: the pad as it is when the answer arrives. The pad is
  // locked while the turn is live (rule 2), so these are the notes the run was
  // started from. Written in an effect, never during render.
  const live = useRef({ notes, baseline, accepted, ctx });
  useEffect(() => {
    live.current = { notes, baseline, accepted, ctx };
  });

  /** Take a settled turn's answer onto the pad — at most once per turn. */
  const land = useCallback((rec: TurnRecord) => {
    if (consumedRef.current === rec.id) return;
    consumedRef.current = rec.id;
    setConsumed(rec.id);
    const { notes: runNotes, baseline: base, accepted: acc, ctx: c } = live.current;
    const id = `v${acc.length + 2}`;
    if (rec.status === "done") {
      const { plan, engine, manifest } = (rec.result ?? {}) as { plan?: EditPlan; engine?: unknown; manifest?: unknown };
      if (!plan) return;
      setEngineNote(null);
      setLostCandidate(null);
      // The receipt is attached here rather than inside the transform: what a
      // run cost is a fact about the TURN, not about the edit plan, and the
      // transform is shared with the path that never makes one.
      // The manifest rides on it (AIO-B): what the engine actually read.
      setCandidate({ ...recalibrateFromPlan(base, runNotes, plan, id, Date.now(), c), engineRun: engineRunWith(engine, manifest) });
      return;
    }
    if (rec.status === "failed") {
      // The engine could not serve, or served a plan the guards refused. The
      // sentence is the server's; the simulated candidate is the fallback the
      // pad has always staged beside it.
      const why = rec.error?.message || "The recalibration failed. Nothing was changed.";
      setEngineNote(why);
      setCandidate(recalibrate(base, runNotes, id, Date.now(), c));
    }
    // cancelled or orphaned: nothing came back, and nothing is staged.
  }, []);

  // LEAVING THE STEP NO LONGER STOPS THE RUN — operator decision, 2026-10-06
  // (AIO-A stage 2). The old rule aborted the fetch on unmount and settled the
  // job `interrupted`, on the reasoning that the answer had nowhere to land. It
  // also never stopped the engine: the abort ended at the fetch while the
  // `claude` process ran on to its ceiling. The turn is the server's now, so
  // the answer has somewhere to land — the ledger — and THIS is where it is
  // picked up: on mount, the project's newest recalibration is asked for. A
  // live one is watched (the pad stays locked and offers a stop that really
  // ends the engine); a settled one this pad has not taken is staged, once.
  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    void resumeTurn(projectId, KIND, consumedRef.current)
      .then((l) => {
        if (!alive) return;
        if (l.action === "watch") track({ turnId: l.turn.id, projectId, kind: KIND, label: "recalibration", record: l.turn });
        else if (l.action === "land") land(l.turn);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [hydrated, projectId, track, land]);

  // The watched turn ENDING while the pad is mounted: read its whole record
  // (the list the provider polls carries no result) and land it.
  const endedTurn = turnJob && turnJob.status !== "running" ? turnJob.id : null;
  useEffect(() => {
    if (!hydrated || !endedTurn || endedTurn === consumed) return;
    let alive = true;
    void getTurn(endedTurn)
      .then((rec) => {
        if (alive && rec) land(rec);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [hydrated, endedTurn, consumed, land]);

  const addNote = useCallback(
    (cardId: string, kind: NoteKind, text?: string) => {
      if (running) return false; // rule 2 — stated as a rule, not just a disabled button
      // Taken here rather than inside the updater: a state updater is invoked
      // twice under StrictMode, and a counter incremented in one would skip.
      const at = seq.current++;
      setNotes((n) => [...n, { id: `n-${cardId}-${kind}-${at}`, cardId, kind, text, at }]);
      return true;
    },
    [running],
  );

  const removeNote = useCallback(
    (id: string) => { if (!running) setNotes((n) => n.filter((x) => x.id !== id)); },
    [running],
  );

  const clearNotes = useCallback(() => { if (!running) setNotes([]); }, [running]);

  /** Renders the creator put back into the run (AIO-B). The assembler sends
   *  only the renders the notes touch and names the rest as NOT SENT; a forced
   *  one goes in whole, and the stray guard reads the widened scope. Not
   *  persisted: it is a decision about the NEXT run, and accepting answers it. */
  const [forceRenders, setForceRenders] = useState<string[]>([]);
  const toggleForceRender = useCallback(
    (id: string) => {
      if (running) return; // rule 2
      setForceRenders((f) => flip(f, id));
    },
    [running],
  );

  /** Conclusions the creator put back into the run — the same decision about
   *  the other cut. A held conclusion travels as its id, `useFor` and `leap`
   *  only, and the blind guard refuses a plan that names it; a forced one goes
   *  in whole and the guard reads it as visible. */
  const [forceConclusions, setForceConclusions] = useState<string[]>([]);
  const toggleForceConclusion = useCallback(
    (id: string) => {
      if (running) return; // rule 2
      setForceConclusions((f) => flip(f, id));
    },
    [running],
  );

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
    if (running || startingRef.current || !notes.length || blocked) return;
    startingRef.current = true;
    setStarting(true);
    setLostCandidate(null);

    // Frozen at click time, for the one path that stages from here: a run the
    // server refused before any turn existed.
    const runNotes = notes;
    const body = runInput;
    const base = baseline;
    const id = `v${accepted.length + 2}`;
    const c = live.current.ctx;
    const label = `${runNotes.length} note${runNotes.length === 1 ? "" : "s"}`;
    const fallback = (why: string) => {
      setEngineNote(why);
      setCandidate(recalibrate(base, runNotes, id, Date.now(), c));
    };

    void startRecalibrate(projectId, body)
      .then((out) => {
        if (out.ok) {
          setEngineNote(null);
          track({ turnId: out.turnId, projectId, kind: KIND, label });
          return;
        }
        // The rule working, server-side: another tab or device holds the slot.
        // Watch that turn instead of starting a second one.
        if (out.status === 409 && out.holder) {
          track({ turnId: out.holder, projectId, kind: KIND, label: "recalibration" });
          return;
        }
        // Refused before any turn existed (401, 413, no notes, a missing prompt
        // file): the simulated fallback, with the server's sentence beside it.
        fallback(out.detail || "The recalibration could not be started.");
      })
      .catch(() => fallback("The recalibration request failed. Nothing was changed."))
      .finally(() => {
        startingRef.current = false;
        setStarting(false);
      });
  }, [running, notes, baseline, accepted.length, projectId, track, blocked, runInput]);

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
    (override?: GateOverride) => {
      if (!candidate) return;
      setAccepted((a) => [...a, override ? { ...candidate, override } : candidate]);
      setCandidate(null);
      setNotes([]);
      setForceRenders([]);
      setForceConclusions([]);
    },
    [candidate],
  );

  const discard = useCallback(() => setCandidate(null), []);

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
    ],
  );
}

export type VersionsApi = ReturnType<typeof useVersions>;
export type { Version, Note };
