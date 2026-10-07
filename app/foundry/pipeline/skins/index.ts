// THE FOUR DIRECTIONS OF ROUND 1 — one engine, four bets about what a pipeline
// board should look like. Selected with `?v=1|2|3|4` so a direction is judged by
// flipping between them on the same live data, not by reading a description.
//
// A direction is a `PipelineSkin` and nothing more: it draws a card's FACE and,
// optionally, a WORLD layer behind the cards (see ../types.ts). It cannot reach
// the camera, cannot add a column and cannot move a card — the engine owns the
// geometry, the gestures and the authority, identically for all four. That is
// the point of the exercise: the only variable is taste.
//
// `bet` is what the direction is wagering, in the operator's terms, and `loses`
// is where it is expected to lose. Both are drawn in the variant switcher, so
// the look is judged against a stated claim rather than a vibe.

import type { PipelineSkin } from "../types";

import { bench } from "./bench";
import { field } from "./field";
import { ledger } from "./ledger";
import { transit } from "./transit";

export const VARIANT_IDS = ["1", "2", "3", "4"] as const;
export type VariantId = (typeof VARIANT_IDS)[number];

export interface Variant {
  id: VariantId;
  /** The direction's name, as the exercise note calls it. */
  name: string;
  bet: string;
  loses: string;
  skin: PipelineSkin;
  /** The docked inspector: the one direction that spends width on detail
   *  instead of a modal. The shell reads it; the engine knows nothing of it. */
  inspector?: true;
}

export const VARIANTS: Readonly<Record<VariantId, Variant>> = {
  "1": { id: "1", name: "Dense ledger", bet: "rules and type do all the work; no card chrome at all", loses: "first impression — nothing to admire", skin: ledger },
  "2": { id: "2", name: "Spatial field", bet: "glass, depth and air; lanes implied by light", loses: "items per screen, and honesty at volume", skin: field },
  "3": { id: "3", name: "Transit map", bet: "items ride continuous lines; stages are stations", loses: "dense lanes — a station with 498 trains", skin: transit },
  "4": { id: "4", name: "Workbench", bet: "a docked inspector follows the selection; detail costs no modal", loses: "screen width — it spends space on chrome", skin: bench, inspector: true },
};

export const DEFAULT_VARIANT: VariantId = "1";

/** `?v=` to a direction, falling back rather than failing: a bad id in a URL is
 *  not worth an error state on a board. */
export const variantFrom = (v: string | null | undefined): Variant => VARIANTS[(VARIANT_IDS as readonly string[]).includes(v ?? "") ? (v as VariantId) : DEFAULT_VARIANT];
