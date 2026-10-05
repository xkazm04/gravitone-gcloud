// LANE — THE ASSET DRAWER IS A DIALOG (source ratchet).
//
// The drawer covers the page (fixed inset-0 z-50) so it owes the same overlay
// guarantees components/ui/Modal.tsx gives: dialog role, modal, a name, focus in
// and held, focus handed back, and a scrim that is not a focusable control.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const FILE = "app/_studio/AssetDrawer.tsx";
const src = stripComments(readFileSync(join(process.cwd(), FILE), "utf8"));

test("the drawer read something", () => {
  expect(src.length, "AssetDrawer source is empty - wrong path").toBeGreaterThan(500);
});

test("the panel is a named modal dialog", () => {
  expect(src).toMatch(/role="dialog"/);
  expect(src).toMatch(/aria-modal="true"/);
  expect(src).toMatch(/aria-labelledby=\{\s*titleId\s*\}/);
  expect(src).toMatch(/<h3[^>]*\bid=\{\s*titleId\s*\}/);
});

test("the scrim is an aria-hidden div, not a focusable button", () => {
  expect(src, "a button scrim is a full-viewport tab stop").not.toMatch(/<button[^>]*absolute inset-0/);
  expect(src).toMatch(/<div[^>]*aria-hidden="true"[^>]*absolute inset-0|<div[^>]*absolute inset-0[^>]*aria-hidden="true"/);
});

test("focus moves in, is trapped, and is restored", () => {
  expect(src, "no focus() call").toMatch(/\.focus\(/);
  expect(src, "no Tab trap").toMatch(/"Tab"/);
  expect(src, "no restore of the opener").toMatch(/document\.activeElement/);
  expect(src, "no fallback to <main>").toMatch(/querySelector\("main"\)/);
});
