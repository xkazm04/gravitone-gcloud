// v4 · WORKBENCH — a docked inspector follows the selection, so detail costs no modal.
//
// THE DIVISION OF LABOUR, because half of this direction is not in this file:
// the inspector PANE is the shell's (it mounts because `./index.ts` declares
// `inspector: true` on this variant). This file is the other half, and its whole
// job is to be the board that deserves to sit beside a pane — which means
// giving up almost everything the other three fight for.
//
// THE BET, restated as a rule about this file: A CARD HERE REPEATS NOTHING THE
// PANE WILL SHOW. The provider, the cost, the model, the status, the band, the
// error, the length — all of it is one pane away and none of it is on the card.
// What is left is the three marks you need in order to decide WHICH card to put
// in the pane next:
//
//   1. the name, on up to two lines, because nothing is competing for the room
//      and a truncated name is the one thing that makes you open the wrong card;
//   2. a 4px spine in the stage's hue — amber and full strength for `gate`,
//      because the only question this board answers on its own is "which of
//      these is waiting on me";
//   3. dwell: how long it has been standing there.
//
// Everything else is deliberate absence. There is no icon, no chip, no second
// colour, no inner surface, no glow and nothing that moves: the eye should be
// resting on the pane, and a board that twitches beside an inspector is a board
// that costs you the thing you came for.
//
// `world` follows the same rule. It draws SLATS — each column's two edges, full
// board height, at 5% — and one rule under each lane. No ruling per row (that is
// v1's), no light (v2's), no route (v3's). The point is that the board still
// reads as a grid of columns when it has been squeezed into half a window by
// the pane, which is exactly where this direction is expected to lose.
//
// WHERE IT LOSES: screen width. Every pixel the pane takes is a pixel of board,
// and the pane is a fixed cost whether or not anything is selected — so on a
// laptop this direction shows the fewest items of the four and pays for a pane
// that may be empty.

import type { CanonStage, PipelineEntry } from "@/lib/board/pipeline";

import type { Layout } from "../geometry";
import type { PipelineSkin } from "../types";

/** The spine, and the only colour on a card. Gate is the single saturated mark
 *  on the whole board — which is how this direction tells gate from working in
 *  KIND rather than by column (lib/board/pipeline.ts STAGE_MEANS): a stage a
 *  machine owns is drawn at a third of the strength of one a person owns. */
const SPINE: Record<CanonStage, string> = {
  proposed: "bg-white/15",
  working: "bg-cyan-300/45",
  gate: "bg-amber-300",
  done: "bg-emerald-300/35",
};

/** How long it has been standing on the bench. The only figure a card carries,
 *  because it is the only one the pane cannot give you at a glance across
 *  twenty cards at once. */
function dwell(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function benchFace(entry: PipelineEntry) {
  const stage = entry.placement.stage;
  const waited = dwell(entry.item.createdAt);
  return (
    <div className="absolute inset-0 flex items-start gap-3 pt-3 pr-12 pl-4">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[4px] ${SPINE[stage]}`} />
      <p className={`font-hanken line-clamp-2 min-w-0 flex-1 text-content leading-tight ${stage === "gate" ? "text-white" : "text-white/85"}`}>{entry.item.title}</p>
      {waited && <p className="font-jetbrains shrink-0 text-label tabular-nums text-white/35">{waited}</p>}
    </div>
  );
}

/** The bench's slats: two hairlines per column, full board height, so the
 *  columns stay legible as columns when the pane has taken half the width.
 *  One element per column plus one per lane — nothing here grows with cards. */
function benchWorld(layout: Layout) {
  return (
    <div aria-hidden className="absolute top-0 left-0">
      {layout.columns.map((col) => (
        <span
          key={col.index}
          className="absolute top-0 left-0 border-x border-white/[0.07]"
          style={{ transform: `translate3d(${col.x}px, 0, 0)`, width: col.w, height: layout.height }}
        />
      ))}
      {layout.lanes.map((lane) => (
        <span
          key={lane.key}
          className="absolute top-0 left-0 border-t border-white/[0.14]"
          style={{ transform: `translate3d(0, ${lane.y + lane.h}px, 0)`, width: layout.width }}
        />
      ))}
    </div>
  );
}

export const bench: PipelineSkin = {
  face: benchFace,
  world: benchWorld,
  // A workshop's words. `bench` is the piece that is on YOUR bench; `machine` is
  // the one in the machine, which is the distinction the canon exists to keep.
  stageLabel: { proposed: "stock", working: "machine", gate: "bench", done: "finished" },
};
