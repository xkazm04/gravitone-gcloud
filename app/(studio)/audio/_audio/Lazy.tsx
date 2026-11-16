"use client";

// The desk's sections other than the studio, behind client-side lazy boundaries. /audio opens on
// the studio (`?s=compose`), so the arrange board, the hunt, the strengths grid, the rubric, the
// batch desk and the song lab's Knockout islands were first-load JS for a view that draws none of
// them. Each is its own chunk here, fetched when its section is the one the URL names; the
// server still renders it, so the section arrives as HTML and only its
// hydration waits for the chunk. The page hands the same props as before; nothing else changed.
//
// A Ghost holds the place while the chunk loads: its rows are a field's height, so the desk
// does not jump when the island lands.
import { lazy, Suspense, type ComponentProps } from "react";

import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";

import type { Arrange as ArrangeT } from "./Arrange.tsx";
import type { Hunt as HuntT } from "../_hunt/Hunt.tsx";
import type { BatchDesk as BatchT } from "../_insight/Batch.tsx";
import type { RubricDesk as RubricT } from "../_insight/Rubric.tsx";
import type { StrengthsDesk as StrengthsT } from "../_insight/Strengths.tsx";
import type { SongLab as SongLabT } from "../_songlab/SongLab.tsx";


const held = (label: string) => <Ghost count={3} label={label} />;

const ArrangeIsland = lazy(() => import("./Arrange.tsx").then((m) => ({ default: m.Arrange })));
const HuntIsland = lazy(() => import("../_hunt/Hunt.tsx").then((m) => ({ default: m.Hunt })));
const BatchIsland = lazy(() => import("../_insight/Batch.tsx").then((m) => ({ default: m.BatchDesk })));
const RubricIsland = lazy(() => import("../_insight/Rubric.tsx").then((m) => ({ default: m.RubricDesk })));
const StrengthsIsland = lazy(() => import("../_insight/Strengths.tsx").then((m) => ({ default: m.StrengthsDesk })));
const SongLabIsland = lazy(() => import("../_songlab/SongLab.tsx").then((m) => ({ default: m.SongLab })));

export const LazyArrange = (p: ComponentProps<typeof ArrangeT>) => (
  <Suspense fallback={held("arrange loading")}>
    <ArrangeIsland {...p} />
  </Suspense>
);
export const LazyHunt = (p: ComponentProps<typeof HuntT>) => (
  <Suspense fallback={held("hunt loading")}>
    <HuntIsland {...p} />
  </Suspense>
);
export const LazyBatch = (p: ComponentProps<typeof BatchT>) => (
  <Suspense fallback={held("batch loading")}>
    <BatchIsland {...p} />
  </Suspense>
);
export const LazyRubric = (p: ComponentProps<typeof RubricT>) => (
  <Suspense fallback={held("rubric loading")}>
    <RubricIsland {...p} />
  </Suspense>
);
export const LazyStrengths = (p: ComponentProps<typeof StrengthsT>) => (
  <Suspense fallback={held("strengths loading")}>
    <StrengthsIsland {...p} />
  </Suspense>
);
export const LazySongLab = (p: ComponentProps<typeof SongLabT>) => (
  <Suspense fallback={held("song lab loading")}>
    <SongLabIsland {...p} />
  </Suspense>
);
