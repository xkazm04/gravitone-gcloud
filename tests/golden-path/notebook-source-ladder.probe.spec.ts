// LANE — THE EVIDENCE LADDER IS A MIGRATION, AND MIGRATIONS NEED A NUMBER.
//
// `types.ts` says why `EvidenceClass` and `FactSource` exist, and it is the
// sharpest sentence in the notebook: run 1's NOTES.md already wrote "require
// primary sources for load-bearing quantitative claims" after shipping an
// all-aggregator source list — "and nothing consumed it, so run 2 shipped the
// same way. A rule with no field to live in is a comment."
//
// The field now exists. Measured 2026-08-29, one round later:
//
//   sources[]  1/21     kind  1/21     unit  1/21     period  1/21
//   comma- or slash-joined `source` blobs: 10/21
//
// - all five fields carried by the same single row, `f-midtier-distribute`, the
// one the gauntlet control migration touched. Nothing counted any of it, and
// nothing detected the ANTI-SHAPE the type names in its own docstring: "a second
// source appended to `source` with a comma". So the field had become the thing it
// was invented to escape - a rule with nowhere to live, one level up.
//
// THIS IS A RATCHET, NOT A SWEEP, and the shape is the repo's own. `npm run
// lint:ratchet` freezes a warning population per rule; `object-url-ownership`
// freezes its leak map; `check-notebook.mts` keeps `conclusionIssues` advisory
// because "a check that painted the exemplar red would be switched off within a
// week, and the graph check with it". The same reasoning applies exactly here:
// the run-1 fixture is the CONTROL for every adopted edit, types.ts says so, and
// "a control you had to rewrite to compile is not a control". Failing the build
// over its twenty legacy rows would delete the control to satisfy the gate.
//
// So the baselines below are frozen at what was measured, and what fails is
// MOVEMENT IN THE WRONG DIRECTION: a new fact landing on the deprecated shape,
// or a new comma-joined blob. Completing the migration lowers the numbers, and
// lowering them fails too - loudly, with the instruction to re-freeze. A ratchet
// nobody tightens is a baseline nobody reads.

import { test, expect } from "@playwright/test";

import { FACTS } from "@/app/_phases/_shared/notebook/facts";
import type { Fact } from "@/app/_phases/_shared/notebook/types";

/** The rows still on the singular deprecated `source`, BY ID rather than by
 *  count. Frozen 2026-08-29 at 20 of 21.
 *
 *  An id list and not a number, for the reason `object-url-ownership`'s
 *  KNOWN_LEAKS map is a map: a count can only say "one more than yesterday",
 *  and the reader then has to find which one. The set difference names it. It
 *  also makes the two directions distinguishable — a row that regressed and a
 *  row that was migrated both move the count by one, and they are not the same
 *  news. */
const LEGACY_SOURCE_BASELINE = [
  "f-ath", "f-nov-crash", "f-now", "f-drawdown", "f-sbr", "f-sbr-unbuilt",
  "f-genius", "f-lth-distribution", "f-etf-lag", "f-etf-absorbed", "f-mnav",
  "f-mstr-drop", "f-mstr-sold", "f-mstr-defence", "f-correlation", "f-yields",
  "f-macro-cause", "f-supply-2pct", "f-m2-divergence", "f-whale-absorb",
];

/** Of those, the ones whose `source` string is the anti-shape types.ts names in
 *  FactSource's own docstring: more than one publication in one field. Frozen
 *  2026-08-29 at 10. */
const JOINED_BLOB_BASELINE = [
  "f-ath", "f-now", "f-sbr-unbuilt", "f-etf-lag", "f-mnav", "f-mstr-drop",
  "f-mstr-sold", "f-correlation", "f-yields", "f-macro-cause",
];

