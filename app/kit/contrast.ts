// WCAG 2.x contrast, computed from the world's own token values. The page reads
// `WORLD_ALMANAC` (components/ui/tokens.ts) and derives every ratio it prints; no
// figure on /kit is typed by hand, so a retuned token moves its row with it.

const HEX = /^#([0-9a-f]{6})$/i;

const SIDE = /#[0-9a-f]{6}|var\(--[\w-]+\)|transparent|white/.source;
const MIX = new RegExp(String.raw`^color-mix\(in srgb,\s*(${SIDE})\s+(\d+(?:\.\d+)?)%,\s*(${SIDE})\)$`, "i");

const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/** A resolved colour: `rgb` is `#rrggbb`, `alpha` is 0..1 (1 for every opaque token). */
export interface Colour {
  rgb: string;
  alpha: number;
}

const channels = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** `a` mixed with `b` in sRGB, `pct` percent of `a`: what `color-mix(in srgb, a pct%, b)` paints. */
export function mixHex(a: string, b: string, pct: number): string {
  const [x, y] = [channels(a), channels(b)];
  return "#" + [0, 1, 2].map((i) => toHex((x[i] * pct) / 100 + (y[i] * (100 - pct)) / 100)).join("");
}

/** `color-mix` interpolates premultiplied, so a side that is transparent contributes weight but no colour. */
function mixColour(a: Colour, b: Colour, pct: number): Colour {
  const [wa, wb] = [(a.alpha * pct) / 100, (b.alpha * (100 - pct)) / 100];
  const alpha = wa + wb;
  if (alpha === 0) return { rgb: "#000000", alpha: 0 };
  const [x, y] = [channels(a.rgb), channels(b.rgb)];
  return { rgb: "#" + [0, 1, 2].map((i) => toHex((x[i] * wa + y[i] * wb) / alpha)).join(""), alpha };
}

/**
 * A token's colour as `{rgb, alpha}`: a plain hex, a bare `var(--x)` alias, `white` and `transparent` resolve
 * directly, and a `color-mix(in srgb, X p%, Y)` over other tokens, hexes or those
 * keywords is mixed (a side of `transparent` becomes alpha, not a darker colour).
 * Anything else (a gradient, a curve, an rgba) is null.
 */
export function resolve(value: string, tokens: Record<string, string>): Colour | null {
  const v = value.trim();
  if (HEX.test(v)) return { rgb: v.toLowerCase(), alpha: 1 };
  if (/^white$/i.test(v)) return { rgb: "#ffffff", alpha: 1 };
  if (/^transparent$/i.test(v)) return { rgb: "#000000", alpha: 0 };
  const ref = (t: string): Colour | null => {
    const r = tokens[/var\((--[\w-]+)\)/.exec(t)![1]];
    return r === undefined ? null : resolve(r, tokens);
  };
  if (/^var\(--[\w-]+\)$/.test(v)) return ref(v);
  const m = MIX.exec(v);
  if (!m) return null;
  const side = (t: string): Colour | null => (t.startsWith("var(") ? ref(t) : resolve(t, tokens));
  const [a, b] = [side(m[1]), side(m[3])];
  return a && b ? mixColour(a, b, Number(m[2])) : null;
}

/** `fg` painted over an opaque `ground` hex: the flat colour the eye receives. */
export function paintOver(fg: Colour, ground: string): string {
  return mixHex(fg.rgb, ground, fg.alpha * 100);
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

/** Contrast of a possibly translucent `fg` composited over an opaque `ground` hex, before measuring. */
export function contrastOver(fg: Colour, ground: string): number | null {
  return contrast(paintOver(fg, ground), ground);
}

export type Tier = "AAA" | "AA" | "AA large" | "fails";

export function tierOf(ratio: number): Tier {
  return ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "fails";
}
