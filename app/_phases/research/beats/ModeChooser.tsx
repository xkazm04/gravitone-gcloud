"use client";

// The free discipline's first question. A free project has no craft template,
// so the studio cannot know whether its Research step is a notebook of facts
// or a spine of beats — it asks once, and the answer is stored with the picks.

import { Eyebrow } from "@/components/ui/Primitives";

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

export default function ModeChooser({ onChoose }: { onChoose: (mode: "facts" | "beats") => void }) {
  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>any video · research mode</Eyebrow>
        <p className="font-hanken mt-2 max-w-2xl text-sm text-slate-400">
          This project claims no craft template, so the studio does not know what its research is.
          Choose once; the choice is kept with the project.
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
