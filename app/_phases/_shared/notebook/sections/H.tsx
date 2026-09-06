"use client";

import type { Connector, Notebook } from "../types";

/** Sections that render only when they have something in them.
 *
 *  THE RAIL AND THE SECTION MUST AGREE, and they were two separate expressions
 *  in two files. `NotebookBody`'s rail listed all thirteen pills
 *  unconditionally; `counters` (Argument.tsx) and `questions` (Apparatus.tsx)
 *  each render behind their own `length > 0`. On a notebook with no
 *  counter-positions the pill was still drawn, `jump()` found no element and
 *  returned before `setAt`, so pressing it moved nothing, focused nothing and
 *  set no `aria-current` — the exact silence NotebookBody's own comment says
 *  the rail state was added to end ("a keyboard user pressed 'sources', stayed
 *  focused on the rail, and had nothing to tell them anything had happened").
 *
 *  The shipped fixture carries three counter-positions and five questions, so
 *  neither is reachable today. Both conditions were written by someone who
 *  expected zero.
 *
 *  One predicate, read by the rail and by the section. A section that grows a
 *  condition adds it HERE, and the rail follows without anyone remembering. */
export const CONDITIONAL_SECTIONS: Record<string, (n: Notebook) => boolean> = {
  counters: (n) => n.counterPositions.length > 0,
  questions: (n) => n.candidateQuestions.length > 0,
};

/** Does this section render for this notebook? Unconditional sections are
 *  always true — the map holds only the ones that can be absent. */
export function sectionRenders(n: Notebook, id: string): boolean {
  const predicate = CONDITIONAL_SECTIONS[id];
  return predicate ? predicate(n) : true;
}

/** A notebook section heading. Carries the anchor the rail jumps to.
 *
 *  `tabIndex={-1}` so the rail can put FOCUS here, not just scroll here. A jump
 *  that only moves the scroll container leaves a keyboard user's focus back on
 *  the button they pressed: the next Tab continues through the rail, and
 *  nothing they can perceive has changed. Not reachable by tabbing — -1 means
 *  programmatic focus only. */
export function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3
      id={`nb-${id}`}
      tabIndex={-1}
      className="font-jetbrains scroll-mt-2 border-b border-white/8 pb-1.5 text-label tracking-[0.18em] text-cyan-300/80 uppercase focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      {children}
    </h3>
  );
}

/** Split "THEREFORE the buying stops" into its connector and its clause. */
export function chainLink(step: string): { connector: Connector; text: string } {
  for (const c of ["THEREFORE", "BUT", "AND THEN", "AND"] as const) {
    if (step.startsWith(c + " ")) {
      const connector = (c === "AND" ? "AND THEN" : c) as Connector;
      return { connector, text: step.slice(c.length + 1) };
    }
  }
  return { connector: null, text: step };
}
