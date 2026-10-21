// node pipeline/import/styles.mts [--yes | --dry] [--from <styles.json>] [--fixtures] [--store <file>] [--json]
// node pipeline/import/styles.mts --export-to <file> [--store <file>] [--json]
//
// THE ONE-TIME STYLES IMPORTER (Phase 5 decision 3), and the hand-edit path after it.
// pipeline/foundry/styles.json was the catalogue's truth; the kernel store's `styles` table is
// now, and the file is its export. This brings every v1 entry in: evidence `by` human/absent ->
// operator, model -> agent; exemplar files (foundry-out/extract/<run>/...) -> blobs, a file not on
// this machine reported and left out; status RE-DERIVED from the evidence, a v1 status the
// evidence does not support reported. Then it re-exports styles.json from the store.
//
// IDEMPOTENT, and that is what makes it the hand-edit door too: an id the store holds takes only
// the catalogue half (name, family, recipe, negative, observables) - forge.py's workflow is "edit
// the recipe in styles.json before forging", and re-running this carries the edit in. Evidence,
// exemplars, proofs and a lock are the store's own now; a stale file never rewinds them, and a
// locked style's catalogue half is refused.
//
// DRY BY DEFAULT: without `--yes` it reports what it WOULD do and writes nothing (not the store,
// not the export). `--export-to` only re-exports (packages/kernel/py/styles.py calls it after a
// Python write, so the export has one implementation).
// Exit 0 done (or nothing to do), 1 an entry or the export was refused, 2 usage.

import "../lib-hooks.mts";

import { readFileSync } from "node:fs";
import path from "node:path";
import { errorMessage } from "@gt/domain/errors";

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const VALUED = new Set(["--from", "--store", "--export-to"]);
const known = new Set(["--yes", "--dry", "--json", "--fixtures", ...VALUED]);
const unknown = args.filter((a, i) => !known.has(a) && !VALUED.has(args[i - 1] ?? ""));
const missingValue = [...VALUED].some((v) => flag(v) && (value(v) === undefined || VALUED.has(value(v) ?? "")));
if (unknown.length > 0 || missingValue || (flag("--yes") && flag("--dry")) || (flag("--export-to") && (flag("--yes") || flag("--from")))) {
  console.error(`usage: node pipeline/import/styles.mts [--yes | --dry] [--from <styles.json>] [--fixtures] [--store <file>] [--json]\n       node pipeline/import/styles.mts --export-to <file> [--store <file>] [--json]${unknown.length ? `  (unknown: ${unknown.join(" ")})` : ""}`);
  process.exit(2);
}
// Read at import by lib/fixtures/mode.ts, so it is set before anything below loads.
if (flag("--fixtures")) process.env["NEXT_PUBLIC_GRAVITONE_DATA"] = "fixtures";
const storeArg = value("--store");
if (storeArg !== undefined) process.env["GRAVITONE_STORE_PATH"] = path.resolve(storeArg);
const json = flag("--json");
const dry = !flag("--yes");

function out(doc: unknown, lines: readonly string[]): void {
  if (json) process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
  else for (const l of lines) console.log(l);
}

const { kernel, closeKernel, storeLocation } = await import("../../lib/kernelStore.ts");
const { writeStylesExport } = await import("../../packages/kernel/src/styles/export.ts");

const k = kernel();
if (!k.ok) {
  out({ error: k.error.message }, [`styles: cannot open the kernel store at ${storeLocation()}: ${k.error.message}`]);
  process.exit(1);
}
const store = k.value.store;

const exportTo = value("--export-to");
if (exportTo !== undefined) {
  const r = writeStylesExport(store, path.resolve(exportTo));
  closeKernel();
  if (!r.ok) {
    out({ error: r.error.message }, [`styles: export refused: ${r.error.message}`]);
    process.exit(1);
  }
  out({ file: path.resolve(exportTo), ...r.value }, [`styles: ${r.value.changed ? "exported" : "unchanged"} ${r.value.styles} style(s) at rev ${r.value.rev} -> ${path.resolve(exportTo)}`]);
  process.exit(0);
}

const { foundryFile } = await import("../../lib/foundry/runStore.ts");
const { exportStyles, importStylesText, STYLES_FILE } = await import("../../lib/foundry/catalogue.ts");
const from = path.resolve(value("--from") ?? foundryFile(STYLES_FILE));
let text: string;
try {
  text = readFileSync(from, "utf8");
} catch (e) {
  out({ error: String(e) }, [`styles: cannot read ${from}: ${errorMessage(e)}`]);
  closeKernel();
  process.exit(1);
}
let plan: Awaited<ReturnType<typeof importStylesText>>;
try {
  plan = await importStylesText(store, text, { dry, by: { kind: "operator", id: "import/styles" } });
} catch (e) {
  out({ error: errorMessage(e) }, [`styles: ${errorMessage(e)}`]);
  closeKernel();
  process.exit(1);
}
let exported: { rev: number; changed: boolean } | null = null;
let exportError: string | null = null;
if (!dry) {
  try {
    exported = exportStyles(store);
  } catch (e) {
    exportError = errorMessage(e);
  }
}
closeKernel();
const count = (r: string) => plan.outcomes.filter((o) => o.result === r).length;
const refused = count("refused") + plan.refused.length;
const verb = (r: string) => (dry ? { created: "would create", edited: "would edit", same: "same", refused: "refused" }[r] ?? r : r);
out(
  { dry, from, store: storeLocation(), outcomes: plan.outcomes, unreadable: plan.refused, exported, exportError },
  [
    ...plan.outcomes.map((o) => `${verb(o.result).padEnd(13)} ${o.id}${o.detail === undefined ? "" : `  - ${o.detail}`}${o.missing.length ? `  (${o.missing.length} exemplar file(s) not on this machine: ${o.missing.slice(0, 3).join(", ")}${o.missing.length > 3 ? ", …" : ""})` : ""}${o.statusChanged ? "  (status re-derived from its evidence)" : ""}`),
    ...plan.refused.map((r) => `unreadable    styles[${r.index}]  - ${r.message}`),
    `${count("created")} ${dry ? "to create" : "created"}, ${count("edited")} ${dry ? "to edit" : "edited"}, ${count("same")} same, ${refused} refused${dry ? " (dry - nothing written; --yes writes)" : exported ? `; styles.json ${exported.changed ? "re-exported" : "unchanged"} at rev ${exported.rev}` : ""}${exportError ? `; EXPORT FAILED: ${exportError}` : ""} - ${storeLocation()}`,
  ],
);
process.exit(refused > 0 || exportError !== null ? 1 : 0);
