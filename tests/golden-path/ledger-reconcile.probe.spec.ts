// LANE — THE LEDGER HOLDS WHAT v1 HOLDS (Phase 2 exit: "ledger counts reconcile
// with the v1 stores; a probe compares them").
//
// Over the fixture universe, generated fresh into a temp directory, this runs
// the real CLI the operator runs (`node pipeline/ledger-sync.mts`) - v1's real
// readers in lib/, the real adapters, the real kernel store - and then counts
// the resulting store HERE, through @gt/kernel, against each source's tally of
// its own v1 records. Three readings that share no code path: the adapters'
// projection (what was appended), their tally (counted from the v1 records,
// not from the projection), and this probe's GROUP BY over the store. A fact an
// adapter drops makes the store and the tally differ, named by source and type.
//
// Then: a second sync appends nothing (the kernel's unique key, not the
// adapter's memory), and every live record in the fixtures - counted from the
// manifests on disk with v1's own live sets - is on the live list.
//
// ADDING A SOURCE (Phase 2 wave B) is one line in SOURCES below: its id, and
// how to find its live records in the fixtures with v1's own rule (null when
// the store has no live work). The CLI walks app/_server/v1/sources.ts, so its
// events, tally and live list are already here; this table is what makes a
// source that silently fell out of the registry a red probe instead of a
// smaller report.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { EXTRACT_LIVE, LIVE, cycleKind } from "@/app/foundry/parts";

const ROOT = process.cwd();
const CLI = join(ROOT, "pipeline", "ledger-sync.mts");
const dir = mkdtempSync(join(tmpdir(), "gt-reconcile-"));
const STORE = join(dir, "ledger.sqlite");

test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

type Json = Record<string, unknown>;

/** The CLI, in the temp universe: its cwd is where lib/ finds fixtures-out/. */
function cli(...args: string[]): { status: number | null; doc: Json; stderr: string } {
  const env: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_GRAVITONE_DATA: "fixtures" };
  delete env["GRAVITONE_STORE_PATH"];
  const r = spawnSync(process.execPath, [CLI, ...args, "--json"], { cwd: dir, env, encoding: "utf8", timeout: 60_000 });
  const doc = r.stdout.trim() === "" ? {} : (JSON.parse(r.stdout) as Json);
  return { status: r.status, doc, stderr: r.stderr };
}

/** The ids of the records under fixtures-out/<sub>/ whose status `live` accepts. */
const liveIn = (sub: string, file: string, live: (status: string) => boolean) => (): string[] => {
  const root = join(dir, "fixtures-out", sub);
  return readdirSync(root)
    .map((id) => JSON.parse(readFileSync(join(root, id, file), "utf8")) as Json)
    .filter((m) => live(String(m["status"])))
    .map((m) => String(m["id"]));
};
const isCycleStatus = (s: string): s is Parameters<typeof cycleKind>[0] => ["planning", "generating", "judging", "awaiting-gate", "committed", "failed"].includes(s);

const SOURCES: Record<string, (() => string[]) | null> = {
  forge: liveIn("runs", "run.json", (s) => LIVE.some((x) => x === s)),
  extract: liveIn("extract", "run.json", (s) => EXTRACT_LIVE.some((x) => x === s)),
  dojo: liveIn("training", "cycle.json", (s) => isCycleStatus(s) && cycleKind(s) === "live"),
};

test.describe.configure({ mode: "serial" });

test("seeds the fixture universe into a temp directory", () => {
  const r = cli("seed-fixtures");
  expect(r.status, r.stderr).toBe(0);
});

test("every source's ledger counts equal its own tally of the v1 store", async () => {
  const r = cli("reconcile", "--fixtures", "--exact", "--store", STORE);
  expect(r.status, `${r.stderr}\n${JSON.stringify(r.doc, null, 2)}`).toBe(0);
  const rec = r.doc["reconcile"] as { sources: { source: string; tally: Record<string, number>; error?: string }[] };
  expect(rec.sources.map((s) => s.source).sort()).toEqual(Object.keys(SOURCES).sort());

  // Imported here, not at the top: @gt/* are ES modules, and a static import in a
  // probe file makes the lane's CommonJS transform load them in a form that the
  // probes after this one (dynamic `await import("@gt/...")`) then cannot read -
  // measured 2026-10-15, four probes red behind this one. server-seam's way.
  const { countEvents, facetMap } = await import("@gt/kernel/events-count");
  const { verify } = await import("@gt/kernel/events");
  const { openKernel } = await import("@gt/kernel/kernel");
  const k = openKernel(STORE);
  if (!k.ok) throw k.error;
  try {
    for (const s of rec.sources) {
      expect(s.error, s.source).toBeUndefined();
      // A source that projected nothing would reconcile 0 = 0; the fixtures hold work for each.
      expect(Object.values(s.tally).reduce((a, b) => a + b, 0), `${s.source} tallied nothing`).toBeGreaterThan(0);
      const counted = countEvents(k.value.store, { source: [s.source] });
      if (!counted.ok) throw counted.error;
      expect(facetMap(counted.value, "type"), `${s.source}: the ledger's events by type vs the v1 store's tally`).toEqual(s.tally);
    }
    const chain = verify(k.value.store);
    expect(chain.ok && chain.value.state).toBe("intact");
  } finally {
    k.value.close();
  }
});

test("a second sync appends nothing", () => {
  const r = cli("sync", "--fixtures", "--store", STORE);
  expect(r.status, r.stderr).toBe(0);
  const rows = r.doc["sources"] as { source: string; appended: number; existing: number; drifted: number }[];
  for (const row of rows) {
    expect(row.appended, row.source).toBe(0);
    expect(row.drifted, row.source).toBe(0);
    expect(row.existing, row.source).toBeGreaterThan(0);
  }
});

test("every record v1's own pages call live is on the live list", () => {
  const r = cli("live", "--fixtures");
  expect(r.status, r.stderr).toBe(0);
  const jobs = r.doc["jobs"] as { source: string; id: string }[];
  for (const [source, liveIds] of Object.entries(SOURCES)) {
    const got = jobs.filter((j) => j.source === source).map((j) => j.id).sort();
    if (liveIds === null) {
      expect(got, `${source} has no live work in v1`).toEqual([]);
      continue;
    }
    const want = liveIds().sort();
    expect(want.length, `${source}: the fixtures must hold live work for this to prove anything`).toBeGreaterThan(0);
    expect(got, source).toEqual(want);
  }
});
