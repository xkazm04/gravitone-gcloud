"use client";

// THE NOTEBOOK, formatted. Rendered inside <Modal> by both steps — 21 facts,
// 3 mechanisms, 4 reversals, 11 sources is more than any phase surface can hold,
// and the modal is what stops the page from carrying it.
//
// The body scrolls; the section rail jumps within it. Nothing here is
// summarised away: this is the artifact, and a notebook you cannot read in
// full is a notebook you cannot check.

import { useCallback, useState } from "react";

import { NOTEBOOK } from "./notebook";
import ArgumentSections from "./sections/Argument";
import ApparatusSections from "./sections/Apparatus";
import { SECTION_LABEL, sectionRenders } from "./sections/H";
import type { Notebook } from "./types";

// THE ORDER; the names come from SECTION_LABEL in sections/H.tsx, which is the
// same map the headings themselves render. A pill and the heading it jumps to
// were two separate expressions and drifted apart — the pill said
// "mechanisms · 3" and the heading said "mechanisms — the beat chain,
// pre-authored". One map, two readers, and they cannot disagree again.
const SECTION_ORDER = [
  "tension",
  "mechanisms",
  "reversals",
  "steelman",
  "counters",
  "facts",
  "numbers",
  "unknowns",
  "questions",
  "fit",
  "currency",
  "sources",
  "gaps",
] as const;

const SECTIONS = SECTION_ORDER.map((id) => [id, SECTION_LABEL[id]] as const);

/** Every section the rail knows about, in order — including the two that only
 *  render when they have content. */
export const SECTION_IDS: readonly string[] = SECTIONS.map(([id]) => id);

/** THE PILLS THIS NOTEBOOK ACTUALLY GETS.
 *
 *  A pill is drawn only where the section it jumps to will render. Exported
 *  rather than inlined so the agreement can be asserted without a DOM, and so
 *  the rail below has exactly one way to build itself — a `.map` over the raw
 *  list is the defect, and the probe reads this file to say so. */
export function railFor(n: Notebook): readonly (readonly [string, string])[] {
  return SECTIONS.filter(([id]) => sectionRenders(n, id));
}

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
        {/* A PILL ONLY WHERE THE SECTION ACTUALLY RENDERS. Two of these
            sections draw behind a `length > 0` of their own, and the rail
            listed all thirteen regardless — so on a notebook with no
            counter-positions the pill was drawn, `jump()` found no element and
            returned before `setAt`, and pressing it did nothing at all, with
            no state change to say so. One predicate, in sections/H.tsx, read by
            the rail here and by the section there. */}
        {railFor(n).map(([id, label]) => (
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