/** More than one source packed into the singular field. A comma or a slashed
 *  pair - "invezz, crypto.news, intellectia", "bydfi / decrypt".
 *
 *  Deliberately NOT a bare `includes(",")`: a single source may legitimately
 *  carry a comma inside its own locator ("coindesk 2026-03-27, 2026-04-30" is
 *  one publication and two dates), and a matcher that cannot tell those apart
 *  would make the baseline meaningless in the direction that matters. That row
 *  IS counted today and its entry says why - splitting it is a judgement about
 *  the source, not something a regex may decide. */
const joined = (s: string): boolean => /,/.test(s) || /\s\/\s/.test(s);

const migrated = (f: Fact): boolean => !!f.sources?.length;

test("the source ladder's adoption is counted, and cannot quietly go backwards", () => {
  // Prove the fixture was read before trusting any count over it.
  expect(FACTS.length, "the fact table is empty - this probe is reading the wrong module").toBeGreaterThan(15);

  const legacy = FACTS.filter((f) => !migrated(f)).map((f) => f.id);
  const blobs = FACTS.filter((f) => !migrated(f) && joined(f.source)).map((f) => f.id);

  const added = (now: string[], base: string[]) => now.filter((id) => !base.includes(id));
  const fixed = (now: string[], base: string[]) => base.filter((id) => !now.includes(id));

  expect(
    legacy.sort(),
    [
      `facts still on the deprecated singular \`source\`: ${legacy.length}, baseline ${LEGACY_SOURCE_BASELINE.length}.`,
      added(legacy, LEGACY_SOURCE_BASELINE).length
        ? `REGRESSION - landed on the deprecated shape: ${added(legacy, LEGACY_SOURCE_BASELINE).join(", ")}. A new fact carries sources[].`
        : "",
      fixed(legacy, LEGACY_SOURCE_BASELINE).length
        ? `PROGRESS - migrated: ${fixed(legacy, LEGACY_SOURCE_BASELINE).join(", ")}. Remove them from LEGACY_SOURCE_BASELINE here to lock the gain in.`
        : "",
    ].filter(Boolean).join(" "),
  ).toEqual([...LEGACY_SOURCE_BASELINE].sort());

  expect(
    blobs.sort(),
    [
      `facts packing more than one publication into the singular \`source\`: ${blobs.length}, baseline ${JOINED_BLOB_BASELINE.length}.`,
      added(blobs, JOINED_BLOB_BASELINE).length
        ? `REGRESSION - new blob(s): ${added(blobs, JOINED_BLOB_BASELINE).join(", ")}. types.ts names this anti-shape in FactSource's own docstring: one source-shaped blob nothing can count, class or locate.`
        : "",
      fixed(blobs, JOINED_BLOB_BASELINE).length
        ? `PROGRESS - split: ${fixed(blobs, JOINED_BLOB_BASELINE).join(", ")}. Remove them from JOINED_BLOB_BASELINE here.`
        : "",
    ].filter(Boolean).join(" "),
  ).toEqual([...JOINED_BLOB_BASELINE].sort());
});

test("a migrated row is migrated properly - class present, and the blob not left behind it", () => {
  const done = FACTS.filter(migrated);
  expect(done.length, "no fact carries sources[] - the migration has not started, or this probe is wrong").toBeGreaterThan(0);

  for (const f of done) {
    for (const s of f.sources!) {
      expect(s.name.trim(), `${f.id}: a source with no name`).not.toBe("");
      // evidenceClass is required by the type; this asserts the VALUE is a real
      // rung rather than trusting that nobody widened the union to string.
      expect(
        ["primary", "secondary", "aggregator", "vendor", "self-published", "protected"],
        `${f.id}: "${s.evidenceClass}" is not a rung on the ladder`,
      ).toContain(s.evidenceClass);
      expect(
        joined(s.name),
        `${f.id}: a structured source that is itself a comma-joined blob ("${s.name}") - the migration moved the anti-shape rather than fixing it, which is the one outcome worse than not migrating`,
      ).toBe(false);
    }
  }
});
