// LANE — THE KIT DROPZONE IS REACHABLE BY KEYBOARD (static ratchet).
//
// It was a `<div onClick>` with no role, tabIndex or key handler wrapping a
// `hidden` input: on the music-video Research step — whose only act is the
// attach — a keyboard or switch user had no way to reach the picker, and
// `aria-label` on a generic div is ignored by most AT.
import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

test("Dropzone is a focusable named button that Enter/Space activates", () => {
  const src = stripComments(readFileSync("components/kit/Dropzone.tsx", "utf8"));
  expect(src.length).toBeGreaterThan(0);
  expect(src).toMatch(/role="button"/);
  expect(src).toMatch(/tabIndex=\{0\}/);
  expect(src).toMatch(/onKeyDown=/);
  expect(src).toMatch(/e\.key === "Enter"/);
  expect(src).toMatch(/e\.key === " "/);
  const css = readFileSync("components/kit/kit.css", "utf8");
  expect(css).toMatch(/\.k-drop:focus-visible\s*\{[^}]*outline/);
});
