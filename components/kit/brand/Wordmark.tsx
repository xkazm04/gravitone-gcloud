// GRAVITONE lettered as nine constellation capitals: each letter is a stroke
// figure with a few stars on its joints. Coordinates are the Almanac design's
// own (contest landing-nextgen-brand-r2, variant 2). Letters are 10 units tall;
// `w` is the advance width, and the I has none because it is a single stroke.

interface Letter {
  w: number;
  lines: string[];
  /** x, y, star radius */
  stars: [number, number, number][];
}

const LETTERS: Record<string, Letter> = {
  G: { w: 7, lines: ["M 6.8 1.8 L 4.4 0 L 1.6 0.9 L 0 5 L 1.6 9.1 L 4.4 10 L 7 8.2 L 7 5.4 L 4.2 5.4"], stars: [[6.8, 1.8, 0.8], [0, 5, 1.05], [4.4, 10, 0.6], [7, 5.4, 0.75], [4.2, 5.4, 0.55]] },
  R: { w: 6.3, lines: ["M 0 10 L 0 0 L 4.2 0 L 6.3 1.4 L 6.3 3.6 L 4.2 5 L 0 5", "M 3.5 5 L 6.5 10"], stars: [[0, 0, 0.95], [0, 10, 0.7], [6.3, 2.5, 0.6], [6.5, 10, 0.85]] },
  A: { w: 7.4, lines: ["M 0 10 L 3.7 0 L 7.4 10", "M 1.35 6.4 L 6.05 6.4"], stars: [[3.7, 0, 1.05], [0, 10, 0.75], [7.4, 10, 0.75], [6.05, 6.4, 0.5]] },
  V: { w: 7.4, lines: ["M 0 0 L 3.7 10 L 7.4 0"], stars: [[0, 0, 0.75], [3.7, 10, 1.05], [7.4, 0, 0.75]] },
  I: { w: 0, lines: ["M 0 0 L 0 10"], stars: [[0, 0, 0.85], [0, 10, 0.65]] },
  T: { w: 6.8, lines: ["M 0 0 L 6.8 0", "M 3.4 0 L 3.4 10"], stars: [[0, 0, 0.55], [6.8, 0, 0.55], [3.4, 0, 0.95], [3.4, 10, 0.85]] },
  O: { w: 7.8, lines: ["M 3.9 0 L 6.7 1.3 L 7.8 5 L 6.7 8.7 L 3.9 10 L 1.1 8.7 L 0 5 L 1.1 1.3 Z"], stars: [[3.9, 0, 0.85], [7.8, 5, 0.65], [3.9, 10, 0.6], [0, 5, 1.05]] },
  N: { w: 6.8, lines: ["M 0 10 L 0 0 L 6.8 10 L 6.8 0"], stars: [[0, 10, 0.75], [0, 0, 0.65], [6.8, 10, 1], [6.8, 0, 0.65]] },
  E: { w: 5.8, lines: ["M 5.8 0 L 0 0 L 0 10 L 5.8 10", "M 0 5 L 4.4 5"], stars: [[5.8, 0, 0.6], [0, 0, 0.95], [0, 10, 0.75], [5.8, 10, 0.55], [4.4, 5, 0.5]] },
};

const WORD = "GRAVITONE";

export interface WordmarkProps {
  /** Rendered height in CSS px; width follows. Omit to size from CSS. */
  height?: number;
  /** Letter spacing in construction units. */
  track?: number;
  className?: string;
}

const TRACK = 4.4;

export function Wordmark({ height, track = TRACK, className }: WordmarkProps) {
  let x = 0;
  const lines: { d: string; x: number }[] = [];
  const stars: { cx: number; cy: number; r: number }[] = [];
  for (const ch of WORD) {
    const L = LETTERS[ch];
    for (const d of L.lines) lines.push({ d, x });
    for (const [sx, sy, r] of L.stars) stars.push({ cx: x + sx, cy: sy, r });
    x += L.w + track;
  }
  const w = x - track;
  return (
    <svg
      viewBox={`-1.4 -1.4 ${w + 2.8} 12.8`}
      height={height}
      className={className}
      style={{ overflow: "visible", width: "auto" }}
      role="img"
      aria-label="Gravitone"
    >
      <g
        fill="none"
        style={{ stroke: "var(--al-gold, currentColor)" }}
        strokeWidth={0.42}
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeOpacity={0.9}
      >
        {lines.map((l, i) => (
          <path key={i} d={l.d} transform={`translate(${l.x} 0)`} />
        ))}
      </g>
      <g style={{ fill: "var(--al-white, currentColor)" }}>
        {stars.map((s, i) => (
          <circle key={i} cx={s.cx.toFixed(2)} cy={s.cy} r={s.r.toFixed(2)} />
        ))}
      </g>
    </svg>
  );
}
