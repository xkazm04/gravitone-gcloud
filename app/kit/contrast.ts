// WCAG 2.x contrast, computed from the world's own token values. The page reads
// `WORLD_ALMANAC` (components/ui/tokens.ts) and derives every ratio it prints; no
// figure on /kit is typed by hand, so a retuned token moves its row with it.

const HEX = /^#([0-9a-f]{6})$/i;

const MIX = /^color-mix\(in srgb,\s*(#[0-9a-f]{6}|var\(--[\w-]+\))\s+(\d+(?:\.\d+)?)%,\s*(#[0-9a-f]{6}|var\(--[\w-]+\))\)$/i;

const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/** `a` mixed with `b` in sRGB, `pct` percent of `a`: what `color-mix(in srgb, a pct%, b)` paints. */
export function mixHex(a: string, b: string, pct: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + [0, 1, 2].map((i) => toHex((x[i] * pct) / 100 + (y[i] * (100 - pct)) / 100)).join("");
}

/**
 * A token's flat colour as `#rrggbb`: a plain hex passes through, and a
 * `color-mix(in srgb, X p%, Y)` over other tokens (or hexes) is resolved. Anything
 * else (a gradient, a curve, an rgba) is null.
 */
export function resolve(value: string, tokens: Record<string, string>): string | null {
  const v = value.trim();
  if (HEX.test(v)) return v;
  const m = MIX.exec(v);
  if (!m) return null;
  const side = (t: string) => {
    if (t.startsWith("#")) return t;
    const ref = tokens[/var\((--[\w-]+)\)/.exec(t)![1]];
    return ref === undefined ? null : resolve(ref, tokens);
  };
  const [a, b] = [side(m[1]), side(m[3])];
  return a && b ? mixHex(a, b, Number(m[2])) : null;
}

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
