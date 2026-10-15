import type { PickOutcome } from "@gt/domain/board";
import { err, ok, type Result } from "@gt/domain/errors";
import type { PacketMode } from "@gt/domain/source";
import { sha256Hex } from "../canonical.ts";
import type { DecisionRow } from "./schema.ts";

// THE DECISION CORE - pure: what a patch, a pick, an undo and a commit WOULD
// write, decided from rows already read. The driver reads, calls these, writes.
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
//                              A blind pick is one act over two arms, so one
//                              undo takes both back (gesture-coalescing).
//   lib/foundry/store.ts       commitRun(undecidedAs "reject" | "leave"), whose
//   commitRun                  default was "reject": a plate nobody kept was
//                              swept. UPGRADED to refuse (Phase 3 decision 5):
//                              the Board's ⇧K/⇧X make deciding a row one key,
//                              so a sweep the operator did not ask for buys
//                              nothing and loses the undecided set silently.

export type Verdict = "keep" | "reject" | null;
export type Current = { readonly verdict: Verdict; readonly reasons: readonly string[]; readonly note?: string };
export type Change = { readonly candidate: string; readonly verdict: Verdict; readonly reasons: readonly string[]; readonly note?: string };

const UNDECIDED: Current = { verdict: null, reasons: [] };

function currentOfRow(r: DecisionRow): Current {
  return r.note === null ? { verdict: r.verdict, reasons: r.reasons } : { verdict: r.verdict, reasons: r.reasons, note: r.note };
}

/** Newest row per candidate, from rows in seq order. */
export function currentOf(rows: readonly DecisionRow[]): Map<string, Current> {
  const out = new Map<string, Current>();
  for (const r of rows) out.set(r.candidate_id, currentOfRow(r));
  return out;
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const same = (a: Current | undefined, c: Change): boolean => {
  const cur = a ?? UNDECIDED;
  return cur.verdict === c.verdict && sameList(cur.reasons, c.reasons) && cur.note === c.note;
};

/** The changes that actually change something. A key outside the packet, or
 *  named twice, refuses the whole write: v1 cleaned every key before writing
 *  any, so a refusal wrote and logged nothing. The source's vocabulary was
 *  checked at the door (driver.ts), before this runs. */
export function planPatch(members: ReadonlySet<string>, current: ReadonlyMap<string, Current>, changes: readonly Change[]): Result<Change[]> {
  if (changes.length === 0) return err("invalid", "decision: a patch names at least one key");
  const seen = new Set<string>();
  const out: Change[] = [];
  for (const c of changes) {
    if (!members.has(c.candidate)) return err("invalid", `decision: candidate ${c.candidate} is not in this packet`);
    if (seen.has(c.candidate)) return err("invalid", `decision: candidate ${c.candidate} is named twice in one patch`);
    seen.add(c.candidate);
    if (!same(current.get(c.candidate), c)) out.push(c);
  }
  return ok(out);
}

/** Forward acts that no undo has reversed: the acts whose effect stands. */
function undoneRevs(rows: readonly DecisionRow[]): Set<number> {
  const undone = new Set<number>();
  for (const r of rows) if (r.undoes !== null) undone.add(r.undoes);
  return undone;
}

/**
 * Each pair's standing outcome: the outcome of the newest STANDING act on its
 * arms when that act was a pick, else null (an arm patched after the pick has
 * overridden it, or the pair was never picked). Because undo always reverses
 * the newest standing act, "the acts not undone" is exactly the state the
 * operator sees, so an undone pick takes its outcome with it.
 */
export function pairOutcomes(rows: readonly DecisionRow[], armsOf: ReadonlyMap<string, string>): Map<string, PickOutcome | null> {
  const undone = undoneRevs(rows);
  const out = new Map<string, PickOutcome | null>();
  for (const r of rows) {
    if (r.act === "undo" || undone.has(r.rev)) continue;
    const pair = armsOf.get(r.candidate_id);
    if (pair !== undefined) out.set(pair, r.act === "pick" ? r.outcome : null);
  }
  return out;
}

/** The two writes a pick makes, or none when the pair already stands at this
 *  outcome with these verdicts (a repeated key press changes nothing, as a
 *  repeated patch does not). A pick carries no reasons and no note. */
export function planPick(arms: readonly [string, string], verdicts: readonly [Verdict, Verdict], current: ReadonlyMap<string, Current>, standing: PickOutcome | null, outcome: PickOutcome): Change[] {
  const changes: Change[] = [
    { candidate: arms[0], verdict: verdicts[0], reasons: [] },
    { candidate: arms[1], verdict: verdicts[1], reasons: [] },
  ];
  if (standing === outcome && changes.every((c) => same(current.get(c.candidate), c))) return [];
  return changes;
}

export type UndoPlan = { readonly undoes: number; readonly changes: readonly Change[] };

/**
 * The newest forward act (a patch or a pick) that no undo has reversed yet,
 * and the writes that reverse it: each key it touched back to its value in the
 * row BEFORE that act's row, or undecided when there was none.
 *
 * Why that is the right "before" even after other undos: every forward act
 * newer than the one chosen has been undone, so each key it touched is back to
 * its value after the chosen act. Only one act's worth of state is ever
 * walked back at a time, so nothing in between can be skipped.
 *
 * Not undoable: the `open` act (v1's verdicts, imported - the operator did not
 * cast them here, and taking them back would erase history v1 kept) and a
 * commit's own rows (a committed packet refuses undo before this runs).
 */
export function planUndo(rows: readonly DecisionRow[]): UndoPlan | undefined {
  const undone = undoneRevs(rows);
  let target: number | undefined;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r !== undefined && (r.act === "patch" || r.act === "pick") && !undone.has(r.rev)) {
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
    const back = prev === undefined ? UNDECIDED : currentOfRow(prev);
    changes.push({ candidate: r.candidate_id, ...back });
  }
  return { undoes: target, changes };
}

