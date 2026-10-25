import type { Channel } from "@gt/domain/slot";
import type { Reader } from "@gt/kernel/store";
import { STOPPED_TEXT } from "./publish.ts";

// A CHANNEL'S STANDING - "when did this last work, and has it failed every time since?"
// (outbound-notifications: channel-health-tracking). v1 had no answer but the Calendar's list of
// red slots: a revoked refresh token read as five unrelated failures. The standing is DERIVED
// from the ledger the publish writes anyway - each `publish` and `slot.fail` event carries its
// channel (@gt/kernel/slots/write.ts putSlotIn) - so it is durable across restarts, needs no
// table of its own, and is recomputed by the one fold below (nothing to drift from it).
//
// NO BREAKER. The technique's breaker protects shared dispatch state from one dead sink; here
// no such state exists - every slot is claimed and judged on its own, a failure lands once on
// the slot it belongs to, and nothing waits behind it. Tripping would turn "failed: invalid_grant"
// (the sentence an operator can act on) into "missed" (one they cannot). Deviation recorded.

/** One publish attempt. `notTheChannel`: the slot failed for a reason of this machine's (a dead
 *  claimant, a stop before the upload began), or it went out DRY - a rehearsal that wrote a plan
 *  and never reached the platform. Either says nothing about the channel's health: a dry run is
 *  not "the last time it worked", and it must not clear a live failure still standing. */
export type Attempt = { readonly at: string; readonly ok: boolean; readonly error?: string; readonly notTheChannel: boolean };

export type Standing = {
  readonly channel: Channel;
  /** Attempts read, newest first, bounded by the caller's window. */
  readonly attempts: number;
  readonly lastAttemptAt: string | null;
  readonly lastSuccessAt: string | null;
  /** The newest failure's sentence, verbatim. */
  readonly lastError: string | null;
  /** Failures in a row, newest first, since the last success (or since the window began). */
  readonly failuresSinceSuccess: number;
};

/** The fold: `attempts` newest first. */
export function standingOf(channel: Channel, all: readonly Attempt[]): Standing {
  const attempts = all.filter((a) => !a.notTheChannel);
  let failures = 0;
  let lastSuccessAt: string | null = null;
  for (const a of attempts) {
    if (a.ok) {
      lastSuccessAt = a.at;
      break;
    }
    failures++;
  }
  const lastError = attempts.find((a) => !a.ok)?.error ?? null;
  return { channel, attempts: attempts.length, lastAttemptAt: attempts[0]?.at ?? null, lastSuccessAt, lastError, failuresSinceSuccess: failures };
}

const WINDOW = 200;

/** A channel's last `limit` publish attempts, from the ledger. */
export function attemptsIn(r: Reader, channel: Channel, limit = WINDOW): Attempt[] {
  return r
    .all(
      "SELECT type, at, json_extract(data, '$.error') AS error, json_extract(data, '$.interrupted') AS interrupted, json_extract(data, '$.dry') AS dry FROM events WHERE type IN ('publish', 'slot.fail') AND json_extract(data, '$.channel') = ? ORDER BY seq DESC LIMIT ?",
      channel,
      limit,
    )
    .map((row) => {
      const error = row["error"];
      const rehearsal = row["type"] === "publish" && row["dry"] === 1;
      const ours = rehearsal || (row["interrupted"] !== null && row["interrupted"] !== undefined) || error === STOPPED_TEXT;
      return { at: String(row["at"]), ok: row["type"] === "publish", ...(typeof error === "string" ? { error } : {}), notTheChannel: ours };
    });
}

export function standingIn(r: Reader, channel: Channel, limit = WINDOW): Standing {
  return standingOf(channel, attemptsIn(r, channel, limit));
}
