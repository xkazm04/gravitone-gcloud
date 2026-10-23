// THE MATRIX CULL'S PURE HALF - where the cursor goes, what a row is, what is still open, and
// what one reason key does. Read off the prototype's cull (index.html :452-572 `cullMove`,
// `cullVertical`, `rowIndices`, `commitCull`), which mixed these with painting; here they are
// values in and values out, so a unit test holds each rule and the desk only draws.

import { REASON_KEYS } from "@gt/domain/source";

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

/** The indices of every tile in `i`'s row (⇧K / ⇧X act on these as ONE act). */
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

/** The position in the key order (1-9, 0, -) a drawn cap holds; the minus sign is the hyphen. */
export function reasonSlot(cap: string): number {
  const key = cap === "−" ? "-" : cap;
  return REASON_KEYS.findIndex((k) => k === key);
}

/** What a reason key does to the current tile. */
export type ReasonAct =
  | { readonly kind: "mark"; readonly verdict: BoardVerdict; readonly advance: boolean }
  | { readonly kind: "refuse"; readonly why: string };

/**
 * A reason key on a tile. On a tile that is not yet a reject it rejects with that one reason
 * and moves on (the prototype's `cullSet(…, "reject", r); adv()`). On a reject already
 * standing - the operator came back to it - the key TOGGLES that reason and stays: v1's
 * sources allow several (strips three, audio eleven), and the prototype's one-reason tile had
 * no way to add a second. Past the source's cap the key is refused, not silently dropped.
 *
 * On a source whose reject REQUIRES a reason (`required`), X rejects and stays with the reasons open, so
 * the reason key that follows on a reasonless reject sets that reason and moves on - X then 1 is one
 * gesture in two keys. A reject that already has its reason toggles as before.
 */
export function reasonAct(list: readonly string[], max: number, cap: string, current: BoardVerdict | undefined, required = false): ReasonAct {
  const reason = list[reasonSlot(cap)];
  if (reason === undefined) return { kind: "refuse", why: list.length === 0 ? "no reasons for this source" : `key ${cap} names no reason here` };
  if (current?.verdict !== "reject") return { kind: "mark", verdict: { verdict: "reject", reasons: [reason] }, advance: true };
  if (needsReason(current, required)) return { kind: "mark", verdict: current.note === undefined ? { verdict: "reject", reasons: [reason] } : { verdict: "reject", reasons: [reason], note: current.note }, advance: true };
  const has = current.reasons.includes(reason);
  if (!has && current.reasons.length >= max) return { kind: "refuse", why: `at most ${max} reason${max === 1 ? "" : "s"}` };
  const reasons = list.filter((r) => (r === reason ? !has : current.reasons.includes(r)));
  const next: BoardVerdict = current.note === undefined ? { verdict: "reject", reasons } : { verdict: "reject", reasons, note: current.note };
  return { kind: "mark", verdict: next, advance: false };
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

/** A verdict the keys or a click cast, carrying the note the tile already holds (a note survives K, X and a reason). */
export function keepingNote(prev: BoardVerdict | undefined, next: BoardVerdict | null): BoardVerdict | null {
  if (next === null || next.note !== undefined || prev?.note === undefined) return next;
  return { ...next, note: prev.note };
}
