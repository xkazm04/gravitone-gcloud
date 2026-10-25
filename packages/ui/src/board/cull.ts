// THE MATRIX CULL'S PURE HALF - where the cursor goes, what a row is, what is still open, and
// what one reason key does. Read off the prototype's cull (index.html :452-572 `cullMove`,
// `cullVertical`, `rowIndices`, `commitCull`), which mixed these with painting; here they are
// values in and values out, so a unit test holds each rule and the desk only draws.

import { REJECT_KEYS } from "@gt/domain/source";

import type { BoardVerdict } from "./boardGate.ts";

/** One tile in draw order: the candidate and the matrix row it sits in. */
export type Cell = { readonly id: string; readonly row: string };

/**
 * Tiles in the order the desk draws them: row by row in the presentation's row order, each
 * row's items in the packet's own order. An item whose row the presentation does not name
 * gets a row of its own name at the end, so nothing the kernel holds is left undrawn.
 */
export function cullCells(rows: readonly { readonly id: string }[], items: readonly { readonly id: string; readonly row?: string }[]): Cell[] {
  const order = rows.map((r) => r.id);
  for (const it of items) {
    const row = it.row ?? it.id;
    if (!order.includes(row)) order.push(row);
  }
  return order.flatMap((row) => items.filter((it) => (it.row ?? it.id) === row).map((it) => ({ id: it.id, row })));
}

export const clamp = (cells: readonly Cell[], i: number): number => Math.max(0, Math.min(cells.length - 1, i));

/** The indices of every tile in `i`'s row (one act over the row). */
export function rowOf(cells: readonly Cell[], i: number): number[] {
  const row = cells[i]?.row;
  return cells.flatMap((c, j) => (c.row === row ? [j] : []));
}

/** ↑ / ↓: the same column in the neighbouring row, or that row's last tile when it is shorter. */
export function vertical(cells: readonly Cell[], cur: number, dir: 1 | -1): number {
  const rows = [...new Set(cells.map((c) => c.row))];
  const here = cells[cur]?.row;
  if (here === undefined) return cur;
  const target = rows[rows.indexOf(here) + dir];
  if (target === undefined) return cur;
  const col = rowOf(cells, cur).indexOf(cur);
  const there = cells.flatMap((c, j) => (c.row === target ? [j] : []));
  return there[Math.min(col, there.length - 1)] ?? cur;
}

export type Tally = { readonly kept: number; readonly rejected: number; readonly undecided: number };

export function tallyOf(cells: readonly Cell[], verdicts: Readonly<Record<string, BoardVerdict>>): Tally {
  let kept = 0;
  let rejected = 0;
  for (const c of cells) {
    const v = verdicts[c.id]?.verdict;
    if (v === "keep") kept++;
    else if (v === "reject") rejected++;
  }
  return { kept, rejected, undecided: cells.length - kept - rejected };
}

/** Undecided tiles, in draw order: the commit refusal jumps to the first and flashes them all. */
export function undecidedOf(cells: readonly Cell[], verdicts: Readonly<Record<string, BoardVerdict>>): number[] {
  return cells.flatMap((c, j) => (verdicts[c.id] === undefined ? [j] : []));
}

/**
 * A REJECT THAT NEEDS A REASON (spark scout-decision-graph, @gt/domain/source `reasonOnReject`): on a source
 * whose vocabulary says `required`, a reject naming no reason is not done - the kernel's commit refuses it,
 * so the desk counts it beside the undecided instead of sending a commit that can only come back.
 */
export const needsReason = (v: BoardVerdict | undefined, required: boolean): boolean => required && v?.verdict === "reject" && v.reasons.length === 0;

/** A tile still open for the commit: undecided, or a reject still owing its reason. */
export const stillOpen = (v: BoardVerdict | undefined, required: boolean): boolean => v === undefined || needsReason(v, required);

/** What the commit gate refuses on, in draw order: the undecided, the reasonless rejects, and both together. */
export type NotDone = { readonly undecided: readonly number[]; readonly reasonless: readonly number[]; readonly all: readonly number[] };

