import { parseJsonAt } from "@gt/domain/door";
import type { Decision } from "@gt/domain/decision";
import { AppError, type Result } from "@gt/domain/errors";
import type { CandidateId } from "@gt/domain/ids";
import { type Packet, packetSchema } from "@gt/domain/packet";
import type { Reader } from "../store.ts";
import { currentOf, planCommit, type CommitPlan, type UndecidedAs } from "./core.ts";
import { DECISION_COLUMNS, readDecisionRow, readItemRow, readPacketHead, toDecision, type DecisionRow, type ItemRow, type PacketHead } from "./schema.ts";

// THE DECISION READS - every way a surface or an agent can look at a packet.
//
// BLIND-FIRST IS A PROPERTY OF THIS FILE, NOT OF ITS CALLERS. A blind pair's
// machine pick is stored (packet_picks) and is read by exactly one function
// here, `revealPicks`, whose SQL joins the pick to an OPERATOR verdict on its
// pair: a pick whose pair the operator has not judged is not in the result set
// at all, so no caller can forget to hide it. `readPacket` hides the rest of
// the machine's tell for a blind pair - the grades on its arms - until the same
// verdict exists, and shows the arms in an order derived from ids alone
// (core.ts `blindRank`), never the order the producer handed them in, which
// may well have been "the machine's favourite first".
//
// v1 did this in the screen (lib/foundry/training/blind.ts `blindPairView`
// built an object without the judge's pick on it). The judge was still in the
// payload the route sent; the screen was the only thing not drawing it.

/** Thrown inside a read; becomes the read's `err` (store.ts classifies AppError). */
export function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

export function head(r: Reader, packetId: string): PacketHead {
  const row = r.get("SELECT id, mode, state, rev, body FROM packets WHERE id = ?", packetId);
  if (row === undefined) throw new AppError("not-found", `decision: no packet ${packetId}`);
  return must(readPacketHead(row));
}

export function items(r: Reader, packetId: string): ItemRow[] {
  return r.all("SELECT candidate_id, row FROM packet_items WHERE packet_id = ? ORDER BY ord", packetId).map((x) => must(readItemRow(x)));
}

export function rows(r: Reader, packetId: string): DecisionRow[] {
  return r.all(`SELECT ${DECISION_COLUMNS} FROM decisions WHERE packet_id = ? ORDER BY seq`, packetId).map((x) => must(readDecisionRow(x)));
}

/** Pairs (rows) the OPERATOR has judged: any arm carries an operator verdict. */
function judgedRows(r: Reader, packetId: string): Set<string> {
  const out = new Set<string>();
  for (const x of r.all(
    `SELECT DISTINCT i.row AS row FROM packet_items i
       JOIN decisions d ON d.packet_id = i.packet_id AND d.candidate_id = i.candidate_id
      WHERE i.packet_id = ? AND i.row IS NOT NULL AND d.by = 'operator' AND d.verdict IS NOT NULL`,
    packetId,
  )) {
    if (typeof x["row"] === "string") out.add(x["row"]);
  }
  return out;
}

/** The packet as a surface may draw it. For a blind pair, an arm's grades are
 *  withheld until the operator has judged that pair. */
export function readPacket(r: Reader, packetId: string): Packet {
  const h = head(r, packetId);
  const p = must(parseJsonAt("stored packet", packetSchema, h.body));
  if (h.mode !== "blind-pair") return { ...p, state: h.state };
  const judged = judgedRows(r, packetId);
  return { ...p, state: h.state, items: p.items.map((c) => (c.row !== undefined && judged.has(c.row) ? c : { ...c, grades: [] })) };
}

export type DecisionsView = { readonly rev: number; readonly decisions: readonly Decision[] };

/** Each key's current decision (the newest row), and the packet's revision. */
export function currentDecisions(r: Reader, packetId: string, only?: ReadonlySet<string>): DecisionsView {
  const h = head(r, packetId);
  const all = rows(r, packetId);
  const newest = new Map<string, DecisionRow>();
  for (const d of all) newest.set(d.candidate_id, d);
  const decisions: Decision[] = [];
  for (const d of newest.values()) if (only === undefined || only.has(d.candidate_id)) decisions.push(must(toDecision(d)));
  return { rev: h.rev, decisions };
}

/** Every decision ever written on the packet, oldest first: the append-only log. */
export function history(r: Reader, packetId: string): Decision[] {
  head(r, packetId);
  return rows(r, packetId).map((d) => must(toDecision(d)));
}

/** The machine's pick per pair - ONLY for pairs the operator has judged. */
export function revealPicks(r: Reader, packetId: string): ReadonlyMap<string, CandidateId> {
  head(r, packetId);
  const out = new Map<string, CandidateId>();
  for (const x of r.all(
    `SELECT p.row AS row, p.candidate_id AS candidate_id FROM packet_picks p
      WHERE p.packet_id = ?
        AND EXISTS (SELECT 1 FROM packet_items i JOIN decisions d ON d.packet_id = i.packet_id AND d.candidate_id = i.candidate_id
                     WHERE i.packet_id = p.packet_id AND i.row = p.row AND d.by = 'operator' AND d.verdict IS NOT NULL)
      ORDER BY p.row`,
    packetId,
  )) {
    const it = must(readItemRow(x));
    if (it.row !== null) out.set(it.row, it.candidate_id);
  }
  return out;
}

/** What a commit would do now, and the revision it would be done at: v1's
 *  preview plan, whose token a commit can echo back as `expectRev`. A commit
 *  that would be refused previews as that refusal, not as a throw. */
export function previewCommit(r: Reader, packetId: string, undecidedAs: UndecidedAs = "reject"): { readonly rev: number; readonly plan: Result<CommitPlan> } {
  const h = head(r, packetId);
  if (h.state !== "open") throw new AppError("refused", `decision: packet ${packetId} is ${h.state}`);
  return { rev: h.rev, plan: planCommit(h.mode, items(r, packetId).map((i) => i.candidate_id), currentOf(rows(r, packetId)), undecidedAs) };
}
