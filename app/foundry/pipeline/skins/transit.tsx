// v3 · TRANSIT MAP — items ride continuous lines; stages are stations with dwell.
//
// THE BET. In the other three directions a card's stage is a FACT ABOUT IT, read
// off which column it happens to be in. Here the stage is a PLACE on a route the
// item is travelling, the route is drawn, and the direction of travel is the
// loudest thing on the board. One lane is one line. Each line runs left to right
// through four stations — origin, transit, held, terminus — coloured by the
// stage it is crossing, dashed in the gaps between stages where an item is in
// motion, with a pulsing chevron on the one approach that hands the work to a
// person. A card is a vehicle: it carries a coupler dot on its left edge that
// lands exactly on its station's ring.
//
// WHAT IT MAKES VISIBLE that a column order cannot: a lane whose line is bright
// amber from the second station onward is a lane where everything is waiting on
// you, and you see it without reading a number.
//
// ── THE DENSITY QUESTION, WHICH THIS DIRECTION IS NOT ALLOWED TO DODGE ──────
//
// `world` re-renders on every layout change, so the first thing to get right is
// that its cost does NOT grow with the number of cards:
//
//   per lane:  4 stage segments + 3 connectors + 3 chevrons + 1 terminus + one
//              ring per column
//   per CELL:  at most one platform rect, and only when the cell holds 2+ cards
//
// which is O(lanes x columns) and nothing else. There is deliberately no path
// per card — the shape of the "498 trains" problem is that a path per card is
// 498 nodes in a layer that re-renders on a re-group, and the honest fix is to
// draw the QUEUE rather than its members. A cell with 498 cards draws ONE
// platform rect 43,736px long.
//
// That is the cheap half. The expensive half is that the metaphor itself has a
// ceiling, and the ceiling is geometric, not computational:
//
//   a row is PITCH = 88 world px. A card's 1rem type is legible down to about
//   k = 0.7 (16px * 0.7 = 11.2px rendered). The open board in a 1100px-tall
//   window is 1100 - FRAME.top - 2*FRAME.inset = 996 screen px, which at k=0.7
//   is 1423 world px, which is 16 rows.
//
// So: ABOVE ~16 CARDS IN ONE CELL YOU CANNOT SEE THE STATION AND THE TAIL OF
// ITS QUEUE AT THE SAME TIME AT A ZOOM WHERE THE CARDS CAN BE READ. Past that
// the spine has scrolled off the top of the window and what is left on screen
// is a column of cards with a thin bar beside it — which is to say, v1 with
// worse type. At 498 in one cell the platform is 44,000 world px and the whole
// line fits on screen only at k = 0.07, below ZOOM_MIN, where a card is 6px
// tall. Measured; the numbers are in the report, and this is the finding the
// brief asked for rather than a failure.

import { Check, ChevronsRight, Circle, Pause } from "lucide-react";

import type { CanonStage, PipelineEntry } from "@/lib/board/pipeline";

import { CARD_H, CARD_W, COL_PAD, LANE_PAD, PITCH, type Layout } from "../geometry";
import { dwell } from "../dwell";
import type { PipelineSkin } from "../types";

/** The rail runs in the column's left gutter — COL_PAD is 12 world px, and this
 *  is the middle of it, five px clear of the card's left edge.
 *
 *  It was INSIDE the card for one draft, lined up under the face's coupler dot,
 *  and the screenshot is what caught it: a card is painted over the world layer,
 *  so every platform bar was perfectly hidden under the queue it was drawing.
 *  Out here the ring's right edge touches the card and the platform runs down
 *  the gutter in the open, which is the only place it can be seen at all. */
const RAIL_DX = -5;

const STATION_ICON: Record<CanonStage, typeof Circle> = {
  proposed: Circle,
  working: ChevronsRight,
  gate: Pause,
  done: Check,
};

/** Gate is `Pause` in amber — held at a signal, waiting on a person — against
 *  working's cyan double chevron, which is moving. That is the distinction in
 *  KIND that lib/board/pipeline.ts STAGE_MEANS requires of a skin. */
const STATION_INK: Record<CanonStage, string> = {
  proposed: "text-white/45",
  working: "text-cyan-300/85",
  gate: "text-amber-300",
  done: "text-emerald-300/70",
};

const COUPLER: Record<CanonStage, string> = {
  proposed: "bg-white/35",
  working: "bg-cyan-300/80",
  gate: "bg-amber-300",
  done: "bg-emerald-300/60",
};

/** The line's colour inside each stage. The route is read by hue before it is
 *  read by position, which is the whole bet. */
const LINE: Record<CanonStage, string> = {
  proposed: "stroke-white/25",
  working: "stroke-cyan-300/50",
  gate: "stroke-amber-300/80",
  done: "stroke-emerald-300/40",
};

const RING: Record<CanonStage, string> = {
  proposed: "stroke-white/30",
  working: "stroke-cyan-300/55",
  gate: "stroke-amber-300/90",
  done: "stroke-emerald-300/45",
};

const PLATFORM: Record<CanonStage, string> = {
  proposed: "fill-white/15",
  working: "fill-cyan-300/30",
  gate: "fill-amber-300/55",
  done: "fill-emerald-300/25",
};

