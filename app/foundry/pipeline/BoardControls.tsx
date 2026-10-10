"use client";

// THE BOARD'S OWN CONTROLS, INSIDE THE BOARD.
//
// They were a bar above it — media, group, arm, four disclosures and a row of
// tallies — and that bar was the last of three stacked rows standing between the
// page's top and the thing the page is for. The media choice went up to the
// foundry's submenu (./../FoundrySubnav.tsx); what is left is what only means
// something while you are looking at THIS board, so it sits on it.
//
// THE ARM IS ALWAYS DRAWN AND NEVER FOLDED AWAY. It decides whether a move
// spends the operator's Claude seat ($47-92 and 26-32 turns a dispatch), and the
// defect this surface shipped in round 1 was precisely a board that SAID stub
// while the authority was armed. A money switch behind a disclosure is a money
// switch nobody checks, so it is a chip with a word in it, in the corner the eye
// lands on when it stops reading the board.
//
// `hidden` and `degraded` ride here too. They had a row of their own, which the
// operator deleted along with the bar — but deleting the ROW is not deleting the
// FACT. An empty column with no reason reads as "there is nothing to write
// about" when the truth is "nobody could ask", and that distinction is the whole
// reason the load notes exist. They are a chip, amber, with the reason behind it.

import { useEffect, useRef } from "react";

import { Maximize2, Minimize2, Unplug } from "lucide-react";

import { Select, type SelectOption } from "@/components/ui/Select";
import { Hint, Tally } from "@/components/ui/signal";
import { RUN_COST_HINT } from "@/lib/articles/types";
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
}) {
  // THE HEADS MAKE ROOM, measured rather than guessed. This cluster floats over
  // the top-right of the board, which is exactly where the stage heads draw —
  // photographed, it sat on top of the `ck` band label. The heads scroll with
  // the camera and this does not, so there is no layout that separates them;
  // what works is telling the heads how much of their right edge is spoken for.
  // The width is read off the element because the cluster's contents are
  // conditional (a degraded chip, a damaged tally, a dry receipt all come and
  // go) and any constant here would be wrong the first time one appeared.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const write = () => host.style.setProperty("--gt-board-gutter", `${Math.ceil(el.getBoundingClientRect().width) + 16}px`);
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => {
      ro.disconnect();
      host.style.removeProperty("--gt-board-gutter");
    };
  }, []);

  const live = arm === "live";
  const notes = status?.notes ?? null;
  const hidden = notes?.hidden ?? [];
  const degraded = notes?.degraded ?? [];
  const damaged = notes?.damaged ?? [];
  const choreo = status?.choreo;
  return (
    <div ref={box} className="pointer-events-none absolute top-2 right-2 z-20 flex max-w-[calc(100%-1rem)] flex-wrap items-center justify-end gap-2">
      {degraded.map((d) => (
        <span
          key={d.stage}
          className={`${PILL} pointer-events-auto border-amber-300/45 bg-[var(--gt-ink)]/85 text-amber-100 backdrop-blur-md`}
          data-testid={`pipeline-degraded-${d.stage}`}
        >
          <Unplug aria-hidden className="h-4 w-4 shrink-0" />
          <span className={TYPE.label}>{word(d.stage)}</span>
          <Hint tone="amber" label={`why ${word(d.stage)} is empty`}>
            {d.reason}
          </Hint>
        </span>
      ))}

      {hidden.map((h) => (
        <span key={`${h.stage}:${h.why}`} className="pointer-events-auto">
          <Tally label="hidden" value={h.count} tone="amber" hint={<Hint tone="amber">{h.why}</Hint>} />
        </span>
      ))}

      {/* IDS THAT WOULD NOT READ. A load can succeed with something inside it
          broken, and `damaged` is that list — the one channel here that is about
          data the board is NOT showing you because it could not. */}
      {damaged.length > 0 && (
        <span className="pointer-events-auto">
          <Tally label="damaged" value={damaged.length} tone="rose" hint={<Hint tone="rose">{damaged.join(" · ")}</Hint>} />
        </span>
      )}

      {/* The choreography cap: above it the board stops animating entrances, so
          `drawn` and `cards` diverge for a reason worth saying. */}
      {choreo?.reason === "cap" && (
        <span className="pointer-events-auto">
          <Tally label="choreo" value={choreo.visible} of={choreo.cap} tone="amber" />
        </span>
      )}

      {stub && (
        <span className="pointer-events-auto">
          <Tally label="dry" value={stub.n} tone="amber" hint={<Hint tone="amber">{stub.wouldCall}</Hint>} />
        </span>
      )}

      <span className="pointer-events-auto">
        <Tally label="cards" value={status?.total ?? 0} />
      </span>

      <span className="pointer-events-auto">
        <Select label="group" value={axisId} onChange={onAxis} options={axisOptions} minWidth={150} testId="pipeline-axis" />
      </span>

      {/* THE MONEY SWITCH. One control, two states, the state spelled as a word:
          a toggle whose off-state is invisible is how round 1's board came to
          show STUB while a dragged confirm spent the seat anyway. */}
      <button
        type="button"
        onClick={() => onArm(live ? "stub" : "live")}
        aria-pressed={live}
        data-testid="pipeline-arm"
        className={`${PILL} pointer-events-auto cursor-pointer backdrop-blur-md focus-visible:outline-2 focus-visible:outline-offset-2 ${
          live ? "border-amber-300/60 bg-amber-300/10 text-amber-100" : "border-white/15 bg-[var(--gt-ink)]/80 text-white/75 hover:border-white/30"
        }`}
      >
        <span className={TYPE.label}>{live ? "live" : "stub"}</span>
        {live && <span className={`${TYPE.figure} text-amber-200/80`}>${RUN_COST_HINT.usdLow}–{RUN_COST_HINT.usdHigh}</span>}
      </button>

      <button
        type="button"
        onClick={onFull}
        aria-pressed={full}
        aria-label={full ? "Leave full screen" : "Fill the screen"}
        data-testid="pipeline-full"
        className={`${PILL} pointer-events-auto cursor-pointer border-white/15 bg-[var(--gt-ink)]/80 text-white/75 backdrop-blur-md hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2`}
      >
        {full ? <Minimize2 aria-hidden className="h-4 w-4" /> : <Maximize2 aria-hidden className="h-4 w-4" />}
        <kbd aria-hidden className={`${TYPE.figure} rounded border border-white/15 px-1 text-white/55`}>F</kbd>
      </button>
    </div>
  );
}
