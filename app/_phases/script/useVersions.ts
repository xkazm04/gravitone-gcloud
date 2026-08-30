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
// Rule 2 is enforced against the REAL call, not a timer in front of it. The
// recalibrate job is started `driven` (lib/jobs.tsx): it is `running` from the
// click until the fetch settles — minutes, on the model path — and `settle` is
// what ends it. The old shape started a nine-second mock, fired the fetch when
// the mock said "done", and re-armed the button while a Claude Opus 5 turn was
// still in flight; a second click then discarded the first run's result
// client-side while the process kept burning. The fetch now lives in `run`,
// where the user's click is, rather than in an effect keyed on a timer.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useJobs } from "@/lib/jobs";
import { loadStep, saveStep } from "../_shared/stepStore";
import { recalibrate, recalibrateFromPlan } from "./recalibrate";
import { NOTEBOOK } from "../_shared/notebook/notebook";
import { RENDERS } from "./renders";
import { BASELINE, engineRunOf, type GateOverride, type Note, type NoteKind, type Version } from "./versions";
import type { Card } from "../_shared/notebook/cards";
import type { Scope } from "../research/scope";

const PHASE = "script-versions";

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
  savedAt?: number;
}

export function useVersions(projectId: string, ctx: { cards: Card[]; scope: Scope }) {
  const jobs = useJobs();
  // Held in a ref so the job-landing effect reads the CURRENT cards+scope
  // without re-running (and re-staging a candidate) every time scope changes.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [notes, setNotes] = useState<Note[]>([]);
  const [accepted, setAccepted] = useState<Version[]>([]);
  const [candidate, setCandidate] = useState<Version | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
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
  /** The in-flight call, so a genuinely superseded run stops burning a model
   *  turn instead of being dropped on the floor client-side. */
  const inFlight = useRef<{ ac: AbortController; jobId: string } | null>(null);

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
    });
  }, [projectId, notes, accepted, candidate, hydrated]);

  /** What Candidates and Tracks read: the latest ACCEPTED version. */
  const baseline = useMemo(() => accepted[accepted.length - 1] ?? BASELINE, [accepted]);

  const running = jobs.busy(projectId, "recalibrate");
  const myJob = jobId ? jobs.jobs.find((j) => j.id === jobId) : undefined;

  const [engineNote, setEngineNote] = useState<string | null>(null);

  // `settle` through a ref so the teardown below can end a job without taking
  // the jobs API as a dependency — that object is new on every render, and an
  // effect that re-ran on every render would abort the call it is guarding.
  const settleRef = useRef(jobs.settle);
  settleRef.current = jobs.settle;

  // Leaving the step ends the run rather than leaking it. The result is staged
  // into THIS hook's state; once it is gone the answer has nowhere to land, so
  // the honest move is to stop the call rather than let a Claude Opus 5 turn
  // finish for a listener that no longer exists. `interrupted` is the word the
  // jobs store already uses for exactly this.
  useEffect(
    () => () => {
      const f = inFlight.current;
      if (!f) return;
      inFlight.current = null;
      f.ac.abort();
      settleRef.current(
        f.jobId,
        "interrupted",
        "You left the Script step while this was running, so it was stopped. Nothing was changed.",
      );
    },
    [projectId],
  );

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

  /** Start the run, and OWN it until it settles.
   *
   *  The whole call lives here rather than in an effect: this is a user action,
   *  it happens once per click, and the job it opens stays `running` — locking
   *  the button and the note pad — for as long as the real request takes. */
  const run = useCallback(() => {
    if (running || inFlight.current || !notes.length) return;
    const j = jobs.start("recalibrate", projectId, `${notes.length} note${notes.length === 1 ? "" : "s"}`);
    // Refused: a run for this project is already live. Not an error — the rule
    // working. Say nothing and change nothing.
    if (!j) return;

    setJobId(j.id);
    setLostCandidate(null);
    const ac = new AbortController();
    inFlight.current = { ac, jobId: j.id };

    // Frozen at click time. The notes that produced a version travel with it,
    // and the pad is locked while the run is live, but reading them off the
    // closure rather than off later state is what makes that a guarantee.
    const runNotes = notes;
    const base = baseline;
    const id = `v${accepted.length + 2}`;
    const ctx = ctxRef.current;
    const settle = jobs.settle;

    void (async () => {
      try {
        const res = await fetch("/api/recalibrate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            notebook: NOTEBOOK,
            renders: RENDERS,
            scope: ctx.scope,
            notes: runNotes,
          }),
          signal: ac.signal,
        });
        if (!res.ok) {
          const { detail } = await res.json().catch(() => ({ detail: "" }));
          const why = detail || "The model could not be reached.";
          setEngineNote(why);
          setCandidate(recalibrate(base, runNotes, id, Date.now(), ctx));
          settle(j.id, "done", `Simulated instead — ${why}`);
          return;
        }
        const { plan, engine } = await res.json();
        setEngineNote(null);
        // The receipt is attached here rather than inside the transform: what a
        // run cost is a fact about the CALL, not about the edit plan, and the
        // transform is shared with the path that never makes one.
        setCandidate({
          ...recalibrateFromPlan(base, runNotes, plan, id, Date.now(), ctx),
          engineRun: engineRunOf(engine),
        });
        settle(j.id, "done", "A recalibrated set of scripts is staged — compare it, then accept or run again.");
      } catch (e) {
        // An abort is not a failure: whoever aborted has already settled the
        // job, and staging a fallback for a run the user walked away from would
        // put a result on a pad nobody is looking at.
        if (ac.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        const why = "The recalibration request failed. Nothing was changed.";
        setEngineNote(why);
        setCandidate(recalibrate(base, runNotes, id, Date.now(), ctx));
        settle(j.id, "done", `Simulated instead — ${why}`);
      } finally {
        if (inFlight.current?.ac === ac) inFlight.current = null;
      }
    })();
  }, [running, notes, baseline, accepted.length, jobs, projectId]);

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
   *  value rather than on `myJob`, which is re-found on every render. */
  const runningSince = running ? (myJob?.startedAt ?? null) : null;

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
      accept,
      discard,
      /** Why the simulated engine ran, when it did. Null on a real model result. */
      engineNote,
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
      accept,
      discard,
      engineNote,
      lostCandidate,
    ],
  );
}

export type VersionsApi = ReturnType<typeof useVersions>;
export type { Version, Note };