/** An explicit sweep of the undecided, kept for the one caller that needs it
 *  (a matrix cull committed under an operator's "reject the rest"); absent
 *  means refuse, for every mode. */
export type UndecidedAs = "reject" | "leave";

/**
 * Which modes may be swept at all. A blind pair exists to measure the machine
 * against the operator, so an unjudged pair is a hole in the measurement, and
 * a packet review is one verdict on one piece of work: neither may skip, even
 * when asked to.
 */
export const MODE_POLICY: { readonly [M in PacketMode]: { readonly sweep: boolean } } = {
  "matrix-cull": { sweep: true },
  "blind-pair": { sweep: false },
  "packet-review": { sweep: false },
};

export type CommitPlan = {
  readonly kept: readonly string[];
  readonly rejected: readonly string[];
  /** Left undecided by the commit (only an explicit "leave" on a matrix cull). */
  readonly undecided: readonly string[];
  /** Candidates the commit itself decides as rejects (an explicit "reject"). */
  readonly writeRejects: readonly string[];
};

/** Refused with the undecided candidates in `detail` (a JSON array), so a
 *  surface can jump to them rather than parse a sentence. */
export function planCommit(mode: PacketMode, members: readonly string[], current: ReadonlyMap<string, Current>, undecidedAs?: UndecidedAs): Result<CommitPlan> {
  const kept: string[] = [];
  const rejected: string[] = [];
  const open: string[] = [];
  for (const c of members) {
    const v = current.get(c)?.verdict ?? null;
    if (v === "keep") kept.push(c);
    else if (v === "reject") rejected.push(c);
    else open.push(c);
  }
  if (open.length > 0 && (undecidedAs === undefined || !MODE_POLICY[mode].sweep)) {
    const head = open.slice(0, 5).join(", ") + (open.length > 5 ? ", ..." : "");
    return err("refused", `decision: a ${mode} packet commits only when every candidate is decided; ${open.length} undecided (${head})`, { detail: JSON.stringify(open) });
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
