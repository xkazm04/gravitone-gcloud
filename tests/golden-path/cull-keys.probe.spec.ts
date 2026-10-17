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
// `enterBelongsToTarget` (components/ui/signal/keymap.ts) is the rule, exported so this drives the real predicate
// rather than a copy of it. Enter is delivered to the focused element itself, so
// the check is by tag and by role — no ancestor walk to reproduce here.
import { test, expect } from "@playwright/test";

import { enterBelongsToTarget as activatesOnEnter } from "@/components/ui/signal/keymap";

import { callsTo, lineOf, sourceFile, switchCase } from "./_ast";

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

test("cull keys: the rule is WIRED into every Enter case, not merely exported", () => {
  // Every assertion above passes with the guard deleted from the handler - they
  // drive the predicate, and the predicate is not where the defect lived. So the
  // one thing that cannot be checked by calling a function is checked against
  // the source: that the Enter branch consults it before preventing the default.
  //
  // AND THE POPULATION IS DERIVED, which is the half this probe was missing.
  // It named CullGrid.tsx. ExtractBoard.tsx - the Extract tab's board, same
  // shape, `<section onClick>` rows, a window keydown, `case "Enter"` with a
  // preventDefault - never called the predicate at all, and this probe was
  // green throughout: it was reading the implementation it already knew about
  // instead of the ground truth. Measured 2026-09-05: 1 of 2 window-level Enter
  // handlers under app/foundry consulted the rule. The twelve buttons live
  // beside that board (Resume / Pause / Retry, the run list, "+ new
  // extraction", the tab strip, Commit) all stopped answering Enter after one
  // row click, exactly as CullGrid's own comment describes for the grid.
  //
  // So the population is every module under app/ and components/ that registers
  // a "keydown" listener AND has an Enter case, and all of them are held to it.
  // A third surface is covered by existing - and now so is a surface outside
  // app/foundry.
  //
  // THIS READS THE PROGRAM, NOT THE TEXT (./_ast). A comment above an Enter case
  // names `activatesOnEnter` in prose, and a text matcher is satisfied by a file
  // that TALKS about the rule and does not call it; here a comment is not a
  // node. It also sees EVERY switch with an Enter case in the file (the text
  // version read the first and never knew about a second), and the brace-matching
  // `enterCaseBody` that a guard clause's own `break;` once defeated is gone:
  // a case clause's statements are a list, not a slice of characters.
  const listeners = callsTo("addEventListener", ["app", "components"]).filter((c) => c.arg0 === "keydown");
  // The floor was five while v1's surfaces bound window keys; /foundry and /playground took seven
  // of them in Phase 6 wave C, and the new world binds through the @gt/ui keymap's one dispatcher.
  // What still listens (the dev inspector among it, which every lot keeps) proves the walk read
  // the tree; a walk that found none would be reading the wrong one.
  expect(listeners.length, "no keydown listeners found under app/ and components/ - the walk is reading the wrong tree").toBeGreaterThan(0);

  const handlers: string[] = [];
  for (const f of [...new Set(listeners.map((c) => c.file))].sort()) {
    const enters = switchCase(sourceFile(f), "Enter");
    if (enters.length === 0) continue;
    handlers.push(f);

    for (const clause of enters) {
      const at = `${f}:${lineOf(clause)}`;
      const guard = callsTo("enterBelongsToTarget", clause)[0];
      const prevent = callsTo("preventDefault", clause)[0];
      expect(guard, `${at}: the Enter case does not call enterBelongsToTarget`).toBeDefined();
      // preventDefault must still be THERE - an Enter case that never takes the
      // key is not this rule being honoured, it is the feature being deleted, and
      // an ordering assertion over two absences would call that a pass.
      expect(prevent, `${at}: the Enter case no longer prevents the default at all`).toBeDefined();
      // And it consults the rule BEFORE taking the key from the focused element.
      expect(guard.node.getStart(), `${at}: enterBelongsToTarget is consulted after preventDefault`).toBeLessThan(
        prevent.node.getStart(),
      );
    }
  }

  console.log(`[cull-keys] window-level Enter handlers: ${handlers.join(", ")}`);
  // The known surfaces must still be IN the population - a rename that drops one
  // out would leave the loop above vacuously green over what remains.
  // ExtractBoard.tsx and StripGrid.tsx were the last two (their tabs retired in
  // Phase 3; the Board binds through the @gt/ui keymap, which applies the rule to
  // every binding). An empty population is the end state, and a new window-level
  // Enter handler must answer to the loop above.
  expect(handlers.sort()).toEqual([]);
});
