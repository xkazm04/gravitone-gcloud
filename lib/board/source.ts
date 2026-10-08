// What the Board needs from a source BEYOND the wire contract in ./types.ts.
//
// `BoardSource` (types.ts) is the contract every adapter honours, and it is
// fixed. Three things a surface needs could not be carried on it without
// changing that file, so they live here as an extension the adapters also
// implement:
//
//   · COUNTS FIRST. A source whose items live behind one request per run, or
//     one IndexedDB read per project, must be able to say "12 pending" before
//     anybody pays for the items (brief, Risks: "lazy per-source load, counted
//     not fully hydrated"). `count()` is that answer; `null` in it is
//     "unmeasured", never zero.
//   · WHERE IT LIVES. Every item has a native surface, and the Board links to
//     it — the Foundry commit, a locked style, a refused reject all end there.
//   · WHAT IT REFUSES. Some verdicts have no native writer: an adoption is one
//     pick among N, so "reject this candidate" has nowhere to be written; a
//     required research card cannot be cut; a cancelled publish slot cannot
//     return to missed. An adapter names the refusal per item rather than
//     pretending the write happened.
//
// A source may ALSO carry a stage axis - see ./pipeline.ts `PipelineCapable`.
// That half is OPTIONAL and additive: every adapter in this directory predates
// it and not one had to change when it arrived. The pipeline canvas draws the
// sources that implement it; the Board draws all of them, as before.

import type { BoardItem, BoardSource, BoardSourceId, BoardVerdict } from "./types";

/** One verdict key the surface can press. `clear` is U (back to undecided). */
export type VerdictKey = "approve" | "reject" | "clear";

export const keyOf = (v: BoardVerdict): VerdictKey => (v === null ? "clear" : v);

/** An item plus what the surface needs to draw and route it. */
export interface BoardEntry {
  item: BoardItem;
  /** The native surface this item is decided on when the Board cannot. */
  href: string;
  /** Short facts about the work: a model, a score, a scene, a date. Verbatim. */
  facts: { name: string; value: string }[];
  /** Per verdict key, why the native writer cannot take it. Absent = allowed. */
  refuse: Partial<Record<VerdictKey, string>>;
}

/** What a source says about itself before its items are loaded. `null` is
 *  "not measured from the summary", never a zero. */
export interface BoardCount {
  total: number | null;
  pending: number | null;
  decided: number | null;
  rejected: number | null;
}

/** A source could not be read at all — the route is not built, the network is
 *  down, IndexedDB is absent, nobody is signed in. Distinct from an error in an
 *  item: the surface renders this as the source's STATE, not as a crash. */
export class SourceUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceUnavailable";
  }
}

/** A verdict the native writer cannot take, raised by `decide`. */
export class VerdictRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerdictRefused";
  }
}

export interface BoardSourceExt extends BoardSource {
  /** The source's native surface, for the rail and for refusals. */
  native: { href: string; label: string };
  /** One decision on an item moves its siblings too (a one-of-N pick). The
   *  Board reloads the source after a decide and records every item that moved,
   *  so an undo can put all of them back. */
  exclusive: boolean;
  /** Commit stays on the native surface (destructive, confirmed there). The
   *  Board shows "decided N/M" per group with a link instead. */
  commitsOn: { href: string; label: string } | null;
  count(): Promise<BoardCount>;
  loadEntries(): Promise<BoardEntry[]>;
}

export const SOURCE_ORDER: BoardSourceId[] = ["cull", "extract", "dojo", "proof", "adoption", "alternative", "triage", "publish", "articles"];

/** Build the `${source}:${key}` id the wire type promises, and take it apart. */
export const itemId = (source: BoardSourceId, key: string): string => `${source}:${key}`;
export function keyOfItem(id: string): string {
  const at = id.indexOf(":");
  return at < 0 ? id : id.slice(at + 1);
}

/** Counts derived from loaded entries — the exact answer, once it is paid for. */
export function countEntries(entries: readonly BoardEntry[]): BoardCount {
  let pending = 0;
  let rejected = 0;
  for (const e of entries) {
    if (e.item.verdict === null) pending++;
    else if (e.item.verdict === "reject") rejected++;
  }
  return { total: entries.length, pending, decided: entries.length - pending, rejected };
}

/** A source's `load()` from its entries — the wire contract, kept honest. */
export const itemsOf = (entries: Promise<BoardEntry[]>): Promise<BoardItem[]> => entries.then((es) => es.map((e) => e.item));
