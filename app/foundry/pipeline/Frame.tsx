"use client";

// THE FURNITURE — stage heads along the top, lane heads down the left, and the
// cells the cards sit in.
//
// The heads are OVERLAYS, not world content: they follow the camera but do not
// scale with it, so a stage's word stays 16px when the board is zoomed out to
// a thumbnail, and a lane's name stays readable while its 500-card column
// scrolls past. Their position is written straight to the DOM by the
// registry below on every camera change — the same rule as the world layer: a
// pan step reaches the DOM, not React.
//
// The cells ARE world content (they scale), and only the cells in the viewport
// are mounted. During a drag they are also the preview: each one is lit by what
// the authority said about dropping the dragged card there, ONCE, at drag start.

import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";

import { animate } from "motion/react";

import { EASE } from "@/components/ui/tokens";
import { STAGE_MEANS, type CanonStage } from "@/lib/board/pipeline";

import {
  CARD_H,
  CARD_W,
  FRAME,
  tailPos,
  type Camera,
  type Column,
  type Layout,
  type Lane,
  type StageSpan,
} from "./geometry";
import { STAGE_TONE } from "./tone";
import type { Verdict } from "./types";

const EASE4 = [...EASE] as [number, number, number, number];

/* ── head registry: DOM writes, no React ───────────────────────────────── */

interface HeadSpec {
  axis: "x" | "y";
  at: number;
  size: number;
}

export interface HeadRegistry {
  add(el: HTMLElement, spec: HeadSpec): () => void;
  apply(cam: Camera): void;
}

export function createHeadRegistry(initial: Camera): HeadRegistry {
  const heads = new Map<HTMLElement, HeadSpec>();
  let cam: Camera = initial;

  const place = (el: HTMLElement, s: HeadSpec) => {
    const label = el.firstElementChild as HTMLElement | null;
    if (s.axis === "x") {
      const left = s.at * cam.k + cam.x - FRAME.left;
      const w = s.size * cam.k;
      el.style.transform = `translate3d(${left}px,0,0)`;
      el.style.width = `${w}px`;
      // A span too narrow for its word and count drops the count and the tracking
      // (the markup reads `group-data-[narrow]`), so the word is still a word.
      el.dataset.narrow = w < 170 ? "1" : "0";
      // The label stays in view while its span is wider than the viewport.
      if (label) label.style.transform = `translate3d(${Math.max(0, Math.min(w - 96, 8 - left))}px,0,0)`;
    } else {
      const top = s.at * cam.k + cam.y - FRAME.top;
      const h = s.size * cam.k;
      el.style.transform = `translate3d(0,${top}px,0)`;
      el.style.height = `${h}px`;
      if (label) label.style.transform = `translate3d(0,${Math.max(0, Math.min(h - 64, 8 - top))}px,0)`;
    }
  };

  return {
    add(el, spec) {
      heads.set(el, spec);
      place(el, spec);
      return () => {
        heads.delete(el);
      };
    },
    apply(next) {
      cam = next;
      heads.forEach((s, el) => place(el, s));
    },
  };
}

function HeadSlot({
  reg,
  axis,
  at,
  size,
  className,
  children,
}: {
  reg: HeadRegistry;
  axis: "x" | "y";
  at: number;
  size: number;
  className: string;
  children: React.ReactNode;
}) {
  const ref = useCallback((el: HTMLDivElement | null) => (el ? reg.add(el, { axis, at, size }) : undefined), [reg, axis, at, size]);
  return (
    <div ref={ref} className={`group/head absolute top-0 left-0 ${className}`}>
      {children}
    </div>
  );
}

/* ── a count that rolls ────────────────────────────────────────────────── */

/** The number rolls from where it was to where it is. First paint rolls up from
 *  zero — which is "cards settling into lanes on load". `calm` sets it plainly. */
export function Roll({ value, calm }: { value: number; calm: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (calm || shown.current === value) {
      shown.current = value;
      el.textContent = String(value);
      return;
    }
    const a = animate(shown.current, value, {
      duration: 0.6,
      ease: EASE4,
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = String(Math.round(v));
      },
    });
    return () => a.stop();
  }, [value, calm]);
  return (
    <span className="tabular-nums">
      <span ref={ref} aria-hidden />
      <span className="sr-only">{value}</span>
    </span>
  );
}

/* ── the heads ─────────────────────────────────────────────────────────── */

function columnTotals(l: Layout): number[] {
  const nC = l.columns.length;
  const out = new Array<number>(nC).fill(0);
  for (let i = 0; i < l.ids.length; i++) out[i % nC] += l.ids[i].length;
  return out;
}

