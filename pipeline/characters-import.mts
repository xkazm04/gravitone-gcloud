// CHARACTERS-IMPORT - the character record's importers (spark concept-casting-stages S2).
//
//   node pipeline/characters-import.mts --dry-run [--pool <pool>] [--list]
//   node pipeline/characters-import.mts (--store <file> | --real) [--pool <pool>]
//
// Pools: scout-character, codex-kept, muse-army (default: all, in that order). Parody-cast is REFUSED, by name: its
// references are fan-site images, and a found picture never becomes a character's reference (lib/library/characterPools.ts).
//
// DRY-RUN writes nothing and opens no store: it runs the real importer against a throwaway in-memory kernel with
// stand-in blob refs built from file sizes, so it lists what an empty store would take. Idempotent otherwise: running
// twice changes nothing, and an edited source updates its record by its stable source key. Without --store or --real
// the script refuses, as library-sync does.
//
//   Exit 0 ok · 1 a pool failed · 2 usage or could not run.
//
// PLAIN `node`: lib-hooks gives this process what Next gives the server.

import "./lib-hooks.mts";

import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string): boolean => args.includes(name);

const known = new Set(["--dry-run", "--store", "--real", "--pool", "--list"]);
const unknown = args.filter((a, i) => !known.has(a) && !["--store", "--pool"].includes(args[i - 1] ?? ""));
if (unknown.length > 0) {
  console.error(`usage: node pipeline/characters-import.mts --dry-run|--store <file>|--real [--pool <pool>] [--list]  (unknown: ${unknown.join(" ")})`);
  process.exit(2);
}

const dry = flag("--dry-run");
const named = value("--store");
if (named !== undefined) process.env["GRAVITONE_STORE_PATH"] = path.resolve(named);
if (!dry && process.env["GRAVITONE_STORE_PATH"] === undefined && !flag("--real")) {
  console.error("characters-import: name the store: --store <file> (or GRAVITONE_STORE_PATH), --real for the app's own, or --dry-run. Refusing to open the default store.");
  process.exit(2);
}

const { POOLS, poolRoots, readPool, refusalOfPool } = await import("../lib/library/characterPools.ts");
const asked = value("--pool");
if (asked !== undefined) {
  const refused = refusalOfPool(asked);
  if (refused !== undefined) {
    console.error(`characters-import: ${refused}`);
    process.exit(2);
  }
  if (!POOLS.includes(asked as (typeof POOLS)[number])) {
    console.error(`characters-import: no pool named ${asked} (pools: ${POOLS.join(", ")})`);
    process.exit(2);
  }
}
const pools = asked === undefined ? POOLS : POOLS.filter((p) => p === asked);

const { importRows, blobIngest } = await import("../lib/library/characters.ts");
const { openKernel } = await import("../packages/kernel/src/kernel.ts");
const { blobStore } = await import("../packages/kernel/src/blob.ts");
const { blobRootOf, storeLocation } = await import("../lib/kernelStore.ts");

type Ingest = Parameters<typeof importRows>[2];

/** Stand-in refs for a dry run: real sizes, no bytes read and no blob written. */
const dryIngest: Ingest = async (row) => {
  const images = await Promise.all(
    row.files.map(async (f) => {
      const st = await stat(f.abs);
      return { role: f.role, blob: { sha256: createHash("sha256").update(`${f.abs}|${st.size}`).digest("hex"), bytes: st.size, mime: "image/png" } };
    }),
  );
  return { ok: true as const, value: images };
};

const location = dry ? ":memory:" : storeLocation();
const k = openKernel(location);
if (!k.ok) {
  console.error(`characters-import: cannot open ${location}: ${k.error.message}`);
  process.exit(2);
}
const store = k.value.store;
const ingest = dry ? dryIngest : blobIngest(blobStore(blobRootOf(store)));

console.log(dry ? "DRY RUN against an empty throwaway store: nothing is written." : `importing into ${location}`);
let failed = false;
for (const pool of pools) {
  const read = await readPool(pool, poolRoots());
  if (!read.ok) {
    console.error(`${pool}: ${read.error.message}`);
    failed = true;
    continue;
  }
  if (flag("--list")) for (const r of read.value.rows) console.log(`  ${pool}  ${r.sourceKey}  ${r.card.name}  ${r.files.length} picture(s)${r.samePerson === undefined ? "" : `  same person as ${r.samePerson}`}`);
  const done = await importRows(store, read.value.rows, ingest);
  if (!done.ok) {
    console.error(`${pool}: ${done.error.message}`);
    failed = true;
    continue;
  }
  const skipped = [...read.value.skipped, ...done.value.skipped];
  console.log(`${pool}: read ${read.value.rows.length} · added ${done.value.added} · updated ${done.value.updated} · unchanged ${done.value.unchanged} · covered by a kept set ${done.value.covered} · skipped ${skipped.length}`);
  for (const s of skipped) console.log(`  skipped ${s.id}: ${s.reason}`);
}
k.value.close();
process.exit(failed ? 1 : 0);