export function notDoneOf(cells: readonly Cell[], verdicts: Readonly<Record<string, BoardVerdict>>, required: boolean): NotDone {
  const undecided = undecidedOf(cells, verdicts);
  const reasonless = cells.flatMap((c, j) => (needsReason(verdicts[c.id], required) ? [j] : []));
  return { undecided, reasonless, all: cells.flatMap((_, j) => (undecided.includes(j) || reasonless.includes(j) ? [j] : [])) };
}

/** The refusal, said: `3 undecided`, `2 need a reason`, or both. Empty when nothing is open. */
export function notDoneWords(n: Pick<NotDone, "undecided" | "reasonless">): string {
  return [n.undecided.length > 0 ? `${n.undecided.length} undecided` : "", n.reasonless.length > 0 ? `${n.reasonless.length} need a reason` : ""].filter((x) => x !== "").join(" · ");
}

/**
 * What the commit key does (spark scout-storyboards, "allow to commit partial packets"):
 *   go      every tile decided - or, on a packet whose source commits in PARTS (`partial`), something decided and
 *           no reject still owing its reason: the undecided go on to the remainder packet (`later` of them);
 *   refuse  what is open, flashed and jumped to - a partial packet refuses only on its reasonless rejects, and when
 *           nothing at all is decided.
 */
export type CommitGate = { readonly kind: "go"; readonly later: number } | { readonly kind: "refuse"; readonly left: NotDone };

export function commitGate(cells: readonly Cell[], verdicts: Readonly<Record<string, BoardVerdict>>, required: boolean, partial = false): CommitGate {
  const left = notDoneOf(cells, verdicts, required);
  if (left.all.length === 0) return { kind: "go", later: 0 };
  if (!partial) return { kind: "refuse", left };
  if (left.reasonless.length > 0) return { kind: "refuse", left: { undecided: [], reasonless: left.reasonless, all: left.reasonless } };
  if (left.undecided.length === cells.length) return { kind: "refuse", left };
  return { kind: "go", later: left.undecided.length };
}

/** The reason slot a drawn reject key holds: 2 -> 0, 3 -> 1, 4 -> 2; -1 for any other cap. */
export function reasonSlot(cap: string): number {
  return REJECT_KEYS.findIndex((k) => k === cap);
}

/**
 * What a verdict key does to the run under the cursor, and where the cursor goes after:
 *   advance  the next run (the keys' rhythm: decide, move on),
 *   stay     the same run,
 *   ask      the same run, its reason chips drawn and focused for a click (5's reject without a reason).
 */
export type Then = "advance" | "stay" | "ask";
export type KeyAct = { readonly kind: "mark"; readonly verdict: BoardVerdict; readonly then: Then } | { readonly kind: "refuse"; readonly why: string };

/**
 * A reject key (2, 3, 4) on a run, over the run's ORDERED reasons (`reasonsOf(vocabulary, run.group)`):
 *   · on a run that is not a reject, or a reject still owing its reason, it rejects with that slot's reason
 *     and moves on - 5 then 2 is the keyboard's way to the reason 5 left open;
 *   · on a reject that already names reasons - the operator came back to it - it TOGGLES that reason and
 *     stays (v1's sources allow several), refused past the source's cap rather than silently dropped;
 *   · a slot past the list (suno, mv, step and proof have no reasons) is a plain reject that moves on, or,
 *     where the source requires a reason, one that asks for it.
 */
