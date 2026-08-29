"use client";

import { useCallback, useEffect, useState } from "react";

import {
  claimSaveSlot,
  loadStep,
  saveStep,
  type BeatPicksStepData,
  type ResearchStepData,
} from "../../_shared/stepStore";
import { useStepFor } from "../../_shared/useLoadFor";

const PHASE = "research-beats";

/** The beat-variant picks for a project, persisted under their own key.
 *
 *  Shaped like `useScope`: hydrate once per project, never write before
 *  hydration (writing the initial {} over a stored record is the bug that
 *  emptied the job store), and every state change saves. `saveStep` claims its
 *  own latest-wins ticket, so the per-keystroke saves here cannot land out of
 *  order.
 *
 *  `confirm()` also writes the RESEARCH record — `{ topic, researched: true }`
 *  — because that record is what Script gates on (ScriptStep.tsx reads
 *  `researched`), and a trailer project has no run that would ever set it.
 *  The existing record is read first and its topic preserved: a free project
 *  that switched from facts to beats must not lose the topic it typed. That
 *  write claims a slot through `claimSaveSlot` explicitly so a stale confirm
 *  cannot overtake a later reopen. */
export function useBeatPicks(projectId: string) {
  const [mode, setModeState] = useState<BeatPicksStepData["mode"] | null>(null);
  const [picks, setPicks] = useState<Record<string, string | null>>({});
  const [confirmed, setConfirmed] = useState<Record<string, string> | null>(null);

  // Keyed to the project rather than a boolean reset in the effect — the
  // reset would be a synchronous setState inside an effect, and a project
  // switch is covered just as well by "hydrated for THIS id". This hook chose
  // that shape first; _shared/useLoadFor.ts is now where it is kept.
  const hydrated = useStepFor<BeatPicksStepData>(projectId, PHASE, (saved) => {
    setModeState(saved?.mode ?? null);
    setPicks(saved?.picks ?? {});
    setConfirmed(saved?.confirmed ?? null);
  });

  useEffect(() => {
    if (!hydrated || mode === null) return;
    void saveStep<BeatPicksStepData>(projectId, PHASE, { mode, picks, confirmed });
  }, [projectId, mode, picks, confirmed, hydrated]);

  const setMode = useCallback((m: BeatPicksStepData["mode"]) => setModeState(m), []);

  // Picking a beat IS choosing beats: a trailer project never sees the chooser,
  // so the first pick settles `mode` — and without a mode nothing saves.
  const pick = useCallback((slotId: string, variantId: string | null) => {
    setModeState((m) => m ?? "beats");
    setPicks((p) => ({ ...p, [slotId]: variantId }));
  }, []);

  /** Freeze the current picks and mark the project researched. The caller
   *  decides whether the spine is complete — this only records the act. */
  const confirm = useCallback(async () => {
    const frozen: Record<string, string> = {};
    for (const [slot, v] of Object.entries(picks)) if (v) frozen[slot] = v;
    setModeState((m) => m ?? "beats");
    setConfirmed(frozen);

    const slot = claimSaveSlot(projectId, "research");
    const current = await loadStep<ResearchStepData>(projectId, "research");
    if (!slot.stillNewest()) return;
    await saveStep<ResearchStepData>(projectId, "research", {
      topic: current?.topic ?? "",
      researched: true,
    });
  }, [projectId, picks]);

  /** Unfreeze. The research record is NOT flipped back: Script keeps reading
   *  the last confirmed spine until a new one is composed, which is the same
   *  contract `useScope` gives — a reopened scope is still the frozen one
   *  downstream until re-confirmed. */
  const reopen = useCallback(() => setConfirmed(null), []);

  return { hydrated, mode, picks, confirmed, setMode, pick, confirm, reopen };
}

export type BeatPicksApi = ReturnType<typeof useBeatPicks>;
