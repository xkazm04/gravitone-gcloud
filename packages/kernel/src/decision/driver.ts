import { z } from "zod";
import { pickVerdicts, type PickOutcome } from "@gt/domain/board";
import { parseAt } from "@gt/domain/door";
import type { Decision } from "@gt/domain/decision";
import { AppError, err, ok } from "@gt/domain/errors";
import { candidateIdSchema, packetIdSchema, type CandidateId, type PacketId } from "@gt/domain/ids";
import { type Packet, packetSchema } from "@gt/domain/packet";
import { checkVerdict } from "@gt/domain/source";
import { canonical } from "../canonical.ts";
import { append } from "../events.ts";
import type { Tx } from "../store.ts";
import { blindRank, currentOf, pairOutcomes, planPatch, planPick, planUndo, type Change } from "./core.ts";
import { currentDecisions, head, items, must, pairsOf, rows } from "./read.ts";
import { splitKey, type Act } from "./schema.ts";

// THE DECISION DRIVER - the server half of v1's verdict kernel
// (lib/foundry/verdictLog.ts) over one store: open, patch, pick, undo. The
// commit and the return, each of which also writes the apply outbox, are in
// ./commit.ts.
//
// Every function takes the caller's `Tx`, so a decision lands in the same
// transaction as whatever it is part of, and every state change writes its
// Event there too (events.ts, the outbox). What v1 needed a run lock for - "a
// verdict write that arrives mid-commit waits, then sees committed" - is the
// store's write lock: the commit and the patch cannot interleave.
//
// THE 409 BODY. A write on a stale base is refused with the CURRENT decisions
// of the keys it named and the current revision, so the client re-reads only
// what it raced on. v1 answered with the revision alone and the client
// re-fetched the whole map.
//
// THE VERDICT DOOR knows the packet's source. A reason is a word from that
// source's list (@gt/domain/source checkVerdict), and the check runs here,
// before any row, because only here is the packet's source in hand; the SQL
// keeps the structural rules (a JSON list, reasons only on a reject).

export type By = "operator" | "agent";

export type Author = {
  readonly by: By;
  /** Which surface wrote it: "board", "cli", "foundry". */
  readonly surface: string;
  /** The ledger actor's id; the actor kind is `by`. Defaults to `by`. */
  readonly who?: string;
};

/** A verdict v1 already holds, imported as the packet's first revision. */
export type InitialDecision = {
  readonly candidate: string;
  readonly verdict: "keep" | "reject";
  readonly reasons?: readonly string[];
  readonly note?: string;
  /** As v1 recorded it: a human's verdict is the operator's, a model's the agent's. */
  readonly by: By;
  readonly surface: string;
  /** When v1 recorded it; history keeps v1's instant, not the import's. */
  readonly at: string;
};

export type OpenInput = {
  readonly packet: Packet;
  /** A blind pair's machine pick per pair: kept, and readable only after the
   *  operator's verdict on that pair (read.ts revealPicks). */
  readonly machinePicks?: readonly { readonly row: string; readonly candidate: CandidateId }[];
  /** v1's existing verdicts (Phase 3 decision 3): nothing judged in v1 is lost. */
  readonly initial?: readonly InitialDecision[];
};

export type PatchChange = { readonly key: string; readonly verdict: "keep" | "reject" | null; readonly reasons?: readonly string[]; readonly note?: string };
export type PatchInput = Author & PatchChange & { readonly baseRev: number };
export type PatchManyInput = Author & { readonly packetId: PacketId; readonly changes: readonly PatchChange[]; readonly baseRev: number };
export type PickInput = Author & { readonly packetId: PacketId; readonly baseRev: number; readonly pair: string; readonly outcome: PickOutcome };

export type Patched = { readonly rev: number; readonly changed: readonly Decision[] };
/** The 409: the keys' current decisions and the current revision. */
export type PatchOutcome =
  | { readonly ok: true; readonly value: Patched }
  | { readonly ok: false; readonly error: AppError; readonly current?: { readonly rev: number; readonly decisions: readonly Decision[] } };

