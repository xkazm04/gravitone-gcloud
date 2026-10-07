"use client";

// WHAT FOLLOWS THE POINTER, AND WHAT IT SAYS.
//
// The card at home stays where it is (dimmed — it is "away"); a ghost of its
// face is what the hand is holding. Two pieces, in two coordinate systems on
// purpose:
//
//   GHOST lives in the WORLD layer, so it is the same size as the cards it is
//   about to join at whatever zoom the board is at, and it needs no screen
//   mapping to land in a slot: the slot's world position is the spring's target.
//   Its x/y are springs (motion values), so grab, track and settle are physics,
//   and a pointer move writes a motion value — never a React render.
//
//   CALLOUT lives in SCREEN space beside the pointer, because it carries
//   sentences (the authority's own refusal, a prompt, a cost) and a sentence
//   drawn at 0.2 zoom is not a sentence. It is the answer to "why not?".
//
// The ghost's border is the verdict: cyan where the move would go, violet where
// it will ask for something first, rose where it is refused, quiet over home,
// and dimmed over no cell at all.

import { motion, type MotionValue } from "motion/react";

import type { PipelineEntry } from "@/lib/board/pipeline";

import { DefaultFace } from "./Card";
import { CARD_H, CARD_W } from "./geometry";
import { costLine } from "./moves";
import { STAGE_TONE } from "./tone";
import type { PipelineSkin, Verdict } from "./types";

export type GhostKind = Verdict["kind"] | "carry" | "none";
export type GhostPhase = "carry" | "land" | "back" | "done";

const RING: Record<GhostKind, string> = {
  carry: "border-cyan-300/60",
  ok: "border-cyan-300",
  needs: "border-violet-300",
  refused: "border-rose-300",
  home: "border-white/40",
  none: "border-white/25",
};

export function Ghost({
  x,
  y,
  entry,
  count,
  kind,
  phase,
  skin,
  calm,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  entry: PipelineEntry;
  /** How many cards this ghost is carrying. */
  count: number;
  kind: GhostKind;
  phase: GhostPhase;
  skin: PipelineSkin;
  calm: boolean;
}) {
  const lifted = phase === "carry";
  return (
    <motion.div
      aria-hidden
      data-ghost={phase}
      data-kind={kind}
      initial={calm ? false : { scale: 1, rotate: 0 }}
      animate={{
        scale: lifted ? 1.05 : 1,
        rotate: lifted && !calm ? 1.4 : 0,
        opacity: phase === "done" ? 0 : kind === "none" ? 0.55 : 1,
      }}
      transition={calm ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 24 }}
      style={{ x, y, width: CARD_W, height: CARD_H }}
      className="pointer-events-none absolute top-0 left-0 z-20"
    >
      {count > 1 && (
        <>
          <span aria-hidden className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl border border-white/15 bg-[var(--gt-ink)]/80" />
          <span aria-hidden className="absolute inset-0 translate-x-1 translate-y-1 rounded-xl border border-white/20 bg-[var(--gt-ink)]/85" />
        </>
      )}
      <div
        className={`relative h-full w-full overflow-hidden rounded-xl border-2 bg-[var(--gt-ink)]/92 shadow-2xl shadow-black/60 backdrop-blur-md transition-colors duration-150 ${RING[kind]} ${STAGE_TONE[entry.placement.stage].card}`}
      >
        {skin.face ? skin.face(entry) : <DefaultFace entry={entry} />}
        {count > 1 && (
          <span className="font-jetbrains absolute top-1.5 right-1.5 grid h-8 min-w-8 place-items-center rounded-full bg-cyan-300 px-2 text-label font-semibold text-slate-950">
            {count}
          </span>
        )}
      </div>
    </motion.div>
  );
}

const CALLOUT_TONE: Record<string, string> = {
  ok: "border-cyan-300/50 text-cyan-100",
  needs: "border-violet-300/55 text-violet-100",
  refused: "border-rose-300/60 text-rose-100",
};

/** The sentence beside the pointer: where it goes, what it will ask for, or why
 *  it will not. Absent over home and over nothing. */
export function Callout({
  x,
  y,
  verdict,
  to,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  verdict: Verdict | null;
  /** Where the card would land, in the stage's words. */
  to: string;
}) {
  if (!verdict || verdict.kind === "home") return null;
  const body =
    verdict.kind === "ok" ? to : verdict.kind === "needs" ? [verdict.prompt, costLine(verdict.cost)].filter(Boolean).join(" · ") : verdict.reason;
  return (
    <motion.div
      data-callout={verdict.kind}
      style={{ x, y }}
      className={`font-hanken pointer-events-none absolute top-0 left-0 z-40 max-w-[22rem] rounded-lg border bg-[var(--gt-ink)]/95 px-3 py-2 text-label shadow-xl shadow-black/50 backdrop-blur-md ${CALLOUT_TONE[verdict.kind]}`}
    >
      {body}
    </motion.div>
  );
}
