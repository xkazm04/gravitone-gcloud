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
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { activatesOnEnter } from "@/app/foundry/CullGrid";

import { stripComments } from "./_helpers";

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

/** The Enter case's body, whichever form it takes.
 *
 *  Slicing to the first `break;` was the obvious reading and it is wrong the
 *  moment the case opens with a guard clause — `if (activatesOnEnter(t)) break;`
 *  IS a `break;`, so the slice stopped before the preventDefault it was about to
 *  order against, and the ordering assertion then compared against -1. The very
 *  fix this probe exists to require is what defeated the parser.
 *
 *  So: brace-match when the case is a block, otherwise run to the next `case` or
 *  the end of the switch. */
function enterCaseBody(src: string, file: string): string {
  const at = src.indexOf('case "Enter"');
  expect(at, `${file}: no Enter case to read`).toBeGreaterThan(-1);
  const colon = src.indexOf(":", at);
  const rest = src.slice(colon + 1);
  const firstNonSpace = rest.search(/\S/);
  if (rest[firstNonSpace] === "{") {
    let depth = 0;
    for (let i = firstNonSpace; i < rest.length; i++) {
      if (rest[i] === "{") depth++;
      else if (rest[i] === "}" && --depth === 0) return rest.slice(firstNonSpace, i + 1);
    }
    throw new Error(`${file}: the Enter case's block is unbalanced`);
  }
  const next = rest.search(/\n\s*(case |default:|\})/);
  return next > -1 ? rest.slice(0, next) : rest;
}

test("cull keys: the rule is WIRED into every Enter case, not merely exported", () => {
  // Every assertion above passes with the guard deleted from the handler — they
  // drive the predicate, and the predicate is not where the defect lived. So the
  // one thing that cannot be checked by calling a function is checked against
  // the source: that the Enter branch consults it before preventing the default.
  //
  // AND THE POPULATION IS DERIVED, which is the half this probe was missing.
  // It named CullGrid.tsx. ExtractBoard.tsx — the Extract tab's board, same
  // shape, `<section onClick>` rows, a window keydown, `case "Enter"` with a
  // preventDefault — never called the predicate at all, and this probe was
  // green throughout: it was reading the implementation it already knew about
  // instead of the ground truth. Measured 2026-09-05: 1 of 2 window-level Enter
  // handlers under app/foundry consulted the rule. The twelve buttons live
  // beside that board (Resume / Pause / Retry, the run list, "+ new
  // extraction", the tab strip, Commit) all stopped answering Enter after one
  // row click, exactly as CullGrid's own comment describes for the grid.
  //
  // So: find every module that binds a keydown AND has an Enter case, and hold
  // all of them to it. A third surface is covered by existing.
  //
  // COMMENTS ARE STRIPPED FIRST. The block above each Enter case names
  // `activatesOnEnter` in prose, so a matcher over raw text is satisfied by a
  // file that TALKS about the rule and does not call it — the exact shape this
  // repo has already been caught by twice.
  const dir = resolve(__dirname, "../../app/foundry");
  const files = readdirSync(dir).filter((f) => /\.tsx$/.test(f));
  expect(files.length, "the app/foundry walk found nothing — wrong tree").toBeGreaterThan(3);

  const handlers: string[] = [];
  for (const f of files) {
    const src = stripComments(readFileSync(join(dir, f), "utf8"));
    if (!/addEventListener\("keydown"/.test(src) || !src.includes('case "Enter"')) continue;
    handlers.push(f);

    const body = enterCaseBody(src, f);
    const guard = body.indexOf("activatesOnEnter");
    const prevent = body.indexOf("preventDefault");
    expect(guard, `${f}: the Enter case does not call activatesOnEnter`).toBeGreaterThan(-1);
    // preventDefault must still be THERE — an Enter case that never takes the
    // key is not this rule being honoured, it is the feature being deleted, and
    // an ordering assertion over two -1s would call that a pass.
    expect(prevent, `${f}: the Enter case no longer prevents the default at all`).toBeGreaterThan(-1);
    // And it consults the rule BEFORE taking the key from the focused element.
    expect(guard, `${f}: activatesOnEnter is consulted after preventDefault`).toBeLessThan(prevent);
  }

  console.log(`[cull-keys] window-level Enter handlers under app/foundry: ${handlers.join(", ")}`);
  // Both known surfaces must still be IN the population — a rename that drops
  // one out would leave the loop above vacuously green over what remains.
  expect(handlers.sort()).toEqual(["CullGrid.tsx", "ExtractBoard.tsx"]);
});
