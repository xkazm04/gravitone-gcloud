// LANE — THE KIT CATALOG CANNOT DRIFT FROM THE KIT (static).
//
// The /kit route renders every part of components/kit from app/kit/catalog.ts, and
// components/kit/README.md lists the same parts for a reader who never opens the
// route. Three lists of one thing is how a part gets built and never found, and a
// local copy of it then gets built beside it. So this fails when:
//
//   · an export of components/kit/index.ts, components/kit/brand/index.ts or
//     components/ui/signal/index.ts has no catalog entry (a part nobody can see on /kit);
//   · a catalog entry names something the kit no longer exports (a stale specimen);
//   · the README does not name a catalog part in backticks;
//   · a name is catalogued twice;
//   · a key of WORLD_ALMANAC has no role row (a token with no stated purpose).
//
// Type exports are not parts and are not required. The specimen for a part is held
// by the compiler instead: app/kit/Parts.tsx types its demo table as
// Record<PartName, …>, so a catalog entry without a specimen does not typecheck.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { KIT_GROUPS, TOKEN_ROLES } from "@/app/kit/catalog";
import { MODULES } from "@/app/kit/migrationMap";
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
    const exported = new Set([...valueExports("components/kit/index.ts"), ...valueExports("components/kit/brand/index.ts"), ...valueExports("components/ui/signal/index.ts")]);
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

  test("the migration map names only parts and modules that exist", () => {
    const modules = new Set(Object.keys(JSON.parse(read("app/kit/census.json")).modules));
    for (const m of MODULES) {
      const unknownParts = m.needs.filter((n) => !catalogued.includes(n));
      expect(unknownParts, `${m.module} needs parts the catalog lacks`).toEqual([]);
      const gone = m.paths.filter((p) => !modules.has(p));
      expect(gone, `${m.module} covers paths the census has no module for`).toEqual([]);
    }
  });
});

// ── THE CENSUS (KIT-A) ──────────────────────────────────────────────────────
//
// /kit's Migration tab used to rest on a hand measurement (2026-09-29) that said
// Cut had 1 file and Playground 2; a recount on 2026-10-05 found 18 and 35, and
// neither imported anything from the kit. So the facts are now generated:
// pipeline/kit-census.mts walks app/ and components/ with the TypeScript parser and
// writes app/kit/census.json. These cases recompute it in-process, so the committed
// file cannot go stale and the suspect counts can only fall.
//
// Loaded lazily so the catalog cases above still report on their own when the
// census module is broken.
const censusLib = () => import("../../pipeline/kit-census.mjs");
const committedCensus = () => JSON.parse(read("app/kit/census.json"));
const FIXTURE = "app/_phases/cut/__census_fixture.tsx";

/** Tracked .ts/.tsx under a directory, counted without the census. */
function trackedSources(dir: string): string[] {
  return execFileSync("git", ["ls-files", "-z", "--", dir], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".d.ts"));
}

