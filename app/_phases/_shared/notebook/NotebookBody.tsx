"use client";

// THE NOTEBOOK, formatted. Rendered inside <Modal> by both steps — 21 facts,
// 3 mechanisms, 4 reversals, 11 sources is more than any phase surface can hold,
// and the modal is what stops the page from carrying it.
//
// The body scrolls; the section rail jumps within it. Nothing here is
// summarised away: this is the artifact, and a notebook you cannot read in
// full is a notebook you cannot check.

import { useCallback, useState } from "react";

import { NOTEBOOK, NOTEBOOK_COUNTS } from "./notebook";
import ArgumentSections from "./sections/Argument";
import ApparatusSections from "./sections/Apparatus";

const SECTIONS = [
  ["tension", "tension"],
  ["mechanisms", `mechanisms · ${NOTEBOOK_COUNTS.mechanisms}`],
  ["reversals", `reversals · ${NOTEBOOK_COUNTS.reversals}`],
  ["steelman", "steel-man"],
  ["counters", `counter-positions · ${NOTEBOOK.counterPositions.length}`],
  ["facts", `facts · ${NOTEBOOK_COUNTS.facts}`],
  ["numbers", "numbers"],
  ["unknowns", `unknowns · ${NOTEBOOK_COUNTS.unknownsOpen} open`],
  ["questions", `questions · ${NOTEBOOK.candidateQuestions.length}`],
  ["fit", "engine fit"],
  ["currency", "currency"],
  // "sources" here is NOTEBOOK.sources, the hand-written bibliography (11 on
  // this fixture) — a SEPARATE, unrelated population from the 20 distinct
  // `Fact.source` strings the facts above cite (`NOTEBOOK_COUNTS.factSourceStrings`).
  // Named "bibliography" rather than bare "sources" so the rail pill cannot be
  // misread as a count of every source the notebook has; see the comment on
  // NOTEBOOK_COUNTS in notebook.ts for the full measurement and why the two
  // lists are not reconciled.
  ["sources", `bibliography · ${NOTEBOOK_COUNTS.sources}`],
  ["gaps", `gaps · ${NOTEBOOK_COUNTS.gaps}`],
] as const;

export default function NotebookBody() {
  // WHERE THE RAIL LAST SENT YOU. The rail had no state at all: eleven
  // identical pills, no `aria-current`, and a jump that moved the scroll
  // container without moving focus — so a keyboard user pressed "sources",
  // stayed focused on the rail, and had nothing to tell them anything had
  // happened. This is a jump list, not a filter, so `at` records the last
  // destination rather than tracking the scroll position: an honest "you asked
  // for this one" is worth more than an observer that fights the user's own
  // scrolling for the right to say where they are.
  const [at, setAt] = useState<string | null>(null);

  const jump = useCallback((id: string) => {
    const target = document.getElementById(`nb-${id}`);
    if (!target) return;
    setAt(id);
    target.scrollIntoView({ block: "start" });
    // The heading takes focus (tabIndex -1, see sections/H.tsx), so the next
    // Tab continues from the section rather than from the rail.
    target.focus({ preventScroll: true });
  }, []);

  const n = NOTEBOOK;

  return (
    <div className="space-y-7">
      <nav
        aria-label="Notebook sections"
        className="font-jetbrains -mt-1 flex flex-wrap gap-1.5 text-label"
      >
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => jump(id)}
            aria-current={at === id ? "location" : undefined}
            className={`rounded-full border px-2.5 py-1 tracking-[0.12em] transition hover:border-cyan-400/35 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 ${
              at === id
                ? "border-cyan-400/35 bg-cyan-400/[0.07] text-cyan-200"
                : "border-white/10 text-white/45"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="space-y-2">
        <p className="font-instrument text-lg leading-snug text-white">{n.question}</p>
        <p className="text-content leading-relaxed text-slate-300">
          <span className="font-jetbrains text-label tracking-[0.14em] text-cyan-300/80 uppercase">verdict </span>
          {n.verdict}
        </p>
        <p className="font-jetbrains text-content text-white/35">
          researched {n.researched} · {n.researcher} · intent {n.templateIntent} ·{" "}
          {n.subjectDomain.join(" / ")}
        </p>
      </section>

      <ArgumentSections />
      <ApparatusSections />
    </div>
  );
}
