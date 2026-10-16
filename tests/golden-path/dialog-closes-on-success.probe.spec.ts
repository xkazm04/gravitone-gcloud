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
// RETIRED WITH THE SHELF (Phase 4 wave D). `ProjectDialog`, `ConfirmDelete` and
// the view that hosted them are gone; a project is composed from a recipe now
// and Compose guards its own submit (app/(studio)/projects/_plan/compose.tsx).
// What stays is the counting read the delete confirm gated on: a v1 project's
// contents are still read (the import and the account export walk them), and a
// read that swallows its failure into "nothing here" is the same lie anywhere.

import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

/** Comments stripped: the module explains its rule in prose directly above the
 *  code, so a matcher over raw text is satisfied by a file that only TALKS. */
const code = (p: string) => stripComments(readFileSync(p, "utf8"));

test("a delete confirm that could not count says so, and does not say zero", () => {
  // projectContents swallowed every failure into EMPTY_CONTENTS, so an unreadable
  // store rendered "No saved steps." with an enabled Delete, and the cascade that
  // followed removed the frames the dialog had just denied. The dialog retired
  // with the v1 shelf (Phase 4 wave D); the counting read it gated on stays.
  const lib = code("lib/projects.ts");
  const from = lib.indexOf("export async function readProjectContents");
  expect(from, "readProjectContents not found").toBeGreaterThan(-1);
  const readBody = lib.slice(from, lib.indexOf("export async function projectContents", from));
  expect(readBody, "the counting read swallows its failure into EMPTY_CONTENTS").not.toMatch(
    /catch[\s\S]*EMPTY_CONTENTS/,
  );
});
