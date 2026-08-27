"use client";

// The raised-variable field of a rung: five closed chips, multi-toggle.
//
// Multi-toggle on purpose. The doctrine says a rung raises EXACTLY one, and the
// checker enforces it — but a field that cannot express the defect cannot show
// it, and a creator who has a rung raising two things needs to see that state
// named, not be prevented from recording what the rung actually does. So the
// chips accept any set, and the set that is a defect turns amber here, before
// the structure panel says the same thing at the foot of the page.

import type { RaisedVariable } from "./types";

export const RAISED_VARIABLES: readonly RaisedVariable[] = [
  "scale",
  "threat",
  "speed",
  "intimacy",
  "cost",
] as const;

export default function RaisesChips({
  beatId,
  value,
  previous,
  onChange,
}: {
  beatId: string;
  value: RaisedVariable[];
  /** The single variable the previous rung raises, when it raises exactly one. */
  previous: RaisedVariable | null;
  onChange: (next: RaisedVariable[]) => void;
}) {
  const tooMany = value.length > 1;
  const repeats = value.length === 1 && previous !== null && value[0] === previous;
  const none = value.length === 0;
  const defect = tooMany || repeats;

  const toggle = (v: RaisedVariable) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div data-testid={`raises-${beatId}`} className="mt-2">
      <p className="font-jetbrains text-[10px] tracking-[0.14em] text-white/35 uppercase">
        raises
        {defect && (
          <span className="ml-2 text-amber-200 normal-case tracking-normal">
            {tooMany ? `${value.length} variables — a rung raises exactly one` : `repeats the previous rung's ${previous}`}
          </span>
        )}
        {none && <span className="ml-2 text-amber-200/80 normal-case tracking-normal">none declared</span>}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="raised variable">
        {RAISED_VARIABLES.map((v) => {
          const on = value.includes(v);
          const cls = on
            ? defect
              ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
              : "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
            : "border-white/10 text-white/50 hover:border-white/25 hover:text-white/80";
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(v)}
              className={`font-jetbrains rounded-full border px-2.5 py-1 text-[11px] transition ${cls}`}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}
