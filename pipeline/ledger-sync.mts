// LEDGER-SYNC — the v1 projection, on demand (Phase 2, lot 14).
//
//   node pipeline/ledger-sync.mts [sync] [--fixtures] [--store <file>] [--json]
//        read every v1 source (lib/ledger/v1/sources.ts), append what the ledger
//        does not hold yet, print the per-source table
//   node pipeline/ledger-sync.mts reconcile [--fixtures] [--store <file>] [--exact] [--json]
//        sync, then compare the ledger's counts per source and event type with
//        each source's own tally of the v1 store. Missing facts are a failure;
//        with --exact (a fresh store) any difference is
//   node pipeline/ledger-sync.mts live [--fixtures] [--json]
//        v1's live work and Weir piles, as Runs reads them; writes nothing
//   node pipeline/ledger-sync.mts seed-fixtures
//        write the fixture universe the sources read (pipeline/fixtures) under
//        <cwd>/fixtures-out - the reconcile probe runs this in a temp directory
//
//   --fixtures   NEXT_PUBLIC_GRAVITONE_DATA=fixtures: read fixtures-out/, open
//                fixtures-out/gravitone.sqlite (lib/fixtures/mode.ts)
//   --store      the kernel store to write (default as the app: GRAVITONE_STORE_PATH,
//                else <cwd>/<foundry-out|fixtures-out>/gravitone.sqlite)
//   --json       one JSON document on stdout, nothing else
//   Exit 0 ok · 1 a source failed or the counts differ · 2 usage.
//
// PLAIN `node`, NO tsx. The adapters read through v1's own readers in lib/, and
// lib/ is written for a bundler: extensionless imports, `@/` paths, parameter
// properties (lib/foundry/runStore.ts FoundryError) that type STRIPPING
// refuses, and `import "server-only"`, which outside Next throws by design. The
// two hooks below give this process what Next gives the server: `server-only`
// resolves to its empty server entry (next/dist/compiled/server-only, as
// playwright.config.ts does for the node lane), a bare path finds its .ts/.tsx,
// and a repo TypeScript file is TRANSFORMED (node:module stripTypeScriptTypes,
// mode "transform"). `npx tsx` worked too, at ten seconds of npx resolution
// per run - the probe pays this script twice per run, so it would cost more
// than the sync it measures.
//
// THE CLAIM IS NOT TAKEN HERE. kernel/ingest's sync claim rate-limits READERS
// (a page asking for a fresh ledger); this is an operator's explicit act, and
// two syncs at once are already safe - every event is keyed, so the slower one
// finds every key taken.

import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const SERVER_ONLY = pathToFileURL(path.join(ROOT, "node_modules", "next", "dist", "compiled", "server-only", "empty.js")).href;
const isFile = (p: string): boolean => existsSync(p) && statSync(p).isFile();

function probe(abs: string): string | null {
  if (isFile(abs)) return abs;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) if (isFile(abs + ext)) return abs + ext;
  return null;
}

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "server-only") return { url: SERVER_ONLY, shortCircuit: true };
    let abs: string | null = null;
    if (spec.startsWith("@/")) abs = path.join(ROOT, spec.slice(2));
    else if ((spec.startsWith("./") || spec.startsWith("../")) && ctx.parentURL?.startsWith("file:") === true) abs = path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec);
    const hit = abs === null ? null : probe(abs);
    return hit === null ? next(spec, ctx) : { url: pathToFileURL(hit).href, shortCircuit: true };
  },
  load(url, ctx, next) {
    // lib/ imports JSON bare, as a bundler allows; Node wants `with { type: "json" }`.
    if (url.startsWith("file:") && url.endsWith(".json") && !url.includes("/node_modules/")) return { format: "json", source: readFileSync(fileURLToPath(url), "utf8"), shortCircuit: true };
    if (!url.startsWith("file:") || !/\.(ts|tsx|mts)$/.test(url) || url.includes("/node_modules/")) return next(url, ctx);
    const source = stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), { mode: "transform", sourceUrl: url });
    return { format: "module", source, shortCircuit: true };
  },
});

const args = process.argv.slice(2);
const VERBS = ["sync", "reconcile", "live", "seed-fixtures"] as const;
type Verb = (typeof VERBS)[number];
const isVerb = (v: string | undefined): v is Verb => VERBS.some((x) => x === v);
const verb: Verb = isVerb(args[0]) ? args[0] : "sync";
const flag = (name: string): boolean => args.includes(name);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const json = flag("--json");
const known = new Set(["--fixtures", "--json", "--exact", "--store", ...VERBS]);
const unknown = args.filter((a, i) => !known.has(a) && args[i - 1] !== "--store");
if (unknown.length > 0 || (flag("--store") && value("--store") === undefined)) {
  console.error(`usage: node pipeline/ledger-sync.mts [${VERBS.join("|")}] [--fixtures] [--store <file>] [--exact] [--json]  (unknown: ${unknown.join(" ")})`);
  process.exit(2);
}

