// THE CULL'S RUNS - the matrix's rows read as RUNS for a desk that shows the packet a run at a
// time (a grid of runs first, one run's variants large on demand). Pure, beside ./cull.ts whose
// cells it groups: a run is a row and its tiles, filed under its row's `group` (a scout night's
// look / scene / finding / watch / idea; absent, every run is one group).

import type { Look } from "../components/status/status.ts";
import type { BoardVerdict } from "./boardGate.ts";
import type { Cell } from "./cull.ts";
import type { RowWords } from "./port.ts";

export type Run = {
  readonly row: string;
  readonly words: RowWords | undefined;
  /** Cell indices (draw order) of this run's variants. */
  readonly members: readonly number[];
  readonly group: string;
};

/** Runs in draw order; a cell's row that the presentation does not name is still a run. */
export function runsOf(cells: readonly Cell[], rows: readonly RowWords[]): Run[] {
  const order = [...new Set(cells.map((c) => c.row))];
  return order.map((row) => {
    const words = rows.find((r) => r.id === row);
    return { row, words, members: cells.flatMap((c, i) => (c.row === row ? [i] : [])), group: words?.group ?? "" };
  });
}

/**
 * THE CATEGORIES a run is filed under on the mosaic, in the order their rows are drawn. A source may
 * name its run's category (`RowWords.group`, e.g. a scout night's scene is `videos`); a run that does
 * not is filed by what its first variant IS. `3d` and `music` are here before anything produces them
 * so a source that does finds its row waiting (operator, 2026-10-22: art styles and videos now,
 * music and 3D later). `ideas` - a scout night's idea artboards, one picture each - is drawn before
 * the words in the same tab (spark scout-idea-artboards). `seeds` - a batch's one-sentence seeds (spark
 * scout-decision-graph) - are words, filed in that tab under their own name.
 */
export const CATEGORIES = ["art styles", "videos", "music", "3d", "ideas", "seeds", "notes", "sources", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

const isCategory = (g: string): g is Category => (CATEGORIES as readonly string[]).includes(g);

/** A run's category: its source's word for it, else its first variant's media. */
export function categoryOf(run: Run, firstMime: string): Category {
  if (isCategory(run.group)) return run.group;
  if (firstMime.startsWith("image/")) return "art styles";
  if (firstMime.startsWith("video/")) return "videos";
  if (firstMime.startsWith("audio/")) return "music";
  if (firstMime.startsWith("model/")) return "3d";
  if (firstMime.startsWith("text/")) return "notes";
  return "other";
}

/** Runs filed by category, in CATEGORIES order; an empty category draws no row. */
export function categoriesOf(runs: readonly Run[], firstMime: (run: Run) => string): { readonly category: Category; readonly runs: readonly { readonly run: Run; readonly at: number }[] }[] {
  return CATEGORIES.map((category) => ({ category, runs: runs.flatMap((run, at) => (categoryOf(run, firstMime(run)) === category ? [{ run, at }] : [])) })).filter((c) => c.runs.length > 0);
}

/**
 * THE TABS the desk files categories under: one per KIND of content, so each gets the component and
 * the density it reads best at (operator, 2026-10-22) - pictures as a square mosaic, clips as 16:9
 * cards that play, takes as waveforms, and anything that is only words (findings, source lines) as
 * a dense list decided in place - under the night's idea artboards, square tiles like a still's. A
 * tab nothing fills is not drawn.
 */
export const TABS = ["images", "videos", "audio", "ideas"] as const;
export type Tab = (typeof TABS)[number];

const TAB_OF: Readonly<Record<Category, Tab>> = {
  "art styles": "images",
  "3d": "images",
  other: "images",
  videos: "videos",
  music: "audio",
  ideas: "ideas",
  seeds: "ideas",
  notes: "ideas",
  sources: "ideas",
};

export const tabOf = (c: Category): Tab => TAB_OF[c];

/** A run that is only words (its first variant text/*): decided where it lies, never opened. */
export const wordsOnly = (firstMime: string): boolean => firstMime.startsWith("text/");

/** The categories in each tab that has any, in TABS then CATEGORIES order. */
export function tabsOf(categories: ReturnType<typeof categoriesOf>): { readonly tab: Tab; readonly categories: ReturnType<typeof categoriesOf> }[] {
  return TABS.map((tab) => ({ tab, categories: categories.filter((c) => tabOf(c.category) === tab) })).filter((t) => t.categories.length > 0);
}

/** The run a cell sits in (index into `runs`), or 0. */
export function runAt(runs: readonly Run[], cell: number): number {
  const i = runs.findIndex((r) => r.members.includes(cell));
  return i < 0 ? 0 : i;
}

/** One pip per variant: kept is done, rejected is failed, open is idle - the shape carries it, not colour alone. */
export function runLooks(run: Run, cells: readonly Cell[], verdicts: Readonly<Record<string, BoardVerdict>>): Look[] {
  return run.members.map((i) => {
    const v = verdicts[cells[i]?.id ?? ""]?.verdict;
    return v === "keep" ? "done" : v === "reject" ? "failed" : "idle";
  });
}

export type RunState = "open" | "kept" | "rejected";

/**
 * TWO LEVELS, ONE VERDICT (operator, 2026-10-23): a run is judged whole, and an item inside it may
 * then differ. The run's verdict is read off its items: every item rejected is a rejected run; a
 * kept item with none left open is a kept run - its rejected items are exceptions inside it (the
 * subject did not fit, or another reason) - and anything else is still open.
 */
export function runState(run: Run, cells: readonly Cell[], verdicts: Readonly<Record<string, BoardVerdict>>): RunState {
  const vs = run.members.map((i) => verdicts[cells[i]?.id ?? ""]?.verdict);
  if (vs.length > 0 && vs.every((v) => v === "reject")) return "rejected";
  if (vs.some((v) => v === undefined)) return "open";
  return vs.some((v) => v === "keep") ? "kept" : "open";
}

/** The run's verdict as one value (its whole-run pick, the base a reason key adds to): kept, the
 *  first item's rejection with its reasons, or none while it is open. */
export function runVerdictOf(run: Run, cells: readonly Cell[], verdicts: Readonly<Record<string, BoardVerdict>>): BoardVerdict | undefined {
  const state = runState(run, cells, verdicts);
  if (state === "kept") return { verdict: "keep", reasons: [] };
  if (state === "rejected") return verdicts[cells[run.members[0] ?? -1]?.id ?? ""];
  return undefined;
}

/**
 * The items one item's verdict moves. Keeping an item keeps its run, so the run's items still open
 * are kept with it (a sibling already rejected stays the run's exception); rejecting or clearing an
 * item moves that item alone - and once every item is rejected, so is the run.
 */
export function itemAct(run: Run, cells: readonly Cell[], verdicts: Readonly<Record<string, BoardVerdict>>, cell: number, v: BoardVerdict | null): number[] {
  if (v?.verdict !== "keep") return [cell];
  return [cell, ...run.members.filter((i) => i !== cell && verdicts[cells[i]?.id ?? ""] === undefined)];
}

/** How many tracks a CSS grid lays out now (↑ / ↓ move a whole line of runs). */
export function columnsOf(el: Element | null): number {
  if (el === null || typeof getComputedStyle === "undefined") return 1;
  const n = getComputedStyle(el).gridTemplateColumns.split(" ").filter((t) => t !== "").length;
  return Math.max(1, n);
}
