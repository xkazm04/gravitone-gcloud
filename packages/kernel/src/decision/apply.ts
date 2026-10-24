import { z } from "zod";
import type { ApplyStatus } from "@gt/domain/board";
import type { Decision } from "@gt/domain/decision";
import { parseAt } from "@gt/domain/door";
import { AppError, err, errorMessage, ok, type AppErrorCode, type Result } from "@gt/domain/errors";
import { packetIdSchema, type PacketId } from "@gt/domain/ids";
import type { Packet } from "@gt/domain/packet";
import type { Effects } from "../effects.ts";
import { append } from "../events.ts";
import type { Reader, Row, Tx } from "../store.ts";
import { LEASE_MS, planFinish, planTake, type ApplyOutcome, type ApplyRow, type FinishPlan } from "./apply-core.ts";
import { committedResult, returnedPlan, type CommitResult, type ReturnResult } from "./commit.ts";
import { actorOf, type Author } from "./driver.ts";
import { currentDecisions, must, readPacket } from "./read.ts";

// THE APPLY DRIVER - delivers a committed packet's outcome to v1 through the
// source adapter's `apply`, over the Effects port: take (one tx), the call (the
// port's `call`, the only effect that leaves the machine), finish (one tx).
// The policy - claims, leases, attempts, backoff, the stuck ceiling - is
// ./apply-core.ts; this file reads rows, asks it, and writes what it says.
//
// Callers: the reconciler (non-blocking on a Floor or Board render, and
// `pipeline/ledger-sync.mts apply`), each under its own holder id. Two of them
// racing for one row is the case the conditional claim exists for: one UPDATE
// wins, the other finds `changes === 0` and moves on.
//
// Every outcome is an Event on the packet, actor `machine`: applied, failed
// (v1's sentence verbatim, and when the next attempt is due), stuck. A stuck
// row is the Floor's to show; `redriveApply` is the operator's way back.

const rowSchema = z.object({
  packetId: packetIdSchema,
  act: z.enum(["commit", "return"]),
  ticket: z.string(),
  state: z.enum(["pending", "applied", "stuck"]),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  nextAt: z.string(),
  holder: z.string().nullable(),
  leaseUntil: z.string().nullable(),
});

const COLUMNS = "packet_id AS packetId, act, ticket, state, attempts, last_error AS lastError, next_at AS nextAt, holder, lease_until AS leaseUntil";

const readRow = (row: Row): ApplyRow & { readonly packetId: PacketId } => must(parseAt("apply row", rowSchema, row));

function rowOf(r: Reader, packetId: string): (ApplyRow & { readonly packetId: PacketId }) | undefined {
  const row = r.get(`SELECT ${COLUMNS} FROM packet_applies WHERE packet_id = ?`, packetId);
  return row === undefined ? undefined : readRow(row);
}

/** Everything an adapter's apply needs, read in the claim's own snapshot. */
export type ApplyClaim = {
  readonly packetId: PacketId;
  readonly act: "commit" | "return";
  readonly ticket: string;
  /** 1-based; the attempt this claim is. */
  readonly attempt: number;
  readonly holder: string;
  readonly leaseUntil: string;
  readonly packet: Packet;
  /** Each candidate's final decision (reasons and notes included, for v1's verdict writers). */
  readonly decisions: readonly Decision[];
  /** The commit's result, or the return's plan. */
  readonly outcome: { readonly act: "commit"; readonly result: CommitResult } | { readonly act: "return"; readonly result: ReturnResult };
};

const machine = (holder: string) => ({ kind: "machine" as const, id: holder });

function outcomeOf(t: Tx, row: ApplyRow & { readonly packetId: PacketId }): ApplyClaim["outcome"] {
  const stored = row.act === "return" ? returnedPlan(t, row.packetId) : committedResult(t, row.packetId);
  if (stored === undefined) throw new AppError("internal", `apply: packet ${row.packetId} has a ${row.act} apply row and no ${row.act} record`);
  const value = must<CommitResult | ReturnResult>(stored);
  return "plan" in value ? { act: "return", result: value } : { act: "commit", result: value };
}

export type TakeOptions = { readonly holder: string; readonly leaseMs?: number; /** Only this packet's row. */ readonly packetId?: PacketId };

/** How many due rows one take looks at; a row that escalates instead of being
 *  claimed does not stop the take from reaching the next. */
const TAKE_SCAN = 16;

/**
 * Claim the oldest due apply for `holder`, or undefined when nothing is due.
 * The claim is a conditional UPDATE on the attempt count it read (atomic-
 * claiming: the row count is the election result), and it counts the attempt.
 */