export const actorOf = (a: Author) => ({ kind: a.by, id: a.who ?? a.by });

const atSchema = z.iso.datetime({ offset: true });

/** One normalised initial decision, in the shape a stored `open` row reads back as. */
type Seed = { candidate: string; verdict: "keep" | "reject"; reasons: readonly string[]; note?: string; by: By; surface: string; at: string };

function seedsOf(p: Packet, initial: readonly InitialDecision[]): Seed[] {
  const members = new Set<string>(p.items.map((c) => c.id));
  const seen = new Set<string>();
  const out: Seed[] = [];
  for (const d of initial) {
    if (!members.has(d.candidate)) throw new AppError("invalid", `decision: initial verdict on ${d.candidate}, which is not in packet ${p.id}`);
    if (seen.has(d.candidate)) throw new AppError("invalid", `decision: initial verdict on ${d.candidate} is given twice`);
    seen.add(d.candidate);
    const at = parseAt("initial decision at", atSchema, d.at);
    if (!at.ok) throw at.error;
    const reasons = checkVerdict(p.source, { verdict: d.verdict, reasons: d.reasons ?? [], ...(d.note === undefined ? {} : { note: d.note }) });
    if (!reasons.ok) throw new AppError("invalid", `decision: initial verdict on ${d.candidate}: ${reasons.error.message}`);
    out.push({ candidate: d.candidate, verdict: d.verdict, reasons: reasons.value, ...(d.note === undefined ? {} : { note: d.note }), by: d.by, surface: d.surface, at: new Date(at.value).toISOString() });
  }
  return out;
}

/** Everything that makes two opens the same open, as one string. */
function openShape(stored: Packet, picks: readonly { row: string; candidate: string }[], seeds: readonly Seed[]): string {
  const byRow = [...picks].sort((a, b) => (a.row < b.row ? -1 : 1));
  const bySeed = [...seeds].sort((a, b) => (a.candidate < b.candidate ? -1 : 1));
  return canonical({ packet: stored, picks: byRow, seeds: bySeed });
}

function storedShape(t: Tx, p: Packet): string {
  const picks = t.all("SELECT row, candidate_id AS candidate FROM packet_picks WHERE packet_id = ?", p.id).map((x) => ({ row: String(x["row"]), candidate: String(x["candidate"]) }));
  const seeds: Seed[] = rows(t, p.id)
    .filter((r) => r.act === "open")
    .map((r) => ({ candidate: r.candidate_id, verdict: r.verdict === "keep" ? "keep" : "reject", reasons: r.reasons, ...(r.note === null ? {} : { note: r.note }), by: r.by, surface: r.surface, at: r.at }));
  return openShape(p, picks, seeds);
}

/**
 * Open a pile at the Weir. IDEMPOTENT BY PACKET ID (Phase 3 decision 3): an
 * adapter opens `pkt:<source>:<runId>` every time it sees the v1 record, so
 * re-opening with the same packet, picks and imported verdicts is a no-op that
 * returns the stored packet; different content under the same id is a
 * conflict, never an overwrite. A blind pair's arms are stored in an order
 * derived from ids alone, never the order they arrived in.
 */