// Read at import by lib/fixtures/mode.ts, so it is set before anything below loads.
if (flag("--fixtures")) process.env["NEXT_PUBLIC_GRAVITONE_DATA"] = "fixtures";
const store = value("--store");
if (store !== undefined) process.env["GRAVITONE_STORE_PATH"] = path.resolve(store);

function out(doc: unknown, lines: readonly string[]): void {
  if (json) process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
  else for (const l of lines) console.log(l);
}

function fail(message: string): never {
  out({ error: message }, [`ledger-sync: ${message}`]);
  process.exit(1);
}

if (verb === "seed-fixtures") {
  process.env["NEXT_PUBLIC_GRAVITONE_DATA"] = "fixtures";
  // The generators of the stores lib/ledger/v1/sources.ts reads. A lot that
  // adds a source whose fixtures come from another generator adds it here.
  const seeded: Record<string, string> = {};
  for (const name of ["foundry", "publish", "work"]) {
    const gen: { generate: () => string } = await import(`./fixtures/${name}.ts`);
    seeded[name] = gen.generate();
  }
  out({ seeded }, Object.entries(seeded).map(([name, summary]) => `seeded fixtures-out/ (${name}): ${summary}`));
  process.exit(0);
}

const { kernel, closeKernel } = await import("../lib/kernelStore.ts");
const { V1_SOURCES } = await import("../lib/ledger/v1/sources.ts");
const { liveJobs, readAll, reconcile, syncV1, v1Ctx } = await import("../lib/ledger/v1/sync.ts");

const ctx = v1Ctx();

if (verb === "live") {
  const live = await liveJobs(V1_SOURCES, ctx);
  out(live, [
    ...live.jobs.map((j) => `job   ${j.source.padEnd(8)} ${j.state.padEnd(12)} ${j.lane.padEnd(14)} ${j.title}${j.laneFrom === undefined ? "" : `  (lane: ${j.laneFrom})`}`),
    ...live.weir.map((w) => `weir  ${w.source.padEnd(8)} ${w.kind.padEnd(12)} ${`${w.pending} pending`.padEnd(14)} ${w.title}`),
    ...live.slots.map((s) => `slot  ${s.source.padEnd(8)} ${s.status.padEnd(12)} ${s.publishAt.slice(0, 16).padEnd(14)} ${s.title}`),
    ...live.holds.map((h) => `hold  ${h.source.padEnd(8)} ${h.owner.padEnd(12)} ${`${h.amount} ${h.unit}`.padEnd(14)} ${h.spendClass} ${h.id}`),
    ...live.failures.map((f) => `FAIL  ${f.source}: ${f.error}`),
    `${live.jobs.length} live job(s), ${live.weir.length} Weir pile(s), ${live.slots.length} open slot(s), ${live.holds.length} hold(s), ${live.failures.length} source(s) unreadable`,
  ]);
  process.exit(live.failures.length > 0 ? 1 : 0);
}

const k = kernel();
if (!k.ok) fail(`cannot open the kernel store: ${k.error.message}`);
const s = k.value.store;
const report = await syncV1(s, V1_SOURCES, ctx);
if (!report.ok) {
  closeKernel();
  fail(report.error.message);
}
const table = [
  `store ${s.location} · universe ${report.value.universe}`,
  `${"source".padEnd(10)}${"records".padStart(8)}${"events".padStart(8)}${"appended".padStart(10)}${"existing".padStart(10)}${"drifted".padStart(9)}${"skipped".padStart(9)}${"live".padStart(6)}${"weir".padStart(6)}  failed`,
  ...report.value.sources.map(
    (r) =>
      `${r.source.padEnd(10)}${String(r.records).padStart(8)}${String(r.events).padStart(8)}${String(r.appended).padStart(10)}${String(r.existing).padStart(10)}${String(r.drifted).padStart(9)}${String(r.skipped).padStart(9)}${String(r.live).padStart(6)}${String(r.weir).padStart(6)}  ${r.failed === undefined ? "-" : `${r.failed.class} (streak ${r.streak}): ${r.failed.error}`}`,
  ),
];

if (verb === "sync") {
  closeKernel();
  out(report.value, table);
  process.exit(report.value.failed > 0 ? 1 : 0);
}

// reconcile: a SECOND read of every source, so the tally is the v1 store's own
// count and not the projection the sync just appended.
const reads = await readAll(V1_SOURCES, ctx);
const rec = reconcile(s, reads, flag("--exact"));
closeKernel();
if (!rec.ok) fail(rec.error.message);
out({ sync: report.value, reconcile: rec.value }, [
  ...table,
  "",
  ...rec.value.sources.flatMap((r) => [
    `${r.source}: ${r.ok ? "reconciled" : "DIFFERS"} - ${Object.entries(r.tally).map(([t, n]) => `${t} ${n}`).join(", ") || "no facts"}`,
    ...r.differences.map((d) => `   ${d.type}: v1 ${d.v1}, ledger ${d.ledger}`),
  ]),
]);
process.exit(report.value.failed > 0 || !rec.value.ok ? 1 : 0);