export function reasonAct(list: readonly string[], max: number, cap: string, current: BoardVerdict | undefined, required = false): KeyAct {
  const slot = reasonSlot(cap);
  if (slot < 0) return { kind: "refuse", why: `key ${cap} names no reason` };
  const reason = list[slot];
  if (reason === undefined) return { kind: "mark", verdict: { verdict: "reject", reasons: [] }, then: required && list.length > 0 ? "ask" : "advance" };
  const carry = (reasons: readonly string[]): BoardVerdict => (current?.note === undefined ? { verdict: "reject", reasons } : { verdict: "reject", reasons, note: current.note });
  if (current?.verdict !== "reject" || current.reasons.length === 0) return { kind: "mark", verdict: carry([reason]), then: "advance" };
  const has = current.reasons.includes(reason);
  if (!has && current.reasons.length >= max) return { kind: "refuse", why: `at most ${max} reason${max === 1 ? "" : "s"}` };
  return { kind: "mark", verdict: carry(list.filter((r) => (r === reason ? !has : current.reasons.includes(r)))), then: "stay" };
}

/**
 * The run-level verdict keys of `board.cull` (bindings.ts): `keep` (1), `reason` (2-4, `reasonAct`) and `reject`
 * (5: no reason, and the run stays with its chips asked for; a source with no reasons has no chip to ask, so it
 * advances like any other verdict). Null for any other verb: the desk's own.
 */
export function runKeyAct(verb: string, cap: string, list: readonly string[], max: number, current: BoardVerdict | undefined, required = false): KeyAct | null {
  if (verb === "keep") return { kind: "mark", verdict: { verdict: "keep", reasons: [] }, then: "advance" };
  if (verb === "reject") return { kind: "mark", verdict: { verdict: "reject", reasons: [] }, then: list.length > 0 ? "ask" : "advance" };
  if (verb === "reason") return reasonAct(list, max, cap, current, required);
  return null;
}

/**
 * A chip clicked on a run 5 left asking (VerdictPick): where the source requires a reason, the reason given
 * finishes the run and the cursor moves on (`nextOpen`); elsewhere a chip only sets the reason, as it always did.
 */
export function chipThen(required: boolean, asked: boolean, v: BoardVerdict | null): "advance" | "stay" {
  return required && asked && v?.verdict === "reject" && v.reasons.length > 0 ? "advance" : "stay";
}

/**
 * Where a finished run moves on to: the next run in drawn order (`order`, indices into `runs`) with a member
 * still open (`stillOpen`), else the next run, else the last; returned as a position in `order`.
 */
export function nextOpen(order: readonly number[], at: number, runs: readonly { readonly members: readonly number[] }[], cells: readonly Cell[], verdicts: Readonly<Record<string, BoardVerdict>>, required: boolean): number {
  for (let p = at + 1; p < order.length; p++) {
    const r = runs[order[p] ?? -1];
    if (r?.members.some((m) => stillOpen(verdicts[cells[m]?.id ?? ""], required)) === true) return p;
  }
  return Math.min(at + 1, Math.max(0, order.length - 1));
}

/* ── notes ─────────────────────────────────────────────────────────────────── */

/** A verdict's note, set (trimmed, cut at the source's bound) or cleared by a blank one. */
export type NoteAct = { readonly kind: "mark"; readonly verdict: BoardVerdict; readonly cleared: boolean } | { readonly kind: "refuse"; readonly why: string };

/**
 * What saving a note does to a tile's verdict (the existing verdict write, with `note`). A note rides a
 * verdict - the kernel refuses one on an undecided tile - so an undecided tile refuses; a blank note clears it.
 */
export function noteAct(current: BoardVerdict | undefined, text: string, noteMax: number): NoteAct {
  if (current === undefined) return { kind: "refuse", why: "a note rides a verdict: keep or reject it first" };
  if (noteMax <= 0) return { kind: "refuse", why: "this source keeps no note" };
  const t = text.trim().slice(0, noteMax);
  const { note: _was, ...bare } = current;
  return t === "" ? { kind: "mark", verdict: bare, cleared: true } : { kind: "mark", verdict: { ...bare, note: t }, cleared: false };
}

/** A verdict the keys or a click cast, carrying the note the tile already holds (a note survives 1, 2-4 and 5). */
export function keepingNote(prev: BoardVerdict | undefined, next: BoardVerdict | null): BoardVerdict | null {
  if (next === null || next.note !== undefined || prev?.note === undefined) return next;
  return { ...next, note: prev.note };
}