export function takeApply(t: Tx, opts: TakeOptions): ApplyClaim | undefined {
  const due = t.all(
    `SELECT ${COLUMNS} FROM packet_applies
      WHERE state = 'pending' AND next_at <= ? AND (lease_until IS NULL OR lease_until <= ?) AND (? IS NULL OR packet_id = ?)
      ORDER BY next_at, packet_id LIMIT ${TAKE_SCAN}`,
    t.at, t.at, opts.packetId ?? null, opts.packetId ?? null,
  );
  for (const raw of due) {
    const row = readRow(raw);
    const plan = planTake(row, t.at, opts.leaseMs ?? LEASE_MS);
    if (plan.kind === "skip") continue;
    if (plan.kind === "stuck") {
      t.run("UPDATE packet_applies SET state = 'stuck', last_error = ?, holder = NULL, lease_until = NULL, done_at = ? WHERE packet_id = ? AND attempts = ? AND state = 'pending'", plan.error, t.at, row.packetId, row.attempts);
      append(t, { actor: machine(opts.holder), type: "decision.apply-stuck", subject: { kind: "packet", id: row.packetId }, data: { act: row.act, ticket: row.ticket, attempts: plan.attempts, error: plan.error, reaped: true } });
      continue;
    }
    const won = t.run(
      "UPDATE packet_applies SET attempts = ?, holder = ?, lease_until = ? WHERE packet_id = ? AND state = 'pending' AND attempts = ?",
      plan.attempts, opts.holder, plan.leaseUntil, row.packetId, row.attempts,
    );
    if (won.changes !== 1) continue;
    if (plan.reaped) {
      append(t, {
        actor: machine(opts.holder),
        type: "decision.apply-failed",
        subject: { kind: "packet", id: row.packetId },
        data: { act: row.act, ticket: row.ticket, attempt: row.attempts, error: `the applier ${row.holder ?? "?"} held attempt ${row.attempts} past its lease and never reported`, code: "unavailable", reaped: true },
      });
    }
    const claim = claimOf(t, row, opts.holder, plan);
    if (claim.ok) return claim.value;
    // An unreadable claim (a stored packet, decision or result the door refuses) takes the severe
    // bucket at once (fail-loud-classification-default): stuck, with the door's sentence. Thrown
    // instead, the take rolled back, the row kept its place at the head of the due order, and every
    // later drain threw on it again - one bad packet held every other packet's apply behind it.
    // More attempts cannot heal it; a redrive after the record is repaired is the way back.
    t.run(`UPDATE packet_applies SET state = 'stuck', last_error = ?, holder = NULL, lease_until = NULL, done_at = ? WHERE packet_id = ? AND state = 'pending' AND holder = ?`, claim.error, t.at, row.packetId, opts.holder);
    append(t, { actor: machine(opts.holder), type: "decision.apply-stuck", subject: { kind: "packet", id: row.packetId }, data: { act: row.act, ticket: row.ticket, attempts: plan.attempts, error: claim.error, permanent: true, unreadable: true } });
  }
  return undefined;
}

/** The claim's reads, or the door's sentence when one of them refuses (an AppError; anything else propagates). */
function claimOf(t: Tx, row: ApplyRow & { readonly packetId: PacketId }, holder: string, plan: { readonly attempts: number; readonly leaseUntil: string }): { readonly ok: true; readonly value: ApplyClaim } | { readonly ok: false; readonly error: string } {
  try {
    return {
      ok: true,
      value: {
        packetId: row.packetId,
        act: row.act,
        ticket: row.ticket,
        attempt: plan.attempts,
        holder,
        leaseUntil: plan.leaseUntil,
        packet: readPacket(t, row.packetId),
        decisions: currentDecisions(t, row.packetId).decisions,
        outcome: outcomeOf(t, row),
      },
    };
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    return { ok: false, error: `apply: packet ${row.packetId} cannot be read for delivery: ${e.message}` };
  }
}

