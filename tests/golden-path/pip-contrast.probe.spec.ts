// LANE - PipRow hollow and capacity pips clear the 3:1 non-text floor on ink (was 2.14 / 1.25).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

type RGB = [number, number, number];
const INK: RGB = [8, 10, 16];
const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const over = (fg: RGB, a: number, bg: RGB): RGB => [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)) as RGB;
const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const WHITE: RGB = [255, 255, 255];
const alphaOf = (s: string): number => { const m = s.match(/\/\[?(0?\.\d+|\d+)\]?$/); if (!m) throw new Error("no alpha in " + s); const v = parseFloat(m[1]); return v > 1 ? v / 100 : v; };
const src = (f: string) => { const s = stripComments(readFileSync(join(process.cwd(), f), "utf8")); expect(s.length).toBeGreaterThan(0); return s; };

test("PipRow hollow and capacity borders >= 3:1, capacity fainter than hollow", () => {
  const s = src("components/ui/signal/PipRow.tsx");
  const hollow = alphaOf(s.match(/hollow:\s*"[^"]*?(border-white\/[^\s"]+)/)![1]);
  const cap = alphaOf(s.match(/CAPACITY\s*=\s*"[^"]*?(border-white\/[^\s"]+)/)![1]);
  expect(ratio(over(WHITE, hollow, INK), INK)).toBeGreaterThanOrEqual(3);
  expect(ratio(over(WHITE, cap, INK), INK)).toBeGreaterThanOrEqual(3);
  expect(hollow).toBeGreaterThan(cap);
});
