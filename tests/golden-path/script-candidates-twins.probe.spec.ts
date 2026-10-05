// SOURCE RATCHET — the two faces of the Candidates tab spell staleness once.
//
// HypothesisColumn marks a rewritten chain's carried-over figures with two
// <StaleBadge>s. CandidatesDuel printed the paragraph those badges replaced and
// drew its hand-typed check counts as bare glyphs, unmarked and unspoken.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
const duel = read("app/_phases/script/candidates/CandidatesDuel.tsx");
const column = read("app/_phases/script/_parts/HypothesisColumn.tsx");

test("both twins were read", () => {
  expect(duel.length).toBeGreaterThan(500);
  expect(column.length).toBeGreaterThan(500);
});

test("the duel no longer prints the paragraph StaleBadge replaced", () => {
  expect((duel.match(/were not\s+re-measured/g) ?? []).length).toBe(0);
});

test("the duel carries as many StaleBadges as the expert twin", () => {
  const count = (s: string) => (s.match(/<StaleBadge/g) ?? []).length;
  expect(count(column)).toBe(2);
  expect(count(duel)).toBe(count(column));
});

test("VerdictCounts gives every check glyph a spoken label", () => {
  const start = duel.indexOf("function VerdictCounts");
  const body = duel.slice(start, duel.indexOf("function DuelCardBody", start));
  expect(start).toBeGreaterThan(-1);
  expect((body.match(/sr-only/g) ?? []).length).toBeGreaterThanOrEqual(4);
});
