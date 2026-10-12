"use client";

// THE BOARD'S OWN CONTROLS, IN A ROW ABOVE IT.
//
// They floated over the board's top-right corner for a round, which is exactly
// where the stage heads draw, and the fix for that collision was a measured
// gutter the heads had to stop short of. A row of its own is the simpler truth:
// nothing on the board is under it, so nothing has to make room. The media
// choice lives in the foundry's submenu (./../FoundrySubnav.tsx); what is here
// is what only means something while you are looking at THIS board.
//
// THE ARM IS ALWAYS DRAWN AND NEVER FOLDED AWAY. It decides whether a move
// spends the operator's Claude seat ($47-92 and 26-32 turns a dispatch), and the
// defect this surface shipped in round 1 was precisely a board that SAID stub
// while the authority was armed. A money switch behind a disclosure is a money
// switch nobody checks, so it is a chip with a word in it.
//
// `degraded` and `damaged` ride here too: an empty column with no reason reads
// as "there is nothing to write about" when the truth is "nobody could ask".
// The `hidden` tallies and the card count were struck by the operator (spark
// audio-queue-suno). The count is every stage head's sum; `hidden` stays in
// `CanvasStatus.notes` for any surface that wants it.
//
// A SWITCHED STAGE SAYS WHETHER IT IS ON (`notes.switched`: the Suno queue).
// Started and stopped from that column's tile menu; the chip is its state, and
// a crash that switched it off carries the job and model to check.

import { Maximize2, Minimize2, Pause, Play, Unplug } from "lucide-react";

import { Select, type SelectOption } from "@/components/ui/Select";
import { Hint, Tally } from "@/components/ui/signal";
import type { CanonStage } from "@/lib/board/pipeline";

import type { CanvasStatus } from "./types";
import { TYPE } from "./type";

export type Arm = "stub" | "live";

/** One pill, so the cluster's five controls cannot drift apart the way the five
 *  in the deleted bar did (two `Segmented`, a `Select`, a button and a span, at
 *  three different heights). */
const PILL = "flex h-8 items-center gap-2 rounded-full border px-3 transition";

export default function BoardControls({
  arm,
  onArm,
  axisId,
  axisOptions,
  onAxis,
  status,
  stub,
  full,
  onFull,
  word,
  liveCost,
}: {
  arm: Arm;
  onArm: (a: Arm) => void;
  axisId: string;
  axisOptions: SelectOption<string>[];
  onAxis: (id: string) => void;
  status: CanvasStatus | null;
  /** The STUB arm's receipt: how many moves were refused a vendor, and the last
   *  route that was NOT called. `MoveResult` carries `stub` on the SUCCESS
   *  variant, so a board that only reads `ok` draws a move that never happened —
   *  this is the counter that keeps that visible rather than silent. */
  stub: { n: number; wouldCall: string } | null;
  full: boolean;
  onFull: () => void;
  word: (s: CanonStage) => string;
  /** The MEDIUM's own price of a live dispatch, drawn on the armed chip — or
   *  null where nothing measured one. It was always the articles figure, so an
   *  armed AUDIO board read "$47-92", a Claude-seat price for a Suno queue. */
  liveCost: string | null;
}) {
  const live = arm === "live";
  const notes = status?.notes ?? null;
  const degraded = notes?.degraded ?? [];
  const damaged = notes?.damaged ?? [];
  const switched = notes?.switched ?? [];
  const choreo = status?.choreo;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2" data-testid="pipeline-controls">
      {degraded.map((d) => (
        <span
          key={d.stage}
          className={`${PILL} border-amber-300/45 text-amber-100`}
          data-testid={`pipeline-degraded-${d.stage}`}
        >
          <Unplug aria-hidden className="h-4 w-4 shrink-0" />
          <span className={TYPE.label}>{word(d.stage)}</span>
          <Hint tone="amber" label={`why ${word(d.stage)} is empty`}>
            {d.reason}
          </Hint>
        </span>
      ))}

      {switched.map((s) => (
        <span
          key={s.stage}
          className={`${PILL} ${s.interrupted ? "border-amber-300/45 text-amber-100" : s.on ? "border-cyan-300/50 text-cyan-100" : "border-white/15 text-white/60"}`}
          data-testid={`pipeline-switched-${s.stage}`}
          data-on={s.on ? "" : undefined}
        >
          {s.on ? <Play aria-hidden className="h-4 w-4 shrink-0" /> : <Pause aria-hidden className="h-4 w-4 shrink-0" />}
          <span className={TYPE.label}>
            {word(s.stage)} {s.on ? "running" : "stopped"}
          </span>
          {s.interrupted && (
            <Hint tone="amber" label={`why ${word(s.stage)} stopped`}>
              {s.interrupted}
            </Hint>
          )}
        </span>
      ))}

      {/* IDS THAT WOULD NOT READ. A load can succeed with something inside it
          broken, and `damaged` is that list — the one channel here that is about
          data the board is NOT showing you because it could not. */}
      {damaged.length > 0 && (
        <Tally label="damaged" value={damaged.length} tone="rose" hint={<Hint tone="rose">{damaged.join(" · ")}</Hint>} />
      )}

      {/* The choreography cap: above it the board stops animating entrances,
          and a change you can see deserves its reason on screen. */}
      {choreo?.reason === "cap" && (
        <Tally label="choreo" value={choreo.visible} of={choreo.cap} tone="amber" />
      )}

      {stub && (
        <Tally label="dry" value={stub.n} tone="amber" hint={<Hint tone="amber">{stub.wouldCall}</Hint>} />
      )}

      <Select label="group" value={axisId} onChange={onAxis} options={axisOptions} minWidth={150} testId="pipeline-axis" />

      {/* THE MONEY SWITCH. One control, two states, the state spelled as a word:
          a toggle whose off-state is invisible is how round 1's board came to
          show STUB while a dragged confirm spent the seat anyway. */}
      <button
        type="button"
        onClick={() => onArm(live ? "stub" : "live")}
        aria-pressed={live}
        data-testid="pipeline-arm"
        className={`${PILL} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 ${
          live ? "border-amber-300/60 bg-amber-300/10 text-amber-100" : "border-white/15 text-white/75 hover:border-white/30"
        }`}
      >
        <span className={TYPE.label}>{live ? "live" : "stub"}</span>
        {live && liveCost && <span className={`${TYPE.figure} text-amber-200/80`}>{liveCost}</span>}
      </button>

      <button
        type="button"
        onClick={onFull}
        aria-pressed={full}
        aria-label={full ? "Leave full screen" : "Fill the screen"}
        data-testid="pipeline-full"
        className={`${PILL} cursor-pointer border-white/15 text-white/75 hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2`}
      >
        {full ? <Minimize2 aria-hidden className="h-4 w-4" /> : <Maximize2 aria-hidden className="h-4 w-4" />}
        <kbd aria-hidden className={`${TYPE.figure} rounded border border-white/15 px-1 text-white/55`}>F</kbd>
      </button>
    </div>
  );
}
