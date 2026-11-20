"use client";

// THE TOKENS AS THE CANVAS NEEDS THEM - a 2D context cannot read `var(--amber)`, so the canvas reads each token's
// computed value ONCE from the document (@gt/ui/tokens.css, the same source the DOM uses) and draws with it. No colour
// or font is typed here: a token renamed in tokens.css is a missing value here, not a stale literal.

import type { Tone } from "./tables.ts";

const TONES: readonly Tone[] = ["ink", "ink-1", "ink-2", "ink-3", "ink-4", "ink-bright", "text", "muted", "faint", "cyan", "amber", "emerald", "rose", "violet", "wall", "wall-hi", "illustrative-text", "reading", "note-text", "hair", "hair-2", "hair-3"];

export type Palette = {
  readonly c: Readonly<Record<Tone, string>>;
  /** A tone at an alpha, as rgba(). Tones that are already rgba (the hairs) answer as they are. */
  readonly a: (tone: Tone, alpha: number) => string;
  readonly font: { readonly sans: string; readonly mono: string; readonly serif: string };
  /** The user asked for less motion. */
  readonly still: boolean;
};

export function readPalette(el: Element = document.documentElement): Palette {
  const css = getComputedStyle(el);
  const tok = (n: string): string => css.getPropertyValue(`--${n}`).trim();
  const c = Object.fromEntries(TONES.map((t) => [t, tok(t)])) as Record<Tone, string>;
  const rgb = new Map<Tone, string>();
  const a = (tone: Tone, alpha: number): string => {
    let v = rgb.get(tone);
    if (v === undefined) {
      const h = c[tone].replace("#", "");
      if (!/^[0-9a-f]{6}$/i.test(h)) return c[tone];
      v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(",");
      rgb.set(tone, v);
    }
    return `rgba(${v},${alpha})`;
  };
  return { c, a, font: { sans: tok("sans"), mono: tok("mono"), serif: tok("serif") }, still: matchMedia("(prefers-reduced-motion: reduce)").matches };
}