const HEAD_GLASS = "overflow-hidden rounded-lg border border-white/10 bg-[var(--gt-ink)]/70 backdrop-blur-md";

export const StageHeads = memo(function StageHeads({
  layout,
  reg,
  names,
  calm,
}: {
  layout: Layout;
  reg: HeadRegistry;
  names: Partial<Record<CanonStage, string>>;
  calm: boolean;
}) {
  const totals = useMemo(() => columnTotals(layout), [layout]);
  const banded = layout.stages.some((s) => s.banded);
  return (
    <div className="pointer-events-none absolute top-0 right-0 overflow-hidden" style={{ left: FRAME.left, height: FRAME.top }}>
      {layout.stages.map((s: StageSpan) => {
        const word = names[s.stage] ?? s.stage;
        const total = layout.stageCounts[s.stage];
        return (
          <HeadSlot key={s.stage} reg={reg} axis="x" at={s.x} size={s.w} className="h-8 overflow-hidden pr-1">
            <div
              role="group"
              aria-label={`${word}, ${total} cards`}
              className={`font-jetbrains absolute inset-y-0 left-0 flex w-max items-center gap-2 px-2 text-label tracking-[0.12em] uppercase group-data-[narrow=1]/head:gap-1 group-data-[narrow=1]/head:px-1 group-data-[narrow=1]/head:tracking-normal ${STAGE_TONE[s.stage].head}`}
            >
              <span aria-hidden className={`h-2 w-2 rounded-full ${STAGE_TONE[s.stage].dot} ${s.stage === "gate" && total > 0 && !calm ? "animate-pulse" : ""}`} />
              <span>{word}</span>
              <span className="group-data-[narrow=1]/head:hidden">
                <Roll value={total} calm={calm} />
              </span>
              <span className="sr-only">{STAGE_MEANS[s.stage]}</span>
            </div>
          </HeadSlot>
        );
      })}
      {banded &&
        layout.columns
          .filter((c: Column) => layout.stages.find((s) => s.stage === c.stage)?.banded)
          .map((c) => (
            <HeadSlot key={c.index} reg={reg} axis="x" at={c.x} size={c.w} className="top-8 h-6 overflow-hidden pr-1">
              <div
                className={`font-jetbrains absolute inset-y-0 left-0 flex w-max items-center gap-2 px-2 text-label text-white/55 ${HEAD_GLASS} !rounded-md`}
              >
                <span>{c.label}</span>
                <span className="tabular-nums text-white/70 group-data-[narrow=1]/head:hidden">{totals[c.index]}</span>
              </div>
            </HeadSlot>
          ))}
      <Flow calm={calm} />
    </div>
  );
});

/** The X axis is a direction: a thin line under the heads with light flowing
 *  along it, left to right, the way a card travels. Compositor-only (one
 *  transform), and absent under reduced motion. */
function Flow({ calm }: { calm: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || calm) return;
    const a = animate(el, { x: ["-40%", "260%"] }, { duration: 4.2, ease: "linear", repeat: Infinity });
    return () => a.stop();
  }, [calm]);
  return (
    <div aria-hidden className="absolute right-0 bottom-0 left-0 h-px overflow-hidden bg-white/10">
      <div ref={ref} className="h-px w-1/3 bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
    </div>
  );
}

export const LaneHeads = memo(function LaneHeads({
  layout,
  from,
  to,
  reg,
}: {
  layout: Layout;
  from: number;
  to: number;
  reg: HeadRegistry;
}) {
  const lanes = layout.lanes.slice(from, to);
  return (
    <div className="pointer-events-none absolute bottom-0 left-0 overflow-hidden" style={{ top: FRAME.top, width: FRAME.left }}>
      {/* THE LABEL, AND NOTHING UNDER IT. Each head carried a `<Tally>` of the
          lane's card count on a second row, which doubled the head's height for
          a number the columns beside it already show — every stage head carries
          its own count, and a lane's total is their sum, across the very row the
          head is labelling. A group header is a NAME. */}
      {lanes.map((lane: Lane) => (
        <HeadSlot key={lane.key} reg={reg} axis="y" at={lane.y} size={lane.h} className="w-full pr-2">
          <div className="absolute top-0 left-0 w-full pr-2">
            <div className={`${HEAD_GLASS} px-3 py-1.5`}>
              <p className="font-instrument truncate text-xl leading-tight text-white/90">{lane.label || " "}</p>
            </div>
          </div>
        </HeadSlot>
      ))}
    </div>
  );
});

/* ── the cells ─────────────────────────────────────────────────────────── */

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
          className={`font-jetbrains absolute top-0 left-0 grid place-items-center rounded-xl border-2 border-dashed text-label tracking-[0.12em] uppercase ${SLOT[verdict.kind]}`}
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

