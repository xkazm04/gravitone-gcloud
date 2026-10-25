// THE BACKLOG (spark scout-vision) - pure. What the night owes before it spreads: every kept idea that waits for its
// next step, and the seed gate that follows from their count.
//
// WAITING. A kept idea of a live committed night (a dry night's verdicts were over stand-ins) waits when its target
// is `scene` or `style` and no storyboard that did not fail composes it (./storyboardKept.ts storyboardOf) - the
// storyboard is the root any video needs. A `stats` or `asset3d` idea has no buildable next step in the night (a
// reel's real data is later work; an asset serves a game), so it never holds the gate.
//
// THE GATE. While BACKLOG_GATE or more ideas wait, a seed batch takes its child seeds (a parent) and at most
// GATED_FRESH_SEEDS fresh ones. Kept seeds with no idea yet are counted beside it, advisory.

import type { Night, Seed, SeedBatch } from "./types";

export type Backlog = {
  /** `<night>/<c-id>` of every kept idea waiting for a storyboard, oldest night first. */
  readonly waiting: readonly string[];
  /** Kept, unpaused seeds no idea grows from yet. */
  readonly seedsWaiting: number;
  /** waiting.length >= BACKLOG_GATE. */
  readonly gated: boolean;
  /** GATED_FRESH_SEEDS while gated, else null (no limit beyond MAX_SEED_BATCH). */
  readonly freshAllowed: number | null;
};

export function backlogOf(_nights: readonly Night[], _batches: readonly SeedBatch[]): Backlog {
  throw new Error("backlogOf: WP1");
}

/** The refusal of a batch with more fresh seeds than the gate allows, or undefined. */
export function freshSeedRefusal(_backlog: Backlog, _briefs: readonly Omit<Seed, "id">[]): string | undefined {
  throw new Error("freshSeedRefusal: WP1");
}

/** The taste brief's `## Backlog` section. */
export function backlogSection(_backlog: Backlog): string[] {
  throw new Error("backlogSection: WP1");
}
