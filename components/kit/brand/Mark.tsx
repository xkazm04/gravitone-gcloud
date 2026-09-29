import { ASTERISM_PATH, ASTERISM_STARS } from "./asterism";

// The G asterism as an SVG component. Colour comes from the Almanac world's
// tokens (components/ui/tokens.ts, WORLD_ALMANAC), so it must sit under
// `data-world="almanac"`; outside that scope the strokes fall back to
// currentColor rather than to a hue this file would have to own.

export interface MarkProps {
  /** Rendered width in CSS px; height follows. Omit to size from CSS. */
  size?: number;
  /** Stroke weight in construction units (radius is 10). 2.1 holds down to 24px; the first mark's 0.62 was too thin. */
  strokeWidth?: number;
  /** Draws the dashed construction circle behind the G (the construction sheet only). */
  construction?: boolean;
  /** Accessible name. Without it the mark is decorative (aria-hidden). */
  title?: string;
  className?: string;
}

const GOLD = "var(--al-gold, currentColor)";
// Stars are drawn larger than the construction radii so they survive at 24px.
const STAR = 1.45;

export function Mark({ size, strokeWidth = 2.1, construction = false, title, className }: MarkProps) {
  const sw = strokeWidth;
  return (
    <svg
      viewBox="-12.5 -12.5 25 25"
      width={size}
      height={size}
      className={className}
      style={{ overflow: "visible" }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {construction && (
        <circle
          r={10}
          fill="none"
          style={{ stroke: GOLD }}
          strokeOpacity={0.35}
          strokeWidth={sw * 0.6}
          strokeDasharray={`${sw * 1.4} ${sw * 2.2}`}
        />
      )}
      <path d={ASTERISM_PATH} fill="none" style={{ stroke: GOLD }} strokeWidth={sw} strokeLinecap="round" />
      {ASTERISM_STARS.map((g) => (
        <g key={g.step}>
          <circle cx={g.x} cy={g.y} r={g.r * STAR + sw * 0.7} style={{ fill: "var(--al-night, transparent)" }} />
          <circle
            cx={g.x}
            cy={g.y}
            r={g.r * STAR}
            style={{ fill: g.step === "Cut" ? "var(--al-ald, currentColor)" : "var(--al-white, currentColor)" }}
          />
        </g>
      ))}
    </svg>
  );
}
