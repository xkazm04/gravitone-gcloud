"use client";

// THE CELLS — world content, so they scale with the board, and only the ones in
// the viewport are mounted.
//
// During a drag they are also the PREVIEW: each is lit by what the authority
// said about dropping the dragged card there, asked ONCE per candidate cell at
// drag start and never again as the pointer moves.

import { memo } from "react";

import type { CanonStage } from "@/lib/board/pipeline";

import { CARD_H, CARD_W, tailPos, type Column, type Lane, type Layout } from "./geometry";
import { STAGE_TONE } from "./tone";
import { TYPE } from "./type";
import type { Verdict } from "./types";

export interface DragPreview {
  /** What dropping on (lane, col) would do. Memoized per drag. */
  verdictFor(lane: number, col: number): Verdict;
  over: { lane: number; col: number } | null;
}

const LIT: Record<Verdict["kind"], string> = {
  home: "",
  ok: "border-cyan-300/55 bg-cyan-300/[0.07]",
  needs: "border-violet-300/60 bg-violet-300/[0.08]",
  refused: "opacity-45",
};
const OVER: Record<Verdict["kind"], string> = {
  home: "border-white/25",
  ok: "border-cyan-300 bg-cyan-300/[0.14] shadow-[0_0_28px] shadow-cyan-300/15",
  needs: "border-violet-300 bg-violet-300/[0.16] shadow-[0_0_28px] shadow-violet-300/15",
  refused: "border-rose-300/80 bg-rose-300/[0.1] opacity-100",
};
const SLOT: Record<Verdict["kind"], string> = {
  home: "",
  ok: "border-cyan-300/80 text-cyan-100",
  needs: "border-violet-300/80 text-violet-100",
  refused: "border-rose-300/80 text-rose-100",
};

const Cell = memo(function Cell({
  col,
  lane,
  verdict,
  over,
  tail,
  slotWord,
}: {
  col: Column;
  lane: Lane;
  verdict: Verdict | null;
  over: boolean;
  tail: { x: number; y: number };
  slotWord: string;
}) {
  const tone = STAGE_TONE[col.stage];
  const lit = verdict ? (over ? OVER[verdict.kind] : LIT[verdict.kind]) : "";
  return (
    <>
      <div
        data-cell={`${lane.key}|${col.stage}|${col.band ?? ""}`}
        data-verdict={verdict ? verdict.kind : undefined}
        data-over={over || undefined}
        aria-hidden
        className={`absolute top-0 left-0 rounded-2xl border transition-[background-color,border-color,opacity,box-shadow] duration-150 ${tone.cell} ${lit}`}
        style={{ width: col.w, height: lane.h, transform: `translate3d(${col.x}px, ${lane.y}px, 0)` }}
      />
      {over && verdict && verdict.kind !== "home" && (
        <div
          aria-hidden
          data-slot={verdict.kind}
          className={`${TYPE.label} absolute top-0 left-0 grid place-items-center rounded-xl border-2 border-dashed ${SLOT[verdict.kind]}`}
          style={{ width: CARD_W, height: CARD_H, transform: `translate3d(${tail.x}px, ${tail.y}px, 0)` }}
        >
          {slotWord}
        </div>
      )}
    </>
  );
});

export const CellLayer = memo(function CellLayer({
  layout,
  from,
  to,
  preview,
  names,
}: {
  layout: Layout;
  from: number;
  to: number;
  preview: DragPreview | null;
  names: Partial<Record<CanonStage, string>>;
}) {
  const cells: React.ReactNode[] = [];
  for (let li = from; li < to; li++) {
    const lane = layout.lanes[li];
    for (const col of layout.columns) {
      const verdict = preview ? preview.verdictFor(li, col.index) : null;
      const over = !!preview?.over && preview.over.lane === li && preview.over.col === col.index;
      const n = layout.ids[li * layout.columns.length + col.index].length;
      cells.push(
        <Cell
          key={`${li}:${col.index}`}
          col={col}
          lane={lane}
          verdict={verdict}
          over={over}
          tail={over ? tailPos(layout, li, col.index) : { x: 0, y: 0 }}
          slotWord={over ? `${n + 1}/${n + 1}  ${names[col.stage] ?? col.stage}` : ""}
        />,
      );
    }
  }
  return <>{cells}</>;
});
