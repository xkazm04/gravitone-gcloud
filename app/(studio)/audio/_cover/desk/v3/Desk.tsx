"use client";

// PROTOTYPE VARIANT v3 of the cover desk (TODO(prototype, 2026-11-08): consolidate the cover desk switcher).
// Handed exactly what the baseline is handed; a placeholder that renders the baseline until its direction lands.
import { Baseline, type DeskProps } from "../Layouts.tsx";

export function DeskV3(p: DeskProps) {
  return <Baseline {...p} />;
}
