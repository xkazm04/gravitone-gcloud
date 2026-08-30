"use client";

// The connector between two adjacent beats. Three options, one of them the
// defect the form names — "and then" is offered rather than hidden, because a
// list that can only be described as a chain is a list nobody can find.

import { CONNECTOR_OPTIONS } from "./cut";
import type { Connector } from "./types";

const WORD: Record<Exclude<Connector, null>, string> = {
  BUT: "but",
  THEREFORE: "therefore",
  "AND THEN": "and then",
};

export default function ConnectorPick({
  beatId,
  value,
  onChange,
}: {
  /** The beat this connector belongs to — the LATER of the pair. */
  beatId: string;
  value: Connector;
  onChange: (c: Connector) => void;
}) {
  return (
    <div
      data-testid={`connector-${beatId}`}
      role="group"
      aria-label="connector to the previous beat"
      className="my-1.5 flex items-center gap-1.5 pl-2"
    >
      <span aria-hidden className="font-jetbrains text-[10px] text-white/25">↓</span>
      {CONNECTOR_OPTIONS.map((c) => {
        const on = value === c;
        const defect = c === "AND THEN";
        const cls = on
          ? defect
            ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
            : c === "BUT"
              ? "border-violet-400/40 bg-violet-400/10 text-violet-200"
              : "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
          : "border-white/10 text-white/45 hover:border-white/25 hover:text-white/80";
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(c)}
            title={defect ? "and-then is the defect the form names" : undefined}
            className={`font-jetbrains rounded px-2 py-0.5 text-[10px] tracking-[0.12em] transition ${cls}`}
          >
            {WORD[c]}
          </button>
        );
      })}
      {value === null && (
        <span className="font-jetbrains text-[10px] text-amber-200/70">no connector declared</span>
      )}
    </div>
  );
}
