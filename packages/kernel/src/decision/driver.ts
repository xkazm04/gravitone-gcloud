import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import type { Decision, RejectReason } from "@gt/domain/decision";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import { candidateIdSchema, packetIdSchema, type CandidateId, type PacketId } from "@gt/domain/ids";
import { type Packet, packetMachine, packetSchema } from "@gt/domain/packet";
import { canonical } from "../canonical.ts";
import { append } from "../events.ts";
import type { Tx } from "../store.ts";
import { blindRank, currentOf, planCommit, planPatch, planUndo, type Change, type UndecidedAs } from "./core.ts";
import { currentDecisions, head, items, must, rows } from "./read.ts";
import { splitKey } from "./schema.ts";

// THE DECISION DRIVER - the server half of v1's verdict kernel
// (lib/foundry/verdictLog.ts) and of the Board's commit (lib/foundry/store.ts
// commitRun with its preview token), over one store.
//
// Every function takes the caller's `Tx`, so a decision lands in the same
// transaction as whatever it is part of, and every state change writes its
// Event there too (events.ts, the outbox). What v1 needed a run lock for - "a
// verdict write that arrives mid-commit waits, then sees committed" - is the
// store's write lock: the commit and the patch cannot interleave.
//
// THE 409 BODY. A patch on a stale base is refused with the CURRENT decisions
// of the keys it named and the current revision, so the client re-reads only
// what it raced on. v1 answered with the revision alone and the client
// re-fetched the whole map.
//
// What is NOT here, and where it lives: the 400 ms merge window and the
// pagehide keepalive are the client's (wave 3, ui/board); they decide WHEN a
// patch goes out, and this file decides whether it lands.

export type By = "operator" | "agent";

export type Author = {
  readonly by: By;
  /** Which surface wrote it: "board", "cli", "foundry". */
  readonly surface: string;
  /** The ledger actor's id; the actor kind is `by`. Defaults to `by`. */
  readonly who?: string;
};

export type OpenInput = {
  readonly packet: Packet;
  /** A blind pair's machine pick per pair: kept, and readable only after the
   *  operator's verdict on that pair (read.ts revealPicks). */
  readonly machinePicks?: readonly { readonly row: string; readonly candidate: CandidateId }[];
};

export type PatchChange = { readonly key: string; readonly verdict: "keep" | "reject" | null; readonly reason?: RejectReason };
export type PatchInput = Author & { readonly key: string; readonly verdict: "keep" | "reject" | null; readonly reason?: RejectReason; readonly baseRev: number };
export type PatchManyInput = Author & { readonly packetId: PacketId; readonly changes: readonly PatchChange[]; readonly baseRev: number };

export type Patched = { readonly rev: number; readonly changed: readonly Decision[] };
/** The 409: the keys' current decisions and the current revision. */
export type PatchOutcome =
  | { readonly ok: true; readonly value: Patched }
  | { readonly ok: false; readonly error: AppError; readonly current?: { readonly rev: number; readonly decisions: readonly Decision[] } };

export type CommitInput = Author & {
  readonly packetId: PacketId;
  /** The idempotency key: a retried commit with the same ticket returns the first result. */
  readonly ticket: string;
  /** v1's preview token: refuse when the verdicts moved since the preview (read.ts previewCommit). */
  readonly expectRev?: number;
  /** Only a mode that may skip (core.ts MODE_POLICY); v1's forge default was "reject". */
  readonly undecidedAs?: UndecidedAs;
};

const commitResultSchema = z.object({
  packetId: z.string(),
  ticket: z.string(),
  rev: z.number().int().nonnegative(),
  kept: z.array(candidateIdSchema),
  rejected: z.array(candidateIdSchema),
  undecided: z.array(candidateIdSchema),
  at: z.string(),
});
export type CommitResult = z.output<typeof commitResultSchema>;

const actor = (a: Author) => ({ kind: a.by, id: a.who ?? a.by });

/** Open a pile at the Weir. A blind pair's arms are stored in an order derived
 *  from ids alone, never the order they arrived in. */
