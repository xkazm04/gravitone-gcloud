import "server-only";

import type { AbPair, AbSource, AbVote } from "@gt/domain/audio.yue2";
import type { Actor } from "@gt/domain/event";
import { err, type Result } from "@gt/domain/errors";
import type { Store } from "@gt/kernel/store";

// THE BLIND DESK'S LEDGER (spark yue2-song-lab, WP0 stub -> WP4). A pair is queued as an
// `audio.ab.queue` event and judged as an `audio.ab.vote` event (appendOnce, lane `audio`). The side
// map (which take plays as A) never leaves the server before the vote. A `neither` answer names a
// defect from lib/sound/types DEFECTS. best-of-n and across-conditions pair only takes that passed
// the lyric gate (YUE2_RECIPE.gateWer on the newest score).

/** A queued pair as the desk may show it BEFORE the vote: no side, no take ids. */
export type BlindArm = { readonly arm: "a" | "b"; readonly src: string };
export type PendingPair = {
  readonly pairId: string;
  readonly source: AbSource;
  readonly windowS: readonly [number, number];
  readonly arms: readonly [BlindArm, BlindArm];
  readonly queuedAt: string;
};

/** A judged pair, revealed. */
export type JudgedPair = { readonly pair: AbPair; readonly vote: AbVote; readonly votedAt: string };

export type WinRate = { readonly condition: string; readonly votes: number; readonly wins: number };
export type EarAgreement = { readonly metric: string; readonly votes: number; readonly agreed: number };

/** Propose pairs of one source from the lab's current takes (no write). */
export async function proposePairs(store: Store, source: AbSource, limit: number): Promise<Result<readonly AbPair[]>> {
  void store;
  void source;
  void limit;
  return err("unavailable", "yue2: pairing is not built yet (WP4)");
}

/** Queue pairs (one `audio.ab.queue` event each; re-queueing the same pair is a no-op). */
export function queuePairs(store: Store, pairs: readonly AbPair[], actor: Actor, at: string): Result<readonly string[]> {
  void store;
  void pairs;
  void actor;
  void at;
  return err("unavailable", "yue2: pairing is not built yet (WP4)");
}

/** Record a vote (refused without a defect on `neither`; another vote on a judged pair is a conflict). */
export function voteAb(store: Store, vote: AbVote, actor: Actor, at: string): Result<JudgedPair> {
  void store;
  void vote;
  void actor;
  void at;
  return err("unavailable", "yue2: voting is not built yet (WP4)");
}

export function pendingPairs(store: Store): Result<readonly PendingPair[]> {
  void store;
  return err("unavailable", "yue2: pairing is not built yet (WP4)");
}

export function judgedPairs(store: Store): Result<readonly JudgedPair[]> {
  void store;
  return err("unavailable", "yue2: pairing is not built yet (WP4)");
}

/** Wins per condition key (e.g. `cot=off cfg=1.5`) over every judged pair, on the `release` question. */
export function winRates(store: Store): Result<readonly WinRate[]> {
  void store;
  return err("unavailable", "yue2: folds are not built yet (WP4)");
}

/** For each score metric: how often the arm that scored higher was the one the owner chose. */
export function earAgreement(store: Store): Result<readonly EarAgreement[]> {
  void store;
  return err("unavailable", "yue2: folds are not built yet (WP4)");
}
