import { randomUUID } from "node:crypto";
import { parseAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData, Subject } from "@gt/domain/event";
import { slotSchema, type Channel, type Slot, type SlotDrift } from "@gt/domain/slot";
import { append } from "../events.ts";
import type { Store, Tx } from "../store.ts";
import { clashOf, clashText, planCancel, planMove, planPublishNow } from "./core.ts";
import { listSlotsIn, readSlotIn } from "./read.ts";
import type { SlotRow } from "./schema.ts";
import { driftOf, type SweepFacts } from "./sweep-core.ts";

// THE OPERATOR'S VERBS - create, move, cancel, publish-now - each ONE transaction holding the
// slot row and its ledger event (plan §4: the ledger is the spine). v1 wrote schedule.json and
// left the ledger to infer the change from the rewritten file (lib/ledger/v1/sources/publish.ts
// "observed" a reschedule when its sync next saw the new publishAt, never when it happened);
// here the act and its record are one commit.
//
// THE 409 SHAPE is the part and style drivers': a verb on a stale revision (`baseRev`) writes
// nothing and answers `conflict`, so a screen redraws from the truth rather than overwriting a
// move another tab (or the tick) just made.

export type SlotEvent = {
  readonly by: Actor;
  readonly type: string;
  readonly data: EventData;
  /** The event's subject; the slot itself unless named (a publication's `publish`). */
  readonly subject?: Subject;
};

/**
 * Write one slot inside the caller's transaction: `before` is the row planned against (null =
 * new), `fence` the claim's while it publishes (null otherwise), `dry` true only for a slot
 * published by a dry run (./schema.ts steps 2-4: it holds nothing). The record goes through its
 * door first; the one-holder index backs the clash check, and its constraint error is the
 * `conflict` the store already classifies it as.
 */
export function putSlotIn(t: Tx, before: SlotRow | null, draft: Slot, fence: number | null, e: SlotEvent, dry = false): SlotRow {
  const admitted = parseAt("slot", slotSchema, draft);
  if (!admitted.ok) throw admitted.error;
  const slot = admitted.value;
  const record = JSON.stringify(slot);
  const rev = before === null ? 1 : before.rev + 1;
  if (before === null) {
    t.run(
      "INSERT INTO slots (id, item, channel, at, state, part_id, rev, fence, dry, record, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
      slot.id, slot.libraryItemId, slot.channel, slot.at, slot.state, slot.partId ?? null, fence, dry ? 1 : 0, record, t.at, t.at,
    );
  } else {
    if (before.slot.id !== slot.id) throw new AppError("internal", `a write planned on ${before.slot.id} produced ${slot.id}`);
    const n = t.run(
      "UPDATE slots SET at = ?, state = ?, part_id = ?, rev = ?, fence = ?, dry = ?, record = ?, updated_at = ? WHERE id = ? AND rev = ?",
      slot.at, slot.state, slot.partId ?? null, rev, fence, dry ? 1 : 0, record, t.at, slot.id, before.rev,
    ).changes;
    if (n !== 1) throw new AppError("conflict", `slot ${slot.id} moved past rev ${before.rev} inside this transaction`);
  }
  append(t, {
    actor: e.by,
    type: e.type,
    subject: e.subject ?? { kind: "slot", id: slot.id },
    data: { ...e.data, slotId: slot.id, state: slot.state, at: slot.at, channel: slot.channel, item: slot.libraryItemId, rev },
  });
  const row = readSlotIn(t, slot.id);
  if (row === undefined) throw new AppError("internal", `slot ${slot.id} vanished inside its own write`);
  return row;
}

function guardClash(t: Tx, s: Slot): void {
  const c = clashOf(listSlotsIn(t, { states: ["scheduled", "publishing", "published"] }), s.libraryItemId, s.channel, s.id);
  if (c !== undefined) throw new AppError("conflict", clashText(s.libraryItemId, s.channel, c));
}

export type SlotDraft = {
  readonly libraryItemId: string;
  readonly channel: Channel;
  readonly at: string;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly partId?: string;
  /** Minted here when absent (`sl-<8 hex>`, v1's shape). */
  readonly id?: string;
};

/** What creation checks against, when the caller knows it (v1 createSlot read both itself). */
export type Readiness = Pick<SweepFacts, "wired" | "itemExists">;

/** Put a new slot on the calendar. Refused for an unwired channel or an unknown item (when
 *  `ready` is given), and for an item another slot already holds on that channel. */