export function openPacket(t: Tx, input: OpenInput, author: Author): Packet {
  const p = must(parseAt("packet", packetSchema, input.packet));
  if (p.state !== "open") throw new AppError("invalid", `decision: a packet opens as open, not ${p.state}`);
  const picks = input.machinePicks ?? [];
  if (picks.length > 0 && p.mode !== "blind-pair") throw new AppError("invalid", "decision: only a blind pair carries machine picks");
  const ordered = p.mode !== "blind-pair" ? p.items : orderBlind(p);
  const stored: Packet = { ...p, items: ordered };
  const exists = t.get("SELECT 1 AS x FROM packets WHERE id = ?", p.id);
  if (exists !== undefined) throw new AppError("conflict", `decision: packet ${p.id} is already open`);
  t.run("INSERT INTO packets (id, mode, state, rev, body, opened_at) VALUES (?, ?, 'open', 0, ?, ?)", p.id, p.mode, canonical(stored), t.at);
  ordered.forEach((c, i) => t.run("INSERT INTO packet_items (packet_id, candidate_id, row, ord) VALUES (?, ?, ?, ?)", p.id, c.id, c.row ?? null, i));
  const rowsWithPick = new Set<string>();
  for (const pick of picks) {
    const arm = ordered.find((c) => c.id === pick.candidate);
    if (arm === undefined || arm.row !== pick.row) throw new AppError("invalid", `decision: pick ${pick.candidate} is not an arm of pair ${pick.row}`);
    if (rowsWithPick.has(pick.row)) throw new AppError("invalid", `decision: pair ${pick.row} has two picks`);
    rowsWithPick.add(pick.row);
    t.run("INSERT INTO packet_picks (packet_id, row, candidate_id) VALUES (?, ?, ?)", p.id, pick.row, pick.candidate);
  }
  // The event says a pick exists per pair, never which arm: the ledger is a read path too.
  append(t, {
    actor: actor(author),
    type: "decision.opened",
    subject: { kind: "packet", id: p.id },
    lane: p.lane,
    data: { mode: p.mode, source: p.source, items: ordered.length, picks: rowsWithPick.size, surface: author.surface },
  });
  return stored;
}

function orderBlind(p: Packet): Packet["items"] {
  const rank = new Map(p.items.map((c) => [c.id, blindRank(p.id, c.row ?? "", c.id)]));
  const firstSeen: string[] = [];
  for (const c of p.items) if (c.row !== undefined && !firstSeen.includes(c.row)) firstSeen.push(c.row);
  // Pairs keep the order the producer chose (it is about scenes, not arms);
  // the two arms inside a pair are ordered by id-derived rank.
  return firstSeen.flatMap((row) => p.items.filter((c) => c.row === row).sort((a, b) => ((rank.get(a.id) ?? "") < (rank.get(b.id) ?? "") ? -1 : 1)));
}

/** Patch many keys of one packet as ONE act (the Board's row-wide ⇧K/⇧X): one
 *  revision, one undo step, one Event. */
export function patchMany(t: Tx, input: PatchManyInput): PatchOutcome {
  const h = head(t, input.packetId);
  if (h.state !== "open") return err("refused", `decision: packet ${h.id} is ${h.state}; its verdicts are final`);
  const changes: Change[] = [];
  for (const c of input.changes) {
    const k = splitKey(c.key);
    if (k === undefined || k.packet !== h.id) return err("invalid", `decision: key ${c.key} is not a key of packet ${h.id}`);
    changes.push(c.reason === undefined ? { candidate: k.candidate, verdict: c.verdict } : { candidate: k.candidate, verdict: c.verdict, reason: c.reason });
  }
  if (input.baseRev !== h.rev) {
    const named = new Set(changes.map((c) => c.candidate));
    const view = currentDecisions(t, h.id, named);
    return { ok: false, error: new AppError("conflict", `decision: the verdicts moved on (now at revision ${h.rev}); re-read and try again`), current: view };
  }
  const plan = planPatch(new Set(items(t, h.id).map((i) => i.candidate_id)), currentOf(rows(t, h.id)), changes);
  if (!plan.ok) return plan;
  if (plan.value.length === 0) return ok({ rev: h.rev, changed: [] });
  const rev = h.rev + 1;
  const changed = write(t, h.id, rev, plan.value, input, "patch", null);
  append(t, {
    actor: actor(input),
    type: "decision.patched",
    subject: { kind: "packet", id: h.id },
    data: { rev, surface: input.surface, changes: plan.value.map((c) => ({ candidate: c.candidate, verdict: c.verdict, ...(c.reason === undefined ? {} : { reason: c.reason }) })) },
  });
  return ok({ rev, changed });
}

/** One key (`<packetId>::<candidateId>`), the shape of the plan's `patch`. */
export function patch(t: Tx, input: PatchInput): PatchOutcome {
  const k = splitKey(input.key);
  if (k === undefined) return err("invalid", `decision: ${input.key} is not <packetId>::<candidateId>`);
  const { key, verdict, reason, baseRev, ...author } = input;
  const packetId = must(parseAt("packet id", packetIdSchema, k.packet));
  return patchMany(t, { ...author, packetId, baseRev, changes: [reason === undefined ? { key, verdict } : { key, verdict, reason }] });
}

