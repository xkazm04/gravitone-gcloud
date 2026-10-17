import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Holder } from "@gt/domain/job";
import { SLOT_HOLDS, SLOT_MOVABLE, slotMachine, type SlotState } from "@gt/domain/slot.machine";
import { exportIdOf, type Channel, type Slot, type SlotDrift } from "@gt/domain/slot";

// THE SLOT VERBS, PURE - every state change a slot can take, as a function from the record
// (and the instant, passed in) to the next record. The driver (./write.ts, ./sweep.ts) reads,
// calls one of these, and writes the answer with its event; nothing here touches a store or a
// clock. v1 did each of these as an `Object.assign` on a row inside `withStore`
// (lib/publish/schedule.ts), so which fields a transition clears lived in five places and the
// wire contract hid the rest in `error`. Here each transition rebuilds the record from its
// stable half, so a field the next state forbids (the domain's superRefine) cannot leak
// through: a claim never outlives `publishing`, `missedAt` never outlives `missed`.

/** The half of a slot no transition touches; every state field is re-added by its transition. */
type Base = Omit<Slot, "claim" | "drift" | "missedAt" | "publicationId" | "error" | "state">;

function baseOf(s: Slot): Base {
  const { claim: _c, drift: _d, missedAt: _m, publicationId: _p, error: _e, state: _s, ...base } = s;
  return base;
}

function step(from: Slot, to: SlotState): void {
  const r = slotMachine.assert(from.state, to);
  if (!r.ok) throw new AppError("refused", `slot ${from.id}: a ${from.state} slot cannot become ${to}`);
}

const driftOf = (s: Slot): { drift?: SlotDrift } => (s.drift === undefined ? {} : { drift: s.drift });

/** Back on the calendar at `at` - a move, a reschedule of a missed or failed slot, a publish-now.
 *  A failure's sentence goes with the state (it is on the ledger's `slot.fail`); drift stays,
 *  because only the sweep knows whether its cause is gone. */
export function toScheduled(s: Slot, at: string): Slot {
  step(s, "scheduled");
  return { ...baseOf(s), at, state: "scheduled", ...driftOf(s) };
}

export function toMissed(s: Slot, missedAt: string): Slot {
  step(s, "missed");
  return { ...baseOf(s), state: "missed", missedAt, ...driftOf(s) };
}

/** The claim: `publishing`, naming the holder. Drift never rides into a claim (it is never claimed). */
export function toPublishing(s: Slot, holder: Holder, at: string): Slot {
  step(s, "publishing");
  if (s.drift !== undefined) throw new AppError("refused", `slot ${s.id} has drifted (${s.drift}) and is never claimed`);
  return { ...baseOf(s), state: "publishing", claim: { holder, at } };
}

export function toPublished(s: Slot, publicationId: string): Slot {
  step(s, "published");
  return { ...baseOf(s), state: "published", publicationId };
}

/** The channel's sentence, verbatim (or v1's INTERRUPTED_TEXT for a dead claimant). */
export function toFailed(s: Slot, error: string): Slot {
  step(s, "failed");
  return { ...baseOf(s), state: "failed", error };
}

/** Soft. A failed slot's error is KEPT (COMMON decision 1: the month draws it dim) - erasing it
 *  would rewrite why the slot never went out. */
export function toCancelled(s: Slot): Slot {
  step(s, "cancelled");
  return { ...baseOf(s), state: "cancelled", ...(s.error === undefined ? {} : { error: s.error }) };
}

/** Annotate or clear drift on a waiting slot; the state does not move. */
export function withDrift(s: Slot, drift: SlotDrift | undefined): Slot {
  const { drift: _d, ...rest } = s;
  return drift === undefined ? rest : { ...rest, drift };
}

/** A slot as the clash check weighs it: `dry` when it was published by a dry run. */
export type Holding = { readonly slot: Slot; readonly dry?: true };

/**
 * Another slot already holding `item` on `channel` (v1 schedule.ts clashOf). A slot published
 * DRY holds nothing (the Director's ruling on L62): a rehearsal sent nothing, and v1's publisher
 * let the live upload follow it - one upload per item x channel x mode, not per item x channel.
 */
export function clashOf(held: readonly Holding[], item: string, channel: Channel, exceptId?: string): Slot | undefined {
  return held.find(({ slot: s, dry }) => s.id !== exceptId && s.libraryItemId === item && s.channel === channel && SLOT_HOLDS.includes(s.state) && !(dry === true && s.state === "published"))?.slot;
}

export const clashText = (item: string, channel: Channel, c: Slot): string =>
  `${item} is already on ${channel} (slot ${c.id}, ${c.state} for ${c.at})`;

/** v1 publisher.ts's refusal of a second upload in one mode, word for word for an export. */
export function publishedText(item: string, channel: Channel, publicationId: string, dry: boolean): string {
  const exportId = exportIdOf(item);
  return `${exportId === undefined ? item : `export ${exportId}`} is already published on ${channel} (publication ${publicationId}${dry ? ", dry" : ""})`;
}

const movable = (s: Slot, verb: string): Result<Slot> =>
  SLOT_MOVABLE.includes(s.state) ? ok(s) : err("conflict", `a ${s.state} slot cannot be ${verb}`);

/**
 * A person's move (v1 updateSlot). Refused for a slot that is not waiting, and for a time
 * already past the missed window - the very next sweep would mark it missed again, so the
 * answer is the sentence now rather than a slot that flips under the operator's hand.
 */
export function planMove(s: Slot, at: string, now: number, windowMs: number): Result<Slot> {
  const m = movable(s, "rescheduled");
  if (!m.ok) return m;
  if (now - Date.parse(at) > windowMs) return err("conflict", `${at} is already past the missed window; give a later time`);
  return ok(toScheduled(s, at));
}

/** Cancel: idempotent on a cancelled slot (v1 answered it unchanged), refused once it went out. */
export function planCancel(s: Slot): Result<Slot | null> {
  if (s.state === "cancelled") return ok(null);
  const m = movable(s, "cancelled");
  return m.ok ? ok(toCancelled(s)) : m;
}

/**
 * Publish now (v1 claimSlot's intent, not its act): the person's choice overrides the missed
 * window - a missed slot may go out - but it is NEVER a claim. The slot becomes due at `now`;
 * the next sweep under a lease claims it like any other, so an act from the browser can never
 * stand beside a running tick as a second claimant. A drifted slot is refused with its reason.
 */
export function planPublishNow(s: Slot, now: string, drift: SlotDrift | undefined): Result<Slot> {
  const m = movable(s, "published");
  if (!m.ok) return m;
  if (drift !== undefined) return err("refused", `slot ${s.id} cannot go out: ${drift}`, { detail: drift });
  return ok(withDrift(toScheduled(s, now), undefined));
}
