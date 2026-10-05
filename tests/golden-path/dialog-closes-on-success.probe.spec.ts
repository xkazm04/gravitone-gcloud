// LANE — A DIALOG DOES NOT CLOSE OVER A WRITE THAT FAILED (source ratchet).
//
// /projects has two write dialogs and, until this round, one rule between them.
//
// `ConfirmDelete` awaits `remove`, closes only on a truthy answer, and states
// the principle in its own comment: "closing a confirmation over work that was
// not done is the same small lie as a button that does nothing."
//
// `ProjectDialog` — the create/edit dialog, twenty lines up in the same file —
// closed FIRST and wrote afterwards. Both writers resolve to null on failure
// and raise the shelf's error banner, so the answer was available and only one
// of the two read it. A quota or blocked-tab failure closed the dialog,
// discarded everything the user had typed, and left a banner explaining a loss
// that had already happened. On a repo whose step store calls quota "a real
// destination and not a theoretical one" (stepStore.ts), that is the reachable
// case, not the theoretical one.
//
// WHY A SOURCE RATCHET. The decision lives in a closure over three hooks; the
// probe lane has no DOM, and forcing an IndexedDB quota failure in the live lane
// to watch a dialog stay open is a large apparatus for a small rule. What
// actually decays is the ORDER — a later edit that moves the close back above
// the await — and order is source-shaped.

import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

/** Comments stripped: this view explains the ordering rule in prose directly
 *  above the code that implements it, so a matcher over raw text is satisfied
 *  by a file that TALKS about closing on success and does not. */
const code = (p: string) => stripComments(readFileSync(p, "utf8"));

const VIEW = "app/projects/ProjectsView.tsx";
const DIALOG = "app/_projects/ProjectDialog.tsx";

/** The body of a named arrow function, to its closing `};` at column 2. */
function body(src: string, decl: string): string {
  const i = src.indexOf(decl);
  expect(i, `${decl} not found — this probe is matching the wrong shape`).toBeGreaterThan(-1);
  const end = src.indexOf("\n  };", i);
  expect(end, `could not find the end of ${decl}`).toBeGreaterThan(i);
  return src.slice(i, end);
}

test("the create/edit dialog is not closed before the write is answered", () => {
  const submit = body(code(VIEW), "const submit = async (draft");

  const firstAwait = submit.indexOf("await");
  const firstClose = submit.indexOf("setDialog({ open: false");

  expect(firstAwait, "submit no longer awaits its write").toBeGreaterThan(-1);
  expect(firstClose, "submit never closes the dialog").toBeGreaterThan(-1);
  expect(
    firstClose,
    "the dialog is closed BEFORE the write is awaited, so a failed save discards the user's draft " +
      "and the banner explains a loss that already happened. Close on the answer, the way ConfirmDelete does.",
  ).toBeGreaterThan(firstAwait);
});

test("both writers' answers are actually read, not awaited and dropped", () => {
  const submit = body(code(VIEW), "const submit = async (draft");
  // `await update(...)` on its own line is the shape the bug had: the answer
  // arrives and nothing looks at it.
  expect(submit, "the edit path drops update()'s answer").toMatch(/=\s*await update\(/);
  expect(submit, "the create path drops create()'s answer").toMatch(/=\s*await create\(/);
});

test("the delete flow it was measured against still holds the rule", () => {
  // The exemplar. If this ever regresses, the case above is comparing against
  // nothing and the file's argument has lost its footing.
  const view = code(VIEW);
  expect(view).toMatch(/=\s*await remove\(/);
  expect(view, "ConfirmDelete no longer gates its close on the answer").toMatch(
    /if \(took\) setDoomed\(null\)/,
  );
});

test("holding the dialog open does not buy a double submit", () => {
  // Awaiting opens a window the close-first version did not have: without a
  // busy flag a slow write takes two presses and makes two projects. The fix
  // for one defect must not be the other.
  const dialog = code(DIALOG);
  expect(dialog, "the dialog does not track an in-flight submit").toContain("setBusy(");
  expect(dialog, "the submit control is not disabled while a write is in flight").toMatch(
    /disabled=\{!valid \|\| busy\}/,
  );
  expect(dialog, "submit does not await the caller, so busy would clear immediately").toMatch(
    /await onSubmit\(/,
  );
});

test("a failed write is rendered inside the dialog, not under its scrim", () => {
  // The shelf's rose banner lives in <main>; Modal paints a fixed 80%-ink
  // blurred layer over it, so a sighted user saw the button return to idle and
  // nothing else. Each dialog takes the machine's own message and draws it in
  // its footer.
  const dialog = code(DIALOG);
  const footers = dialog.match(/footer=\{[\s\S]*?\n {6}\}/g) ?? [];
  expect(footers.length, "expected the footers of ProjectDialog and ConfirmDelete").toBe(2);
  for (const f of footers) {
    expect(f, "a dialog footer does not render its `error`").toMatch(/\{error\b/);
  }
  expect(dialog.match(/^ {2}error,\r?$/gm)?.length, "both dialogs must accept an `error` prop").toBe(2);

  const view = code(VIEW);
  expect(view, "the view does not track whether a dialog write failed").toContain("setWriteFailed(");
  expect(view.match(/error=\{writeFailed \? error : null\}/g)?.length, "both dialogs get the error only after a failed write").toBe(2);
});

test("ConfirmDelete latches while the delete is in flight", () => {
  const dialog = code(DIALOG);
  const del = dialog.slice(dialog.indexOf("export function ConfirmDelete"));
  expect(del, "ConfirmDelete does not track an in-flight delete").toContain("setBusy(");
  expect(del, "Delete is not disabled while the delete runs").toMatch(/disabled=\{!holds \|\| busy\}/);
  expect(del, "the confirm does not await the caller").toMatch(/await onConfirm\(/);
});
