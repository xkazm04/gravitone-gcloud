import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import { sha256Hex } from "./canonical.ts";
import type { Store } from "./store.ts";

// MIGRATIONS - append-only, owned per module, recorded in the store itself.
//
// v1 had no schema to migrate: its stores were JSON files whose shape a reader
// tolerated (lib/foundry/catalogue.ts's EMPTY defaults, `_rev ?? 0`). What it
// did have is the rule this module keeps: a write-ahead record that lets a
// retried step converge instead of running twice (the catalogue journal's
// reused revision). Here that record is the `_migrations` ledger, and a step
// and its ledger row commit in ONE transaction, the row as the LAST write: a
// crash before COMMIT leaves neither, so a retry re-runs the whole step and
// never finds half of it (migrations: transactional-ddl).
//
// The runner has exactly three outcomes (migrations: error-propagation):
// nothing pending, applied a..b, or failed at one step - and it REFUSES rather
// than guesses when:
//   - a recorded step's digest differs from the code's: a shipped step was
//     edited, and re-running or skipping it would both be silent lies;
//   - the store records a version this code does not know (store newer than code);
//   - the ledger is unreadable - that is not "nothing to do";
//   - a failure mark stands from an earlier run (cleared by an operator act).
//
// A step is SQL text only. A function step would need a digest of its source,
// and Next (SWC) and Node (type stripping) render the same function to
// different text, so a store migrated by the CLI would read as edited to the
// app. A data step, when one is needed, will name an explicit digest key.
//
// A step cannot toggle `PRAGMA foreign_keys` (a no-op inside a transaction); a
// table rebuild uses `PRAGMA defer_foreign_keys = ON` within its step instead.

export type MigrationStep = { readonly version: number; readonly sql: string };
export type ModuleMigrations = { readonly module: string; readonly steps: readonly MigrationStep[] };

export type Applied = { readonly module: string; readonly version: number };
export type MigrateReport = { readonly applied: readonly Applied[]; readonly snapshot?: string };

export type MigrateOptions = {
  /** Where pre-migration snapshots of a file store go; default: beside the store. */
  readonly snapshotDir?: string;
  /** How many snapshots of this store to keep; older ones are removed. */
  readonly keepSnapshots?: number;
};

const MODULE_RE = /^[a-z][a-z0-9-]*$/;
const KEEP_SNAPSHOTS = 5;

const LEDGER_DDL = `
CREATE TABLE IF NOT EXISTS _migrations (
  module TEXT NOT NULL, version INTEGER NOT NULL, digest TEXT NOT NULL, at TEXT NOT NULL,
  PRIMARY KEY (module, version)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS _migration_failures (
  module TEXT PRIMARY KEY, version INTEGER NOT NULL, at TEXT NOT NULL, reason TEXT NOT NULL
) WITHOUT ROWID;`;

const ledgerRow = z.object({ module: z.string(), version: z.number().int().positive(), digest: z.string() });
const failureRow = z.object({ module: z.string(), version: z.number().int(), at: z.string(), reason: z.string() });

/** A step's digest. Line endings are normalised first: git's autocrlf must not
 *  turn a Windows checkout's migrations into "edited" ones. */
export function stepDigest(step: MigrationStep): string {
  return sha256Hex(step.sql.replace(/\r\n/g, "\n"));
}

type Recorded = { module: string; version: number; digest: string };
type Failure = z.output<typeof failureRow>;
type Pending = { module: string; step: MigrationStep; digest: string };

/** The pure half: which steps run, or why none may. */
export function planMigrations(
  modules: readonly ModuleMigrations[],
  recorded: readonly Recorded[],
  failures: readonly Failure[],
): Result<readonly Pending[]> {
  const stood = failures[0];
  if (stood !== undefined) {
    return err("refused", `migration ${stood.module} v${stood.version} failed at ${stood.at} and its mark stands: ${stood.reason}`);
  }
  const seen = new Set<string>();
  const pending: Pending[] = [];
  for (const m of modules) {
    if (!MODULE_RE.test(m.module)) return err("invalid", `migrations: module name "${m.module}" is not kebab-case`);
    if (seen.has(m.module)) return err("invalid", `migrations: module ${m.module} declared twice`);
    seen.add(m.module);
    for (const [i, s] of m.steps.entries()) {
      if (s.version !== i + 1) return err("invalid", `migrations: ${m.module} step ${i + 1} declares version ${s.version}; versions run 1..n with no gaps or repeats`);
    }
    const mine = recorded.filter((r) => r.module === m.module).sort((a, b) => a.version - b.version);
    for (const [i, r] of mine.entries()) {
      if (r.version !== i + 1) return err("refused", `migrations: the ledger for ${m.module} skips to v${r.version}; it is damaged`);
      const step = m.steps[i];
      if (step === undefined) {
        return err("refused", `migrations: the store has ${m.module} at v${mine.length}, this code knows v${m.steps.length}; the store is newer than the code`);
      }
      if (stepDigest(step) !== r.digest) {
        return err("refused", `migrations: ${m.module} v${r.version} was edited after it ran (digest ${r.digest.slice(0, 12)} recorded, ${stepDigest(step).slice(0, 12)} now); append a new step instead`);
      }
    }
    for (const step of m.steps.slice(mine.length)) pending.push({ module: m.module, step, digest: stepDigest(step) });
  }
  return ok(pending);
}

