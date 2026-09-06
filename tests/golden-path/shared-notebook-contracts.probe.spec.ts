// LANE — THE CLAIMS THE SHARED NOTEBOOK MAKES IN PROSE, MADE CHECKABLE.
//
// This context's files are unusually well documented, and that is exactly why
// this lane exists: several of the rules they state are asserted only in a
// comment, so the tree is free to drift out from under the sentence. Each test
// here takes one such claim and gives it a population walked off the
// filesystem or a predicate driven directly, so the claim fails when it stops
// being true rather than when somebody re-reads the paragraph.
//
// What is NOT here: anything the notebook graph already checks
// (notebook-graph.probe.spec.ts) or the source-migration ratchets already
// count (notebook-source-ladder / -population).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

import { NOTEBOOK } from "@/app/_phases/_shared/notebook/notebook";
import { railFor, SECTION_IDS } from "@/app/_phases/_shared/notebook/NotebookBody";
import { CONDITIONAL_SECTIONS, sectionRenders } from "@/app/_phases/_shared/notebook/sections/H";
import type { Notebook } from "@/app/_phases/_shared/notebook/types";

const ROOT = resolve(__dirname, "../..");

/* ── 1 · a rail pill jumps to a section that rendered ───────────────────────── */

test("rail: every pill the rail draws is a section that actually renders", () => {
  // The shipped fixture: all thirteen render, so all thirteen are offered.
  const drawn = railFor(NOTEBOOK).map(([id]) => id);
  console.log(`[rail] shipped fixture -> ${drawn.length} of ${SECTION_IDS.length} pill(s)`);
  expect(drawn.length).toBe(SECTION_IDS.length);
  expect(SECTION_IDS.length).toBeGreaterThan(10);
});

test("rail: a notebook with no counter-positions and no questions offers neither pill", () => {
  // THE STATE THE PILLS WERE DEAD IN. Both sections render behind a `length > 0`
  // of their own; the rail listed them unconditionally. `jump()` returns before
  // `setAt` when the element is absent, so the pill moved nothing, focused
  // nothing and set no `aria-current` — a control that does nothing and does
  // not say so.
  const empty: Notebook = { ...NOTEBOOK, counterPositions: [], candidateQuestions: [] };
  expect(sectionRenders(empty, "counters"), "the counters section renders for an empty list").toBe(false);
  expect(sectionRenders(empty, "questions"), "the questions section renders for an empty list").toBe(false);

  const drawn = railFor(empty).map(([id]) => id);
  console.log(`[rail] empty counters+questions -> ${drawn.length} pill(s): ${drawn.join(" ")}`);
  expect(drawn).not.toContain("counters");
  expect(drawn).not.toContain("questions");
  // ...and nothing else was lost with them.
  expect(drawn.length).toBe(SECTION_IDS.length - 2);
});

test("rail: the rail builds itself through railFor, never over the raw list", () => {
  // THE VACUITY THIS CLOSES, found by seeding: the two tests above drive
  // `railFor`, so reverting the COMPONENT to `SECTIONS.map(...)` left them
  // green — the predicate was asserted and its adoption was not. Both halves
  // are needed, and this is the half a probe cannot get from a Node lane with
  // no DOM. Same idiom as announcement.probe.spec.ts's structural checks.
  const src = stripComments(readFileSync(join(ROOT, "app/_phases/_shared/notebook/NotebookBody.tsx"), "utf8"));
  expect(/\{\s*railFor\(n\)\.map\(/.test(src), "the rail no longer maps over railFor(n)").toBe(true);
  // Everything except railFor's own body, which is the one place SECTIONS may
  // legitimately be read.
  const outsideRailFor = src.replace(/export function railFor[\s\S]*?\n\}/, "");
  expect(
    /\{\s*SECTIONS\s*\.\s*(filter|map)\(/.test(outsideRailFor),
    "the rail maps over SECTIONS directly again - a pill would be drawn for a section that does not render",
  ).toBe(false);
});

test("rail: every conditional predicate names a section the rail actually offers", () => {
  // A predicate for a section that is not in the rail is dead code that reads
  // as a live rule — the stale-tag failure, one layer up.
  for (const id of Object.keys(CONDITIONAL_SECTIONS))
    expect(SECTION_IDS, `${id} has a render predicate and no rail pill`).toContain(id);
});

test("rail: no section file still carries its own copy of a condition", () => {
  // THE PAIR THIS CLOSES. The condition existed twice — once in the rail, once
  // in the section — and only the section's copy was true. A third copy would
  // do it again, so the sections are read for the shape the predicate replaced.
  for (const file of ["sections/Argument.tsx", "sections/Apparatus.tsx"]) {
    const src = stripComments(readFileSync(join(ROOT, "app/_phases/_shared/notebook", file), "utf8"));
    for (const field of ["counterPositions", "candidateQuestions"])
      expect(
        new RegExp(`n\\.${field}\\.length\\s*>\\s*0\\s*&&`).test(src),
        `${file} guards a whole section on \`${field}.length > 0\` again — use sectionRenders() so the rail agrees`,
      ).toBe(false);
  }
});
