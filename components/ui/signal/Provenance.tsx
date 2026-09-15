"use client";

// WHO MADE THIS, IN WHICH RUN, WITH WHAT — as chips, never as a sentence.
//
//   app/_studio/assetParts.tsx:106-114   "Made by <model> in run <runId>, step
//                                        <stepId>." Three facts wearing an
//                                        English sentence, with two of them
//                                        already styled as mono values because
//                                        the sentence could not carry them.
//   app/_phases/score/ScoreSpotting.tsx  the take's credit line — the same three
//                                        facts, spelled a fourth way
//   app/library/parts.tsx                the proof's provenance, a fifth
//
// A sentence around a set of key/value pairs is packaging. It costs a line of
// prose per asset, it cannot be scanned down a column, it has to be re-worded
// every time a field is absent, and it puts a verb ("Made by") where there is no
// action to describe. Chips are the same facts in the shape they already have.
//
// THE VALUES ARE VERBATIM. A model id, a run id, a vendor name and a price are
// the WORK — they are what somebody will paste into a search box or an invoice —
// so nothing here truncates, humanises or rounds them. The label is mono and
// dimmed; the value is mono and bright; the chip is the house chip (see
// Tally.tsx, which owns that one spelling).
//
// Only present fields render. `<Provenance />` with nothing in it renders
// nothing at all rather than an empty rail — an asset with no recorded
// provenance says nothing, which is true, instead of "unknown", which is a claim.

import { CHIP_CLASS, TALLY_TONE } from "./Tally";

export interface ProvenanceFields {
  /** The model that made it — `gpt-image-2`, `qwen2.5-vl:27b`. */
  model?: React.ReactNode;
  /** The run it came out of. */
  run?: React.ReactNode;
  /** The step within that run. */
  step?: React.ReactNode;
  /** Who was billed — `openai`, `leonardo`, `local`. */
  vendor?: React.ReactNode;
  /** What it cost, with its unit already in it — `$0.04`, `0 (local)`. */
  cost?: React.ReactNode;
}

/** Fixed order, so two surfaces cannot disagree about which fact comes first. */
const ORDER: ReadonlyArray<keyof ProvenanceFields> = ["model", "run", "step", "vendor", "cost"];

export function Provenance({
  className = "",
  ...fields
}: ProvenanceFields & { className?: string }) {
  const present = ORDER.filter((k) => fields[k] !== undefined && fields[k] !== null);
  if (present.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {present.map((k) => (
        <span key={k} className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>
          <span aria-hidden className="uppercase opacity-50">
            {k}
          </span>
          <span className="sr-only">{k}:</span>
          <span className="text-white/85">{fields[k]}</span>
        </span>
      ))}
    </div>
  );
}
