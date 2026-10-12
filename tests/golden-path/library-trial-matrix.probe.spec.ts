// LANE — LIBRARY TRIAL MATRIX: the matrix is the committed index, drawn faithfully.
//
// Acceptance 1-2 of the trial-matrix ticket, proved over the real
// public/trials/index.json and the real TrialMatrix source.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { PRESETS } from "@/app/library/presets";
import { TRIALS } from "@/app/library/trials";
import { buildMatrix, lanesOf, parseTrialIndex } from "@/app/library/trialIndex";

import { stripComments } from "./_helpers";

const raw: unknown = JSON.parse(readFileSync(join(process.cwd(), "public/trials/index.json"), "utf8"));
const index = parseTrialIndex(raw);

test("the index parsed to something (a walk that read nothing proves nothing)", () => {
  expect(index.entries.length).toBeGreaterThan(0);
  expect(lanesOf(index)).toContain("google");
});

test("google lane: 6 rows x 5 columns, every cell src equals the index file", () => {
  const rows = buildMatrix(index, "google", PRESETS, TRIALS);
  expect(rows).toHaveLength(6);
  const files = new Map(
    index.entries.filter((e) => e.file.startsWith("/trials/google/")).map((e) => [`${e.styleId}/${e.trialId}`, e.file]),
  );
  for (const row of rows) {
    expect(row.cells).toHaveLength(5);
    for (const cell of row.cells) {
      const want = files.get(`${row.preset.id}/${cell.trial.id}`);
      expect(cell.entry, `${row.preset.id}/${cell.trial.id} missing`).toBeTruthy();
      expect(cell.entry?.file).toBe(want);
      expect(want).toMatch(/^\/trials\/google\//);
    }
  }
});

test("a lane never shows another lane's plates", () => {
  for (const lane of lanesOf(index)) {
    for (const row of buildMatrix(index, lane, PRESETS, TRIALS)) {
      for (const c of row.cells) if (c.entry) expect(c.entry.file.startsWith(`/trials/${lane}/`)).toBe(true);
    }
  }
});

test("hasText:true parses to a grade the matrix flags; ungraded stays ungraded", () => {
  const parsed = parseTrialIndex({
    entries: [
      { styleId: "a", trialId: "t", file: "/trials/google/a/t.jpg", grade: { hasText: true, clutter: 2 } },
      { styleId: "a", trialId: "u", file: "/trials/google/a/u.jpg" },
      { styleId: 3, trialId: "bad", file: "x" },
    ],
  });
  expect(parsed.entries).toHaveLength(2);
  expect(parsed.entries[0].grade?.hasText).toBe(true);
  expect(parsed.entries[1].grade).toBeUndefined();
});

test("the text-veto glyph has an accessible name and no sentence is rendered", () => {
  const file = "app/library/TrialMatrix.tsx";
  const src = stripComments(readFileSync(join(process.cwd(), file), "utf8"));
  expect(src.length, `${file} read nothing`).toBeGreaterThan(100);
  expect(src).toMatch(/data-flag="text"/);
  expect(src).toMatch(/aria-label="text in the plate"/);
  expect(src).toMatch(/hasText === true/);
});
