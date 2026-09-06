// LANE — NO PROBE CARRIES THE COMMENT STRIPPER THAT BLINDS ITSELF (source ratchet).
//
// Every source-reading probe in this directory strips comments before it
// matches, because the files it reads explain each rule in prose directly
// above the code. `stripComments` in _helpers.ts exists because the pair those
// probes each carried privately —
//
//     .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
//
// — strips BLOCK comments first, so a block-open sequence sitting inside a LINE
// comment really opens a block, and this repo's prose is full of route globs
// written exactly that way (/api/foundry/ + star). The phantom block runs to
// the next genuine terminator and takes the code between with it. Measured
// 2026-09-05 over app/ and lib/: 14 files lose a contiguous region, up to 80%
// of lib/imaging/api.ts. Code inside such a region is invisible to the probe,
// and invisible code reads as a clean codebase in a voice indistinguishable
// from success — or, for a probe that asserts a guard is PRESENT, as a red
// verdict against a route that is gated.
//
// The helper landed on 2026-09-05 with a note that adopting it elsewhere was a
// backlog card. Measured 2026-09-06: 5 probes used it and 15 still carried the
// pair. This is the ratchet that stops the 15 becoming 16: the population is
// walked off the filesystem, comments are stripped first (this file quotes the
// pair in prose, so a raw-text match would report itself), and the remaining
// carriers are LISTED, each an obligation rather than an omission nobody sees.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

/** Probes that still carry a private stripper, to be migrated as they are next
 *  touched. Drop a line here when its file adopts `stripComments`; the second
 *  test refuses a line that describes a file which no longer needs it. */
const STILL_CARRY: readonly string[] = [
  "alt-last-one-stays.probe.spec.ts",
  "cards-carry-evidence-class.probe.spec.ts",
  "chain-break-reaches-the-reviewer.probe.spec.ts",
  "chrome-colour-literals.probe.spec.ts",
  "cli-exit-classification.probe.spec.ts",
  "dialog-closes-on-success.probe.spec.ts",
  "imaging-reference-roles.probe.spec.ts",
  "step-clear-completeness.probe.spec.ts",
  "text-log-line.probe.spec.ts",
  "theme-ratchet.probe.spec.ts",
];

/** The shape that is unsound: a `.replace(` whose pattern opens with the block
 *  comment delimiter. Any order of the two calls is caught — swapping them
 *  trades one blind spot for another (a block comment containing a line
 *  comment then keeps its terminator), which _helpers.ts explains. */
const PRIVATE_PAIR = /\.replace\(\s*\/\\\/\\\*/;

const DIR = join(process.cwd(), "tests", "golden-path");
const probes = () => readdirSync(DIR).filter((f) => f.endsWith(".spec.ts")).sort();
const carries = (f: string) => PRIVATE_PAIR.test(stripComments(readFileSync(join(DIR, f), "utf8")));

test("no probe outside the listed residue strips comments with the block-first pair", () => {
  const files = probes();
  // A walk that reads nothing reports "all migrated" in a voice
  // indistinguishable from success.
  expect(files.length, "the probe walk found nothing - it is reading the wrong tree").toBeGreaterThan(20);

  const carriers = files.filter(carries);
  const unexplained = carriers.filter((f) => !STILL_CARRY.includes(f));
  console.log(`[strip] ${files.length} probes; ${carriers.length} still carry the private pair (${STILL_CARRY.length} listed)`);
  expect(
    unexplained,
    "these probes carry the block-first comment stripper - use stripComments from ./_helpers instead",
  ).toEqual([]);
});

test("every listed carrier still carries it - a paid debt leaves the list", () => {
  for (const f of STILL_CARRY) {
    expect(carries(f), `${f} no longer carries the private pair - drop it from STILL_CARRY`).toBe(true);
  }
});

test("the matcher sees the pair through the prose that quotes it", () => {
  // This very file quotes the pair in its header comment and must NOT be
  // reported as a carrier; a file whose CODE has it must be. Both directions,
  // so a matcher that stopped matching and one that matches prose are each
  // caught here rather than read as a migrated suite.
  expect(carries("comment-strip-ratchet.probe.spec.ts")).toBe(false);
  const seeded = 'const code = (s: string) => s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, "");';
  expect(PRIVATE_PAIR.test(stripComments(seeded))).toBe(true);
});
