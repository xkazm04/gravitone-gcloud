import { z } from "zod";
import { parseAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { JobId } from "@gt/domain/ids";
import { canonical } from "../canonical.ts";
import { append } from "../events.ts";
import type { ModuleMigrations } from "../migrate.ts";
import type { Reader, Tx } from "../store.ts";
import { admits, checkClass, priced, refusalSentence, reservationMachine, type Refusal, type ReservationState, type SpendClass, type Totals } from "./core.ts";

// THE SPEND LEDGER - lib/spend's reserve -> settle -> book on the kernel store.
//
// v1's file store (lib/spend/fileStore.ts) held one JSON document per class
// behind an exclusive-create lock and rewrote it whole on every transaction.
// Here a class is rows: reservations (the holds, with their lifecycle),
// booked rows (append-only; nothing deletes one), and counters. Every function
// takes the caller's `Tx`, so a reservation is written in the SAME
// transaction as the job transition that needs it (plan §3.2: "Jobs carry
// their reservation"), and every state change writes its Event there.
//
// THE WINDOW IS A QUERY, NOT A DELETE. v1 pruned aged rows out of its file and
// counted the eviction, because the file was the window. A row here is never
// removed; the window is `at_ms >= now - windowMs`. The one mutable column on a
// row is `evicted_ms`, which only the v1 port writes, so that a v1 meter's own
// eviction counter keeps its meaning (v1Port.ts).
//
// A REFUSAL IS RETURNED, NOT THROWN. It is a state change too - the refusal
// counter and its Event - so it must COMMIT. The caller (the job lot) records
// its money stop in the same transaction and must not throw after it, or the
// count it is answering is rolled back with it.
//
// Time is the transaction's own instant (`t.at`), the store clock every row
// in one transaction shares.

export const spendMigrations: ModuleMigrations = {
  module: "spend",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE spend_reservations (
  id TEXT PRIMARY KEY,
  class TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  reserved_ms INTEGER NOT NULL,
  owner TEXT NOT NULL,
  job_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('held', 'settled', 'released', 'lapsed', 'expired')),
  closed_ms INTEGER,
  CHECK ((state = 'held') = (closed_ms IS NULL))
) WITHOUT ROWID;
CREATE INDEX spend_reservations_open ON spend_reservations (class, state);
CREATE INDEX spend_reservations_owner ON spend_reservations (owner) WHERE state = 'held';
CREATE TABLE spend_rows (
  seq INTEGER PRIMARY KEY,
  class TEXT NOT NULL,
  at_ms INTEGER NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('served', 'failed')),
  basis TEXT NOT NULL,
  axes TEXT NOT NULL,
  reservation_id TEXT REFERENCES spend_reservations (id),
  evicted_ms INTEGER
);
CREATE INDEX spend_rows_window ON spend_rows (class, at_ms);
CREATE TRIGGER spend_rows_no_delete BEFORE DELETE ON spend_rows BEGIN SELECT RAISE(ABORT, 'spend rows are append-only'); END;
CREATE TRIGGER spend_rows_only_evict BEFORE UPDATE ON spend_rows
  WHEN OLD.evicted_ms IS NOT NULL OR NEW.class IS NOT OLD.class OR NEW.at_ms IS NOT OLD.at_ms OR NEW.amount IS NOT OLD.amount
    OR NEW.outcome IS NOT OLD.outcome OR NEW.basis IS NOT OLD.basis OR NEW.axes IS NOT OLD.axes OR NEW.reservation_id IS NOT OLD.reservation_id
  BEGIN SELECT RAISE(ABORT, 'spend rows are append-only; only the eviction mark may be set, once'); END;
CREATE TABLE spend_counters (
  class TEXT NOT NULL,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (class, name)
) WITHOUT ROWID;`,
    },
    {
      // Phase 4 (L25, decision 7): spend is the METER'S, and a job's spend is a
      // projection of it. So a row says which job and step it was for, and what
      // it was in dollars (a seconds-denominated class has no dollar figure
      // unless the caller knows one); and an UNPRICED call - Suno credits, a
      // studio credit, a seat that reports nothing - leaves a row WITH its
      // reason, not only a counter, so a job's unpriced count is a query. The
      // append-only trigger is re-made to cover the new columns.
      version: 2,
      sql: `
