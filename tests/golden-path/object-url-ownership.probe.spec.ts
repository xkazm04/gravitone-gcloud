// LANE — A BLOB URL HAS AN OWNER, AND THE OWNER RELEASES IT (dynamic).
//
// lib/musicClient.ts's `blobUrl` carries the contract in its own docstring:
// "Caller revokes when done." Measured 2026-08-27: `URL.revokeObjectURL`
// appeared NOWHERE in this repository. A written contract with zero adherence is
// worse than an unwritten one, because the reader of the docstring believes it.
//
// The cost is real and it lands on the surfaces built to make many renders: each
// url holds a multi-megabyte decoded audio blob for the lifetime of the document.
//
// This is a RATCHET rather than a pass/fail sweep. The two remaining callers are
// listed with their reasons, so the debt is visible and bounded; what fails is a
// NEW caller that allocates and never releases. The population is walked off the
// filesystem rather than listed, for the reason the auth probe next door now
// documents at length: a hand-written population describes the repo on the day
// it was typed.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { test, expect } from "@playwright/test";

/** Callers that allocate an object URL and do not yet release it, each with the
 *  reason it is still here. An entry is a claim somebody defends in review. */
const KNOWN_LEAKS: Record<string, string> = {
  "app/_phases/score/ScoreSpotting.tsx":
    "one url per cue take, held for the tab; the file's own comment says a take 'lives as long as the tab' and IndexedDB is the next seam, so the fix belongs with that change rather than ahead of it",
};

/** Source with comments removed, so prose about the rule cannot satisfy it. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Every source file under app/ and lib/. */
function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) out.push(relative(process.cwd(), full).split("\\").join("/"));
    }
  };
  walk(join(process.cwd(), "app"));
  walk(join(process.cwd(), "lib"));
  return out;
}

test("every caller that MINTS an object URL also releases it", () => {
  const files = sources();
  // A walk that reads nothing reports "no leaks" in a voice indistinguishable
  // from success. Prove it read the tree before trusting the verdict.
  expect(files.length, "the source walk found nothing - it is reading the wrong tree").toBeGreaterThan(50);

  const minting: string[] = [];
  const leaking: string[] = [];
  for (const rel of files) {
    // COMMENTS ARE STRIPPED FIRST, and that is not tidiness. These very files
    // explain the contract in prose, so a matcher run over the raw text is
    // satisfied by a file that TALKS about revoking and never does — measured:
    // the first version of this probe passed against a deliberately broken
    // PlaygroundView because the word survived in the comment describing the
    // fix. A gate a comment can satisfy is a gate.
    const src = code(readFileSync(join(process.cwd(), rel), "utf8"));
    // The FACTORY itself is where the contract is written, not a caller of it.
    if (/export function (blobUrl|audioUrl)\b/.test(src)) continue;
    if (!/\b(blobUrl|audioUrl)\s*\(/.test(src)) continue;
    minting.push(rel);
    if (!/revokeObjectURL/.test(src)) leaking.push(rel);
  }

  console.log(`[urls] ${minting.length} caller(s) mint an object URL: ${minting.join(", ")}`);
  console.log(`[urls] ${leaking.length} do not release: ${leaking.join(", ") || "none"}`);

  // The probe is pointless if nothing mints one — that would mean the matcher
  // stopped seeing the call, not that the repo stopped making them.
  expect(minting.length, "no caller mints an object URL - the matcher is broken").toBeGreaterThan(0);

  const unexplained = leaking.filter((f) => !KNOWN_LEAKS[f]);
  expect(unexplained, "these mint an object URL and never revoke it").toEqual([]);
});

test("every known-leak exemption still describes a file that actually leaks", () => {
  // A stale exemption reads as a considered decision and is really a path that
  // moved or a debt somebody already paid. Both directions fail.
  for (const [rel, why] of Object.entries(KNOWN_LEAKS)) {
    expect(why.length, `${rel} is exempted with no reason`).toBeGreaterThan(20);
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    expect(/\b(blobUrl|audioUrl)\s*\(/.test(src), `${rel} no longer mints a url - drop the exemption`).toBe(true);
    expect(
      /revokeObjectURL/.test(src),
      `${rel} now revokes - drop the exemption rather than leaving it claiming a leak`,
    ).toBe(false);
  }
});
