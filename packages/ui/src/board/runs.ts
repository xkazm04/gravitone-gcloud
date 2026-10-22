// THE CULL'S RUNS - the matrix's rows read as RUNS for a desk that shows the packet a run at a
// time (a grid of runs first, one run's variants large on demand). Pure, beside ./cull.ts whose
// cells it groups: a run is a row and its tiles, filed under its row's `group` (a scout night's
// look / scene / finding / watch; absent, every run is one group).

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

/** Runs filed by group, groups in first-seen order. */
export function groupsOf(runs: readonly Run[]): { readonly group: string; readonly runs: readonly { readonly run: Run; readonly at: number }[] }[] {
  const out: { group: string; runs: { run: Run; at: number }[] }[] = [];
  runs.forEach((run, at) => {
    const g = out.find((x) => x.group === run.group) ?? (out[out.push({ group: run.group, runs: [] }) - 1] as { group: string; runs: { run: Run; at: number }[] });
    g.runs.push({ run, at });
  });
  return out;
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

export type RunState = "open" | "kept" | "rejected" | "mixed";

export function runState(run: Run, cells: readonly Cell[], verdicts: Readonly<Record<string, BoardVerdict>>): RunState {
  const vs = run.members.map((i) => verdicts[cells[i]?.id ?? ""]?.verdict);
  if (vs.some((v) => v === undefined)) return "open";
  if (vs.every((v) => v === "keep")) return "kept";
  if (vs.every((v) => v === "reject")) return "rejected";
  return "mixed";
}

/** How many tracks a CSS grid lays out now (↑ / ↓ move a whole line of runs). */
export function columnsOf(el: Element | null): number {
  if (el === null || typeof getComputedStyle === "undefined") return 1;
  const n = getComputedStyle(el).gridTemplateColumns.split(" ").filter((t) => t !== "").length;
  return Math.max(1, n);
}