/** Record what `claim`'s attempt did. A claim that was reaped meanwhile is `lost` and writes nothing. */
export function finishApply(t: Tx, claim: Pick<ApplyClaim, "packetId" | "holder">, outcome: ApplyOutcome): FinishPlan["kind"] {
  const row = rowOf(t, claim.packetId);
  if (row === undefined) throw new AppError("not-found", `apply: no apply row for packet ${claim.packetId}`);
  const plan = planFinish(row, claim.holder, outcome, t.at);
  const subject = { kind: "packet", id: row.packetId };
  const held = "WHERE packet_id = ? AND state = 'pending' AND holder = ?";
  switch (plan.kind) {
    case "lost":
      return "lost";
    case "applied":
      t.run(`UPDATE packet_applies SET state = 'applied', holder = NULL, lease_until = NULL, done_at = ? ${held}`, t.at, row.packetId, claim.holder);
      append(t, { actor: machine(claim.holder), type: "decision.applied", subject, data: { act: row.act, ticket: row.ticket, attempts: row.attempts } });
      return "applied";
    case "retry":
      t.run(`UPDATE packet_applies SET last_error = ?, next_at = ?, holder = NULL, lease_until = NULL ${held}`, plan.error, plan.nextAt, row.packetId, claim.holder);
      append(t, { actor: machine(claim.holder), type: "decision.apply-failed", subject, data: { act: row.act, ticket: row.ticket, attempt: row.attempts, error: plan.error, code: outcome.ok ? "internal" : outcome.code, nextAt: plan.nextAt } });
      return "retry";
    case "stuck":
      t.run(`UPDATE packet_applies SET state = 'stuck', last_error = ?, holder = NULL, lease_until = NULL, done_at = ? ${held}`, plan.error, t.at, row.packetId, claim.holder);
      append(t, { actor: machine(claim.holder), type: "decision.apply-stuck", subject, data: { act: row.act, ticket: row.ticket, attempts: row.attempts, error: plan.error, permanent: plan.permanent } });
      return "stuck";
  }
}

/** The operator's way back from `stuck` (dead-letter-design: redrive): pending,
 *  due now, a fresh attempt budget; the last error stays until the next attempt replaces it. */
export function redriveApply(t: Tx, input: Author & { readonly packetId: PacketId }): Result<void> {
  const row = rowOf(t, input.packetId);
  if (row === undefined) return err("not-found", `apply: packet ${input.packetId} has nothing to apply`);
  if (row.state !== "stuck") return err("refused", `apply: packet ${input.packetId} is ${row.state}; only a stuck apply is redriven`);
  t.run("UPDATE packet_applies SET state = 'pending', attempts = 0, next_at = ?, done_at = NULL WHERE packet_id = ? AND state = 'stuck'", t.at, row.packetId);
  append(t, { actor: actorOf(input), type: "decision.apply-redriven", subject: { kind: "packet", id: row.packetId }, data: { act: row.act, ticket: row.ticket, after: row.attempts, surface: input.surface } });
  return ok(undefined);
}

/** A surface's view of one packet's apply, or undefined before its commit. */
export function applyStatus(r: Reader, packetId: string): ApplyStatus | undefined {
  const row = rowOf(r, packetId);
  return row === undefined ? undefined : applyStatusOf(row);
}

/** The status of an outbox row already read (the rail joins it rather than asking per packet). */
export function applyStatusOf(row: Pick<ApplyRow, "act" | "state" | "attempts" | "lastError" | "nextAt">): ApplyStatus {
  return {
    act: row.act,
    state: row.state,
    attempts: row.attempts,
    ...(row.lastError === null ? {} : { lastError: row.lastError }),
    ...(row.state === "pending" ? { nextAt: row.nextAt } : {}),
  };
}

/** A source adapter's apply: v1's own writers, idempotent. Its error message is v1's sentence. */
export type Applier = (claim: ApplyClaim) => Promise<Result<void>>;

export type ApplyReport = { readonly packetId: PacketId; readonly attempt: number; readonly result: FinishPlan["kind"] };

/**
 * One delivery: take, call, finish. A throw from the adapter is a failed
 * attempt with its message (never swallowed: it is the row's lastError and an
 * Event); it is caught INSIDE the port's call, so a crash of the process
 * itself still propagates.
 */
export async function applyNext(fx: Effects, opts: TakeOptions & { readonly apply: Applier }): Promise<ApplyReport | undefined> {
  const claimed = fx.tx("take-apply", (t) => takeApply(t, opts));
  if (!claimed.ok) throw claimed.error;
  const claim = claimed.value;
  if (claim === undefined) return undefined;
  const outcome = await fx.call(`apply:${claim.packet.source}`, async (): Promise<ApplyOutcome> => {
    try {
      const r = await opts.apply(claim);
      return r.ok ? { ok: true } : { ok: false, error: r.error.message, code: r.error.code };
    } catch (e) {
      const code: AppErrorCode = "internal";
      return { ok: false, error: errorMessage(e), code };
    }
  });
  const finished = fx.tx("finish-apply", (t) => finishApply(t, claim, outcome));
  if (!finished.ok) throw finished.error;
  return { packetId: claim.packetId, attempt: claim.attempt, result: finished.value };
}

/** Deliver due applies until none is due or `max` were tried (bounded: a reconciler on a render must return). */
export async function drainApplies(fx: Effects, opts: TakeOptions & { readonly apply: Applier; readonly max?: number }): Promise<ApplyReport[]> {
  const out: ApplyReport[] = [];
  const max = opts.max ?? 8;
  while (out.length < max) {
    const r = await applyNext(fx, opts);
    if (r === undefined) break;
    out.push(r);
  }
  return out;
}
