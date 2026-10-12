// LANE - THE MUTANT REGISTRY STAYS TRUE (static, cheap).
//
// tests/mutants/registry.ts declares defects that `npm run test:mutants` seeds to
// prove the probes can fail. A declared defect whose `find` text moved would be
// silently skipped by the runner - so this probe, which is inside `npm test`,
// makes that LOUD and names the entry:
//
//   - every entry's `find` occurs exactly once in its file (stale = red);
//   - `replace` differs from `find`; ids are unique; the probe file exists;
//   - UNGUARDED PROBES (a *.probe.spec.ts no entry names) is ratcheted by
//     UNGUARDED_PROBE_BUDGET: above it is red, and below it is red too, so the
//     number is lowered the moment a probe gains a mutant and can only fall.
//
// Whether each mutant actually goes red is NOT checked here (it costs minutes);
// that is the runner's measured property, recorded in tests/mutants/ledger.json.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { MUTANTS, UNGUARDED_PROBE_BUDGET } from "../mutants/registry";

const ROOT = path.resolve(__dirname, "../..");
const PROBES_DIR = path.join(ROOT, "tests", "golden-path");

const occurrences = (hay: string, needle: string) => (needle ? hay.split(needle).length - 1 : 0);

/** Pure so the failure cases can be driven without touching the registry. */
function staleEntries(mutants: typeof MUTANTS, read: (file: string) => string | null): string[] {
  const out: string[] = [];
  for (const m of mutants) {
    const src = read(m.file);
    if (src === null) out.push(`${m.id}: ${m.file} does not exist`);
    else {
      const n = occurrences(src, m.find);
      if (n !== 1) out.push(`${m.id}: find occurs ${n}x in ${m.file} (must be exactly 1)`);
    }
    if (m.find === m.replace) out.push(`${m.id}: replace equals find`);
  }
  return out;
}

function unguardedProbes(probeFiles: string[], mutants: typeof MUTANTS): string[] {
  const guarded = new Set(mutants.map((m) => m.probe));
  return probeFiles.filter((f) => !guarded.has(f)).sort();
}

const readRepo = (file: string) => {
  const p = path.join(ROOT, file);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};
const probeFiles = readdirSync(PROBES_DIR).filter((f) => f.endsWith(".probe.spec.ts"));

test("every mutant's find text occurs exactly once in its file", () => {
  const stale = staleEntries(MUTANTS, readRepo);
  expect(stale, `stale mutants:\n  ${stale.join("\n  ")}`).toEqual([]);
});

test("mutant ids are unique and each names a probe that exists", () => {
  const ids = MUTANTS.map((m) => m.id);
  expect(ids.filter((id, i) => ids.indexOf(id) !== i), "duplicate ids").toEqual([]);
  const missing = MUTANTS.filter((m) => !probeFiles.includes(m.probe)).map((m) => `${m.id} -> ${m.probe}`);
  expect(missing, "entries naming a probe that does not exist").toEqual([]);
});

test("the stale check is not vacuous: missing, duplicated and absent text are all named", () => {
  const mk = (id: string, find: string) => ({ id, probe: "x.probe.spec.ts", file: "f.ts", find, replace: find + "!", why: "" });
  const src = "alpha beta alpha";
  const read = (f: string) => (f === "f.ts" ? src : null);
  expect(staleEntries([mk("once", "beta")], read)).toEqual([]);
  expect(staleEntries([mk("twice", "alpha")], read)[0]).toContain("twice: find occurs 2x");
  expect(staleEntries([mk("gone", "gamma")], read)[0]).toContain("gone: find occurs 0x");
  expect(staleEntries([{ ...mk("nofile", "beta"), file: "nope.ts" }], read)[0]).toContain("nofile: nope.ts does not exist");
});

test("probes with zero mutants may only fall (the ratchet)", () => {
  const unguarded = unguardedProbes(probeFiles, MUTANTS);
  console.log(`[mutants] ${unguarded.length} of ${probeFiles.length} probes have no mutant (budget ${UNGUARDED_PROBE_BUDGET})`);
  expect(
    unguarded.length,
    `${unguarded.length} probes have no mutant, budget is ${UNGUARDED_PROBE_BUDGET}. Add an entry to tests/mutants/registry.ts for the new probe(s), e.g. ${unguarded.slice(0, 3).join(", ")}`,
  ).toBeLessThanOrEqual(UNGUARDED_PROBE_BUDGET);
  expect(
    unguarded.length,
    `only ${unguarded.length} probes are unguarded now: lower UNGUARDED_PROBE_BUDGET from ${UNGUARDED_PROBE_BUDGET} to ${unguarded.length} so the gain cannot be lost`,
  ).toBeGreaterThanOrEqual(UNGUARDED_PROBE_BUDGET);
});

test("the ratchet is not vacuous: a probe with no entry raises the count", () => {
  const before = unguardedProbes(["a.probe.spec.ts"], [{ ...MUTANTS[0], probe: "a.probe.spec.ts" }]);
  const after = unguardedProbes(["a.probe.spec.ts", "new.probe.spec.ts"], [{ ...MUTANTS[0], probe: "a.probe.spec.ts" }]);
  expect(before).toEqual([]);
  expect(after).toEqual(["new.probe.spec.ts"]);
});
