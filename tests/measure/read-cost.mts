// READ-COST - what one server read of the Floor, Runs and the Ledger costs, measured in-process.
//
//   node tests/measure/read-cost.mts [--events 40000] [--days 120] [--jobs 300] [--forge 50]
//                               [--extract 50] [--training 10] [--n 20] [--json] [--keep]
//
// Builds a studio in a fresh temp root (tests/measure/read-cost/seed.mts), then calls the real loaders
// - loadFloor, loadRuns, the Ledger's readView - once cold and `n` times warm, and prints per
// loader the wall time (cold, warm median, warm p95) and what one call asked of the disk and of
// SQLite (tests/measure/read-cost/probe.mts wraps both doors and counts; nothing here is estimated).
// A breakdown times the parts each loader is made of, so a cut can be aimed at the largest.
//
// Nothing this measured had a timer before (spark fable-ten, package I). The router refreshes
// these pages on events and every 20 s while visible (app/(studio)/_shell/liveFeed.ts), so a
// warm read is the cost a watching tab pays per refresh.
//
// IT TOUCHES ITS TEMP ROOT AND NOTHING ELSE. The process's cwd becomes the root (every v1 store
// resolves `<cwd>/fixtures-out/...`, lib/fixtures/roots.ts), every `*_STORE_DIR`-style override
// is cleared so none can point elsewhere, GRAVITONE_STORE_PATH names a file in the root, and
// GRAVITONE_DRY_ONLY=1. Then it PROVES it: every path an fs call named and every SQLite file a
// statement ran against is checked against the root; anything else that is not a module the
// loader hooks compiled is a violation, printed, and the exit is 2. It refuses to start if the
// operator's store would be the one opened.
//
// A REPORTER, NOT A GATE: exit 0 when it ran clean. A budget needs a number the box can hold under
// load, and this box runs builders beside it; until a budget is stated from repeated runs on a
// quiet machine, a fail threshold would be a guess. Exit 2: could not run, or touched outside.

import "../../pipeline/lib-hooks.mts";

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { cpus, hostname, tmpdir, totalmem } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const NUMERIC = ["--events", "--days", "--jobs", "--forge", "--extract", "--training", "--n"] as const;
const FLAGS = new Set(["--json", "--keep", "--paths"]);
const unknown = args.filter((a, i) => !FLAGS.has(a) && !(NUMERIC as readonly string[]).includes(a) && !(NUMERIC as readonly string[]).includes(args[i - 1] ?? ""));
const num = (name: string, def: number): number => Number(value(name) ?? String(def));
// Defaults: the operator's studio on 2026-11-09 held a ~24 MB store (+5 MB WAL) and 47 extract
// runs, 12 scout nights, no forge runs; the fixture universe holds 6 forge / 5 extract / 5 Dojo.
// 40k events over 120 days and 50/50/10 run directories sit at or above the real studio, so a
// cost found here is one the operator already pays or soon will.
const sizes = { events: num("--events", 40_000), days: num("--days", 120), jobs: num("--jobs", 300), forge: num("--forge", 50), extract: num("--extract", 50), training: num("--training", 10) };
const N = num("--n", 20);
const json = args.includes("--json");
if (unknown.length > 0 || Object.values(sizes).some((v) => !Number.isInteger(v) || v < 0) || sizes.days < 1 || !Number.isInteger(N) || N < 1) {
  console.error(`usage: node tests/measure/read-cost.mts [--events 40000] [--days 120] [--jobs 300] [--forge 50] [--extract 50] [--training 10] [--n 20] [--json] [--keep]  (unknown: ${unknown.join(" ")})`);
  process.exit(2);
}

/* ── the root, and every store pointed into it ───────────────────────────── */

// The studio is one level down: v1 readers also look at `<cwd>/..` (lib/articles/registryRead.ts
// probes `../ai-registry`), and that sibling must still be inside what this script owns.
const ROOT = realpathSync(mkdtempSync(path.join(tmpdir(), "gt-read-cost-")));
const STUDIO = path.join(ROOT, "studio");
mkdirSync(STUDIO);
const STORE = path.join(STUDIO, "gravitone.sqlite");
// Any override a v1 store reads (grep `process.env` in lib/): cleared, so each resolves under cwd.
for (const name of Object.keys(process.env)) {
  if (/_(STORE_DIR|DIR|STORE_PATH|LEDGER_PATH|EXPORTS_DIR)$/.test(name) && name !== "GRAVITONE_STORE_PATH") delete process.env[name];
}
process.env["GRAVITONE_STORE_PATH"] = STORE;
process.env["GRAVITONE_DRY_ONLY"] = "1";
process.env["NEXT_PUBLIC_GRAVITONE_DATA"] = "fixtures";
process.env["GRAVITONE_PRODUCE_SIDE"] = "real";
process.chdir(STUDIO);

