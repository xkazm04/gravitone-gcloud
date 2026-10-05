"use client";

// THE SOUND LAB (/playground) — an experimental studio for finding the right
// track and polishing it, with the engines this studio knows.
//
// It replaces the music playground (2026-08 → 2026-10), a single-column bench
// of four panels — quick take, plan lab, section edit, SFX — whose renders were
// session-only blob URLs. Every render it made was paid for and none survived a
// reload, and none could be judged: judging lived only in the Library's audio
// module. The lab closes that split. Every render, and every file returned from
// Suno, is a TAKE in the Library's own store (./useLab.ts), scored on the
// Library's rubric, and the recipe vocabulary it composes from is the Library's,
// with each term's keep-rate beside it.
//
// The bench's lessons are kept, not its layout: the coin on every button that
// spends and the price under it (lib/musicClient.ts#costLabel), "free" on the
// one that does not, seams drawn where sections meet, the keep/condition ramp
// as a shape, capability gating with ABSENCE_REASON verbatim. They now live in
// ./parts.tsx and ./labModel.ts.
//
// THREE DIRECTIONS, one data layer (prototype round 3, platform-consolidation):
//
//   1 · Workbench    ./Workbench.tsx    recipe + engine, a takes rack, an
//                                      inspector: generate → listen → judge →
//                                      vary, on the keys.
//   2 · Arrangement  ./Arrangement.tsx  polish first: the plan's sections as a
//                                      timeline, edit modes inline, versions
//                                      stacked as lanes, A/B on one clock.
//   3 · Hunt         ./Hunt.tsx         search first: one seed fanned out one
//                                      change at a time across engines,
//                                      auditioned fast, knocked out to a winner.
//
// The recipe and the selected take live HERE, so flipping direction keeps both.

import { useMemo, useState } from "react";

import { useVariant, VariantSwitch } from "@/components/ui/VariantSwitch";
import { Ghost } from "@/components/ui/signal";
import { seedOf, type Seed, type Take } from "@/app/library/audio/book";

import Arrangement from "./Arrangement";
import Hunt from "./Hunt";
import { startingSeed } from "./labModel";
import { ErrorLine, FlashLine } from "./parts";
import { useLab } from "./useLab";
import Workbench from "./Workbench";
import type { EngineId } from "./engines";

/** The working recipe, shared by the three directions. */
export interface Recipe {
  seed: Seed;
  /** The take it was loaded from, if any — the parent of what it renders. */
  parentId: string | null;
  lengthS: number;
  /** A prompt typed by hand. Null means "composed from the seed". */
  prompt: string | null;
}

export interface LabState {
  recipe: Recipe;
  setRecipe: (r: Recipe) => void;
  /** Load a take's recipe as the working one. */
  loadFrom: (t: Take, seed?: Seed) => void;
  selected: string | null;
  select: (id: string | null) => void;
  engineId: EngineId;
  setEngineId: (e: EngineId) => void;
  goto: (v: 1 | 2 | 3, takeId?: string) => void;
}

export default function PlaygroundView() {
  const lab = useLab();
  const [v, setV] = useVariant();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [selected, select] = useState<string | null>(null);
  const [engineId, setEngineId] = useState<EngineId>("elevenlabs");

  const start = useMemo(() => startingSeed(lab.takes), [lab.takes]);
  const r: Recipe = recipe ?? { seed: start.seed, parentId: start.from?.id ?? null, lengthS: 30, prompt: null };

  const state: LabState = {
    recipe: r,
    setRecipe,
    loadFrom: (t, seed) => setRecipe({ ...r, seed: seed ?? seedOf(t), parentId: t.id, prompt: null }),
    selected,
    select,
    engineId,
    setEngineId,
    goto: (to, takeId) => {
      if (takeId) select(takeId);
      setV(to);
    },
  };

  return (
    <main className="pb-24 pt-1">
      <h1 className="sr-only">Sound lab</h1>
      <div className="mb-3 empty:hidden">
        <ErrorLine text={lab.error} />
      </div>
      {!lab.ready ? (
        <Ghost shape="card" count={2} label="Reading the audio shelf" />
      ) : v === 1 ? (
        <Workbench lab={lab} state={state} />
      ) : v === 2 ? (
        <Arrangement lab={lab} state={state} />
      ) : (
        <Hunt lab={lab} state={state} />
      )}
      <FlashLine flash={lab.flash} />
      <VariantSwitch labels={["Workbench", "Arrangement", "Hunt"]} />
    </main>
  );
}
