import type { RejectReason } from "@gt/domain/decision";
import { err, ok, type Result } from "@gt/domain/errors";
import type { PacketMode } from "@gt/domain/packet";
import { sha256Hex } from "../canonical.ts";
import type { DecisionRow } from "./schema.ts";

// THE DECISION CORE - pure: what a patch, an undo and a commit WOULD write,
// decided from rows already read. The driver reads, calls these, writes.
//
// Absorbed from three v1 places and upgraded where each had a gap:
//   lib/foundry/verdictLog.ts  a write that changes nothing bumps nothing and
//                              logs nothing; a stale base is refused with the
//                              current revision. KEPT as written.
//   lib/board/undo.ts          an entry is a LIST of changes (a row-wide ⇧K is
//                              one act), replayed newest first. UPGRADED from a
//                              session-only client stack to an append of the
//                              inverse on the server: an undo is a decision too,
//                              so it is in the history, survives a reload, and
//                              another tab sees it (undo-history:
//                              execution-emitted-inverse - the inverse is read
//                              from what the act actually overwrote, the rows
//                              before it, never re-derived from the request).
//   lib/foundry/store.ts       commitRun(undecidedAs "reject" | "leave") and
//   commitRun                  its preview token. The token becomes the packet
//                              revision (monotonic, so a hash of the state adds
//                              nothing), and the mode decides whether skipping
//                              is allowed at all.

export type Verdict = "keep" | "reject" | null;
export type Current = { readonly verdict: Verdict; readonly reason?: RejectReason };
export type Change = { readonly candidate: string; readonly verdict: Verdict; readonly reason?: RejectReason };

/**
 * Which modes may be committed with candidates left undecided (plan §2.1:
 * "commit is one act per packet"). A matrix cull is a pile the operator thins:
 * v1's forge commit took `undecidedAs` and defaulted it to reject, because a
 * plate nobody kept is not wanted. A blind pair exists to measure the machine
 * against the operator, so an unjudged pair is a hole in the measurement, and
 * a packet review is one verdict on one piece of work - neither may skip.
 */
export const MODE_POLICY: { readonly [M in PacketMode]: { readonly skip: boolean } } = {
  "matrix-cull": { skip: true },
  "blind-pair": { skip: false },
  "packet-review": { skip: false },
};

/** Newest row per candidate, from rows in seq order. */
export function currentOf(rows: readonly DecisionRow[]): Map<string, Current> {
  const out = new Map<string, Current>();
  for (const r of rows) out.set(r.candidate_id, r.reason === null ? { verdict: r.verdict } : { verdict: r.verdict, reason: r.reason });
  return out;
}

const same = (a: Current | undefined, c: Change): boolean => (a?.verdict ?? null) === c.verdict && a?.reason === c.reason;

/** The changes that actually change something. A key outside the packet, or
 *  named twice, refuses the whole write: v1 cleaned every key before writing
 *  any, so a refusal wrote and logged nothing. */
export function planPatch(members: ReadonlySet<string>, current: ReadonlyMap<string, Current>, changes: readonly Change[]): Result<Change[]> {
  if (changes.length === 0) return err("invalid", "decision: a patch names at least one key");
  const seen = new Set<string>();
  const out: Change[] = [];
  for (const c of changes) {
    if (!members.has(c.candidate)) return err("invalid", `decision: candidate ${c.candidate} is not in this packet`);
    if (seen.has(c.candidate)) return err("invalid", `decision: candidate ${c.candidate} is named twice in one patch`);
    seen.add(c.candidate);
    if (c.reason !== undefined && c.verdict !== "reject") return err("invalid", `decision: only a reject carries a reason (${c.candidate})`);
    if (!same(current.get(c.candidate), c)) out.push(c);
  }
  return ok(out);
}

export type UndoPlan = { readonly undoes: number; readonly changes: readonly Change[] };

/**
 * The newest forward act (a patch) that no undo has reversed yet, and the
 * writes that reverse it: each key it touched back to its value in the row
 * BEFORE that act's row, or undecided when there was none.
 *
 * Why that is the right "before" even after other undos: every forward act
 * newer than the one chosen has been undone, so each key it touched is back to
 * its value after the chosen act. Only one act's worth of state is ever
 * walked back at a time, so nothing in between can be skipped.
 *
 * A commit's own rows (an undecided pile written as rejects) are not an act
 * the operator can take back: a committed packet refuses undo before this runs.
 */
export function planUndo(rows: readonly DecisionRow[]): UndoPlan | undefined {
  const undone = new Set<number>();
  for (const r of rows) if (r.undoes !== null) undone.add(r.undoes);
  let target: number | undefined;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r !== undefined && r.act === "patch" && !undone.has(r.rev)) {
      target = r.rev;
      break;
    }
  }
  if (target === undefined) return undefined;
  const act = rows.filter((r) => r.rev === target);
  const first = act[0]?.seq ?? 0;
  const changes: Change[] = [];
  // Newest change first, as lib/board/undo.ts `reversal` replays them.
  for (const r of [...act].reverse()) {
    let prev: DecisionRow | undefined;
    for (const p of rows) if (p.candidate_id === r.candidate_id && p.seq < first) prev = p;
    changes.push(prev === undefined || prev.verdict === null ? { candidate: r.candidate_id, verdict: null } : prev.reason === null ? { candidate: r.candidate_id, verdict: prev.verdict } : { candidate: r.candidate_id, verdict: prev.verdict, reason: prev.reason });
  }
  return { undoes: target, changes };
}

export type UndecidedAs = "reject" | "leave";

export type CommitPlan = {
  readonly kept: readonly string[];
  readonly rejected: readonly string[];
  /** Left undecided by the commit (only a mode that may skip, with "leave"). */
  readonly undecided: readonly string[];
  /** Candidates the commit itself decides as rejects ("reject" on a skippable mode). */
  readonly writeRejects: readonly string[];
};

export function planCommit(mode: PacketMode, members: readonly string[], current: ReadonlyMap<string, Current>, undecidedAs: UndecidedAs): Result<CommitPlan> {
  const kept: string[] = [];
  const rejected: string[] = [];
  const open: string[] = [];
  for (const c of members) {
    const v = current.get(c)?.verdict ?? null;
    if (v === "keep") kept.push(c);
    else if (v === "reject") rejected.push(c);
    else open.push(c);
  }
  if (open.length > 0 && !MODE_POLICY[mode].skip) {
    return err("refused", `decision: a ${mode} packet commits only when every candidate is decided; ${open.length} undecided (${open.slice(0, 5).join(", ")}${open.length > 5 ? ", ..." : ""})`);
  }
  if (undecidedAs === "reject") return ok({ kept, rejected: [...rejected, ...open], undecided: [], writeRejects: open });
  return ok({ kept, rejected, undecided: open, writeRejects: [] });
}

/**
 * The order the two arms of a blind pair are shown in, from (packet, pair,
 * candidate) alone. Absorbed from lib/foundry/training/blind.ts `armInSlotA`,
 * which seeded slot A from the cycle id and "human", NEVER from the judge's
 * pick or its A/B order. Upgraded from FNV-1a to sha256 because the kernel
 * already carries one hash and a second, weaker one buys nothing here.
 */
export function blindRank(packet: string, row: string, candidate: string): string {
  return sha256Hex(`${packet}\u0000human\u0000${row}\u0000${candidate}`);
}