const probe = await import("./read-cost/probe.mts");
const { storeLocation } = await import("../../lib/kernelProcess.ts");
const where = storeLocation();
if (!probe.within(ROOT, where) || /gravitone\.sqlite$/.test(where) === false) {
  console.error(`read-cost: refusing - the store would be ${where}, not under ${ROOT}`);
  process.exit(2);
}
probe.install();

const cleanup = (): void => {
  void import("../../lib/kernelProcess.ts").then((m) => m.closeKernel());
};

/* ── seed ─────────────────────────────────────────────────────────────────── */

const NOW = Date.now();
const { seedWorld } = await import("./read-cost/seed.mts");
const seeded = await seedWorld(STUDIO, sizes, NOW).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(2);
});
const seedFs = probe.snapshot();

/* ── the loaders, imported after the seed so their module-level roots are the temp root's ── */

const { loadFloor } = await import("../../app/(studio)/floor/_floor/load.ts");
const { loadRuns } = await import("../../app/(studio)/projects/runs/_runs/load.ts");
const { readView, readStrip, readFacets, readPage } = await import("../../app/(studio)/ledger/_ledger/read.ts");
const { EMPTY } = await import("../../app/(studio)/ledger/_ledger/filter.ts");
const { V1_SOURCES } = await import("../../lib/ledger/v1/sources.ts");
const { liveJobs, v1Ctx } = await import("../../lib/ledger/v1/sync.ts");
const { readShelf } = await import("../../app/(studio)/floor/_floor/shelf.ts");
const { serverCalendar } = await import("../../app/(studio)/floor/_calendar/port.ts");
const { reconcileApplies } = await import("../../lib/decision/v1/applier.ts");
const { listPacketSummaries } = await import("@gt/kernel/decision/view");
const { serverProduce } = await import("../../app/(studio)/projects/_port/port.ts");
const store = seeded.store;

type Sample = { ms: number; c: ReturnType<typeof probe.snapshot> };
const sample = async (fn: () => unknown): Promise<Sample> => {
  const s = probe.snapshot();
  const t = performance.now();
  await fn();
  return { ms: performance.now() - t, c: probe.since(s) };
};
const q = (xs: readonly number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] ?? 0;
};
type Row = { name: string; cold: Sample | null; p50: number; p95: number; fs: number; stat: number; read: number; readdir: number; sql: number };
const rowOf = (name: string, cold: Sample | null, warm: readonly Sample[]): Row => ({
  name,
  cold,
  p50: q(warm.map((w) => w.ms), 0.5),
  p95: q(warm.map((w) => w.ms), 0.95),
  fs: q(warm.map((w) => w.c.fs), 0.5),
  stat: q(warm.map((w) => w.c.stat), 0.5),
  read: q(warm.map((w) => w.c.read), 0.5),
  readdir: q(warm.map((w) => w.c.readdir), 0.5),
  sql: q(warm.map((w) => w.c.sql), 0.5),
});
const unwrap = (r: { ok: boolean; error?: { message: string } }, what: string): void => {
  if (!r.ok) throw new Error(`${what}: ${r.error?.message ?? "failed"}`);
};

const LOADERS: readonly { name: string; fn: () => Promise<unknown> }[] = [
  { name: "loadFloor", fn: () => loadFloor(NOW) },
  { name: "loadRuns", fn: () => loadRuns(NOW) },
  { name: "ledger readView", fn: async () => unwrap(readView(store, EMPTY, NOW), "readView") },
];
const PARTS: readonly { name: string; fn: () => Promise<unknown> }[] = [
  ...V1_SOURCES.map((src) => ({ name: `  live: ${src.id}`, fn: () => liveJobs([src], v1Ctx(new Date(NOW))) })),
  { name: "  floor: readShelf", fn: () => readShelf() },
  { name: "  floor: calendar slots", fn: () => serverCalendar().slots(NOW) },
  { name: "  floor: reconcileApplies", fn: async () => reconcileApplies(store) },
  { name: "  floor: packet summaries x2", fn: async () => ["committed", "returned"].map((state) => store.read((r) => listPacketSummaries(r, { state: state as "committed", limit: 100 }))) },
  { name: "  produce: listJobs", fn: async () => serverProduce().listJobs() },
  { name: "  ledger: readPage", fn: async () => unwrap(readPage(store, EMPTY), "readPage") },
  { name: "  ledger: readFacets", fn: async () => unwrap(readFacets(store, EMPTY), "readFacets") },
  { name: "  ledger: readStrip", fn: async () => unwrap(readStrip(store, EMPTY, NOW), "readStrip") },
];

