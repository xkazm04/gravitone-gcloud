// LANE - Tally and Provenance chip keys clear 4.5:1 on ink (was 2.91 / 2.59).
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

const keyRatio = (s: string, opRe: RegExp) => {
  const tone = alphaOf(s.match(/neutral:\s*"[^"]*?\btext-white\/(\d+)/)![0].match(/text-white\/\d+/)![0]);
  const op = parseInt(s.match(opRe)![1], 10) / 100;
  return ratio(over(WHITE, tone * op, INK), INK);
};
test("Tally key span", () => {
  const s = src("components/ui/signal/Tally.tsx");
  expect(keyRatio(s, /"uppercase opacity-(\d+)"/)).toBeGreaterThanOrEqual(4.5);
});
test("Provenance key span", () => {
  const t = src("components/ui/signal/Tally.tsx");
  const p = src("components/ui/signal/Provenance.tsx");
  const tone = alphaOf(t.match(/neutral:\s*"[^"]*?(text-white\/\d+)/)![1]);
  const op = parseInt(p.match(/className="uppercase opacity-(\d+)"/)![1], 10) / 100;
  expect(ratio(over(WHITE, tone * op, INK), INK)).toBeGreaterThanOrEqual(4.5);
});
