// VENTURES-IMPORT - the channels as ventures (spark concept-casting-stages S6).
//
//   node pipeline/ventures-import.mts --dry-run
//   node pipeline/ventures-import.mts (--store <file> | --real)
//
// Reads every channel file (SCOUT_CHANNELS_DIR, else foundry-out/scout-channels) and births one kernel venture of kind
// `channel` for each, linked back by its channel id. DRY-RUN writes nothing and opens no store unless --store is named: it
// lists what an empty store would take, or, against a named store, what that one would. Repeat runs change nothing. The channel
// files stay what nights read; this changes no night (lib/foundry/scout/genres.ts headsOf).
//
//   Exit 0 ok · 1 the import failed · 2 usage or could not run.
//
// PLAIN `node`: lib-hooks gives this process what Next gives the server.

import "./lib-hooks.mts";

import path from "node:path";

const args = process.argv.slice(2);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string): boolean => args.includes(name);

const known = new Set(["--dry-run", "--store", "--real"]);
const unknown = args.filter((a, i) => !known.has(a) && args[i - 1] !== "--store");
if (unknown.length > 0) {
  console.error(`usage: node pipeline/ventures-import.mts --dry-run|--store <file>|--real  (unknown: ${unknown.join(" ")})`);
  process.exit(2);
}

const dry = flag("--dry-run");
const named = value("--store");
if (named !== undefined) process.env["GRAVITONE_STORE_PATH"] = path.resolve(named);
if (!dry && process.env["GRAVITONE_STORE_PATH"] === undefined && !flag("--real")) {
  console.error("ventures-import: name the store: --store <file> (or GRAVITONE_STORE_PATH), --real for the app's own, or --dry-run. Refusing to open the default store.");
  process.exit(2);
}

const { readChannels, channelsDir } = await import("../lib/foundry/scout/channels.ts");
const { dryImport, heldChannels, importChannels } = await import("../lib/foundry/scout/ventureImport.ts");
const { listVentures } = await import("../packages/kernel/src/ventures/store.ts");
const { openKernel } = await import("../packages/kernel/src/kernel.ts");
const { storeLocation } = await import("../lib/kernelStore.ts");

const files = await readChannels();
console.log(`${dry ? "DRY RUN " : ""}${files.length} channel(s) in ${channelsDir()}`);

const report = (lines: readonly { readonly channelId: string; readonly ventureId: string; readonly name: string; readonly outcome: string }[]): void => {
  for (const l of lines) console.log(`  ${l.outcome.padEnd(13)} ${l.channelId.padEnd(4)} -> ${l.ventureId}  ${l.name}`);
  console.log(`${lines.filter((l) => l.outcome === "imported").length} to import, ${lines.filter((l) => l.outcome === "already-there").length} already there`);
};

if (dry && named === undefined) {
  report(dryImport(files, new Map(), new Set()));
  console.log("no store was opened and nothing was written");
  process.exit(0);
}

const opened = openKernel(storeLocation());
if (!opened.ok) {
  console.error(`ventures-import: the store did not open: ${opened.error.message}`);
  process.exit(2);
}
const store = opened.value.store;
try {
  if (dry) {
    const read = store.read((r) => listVentures(r));
    if (!read.ok) throw read.error;
    report(dryImport(files, heldChannels(read.value), new Set(read.value.map((v) => v.id))));
    console.log("dry run: nothing was written");
  } else {
    const done = importChannels(store, files, { kind: "operator", id: "operator" });
    if (!done.ok) {
      console.error(`ventures-import: ${done.error.message}`);
      process.exit(1);
    }
    report(done.value);
  }
} finally {
  opened.value.close();
}
