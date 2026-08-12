"use client";

// THE NOTEBOOK, formatted. Rendered inside <Modal> by both steps — 21 facts,
// 3 mechanisms, 4 reversals, 11 sources is more than any phase surface can hold,
// and the modal is what stops the page from carrying it.
//
// The body scrolls; the section rail jumps within it. Nothing here is
// summarised away: this is the artifact, and a notebook you cannot read in
// full is a notebook you cannot check.

import { useCallback } from "react";

import { NOTEBOOK, NOTEBOOK_COUNTS } from "./notebook";
import ArgumentSections from "./sections/Argument";
import ApparatusSections from "./sections/Apparatus";

const SECTIONS = [
  ["tension", "tension"],
  ["mechanisms", `mechanisms · ${NOTEBOOK_COUNTS.mechanisms}`],
  ["reversals", `reversals · ${NOTEBOOK_COUNTS.reversals}`],
  ["steelman", "steel-man"],
  ["facts", `facts · ${NOTEBOOK_COUNTS.facts}`],
  ["numbers", "numbers"],
  ["unknowns", `unknowns · ${NOTEBOOK_COUNTS.unknownsOpen} open`],
  ["fit", "engine fit"],
  ["currency", "currency"],
  ["sources", `sources · ${NOTEBOOK_COUNTS.sources}`],
  ["gaps", `gaps · ${NOTEBOOK_COUNTS.gaps}`],
] as const;

export default function NotebookBody() {
  const jump = useCallback((id: string) => {
    document.getElementById(`nb-${id}`)?.scrollIntoView({ block: "start" });
  }, []);

  const n = NOTEBOOK;

  return (
    <div className="space-y-7">
      <div className="font-jetbrains -mt-1 flex flex-wrap gap-1.5 text-[10px]">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => jump(id)}
            className="rounded-full border border-white/10 px-2.5 py-1 tracking-[0.12em] text-white/45 transition hover:border-cyan-400/35 hover:text-cyan-200"
          >
            {label}
          </button>
        ))}
      </div>

      <section className="space-y-2">
        <p className="font-instrument text-lg leading-snug text-white">{n.question}</p>
        <p className="text-sm leading-relaxed text-slate-300">
          <span className="font-jetbrains text-[11px] tracking-[0.14em] text-cyan-300/80 uppercase">verdict </span>
          {n.verdict}
        </p>
        <p className="font-jetbrains text-[11px] text-white/35">
          researched {n.researched} · {n.researcher} · intent {n.templateIntent} ·{" "}
          {n.subjectDomain.join(" / ")}
        </p>
      </section>

      <ArgumentSections />
      <ApparatusSections />
    </div>
  );
}