/** ⌫: append the inverse of the newest act not yet undone. Never a delete. */
export function undo(t: Tx, input: Author & { readonly packetId: PacketId; readonly baseRev: number }): PatchOutcome {
  const h = head(t, input.packetId);
  if (h.state !== "open") return err("refused", `decision: packet ${h.id} is ${h.state}; a committed decision is not undone`);
  if (input.baseRev !== h.rev) return { ok: false, error: new AppError("conflict", `decision: the verdicts moved on (now at revision ${h.rev})`), current: currentDecisions(t, h.id) };
  const plan = planUndo(rows(t, h.id));
  if (plan === undefined) return err("refused", `decision: nothing on packet ${h.id} is left to undo`);
  const rev = h.rev + 1;
  const changed = write(t, h.id, rev, plan.changes, input, "undo", plan.undoes);
  append(t, { actor: actor(input), type: "decision.undone", subject: { kind: "packet", id: h.id }, data: { rev, undoes: plan.undoes, surface: input.surface, keys: plan.changes.length } });
  return ok({ rev, changed });
}

function write(t: Tx, packetId: string, rev: number, changes: readonly Change[], a: Author, act: "patch" | "undo" | "commit", undoes: number | null): Decision[] {
  for (const c of changes) {
    t.run(
      "INSERT INTO decisions (packet_id, candidate_id, verdict, reason, rev, by, surface, at, act, undoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      packetId, c.candidate, c.verdict, c.reason ?? null, rev, a.by, a.surface, t.at, act, undoes,
    );
  }
  const moved = t.run("UPDATE packets SET rev = ? WHERE id = ? AND rev = ?", rev, packetId, rev - 1);
  if (moved.changes !== 1) throw new AppError("conflict", `decision: packet ${packetId} moved during the write`);
  return [...currentDecisions(t, packetId, new Set(changes.map((c) => c.candidate))).decisions];
}

/**
 * Commit a packet: ONE act (plan §2.1). Idempotent on its ticket - a retry
 * whose first attempt committed (and whose caller never heard) gets the first
 * result back, byte for byte; a different ticket on a committed packet is a
 * conflict, never a second commit.
 */
export function commit(t: Tx, input: CommitInput): Result<CommitResult> {
  const prior = t.get("SELECT ticket, result FROM packet_commits WHERE packet_id = ?", input.packetId);
  if (prior !== undefined) {
    if (prior["ticket"] !== input.ticket) return err("conflict", `decision: packet ${input.packetId} was committed under another ticket`);
    return parseJsonAt("stored commit", commitResultSchema, String(prior["result"]));
  }
  const h = head(t, input.packetId);
  const to = packetMachine.assert(h.state, "committed");
  if (!to.ok) return err("refused", `decision: packet ${h.id} is ${h.state} and cannot be committed`);
  if (input.expectRev !== undefined && input.expectRev !== h.rev) return err("conflict", `decision: the verdicts changed since the preview (revision ${input.expectRev}, now ${h.rev})`);
  const undecidedAs = input.undecidedAs ?? "reject";
  const plan = planCommit(h.mode, items(t, h.id).map((i) => i.candidate_id), currentOf(rows(t, h.id)), undecidedAs);
  if (!plan.ok) return plan;
  let rev = h.rev;
  if (plan.value.writeRejects.length > 0) {
    rev += 1;
    write(t, h.id, rev, plan.value.writeRejects.map((c) => ({ candidate: c, verdict: "reject" })), input, "commit", null);
  }
  t.run("UPDATE packets SET state = ? WHERE id = ?", to.value, h.id);
  const ids = (xs: readonly string[]) => xs.map((x) => must(parseAt("candidate id", candidateIdSchema, x)));
  const result: CommitResult = { packetId: h.id, ticket: input.ticket, rev, kept: ids(plan.value.kept), rejected: ids(plan.value.rejected), undecided: ids(plan.value.undecided), at: t.at };
  t.run("INSERT INTO packet_commits (packet_id, ticket, result, at) VALUES (?, ?, ?, ?)", h.id, input.ticket, canonical(result), t.at);
  append(t, {
    actor: actor(input),
    type: "decision.committed",
    subject: { kind: "packet", id: h.id },
    data: { rev, ticket: input.ticket, kept: result.kept.length, rejected: result.rejected.length, undecided: result.undecided.length, undecidedAs, surface: input.surface },
  });
  return ok(result);
}

/** Send a packet review back for another turn (v1 articles: awaiting-approval
 *  -> drafting). The next turn arrives as a new packet. */
export function returnPacket(t: Tx, input: Author & { readonly packetId: PacketId; readonly notes: string }): Result<void> {
  const h = head(t, input.packetId);
  if (h.mode !== "packet-review") return err("refused", `decision: only a packet review is sent back; ${h.id} is a ${h.mode}`);
  const to = packetMachine.assert(h.state, "returned");
  if (!to.ok) return err("refused", `decision: packet ${h.id} is ${h.state}`);
  t.run("UPDATE packets SET state = ? WHERE id = ?", to.value, h.id);
  append(t, { actor: actor(input), type: "decision.returned", subject: { kind: "packet", id: h.id }, data: { notes: input.notes, surface: input.surface } });
  return ok(undefined);
}
