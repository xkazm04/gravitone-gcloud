import type { Channel, Slot, SlotDrift } from "@gt/domain/slot";

// THE SWEEP, DECIDED - v1's `sweep(now, {claim})` (lib/publish/schedule.ts) as a pure function
// of the calendar and four facts handed in: the instant, the missed window, which channels are
// wired, and which library items exist. v1 read the clock, PUBLISH_MISSED_MIN, the channel
// readiness and the export directory itself, inside the lock; here the driver (./sweep.ts)
// gathers them and this file only decides, so every rule below is a table-driven test.
//
// THE RULES, v1's, in v1's order per slot:
//   publishing  its claim is judged by the lease's evidence (claimState): a holder that is
//               gone, or whose heartbeat lapsed, or no lease at all -> `interrupt` (failed,
//               INTERRUPTED_TEXT). Never back to scheduled: at-most-once lives in that absence
//               (delivery-guarantees: stuck-reaping, the "fail, do not requeue" verdict for an
//               effect that may already have happened).
//   waiting     drift first: not wired -> channel_not_wired, item gone -> export_missing;
//               annotated on a scheduled or missed slot, cleared when the cause is gone.
//   scheduled   overdue past the window -> `miss` (never published late: scheduling's
//               missed-run-semantics, the SKIP policy, because a stale upload after downtime is
//               worse than none); due within it and undrifted -> `claim`, only when the caller
//               is a tick (`claim: true`). A read never sweeps at all (COMMON decision 2).
//   blog        never claimed: its publication is the approve's pull request (owner ruling 4),
//               an act, not an upload the tick could perform. The window still applies - a
//               blog slot whose approve never came is missed, visibly.

export type SweepFacts = {
  /** Epoch ms. */
  readonly now: number;
  readonly windowMs: number;
  readonly wired: ReadonlySet<Channel>;
  readonly itemExists: (libraryItemId: string) => boolean;
};

/** What the lease on `slot:<id>` says about a publishing slot's claimant. */
export type ClaimState = "live" | "stale" | "absent";

export type SweepDecision =
  | { readonly kind: "interrupt"; readonly id: string; readonly why: Exclude<ClaimState, "live"> }
  | { readonly kind: "drift"; readonly id: string; readonly drift: SlotDrift }
  | { readonly kind: "undrift"; readonly id: string; readonly was: SlotDrift }
  | { readonly kind: "miss"; readonly id: string; readonly overdueMs: number }
  | { readonly kind: "claim"; readonly id: string };

export type SweepOptions = {
  /** A tick claims what is due; anything else only keeps the calendar honest. */
  readonly claim: boolean;
  readonly claimState: (slotId: string) => ClaimState;
  /** Restrict the claims to these slots (a CLI `tick --only`); the rest is still swept. */
  readonly only?: ReadonlySet<string>;
};

/** Channels the tick never claims on: their publication is an act elsewhere. */
export const ACT_CHANNELS: ReadonlySet<Channel> = new Set<Channel>(["blog"]);

/** Why a waiting slot cannot fire, or undefined when it can (v1 schedule.ts driftOf). */
export function driftOf(s: Slot, facts: Pick<SweepFacts, "wired" | "itemExists">): SlotDrift | undefined {
  if (s.state !== "scheduled" && s.state !== "missed") return undefined;
  if (!facts.wired.has(s.channel)) return "channel_not_wired";
  if (!facts.itemExists(s.libraryItemId)) return "export_missing";
  return undefined;
}

/** Every decision one pass makes, in calendar order. Decisions on one slot are applied in the
 *  order given (a drift annotation before the miss that keeps it). */
export function planSweep(slots: readonly Slot[], facts: SweepFacts, opts: SweepOptions): SweepDecision[] {
  const out: SweepDecision[] = [];
  for (const s of [...slots].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
    if (s.state === "publishing") {
      const c = opts.claimState(s.id);
      if (c !== "live") out.push({ kind: "interrupt", id: s.id, why: c });
      continue;
    }
    if (s.state !== "scheduled" && s.state !== "missed") continue;

    const drift = driftOf(s, facts);
    if (drift !== undefined && s.drift !== drift) out.push({ kind: "drift", id: s.id, drift });
    else if (drift === undefined && s.drift !== undefined) out.push({ kind: "undrift", id: s.id, was: s.drift });
    if (s.state !== "scheduled") continue;

    const overdueMs = facts.now - Date.parse(s.at);
    if (!(overdueMs >= 0)) continue;
    if (overdueMs > facts.windowMs) {
      out.push({ kind: "miss", id: s.id, overdueMs });
      continue;
    }
    if (!opts.claim || drift !== undefined || ACT_CHANNELS.has(s.channel)) continue;
    if (opts.only !== undefined && !opts.only.has(s.id)) continue;
    out.push({ kind: "claim", id: s.id });
  }
  return out;
}