function readLedger(store: Store): Result<{ recorded: Recorded[]; failures: Failure[] }> {
  const boot = store.tx((t) => t.exec(LEDGER_DDL));
  if (!boot.ok) return boot;
  const rows = store.read((r) => ({
    recorded: r.all("SELECT module, version, digest FROM _migrations"),
    failures: r.all("SELECT module, version, at, reason FROM _migration_failures ORDER BY module"),
  }));
  if (!rows.ok) return rows;
  const recorded: Recorded[] = [];
  for (const row of rows.value.recorded) {
    const p = parseAt("migrations ledger", ledgerRow, row);
    if (!p.ok) return err("refused", `migrations: the ledger is unreadable: ${p.error.message}`);
    recorded.push(p.value);
  }
  const failures: Failure[] = [];
  for (const row of rows.value.failures) {
    const p = parseAt("migrations failure mark", failureRow, row);
    if (!p.ok) return err("refused", `migrations: a failure mark is unreadable: ${p.error.message}`);
    failures.push(p.value);
  }
  return ok({ recorded, failures });
}

/** The snapshot's file name: the store's, the time, and a 12-hex digest of
 *  the plan (`module@from-to` per module). The plan used to be spelled out in
 *  full, and with every kernel module pending at once the name alone ran past
 *  Windows' 260-character path limit under a temp directory; the digest keeps
 *  two different plans apart at a fixed length. The time comes first, so a
 *  name sort is a time sort and rotation keeps the newest. */
export function snapshotName(base: string, pending: readonly Pending[], at: string): string {
  const span = new Map<string, [number, number]>();
  for (const p of pending) {
    const s = span.get(p.module);
    span.set(p.module, s === undefined ? [p.step.version - 1, p.step.version] : [s[0], p.step.version]);
  }
  const plan = [...span].map(([m, [from, to]]) => `${m}@${from}-${to}`).join("+");
  return `${base}.pre-migrate.${at.replace(/[:.]/g, "")}.${sha256Hex(plan).slice(0, 12)}.sqlite`;
}

function rotate(dir: string, base: string, keep: number): void {
  const mine = readdirSync(dir).filter((f) => f.startsWith(`${base}.pre-migrate.`)).sort();
  for (const f of mine.slice(0, Math.max(0, mine.length - keep))) rmSync(path.join(dir, f), { force: true });
}

/**
 * Bring the store up to every module's newest step. A file store that has
 * applied a step before is snapshotted (VACUUM INTO, integrity-checked) before
 * the first pending step; if the snapshot fails, nothing runs. A store with no
 * applied step is not: it holds nothing a migration could damage, and its
 * snapshot would be an empty file per fresh store (every test, every new cell).
 */
export function migrate(store: Store, modules: readonly ModuleMigrations[], opts: MigrateOptions = {}): Result<MigrateReport> {
  const ledger = readLedger(store);
  if (!ledger.ok) return ledger;
  const plan = planMigrations(modules, ledger.value.recorded, ledger.value.failures);
  if (!plan.ok) return plan;
  const pending = plan.value;
  if (pending.length === 0) return ok({ applied: [] });

  let snapshot: string | undefined;
  if (store.location !== ":memory:" && ledger.value.recorded.length > 0) {
    const dir = opts.snapshotDir ?? path.dirname(store.location);
    const stamp = store.read((r) => r.at);
    if (!stamp.ok) return stamp;
    snapshot = path.join(dir, snapshotName(path.basename(store.location), pending, stamp.value));
    const snap = store.snapshot(snapshot);
    if (!snap.ok) return err("refused", `migrations: no step ran, the pre-migration snapshot failed: ${snap.error.message}`, { cause: snap.error });
    rotate(dir, path.basename(store.location), opts.keepSnapshots ?? KEEP_SNAPSHOTS);
  }

  const applied: Applied[] = [];
  for (const p of pending) {
    const step = store.tx((t) => {
      t.exec(p.step.sql);
      // The ledger row is the LAST write of the step's transaction.
      t.run("INSERT INTO _migrations (module, version, digest, at) VALUES (?, ?, ?, ?)", p.module, p.step.version, p.digest, t.at);
    });
    if (!step.ok) {
      // The mark is written OUTSIDE the failed step's transaction, or its
      // rollback would erase it; it stops every later run until cleared.
      const mark = store.tx((t) => {
        t.run("INSERT OR REPLACE INTO _migration_failures (module, version, at, reason) VALUES (?, ?, ?, ?)", p.module, p.step.version, t.at, step.error.message);
      });
      const tail = mark.ok ? "" : ` (and its failure mark could not be written: ${mark.error.message})`;
      return err(step.error.code, `migrations: ${p.module} v${p.step.version} failed after ${applied.length} step(s) applied: ${step.error.message}${tail}`, { cause: step.error });
    }
    applied.push({ module: p.module, version: p.step.version });
  }
  return ok(snapshot === undefined ? { applied } : { applied, snapshot });
}

/** The operator's act after fixing what failed: lets `migrate` run again. */
export function clearMigrationFailure(store: Store, module: string): Result<boolean> {
  return store.tx((t) => t.run("DELETE FROM _migration_failures WHERE module = ?", module).changes > 0);
}

/** The normalised schema, for drift checks: a fresh store and a migrated one must agree. */
export function schemaOf(store: Store): Result<string[]> {
  return store.read((r) =>
    r
      .all("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
      .map((row) => `${String(row["type"])} ${String(row["name"])} ON ${String(row["tbl_name"])}: ${String(row["sql"]).replace(/\s+/g, " ").trim()}`),
  );
}
