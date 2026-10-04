"use client";

// The free discipline's first question. A free project has no craft template,
// so the studio cannot know whether its Research step is a notebook of facts
// or a spine of beats — it asks, and the answer is stored with the picks.
//
// THE ANSWER IS REVERSIBLE, and `ModeSwitch` below is how. It was not: the
// chooser rendered only while the stored mode was null, so picking "facts"
// once — including by misreading two unfamiliar labels on first contact —
// left a project with no route back to the beat board and nothing on screen
// admitting that. Switching discards nothing; the picks and the topic live in
// separate records and both survive.

import { FileText, Waypoints } from "lucide-react";

import { Eyebrow } from "@/components/ui/Primitives";
import { HintPopover, hintRootClass, useHint } from "@/components/ui/signal";

type Mode = "facts" | "beats";

const OPTIONS = [
  {
    id: "facts",
    label: "facts to involve",
    icon: FileText,
    /** Behind the card's own disclosure — a distinction, not an instruction. */
    line: "a notebook of facts; you scope what the script may use",
  },
  {
    id: "beats",
    label: "beats to choose",
    icon: Waypoints,
    line: "candidate beats per part; Script opens on the spine you pick",
  },
] as const;

/** ONE CARD, AND ITS OWN DISCLOSURE ON THE CARD ITSELF. The distinguishing line
 *  cannot hang on a <Hint> glyph here: the card IS a button, and a button inside
 *  a button is invalid HTML — the same constraint <TabRail> hits, answered the
 *  same way, with `useHint` + `<HintPopover>` and the card as the trigger. So
 *  each option needs its own hook call, which is why this is a component rather
 *  than a `.map` body. */
function ModeCard({
  option,
  onChoose,
}: {
  option: (typeof OPTIONS)[number];
  onChoose: (mode: Mode) => void;
}) {
  const d = useHint();
  const Icon = option.icon;
  return (
    <span {...d.rootProps} className={`${hintRootClass} w-full`}>
      <button
        type="button"
        data-testid={`mode-${option.id}`}
        {...d.triggerProps}
        onClick={() => onChoose(option.id)}
        className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-left transition hover:border-cyan-400/40 hover:bg-cyan-400/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Icon className="h-7 w-7 shrink-0 text-cyan-300/70" aria-hidden />
        <span className="font-instrument block text-2xl text-slate-100">{option.label}</span>
      </button>
      <HintPopover d={d}>{option.line}</HintPopover>
    </span>
  );
}

export default function ModeChooser({ onChoose }: { onChoose: (mode: Mode) => void }) {
  return (
    <div className="space-y-5">
      {/* THE PARAGRAPH IS GONE. "This project claims no craft template, so the
          studio does not know what its research is" is the app explaining why
          it is asking — the question above the two cards is the only part of
          that a creator can act on. And "you can switch later" was a promise
          about a control: `ModeSwitch` is drawn on the very next screen, above
          whichever board this answer names, which proves it where a sentence
          could only assert it. */}
      <Eyebrow>any video · research mode</Eyebrow>
      <div className="grid gap-4 md:grid-cols-2">
        {OPTIONS.map((o) => (
          <ModeCard key={o.id} option={o} onChoose={onChoose} />
        ))}
      </div>
    </div>
  );
}

const MODE_LABEL: Record<Mode, string> = {
  facts: "facts to involve",
  beats: "beats to choose",
};

/** The way back. Drawn above whichever surface the mode named, quietly — it is
 *  a correction affordance, not a control anybody needs twice.
 *
 *  `locked` is the one direction that is NOT free. Composing a spine writes
 *  `researched: true` into the project's RESEARCH record, because that is what
 *  Script gates on and a trailer has no run that would ever set it. Switching
 *  to facts while that stands would open the Topic tab on a finished run the
 *  project never had. So the spine has to be reopened first, and the button
 *  says so rather than silently doing the wrong thing. */
export function ModeSwitch({
  mode,
  onSwitch,
  locked,
}: {
  mode: Mode;
  onSwitch: (mode: Mode) => void;
  locked?: string;
}) {
  const other: Mode = mode === "facts" ? "beats" : "facts";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-jetbrains text-label tracking-[0.16em] text-white/30 uppercase">
        research mode · {MODE_LABEL[mode]}
      </span>
      <button
        type="button"
        data-testid="switch-mode"
        onClick={() => !locked && onSwitch(other)}
        disabled={!!locked}
        title={locked ?? `Switch this project to ${MODE_LABEL[other]}. Nothing you have done here is discarded.`}
        className="font-jetbrains rounded-full border border-white/12 px-2.5 py-1 text-label tracking-[0.1em] text-white/45 transition hover:border-white/25 hover:text-white/75 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/12 disabled:hover:text-white/45"
      >
        switch to {MODE_LABEL[other]}
      </button>
    </div>
  );
}
