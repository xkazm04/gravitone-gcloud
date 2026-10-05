// LANE — EVERY STORAGE HOOK PUBLISHES ITS FAILURES TO THE BELL (source ratchet).
//
// lib/useProjects.ts routes each failure through `failed()` ->
// reportStorageTrouble, so the bell names the kind and the remedy. useThemes and
// useAssets claimed to mirror it and only kept a local `error` string, which
// three of four consumers drop: a failed read of the styles rendered as "you
// have no styles". A catch that sets `error` must also publish.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const ROOT = join(__dirname, "..", "..");
const HOOKS = ["lib/useProjects.ts", "lib/useThemes.ts", "lib/useAssets.ts"];

/** Bodies of every `catch (e) { ... }`, by brace matching. */
function catchBodies(src: string): string[] {
  const out: string[] = [];
  const re = /catch\s*\(\s*e\s*\)\s*\{/g;
  while (re.exec(src)) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      const c = src[i++];
      if (c === "{") depth++;
      else if (c === "}") depth--;
    }
    out.push(src.slice(re.lastIndex, i));
  }
  return out;
}

test("every catch that sets `error` also publishes to the storage-trouble channel", () => {
  let seen = 0;
  const bad: string[] = [];
  for (const rel of HOOKS) {
    const src = stripComments(readFileSync(join(ROOT, rel), "utf8"));
    for (const body of catchBodies(src)) {
      if (!/setError|failed\(/.test(body)) continue;
      seen++;
      if (!/\bfailed\(|reportStorageTrouble\(/.test(body)) bad.push(`${rel}: ${body.trim().slice(0, 80)}`);
    }
  }
  expect(seen, "the walk read no catch blocks").toBeGreaterThan(0);
  expect(bad).toEqual([]);
});
