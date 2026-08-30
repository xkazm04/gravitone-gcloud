"use client";

import type { Connector } from "../types";

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
