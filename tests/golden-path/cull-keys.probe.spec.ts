// LANE — WHOSE KEY IS IT: the cull grid vs the focused element (dynamic).
//
// The /foundry cull binds its keys on `window`, and for arrows and K/X/U that is
// the right call: a cull is hundreds of decisions and the hand should not have to
// keep the browser's focus anywhere in particular.
//
// Enter is the exception, and it was taken anyway. Nothing in the grid is
// focusable — a tile is a `<div onClick>`, no tabIndex, no role — so the
// browser's focus is always on something ELSE while a candidate is "focused" in
// app state, and `focused` becomes non-null on the first tile click anyone makes.
// The handler then called `preventDefault()` on Enter, which is exactly what
// suppresses a `<button>`'s Enter activation. After one click on one tile, Enter
// stopped working on the row K/X buttons, the run list, the tab strip and Commit,
// and opened the lightbox instead. Space still worked.
//
// `activatesOnEnter` is the rule, exported so this drives the real predicate
// rather than a copy of it. Enter is delivered to the focused element itself, so
// the check is by tag and by role — no ancestor walk to reproduce here.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { activatesOnEnter } from "@/app/foundry/CullGrid";

const el = (tagName: string, role?: string) => ({
  tagName,
  getAttribute: (n: string) => (n === "role" && role ? role : null),
});

test("cull keys: Enter belongs to a focused element that activates on it", () => {
  // The four that were broken on the page, by tag.
  for (const tag of ["BUTTON", "A", "SUMMARY", "SELECT"]) {
    expect(activatesOnEnter(el(tag)), `${tag} activates on Enter`).toBe(true);
  }
  // Text entry: Enter is the caller's, and these were already excluded upstream
  // by the typing guard — named here too so the rule is complete on its own.
  expect(activatesOnEnter(el("INPUT"))).toBe(true);
  expect(activatesOnEnter(el("TEXTAREA"))).toBe(true);
});

test("cull keys: a custom control claims Enter through its role, not its tag", () => {
  expect(activatesOnEnter(el("DIV", "button"))).toBe(true);
  expect(activatesOnEnter(el("SPAN", "link"))).toBe(true);
  expect(activatesOnEnter(el("LI", "menuitem"))).toBe(true);
  expect(activatesOnEnter(el("DIV", "tab"))).toBe(true);
});

test("cull keys: Enter over the page itself is the GRID's — the lightbox must still open", () => {
  // The whole point of the surface. If this ever returns true, Enter stops
  // opening the comparison and the keyboard cull loses its one non-verdict key.
  expect(activatesOnEnter(el("BODY"))).toBe(false);
  expect(activatesOnEnter(el("DIV"))).toBe(false);
  expect(activatesOnEnter(el("IMG"))).toBe(false);
  expect(activatesOnEnter(el("SECTION"))).toBe(false);
  // A div carrying a role that is not activated by Enter stays the grid's.
  expect(activatesOnEnter(el("DIV", "presentation"))).toBe(false);
  expect(activatesOnEnter(el("DIV", "gridcell"))).toBe(false);
  // No target at all (a synthetic event, or focus on the document).
  expect(activatesOnEnter(null)).toBe(false);
});

test("cull keys: an element with no getAttribute is handled, not thrown over", () => {
  // The handler receives `e.target as HTMLElement | null`, and a probe or a
  // non-element target has no getAttribute. Answering "not mine" is right.
  expect(activatesOnEnter({ tagName: "DIV" })).toBe(false);
  expect(activatesOnEnter({})).toBe(false);
});

test("cull keys: the rule is WIRED into the Enter case, not merely exported", () => {
  // Every assertion above passes with the guard deleted from the handler — they
  // drive the predicate, and the predicate is not where the defect lived. So the
  // one thing that cannot be checked by calling a function is checked against
  // the source: that the Enter branch consults it before preventing the default.
  //
  // COMMENTS ARE STRIPPED FIRST. The block above the Enter case names
  // `activatesOnEnter` in prose, so a matcher over raw text is satisfied by a
  // file that TALKS about the rule and does not call it — which is the exact
  // shape this repo has already been caught by twice.
  const src = readFileSync(resolve(__dirname, "../../app/foundry/CullGrid.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  const enterCase = src.slice(src.indexOf('case "Enter":'));
  const body = enterCase.slice(0, enterCase.indexOf("break;"));
  expect(body, 'the Enter case does not call activatesOnEnter').toMatch(/activatesOnEnter\s*\(/);
  // And it consults it BEFORE taking the key away from the focused element.
  expect(body.indexOf("activatesOnEnter")).toBeLessThan(body.indexOf("preventDefault"));
});
