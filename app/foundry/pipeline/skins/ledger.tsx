// v1 · DENSE LEDGER — rules and type do all the work. ROUND 1'S WINNER.
//
// THE BET. A pipeline board is a TABLE, and a well-set table needs no boxes.
// Hierarchy comes from WEIGHT (the gate's title is the only semibold text on the
// board), ALIGNMENT (every title starts at one x, so forty cards read as one
// column) and a HAIRLINE (one rule in the middle of every row gap, drawn by
// `world`). There is no chip, no pill, no rounded inner surface and no colour
// but the stage's margin mark.
//
// ── WHAT ROUND 1 CHANGED, and it overruled this file's own argument ─────────
//
// This header used to read "ONE TYPE SIZE, deliberately — `text-label` for
// everything: title, figure, vendor, state, dwell", on the reasoning that
// 1.125rem against 1rem "is not a hierarchy, it is a wobble". The operator
// looked at it on live data and answered the opposite: the title is the only
// thing a card is FOR, and the four facts under it were costing it its
// readability. So:
//
//   · the title is `text-content` (1.125rem) — the 2px the operator asked for,
//     and a named token rather than an arbitrary size;
//   · the figure, the vendor, the state and the dwell are GONE from the card.
//     Not hidden behind a glyph, which is the same narration one level down —
//     removed, because every one of them was already in `ItemDetail` (created
//     time was the one exception and it was added there in the same change);
//   · the card shrank to one line, CARD_H 80 → 48, which is most of the
//     vertical space round 1 said the y axis was eating.
//
// WHAT THE CARD KEEPS BESIDES THE TITLE is one control and no facts: an audio
// item gets a PLAY button, so a take can be auditioned at the first level
// without opening anything. It carries no callback — `data-play` is found by the
// canvas's one delegated listener, exactly as `data-card` is, and one shared
// Audio element does the playing (PipelineCanvas `playFromCard`).
//
// WHERE IT LOSES, stated so it is judged against its own claim: there is still
// nothing to admire, and now there is less of it. A screenshot of this direction
// is a screenshot of a list.
//
// WHAT THIS DIRECTION CANNOT HAVE, a finding about the skin contract rather than
// a choice: "no card chrome at all" is not reachable from a skin. The ENGINE
// owns the card's 1px border, its `rounded-xl` corner and its stage tint
// (Card.tsx), and the shell is `overflow-hidden`, so a child cannot paint over a
// border it is clipped inside. The ruling in `world` is the answer.

import { Pause, Play } from "lucide-react";

import type { CanonStage, PipelineEntry } from "@/lib/board/pipeline";

import { CARD_H, GAP, LANE_PAD, PITCH, type Layout } from "../geometry";
import type { PipelineSkin } from "../types";

/** The margin mark, the one place this direction spends colour. Full height is
 *  "a person is the next step"; the short centred bar is "a machine is". Which
 *  satisfies lib/board/pipeline.ts STAGE_MEANS: gate differs from working in
 *  KIND here (length and hue), not merely by its column. */
const GUTTER: Record<CanonStage, string> = {
  proposed: "top-0 h-full bg-white/10",
  working: "top-[30%] h-[40%] bg-cyan-300/70",
  gate: "top-0 h-full bg-amber-300",
  done: "top-0 h-full bg-emerald-300/30",
};

/** The first playable source on the item, or undefined. The audio adapter puts
 *  `{ kind: "audio", src }` on a take that has a file (lib/board/sources/audio.ts);
 *  a prompt with no take yet has only text, and gets no button. */
const audioSrc = (entry: PipelineEntry): string | undefined =>
  entry.item.media.find((m): m is { kind: "audio"; src: string } => m.kind === "audio")?.src;

function ledgerFace(entry: PipelineEntry) {
  const stage = entry.placement.stage;
  const src = audioSrc(entry);
  return (
    <div className="absolute inset-0 flex items-center gap-2.5 pr-11 pl-3">
      <span aria-hidden className={`absolute left-0 w-[3px] ${GUTTER[stage]}`} />
      {src && (
        <button
          type="button"
          data-play
          data-src={src}
          // The accessible name is the WORK's — the take's own title — because
          // forty buttons called "play" are forty identical rows to a screen
          // reader. `data-playing` is written by the canvas on the one button
          // whose source the shared Audio element currently holds.
          aria-label={`Play ${entry.item.title}`}
          // A TOGGLE, not two buttons: the canvas flips `aria-pressed` and
          // `data-playing` on this node when the shared Audio takes its source,
          // so the glyph and the spoken state change without the memoised card
          // re-rendering. "Play <title>, pressed" is the standard reading of a
          // play/pause toggle; relabelling the verb would need the canvas to
          // know the title.
          aria-pressed={false}
          className="group/play grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full border border-white/20 text-white/70 transition hover:border-cyan-300/60 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 data-[playing]:border-cyan-300/70 data-[playing]:text-cyan-200"
        >
          {/* Two glyphs, one swapped by the attribute the canvas writes, so the
              button's state needs no React render of a memoised card. */}
          <Play aria-hidden className="h-3.5 w-3.5 group-data-[playing]/play:hidden" />
          <Pause aria-hidden className="hidden h-3.5 w-3.5 group-data-[playing]/play:block" />
        </button>
      )}
      <p className={`font-hanken min-w-0 truncate text-content ${stage === "gate" ? "font-semibold text-white" : "text-white/85"}`}>{entry.item.title}</p>
    </div>
  );
}

/** THE RULING. One element per lane, not one per row: a repeating gradient puts
 *  a hairline in the middle of every row gap for as many rows as the lane is
 *  tall, so the cost of ruling a 500-row lane is the cost of ruling a 2-row one.
 *  Offset by CARD_H + GAP/2 so a rule lands under a card, never across it.
 *  The colour is `--gt-hairline`, the same hairline the glass surface uses. */
function ledgerWorld(layout: Layout) {
  const ruleAt = LANE_PAD + CARD_H + GAP / 2;
  return (
    <div aria-hidden className="absolute top-0 left-0">
      {layout.lanes.map((lane) => (
        <span
          key={lane.key}
          className="absolute top-0 left-0 border-t border-white/15"
          style={{
            transform: `translate3d(0, ${lane.y}px, 0)`,
            width: layout.width,
            height: lane.h,
            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${ruleAt}px, var(--gt-hairline) ${ruleAt}px ${ruleAt + 1}px, transparent ${ruleAt + 1}px ${ruleAt + PITCH}px)`,
          }}
        />
      ))}
      {layout.stages.map((span) => (
        <span
          key={span.stage}
          className="absolute top-0 left-0 border-l border-white/12"
          style={{ transform: `translate3d(${span.x}px, 0, 0)`, height: layout.height }}
        />
      ))}
    </div>
  );
}

export const ledger: PipelineSkin = {
  face: ledgerFace,
  world: ledgerWorld,
  // A ledger's own words. `gate` keeps its name because a ledger never renames
  // the line somebody has to sign.
  stageLabel: { working: "running", done: "settled" },
};