const valueOf = (entry: PipelineEntry, name: string): string | undefined =>
  entry.facts.find((f) => f.name === name)?.value;

function transitFace(entry: PipelineEntry) {
  const stage = entry.placement.stage;
  const Station = STATION_ICON[stage];
  // WHAT IT IS CARRYING — not which line it is on. The lane is the line, drawn
  // under the card and named in the lane head, and a first draft put it here
  // too: every card in a lane then read `LLM-AGENT · …` and the only field with
  // anything new in it was the one being truncated to make room for it.
  const route = [entry.placement.band ?? valueOf(entry, "kind"), valueOf(entry, "provider")].filter(Boolean).join(" · ");
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-1 pr-11 pl-6">
      {/* The coupler: flush with the card's left edge, pointing at the rail that
          `world` runs five px outside it. */}
      <span aria-hidden className={`absolute top-1/2 left-0 size-2.5 -translate-y-1/2 rounded-full ${COUPLER[stage]}`} />
      <div className="flex min-w-0 items-center gap-2">
        <Station className={`size-4 shrink-0 ${STATION_INK[stage]}`} strokeWidth={stage === "gate" ? 2.5 : 2} aria-hidden />
        <p className={`font-hanken min-w-0 flex-1 truncate text-label ${stage === "gate" ? "font-semibold text-white" : "text-white/88"}`}>{entry.item.title}</p>
        <p className="font-jetbrains shrink-0 text-label tabular-nums text-white/55">{dwell(entry.item.createdAt)}</p>
      </div>
      <p className="font-jetbrains truncate pl-6 text-label tracking-[0.14em] text-white/40 uppercase">{route}</p>
    </div>
  );
}

/** How far past a stage's outer columns the line runs before it breaks into the
 *  dashed connector. Enough that the line emerges from under the first card and
 *  disappears under the last one. */
const OVERRUN = 14;

function transitWorld(layout: Layout) {
  const { columns, lanes, stages, width, height } = layout;
  const spans = stages.filter((s) => s.to > s.from);
  if (!columns.length || !lanes.length || !spans.length) return null;
  const nC = columns.length;
  const railX = (col: number) => columns[col].x + COL_PAD + RAIL_DX;
  const enterX = (i: number) => columns[spans[i].from].x + COL_PAD - OVERRUN;
  const leaveX = (i: number) => columns[spans[i].to - 1].x + COL_PAD + CARD_W + OVERRUN;

  return (
    <svg aria-hidden className="absolute top-0 left-0 overflow-visible" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {lanes.map((lane) => {
        const y = lane.y + LANE_PAD + CARD_H / 2;
        return (
          <g key={lane.key}>
            {/* The route, one coloured segment per stage. */}
            {spans.map((span, i) => (
              <line key={`s${span.stage}`} x1={enterX(i)} y1={y} x2={leaveX(i)} y2={y} strokeWidth={3} strokeLinecap="round" className={LINE[span.stage]} />
            ))}
            {/* In motion between stations: dashed, and a chevron for direction.
                Only the approach to `gate` pulses, because that is the one
                handover a person is on the other end of. */}
            {spans.slice(0, -1).map((span, i) => {
              const x0 = leaveX(i);
              const x1 = enterX(i + 1);
              const mid = (x0 + x1) / 2;
              const next = spans[i + 1].stage;
              return (
                <g key={`c${span.stage}`}>
                  <line x1={x0} y1={y} x2={x1} y2={y} strokeWidth={1.5} strokeDasharray="3 7" className={LINE[next]} />
                  <path
                    d={`M ${mid - 4} ${y - 5} L ${mid + 4} ${y} L ${mid - 4} ${y + 5}`}
                    fill="none"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`${LINE[next]} ${next === "gate" ? "animate-pulse" : ""}`}
                  />
                </g>
              );
            })}
            {/* A station per column, in the gutter beside the first card. */}
            {columns.map((col) => (
              <circle key={col.index} cx={railX(col.index)} cy={y} r={5.5} fill="var(--gt-ink)" strokeWidth={2} className={RING[col.stage]} />
            ))}
            {/* The platform: queue depth as ONE rect per cell, never one per
                card. This is what keeps `world` independent of the board size. */}
            {columns.map((col) => {
              const n = layout.ids[lane.index * nC + col.index].length;
              if (n < 2) return null;
              return (
                <rect
                  key={`q${col.index}`}
                  x={railX(col.index) - 1.5}
                  y={y + 7}
                  width={3}
                  height={(n - 1) * PITCH - 7}
                  rx={1.5}
                  className={PLATFORM[col.stage]}
                />
              );
            })}
            {/* Terminus: the line ends, it does not fade out. */}
            <line
              x1={leaveX(spans.length - 1)}
              y1={y - 8}
              x2={leaveX(spans.length - 1)}
              y2={y + 8}
              strokeWidth={3}
              strokeLinecap="round"
              className={LINE[spans[spans.length - 1].stage]}
            />
          </g>
        );
      })}
    </svg>
  );
}

export const transit: PipelineSkin = {
  face: transitFace,
  world: transitWorld,
  // Station names. "held" is a vehicle stopped at a signal — which is exactly
  // "waiting on your judgement" and is the only stage on this board that is not
  // moving under its own power.
  stageLabel: { proposed: "origin", working: "transit", gate: "held", done: "terminus" },
};
