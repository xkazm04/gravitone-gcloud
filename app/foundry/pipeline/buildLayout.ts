// NOT NAMED `layout.ts`, AND IT CANNOT BE. Every directory under app/ is a
// potential route segment, so `layout.ts` there is the SEGMENT'S LAYOUT and Next
// type-checks it as one — it asked this file for a default export and said so.
// The same trap waits for `page`, `route`, `template`, `error`, `loading`,
// `not-found` and `default`.
//
// BUILDING THE BOARD — entries in, a Layout out, once per data or axis change.
//
// This is the only thing in the geometry that ALLOCATES. Everything else reads
// the Layout it returns: where a card sits (./cells.ts), what the camera can see
// (./camera.ts). Keeping it apart is what makes that readable — a reader asking
// "where does a lane's height come from" lands on one 90-line function rather
// than in the middle of five hundred lines of mixed concerns.

import {
  CANON_STAGES,
  UNGROUPED_LANE,
  type CanonStage,
  type GroupAxis,
  type PipelineEntry,
  type PipelineSource,
} from "@/lib/board/pipeline";

import {
  BAND_W,
  GAP,
  LANE_GAP,
  LANE_MIN_ROWS,
  LANE_PAD,
  PITCH,
  STAGE_GAP,
  type Column,
  type Lane,
  type Layout,
  type Slot,
  type StageSpan,
} from "./grid";

/* ── building ──────────────────────────────────────────────────────────── */

type LaneSource = Pick<PipelineSource, "bands" | "lanes">;

/** Entries in, a layout out. Called once per change of entries or axis, never per
 *  pan, zoom or pointer move. */
export function buildLayout(entries: readonly PipelineEntry[], source: LaneSource, axis: GroupAxis): Layout {
  const items = entries.map((e) => e.item);

  const laneKeys: { key: string; label: string }[] = [];
  const laneIdx = new Map<string, number>();
  for (const d of source.lanes(items, axis)) {
    if (laneIdx.has(d.key)) continue;
    laneIdx.set(d.key, laneKeys.length);
    laneKeys.push({ key: d.key, label: d.label });
  }
  const fallback = () => {
    let i = laneIdx.get(UNGROUPED_LANE);
    if (i === undefined) {
      i = laneKeys.length;
      laneIdx.set(UNGROUPED_LANE, i);
      laneKeys.push({ key: UNGROUPED_LANE, label: "ungrouped" });
    }
    return i;
  };

  // A stage with no bands draws one bare column; a source that does not use a
  // stage still draws it, empty, so the furniture does not shift between sources.
  const columns: Column[] = [];
  const stages: StageSpan[] = [];
  const colOf = new Map<string, number>();
  const firstOf = {} as Record<CanonStage, number>;
  let x = 0;
  for (const stage of CANON_STAGES) {
    const bands = source.bands[stage] ?? [];
    const from = columns.length;
    const x0 = x;
    firstOf[stage] = from;
    if (bands.length === 0) {
      colOf.set(`${stage}|`, columns.length);
      columns.push({ index: columns.length, stage, band: null, label: "", x, w: BAND_W });
      x += BAND_W;
    } else {
      for (const b of bands) {
        colOf.set(`${stage}|${b.id}`, columns.length);
        columns.push({ index: columns.length, stage, band: b.id, label: b.label, x, w: BAND_W });
        x += BAND_W;
      }
    }
    stages.push({ stage, x: x0, w: x - x0, from, to: columns.length, banded: bands.length > 0 });
    x += STAGE_GAP;
  }
  const width = x - STAGE_GAP;

  const placed: { id: string; lane: number; col: number }[] = [];
  const stageCounts = { proposed: 0, working: 0, gate: 0, done: 0 } as Record<CanonStage, number>;
  for (const e of entries) {
    const p = e.placement;
    const col = colOf.get(`${p.stage}|${p.band ?? ""}`) ?? firstOf[p.stage];
    const lane = laneIdx.get(axis.of(e.item)) ?? fallback();
    placed.push({ id: e.item.id, lane, col });
    stageCounts[p.stage]++;
  }
  if (laneKeys.length === 0) fallback();

  const nC = columns.length;
  const ids: string[][] = Array.from({ length: laneKeys.length * nC }, () => []);
  const slotOf = new Map<string, Slot>();
  const entryOf = new Map<string, PipelineEntry>();
  for (const e of entries) entryOf.set(e.item.id, e);
  for (const p of placed) {
    const cell = ids[p.lane * nC + p.col];
    slotOf.set(p.id, { lane: p.lane, col: p.col, row: cell.length });
    cell.push(p.id);
  }

  const lanes: Lane[] = [];
  let y = 0;
  for (let i = 0; i < laneKeys.length; i++) {
    let rows = 0;
    for (let c = 0; c < nC; c++) rows = Math.max(rows, ids[i * nC + c].length);
    // NO RESERVED DROP ROW. Every lane used to carry `rows + 1`, so a drag could
    // never make a lane taller and the lanes below it never jumped while the
    // pointer was down. The cost was a permanent empty row in EVERY lane — a
    // one-card lane stood 192px tall to hold 80px of card — and round 1's
    // verdict was that the y axis was eating the board. It is not load-bearing
    // for the drop: `resolveCell` resolves a CELL, never a row, and it already
    // forgives half a LANE_GAP past the lane's bottom edge, so the append target
    // is reachable without a row of slack behind it. What is lost is narrow and
    // it is after the fact: a lane that gains its first card in a column grows
    // by one PITCH, and the lanes below it shift once — on commit, with the
    // pointer already up, not under it.
    const h = LANE_PAD * 2 + Math.max(LANE_MIN_ROWS, rows) * PITCH - GAP;
    lanes.push({ index: i, key: laneKeys[i].key, label: laneKeys[i].label, y, h, rows });
    y += h + LANE_GAP;
  }
  const height = Math.max(0, y - LANE_GAP);

  return { columns, lanes, stages, width, height, ids, slotOf, entryOf, total: entries.length, stageCounts };
}
