// node pipeline/import/runs.mts [--yes] [--only forge,extract,...] [--fixtures] [--store <file>] [--json]
//
// THE ONE-TIME RUNS IMPORTER (Phase 4 wave D, L42; plan §6 Phase 4: "`foundry-out/*` stores are
// imported by one-time scripts"). Every v1 run that predates the job system - forge runs, extract
// runs, Dojo cycles, strips runs, article runs, music-video and Suno jobs - becomes a Run row and
// ONE terminal job (done or failed as v1 recorded it, `imported: true`), so Runs and the Ledger
// show the history (lib/import/runs.ts says what is skipped and why). The artefacts stay where
// they are and NO `MIGRATED` marker is written: the v1 stores still serve (COMMON decision 9).
//
// DRY BY DEFAULT: without `--yes` it reads every store and reports what it WOULD import, writing
// nothing. Idempotent: a second `--yes` imports nothing it imported before.
// Exit 0 done (or nothing to do), 1 a store could not be read or a run was refused, 2 usage.
// `--store <file>` is GRAVITONE_STORE_PATH; `--fixtures` reads the fixture universe's stores.

import "../lib-hooks.mts";

import path from "node:path";

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const json = flag("--json");
const SOURCES = ["forge", "extract", "dojo", "strips", "article", "mv", "suno"] as const;
type Source = (typeof SOURCES)[number];
const isSource = (s: string): s is Source => SOURCES.some((x) => x === s);
const VALUED = new Set(["--only", "--store"]);
const known = new Set(["--yes", "--dry", "--json", "--fixtures", ...VALUED]);
const unknown = args.filter((a, i) => !known.has(a) && !VALUED.has(args[i - 1] ?? ""));
const only = value("--only")?.split(",").map((s) => s.trim()).filter((s) => s !== "");
const badOnly = only?.filter((s) => !isSource(s)) ?? [];
if (unknown.length > 0 || badOnly.length > 0 || (flag("--only") && only === undefined) || (flag("--store") && value("--store") === undefined) || (flag("--yes") && flag("--dry"))) {
  console.error(`usage: node pipeline/import/runs.mts [--yes | --dry] [--only ${SOURCES.join(",")}] [--fixtures] [--store <file>] [--json]${unknown.length + badOnly.length > 0 ? `  (unknown: ${[...unknown, ...badOnly].join(" ")})` : ""}`);
  process.exit(2);
}
// Read at import by lib/fixtures/mode.ts, so it is set before anything below loads.
if (flag("--fixtures")) process.env["NEXT_PUBLIC_GRAVITONE_DATA"] = "fixtures";
const storeArg = value("--store");
if (storeArg !== undefined) process.env["GRAVITONE_STORE_PATH"] = path.resolve(storeArg);
const dry = !flag("--yes");

function out(doc: unknown, lines: readonly string[]): void {
  if (json) process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
  else for (const l of lines) console.log(l);
}

const { kernel, closeKernel, storeLocation } = await import("../../lib/kernelStore.ts");
const { listV1Runs } = await import("../../lib/import/runSources.ts");
const { importRuns } = await import("../../lib/import/runs.ts");

const listed = await listV1Runs(only?.filter(isSource));
if (!listed.ok) {
  out({ error: listed.error.message }, [`import runs: ${listed.error.message}`]);
  process.exit(1);
}
const k = kernel();
if (!k.ok) {
  out({ error: k.error.message }, [`import runs: cannot open the kernel store at ${storeLocation()}: ${k.error.message}`]);
  process.exit(1);
}
const r = importRuns(k.value.store, listed.value.runs, { dry, now: Date.now() });
closeKernel();
if (!r.ok) {
  out({ error: r.error.message }, [`import runs: ${r.error.message}`]);
  process.exit(1);
}
const count = (o: string) => r.value.filter((x) => x.outcome === o).length;
const refused = count("refused");
out(
  { dry, store: storeLocation(), runs: r.value, unread: listed.value.unread },
  [
    ...r.value.map((x) => `${x.outcome.padEnd(13)} ${x.source.padEnd(8)} ${(x.state ?? "").padEnd(7)} ${x.runId}${x.reason === undefined ? "" : `  - ${x.reason}`}`),
    ...listed.value.unread.map((u) => `unread        ${u}`),
    `${dry ? `${count("would-import")} would be imported (dry - nothing written; --yes writes)` : `${count("imported")} imported`}, ${count("skipped")} skipped, ${refused} refused, ${listed.value.unread.length} unread - ${storeLocation()}`,
  ],
);
process.exit(refused > 0 || listed.value.unread.length > 0 ? 1 : 0);
