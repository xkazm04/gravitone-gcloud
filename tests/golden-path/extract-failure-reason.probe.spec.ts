// LANE — A FAILURE SAYS WHY. The Extract board drew a failed replica round, a
// failed transfer and an unreadable source as a bare FAILED wash / the word
// 'failed'; the engine's error string sat in the manifest and rendered nowhere.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const src = stripComments(readFileSync(resolve(__dirname, "../../app/foundry/ExtractBoard.tsx"), "utf8"));

/** The guard's own branch: from `marker` to the function's main `return (`. */
function branch(marker: string, fn: string): string {
  const at = src.indexOf(marker, src.indexOf(fn));
  expect(at, `no ${marker} in ExtractBoard.tsx`).toBeGreaterThan(-1);
  return src.slice(at, src.indexOf("\n  return (", at));
}

function after(marker: string, len = 520): string {
  const at = src.indexOf(marker);
  expect(at, `no ${marker} in ExtractBoard.tsx`).toBeGreaterThan(-1);
  return src.slice(at, at + len);
}

test("extract failure: a failed round renders round.error", () => {
  expect(branch("if (!round.file)", "function RoundThumb")).toContain("round.error");
});

test("extract failure: a failed transfer renders transfer.error", () => {
  expect(branch("if (!transfer.file)", "function TransferThumb")).toContain("transfer.error");
});

test("extract failure: the source wall caption renders s.error, not a bare 'failed'", () => {
  const cap = after("<figcaption", 420);
  expect(cap).toContain("s.error");
  expect(cap).not.toContain('"failed"');
});
