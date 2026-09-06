// LANE — THE /api/foundry CLIENT RULE IS DEFINED ONCE (dynamic).
//
// This directory has already paid for the other habit, in writing. ExtractView's
// own docstring says of its stale-response defect: "Identical defect and
// identical fix to app/foundry/FoundryView.tsx — this file is the newer copy of
// that one (`1e4c8e2`), so the hole was propagated forward rather than
// inherited." A file copied forward carries its holes forward, and both then
// have to be found twice.
//
// extractClient.ts held a byte-identical copy of foundryClient.ts's `call<T>`:
// the access header, a network failure turned into status 0, the route's
// `detail` preferred over an HTTP number. Nothing was wrong with either copy —
// that is the point. A timeout, a 401 re-auth or a retry added to one would
// have reached the Cull tab and silently missed the Extract tab, and no test
// in this repository could have said so.
//
// So the rule is stated once and imported. This probe holds that line, and it
// walks app/foundry off the filesystem rather than naming the two files: a
// THIRD client, written next month, is exactly the case a hand-written list
// would not cover.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

// Comments stripped before any matcher runs — through the shared scanner, NOT
// the two-`replace` pair the older ratchets each carry privately. That pair
// reads a route glob inside a LINE comment as opening a block and eats every
// line to the next block terminator: it hid 72% of extractClient.ts, including
// the import this file asserts on, which is how this very probe first passed
// vacuously against a seeded defect. See _helpers.ts.
const code = stripComments;

/** Every client module under app/foundry — walked, never listed. */
function clients(): string[] {
  const dir = join(process.cwd(), "app", "foundry");
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => relative(process.cwd(), join(dir, e.name)).split("\\").join("/"));
}

test("exactly one module under app/foundry defines the request rule", () => {
  const files = clients();
  expect(files.length, "the walk found nothing — it is reading the wrong tree").toBeGreaterThan(5);

  const definers: string[] = [];
  const fetchers: string[] = [];
  for (const rel of files) {
    const src = code(readFileSync(join(process.cwd(), rel), "utf8"));
    if (/\bfunction call<T>\s*\(/.test(src)) definers.push(rel);
    // A surface that reaches /api/foundry through a bare fetch has stepped
    // around the rule entirely, which is the same defect by another door.
    if (/\bfetch\(\s*[`"']\/api\/foundry/.test(src)) fetchers.push(rel);
  }

  console.log(`[one-rule] definers=${JSON.stringify(definers)} bare-fetchers=${JSON.stringify(fetchers)}`);
  expect(definers, "the request rule must be defined in exactly one module and imported").toEqual([
    "app/foundry/foundryClient.ts",
  ]);
  expect(fetchers, "these reach /api/foundry with a bare fetch, around the shared rule").toEqual([]);
});

test("the extract client imports that rule rather than restating it", () => {
  const src = code(readFileSync(join(process.cwd(), "app/foundry/extractClient.ts"), "utf8"));
  expect(src.length, "extractClient.ts read as empty").toBeGreaterThan(500);
  expect(/import \{[^}]*\bcall\b[^}]*\} from "\.\/foundryClient"/.test(src)).toBe(true);
  // And it still does the work it exists for, so this cannot pass on an empty file.
  expect(/export const fetchExtractRuns/.test(src)).toBe(true);
  expect(/export async function prepareUpload/.test(src)).toBe(true);
});
