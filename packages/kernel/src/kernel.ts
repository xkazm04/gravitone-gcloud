import { err, ok, type Result } from "@gt/domain/errors";
import { calibrationMigrations } from "./calibration/series.ts";
import { decisionMigrations } from "./decision/schema.ts";
import { eventsMigrations } from "./events.ts";
import { ingestMigrations } from "./ingest.ts";
import { jobMigrations } from "./job.ts";
import { leaseMigrations } from "./lease.ts";
import { migrate, type MigrateOptions, type MigrateReport, type ModuleMigrations } from "./migrate.ts";
import { receiptsMigrations } from "./pricing/receipts.ts";
import { partsMigrations } from "./parts/schema.ts";
import { recordsMigrations } from "./records/schema.ts";
import { spendMigrations } from "./spend/ledger.ts";
import { openStore, type Store, type StoreOptions } from "./store.ts";
import { tokenMigrations } from "./token.ts";

// THE KERNEL, OPENED - one store, every module's schema, in one call.
//
// Until now each test file assembled its own migration list (job-fixture's
// KERNEL, decision.fixtures' MODULES, dryrun's three) and nothing assembled the
// whole one, because nothing ran the whole kernel. The app, the CLIs and the
// workers now do, and three hand-kept copies of "which modules exist" would be
// three ways to open a store that is missing a table. v1 had the same hazard
// in another shape: every store under foundry-out/ created its own directory
// on first write, so a reader that ran before its writer found nothing and
// read it as "empty" (lib/fixtures/roots.ts documents the roots it had to
// keep in step by hand). Here a missing module is a missing TABLE, which a
// query reports loudly - but only after the store opened and said it was ready.
//
// ORDER IS DECLARED, NOT REMEMBERED. Each module names what its schema and
// its writers lean on (`after`): every module appends to `events` inside its
// own transactions, the job driver claims leases and books spend, and the
// calibration series reads the decision log for its labels. `kernelModules()`
// refuses an order in which a module runs before something it names, so the
// list below cannot be "fixed" by moving a line and hoping. The set itself is
// pinned by test/kernel.test.ts, which imports every module under src/ and
// fails when one exports migrations this list does not carry.

type Entry = { readonly migrations: ModuleMigrations; readonly after: readonly string[] };

const DECLARED: readonly Entry[] = [
  { migrations: eventsMigrations, after: [] },
  { migrations: ingestMigrations, after: ["events"] },
  { migrations: leaseMigrations, after: ["events"] },
  { migrations: spendMigrations, after: ["events"] },
  { migrations: jobMigrations, after: ["events", "lease", "spend"] },
  { migrations: recordsMigrations, after: ["events", "job"] },
  { migrations: partsMigrations, after: ["events", "records"] },
  { migrations: receiptsMigrations, after: ["events"] },
  { migrations: decisionMigrations, after: ["events"] },
  { migrations: calibrationMigrations, after: ["events", "decision"] },
  { migrations: tokenMigrations, after: ["events"] },
];

/** The pure check: `entries` in an order where every module follows what it names. */
export function orderModules(entries: readonly Entry[]): Result<readonly ModuleMigrations[]> {
  const seen = new Set<string>();
  const known = new Set(entries.map((e) => e.migrations.module));
  for (const e of entries) {
    for (const dep of e.after) {
      if (!known.has(dep)) return err("internal", `kernel: ${e.migrations.module} runs after "${dep}", which is not a kernel module`);
      if (!seen.has(dep)) return err("internal", `kernel: ${e.migrations.module} is declared before "${dep}", which it runs after`);
    }
    seen.add(e.migrations.module);
  }
  return ok(entries.map((e) => e.migrations));
}

/** Every kernel module's migrations, in dependency order. */
export function kernelModules(): Result<readonly ModuleMigrations[]> {
  return orderModules(DECLARED);
}

export type KernelOptions = StoreOptions & MigrateOptions;

export type Kernel = {
  readonly store: Store;
  /** What this open applied; empty when the store was already current. */
  readonly migrated: MigrateReport;
  close(): void;
};

/**
 * Open the store at `location` (":memory:" or an absolute file path) and bring
 * every kernel module's schema up to date before handing it out. A store that
 * cannot migrate is closed again and never returned: a half-ready kernel would
 * answer reads against tables that are not there yet.
 */
export function openKernel(location: string, opts: KernelOptions = {}): Result<Kernel> {
  const modules = kernelModules();
  if (!modules.ok) return modules;
  const opened = openStore(location, opts);
  if (!opened.ok) return opened;
  const store = opened.value;
  const migrated = migrate(store, modules.value, opts);
  if (!migrated.ok) {
    store.close();
    return migrated;
  }
  return ok({ store, migrated: migrated.value, close: () => store.close() });
}
