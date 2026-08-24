// ALTERNATIVES — the nouns of choosing between pictures.
//
// A scene's plate used to be a single slot: generate again and the old picture
// is gone, along with the money it cost. An ALTERNATIVE is a plate that was
// kept: every generation lands here as a new row under its scene, and exactly
// one of them is ACTIVE — the one the cut actually uses. Selecting an
// alternative writes its plate back onto the frame, which is how the final
// track is composed from choices rather than from last-write-wins.
//
// The store is keyed by frame id and persisted under its own phase key
// (`frames-alts`), NOT inside the frames record: the two are written on
// different cadences, and plates are big — a scene with five kept alternatives
// is ~1.5MB, and the frames record must stay readable without hauling every
// rejected picture along.

import type { Frame, Plate } from "../frames";

export interface SceneAlt {
  id: string;
  plate: Plate;
  createdAt: number;
}

export interface SceneAlts {
  /** Which alternative the cut uses. Null only while the scene has none. */
  activeId: string | null;
  alts: SceneAlt[];
}

export interface AltsStepData {
  byFrame: Record<string, SceneAlts>;
  savedAt?: number;
}

/** One column of the view: a scene and everything ever kept for it. */
export interface AltsColumn {
  frame: Frame;
  alts: SceneAlt[];
  activeId: string | null;
  /** True for stress-mode clones — interactive in memory, never persisted,
   *  and their "generation" is synthesized rather than paid for. */
  synthetic: boolean;
}

/** The contract every variant renders against. Variants own layout, motion and
 *  navigation; they never own data. */
export interface AltsCtl {
  loaded: boolean;
  columns: AltsColumn[];
  /** Frame ids with a generation in flight. */
  busy: ReadonlySet<string>;
  error: string | null;
  /** What the kept alternatives have cost, beyond the plates already counted. */
  altCost: number;
  select: (frameId: string, altId: string) => void;
  generate: (frameId: string) => Promise<void>;
  remove: (frameId: string, altId: string) => void;
  /** ×7 the cut with synthetic scenes to judge the view at ~100 columns. */
  stress: boolean;
  setStress: (on: boolean) => void;
}

export const altId = (frameId: string) => `alt-${frameId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const SYNTH_MARK = "~s";
export const isSynthetic = (frameId: string) => frameId.includes(SYNTH_MARK);
