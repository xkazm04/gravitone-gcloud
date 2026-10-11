"use client";

// THE X AXIS, ALONG THE TOP — one head per stage, and under a banded stage one
// joined bar of its bands, and a line with light running left to right because
// a pipeline is a direction.
//
// ONE HEADER SYSTEM, three rungs, all from ./type.ts: the STAGE is `TYPE.label`
// in the stage's own tone with its dot and count; a BAND is the same role,
// quieter, as one segment of a single rounded bar per stage (hairlines between
// segments, never separate floating chips, which read as four buttons); a LANE
// (./LaneHeads.tsx) is the work's own name, `TYPE.title`. Full screen rescales
// the two tokens those roles are built on, so all three grow together.
//
// The heads used to stop short of the right edge by a measured gutter, because
// the board's controls floated over that corner. The controls are a row above
// the board now (../PipelineTab.tsx), so the heads run the full width.

import { memo, useMemo, useRef, useLayoutEffect } from "react";

import { animate } from "motion/react";

import { STAGE_MEANS, type CanonStage } from "@/lib/board/pipeline";

import { FRAME, type Column, type Layout, type StageSpan } from "./geometry";
import { HEAD_GLASS, HeadSlot, Roll, type HeadRegistry } from "./headRegistry";
import { STAGE_TONE } from "./tone";
import { TYPE } from "./type";

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
  return (
    // AN OPAQUE GROUND: a card panned up under the strip is hidden by it, not
    // drawn through the stage's word (photographed in full screen, where the
    // zoom lifts the first lane under the heads).
    <div className="pointer-events-none absolute top-0 right-0 overflow-hidden rounded-tr-xl bg-[var(--gt-ink)]" style={{ left: FRAME.left, height: FRAME.top }}>
      {layout.stages.map((s: StageSpan) => {
        const word = names[s.stage] ?? s.stage;
        const total = layout.stageCounts[s.stage];
        return (
          <HeadSlot key={s.stage} reg={reg} axis="x" at={s.x} size={s.w} className="h-8 overflow-hidden pr-1">
            <div
              role="group"
              aria-label={`${word}, ${total} cards`}
              className={`${TYPE.label} absolute inset-y-0 left-0 flex w-max items-center gap-2 px-2 group-data-[narrow=1]/head:gap-1 group-data-[narrow=1]/head:px-1 group-data-[narrow=1]/head:tracking-normal ${STAGE_TONE[s.stage].head}`}
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
      {layout.stages
        .filter((s) => s.banded)
        .map((s) => (
          // ONE BAR PER STAGE, spanning exactly the stage, so a segment sits over
          // its own column at every zoom: its left and width are the column's
          // share of the span, and the slot is scaled with the camera.
          <HeadSlot key={s.stage} reg={reg} axis="x" at={s.x} size={s.w} stick={false} className="top-8 h-[1.625rem] pr-1">
            <div role="group" aria-label={`${names[s.stage] ?? s.stage} bands`} className={`absolute inset-y-0 right-1 left-0 ${HEAD_GLASS} !rounded-full`}>
              {layout.columns.slice(s.from, s.to).map((c: Column, i) => (
                <div
                  key={c.index}
                  className={`absolute inset-y-0 flex min-w-0 items-center justify-center gap-2 px-2 ${i > 0 ? "border-l border-white/10" : ""}`}
                  style={{ left: `${((c.x - s.x) / s.w) * 100}%`, width: `${(c.w / s.w) * 100}%` }}
                >
                  <span className={`${TYPE.label} min-w-0 truncate text-white/45`}>{c.label}</span>
                  <span className={`${TYPE.figure} shrink-0 text-white/70 group-data-[narrow=1]/head:hidden`}>{totals[c.index]}</span>
                </div>
              ))}
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
