"use client";

// PROPORTIONAL PARTS OF A WHOLE — one rail, segments to scale.
//
// The paragraph this replaces is written three times, near-verbatim, in three
// commit dialogs:
//
//   app/foundry/FoundryView.tsx:178-183   the cull commit — prose explaining
//                                         that an undecided tile will be
//                                         committed as a rejection
//   app/foundry/ExtractView.tsx:419       the same sentence
//   app/foundry/DojoView.tsx:357          and again
//
// All three are describing a picture: a rail where "kept" and "rejected" sit
// side by side and "undecided" is a HATCHED extension of the rejected segment —
// same colour, drawn as a stand-in, immediately next to the thing it will be
// counted as. `hatched` is that, and it is the only reason this component
// exists rather than three divs with a width style.
//
// THE HATCH IS `currentColor`, not a literal: the segment carries a Tailwind
// text colour and the repeating gradient reads it. That keeps chrome colour
// where components/ui/tokens.ts says it lives.
//
// SCREEN READERS GET THE LIST, ALWAYS. The rail is `aria-hidden`; a real <ul> of
// `label — n` sits beside it, visible when `showCounts` and `sr-only` when not.
// A bar chart with no textual equivalent is the same failure as an unlabelled
// glyph, and this replaces text that everyone could read.

export type StackTone = "cyan" | "emerald" | "amber" | "rose" | "neutral";

export interface StackSegment {
  n: number;
  tone: StackTone;
  /** One or two words. This is the legend AND the screen-reader text. */
  label: string;
  /** "counts as the segment beside it, but was not chosen." Drawn as a hatch in
   *  the same tone rather than as a fourth colour, because it is not a fourth
   *  outcome — it is the outcome to its left, undecided. */
  hatched?: boolean;
}

const FILL: Record<StackTone, string> = {
  cyan: "bg-cyan-300/80",
  emerald: "bg-emerald-300/75",
  amber: "bg-amber-300/80",
  rose: "bg-rose-400/75",
  neutral: "bg-white/20",
};

/** The hatch tints `currentColor`; the fill classes above are backgrounds and
 *  cannot be read by a gradient, so the same tone is spelled once more as text. */
const INK: Record<StackTone, string> = {
  cyan: "text-cyan-300/70",
  emerald: "text-emerald-300/65",
  amber: "text-amber-300/70",
  rose: "text-rose-400/65",
  neutral: "text-white/20",
};

const DOT: Record<StackTone, string> = {
  cyan: "bg-cyan-300/80",
  emerald: "bg-emerald-300/75",
  amber: "bg-amber-300/80",
  rose: "bg-rose-400/75",
  neutral: "bg-white/25",
};

/** 45° stripes at 6px pitch, painted from the element's own text colour. */
const HATCH = "repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 6px)";

/**
 * ```tsx
 * <StackBar segments={[
 *   { n: 12, tone: "emerald", label: "kept" },
 *   { n: 5,  tone: "rose",    label: "rejected" },
 *   { n: 3,  tone: "rose",    label: "undecided", hatched: true },
 * ]} />
 * ```
 */
export function StackBar({
  segments,
  showCounts = true,
  label,
  className = "",
}: {
  segments: StackSegment[];
  /** Render the legend visibly. Off, it is still there for screen readers. */
  showCounts?: boolean;
  /** Names the whole rail — "commit". Optional; the list stands alone. */
  label?: string;
  className?: string;
}) {
  const total = segments.reduce((a, s) => a + s.n, 0);
  return (
    <div className={className}>
      <div
        aria-hidden
        className="flex h-2 w-full overflow-hidden rounded-full border border-white/10 bg-white/[0.03]"
      >
        {total > 0 &&
          segments.map((s, i) =>
            s.n === 0 ? null : (
              <span
                key={`${s.label}-${i}`}
                className={s.hatched ? INK[s.tone] : FILL[s.tone]}
                style={{
                  width: `${(s.n / total) * 100}%`,
                  ...(s.hatched ? { backgroundImage: HATCH } : null),
                }}
              />
            ),
          )}
      </div>
      <ul
        aria-label={label}
        className={
          showCounts
            ? "font-jetbrains mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-white/55"
            : "sr-only"
        }
      >
        {segments.map((s, i) => (
          <li key={`${s.label}-${i}`} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${DOT[s.tone]} ${s.hatched ? "opacity-50" : ""}`}
            />
            <span>
              {s.label} {s.n}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
