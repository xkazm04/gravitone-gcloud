"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Discipline } from "@/lib/projects";
import { GLASS_HARBOR_BUDGET, GLASS_HARBOR_CUE } from "@/app/_studio/trailerFixtures";

import {
  loadStep,
  saveStep,
  type BeatPicksStepData,
  type TrailerCutStepData,
} from "../../_shared/stepStore";
import { slotsFor } from "../../research/beats/beats";

import {
  addPromise as addPromiseTo,
  composeCut,
  withAllowance,
  withBeat,
  withPromisePayer,
  type BeatPatch,
} from "./cut";
import { runStructureCheck, type StructureReport } from "./structure";
import type { Allowance, TrailerCut, WithholdingBudget } from "./types";

const PHASE = "script-trailer";
const PICKS_PHASE = "research-beats";

/** The trailer cut of a project, persisted under `"script-trailer"`.
 *
 *  Shaped like `useBeatPicks`: hydrate once per project id, never write before
 *  hydration, and every state change saves. The one extra move is the SEED —
 *  a project with no cut yet but a confirmed spine composes one from the picks,
 *  the discipline's slots and the campaign fixtures, and saves it once. A
 *  project with no confirmed spine hydrates to `cut: null`, which the surface
 *  renders as the absence it is; nothing is written for it.
 *
 *  `report` is recomputed from the cut on screen — never stored, because a
 *  stored verdict is a verdict about the cut it was computed against. */
export function useTrailerCut(opts: { projectId: string; discipline: Discipline; title: string }) {
  const { projectId, discipline, title } = opts;
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const hydrated = hydratedFor === projectId;
  const [cut, setCut] = useState<TrailerCut | null>(null);
  const [budget, setBudget] = useState<WithholdingBudget | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const saved = await loadStep<TrailerCutStepData>(projectId, PHASE);
      if (saved?.cut) {
        if (!alive) return;
        setCut(saved.cut);
        setBudget(saved.budget ?? GLASS_HARBOR_BUDGET);
        setHydratedFor(projectId);
        return;
      }
      const picks = await loadStep<BeatPicksStepData>(projectId, PICKS_PHASE);
      if (!alive) return;
      const confirmed = picks?.confirmed;
      if (confirmed && Object.keys(confirmed).length > 0) {
        const composed = composeCut({
          projectId,
          title,
          picks: confirmed,
          slots: slotsFor(discipline),
          cue: GLASS_HARBOR_CUE,
        });
        setCut(composed);
        setBudget(GLASS_HARBOR_BUDGET);
      } else {
        setCut(null);
        setBudget(null);
      }
      setHydratedFor(projectId);
    })();
    return () => { alive = false; };
  }, [projectId, discipline, title]);

  // Saves on every change once hydrated — including the seed, which is the
  // "saves once" the header promises. A null cut is never written.
  useEffect(() => {
    if (!hydrated || !cut || !budget) return;
    void saveStep<TrailerCutStepData>(projectId, PHASE, { cut, budget });
  }, [projectId, cut, budget, hydrated]);

  const report: StructureReport | null = useMemo(
    () => (cut ? runStructureCheck(cut, { budget: budget ?? undefined }) : null),
    [cut, budget],
  );

  const setBeat = useCallback((beatId: string, patch: BeatPatch) => {
    setCut((c) => (c ? withBeat(c, beatId, patch) : c));
  }, []);
  const setPayer = useCallback((beatId: string, promiseId: string, payer: string) => {
    setCut((c) => (c ? withPromisePayer(c, beatId, promiseId, payer) : c));
  }, []);
  const addPromise = useCallback((beatId: string, sentence: string) => {
    setCut((c) => (c ? addPromiseTo(c, beatId, sentence) : c));
  }, []);
  const setAllowance = useCallback((assetId: string, allowance: Allowance, trade?: string) => {
    setBudget((b) => (b ? withAllowance(b, assetId, allowance, trade) : b));
  }, []);

  return { hydrated, cut, budget, report, setBeat, setPayer, addPromise, setAllowance };
}

export type TrailerCutApi = ReturnType<typeof useTrailerCut>;
