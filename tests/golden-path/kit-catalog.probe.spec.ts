// LANE — THE KIT CATALOG CANNOT DRIFT FROM THE KIT (static).
//
// The /kit route renders every part of components/kit from app/kit/catalog.ts, and
// components/kit/README.md lists the same parts for a reader who never opens the
// route. Three lists of one thing is how a part gets built and never found, and a
// local copy of it then gets built beside it. So this fails when:
//
//   · an export of components/kit/index.ts or components/kit/brand/index.ts has no
//     catalog entry (a part nobody can see on /kit);
//   · a catalog entry names something the kit no longer exports (a stale specimen);
//   · the README does not name a catalog part in backticks;
//   · a name is catalogued twice;
//   · a key of WORLD_ALMANAC has no role row (a token with no stated purpose).
//
// Type exports are not parts and are not required. The specimen for a part is held
// by the compiler instead: app/kit/Parts.tsx types its demo table as
// Record<PartName, …>, so a catalog entry without a specimen does not typecheck.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { KIT_GROUPS, TOKEN_ROLES } from "@/app/kit/catalog";
import { GAPS, MODULES } from "@/app/kit/migrationMap";
import { WORLD_ALMANAC } from "@/components/ui/tokens";

import { stripComments } from "./_helpers";

const ROOT = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Value exports of a barrel: `export { A, B } from`, skipping `export type { … }`. */
function valueExports(barrel: string): string[] {
  const src = stripComments(read(barrel));
  const names: string[] = [];
  for (const m of src.matchAll(/export\s+(type\s+)?\{([^}]*)\}\s*from/g)) {
    if (m[1]) continue;
    for (const raw of m[2].split(",")) {
      const n = raw.trim().split(/\s+as\s+/).pop()!.trim();
      if (n) names.push(n);
    }
  }
  return names;
}

const catalogued = KIT_GROUPS.flatMap((g) => g.parts.map((p) => p.name as string));

test.describe("kit catalog", () => {
  test("the barrels are read (a probe that finds no exports proves nothing)", () => {
    expect(valueExports("components/kit/index.ts").length).toBeGreaterThan(60);
    expect(valueExports("components/kit/brand/index.ts")).toEqual(expect.arrayContaining(["Mark", "Wordmark"]));
  });

  test("every export of the kit has a catalog entry", () => {
    const exported = [...valueExports("components/kit/index.ts"), ...valueExports("components/kit/brand/index.ts")];
    const missing = exported.filter((n) => !catalogued.includes(n));
    expect(missing, `exported by the kit but absent from app/kit/catalog.ts: ${missing.join(", ")}`).toEqual([]);
  });

  test("every catalog entry is still exported", () => {
    const exported = new Set([...valueExports("components/kit/index.ts"), ...valueExports("components/kit/brand/index.ts")]);
    const stale = catalogued.filter((n) => !exported.has(n));
    expect(stale, `in app/kit/catalog.ts but no longer exported: ${stale.join(", ")}`).toEqual([]);
  });

  test("a part is catalogued once", () => {
    const dupes = catalogued.filter((n, i) => catalogued.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  test("the README names every catalogued part", () => {
    const readme = read("components/kit/README.md");
    const absent = catalogued.filter((n) => !readme.includes(`\`${n}\``));
    expect(absent, `components/kit/README.md does not list: ${absent.join(", ")}`).toEqual([]);
  });

  test("every token of the world has a role", () => {
    const bare = Object.keys(WORLD_ALMANAC).filter((k) => !TOKEN_ROLES[k]);
    expect(bare, `WORLD_ALMANAC keys with no role in app/kit/catalog.ts: ${bare.join(", ")}`).toEqual([]);
    const gone = Object.keys(TOKEN_ROLES).filter((k) => !(k in WORLD_ALMANAC));
    expect(gone).toEqual([]);
  });

  test("the migration map names only parts and gaps that exist", () => {
    const gaps = new Set<string>(GAPS.map((g) => g.id));
    for (const m of MODULES) {
      const unknownParts = m.needs.filter((n) => !catalogued.includes(n));
      expect(unknownParts, `${m.module} needs parts the catalog lacks`).toEqual([]);
      const unknownGaps = m.missing.filter((g) => !gaps.has(g));
      expect(unknownGaps, `${m.module} names gaps that are not defined`).toEqual([]);
    }
  });
});

// The page that says "a local duplicate of a kit part is a finding" must not write
// the k-btn / k-chip class strings by hand where <Button>, <Chip> and <Chips> exist.
test("the specimen files use the kit's Button, Chip and Chips", () => {
  const dir = join(ROOT, "app", "kit");
  const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));
  expect(files.length, "walked no app/kit/*.tsx").toBeGreaterThan(0);
  const hits: string[] = [];
  for (const f of files) {
    const src = stripComments(readFileSync(join(dir, f), "utf8"));
    for (const m of src.matchAll(/className="k-btn\b|className="k-chips?"/g)) hits.push(`${f}: ${m[0]}`);
  }
  expect(hits).toEqual([]);
});
