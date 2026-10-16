// node pipeline/import/projects.mts <archive.gravitone> [--yes] [--store <file>] [--json]
//
// THE IMPORT'S CLI DOOR (Phase 4 wave D, L42) - the same staging and the same commit as POST
// /api/import (lib/import/serve.ts), for an archive on disk: a `.gravitone` a browser exported
// (v1's sign-out dialog, or /projects/import's second door) brought in without a browser.
// DRY BY DEFAULT: the preview - per project what it would become, its counts and its losses -
// and nothing written. `--yes` is the confirm: it commits on the preview it just read, so the
// token binds exactly what was printed. Idempotent by v1 project id: a re-run skips.
// Exit 0 every project imported or skipped, 1 the archive or a project was refused, 2 usage.

import "../lib-hooks.mts";

import { readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const json = flag("--json");
const known = new Set(["--yes", "--json", "--store"]);
const positional = args.filter((a, i) => !known.has(a) && args[i - 1] !== "--store");
if (positional.length !== 1 || positional[0]?.startsWith("--") === true || (flag("--store") && value("--store") === undefined)) {
  console.error("usage: node pipeline/import/projects.mts <archive.gravitone> [--yes] [--store <file>] [--json]");
  process.exit(2);
}
const storeArg = value("--store");
if (storeArg !== undefined) process.env["GRAVITONE_STORE_PATH"] = path.resolve(storeArg);
const file = path.resolve(positional[0] ?? "");

function out(doc: unknown, lines: readonly string[]): void {
  if (json) process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
  else for (const l of lines) console.log(l);
}
function fail(message: string, detail?: string): never {
  out({ error: message, ...(detail === undefined ? {} : { detail }) }, [`import projects: ${message}${detail === undefined ? "" : ` (${detail})`}`]);
  process.exit(1);
}

let bytes: Uint8Array;
try {
  bytes = new Uint8Array(readFileSync(file));
} catch (e) {
  fail(`cannot read ${file}: ${e instanceof Error ? e.message : String(e)}`);
}

const { closeKernel, storeLocation } = await import("../../lib/kernelStore.ts");
const { confirmLive, previewLive } = await import("../../lib/import/serve.ts");

// The process's kernel and its blob root, as the route's (lib/import/serve.ts `*Live`): the
// confirm also opens the gates a launched import's READY parts owe, as the page's does.
const preview = previewLive(bytes);
if (!preview.ok) fail(preview.error.message, preview.error.detail);
const p = preview.value;
const lines = p.projects.map((x) => `${x.outcome.padEnd(7)} ${x.id.padEnd(28)} ${x.recipe.padEnd(28)} ${x.outcome === "import" ? `${x.done.length}/${x.parts} done, ${x.held} records, ${x.blobs} blobs${x.launched ? "" : ", draft"}${x.losses.length === 0 ? "" : `, ${x.losses.length} loss(es)`}` : (x.reason ?? "")}  ${x.title}`);
if (!flag("--yes")) {
  out({ dry: true, store: storeLocation(), preview: p }, [...lines, `${p.projects.filter((x) => x.outcome === "import").length} would be imported (dry - nothing written; --yes imports) - ${storeLocation()}`]);
  closeKernel();
  process.exit(p.projects.some((x) => x.outcome === "refuse") ? 1 : 0);
}
const actor = { kind: "operator" as const, id: process.env["USERNAME"] ?? process.env["USER"] ?? "operator" };
const done = await confirmLive(bytes, p.token, actor);
closeKernel();
if (!done.ok) fail(done.error.message, done.error.detail);
if (done.value.kind === "stale") fail("the store changed between the preview and the confirm; run again");
const outcomes = done.value.outcomes;
out({ dry: false, store: storeLocation(), outcomes }, [
  ...outcomes.map((o) => `${o.outcome.padEnd(8)} ${o.id.padEnd(28)} ${o.reason ?? (o.launched ? `launched${o.ratified.length > 0 ? `, ${o.ratified.join(" ")} ratified` : ""}` : "draft")}  ${o.title}`),
  `${outcomes.filter((o) => o.outcome === "imported").length} imported, ${outcomes.filter((o) => o.outcome === "skipped").length} skipped, ${outcomes.filter((o) => o.outcome === "refused").length} refused - ${storeLocation()}`,
]);
process.exit(outcomes.some((o) => o.outcome === "refused") ? 1 : 0);
