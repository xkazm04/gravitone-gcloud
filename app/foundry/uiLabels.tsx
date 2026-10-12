"use client";

// The small labels and status pills: Label, Dot, StatusChip, ScorePill,
// ScoreMeters, FlagPill. Split out of ui.tsx (which re-exports them) so the door
// stays under the 200-line cap. ScorePill and ScoreMeters share ghostMeter, the
// calibration drawing, so it lives here beside them.

import { CHIP_CLASS, Ghost, TALLY_TONE } from "@/components/ui/signal";
import { misleads, type CalibrationStatus } from "@/lib/foundry/calibration";

import type { PlantState } from "./parts";
import { DOT, GRADE_FILL, GRADE_SPOKEN, GRADE_TONE, STATE_TONE, TONE_TEXT, gradeOf, pct, type Tone } from "./uiNumbers";

/* ── Small labels ─────────────────────────────────────────────────────────── */

/** The small mono caps label — for a section's name or a figure's unit, never
 *  for a sentence. */
export function Label({ children, className = "", as: Tag = "span" }: { children: React.ReactNode; className?: string; as?: "span" | "h2" | "h3" | "h4" | "p" | "div" }) {
  return <Tag className={`font-jetbrains text-label tracking-[0.16em] text-white/40 uppercase ${className}`}>{children}</Tag>;
}

/** A status dot; `live` pulses (CSS, so the reduced-motion blanket rule in
 *  globals.css stops it for free). */
export function Dot({ tone, pulse = false, className = "" }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span aria-hidden className={`relative inline-flex h-2 w-2 shrink-0 ${className}`}>
      {pulse && <span className={`absolute inset-0 animate-ping rounded-full opacity-60 ${DOT[tone]}`} />}
      <span className={`relative h-2 w-2 rounded-full ${DOT[tone]}`} />
    </span>
  );
}

/** A plant state as a pill: a dot and the run's own status word. */
export function StatusChip({ kind, word, className = "" }: { kind: PlantState; word: string; className?: string }) {
  const tone = STATE_TONE[kind];
  return (
    <span className={`font-jetbrains inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-label whitespace-nowrap ${TALLY_TONE[tone]} ${className}`}>
      <Dot tone={tone} pulse={kind === "live"} />
      {word}
    </span>
  );
}

/** A grade field the human ledger shows to be inverted or at chance
 *  (lib/foundry/calibration.ts) keeps its figure and its spoken reading, and
 *  loses its fill and its tone: the bar is drawn as a Ghost track, because a
 *  coloured bar is the part that steers, and this one steers the wrong way. */
function ghostMeter(label: string, status: CalibrationStatus | undefined, className: string) {
  return misleads(status) ? <Ghost shape="bar" label={`${label} grader ${status}`} className={className} /> : null;
}

/** A score as a chip with its own small meter, so a column of them reads as a
 *  bar chart before a single number is read. */
export function ScorePill({
  label,
  value,
  status,
  className = "",
}: {
  label: string;
  value: number | null | undefined;
  /** The field's calibration against the human, when the score is a grade. */
  status?: CalibrationStatus;
  className?: string;
}) {
  const g = gradeOf(value);
  const ghost = ghostMeter(label, status, "w-6 @max-[17rem]:hidden");
  return (
    <span className={`${CHIP_CLASS} ${TALLY_TONE[ghost ? "neutral" : GRADE_TONE[g]]} ${className}`}>
      <span aria-hidden className="opacity-70">
        {label}
      </span>
      {ghost ?? (
        <span aria-hidden className="relative h-1.5 w-6 overflow-hidden rounded-full bg-white/10 @max-[17rem]:hidden">
          <span className={`absolute inset-y-0 left-0 rounded-full ${GRADE_FILL[g]}`} style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
        </span>
      )}
      <span aria-hidden className="tabular-nums">
        {pct(value)}
      </span>
      <span className="sr-only">
        {label} {pct(value)}, {GRADE_SPOKEN[g]}
      </span>
    </span>
  );
}

/**
 * Several scores as meters on a shared baseline — label, bar, figure — so a
 * tile's craft and style read as one small chart rather than two chips that
 * wrap whichever way the tile's width falls. Side by side when the strip has
 * the room (a size container, like ScorePill's meter), stacked when it does
 * not: the contact sheet's two-scene tiles are ~200px, and two bordered pills
 * need ~210.
 */
export function ScoreMeters({
  rows,
  className = "",
}: {
  rows: { label: string; value: number | null | undefined; status?: CalibrationStatus }[];
  className?: string;
}) {
  return (
    <div className={`@container w-full ${className}`}>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1 @min-[19rem]:grid-cols-2">
        {rows.map((r) => {
          const g = gradeOf(r.value);
          const ghost = ghostMeter(r.label, r.status, "min-w-4 flex-1");
          return (
            <div key={r.label} className="font-jetbrains flex min-w-0 items-center gap-2 text-label">
              <span aria-hidden className="w-[3.25rem] shrink-0 text-white/45">
                {r.label}
              </span>
              {ghost ?? (
                <span aria-hidden className="relative h-1.5 min-w-4 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className={`absolute inset-y-0 left-0 rounded-full ${GRADE_FILL[g]}`} style={{ width: `${Math.round((r.value ?? 0) * 100)}%` }} />
                </span>
              )}
              <span aria-hidden className={`w-[2.6rem] shrink-0 text-right tabular-nums ${g === "ungraded" || ghost ? "text-white/35" : TONE_TEXT[GRADE_TONE[g]]}`}>
                {pct(r.value)}
              </span>
              <span className="sr-only">
                {r.label} {pct(r.value)}, {GRADE_SPOKEN[g]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The two flags a grade can carry beside its scores. */
export function FlagPill({ kind }: { kind: "text" | "unmeasured" }) {
  return kind === "text" ? (
    <span className={`${CHIP_CLASS} ${TALLY_TONE.rose}`}>text</span>
  ) : (
    <span className={`${CHIP_CLASS} ${TALLY_TONE.amber}`}>unmeasured</span>
  );
}
