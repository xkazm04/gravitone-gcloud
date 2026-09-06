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
  // The spine the cut on screen was composed from, and the spine the board
  // holds now. Both are needed to say honestly whether Script is behind Step 1
  // — see `staleSpine` below.
  const [composedSpine, setComposedSpine] = useState<Record<string, string> | null | undefined>(undefined);
  const [boardSpine, setBoardSpine] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // Both records are read on every hydrate — the picks used to be read only
      // when no cut was saved, which is why a reopened-and-recomposed spine
      // never reached this step (uat 2026-09-05: four Characters found it).
      const [saved, picks] = await Promise.all([
        loadStep<TrailerCutStepData>(projectId, PHASE),
        loadStep<BeatPicksStepData>(projectId, PICKS_PHASE),
      ]);
      if (!alive) return;
      const confirmed = picks?.confirmed ?? null;
      setBoardSpine(confirmed && Object.keys(confirmed).length > 0 ? confirmed : null);
      if (saved?.cut) {
        setCut(saved.cut);
        setBudget(saved.budget ?? GLASS_HARBOR_BUDGET);
        // `null` = saved before the field existed: unknown provenance, drawn as
        // such rather than as current.
        setComposedSpine(saved.spine ?? null);
        setHydratedFor(projectId);
        return;
      }
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
        setComposedSpine(confirmed);
      } else {
        setCut(null);
        setBudget(null);
        setComposedSpine(undefined);
      }
      setHydratedFor(projectId);
    })();
    return () => { alive = false; };
  }, [projectId, discipline, title]);

  // Saves on every change once hydrated — including the seed, which is the
  // "saves once" the header promises. A null cut is never written.
  useEffect(() => {
    if (!hydrated || !cut || !budget) return;
    void saveStep<TrailerCutStepData>(projectId, PHASE, {
      cut,
      budget,
      ...(composedSpine ? { spine: composedSpine } : {}),
    });
  }, [projectId, cut, budget, composedSpine, hydrated]);

  /** Is the cut on screen older than the spine on the board?
   *  `true` — the board holds a confirmed spine that differs from the one this
   *  cut was composed from. `false` — same spine, or the board's spine is
   *  reopened (nothing newer to take). `null` — the cut predates the stamp and
   *  cannot say; drawn as unknown, never as current. */
  const staleSpine: boolean | null = useMemo(() => {
    if (!cut) return false;
    if (composedSpine === null) return null;
    if (!boardSpine || !composedSpine) return false;
    const keys = new Set([...Object.keys(boardSpine), ...Object.keys(composedSpine)]);
    for (const k of keys) if (boardSpine[k] !== composedSpine[k]) return true;
    return false;
  }, [cut, composedSpine, boardSpine]);

  /** The board's spine is reopened in Step 1 — this cut is the last one
   *  composed and nothing newer exists yet. */
  const spineReopened = !!cut && boardSpine === null;

  /** Take the board's current spine: rebuild the cut from it. Beat edits made
   *  on the old cut are discarded — the surface says so before the click. The
   *  withholding budget is the campaign's, not the cut's, and is kept. */
  const recompose = useCallback(() => {
    if (!boardSpine) return;
    setCut(
      composeCut({ projectId, title, picks: boardSpine, slots: slotsFor(discipline), cue: GLASS_HARBOR_CUE }),
    );
    setBudget((b) => b ?? GLASS_HARBOR_BUDGET);
    setComposedSpine(boardSpine);
  }, [boardSpine, projectId, title, discipline]);

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

  return { hydrated, cut, budget, report, staleSpine, spineReopened, recompose, setBeat, setPayer, addPromise, setAllowance };
}

export type TrailerCutApi = ReturnType<typeof useTrailerCut>;
