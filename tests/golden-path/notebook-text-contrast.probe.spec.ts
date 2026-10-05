// LANE — NOTEBOOK TEXT IS LEGIBLE ON THE MODAL GROUND (static ratchet).
//
// The notebook modals sit on .glass-panel over --gt-ink, about #0f1117. White at
// alpha a over that ground measures /25 2.22:1, /30 2.67, /35 3.21, /40 3.82,
// /45 4.53, /50 5.32, /55 6.21 (WCAG relative luminance). Fact ids, as-of dates,
// source locators, citations and "hazard not assessed" were drawn at /25-/40,
// below AA 4.5:1 — the same class of defect as the ~0.12-alpha Ghost.
//
// A decorative glyph (arrow, dash, middot) may stay dim, and says so with
// aria-hidden on the same line.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const ROOT = join(__dirname, "..", "..", "app", "_phases", "_shared");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

test("notebook text is not drawn below 4.5:1 (text-white alpha >= 45)", () => {
  const files = walk(ROOT);
  expect(files.length, "the walk read nothing").toBeGreaterThan(0);
  const hits: string[] = [];
  for (const f of files) {
    stripComments(readFileSync(f, "utf8"))
      .split("\n")
      .forEach((line, i) => {
        if (/aria-hidden/.test(line)) return;
        for (const m of line.matchAll(/text-white\/(\d+)\b/g)) {
          if (Number(m[1]) < 45) hits.push(`${relative(ROOT, f)}:${i + 1} ${m[0]}`);
        }
      });
  }
  expect(hits).toEqual([]);
});

// Prose is text-content (--text-content, 18px). Tailwind's text-sm / text-base
// are display rungs; globals.css says nothing there is a body size.
test("notebook prose uses the text-content rung, not text-sm / text-base", () => {
  const files = walk(ROOT);
  expect(files.length, "the walk read nothing").toBeGreaterThan(0);
  const hits: string[] = [];
  for (const f of files) {
    stripComments(readFileSync(f, "utf8"))
      .split("\n")
      .forEach((line, i) => {
        if (/\btext-(sm|base)\b/.test(line)) hits.push(`${relative(ROOT, f)}:${i + 1}`);
      });
  }
  expect(hits).toEqual([]);
});
