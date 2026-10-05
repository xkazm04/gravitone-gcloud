// LANE - BandTrack measured band >= 3:1 against its track; bounds text >= 4.5:1.
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

test("BandTrack measured band and bounds", () => {
  const s = src("components/ui/signal/BandTrack.tsx");
  const track = over(WHITE, alphaOf(s.match(/bg-(white\/\d+)"/)![1]), INK);
  const band = alphaOf(s.match(/:\s*"(bg-cyan-400\/\d+)"/)![1]);
  const bounds = alphaOf(s.match(/text-label (text-white\/\d+)/)![1]);
  expect(ratio(over([34, 211, 238], band, track), track)).toBeGreaterThanOrEqual(3);
  expect(ratio(over(WHITE, bounds, INK), INK)).toBeGreaterThanOrEqual(4.5);
});
