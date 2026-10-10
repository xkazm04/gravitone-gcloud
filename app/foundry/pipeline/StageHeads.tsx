"use client";

// THE X AXIS, ALONG THE TOP — one head per stage, one per band beneath it, and a
// line with light running left to right because a pipeline is a direction.
//
// `right` is the room BoardControls says it needs (`--gt-board-gutter`): the
// heads scroll with the camera and those controls do not, so nothing lays the
// two out relative to each other and this is how they stop colliding.

import { memo, useMemo, useRef, useLayoutEffect } from "react";

import { animate } from "motion/react";

import { STAGE_MEANS, type CanonStage } from "@/lib/board/pipeline";

import { FRAME, type Column, type Layout, type StageSpan } from "./geometry";
import { HEAD_GLASS, HeadSlot, Roll, type HeadRegistry } from "./headRegistry";
import { STAGE_TONE } from "./tone";

function columnTotals(l: Layout): number[] {
  const nC = l.columns.length;
  const out = new Array<number>(nC).fill(0);
  for (let i = 0; i < l.ids.length; i++) out[i % nC] += l.ids[i].length;
  return out;
}


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
    // `right` is the room BoardControls says it needs (--gt-board-gutter, written
    // by that component from its own measured width). The heads scroll with the
    // camera and the controls do not, so nothing lays them out relative to each
    // other; this is how the two stop colliding.
    <div className="pointer-events-none absolute top-0 overflow-hidden" style={{ left: FRAME.left, right: "var(--gt-board-gutter, 0px)", height: FRAME.top }}>
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
