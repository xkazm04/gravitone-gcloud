"use client";

// A VALUE INSIDE A MEASURED WINDOW — a rail, a band, a thumb.
//
//   app/_projects/wizard/stages.tsx:226-234   three branches of runtime-hint
//                                             prose, one per relationship the
//                                             number can have with the
//                                             template's range ("shorter than
//                                             the measured band…", "longer
//                                             than…", "inside…"). The branch IS
//                                             the picture: below, above, or in.
//   app/_phases/script/_parts/Meters.tsx:85-86
//                                             `belowNote` / `aboveNote`,
//                                             sentences printed BESIDE a meter
//                                             that already draws the band they
//                                             describe.
//
// READ-ONLY BY CONSTRUCTION. This takes no input and has no focus — it sits
// under the control that does. A range input that looked like this would be a
// different component with different obligations (keyboard, `aria-valuenow`,
// a label), and half-implementing that is worse than not implementing it.
// So: `role="img"`, one name, no tab stop.
//
// `hatchBand` is the honest state this app keeps needing: a band drawn from a
// craft note whose corpus is n=0 (lib/projects.ts says so of every promotional
// template — "none of it was measured in this repo"). A hatched band is a
// stand-in, and it must not read as a measurement.

export interface BandTrackProps {
  value: number;
  min: number;
  max: number;
  /** The acceptable window, in the same unit. Absent = no window to be in. */
  band?: [number, number];
  /** Appended to every number this component speaks — "s", "px", "%". */
  unit?: string;
  /** The band is a stand-in, not a measurement. Drawn as a hatch, and said. */
  hatchBand?: boolean;
  /** Print the band's two endpoints under the rail. */
  showBounds?: boolean;
  /** Names the whole track — "runtime". */
  label?: string;
  className?: string;
}

const HATCH = "repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 6px)";

const pct = (v: number, min: number, max: number) =>
  max === min ? 0 : Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));

export function BandTrack({
  value,
  min,
  max,
  band,
  unit = "",
  hatchBand = false,
  showBounds = true,
  label,
  className = "",
}: BandTrackProps) {
  const inBand = band ? value >= band[0] && value <= band[1] : true;
  const left = band ? pct(band[0], min, max) : 0;
  const width = band ? pct(band[1], min, max) - left : 0;
  const at = pct(value, min, max);

  const said = [
    label,
    `${value}${unit}`,
    band
      ? inBand
        ? `inside ${band[0]}–${band[1]}${unit}`
        : `outside ${band[0]}–${band[1]}${unit}`
      : null,
    band && hatchBand ? "(band is a stand-in, nothing measured it)" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={className}>
      <div role="img" aria-label={said} className="relative h-1.5 w-full rounded-full bg-white/8">
        {band && (
          <span
            aria-hidden
            className={`absolute inset-y-0 rounded-full ${
              hatchBand ? "text-cyan-300/45" : "bg-cyan-400/25"
            }`}
            style={{
              left: `${left}%`,
              width: `${width}%`,
              ...(hatchBand ? { backgroundImage: HATCH } : null),
            }}
          />
        )}
        <span
          aria-hidden
          className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${
            inBand ? "bg-cyan-300" : "bg-amber-300"
          }`}
          style={{ left: `${at}%` }}
        />
      </div>
      {band && showBounds && (
        <div
          aria-hidden
          className="font-jetbrains mt-1 flex justify-between text-label text-white/35"
        >
          <span>
            {band[0]}
            {unit}
          </span>
          <span>
            {band[1]}
            {unit}
          </span>
        </div>
      )}
    </div>
  );
}
