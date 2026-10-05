// The Board's view state in the URL: `?src=&st=&i=&v=`. A pick of source,
// filter and item can be linked and survives a reload, which is the same
// reason components/ui/VariantSwitch.tsx keeps `v` there.
//
//   src  one source id, or absent for every source
//   st   pending (default) | decided | rejected
//   i    the selected item's `${source}:${key}`
//
// Pure: parse and write are asserted in the node lane.

import { SOURCE_ORDER } from "./source";
import type { BoardItem, BoardSourceId } from "./types";

export type BoardFilter = "pending" | "decided" | "rejected";
export const FILTERS: BoardFilter[] = ["pending", "decided", "rejected"];

export interface BoardQuery {
  src: BoardSourceId | null;
  st: BoardFilter;
  i: string | null;
}

export function parseQuery(params: { get(name: string): string | null }): BoardQuery {
  const rawSrc = params.get("src");
  const src = rawSrc && (SOURCE_ORDER as string[]).includes(rawSrc) ? (rawSrc as BoardSourceId) : null;
  const rawSt = params.get("st");
  const st = rawSt === "decided" || rawSt === "rejected" ? rawSt : "pending";
  const i = params.get("i") || null;
  return { src, st, i };
}

/** Write a query over existing params, keeping anything that is not ours (`v`). */
export function writeQuery(current: string, q: BoardQuery): string {
  const p = new URLSearchParams(current);
  if (q.src) p.set("src", q.src);
  else p.delete("src");
  if (q.st !== "pending") p.set("st", q.st);
  else p.delete("st");
  if (q.i) p.set("i", q.i);
  else p.delete("i");
  return p.toString();
}

/** Does an item belong under a filter? `decided` is every decided item;
 *  `rejected` is the read-only lane. */
export function inFilter(item: Pick<BoardItem, "verdict">, st: BoardFilter): boolean {
  if (st === "pending") return item.verdict === null;
  if (st === "rejected") return item.verdict === "reject";
  return item.verdict !== null;
}
