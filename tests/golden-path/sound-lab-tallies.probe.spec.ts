// LANE — THE RAIL'S TALLIES DESCRIBE THE KIND THE PANEL IS SHOWING (source ratchet).
//
// app/playground/PlaygroundView.tsx re-keys the tally read on a kind switch but
// useLoadFor only applies on resolution, so the previous kind's counts stayed on
// the rail until (and unless) the new read landed. The file's own rule is "a
// count the store could not answer is null and its tally is not drawn"; another
// kind's count standing in for unknown breaks it worse than a 0 would.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

test("tallies carry the kind they were read for and draw only for the current kind", () => {
  const src = stripComments(readFileSync(join(__dirname, "..", "..", "app/playground/PlaygroundView.tsx"), "utf8"));
  expect(src.length, "read nothing").toBeGreaterThan(0);
  expect(src).toMatch(/tallies\.kind\s*===\s*kind/);
  const read = src.slice(src.indexOf("async function readTallies"), src.indexOf("export default function"));
  expect(read).toMatch(/\bkind\b\s*,?\s*\n?\s*unjudged|return\s*\{\s*kind\b/);
});
