import { err, ok, type Result } from "@gt/domain/errors";
import type { MetricSnapshot, Publication } from "@gt/domain/publication";
import type { Channel } from "@gt/domain/slot";
import type { SlotState } from "@gt/domain/slot.machine";
import type { Reader, Store } from "../store.ts";
import { readPublicationRow, readSlotRow, readSnapshotRow, SLOT_COLUMNS, type SlotRow } from "./schema.ts";

// THE CALENDAR, READ - and only read. v1's `listSlots` swept before it answered (a GET that
// marked slots missed and claims failed: "a GET writes", the Phase 2 note's carried defect);
// here a read is a read transaction (`query_only`), so it cannot, and the sweep runs only in
// the worker's tick and the CLI (COMMON decision 2). A slot overdue since the last tick reads
// `scheduled` until the next one - the rail draws that honestly as overdue.

export function readSlotIn(r: Reader, id: string): SlotRow | undefined {
  const row = r.get(`SELECT ${SLOT_COLUMNS} FROM slots WHERE id = ?`, id);
  return row === undefined ? undefined : readSlotRow(row);
}

export type SlotQuery = {
  /** ISO bounds on the slot's time, inclusive from, exclusive to. */
  readonly from?: string;
  readonly to?: string;
  readonly states?: readonly SlotState[];
};

/** The calendar, earliest first (v1 listSlots' order); ties by id so the order is total. */
export function listSlotsIn(r: Reader, q: SlotQuery = {}): SlotRow[] {
  const where: string[] = [];
  const params: string[] = [];
  if (q.from !== undefined) {
    where.push("at >= ?");
    params.push(q.from);
  }
  if (q.to !== undefined) {
    where.push("at < ?");
    params.push(q.to);
  }
  if (q.states !== undefined) {
    if (q.states.length === 0) return [];
    where.push(`state IN (${q.states.map(() => "?").join(", ")})`);
    params.push(...q.states);
  }
  const sql = `SELECT ${SLOT_COLUMNS} FROM slots${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY at, id`;
  return r.all(sql, ...params).map(readSlotRow);
}

export function getSlot(store: Store, id: string): Result<SlotRow> {
  const r = store.read((x) => readSlotIn(x, id));
  if (!r.ok) return r;
  return r.value === undefined ? err("not-found", `no slot ${id}`) : ok(r.value);
}

export function listSlots(store: Store, q: SlotQuery = {}): Result<SlotRow[]> {
  return store.read((r) => listSlotsIn(r, q));
}

export function publicationOfIn(r: Reader, slotId: string): Publication | undefined {
  const row = r.get("SELECT record FROM publications WHERE slot_id = ?", slotId);
  return row === undefined ? undefined : readPublicationRow(row);
}

export function readPublicationIn(r: Reader, id: string): Publication | undefined {
  const row = r.get("SELECT record FROM publications WHERE id = ?", id);
  return row === undefined ? undefined : readPublicationRow(row);
}

/** The publication already made of `item` on `channel` in this mode, if any - v1 publisher.ts's
 *  lookup before an upload (one per item x channel x mode; `slots_one_publication` backs it). */
export function priorPublicationIn(r: Reader, item: string, channel: Channel, dry: boolean): Publication | undefined {
  const row = r.get(
    "SELECT p.record FROM publications p JOIN slots s ON s.id = p.slot_id WHERE s.item = ? AND s.channel = ? AND json_extract(p.record, '$.dry') = ? LIMIT 1",
    item, channel, dry ? 1 : 0,
  );
  return row === undefined ? undefined : readPublicationRow(row);
}

/** Every publication, oldest first. */
export function listPublicationsIn(r: Reader): Publication[] {
  return r.all("SELECT record FROM publications ORDER BY published_at, id").map(readPublicationRow);
}

/** Snapshots oldest first: one publication's, or every one when `publicationId` is absent. */
export function snapshotsIn(r: Reader, publicationId?: string): MetricSnapshot[] {
  const rows =
    publicationId === undefined
      ? r.all("SELECT record FROM metric_snapshots ORDER BY at, seq")
      : r.all("SELECT record FROM metric_snapshots WHERE publication_id = ? ORDER BY at, seq", publicationId);
  return rows.map(readSnapshotRow);
}

/**
 * Is the plan's slot part placed? (`@gt/domain/plan` `slotted`: a slot part is ratified once
 * it is on the calendar.) Placed = a slot for the part HOLDS its item on a channel - scheduled,
 * publishing or published. A missed, failed or cancelled slot needs a person again, so the
 * part waits at its gate until one is rescheduled or a new slot is made.
 */
export function slottedIn(r: Reader, partId: string): boolean {
  return r.get("SELECT 1 AS y FROM slots WHERE part_id = ? AND state IN ('scheduled', 'publishing', 'published') LIMIT 1", partId) !== undefined;
}
