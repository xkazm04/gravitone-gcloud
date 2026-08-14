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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useJobs } from "@/lib/jobs";
import { loadStep, saveStep } from "../_shared/stepStore";
import { recalibrate, recalibrateFromPlan } from "./recalibrate";
import { NOTEBOOK } from "../_shared/notebook/notebook";
import { RENDERS } from "./renders";
import { BASELINE, type Note, type NoteKind, type Version } from "./versions";
import type { Card } from "../_shared/notebook/cards";
import type { Scope } from "../research/scope";

const PHASE = "script-versions";

interface Stored {
  notes: Note[];
  /** Accepted versions, oldest first. The baseline itself is never stored. */
  accepted: Version[];
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
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    setHydrated(false);
    void loadStep<Stored>(projectId, PHASE).then((s) => {
      if (!alive) return;
      setNotes(s?.notes ?? []);
      setAccepted(s?.accepted ?? []);
      setCandidate(null);
      setHydrated(true);
    });
    return () => { alive = false; };
  }, [projectId]);

  useEffect(() => {
    if (!hydrated) return;
    void saveStep<Stored>(projectId, PHASE, { notes, accepted });
  }, [projectId, notes, accepted, hydrated]);

  /** What Candidates and Tracks read: the latest ACCEPTED version. */
  const baseline = useMemo(() => accepted[accepted.length - 1] ?? BASELINE, [accepted]);

  const running = jobs.busy(projectId, "recalibrate");
  const myJob = jobId ? jobs.jobs.find((j) => j.id === jobId) : undefined;

  const [engineNote, setEngineNote] = useState<string | null>(null);

  // The job lands → ask the model, then stage the candidate. Staged, never
  // auto-accepted: the whole point of the compare step is that the creator
  // decides. If the model cannot be reached the simulated transform runs
  // instead — and the version it produces is LABELLED simulated, so a fallback
  // can never be mistaken for a real result.
  useEffect(() => {
    if (!myJob || myJob.status !== "done") {
      if (myJob && myJob.status !== "running") setJobId(null);
      return;
    }
    const id = `v${accepted.length + 2}`;
    const at = myJob.endedAt ?? myJob.startedAt;
    const ctx = ctxRef.current;
    let alive = true;

    void (async () => {
      try {
        const res = await fetch("/api/recalibrate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            notebook: NOTEBOOK,
            renders: RENDERS,
            scope: ctx.scope,
            notes,
          }),
        });
        if (!alive) return;
        if (!res.ok) {
          const { detail } = await res.json().catch(() => ({ detail: "" }));
          setEngineNote(detail || "The model could not be reached.");
          setCandidate(recalibrate(baseline, notes, id, at, ctx));
          return;
        }
        const { plan } = await res.json();
        setEngineNote(null);
        setCandidate(recalibrateFromPlan(baseline, notes, plan, id, at, ctx));
      } catch {
        if (!alive) return;
        setEngineNote("The recalibration request failed. Nothing was changed.");
        setCandidate(recalibrate(baseline, notes, id, at, ctx));
      } finally {
        if (alive) setJobId(null);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myJob?.status]);

  const addNote = useCallback(
    (cardId: string, kind: NoteKind, text?: string) => {
      if (running) return false; // rule 2 — stated as a rule, not just a disabled button
      setNotes((n) => [
        ...n,
        { id: `n-${cardId}-${kind}-${n.length}`, cardId, kind, text, at: n.length },
      ]);
      return true;
    },
    [running],
  );

  const removeNote = useCallback(
    (id: string) => { if (!running) setNotes((n) => n.filter((x) => x.id !== id)); },
    [running],
  );

  const clearNotes = useCallback(() => { if (!running) setNotes([]); }, [running]);

  const run = useCallback(() => {
    if (running || !notes.length) return;
    const j = jobs.start("recalibrate", projectId, `${notes.length} note${notes.length === 1 ? "" : "s"}`);
    if (j) setJobId(j.id);
  }, [running, notes.length, jobs, projectId]);

  /** Accept the candidate as the new baseline. The notes that produced it travel
   *  with the version and are cleared from the pad — they have been answered. */
  const accept = useCallback(() => {
    if (!candidate) return;
    setAccepted((a) => [...a, candidate]);
    setCandidate(null);
    setNotes([]);
  }, [candidate]);

  const discard = useCallback(() => setCandidate(null), []);

  const notesFor = useCallback((cardId: string) => notes.filter((n) => n.cardId === cardId), [notes]);

  return {
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
    progress: myJob?.progress ?? 0,
    run,
    accept,
    discard,
    /** Why the simulated engine ran, when it did. Null on a real model result. */
    engineNote,
  };
}

export type VersionsApi = ReturnType<typeof useVersions>;
export type { Version, Note };
