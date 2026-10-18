// LANE - Tally chip key (the `.label` span of @gt/ui Tally) clears 4.5:1 on ink.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

type RGB = [number, number, number];
const INK: RGB = [8, 10, 16];
const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const src = (f: string) => { const s = stripComments(readFileSync(join(process.cwd(), f), "utf8")); expect(s.length).toBeGreaterThan(0); return s; };
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;

/** The colour a CSS rule paints with, resolved through one `var(--token)` to its tokens.css hex. */
const paint = (rules: string, selector: string): RGB => {
  const body = rules.split(selector + "{")[1].split("}")[0];
  const name = body.match(/color:var\(--([\w-]+)\)/)![1];
  const token = src("packages/ui/src/tokens.css").match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))!;
  return hex(token[1]);
};

test("Tally key span", () => {
  const rules = src("packages/ui/src/components/tally/Tally.module.css");
  expect(ratio(paint(rules, ".label"), INK)).toBeGreaterThanOrEqual(4.5);
});
