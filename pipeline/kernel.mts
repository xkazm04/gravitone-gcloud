// KERNEL - the operator's door to the store's own state.
//
//   node pipeline/kernel.mts migrations status [--json]
//   node pipeline/kernel.mts migrations clear <module> [--json]
//
// `status` lists the migration failure marks standing in the store, each with the step that failed
// and its error, and the newest pre-migration snapshot beside the store. A standing mark refuses
// every open (packages/kernel/src/migrate.ts), so the app, the worker and every CLI stop at it;
// `clear` removes one module's mark after the cause is fixed, and the next open migrates again.
//
// THE STORE: GRAVITONE_STORE_PATH, else the app's own (lib/kernelProcess.ts `storeLocation`).
// It is opened WITHOUT migrating, which is the point: the store a mark refuses is still readable here.
// EXIT 0 ok · 1 nothing to clear · 2 usage or the store could not be read.

import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

const USAGE = "usage: node pipeline/kernel.mts migrations status [--json] | migrations clear <module> [--json]";

let parsed;
try {
  parsed = parseArgs({ args: process.argv.slice(2), options: { json: { type: "boolean" } }, allowPositionals: true, strict: true });
} catch (e) {
  console.error(`kernel: ${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
  process.exit(2);
}
const json = parsed.values.json === true;
const [area, verb, module, ...extra] = parsed.positionals;
const out = (human: string, doc: unknown): void => console.log(json ? JSON.stringify(doc, null, 2) : human);

if (area !== "migrations" || extra.length > 0 || !((verb === "status" && module === undefined) || (verb === "clear" && module !== undefined))) {
  console.error(USAGE);
  process.exit(2);
}

const { storeLocation } = await import("../lib/kernelProcess.ts");
const { openStore } = await import("../packages/kernel/src/store.ts");
const { clearMigrationFailure, migrationMarks, newestSnapshot } = await import("../packages/kernel/src/migrate.ts");

const location = storeLocation();
if (location !== ":memory:" && !existsSync(location)) {
  console.error(`kernel: no store at ${location}`);
  process.exit(2);
}
const opened = openStore(location);
if (!opened.ok) {
  console.error(`kernel: cannot open ${location}: ${opened.error.message}`);
  process.exit(2);
}
const store = opened.value;
let code = 0;
try {
  const marks = migrationMarks(store);
  if (!marks.ok) throw marks.error;
  if (verb === "status") {
    const snapshot = newestSnapshot(store);
    out(
      marks.value.length === 0
        ? `no migration failure mark stands in ${location}`
        : [...marks.value.map((m) => `${m.module} v${m.version} failed at ${m.at}: ${m.reason}`), snapshot === undefined ? "no pre-migration snapshot beside the store" : `newest pre-migration snapshot: ${snapshot}`].join("\n"),
      { location, marks: marks.value, ...(snapshot === undefined ? {} : { snapshot }) },
    );
  } else {
    const cleared = clearMigrationFailure(store, module ?? "");
    if (!cleared.ok) throw cleared.error;
    out(cleared.value ? `cleared the ${module} mark; the next open migrates again` : `no mark stands for ${module}`, { location, module, cleared: cleared.value });
    code = cleared.value ? 0 : 1;
  }
} catch (e) {
  console.error(`kernel: ${e instanceof Error ? e.message : String(e)}`);
  code = 2;
} finally {
  store.close();
}
process.exitCode = code;