test.describe("kit census", () => {
  test("the walk reads the tree (a census of nothing proves nothing)", async () => {
    const { computeCensus } = await censusLib();
    const c = computeCensus();
    expect(c.files).toBeGreaterThan(300);
    expect(Object.keys(c.modules).length).toBeGreaterThan(10);
    expect(Object.keys(c.parts).length).toBeGreaterThan(90);
  });

  // Acceptance 1. The hand map said Cut was one file; the census counts what is there.
  test("Cut is counted from the tree: its files, and its kit imports", async () => {
    const { computeCensus } = await censusLib();
    const cut = computeCensus().modules["app/_phases/cut"];
    const files = trackedSources("app/_phases/cut");
    const kitFiles = files.filter((f) => /from\s+["']@\/components\/kit["'/]/.test(stripComments(read(f))));
    expect(files.length, "walked no app/_phases/cut").toBeGreaterThan(1);
    expect(cut, "app/_phases/cut is not a census module").toBeDefined();
    expect(cut.files).toBe(files.length);
    expect(cut.kitImports).toBe(kitFiles.length);
  });

  // Acceptance 2. BandTrack had no adopter when the card was written; the wizard has
  // since adopted it, so the zero-adopter rule is proven on an overlay of the tree.
  test("a part nobody renders is a zero adopter, and one render outside the kit clears it", async () => {
    const { computeCensus } = await censusLib();
    const live = computeCensus();
    expect(live.zeroAdopters).toEqual(Object.keys(live.parts).filter((p) => live.parts[p].adopters.length === 0).sort());

    const gone = Object.fromEntries(live.parts.BandTrack.adopters.map((f: string) => [f, null]));
    expect(computeCensus({ overlay: gone }).zeroAdopters).toContain("BandTrack");

    const imported = `import { BandTrack } from "@/components/ui/signal";\nexport const n = 1;\n`;
    const rendered = `import { BandTrack } from "@/components/ui/signal";\nexport function F() {\n  return <BandTrack value={1} min={0} max={2} />;\n}\n`;
    expect(computeCensus({ overlay: { ...gone, [FIXTURE]: imported } }).zeroAdopters, "an unused import is not adoption").toContain("BandTrack");
    expect(computeCensus({ overlay: { ...gone, "app/kit/__census_fixture.tsx": rendered } }).zeroAdopters, "the specimen route is not an adopter").toContain("BandTrack");
    const adopted = computeCensus({ overlay: { ...gone, [FIXTURE]: rendered } });
    expect(adopted.zeroAdopters).not.toContain("BandTrack");
    expect(adopted.parts.BandTrack.adopters).toEqual([FIXTURE]);
  });

  // Acceptance 3. A hand-rolled tab is a suspect; the same markup beside TabRail is not.
  test("a hand-rolled role=tab is counted under its module's suspects", async () => {
    const { computeCensus } = await censusLib();
    const base = computeCensus().modules["app/_phases/cut"].suspects.tab;
    const raw = `export function F() {\n  return <button role="tab" aria-selected>One</button>;\n}\n`;
    const withRail = `import { TabRail } from "@/components/kit";\nexport function F() {\n  return <><TabRail label="x" tabs={[]} active="" onSelect={() => {}} /><button role="tab">One</button></>;\n}\n`;
    expect(computeCensus({ overlay: { [FIXTURE]: raw } }).modules["app/_phases/cut"].suspects.tab).toBe(base + 1);
    expect(computeCensus({ overlay: { [FIXTURE]: withRail } }).modules["app/_phases/cut"].suspects.tab).toBe(base);
  });

  // Acceptance 4. The committed census is the tree's, field for field.
  test("census.json is what the tree measures today", async () => {
    const { computeCensus, diffCensus, ratchetBreaches } = await censusLib();
    const fresh = computeCensus();
    const committed = committedCensus();
    expect(ratchetBreaches(committed, fresh), "suspects rose; use the kit part, or `npx tsx pipeline/kit-census.mts --raise`").toEqual([]);
    expect(diffCensus(committed, fresh), "app/kit/census.json is stale; run `npx tsx pipeline/kit-census.mts`").toEqual([]);
  });

  test("a hand edit, or a new import left unrecorded, names the module and the field", async () => {
    const { computeCensus, diffCensus } = await censusLib();
    const committed = committedCensus();
    const edited = structuredClone(committed);
    edited.modules["app/_phases/cut"].kitImports += 1;
    expect(diffCensus(edited, computeCensus()).join("\n")).toContain('modules["app/_phases/cut"].kitImports');

    const importer = `import { Tally } from "@/components/kit";\nexport function F() {\n  return <Tally value={1} />;\n}\n`;
    const drift = diffCensus(committed, computeCensus({ overlay: { [FIXTURE]: importer } })).join("\n");
    expect(drift).toContain('modules["app/_phases/cut"].kitImports');
    expect(drift).toContain('parts["Tally"].adopters');
  });

  test("suspects ratchet: a rise in a known module fails, a module seen first does not", async () => {
    const { computeCensus, ratchetBreaches } = await censusLib();
    const committed = committedCensus();
    const select = `export function F() {\n  return <select><option>a</option></select>;\n}\n`;
    const rise = ratchetBreaches(committed, computeCensus({ overlay: { [FIXTURE]: select } }));
    expect(rise.join("\n")).toContain('modules["app/_phases/cut"].suspects.select');
    expect(ratchetBreaches(committed, computeCensus({ overlay: { "app/__census_new/F.tsx": select } }))).toEqual([]);
  });

  // Acceptance 5. The signal vocabulary is catalogued too, so /kit draws all of it.
  test("every value export of the signal barrel has a catalog entry", () => {
    const signal = valueExports("components/ui/signal/index.ts");
    expect(signal.length, "read no exports from the signal barrel").toBeGreaterThan(10);
    const missing = signal.filter((n) => !catalogued.includes(n));
    expect(missing, `exported by components/ui/signal but absent from app/kit/catalog.ts: ${missing.join(", ")}`).toEqual([]);
  });

  test("every catalogued part is a census part", async () => {
    const { computeCensus } = await censusLib();
    const parts = computeCensus().parts;
    expect(catalogued.filter((n) => !parts[n])).toEqual([]);
  });

  // Acceptance 6. The amber tally is the computed gap count.
  test("the Migration tally is the computed gap count, not a hand list", async () => {
    const map = (await import("@/app/kit/migrationMap")) as Record<string, unknown>;
    expect(map.GAPS, "a hand-typed gap list is back").toBeUndefined();
    const migrationGaps = map.migrationGaps as (c: unknown) => { module: string; part: string; kind: string }[];
    expect(typeof migrationGaps).toBe("function");
    const census = committedCensus();

    // The rule on a constructed census: Cut needs Player; a raw <video> without it is a gap.
    const cut = MODULES.find((m) => m.module === "Cut")!;
    expect(cut.needs as readonly string[]).toContain("Player");
    const forged = structuredClone(census);
    for (const p of cut.paths) {
      forged.modules[p].suspects.media = 1;
      forged.modules[p].parts = forged.modules[p].parts.filter((n: string) => n !== "Player");
    }
    expect(migrationGaps(forged)).toContainEqual(expect.objectContaining({ module: "Cut", part: "Player", kind: "media" }));
    for (const p of cut.paths) forged.modules[p].parts.push("Player");
    expect(migrationGaps(forged)).not.toContainEqual(expect.objectContaining({ module: "Cut", part: "Player" }));

    const gaps = migrationGaps(census);
    for (const g of gaps) {
      const row = MODULES.find((m) => m.module === g.module)!;
      expect(row.needs as readonly string[]).toContain(g.part);
      const used = row.paths.flatMap((p) => census.modules[p]?.parts ?? []);
      expect(used, `${g.module} imports ${g.part}, so it is not a gap`).not.toContain(g.part);
      expect(row.paths.reduce((n, p) => n + (census.modules[p]?.suspects[g.kind] ?? 0), 0)).toBeGreaterThan(0);
    }
    const view = stripComments(read("app/kit/KitView.tsx"));
    expect(view).not.toMatch(/\bGAPS\b/);
    expect(view).toMatch(/migrationGaps\(/);
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
