"use client";

// The Motion step's state: the frames Step 3 saved for THIS project, the
// direction outcomes this step keeps per frame, and the two acts — DIRECT (ask
// the turn about one plate) and ACCEPT (write a motion line onto the frame).
//
// Two records, two owners. The frames record is Frames'; this step reads it,
// and writes exactly one field of it — `clip.motion` on the frame accepted —
// through `patchStep`, so the read and the write share one transaction and no
// other field of a cut can be lost to a stale copy held in memory. The outcomes
// are this step's own record (./records.ts).

import { useCallback, useMemo, useState } from "react";

import { useAnnounce } from "@/lib/announcer";
import { getProject, PHASES, type PhaseKey } from "@/lib/projects";
import { accessHeader } from "@/lib/imagingClient";

import type { Frame } from "../frames/frames";
import type { FramesStepData } from "../frames/useFrames";
import { useRecord } from "../_shared/records/useRecord";
import { patchStep, readStep, type StorageTrouble } from "../_shared/stepStore";
import { useLoadFor } from "../_shared/useLoadFor";
import { usePhaseReport } from "../_shared/usePhaseReport";

import {
  acceptIntoFramesRecord,
  motionReport,
  plateImage,
  plateSig,
  withAcceptedMotion,
  type MotionOutcome,
} from "./direction";
import { MOTION_DIRECTION, type MotionOutcomeOnFile } from "./records";

const FRAMES_KEY = "frames";

/** One frame's direct call in flight, or the last one's failure, verbatim. */
type Call = { busy: true } | { busy: false; error: string };

export function useMotion(projectId: string) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [trouble, setTrouble] = useState<StorageTrouble | null>(null);
  const [doneUp, setDoneUp] = useState<PhaseKey[]>([]);
  const [byFrame, setByFrame] = useState<Record<string, MotionOutcomeOnFile>>({});
  const [calls, setCalls] = useState<Record<string, Call>>({});
  // The outcome of a direct call is news about a row the user may have left:
  // spoken through the one announcer (lib/announcer.tsx rule 2), never a live
  // region of this step's own.
  const announce = useAnnounce();

  const framesLoaded = useLoadFor(
    projectId,
    async (id) => {
      const project = await getProject(id).catch(() => undefined);
      const step = await readStep<FramesStepData>(id, FRAMES_KEY);
      return { project, step };
    },
    ({ project, step }) => {
      // Before the early return: the chain is drawn on the failure branch too.
      setDoneUp(project ? PHASES.filter((k) => k !== "motion" && project.progress[k] !== "empty") : []);
      if (!step.ok) {
        setTrouble(step.trouble);
        setFrames([]);
        return false;
      }
      setTrouble(null);
      setFrames(step.data?.frames ?? []);
    },
  );

  const outcomes = useRecord(MOTION_DIRECTION, projectId, (stored) => setByFrame(stored?.byFrame ?? {}));

  const current = useMemo(() => {
    const out: Record<string, MotionOutcome> = {};
    for (const f of frames) {
      const row = byFrame[f.id];
      if (row && row.plate === plateSig(f.plate?.src)) out[f.id] = row.outcome;
    }
    return out;
  }, [frames, byFrame]);

  usePhaseReport(projectId, "motion", framesLoaded ? motionReport(frames, current) : null);

  const direct = useCallback(
    async (frameId: string) => {
      const f = frames.find((x) => x.id === frameId);
      const image = plateImage(f?.plate?.src);
      if (!f || !image) return;
      setCalls((c) => ({ ...c, [frameId]: { busy: true } }));
      try {
        const res = await fetch("/api/motion/direct", {
          method: "POST",
          headers: { "content-type": "application/json", ...accessHeader() },
          body: JSON.stringify({ image }),
        });
        const json = (await res.json().catch(() => ({}))) as { outcome?: MotionOutcome; detail?: string; code?: string };
        if (!res.ok || !json.outcome)
          throw new Error(`${json.code ?? res.status} · ${json.detail ?? "the direction turn failed"}`);
        const row: MotionOutcomeOnFile = { outcome: json.outcome, plate: plateSig(f.plate.src) };
        announce({
          key: `motion:${frameId}:${json.outcome.at}`,
          text:
            json.outcome.kind === "proposed"
              ? `${f.title}: motion proposed`
              : `${f.title}: declined, ${json.outcome.reason}`,
        });
        setByFrame((b) => ({ ...b, [frameId]: row }));
        const wrote = await outcomes.patch((cur) => ({ ...cur, byFrame: { ...(cur?.byFrame ?? {}), [frameId]: row } }));
        if (!wrote.ok && "refused" in wrote) throw new Error(`${wrote.refused} · ${wrote.detail}`);
        setCalls((c) => {
          const next = { ...c };
          delete next[frameId];
          return next;
        });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        announce({ key: `motion:${frameId}:error:${Date.now()}`, text: `${f.title}: ${error}` });
        setCalls((c) => ({ ...c, [frameId]: { busy: false, error } }));
      }
    },
    [frames, outcomes, announce],
  );

  /** Write `motion` onto the frame — the proposal as accepted, or as edited. */
  const accept = useCallback(
    async (frameId: string, motion: string) => {
      const r = await patchStep(projectId, FRAMES_KEY, (stored) => acceptIntoFramesRecord(stored, frameId, motion));
      // A failed write has already reached the bell through the store's own
      // trouble channel; the frame simply keeps the line it had.
      if (!r.ok) return;
      if (r.wrote) setFrames((fs) => withAcceptedMotion(fs, frameId, motion));
    },
    [projectId],
  );

  return {
    loaded: framesLoaded || Boolean(trouble),
    trouble,
    refused: outcomes.refused,
    doneUp,
    frames,
    outcomes: current,
    calls,
    direct,
    accept,
  };
}
