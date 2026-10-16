// LIBRARY-SYNC - the Library projection, on demand (Phase 5, L49).
//
//   node pipeline/library-sync.mts [--fixtures] (--store <file> | --real) [--inline | --no-probe] [--probe-limit N] [--json]
//
// Reads every feed (lib/library/fresh.ts LIBRARY_FEEDS) through v1's own readers,
// ingests file media into blobs beside the store, upserts the Library index, prunes
// what a feed no longer holds, and queues one `media-facts` job for the new media's
// facts (the worker probes it on box.render, L53), then prints the per-feed table.
//
// THE STORE MUST BE NAMED. --store <file> (or GRAVITONE_STORE_PATH) for any store;
// --real to sync the app's own (<cwd>/<foundry-out|fixtures-out>/gravitone.sqlite).
// Without either the script refuses: on 2026-10-17 a library migration landed in
// the real store from a run that never meant to open it (RULES.md, Director).
//
//   --fixtures   NEXT_PUBLIC_GRAVITONE_DATA=fixtures: read fixtures-out/
//   --inline     probe the new media HERE (ffprobe/ffmpeg, bounded by --probe-limit)
//                instead of queueing the job: a seeded store with its facts in one go
//   --no-probe   neither probe nor queue (index only)
//   Exit 0 ok · 1 a feed failed · 2 usage or could not run.
//
// PLAIN `node`, as pipeline/ledger-sync.mts: lib-hooks gives this process what
// Next gives the server (server-only, extensionless imports, type transform).

import "./lib-hooks.mts";

import path from "node:path";

const args = process.argv.slice(2);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string): boolean => args.includes(name);
const json = flag("--json");
const known = new Set(["--fixtures", "--store", "--real", "--inline", "--no-probe", "--probe-limit", "--json"]);
const unknown = args.filter((a, i) => !known.has(a) && !["--store", "--probe-limit"].includes(args[i - 1] ?? ""));
const limit = Number(value("--probe-limit") ?? "200");
if (unknown.length > 0 || (flag("--store") && value("--store") === undefined) || !Number.isInteger(limit) || limit < 0 || (flag("--inline") && flag("--no-probe"))) {
  console.error(`usage: node pipeline/library-sync.mts [--fixtures] (--store <file> | --real) [--inline | --no-probe] [--probe-limit N] [--json]  (unknown: ${unknown.join(" ")})`);
  process.exit(2);
}
if (flag("--fixtures")) process.env["NEXT_PUBLIC_GRAVITONE_DATA"] = "fixtures";
const named = value("--store");
if (named !== undefined) process.env["GRAVITONE_STORE_PATH"] = path.resolve(named);
if (process.env["GRAVITONE_STORE_PATH"] === undefined && !flag("--real")) {
  console.error("library-sync: name the store: --store <file> (or GRAVITONE_STORE_PATH), or --real for the app's own. Refusing to open the default store.");
  process.exit(2);
}

const { openKernel } = await import("../packages/kernel/src/kernel.ts");
const { blobStore } = await import("../packages/kernel/src/blob.ts");
const { storeLocation } = await import("../lib/kernelStore.ts");
const { LIBRARY_FEEDS, blobRootFor, libraryCtx, queueLibraryFacts } = await import("../lib/library/fresh.ts");
const { syncLibrary } = await import("../lib/library/project.ts");
const { ffmpegProbe } = await import("../lib/producers/media-facts.ts");

const location = storeLocation();
const k = openKernel(location);
if (!k.ok) {
  console.error(`library-sync: cannot open ${location}: ${k.error.message}`);
  process.exit(2);
}
const facts = flag("--no-probe") ? {} : flag("--inline") ? { probe: ffmpegProbe(), probeLimit: limit } : { queue: queueLibraryFacts };
const report = await syncLibrary(k.value.store, blobStore(blobRootFor(location)), LIBRARY_FEEDS, libraryCtx(k.value.store), facts);
k.value.close();
if (!report.ok) {
  console.error(`library-sync: ${report.error.message}`);
  process.exit(2);
}
const failed = report.value.feeds.filter((f) => f.failed !== undefined);
if (json) process.stdout.write(`${JSON.stringify({ store: location, ...report.value }, null, 2)}\n`);
else {
  console.log(`library-sync: ${location} (${report.value.universe}) at ${report.value.at}`);
  console.log(`  ${"feed".padEnd(10)} ${"items".padStart(6)} ${"new".padStart(5)} ${"upd".padStart(5)} ${"same".padStart(6)} ${"pruned".padStart(6)} ${"blobs".padStart(6)} ${"no file".padStart(7)}  failure`);
  for (const f of report.value.feeds) {
    console.log(
      `  ${f.feed.padEnd(10)} ${String(f.items).padStart(6)} ${String(f.inserted).padStart(5)} ${String(f.updated).padStart(5)} ${String(f.unchanged).padStart(6)} ${String(f.pruned).padStart(6)} ${String(f.ingested).padStart(6)} ${String(f.missingFiles).padStart(7)}  ${f.failed ?? (f.skipped.length > 0 ? `${f.skipped.length} skipped` : "")}`,
    );
  }
  const f = report.value.facts;
  if (f !== undefined)
    console.log(
      `  media facts: ${"error" in f ? `FAILED ${f.error}` : "queue" in f ? (f.queue.kind === "none-missing" ? "none missing" : f.queue.kind === "open" ? `job ${f.queue.jobId} already ${f.queue.state}` : `queued ${f.queue.jobId}`) : `${f.probed} probed, ${f.undecodable} undecodable, ${f.failed.length} unreadable paths`}`,
    );
}
process.exit(failed.length === 0 ? 0 : 1);