const rows: Row[] = [];
try {
  for (const l of LOADERS) {
    const cold = await sample(l.fn);
    const warm: Sample[] = [];
    for (let i = 0; i < N; i++) warm.push(await sample(l.fn));
    rows.push(rowOf(l.name, cold, warm));
  }
  for (const p of PARTS) {
    const warm: Sample[] = [];
    for (let i = 0; i < N; i++) warm.push(await sample(p.fn));
    rows.push(rowOf(p.name, null, warm));
  }
} catch (e) {
  console.error(`read-cost: ${e instanceof Error ? e.message : String(e)}`);
  cleanup();
  process.exit(2);
}

/* ── the containment proof ───────────────────────────────────────────────── */

// A module the loader hooks resolved or compiled is the checkout's code, not a store: it is kept
// apart from the reads, and must still come from the checkout, never from a data directory.
const REPO = path.resolve(import.meta.dirname, "..", "..");
const modules = [...probe.modules];
const strayModules = modules.filter((p) => !probe.within(REPO, p) || /[\\/](foundry-out|fixtures-out)[\\/]/i.test(p));
const outside = [...[...probe.touched].filter((p) => !probe.within(ROOT, p)), ...strayModules];
const badDb = [...probe.databases].filter((p) => !probe.within(ROOT, p));
const inside = [...probe.touched].filter((p) => probe.within(ROOT, p));

const machine = { host: hostname(), cpu: cpus()[0]?.model ?? "unknown", cores: cpus().length, memGb: Math.round(totalmem() / 2 ** 30), node: process.version, platform: process.platform };
const clean = outside.length === 0 && badDb.length === 0;
if (json) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), root: ROOT, sizes, seeded: seeded.counts, n: N, machine, rows: rows.map(({ cold, ...r }) => ({ ...r, coldMs: cold?.ms ?? null, coldFs: cold?.c.fs ?? null, coldSql: cold?.c.sql ?? null })), databases: [...probe.databases], outside, clean }, null, 2)}\n`);
} else {
  const f = (x: number): string => x.toFixed(1).padStart(8);
  const i = (x: number): string => String(x).padStart(7);
  console.log(`read-cost: ${new Date().toISOString()}  ${machine.cpu} x${machine.cores}, ${machine.memGb} GB, node ${machine.node}, ${machine.platform}`);
  console.log(`  root ${ROOT}`);
  console.log(`  asked: events ${sizes.events} over ${sizes.days} d, jobs ${sizes.jobs}, forge ${sizes.forge}, extract ${sizes.extract}, training ${sizes.training}`);
  console.log(`  held:  ${Object.entries(seeded.counts).map(([k, v]) => `${k} ${v}`).join(", ")}  (seeded in ${seeded.ms} ms, ${seedFs.fs} fs calls)`);
  console.log(`  ${N} warm calls each; fs and sql are the warm median per call\n`);
  console.log(`  ${"read".padEnd(34)} ${"cold ms".padStart(8)} ${"p50 ms".padStart(8)} ${"p95 ms".padStart(8)} ${"fs".padStart(7)} ${"stat".padStart(7)} ${"read".padStart(7)} ${"readdir".padStart(7)} ${"sql".padStart(7)}`);
  for (const r of rows) console.log(`  ${r.name.padEnd(34)} ${r.cold === null ? "".padStart(8) : f(r.cold.ms)} ${f(r.p50)} ${f(r.p95)} ${i(r.fs)} ${i(r.stat)} ${i(r.read)} ${i(r.readdir)} ${i(r.sql)}`);
  console.log(`\n  sqlite files: ${[...probe.databases].join(", ") || "(none)"}`);
  console.log(`  paths under the root: ${inside.length}; module sources compiled from the checkout: ${modules.length}`);
  // Every path, as the proof; by directory unless --paths asks for each file (clones make it long).
  const byDir = new Map<string, number>();
  for (const p of inside) {
    const rel = path.relative(ROOT, p).split(path.sep);
    const key = args.includes("--paths") ? rel.join("/") : rel.slice(0, Math.min(rel.length, 3)).join("/");
    byDir.set(key, (byDir.get(key) ?? 0) + 1);
  }
  for (const [d, n] of [...byDir].sort()) console.log(`    <root>/${d}${n > 1 ? `  (${n})` : ""}`);
  console.log(clean ? "  outside the root: none" : `  OUTSIDE THE ROOT (${outside.length + badDb.length}):`);
  for (const p of [...outside, ...badDb]) console.log(`    ${p}`);
}

const { closeKernel } = await import("../../lib/kernelProcess.ts");
closeKernel();
process.chdir(tmpdir());
if (!args.includes("--keep")) rmSync(ROOT, { recursive: true, force: true });
process.exit(clean ? 0 : 2);
