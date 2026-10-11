"use client";

// THE Y AXIS, DOWN THE LEFT — a lane's name, and nothing under it.
//
// Each head used to carry a `<Tally>` of its lane's card count on a second row,
// which doubled its height for a number the columns beside it already show:
// every stage head carries its own count, across the very row this is labelling.
// A group header is a NAME.
//
// And a name is `TYPE.title` — the work's own words, at `text-content` — the
// third rung of the header system ./StageHeads.tsx describes. It was a serif at
// `text-xl`, a fixed size, which was the one head full screen could not grow:
// full screen rescales the two type tokens and nothing else.

import { memo } from "react";

import { FRAME, type Lane, type Layout } from "./geometry";
import { HEAD_GLASS, HeadSlot, type HeadRegistry } from "./headRegistry";
import { TYPE } from "./type";

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
              <p className={`${TYPE.title} truncate leading-tight text-white/90`}>{lane.label || " "}</p>
            </div>
          </div>
        </HeadSlot>
      ))}
    </div>
  );
});

/* ── the cells ─────────────────────────────────────────────────────────── */