export function createSlot(store: Store, draft: SlotDraft, by: Actor, ready?: Readiness): Result<SlotRow> {
  const id = draft.id ?? `sl-${randomUUID().slice(0, 8)}`;
  const parsed = parseAt("slot", slotSchema, { ...draft, id, tags: [...draft.tags], state: "scheduled" });
  if (!parsed.ok) return parsed;
  const slot = parsed.value;
  if (ready !== undefined) {
    const drift = driftOf(slot, ready);
    if (drift === "channel_not_wired") return err("conflict", `${slot.channel} is not wired`, { detail: drift });
    if (drift === "export_missing") return err("conflict", `unknown item ${slot.libraryItemId}`, { detail: drift });
  }
  return store.tx((t) => {
    if (readSlotIn(t, id) !== undefined) throw new AppError("conflict", `a slot ${id} already exists`);
    guardClash(t, slot);
    return putSlotIn(t, null, slot, null, { by, type: "slot.create", data: { title: slot.title, ...(slot.partId === undefined ? {} : { partId: slot.partId }) } });
  });
}

export type VerbOptions = {
  /** The revision the caller saw; a mismatch writes nothing and answers `conflict`. */
  readonly baseRev?: number;
};

function verb(store: Store, id: string, opts: VerbOptions, plan: (t: Tx, row: SlotRow) => SlotRow | null): Result<SlotRow> {
  return store.tx((t) => {
    const row = readSlotIn(t, id);
    if (row === undefined) throw new AppError("not-found", `no slot ${id}`);
    if (opts.baseRev !== undefined && opts.baseRev !== row.rev) throw new AppError("conflict", `slot ${id} is at rev ${row.rev}, not ${opts.baseRev}`, { detail: "stale" });
    return plan(t, row) ?? row;
  });
}

const unwrap = <T>(r: Result<T>): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

/** Move (reschedule) a scheduled, missed or failed slot to `at` (v1 updateSlot). */
export function moveSlot(store: Store, id: string, at: string, by: Actor, when: { readonly now: number; readonly windowMs: number }, opts: VerbOptions = {}): Result<SlotRow> {
  const iso = parseAt("slot time", slotSchema.shape.at, at);
  if (!iso.ok) return iso;
  return verb(store, id, opts, (t, row) => {
    const next = unwrap(planMove(row.slot, iso.value, when.now, when.windowMs));
    guardClash(t, next);
    return putSlotIn(t, row, next, null, { by, type: "slot.schedule", data: { from: row.slot.at, was: row.slot.state } });
  });
}

/** Cancel - soft, idempotent, keeping a failed slot's error (v1 cancelSlot; COMMON decision 1). */
export function cancelSlot(store: Store, id: string, by: Actor, opts: VerbOptions = {}): Result<SlotRow> {
  return verb(store, id, opts, (t, row) => {
    const next = unwrap(planCancel(row.slot));
    return next === null ? null : putSlotIn(t, row, next, null, { by, type: "slot.cancel", data: { was: row.slot.state } });
  });
}

/**
 * Asked BEFORE the write opens (L63's finding): `itemExists` is the caller's, and a caller that
 * answers it from this same store (the Library index) cannot read inside a write transaction -
 * asked there, its read fails, every item reads missing and every publish-now is refused as
 * `export_missing`. The answer is taken once, in a read, for the one item the slot names (a
 * slot's item never changes, so the write cannot meet a different one).
 */
function readinessFor(store: Store, id: string, ready: Readiness): Result<Readiness> {
  const row = store.read((r) => readSlotIn(r, id));
  if (!row.ok) return row;
  if (row.value === undefined) return err("not-found", `no slot ${id}`);
  const item = row.value.slot.libraryItemId;
  const exists = ready.itemExists(item);
  return ok({ wired: ready.wired, itemExists: (x) => x === item && exists });
}

/** Publish now: due at `now`, window overridden, never a claim (./core.ts planPublishNow). */
export function publishNow(store: Store, id: string, by: Actor, when: { readonly now: number; readonly ready?: Readiness }, opts: VerbOptions = {}): Result<SlotRow> {
  const at = new Date(when.now).toISOString();
  let ready: Readiness | undefined;
  if (when.ready !== undefined) {
    const r = readinessFor(store, id, when.ready);
    if (!r.ok) return r;
    ready = r.value;
  }
  return verb(store, id, opts, (t, row) => {
    const drift: SlotDrift | undefined = ready === undefined ? row.slot.drift : driftOf({ ...row.slot, state: "scheduled" }, ready);
    const next = unwrap(planPublishNow(row.slot, at, drift));
    guardClash(t, next);
    return putSlotIn(t, row, next, null, { by, type: "slot.publish-now", data: { from: row.slot.at, was: row.slot.state } });
  });
}

