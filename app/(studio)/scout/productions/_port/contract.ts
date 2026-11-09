// THE PRODUCTIONS SCREEN'S VIEW - client-safe (types only). S0 is three layouts on scripted data: the operator picks
// one, and later sessions swap the scripted side for the production record without changing this shape.

import type { CastRound, Production, ProductionLesson } from "@gt/domain/production";

/** A concept and everything already decided for it. */
export type ProductionEntry = {
  readonly production: Production;
  readonly logline: string;
  /** A served picture; omitted when the concept has none yet. */
  readonly poster?: string;
  /** True while it is a kept concept nobody started: it shows a Start button, and its production is scripted ahead. */
  readonly keptOnly: boolean;
  readonly rounds: readonly CastRound[];
  readonly lessons: readonly ProductionLesson[];
};

export type VentureOption = { readonly id: string; readonly name: string };

export type ProductionsView = {
  readonly entries: readonly ProductionEntry[];
  readonly ventures: readonly VentureOption[];
};
