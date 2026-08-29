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

import { Eyebrow } from "@/components/ui/Primitives";

type Mode = "facts" | "beats";

const OPTIONS = [
  {
    id: "facts",
    label: "facts to involve",
    line: "A topic goes in, a notebook comes out, and you scope what the script may use.",
  },
  {
    id: "beats",
    label: "beats to choose",
    line: "Candidate beats per part of a spine; you pick one each, and Script opens on the spine.",
  },
] as const;

export default function ModeChooser({ onChoose }: { onChoose: (mode: Mode) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>any video · research mode</Eyebrow>
        <p className="font-hanken mt-2 max-w-2xl text-sm text-slate-400">
          This project claims no craft template, so the studio does not know what its research is.
          The choice is kept with the project, and you can switch later — neither mode discards the
          other’s work.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            data-testid={`mode-${o.id}`}
            onClick={() => onChoose(o.id)}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-left transition hover:border-cyan-400/40 hover:bg-cyan-400/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="font-instrument block text-2xl text-slate-100">{o.label}</span>
            <span className="font-hanken mt-2 block text-sm leading-relaxed text-slate-400">{o.line}</span>
          </button>
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
      <span className="font-jetbrains text-[10px] tracking-[0.16em] text-white/30 uppercase">
        research mode · {MODE_LABEL[mode]}
      </span>
      <button
        type="button"
        data-testid="switch-mode"
        onClick={() => !locked && onSwitch(other)}
        disabled={!!locked}
        title={locked ?? `Switch this project to ${MODE_LABEL[other]}. Nothing you have done here is discarded.`}
        className="font-jetbrains rounded-full border border-white/12 px-2.5 py-1 text-[10px] tracking-[0.1em] text-white/45 transition hover:border-white/25 hover:text-white/75 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/12 disabled:hover:text-white/45"
      >
        switch to {MODE_LABEL[other]}
      </button>
    </div>
  );
}
