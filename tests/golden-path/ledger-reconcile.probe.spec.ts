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
// the store has no live work). The CLI walks lib/ledger/v1/sources.ts, so its
// events, tally and live list are already here; this table is what makes a
// source that silently fell out of the registry a red probe instead of a
// smaller report.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { LIVE as TURN_LIVE } from "@/lib/turns/ledger";

// THE v1 UIs' LIVE SETS, FROZEN HERE (Phase 6 L67). They were imported from the pages that drew
// them (app/foundry/parts.tsx, app/articles/runModel.ts), which wave C deletes. Each page only
// re-exported lib's set (lib/foundry/plant.ts LIVE, EXTRACT_LIVE, cycleKind; lib/articles/types.ts
// WORKING) - the SAME sets the adapters read - so an import from lib would make this probe agree
// with the adapters by construction. Spelled out, a status the adapters stop reading as live
// (or a new one they read and v1 never drew) is a red probe, not a quiet agreement.
/** lib/foundry/plant.ts LIVE: a forge run is working while it is being made. */
const FORGE_LIVE = ["created", "annotating", "generating", "grading"];
/** lib/foundry/plant.ts EXTRACT_LIVE. */
const EXTRACT_LIVE = ["created", "reading", "grouping", "replicating", "transferring"];
/** lib/foundry/plant.ts cycleKind(s) === "live": every cycle status but the gate and the two ends. */
const CYCLE_LIVE = ["planning", "generating", "judging"];
/** lib/articles/types.ts WORKING: a run is live until the gate, and again while it lands. */
const ARTICLE_WORKING = ["queued", "researching", "drafting", "critiquing", "checking", "approved", "landing"];

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
  // Every v1 store override, so each source reads the seeded universe: this lane's
  // config points GPU_LEASE_DIR at a temp dir of its own, and probes that run
  // earlier in the same process set the others.
  for (const v of ["GPU_LEASE_DIR", "SOUND_STORE_DIR", "PUBLISH_STORE_DIR", "ARTICLES_STORE_DIR", "TEXT_TURN_DIR", "SPEND_STORE_DIR", "CLIP_STORE_DIR"]) delete env[v];
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
/** The ids in one fixtures-out/<rel> JSON document that `pick` reads as live. */
const liveInDoc = (rel: string, pick: (doc: Json) => string[]) => (): string[] => pick(JSON.parse(readFileSync(join(dir, "fixtures-out", rel), "utf8")) as Json);
/** Records stored one file per id (fixtures-out/<sub>/<id>.json) whose status `live` accepts. */
const liveInFiles = (sub: string, idKey: string, live: (status: string) => boolean) => (): string[] => {
  const root = join(dir, "fixtures-out", sub);
  return readdirSync(root)
    .map((n) => JSON.parse(readFileSync(join(root, n), "utf8")) as Json)
    .filter((m) => live(String(m["status"])))
    .map((m) => String(m[idKey]));
};
const rows = (doc: Json, key: string): Json[] => (Array.isArray(doc[key]) ? (doc[key] as Json[]) : []);
/** lib/sound/suno/store.ts LIVE_STATES and the MV queue's own pair (lib/sound/mv/queue.ts deleteMv, enqueueMv). */
const QUEUE_LIVE = ["queued", "active"];

const SOURCES: Record<string, (() => string[]) | null> = {
  forge: liveIn("runs", "run.json", (s) => FORGE_LIVE.includes(s)),
  extract: liveIn("extract", "run.json", (s) => EXTRACT_LIVE.includes(s)),
  dojo: liveIn("training", "cycle.json", (s) => CYCLE_LIVE.includes(s)),
  strips: liveIn("strips", "run.json", (s) => s === "running"),
  articles: liveIn("articles", "run.json", (s) => ARTICLE_WORKING.includes(s)),
  suno: liveInDoc("sound/suno.json", (d) => rows(d, "jobs").filter((j) => QUEUE_LIVE.includes(String(j["state"]))).map((j) => String(j["id"]))),
  // A take is made whole by one call (lib/sound/takes.ts): the shelf has no live work.
  sound: null,
  mv: liveInDoc("sound/mv.json", (d) => rows(d, "jobs").filter((j) => QUEUE_LIVE.includes(String(j["state"]))).map((j) => String(j["id"]))),
  publish: null,
  // A scout night is finished work on disk; its jobs are the kernel's, on Runs.
  scout: null,
  seeds: null,
  turns: liveInFiles("turns", "id", (s) => [...TURN_LIVE].some((x) => x === s)),
  spend: null,
  // The card's holder is the kernel lease now (Phase 4 L27); lease.json is history.
  gpu: null,
  clips: liveInFiles("clips", "clipId", (s) => s === "queued" || s === "rendering"),
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