export function openPacket(t: Tx, input: OpenInput, author: Author): Packet {
  const p = must(parseAt("packet", packetSchema, input.packet));
  if (p.state !== "open") throw new AppError("invalid", `decision: a packet opens as open, not ${p.state}`);
  const picks = input.machinePicks ?? [];
  if (picks.length > 0 && p.mode !== "blind-pair") throw new AppError("invalid", "decision: only a blind pair carries machine picks");
  const ordered = p.mode !== "blind-pair" ? p.items : orderBlind(p);
  const stored: Packet = { ...p, items: ordered };
  const seeds = seedsOf(p, input.initial ?? []);
  const exists = t.get("SELECT state FROM packets WHERE id = ?", p.id);
  if (exists !== undefined) {
    if (storedShape(t, stored) !== openShape(stored, picks, seeds)) throw new AppError("conflict", `decision: packet ${p.id} is already open with other content`);
    return { ...stored, state: head(t, p.id).state };
  }
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
  if (seeds.length > 0) {
    for (const s of seeds) insertRow(t, p.id, 1, s, s, s.at, "open", null, null);
    t.run("UPDATE packets SET rev = 1 WHERE id = ?", p.id);
  }
  // The event says a pick exists per pair, never which arm: the ledger is a read path too.
  append(t, {
    actor: actorOf(author),
    type: "decision.opened",
    subject: { kind: "packet", id: p.id },
    lane: p.lane,
    data: { mode: p.mode, source: p.source, items: ordered.length, picks: rowsWithPick.size, initial: seeds.length, surface: author.surface },
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

const stale = (t: Tx, packetId: string, rev: number, named?: ReadonlySet<string>): PatchOutcome => ({
  ok: false,
  error: new AppError("conflict", `decision: the verdicts moved on (now at revision ${rev}); re-read and try again`),
  current: currentDecisions(t, packetId, named),
});

/** Patch many keys of one packet as ONE act (the Board's row-wide ⇧K/⇧X): one
 *  revision, one undo step, one Event. */
export function patchMany(t: Tx, input: PatchManyInput): PatchOutcome {
  const h = head(t, input.packetId);
  if (h.state !== "open") return err("refused", `decision: packet ${h.id} is ${h.state}; its verdicts are final`);
  const changes: Change[] = [];
  for (const c of input.changes) {
    const k = splitKey(c.key);
    if (k === undefined || k.packet !== h.id) return err("invalid", `decision: key ${c.key} is not a key of packet ${h.id}`);
    const reasons = checkVerdict(h.source, { verdict: c.verdict, reasons: c.reasons ?? [], ...(c.note === undefined ? {} : { note: c.note }) });
    if (!reasons.ok) return err("invalid", `decision: ${c.key}: ${reasons.error.message}`);
    changes.push({ candidate: k.candidate, verdict: c.verdict, reasons: reasons.value, ...(c.note === undefined ? {} : { note: c.note }) });
  }
  if (input.baseRev !== h.rev) {
    return stale(t, h.id, h.rev, new Set(changes.map((c) => c.candidate)));
  }
  const plan = planPatch(new Set(items(t, h.id).map((i) => i.candidate_id)), currentOf(rows(t, h.id)), changes);
  if (!plan.ok) return plan;
  if (plan.value.length === 0) return ok({ rev: h.rev, changed: [] });
  const rev = h.rev + 1;
  const changed = write(t, h.id, rev, plan.value, input, "patch", null, null);
  append(t, {
    actor: actorOf(input),
    type: "decision.patched",
    subject: { kind: "packet", id: h.id },
    data: { rev, surface: input.surface, changes: plan.value.map(eventChange) },
  });
  return ok({ rev, changed });
}

const eventChange = (c: Change) => ({ candidate: c.candidate, verdict: c.verdict, ...(c.reasons.length === 0 ? {} : { reasons: [...c.reasons] }), ...(c.note === undefined ? {} : { note: c.note }) });

/** One key (`<packetId>::<candidateId>`), the shape of the plan's `patch`. */
export function patch(t: Tx, input: PatchInput): PatchOutcome {
  const k = splitKey(input.key);
  if (k === undefined) return err("invalid", `decision: ${input.key} is not <packetId>::<candidateId>`);
  const { key, verdict, reasons, note, baseRev, ...author } = input;
  const packetId = must(parseAt("packet id", packetIdSchema, k.packet));
  const change: PatchChange = { key, verdict, ...(reasons === undefined ? {} : { reasons }), ...(note === undefined ? {} : { note }) };
  return patchMany(t, { ...author, packetId, baseRev, changes: [change] });
}

/**
 * A blind pick: the operator's a | b | tie | both-bad on one pair, written as
 * ONE revision over both arms (the source's rule maps the outcome to the two
 * verdicts, @gt/domain/board pickVerdicts) with the outcome on both rows, so
 * one undo takes the whole pick back. The pick is the operator's verdict on
 * the pair, so it is also what opens the pair's reveal (read.ts revealPicks).
 */
export function pick(t: Tx, input: PickInput): PatchOutcome {
  const h = head(t, input.packetId);
  if (h.state !== "open") return err("refused", `decision: packet ${h.id} is ${h.state}; its verdicts are final`);
  if (h.mode !== "blind-pair") return err("refused", `decision: only a blind pair is picked; ${h.id} is a ${h.mode}`);
  const pairs = pairsOf(items(t, h.id));
  const arms = pairs.get(input.pair);
  if (arms === undefined) return err("invalid", `decision: packet ${h.id} has no pair ${input.pair}`);
  if (input.baseRev !== h.rev) return stale(t, h.id, h.rev, new Set(arms));
  const all = rows(t, h.id);
  const armsOf = new Map<string, string>([[arms[0], input.pair], [arms[1], input.pair]]);
  const standing = pairOutcomes(all, armsOf).get(input.pair) ?? null;
  const changes = planPick(arms, pickVerdicts(h.source, input.outcome), currentOf(all), standing, input.outcome);
  if (changes.length === 0) return ok({ rev: h.rev, changed: [] });
  const rev = h.rev + 1;
  const changed = write(t, h.id, rev, changes, input, "pick", null, input.outcome);
  append(t, { actor: actorOf(input), type: "decision.picked", subject: { kind: "packet", id: h.id }, data: { rev, pair: input.pair, outcome: input.outcome, surface: input.surface } });
  return ok({ rev, changed });
}

/** ⌫: append the inverse of the newest act not yet undone. Never a delete. */
export function undo(t: Tx, input: Author & { readonly packetId: PacketId; readonly baseRev: number }): PatchOutcome {
  const h = head(t, input.packetId);
  if (h.state !== "open") return err("refused", `decision: packet ${h.id} is ${h.state}; a committed decision is not undone`);
  if (input.baseRev !== h.rev) return stale(t, h.id, h.rev);
  const plan = planUndo(rows(t, h.id));
  if (plan === undefined) return err("refused", `decision: nothing on packet ${h.id} is left to undo`);
  const rev = h.rev + 1;
  const changed = write(t, h.id, rev, plan.changes, input, "undo", plan.undoes, null);
  append(t, { actor: actorOf(input), type: "decision.undone", subject: { kind: "packet", id: h.id }, data: { rev, undoes: plan.undoes, surface: input.surface, keys: plan.changes.length } });
  return ok({ rev, changed });
}

function insertRow(t: Tx, packetId: string, rev: number, c: Change, a: Author, at: string, act: Act, undoes: number | null, outcome: PickOutcome | null): void {
  t.run(
    "INSERT INTO decisions (packet_id, candidate_id, verdict, reasons, note, rev, by, surface, at, act, undoes, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    packetId, c.candidate, c.verdict, canonical(c.reasons), c.note ?? null, rev, a.by, a.surface, at, act, undoes, outcome,
  );
}

/** Append one act's rows at `rev` and move the packet to it. Exported for ./commit.ts. */
export function write(t: Tx, packetId: string, rev: number, changes: readonly Change[], a: Author, act: Exclude<Act, "open">, undoes: number | null, outcome: PickOutcome | null): Decision[] {
  for (const c of changes) insertRow(t, packetId, rev, c, a, t.at, act, undoes, outcome);
  const moved = t.run("UPDATE packets SET rev = ? WHERE id = ? AND rev = ?", rev, packetId, rev - 1);
  if (moved.changes !== 1) throw new AppError("conflict", `decision: packet ${packetId} moved during the write`);
  return [...currentDecisions(t, packetId, new Set(changes.map((c) => c.candidate))).decisions];
}

/** A candidate id minted at the door (commit results and views name candidates). */
export const candidateId = (x: string): CandidateId => must(parseAt("candidate id", candidateIdSchema, x));

