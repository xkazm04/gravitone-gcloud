import "server-only";

import type { LabSay, LabTurn } from "@gt/domain/audio.yue2.lab";
import type { Actor } from "@gt/domain/event";
import { err, type Result } from "@gt/domain/errors";
import type { Store } from "@gt/kernel/store";

// THE SONG LAB'S AGENT RELAY (spark yue2-song-lab S2, WP0 stub -> WP-B). The compose studio's pattern on
// its OWN event types: the compose page reads `audio.say`/`audio.turn` by type with no subject filter
// (app/(studio)/audio/studio/_port/ledger.ts), so the lab writes `audio.lab.say` / `audio.lab.turn`
// (subject `songlab-session`, lane `audio`) and never appears in the compose thread. The outside agent
// (/studio-agent, song-lab mode) polls `gt_songlab inbox` and answers with `gt_songlab turn`. Presence is
// the studio's (app/(studio)/audio/studio/_live/presence.ts presenceOf). A bad proposal is dropped and
// named; a bad envelope refuses the whole turn.

/** The owner's direction, filed. */
export function appendLabSay(store: Store, input: { readonly session: string; readonly text: string }, actor: Actor, now?: Date): Result<LabSay> {
  void store;
  void input;
  void actor;
  void now;
  return err("unavailable", "yue2: the lab relay is not built yet (WP-B)");
}

export type LabTurnAnswer = { readonly turn: LabTurn; readonly dropped: readonly string[] };

/** The agent's turn, read through the door; `check` appends nothing. */
export function appendLabTurn(store: Store, raw: unknown, actor: Actor, check?: boolean): Result<LabTurnAnswer> {
  void store;
  void raw;
  void actor;
  void check;
  return err("unavailable", "yue2: the lab relay is not built yet (WP-B)");
}

export type LabInbox = { readonly says: readonly LabSay[]; readonly next?: string };

/** Says no later lab turn answers (long-poll up to `waitS`, 25 at most). */
export async function labInbox(store: Store, opts: { readonly session?: string; readonly after?: string; readonly waitS?: number }): Promise<Result<LabInbox>> {
  void store;
  void opts;
  return err("unavailable", "yue2: the lab relay is not built yet (WP-B)");
}

export type LabThread = { readonly session: string; readonly says: readonly LabSay[]; readonly turns: readonly LabTurn[] };

/** The newest lab session's says and turns, oldest first (the desk's read). */
export function labThread(store: Store, session?: string): Result<LabThread> {
  void store;
  void session;
  return err("unavailable", "yue2: the lab relay is not built yet (WP-B)");
}
