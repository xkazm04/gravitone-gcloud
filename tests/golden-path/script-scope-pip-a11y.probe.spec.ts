// SOURCE RATCHET — a required card's lock is reachable by keyboard and AT.
//
// The scope pip and the Coverage conflict marker were `disabled` buttons whose
// only carrier of requiredWhy was a native title: out of the tab order, and the
// aria-label said "is in scope". TabRail.tsx's own rule: aria-disabled, not
// disabled, so the reason is not put behind a mouse.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
const shared = read("app/_phases/script/_matrix/shared.tsx");
const coverage = read("app/_phases/script/_matrix/MatrixCoverage.tsx");

test("both files were read", () => {
  expect(shared.length).toBeGreaterThan(500);
  expect(coverage.length).toBeGreaterThan(500);
});

test("the locked scope pip is aria-disabled, named 'required', and describes its why", () => {
  expect((shared.match(/disabled=\{locked\}/g) ?? []).length).toBe(0);
  expect((shared.match(/aria-disabled/g) ?? []).length).toBeGreaterThanOrEqual(1);
  const label = shared.slice(shared.indexOf("aria-label={"), shared.indexOf("aria-label={") + 200);
  expect(label).toContain("required");
  expect(shared).toContain("aria-describedby");
  expect(/sr-only[^>]*>\s*\{card\.requiredWhy\}/.test(shared)).toBe(true);
});

test("the conflict marker does not pass `required` into a native disabled", () => {
  const attrs = coverage.match(/(?<![-\w])disabled=\{[^}]*\}/g) ?? [];
  expect(attrs.length).toBeGreaterThan(0);
  for (const a of attrs) expect(a, "native disabled must not carry card.required").not.toContain("required");
  expect(coverage).toContain("aria-disabled={card.required");
});
