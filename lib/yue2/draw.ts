import "server-only";

import type { Draw, DrawField, LabRule, Match } from "@gt/domain/audio.yue2.lab";
import type { Actor } from "@gt/domain/event";
import { err, type Result } from "@gt/domain/errors";
import type { Store } from "@gt/kernel/store";

// THE KNOCKOUT DRAW (spark yue2-song-lab S2, WP0 stub -> WP-A). A draw is a ledger record: one
// `audio.ab.draw` event per version (subject `ab-draw`, lane `audio`). Its matches are S1 blind pairs of
// AbSource `knockout`, booked round by round (lib/yue2/ab.ts queuePairs). Who advances is a fold over
// the draw's versions, the queued pairs and the votes: the `release` answer decides; `neither` knocks
// out both and the next opponent walks over; the lower seed winning is an upset. A new rule set is a
// new version; decided matches stay; the takes it cuts are named in `cut`.

/** A whole bracket as the desk reads it. */
export type Bracket = {
  readonly draw: Draw;
  readonly matches: readonly Match[];
  /** The match the owner judges next, if one is booked and undecided. */
  readonly current?: Match;
  /** The tournament's winner, once the final is decided. */
  readonly champion?: string;
};

/** Draw a new bracket over a field (entrants: the lyric-gate passers, seeded by the rules). */
export async function drawFor(store: Store, field: DrawField, rules: readonly LabRule[], actor: Actor): Promise<Result<Draw>> {
  void store;
  void field;
  void rules;
  void actor;
  return err("unavailable", "yue2: the draw is not built yet (WP-A)");
}

/** A new version of a draw under other rules; decided matches stay; returns the new version. */
export async function reseed(store: Store, drawId: string, rules: readonly LabRule[], actor: Actor): Promise<Result<Draw>> {
  void store;
  void drawId;
  void rules;
  void actor;
  return err("unavailable", "yue2: the draw is not built yet (WP-A)");
}

/** Queue every match whose two entrants are known and that has no pair yet; returns the pair ids queued. */
export async function bookNext(store: Store, drawId: string, actor: Actor): Promise<Result<readonly string[]>> {
  void store;
  void drawId;
  void actor;
  return err("unavailable", "yue2: the draw is not built yet (WP-A)");
}

/** The bracket of a draw's newest version, folded with its pairs and votes. */
export async function bracketOf(store: Store, drawId: string): Promise<Result<Bracket>> {
  void store;
  void drawId;
  return err("unavailable", "yue2: the draw is not built yet (WP-A)");
}

/** Every draw's newest version, newest first. */
export function draws(store: Store): Result<readonly Draw[]> {
  void store;
  return err("unavailable", "yue2: the draw is not built yet (WP-A)");
}
