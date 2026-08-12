"use client";

import type { Connector } from "../types";

/** A notebook section heading. Carries the anchor the rail jumps to. */
export function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3
      id={`nb-${id}`}
      className="font-jetbrains scroll-mt-2 border-b border-white/8 pb-1.5 text-[11px] tracking-[0.18em] text-cyan-300/80 uppercase"
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
