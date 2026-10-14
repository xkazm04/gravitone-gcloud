import { readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { eventsMigrations } from "../src/events.ts";
import { clearMigrationFailure, migrate, schemaOf, stepDigest, type ModuleMigrations } from "../src/migrate.ts";
import { openStore, type Store } from "../src/store.ts";
import { must, scratch, steppingClock } from "./helpers.ts";

const tmp = scratch("migrate");
afterAll(() => tmp.dispose());
let n = 0;
const fileStore = (): Store => must(openStore(path.join(tmp.dir, `m-${++n}.sqlite`), { clock: steppingClock() }));

// A module with a history worth replaying: a table, a column, then a rebuild
// that changes a column's type (SQLite's only way) with its index recreated.
const probe: ModuleMigrations = {
  module: "probe",
  steps: [
    { version: 1, sql: "CREATE TABLE widgets (id TEXT PRIMARY KEY, n TEXT NOT NULL);" },
    { version: 2, sql: "ALTER TABLE widgets ADD COLUMN note TEXT; CREATE INDEX widgets_note ON widgets (note);" },
    {
      version: 3,
      sql: `
CREATE TABLE widgets_new (id TEXT PRIMARY KEY, n INTEGER NOT NULL, note TEXT);
INSERT INTO widgets_new SELECT id, CAST(n AS INTEGER), note FROM widgets;
DROP TABLE widgets;
ALTER TABLE widgets_new RENAME TO widgets;
CREATE INDEX widgets_note ON widgets (note);`,
    },
  ],
};
const upTo = (m: ModuleMigrations, v: number): ModuleMigrations => ({ module: m.module, steps: m.steps.slice(0, v) });
const ALL = [eventsMigrations, probe];

const ledgerOf = (s: Store) =>
  must(s.read((r) => r.all("SELECT module, version, digest FROM _migrations ORDER BY module, version"))).map((row) => ({ ...row }));

describe("migrations", () => {
  it("applies every pending step once, then has nothing to do", () => {
    const s = fileStore();
    const first = must(migrate(s, ALL));
    expect(first.applied).toEqual([
      { module: "events", version: 1 },
      { module: "events", version: 2 },
      { module: "probe", version: 1 },
      { module: "probe", version: 2 },
      { module: "probe", version: 3 },
    ]);
    expect(must(migrate(s, ALL)).applied).toEqual([]);
    s.close();
  });

  it("a store migrated step by step from the oldest version ends with the fresh store's schema", () => {
    const fresh = fileStore();
    must(migrate(fresh, ALL));
    const old = fileStore();
    must(migrate(old, [upTo(eventsMigrations, 1), upTo(probe, 1)]));
    must(old.tx((t) => t.run("INSERT INTO widgets (id, n) VALUES ('w', '7')")));
    for (const v of [2, 3]) {
      // Each release reopens the store, as a new build would.
      const file = old.location;
      old.close();
      const again = must(openStore(file));
      must(migrate(again, [eventsMigrations, upTo(probe, v)]));
      again.close();
    }
    const done = must(openStore(old.location));
    expect(must(schemaOf(done))).toEqual(must(schemaOf(fresh)));
    expect(ledgerOf(done)).toEqual(ledgerOf(fresh));
    expect(must(done.read((r) => r.get("SELECT n FROM widgets WHERE id = 'w'")?.["n"]))).toBe(7);
    done.close();
    fresh.close();
  });

  it("refuses a past step that was edited after it ran, and runs nothing", () => {
    const s = fileStore();
    must(migrate(s, [upTo(probe, 1)]));
    const edited: ModuleMigrations = { module: "probe", steps: [{ version: 1, sql: "CREATE TABLE widgets (id TEXT PRIMARY KEY, n TEXT);" }, ...probe.steps.slice(1)] };
    const r = migrate(s, [edited]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("refused");
      expect(r.error.message).toMatch(/probe v1 was edited/);
    }
    expect(ledgerOf(s).map((x) => x["version"])).toEqual([1]);
    s.close();
  });

  it("does not read a CRLF checkout as an edit", () => {
    const lf = { version: 1, sql: "CREATE TABLE a (x);\nCREATE TABLE b (y);" };
    expect(stepDigest({ ...lf, sql: lf.sql.replace(/\n/g, "\r\n") })).toBe(stepDigest(lf));
  });

  it("refuses a store newer than the code", () => {
    const s = fileStore();
    must(migrate(s, [probe]));
    const r = migrate(s, [upTo(probe, 2)]);
    expect(!r.ok && r.error.message).toMatch(/newer than the code/);
    s.close();
  });

  it("refuses declarations with a gap or a repeat", () => {
    const s = fileStore();
    const r = migrate(s, [{ module: "probe", steps: [probe.steps[0], { version: 3, sql: "SELECT 1;" }].filter((x) => x !== undefined) }]);
    expect(!r.ok && r.error.code).toBe("invalid");
    s.close();
  });

  it("a failed step leaves no trace of itself, marks the failure, and blocks every run until cleared", () => {
    const s = fileStore();
    const broken: ModuleMigrations = {
      module: "probe",
      steps: [probe.steps[0], { version: 2, sql: "CREATE TABLE half (a); INSERT INTO no_such_table VALUES (1);" }].filter((x) => x !== undefined),
    };
    const r = migrate(s, [broken]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/probe v2 failed after 1 step/);
    // The step's own DDL rolled back with it, and so did its ledger row: the
    // bump is the LAST write of the step's transaction.
    expect(must(s.read((r2) => r2.get("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'half'")?.["n"]))).toBe(0);
    expect(ledgerOf(s).map((x) => x["version"])).toEqual([1]);
    const again = migrate(s, [probe]);
    expect(!again.ok && again.error.message).toMatch(/failed at .* mark stands/);
    expect(must(clearMigrationFailure(s, "probe"))).toBe(true);
    expect(must(migrate(s, [probe])).applied.map((a) => a.version)).toEqual([2, 3]);
    s.close();
  });

  it("snapshots a file store before the first pending step, holding the pre-migration state", () => {
    const s = fileStore();
    must(migrate(s, [upTo(probe, 1)]));
    must(s.tx((t) => t.run("INSERT INTO widgets (id, n) VALUES ('w', '1')")));
    const r = must(migrate(s, [probe]));
    expect(r.snapshot).toBeDefined();
    const snap = r.snapshot ?? "";
    expect(path.basename(snap)).toMatch(/\.pre-migrate\..*probe-v1-v3\.sqlite$/);
    const d = new DatabaseSync(snap, { readOnly: true });
    const cols = d.prepare("SELECT name FROM pragma_table_info('widgets')").all().map((c) => c["name"]);
    const ledger = d.prepare("SELECT max(version) AS v FROM _migrations").get()?.["v"];
    d.close();
    expect(cols).toEqual(["id", "n"]);
    expect(ledger).toBe(1);
    expect(must(migrate(s, [probe])).snapshot).toBeUndefined();
    s.close();
  });

  it("keeps the newest snapshots of a store and removes the rest", () => {
    const dir = tmp.dir;
    const s = fileStore();
    for (let v = 1; v <= 3; v++) must(migrate(s, [upTo(probe, v)], { keepSnapshots: 2 }));
    const mine = readdirSync(dir).filter((f) => f.startsWith(`${path.basename(s.location)}.pre-migrate.`));
    expect(mine).toHaveLength(2);
    expect(mine.some((f) => f.includes("probe-v0-v1"))).toBe(false);
    s.close();
  });

  it("an in-memory store migrates without a snapshot", () => {
    const s = must(openStore(":memory:"));
    const r = must(migrate(s, ALL));
    expect(r.applied).toHaveLength(5);
    expect(r.snapshot).toBeUndefined();
    s.close();
  });
});
