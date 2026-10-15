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
 */
export function reasonAct(list: readonly string[], max: number, cap: string, current: BoardVerdict | undefined): ReasonAct {
  const reason = list[reasonSlot(cap)];
  if (reason === undefined) return { kind: "refuse", why: list.length === 0 ? "no reasons for this source" : `key ${cap} names no reason here` };
  if (current?.verdict !== "reject") return { kind: "mark", verdict: { verdict: "reject", reasons: [reason] }, advance: true };
  const has = current.reasons.includes(reason);
  if (!has && current.reasons.length >= max) return { kind: "refuse", why: `at most ${max} reason${max === 1 ? "" : "s"}` };
  const reasons = list.filter((r) => (r === reason ? !has : current.reasons.includes(r)));
  const next: BoardVerdict = current.note === undefined ? { verdict: "reject", reasons } : { verdict: "reject", reasons, note: current.note };
  return { kind: "mark", verdict: next, advance: false };
}
