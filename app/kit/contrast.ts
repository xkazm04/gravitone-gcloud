// WCAG 2.x contrast, computed from the world's own token values. The page reads
// `WORLD_ALMANAC` (components/ui/tokens.ts) and derives every ratio it prints; no
// figure on /kit is typed by hand, so a retuned token moves its row with it.

const HEX = /^#([0-9a-f]{6})$/i;

/** Linear-light relative luminance of a `#rrggbb` token, or null when the token is not a plain hex. */
export function luminance(hex: string): number | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrast(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type Tier = "AAA" | "AA" | "AA large" | "fails";

export function tierOf(ratio: number): Tier {
  return ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "fails";
}
