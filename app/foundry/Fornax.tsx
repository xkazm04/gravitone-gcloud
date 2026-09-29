"use client";

// FORNAX, THE FURNACE — this page's figure. A real constellation, named for a
// chemical furnace, drawn here as an engraved kiln and retort, and labelled
// stylised. Its four stars are the four modules: pointing at one opens that
// module, and the open one is ringed in Aldebaran.
//
// The figure is drawn in SVG lines (kit `.k-ln`); the star LABELS are real buttons
// laid over it, so they keep the type floor at any width and are keyboard
// reachable. Feature-local on purpose: another page has another figure.

const W = 440;
const H = 150;

/** Star positions in the drawing's own units. */
const STARS: Record<"cull" | "extract" | "styles" | "dojo", [number, number]> = {
  cull: [106, 118],
  extract: [258, 92],
  styles: [151, 16],
  dojo: [372, 84],
};

const LABEL: Record<keyof typeof STARS, string> = { cull: "Cull", extract: "Extract", styles: "Styles", dojo: "Dojo" };

const LINES: { d: string; faint?: boolean }[] = [
  { d: "M 30 142 L 410 142" },
  { d: "M 56 142 L 62 76 Q 110 26 158 76 L 164 142" },
  { d: "M 86 142 L 86 118 Q 106 98 126 118 L 126 142" },
  { d: "M 70 96 Q 110 66 150 96", faint: true },
  { d: "M 66 120 L 156 120", faint: true },
  { d: "M 144 58 L 144 16 L 158 16 L 158 66" },
  { d: "M 151 12 C 142 2 160 -2 150 -12", faint: true },
  { d: "M 222 142 L 294 142 M 236 142 L 244 126 M 280 142 L 272 126", faint: true },
  { d: "M 258 126 A 32 32 0 1 1 258.1 126" },
  { d: "M 280 72 L 346 38 L 353 47 L 287 80" },
  { d: "M 352 58 L 392 58 L 398 108 L 346 108 Z" },
  { d: "M 104 108 Q 108 100 104 94 Q 112 100 110 110", faint: true },
  { d: "M 164 110 C 190 110 204 98 228 96", faint: true },
];

const ORDER = ["styles", "cull", "extract", "dojo"] as const;

export function Fornax<T extends keyof typeof STARS>({ active, onSelect }: { active: T; onSelect: (t: T) => void }) {
  const ast = `M ${ORDER.map((k) => STARS[k].join(" ")).join(" L ")}`;
  return (
    <div className="k-figure" role="group" aria-label="Fornax, the furnace: its four stars are the four modules">
      <svg viewBox={`0 -14 ${W} ${H + 14}`} aria-hidden="true">
        {LINES.map((l) => (
          <path key={l.d} className={`k-ln${l.faint ? " k-ln--f" : ""}`} pathLength={1} d={l.d} />
        ))}
        <path className="k-ast" d={ast} />
      </svg>
      {(Object.keys(STARS) as (keyof typeof STARS)[]).map((k) => {
        const [x, y] = STARS[k];
        return (
          <button
            key={k}
            type="button"
            className={`k-star${active === k ? " k-star--on" : ""}`}
            style={{ left: `${(100 * x) / W}%`, top: `${(100 * (y + 14)) / (H + 14)}%` }}
            aria-label={`Open ${LABEL[k]}`}
            aria-pressed={active === k}
            onClick={() => onSelect(k as T)}
          >
            <span className="k-star__d" aria-hidden="true" />
            {LABEL[k]}
          </button>
        );
      })}
    </div>
  );
}
