"use client";

// WHICH NOTEBOOK A STEP IS READING — drawn on the surfaces that gate or bind
// against it. Step 1 draws its own provenance (`StandInNote`, `ReasonedNote`);
// Script and Frames read the same dealt source and said nothing about which one
// it was, so a creator could not tell a gate over their own notebook from a gate
// over the saved Bitcoin run. Kind plus topic, in the chip vocabulary
// (components/ui/signal/Tally.tsx), with the plain-language name for readers
// that do not see the colour. It lives here because `_shared` must not import
// upward from `research/`.

import { CHIP_CLASS, TALLY_TONE, type TallyTone } from "@/components/ui/signal";

import type { NotebookSource, NotebookSourceKind } from "./source";

const KIND_TONE: Record<NotebookSourceKind, TallyTone> = {
  replay: "amber",
  reasoned: "cyan",
  researched: "emerald",
};

/** `replay` reads "stand-in", the word StandInNote already uses for it. */
const KIND_WORD: Record<NotebookSourceKind, string> = {
  replay: "stand-in",
  reasoned: "reasoned",
  researched: "researched",
};

export default function SourceChip({ source, className = "" }: { source: NotebookSource; className?: string }) {
  return (
    <span data-testid="source-chip" data-kind={source.kind} className={`${CHIP_CLASS} ${TALLY_TONE[KIND_TONE[source.kind]]} ${className}`}>
      <span aria-hidden className="opacity-60">{KIND_WORD[source.kind]}</span>
      <span className="sr-only">this step reads a {KIND_WORD[source.kind]} notebook:</span>
      {source.notebook.topic}
    </span>
  );
}
