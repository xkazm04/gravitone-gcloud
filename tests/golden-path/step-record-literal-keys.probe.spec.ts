// LANE — NO NEW STRING-LITERAL STEP KEY OUTSIDE THE RECORD DEFS (source ratchet).
//
// A step record's key belongs to its def (app/_phases/<step>/records.ts), which
// carries the owner, the version and the parser. A call that retypes the key as
// a literal — `readStep(id, "research")`, `useStepFor(id, "frames", …)` — skips
// all three: the read is an unchecked cast, the version stamp is never read,
// and a failed or refused read can flatten into `{}` that the next save writes
// over the record. That is the data-loss class the registry
// (app/_phases/_shared/records/registry.ts) was introduced to close.
//
// This ratchet counts, per file, the calls that still pass a literal key and
// fails when a count RISES or a new file appears. It also fails when a count
// FALLS below its baseline: a converted call site leaves the baseline in the
// same change, so the list only ever shrinks. Keys held in a const
// (`saveStep(id, PHASE, …)`) are not seen; this is a floor, not a proof.
//
// Comments are stripped first (this header quotes the calls it forbids).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const ROOT = process.cwd();
/** The store itself and the registry are where keys are allowed to be handled. */
const EXEMPT = (rel: string) =>
  rel.startsWith("app/_phases/_shared/records/") ||
  /^app\/_phases\/_shared\/(stepStore|readStep|saveStep|patchStep|useLoadFor|withStore)\.ts$/.test(rel);

const CALL = /\b(?:saveStep|readStep|loadStep|patchStep)\b(?:<[^()]*?>)?\(\s*[^,()]+,\s*["'`]|\buseStepFor\b(?:<[^()]*?>)?\(\s*[^,()]+,\s*["'`]/g;

/** file -> literal-key calls still outside the defs. Shrink-only. */
const BASELINE: Readonly<Record<string, number>> = {
  "app/_phases/cut/music-video/MusicVideoExport.tsx": 1,
  "app/_phases/cut/useCut.ts": 2,
  "app/_phases/frames/music-video/MusicVideoFrames.tsx": 1,
  "app/_phases/research/guided/useEducationalResearch.ts": 1, // research-notebook: no def yet
  "app/_phases/research/ResearchStep.tsx": 2, // research-mode (+ notebook): no def yet
  "app/_phases/script/ScriptStep.tsx": 3, // research gate readers: need a refusal surface first
};

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
}

function measure(): Record<string, number> {
  const files: string[] = [];
  for (const d of ["app", "lib", "components"]) {
    try {
      walk(join(ROOT, d), files);
    } catch {
      /* a missing top-level dir is not a finding */
    }
  }
  expect(files.length, "the walk found almost nothing - it is reading the wrong tree").toBeGreaterThan(100);
  const found: Record<string, number> = {};
  for (const f of files) {
    const rel = relative(ROOT, f).split(sep).join("/");
    if (EXEMPT(rel)) continue;
    const n = stripComments(readFileSync(f, "utf8")).match(CALL)?.length ?? 0;
    if (n) found[rel] = n;
  }
  return found;
}

test("no step key is retyped as a literal beyond the baseline", () => {
  const found = measure();
  const rose = Object.entries(found).filter(([f, n]) => n > (BASELINE[f] ?? 0));
  expect(
    rose.map(([f, n]) => `${f}: ${n} (baseline ${BASELINE[f] ?? 0})`),
    "read/save through the owner's def (readRecord / patchRecord / useRecord) instead of a literal key",
  ).toEqual([]);
});

test("a converted call site leaves the baseline", () => {
  const found = measure();
  const paid = Object.entries(BASELINE).filter(([f, n]) => (found[f] ?? 0) < n);
  expect(
    paid.map(([f, n]) => `${f}: baseline ${n}, now ${found[f] ?? 0}`),
    "lower or delete these BASELINE entries - the ratchet only shrinks",
  ).toEqual([]);
});
