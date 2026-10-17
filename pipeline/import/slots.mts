// node pipeline/import/slots.mts [--yes | --dry] [--from <publish root>] [--store <file>] [--json]
//
// THE ONE-TIME CALENDAR IMPORTER (Phase 6, L57; owner ruling 3). v1's schedule.json,
// publications.json and metrics.json become rows in the kernel's slot tables
// (lib/publish/import.ts says what changes shape and why), and a real import that refused
// nothing leaves a MIGRATED marker in the publish root (plan §5.3).
//
// DRY BY DEFAULT: without `--yes` it reads everything and reports what it WOULD import, writing
// nothing - no rows, no marker. Idempotent: a second `--yes` imports nothing it imported before.
// For a rehearsal, point it at COPIES: `--store <copy of gravitone.sqlite> --from <copy of the
// publish root>` - `--from` is PUBLISH_STORE_DIR, `--store` is GRAVITONE_STORE_PATH.
// Exit 0 done (or nothing to do), 1 a file could not be read or a row was refused, 2 usage.

import "../lib-hooks.mts";

import path from "node:path";

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const json = flag("--json");
const VALUED = new Set(["--from", "--store"]);
const known = new Set(["--yes", "--dry", "--json", ...VALUED]);
const unknown = args.filter((a, i) => !known.has(a) && !VALUED.has(args[i - 1] ?? ""));
if (unknown.length > 0 || (flag("--from") && value("--from") === undefined) || (flag("--store") && value("--store") === undefined) || (flag("--yes") && flag("--dry"))) {
  console.error(`usage: node pipeline/import/slots.mts [--yes | --dry] [--from <publish root>] [--store <file>] [--json]${unknown.length > 0 ? `  (unknown: ${unknown.join(" ")})` : ""}`);
  process.exit(2);
}
const from = value("--from");
if (from !== undefined) process.env["PUBLISH_STORE_DIR"] = path.resolve(from);
const storeArg = value("--store");
if (storeArg !== undefined) process.env["GRAVITONE_STORE_PATH"] = path.resolve(storeArg);
const dry = !flag("--yes");

function out(doc: unknown, lines: readonly string[]): void {
  if (json) process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
  else for (const l of lines) console.log(l);
}

const { kernel, closeKernel, storeLocation } = await import("../../lib/kernelStore.ts");
const { storeRoot } = await import("../../lib/publish/store.ts");
const { importCalendar } = await import("../../lib/publish/import.ts");

const root = storeRoot();
const k = kernel();
if (!k.ok) {
  out({ error: k.error.message }, [`import slots: cannot open the kernel store at ${storeLocation()}: ${k.error.message}`]);
  process.exit(1);
}
const r = importCalendar(k.value.store, root, { dry, now: new Date() });
closeKernel();
if (!r.ok) {
  out({ error: r.error.message }, [`import slots: ${r.error.message}`]);
  process.exit(1);
}
const v = r.value;
const count = (o: string) => v.outcomes.filter((x) => x.outcome === o).length;
const refused = count("refused");
out(
  { store: storeLocation(), ...v },
  [
    ...v.outcomes.map((x) => `${x.outcome.padEnd(13)} ${x.kind.padEnd(12)} ${x.id}${x.reason === undefined ? "" : `  - ${x.reason}`}`),
    ...v.sideFiles.map((f) => `kept          ${f.dir.padEnd(12)} ${f.slotId}${f.slotImported ? "" : "  - its slot is not in the store"}`),
    `${dry ? `${count("would-import")} would be imported (dry - nothing written; --yes writes)` : `${count("imported")} imported`}, ${count("skipped")} skipped, ${refused} refused - ${root} -> ${storeLocation()}`,
    ...(v.marked !== undefined ? [`marked ${v.marked}`] : v.alreadyMarked ? [`${root} was already marked MIGRATED`] : []),
  ],
);
process.exit(refused > 0 ? 1 : 0);