ALTER TABLE spend_reservations ADD COLUMN step TEXT;
ALTER TABLE spend_rows ADD COLUMN job_id TEXT;
ALTER TABLE spend_rows ADD COLUMN step TEXT;
ALTER TABLE spend_rows ADD COLUMN usd REAL CHECK (usd IS NULL OR usd >= 0);
CREATE INDEX spend_rows_job ON spend_rows (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX spend_reservations_job ON spend_reservations (job_id) WHERE job_id IS NOT NULL;
DROP TRIGGER spend_rows_only_evict;
CREATE TRIGGER spend_rows_only_evict BEFORE UPDATE ON spend_rows
  WHEN OLD.evicted_ms IS NOT NULL OR NEW.class IS NOT OLD.class OR NEW.at_ms IS NOT OLD.at_ms OR NEW.amount IS NOT OLD.amount
    OR NEW.outcome IS NOT OLD.outcome OR NEW.basis IS NOT OLD.basis OR NEW.axes IS NOT OLD.axes OR NEW.reservation_id IS NOT OLD.reservation_id
    OR NEW.job_id IS NOT OLD.job_id OR NEW.step IS NOT OLD.step OR NEW.usd IS NOT OLD.usd
  BEGIN SELECT RAISE(ABORT, 'spend rows are append-only; only the eviction mark may be set, once'); END;
CREATE TABLE spend_unpriced (
  seq INTEGER PRIMARY KEY,
  class TEXT NOT NULL,
  at_ms INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) > 0),
  job_id TEXT,
  step TEXT,
  reservation_id TEXT REFERENCES spend_reservations (id)
);
CREATE INDEX spend_unpriced_job ON spend_unpriced (job_id) WHERE job_id IS NOT NULL;
CREATE TRIGGER spend_unpriced_no_change BEFORE UPDATE ON spend_unpriced BEGIN SELECT RAISE(ABORT, 'unpriced rows are append-only'); END;
CREATE TRIGGER spend_unpriced_no_delete BEFORE DELETE ON spend_unpriced BEGIN SELECT RAISE(ABORT, 'unpriced rows are append-only'); END;`,
    },
  ],
};

export type Reservation = {
  readonly id: string;
  readonly cls: string;
  readonly amount: number;
  readonly reservedMs: number;
  readonly owner: string;
  readonly jobId?: string;
  readonly step?: string;
  readonly state: ReservationState;
};

/** `Result<Reservation>`, with the numbers beside a `budget` refusal. */
export type ReserveOutcome = { readonly ok: true; readonly value: Reservation } | { readonly ok: false; readonly error: AppError; readonly refusal?: Refusal };

export type SettleEntry = {
  /** The vendor's figure. Absent, zero, negative or NaN is unpriced: counted, never booked. */
  readonly amount: number | undefined;
  readonly outcome: "served" | "failed";
  /** Where the figure came from, in the class's words ("vendor", "estimate"). */
  readonly basis: string;
  readonly axes: Readonly<Record<string, string>>;
  /** The dollar figure, for a class not denominated in dollars (audio seconds); a usd class's amount is its dollars. */
  readonly usd?: number;
  /** Why an unpriced entry has no figure ("Suno credits", "seat reports nothing"); kept on its row. */
  readonly reason?: string;
};

/** Which job and step a booking serves - the run axis of attribution (cost-metering: spend-attribution). */
export type JobAxis = { readonly jobId?: string; readonly step?: string };

const nowOf = (t: Reader): number => Date.parse(t.at);

const reservationRow = z.object({
  id: z.string(),
  class: z.string(),
  amount: z.number(),
  reserved_ms: z.number().int(),
  owner: z.string(),
  job_id: z.string().nullable(),
  step: z.string().nullable(),
  state: z.enum(reservationMachine.states),
});

function readReservation(r: Reader, id: string): Reservation | undefined {
  const row = r.get("SELECT id, class, amount, reserved_ms, owner, job_id, step, state FROM spend_reservations WHERE id = ?", id);
  if (row === undefined) return undefined;
  const p = parseAt("spend reservation", reservationRow, row);
  if (!p.ok) throw p.error;
  const v = p.value;
  const base = { id: v.id, cls: v.class, amount: v.amount, reservedMs: v.reserved_ms, owner: v.owner, state: v.state };
  return { ...base, ...(v.job_id === null ? {} : { jobId: v.job_id }), ...(v.step === null ? {} : { step: v.step }) };
}

export function bump(t: Tx, cls: string, name: string, by: number): void {
  t.run("INSERT INTO spend_counters (class, name, value) VALUES (?, ?, ?) ON CONFLICT (class, name) DO UPDATE SET value = value + excluded.value", cls, name, by);
}

const num = (v: unknown): number => (typeof v === "number" ? v : 0);

/** spent, held and lapsed for a class, as of `now`. */
export function totals(r: Reader, cls: SpendClass, now: number = nowOf(r)): Totals {
  const since = now - cls.windowMs;
  const spent = num(r.get("SELECT total(amount) AS v FROM spend_rows WHERE class = ? AND at_ms >= ?", cls.id, since)?.["v"]);
  const held = num(r.get("SELECT total(amount) AS v FROM spend_reservations WHERE class = ? AND state = 'held'", cls.id)?.["v"]);
  const lapsed = num(r.get("SELECT total(amount) AS v FROM spend_reservations WHERE class = ? AND state = 'lapsed' AND closed_ms >= ?", cls.id, since)?.["v"]);
  return { spent, held, lapsed };
}

const usage = (cls: SpendClass) => ({ class: cls.id, unit: cls.unit });

/**
 * Hold `amount` against the class's ceiling for one call. `id` is minted by
 * the caller and is the idempotency key: a retried reserve (its first commit
 * landed, its caller never heard) gets the same reservation back.
 */
export function reserve(t: Tx, cls: SpendClass, input: { readonly id: string; readonly amount: number; readonly owner: string; readonly jobId?: JobId; readonly step?: string }): ReserveOutcome {
  const c = checkClass(cls);
  if (!c.ok) return c;
  if (input.id.length === 0 || input.owner.length === 0) return err("invalid", "spend: a reservation names its id and its owner");
  const prior = readReservation(t, input.id);
  if (prior !== undefined) {
    if (prior.cls !== cls.id || prior.amount !== input.amount || prior.owner !== input.owner) return err("conflict", `spend: reservation ${input.id} already exists for another call`);
    // Only a LIVE hold is the retried reserve's answer. A closed one is no hold at all: handing it
    // back would admit a second call against the ceiling unheld, and its settle would book nothing.
    if (prior.state !== "held") return err("conflict", `spend: reservation ${input.id} is ${prior.state}; a new call needs a new reservation id`);
    return ok(prior);
  }
  const now = nowOf(t);
  const tot = totals(t, cls, now);
  const v = admits(cls, tot, input.amount);
  if (!v.ok) return v;
  if (!v.value.fits) {
    bump(t, cls.id, "refusals", 1);
    bump(t, cls.id, "refused", input.amount);
    const refusals = num(t.get("SELECT value FROM spend_counters WHERE class = ? AND name = 'refusals'", cls.id)?.["value"]);
    const refusal: Refusal = { ...tot, amount: input.amount, ceiling: v.value.ceiling, windowMs: cls.windowMs, refusals, scope: "period-ceiling" };
    append(t, { actor: { kind: "machine", id: input.owner }, type: "spend.refused", subject: { kind: "reservation", id: input.id }, data: { ...usage(cls), ...refusal } });
    return { ok: false, error: new AppError("budget", refusalSentence(cls, refusal)), refusal };
  }
  t.run(
    "INSERT INTO spend_reservations (id, class, amount, reserved_ms, owner, job_id, step, state, closed_ms) VALUES (?, ?, ?, ?, ?, ?, ?, 'held', NULL)",
    input.id, cls.id, input.amount, now, input.owner, input.jobId ?? null, input.step ?? null,
  );
  append(t, {
    actor: { kind: "machine", id: input.owner },
    type: "spend.reserved",
    subject: { kind: "reservation", id: input.id },
    data: { ...usage(cls), amount: input.amount, ...(input.jobId === undefined ? {} : { jobId: input.jobId }), ...(input.step === undefined ? {} : { step: input.step }) },
  });
  const base: Reservation = { id: input.id, cls: cls.id, amount: input.amount, reservedMs: now, owner: input.owner, state: "held" };
  return ok({ ...base, ...(input.jobId === undefined ? {} : { jobId: input.jobId }), ...(input.step === undefined ? {} : { step: input.step }) });
}

function close(t: Tx, cls: SpendClass, id: string, to: ReservationState): Result<Reservation> {
  const r = readReservation(t, id);
  if (r === undefined) return err("not-found", `spend: no reservation ${id}`);
  if (r.cls !== cls.id) return err("invalid", `spend: reservation ${id} belongs to ${r.cls}, not ${cls.id}`);
  const step = reservationMachine.assert(r.state, to);
  if (!step.ok) return err("refused", `spend: reservation ${id} is ${r.state} and cannot become ${to}`);
  t.run("UPDATE spend_reservations SET state = ?, closed_ms = ? WHERE id = ?", to, nowOf(t), id);
  return ok({ ...r, state: to });
}

/** Book rows (no reservation): the counters and rows `settle` and `book` share. */
function bookIn(t: Tx, cls: SpendClass, entries: readonly SettleEntry[], reservationId: string | null, axis: JobAxis = {}): { booked: number; unpriced: number; total: number; estimated: boolean } {
  const now = nowOf(t);
  let booked = 0;
  let unpriced = 0;
  let total = 0;
  let estimated = false;
  const jobId = axis.jobId ?? null;
  const step = axis.step ?? null;
  for (const e of entries) {
    if (!priced(e.amount)) {
      unpriced++;
      t.run("INSERT INTO spend_unpriced (class, at_ms, reason, job_id, step, reservation_id) VALUES (?, ?, ?, ?, ?, ?)", cls.id, now, e.reason ?? `unpriced (${e.basis})`, jobId, step, reservationId);
      continue;
    }
    const usd = cls.unit === "usd" ? e.amount : priced(e.usd) ? e.usd : null;
    t.run(
      "INSERT INTO spend_rows (class, at_ms, amount, outcome, basis, axes, reservation_id, job_id, step, usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      cls.id, now, e.amount, e.outcome, e.basis, canonical(e.axes), reservationId, jobId, step, usd,
    );
    booked++;
    total += e.amount;
    if (e.basis === "estimate") estimated = true;
    if (e.outcome === "failed") {
      bump(t, cls.id, "bookedFailed", 1);
      bump(t, cls.id, "failed", e.amount);
    }
  }
  if (booked > 0) bump(t, cls.id, "booked", booked);
  if (unpriced > 0) bump(t, cls.id, "unpriced", unpriced);
  return { booked, unpriced, total, estimated };
}

export type Settled = { readonly reservation: Reservation; readonly booked: number; readonly unpriced: number; readonly already: boolean };

/**
 * Replace a hold (or a lapse) with what the vendor reported. Idempotent on the
 * reservation: a settle that arrives again after it landed - a deferred settle
 * replayed, a retry whose first commit the caller never heard - books nothing
 * the second time, and says so (`already`). The FIRST report is final
 * (reversible-debit-and-settle: at-most-once with the first amount final).
 */
export function settle(t: Tx, cls: SpendClass, input: { readonly id: string; readonly entries: readonly SettleEntry[] }): Result<Settled> {
  const prior = readReservation(t, input.id);
  if (prior?.state === "settled" && prior.cls === cls.id) return ok({ reservation: prior, booked: 0, unpriced: 0, already: true });
  const closed = close(t, cls, input.id, "settled");
  if (!closed.ok) return closed;
  const r0 = closed.value;
  const b = bookIn(t, cls, input.entries, input.id, { ...(r0.jobId === undefined ? {} : { jobId: r0.jobId }), ...(r0.step === undefined ? {} : { step: r0.step }) });
  const late = prior?.state === "lapsed";
  append(t, {
    actor: { kind: "machine", id: closed.value.owner },
    type: "spend.settled",
    subject: { kind: "reservation", id: input.id },
    ...(cls.unit === "usd" && b.total > 0 ? { cost: { usd: b.total, src: b.estimated ? ("model" as const) : ("real" as const) } } : {}),
    data: { ...usage(cls), held: closed.value.amount, booked: b.booked, unpriced: b.unpriced, total: b.total, late },
  });
  return ok({ reservation: closed.value, booked: b.booked, unpriced: b.unpriced, already: false });
}

/** Drop a hold the vendor never saw. */
export function release(t: Tx, cls: SpendClass, input: { readonly id: string; readonly by: string }): Result<Reservation> {
  const r = close(t, cls, input.id, "released");
  if (!r.ok) return r;
  append(t, { actor: { kind: "machine", id: input.by }, type: "spend.released", subject: { kind: "reservation", id: input.id }, data: { ...usage(cls), amount: r.value.amount } });
  return r;
}

/** One hold whose outcome is unknown (its step ended without settling it): it lapses, still counted. */
export function lapse(t: Tx, cls: SpendClass, id: string): Result<Reservation> {
  const r = close(t, cls, id, "lapsed");
  if (!r.ok) return r;
  bump(t, cls.id, "lapsed", 1);
  bump(t, cls.id, "lapsedAmount", r.value.amount);
  append(t, { actor: { kind: "machine", id: r.value.owner }, type: "spend.lapsed", subject: { kind: "reservation", id }, data: { ...usage(cls), amount: r.value.amount } });
  return r;
}

/** The owner is gone with the outcome unknown: every hold it had keeps
 *  counting at its estimate, aged from now. Returns how many lapsed. */
export function lapseOwner(t: Tx, cls: SpendClass, owner: string): number {
  const ids = t.all("SELECT id FROM spend_reservations WHERE class = ? AND owner = ? AND state = 'held' ORDER BY reserved_ms, id", cls.id, owner);
  let n = 0;
  for (const row of ids) {
    const r = lapse(t, cls, String(row["id"]));
    if (!r.ok) throw r.error;
    n++;
  }
  return n;
}

/** Book a call that held nothing (a count-only class; v1 `meter.book`). */
export function book(t: Tx, cls: SpendClass, entry: SettleEntry, who: string, axis: JobAxis = {}): void {
  const c = checkClass(cls);
  if (!c.ok) throw c.error;
  const b = bookIn(t, cls, [entry], null, axis);
  append(t, {
    actor: { kind: "machine", id: who },
    type: "spend.booked",
    subject: { kind: "spend-class", id: cls.id },
    ...(cls.unit === "usd" && b.total > 0 ? { cost: { usd: b.total, src: b.estimated ? ("model" as const) : ("real" as const) } } : {}),
    data: { ...usage(cls), booked: b.booked, unpriced: b.unpriced, total: b.total },
  });
}

export type SpendStats = Totals & {
  readonly cls: string;
  readonly ceiling: number | null;
  /** `null` for a count-only class: there is no remaining to misread. */
  readonly remaining: number | null;
  readonly windowMs: number;
  readonly windowStart: number;
  readonly windowEnd: number;
  readonly rows: number;
  readonly counters: Readonly<Record<string, number>>;
};

export function stats(r: Reader, cls: SpendClass): SpendStats {
  const now = nowOf(r);
  const tot = totals(r, cls, now);
  const counters: Record<string, number> = {};
  for (const row of r.all("SELECT name, value FROM spend_counters WHERE class = ? ORDER BY name", cls.id)) counters[String(row["name"])] = num(row["value"]);
  const rows = num(r.get("SELECT count(*) AS n FROM spend_rows WHERE class = ? AND at_ms >= ?", cls.id, now - cls.windowMs)?.["n"]);
  const remaining = cls.ceiling === null ? null : Math.max(cls.ceiling - tot.spent - tot.held - tot.lapsed, 0);
  return { cls: cls.id, ...tot, ceiling: cls.ceiling, remaining, windowMs: cls.windowMs, windowStart: now - cls.windowMs, windowEnd: now, rows, counters };
}

export function reservationOf(r: Reader, id: string): Reservation | undefined {
  return readReservation(r, id);
}
