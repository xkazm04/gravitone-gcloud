"use client";

// WHICH FACE of the Candidates tab this project gets — the guided duel or the
// expert columns — under phase key `"script-mode"` (`GuidedModeStepData`).
//
// The default is COMPUTED, never stored (the type's own doctrine: "surfaces
// default to guided only while the step has no prior decisions, and that
// default is computed, never stored"). Storing it would freeze a moment's
// answer to a question whose inputs keep moving.
//
// WHAT COUNTS AS A PRIOR DECISION, and why it is not "a script-versions record
// exists": `useVersions` saves its record on hydration, so merely OPENING the
// step once writes `{notes: [], accepted: []}` — record-existence would flip
// every project to expert on its second visit for work nobody did. The honest
// inputs are the decisions themselves: an accepted version, a standing note,
// or an adoption record (cleared included — un-adopting is also a decision
// made on this surface).

import { useCallback, useState } from "react";

import { saveStep, type GuidedModeStepData } from "../../_shared/stepStore";
import { useStepFor } from "../../_shared/useLoadFor";

const PHASE = "script-mode";

export type ScriptFace = "guided" | "expert";

export function useScriptFace(
  projectId: string,
  prior: { hasVersionWork: boolean; hasAdoption: boolean; settled: boolean },
) {
  /** The stored choice, or null when the creator has never switched. */
  const [chosen, setChosen] = useState<ScriptFace | null>(null);

  const hydrated = useStepFor<GuidedModeStepData>(projectId, PHASE, (data) => {
    setChosen(data?.mode ?? null);
  });

  /** THE DEFAULT IS LATCHED AT OPEN, per project — computed once from the
   *  decisions that existed when the step mounted, then held. Computing it
   *  live was driven and failed: adopting a card creates an adoption record,
   *  `hasAdoption` flips, and the guided face unmounts UNDER THE CLICK that
   *  used it — the surface the creator is standing on cannot be an input to
   *  which surface they are standing on. Only the creator's own switch (or a
   *  reload, which re-latches against the new facts) changes the face. */
  const [latched, setLatched] = useState<{ for: string; face: ScriptFace } | null>(null);
  if (prior.settled && latched?.for !== projectId) {
    // React's documented render-adjustment form (not an effect): the set runs
    // during the same render that first sees `settled`, React restarts the
    // render with the latch in place, and nothing was ever painted unlatched.
    // The guard makes it fire once per project and never loop.
    setLatched({
      for: projectId,
      face: prior.hasVersionWork || prior.hasAdoption ? "expert" : "guided",
    });
  }

  /** The face on screen: the stored choice wins; absent one, the latched
   *  default (guided only while nothing had been decided here at open). The
   *  live computation covers only the single commit before the latch effect
   *  runs, where it equals what is about to be latched. */
  const face: ScriptFace =
    chosen ??
    (latched?.for === projectId
      ? latched.face
      : prior.hasVersionWork || prior.hasAdoption
        ? "expert"
        : "guided");

  /** Switching discards nothing (the ModeChooser doctrine) — it writes ONLY
   *  the mode record, and never before hydration. */
  const set = useCallback(
    (mode: ScriptFace) => {
      if (!hydrated) return;
      setChosen(mode);
      void saveStep<GuidedModeStepData>(projectId, PHASE, { mode });
    },
    [hydrated, projectId],
  );

  return { face, hydrated, set };
}
