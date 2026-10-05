// SOURCE RATCHET — the sticky pad answers a note-handle click on every pad state.
//
// A collapsed pad used to swallow the click (composer lived inside `open &&`),
// hide a running recalibration / staged candidate, and reuse one composer
// instance (and its draft) across cards.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const src = stripComments(
  readFileSync(join(process.cwd(), "app/_phases/script/_notes/StickyNotebook.tsx"), "utf8"),
);

test("the sticky pad source was read", () => {
  expect(src.length).toBeGreaterThan(500);
});

test("the composer is keyed by the active card so a draft cannot cross cards", () => {
  expect(/<NoteComposer[^>]*\bkey=\{ctx\.active\}/.test(src)).toBe(true);
});

test("an active card opens a collapsed pad", () => {
  expect(/if\s*\(active\)\s*setOpen\(true\)/.test(src)).toBe(true);
});

test("the collapsed header carries running and candidate state", () => {
  const header = src.slice(src.indexOf('data-testid="pad-toggle"'), src.indexOf("{open && ("));
  expect(header).toContain("api.running");
  expect(header).toContain("api.candidate");
  expect(header).toContain("<Tally");
});
