import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AppError } from "@gt/domain/errors";
import { openStore, type Store, type StoreOptions, type Tx } from "../src/store.ts";
import { fixedClock, must, scratch } from "./helpers.ts";

// The store's contract, written once and run against every adapter (Director
// decision 3): a file database and SQLite `:memory:`. The in-memory path is
// SQLite too, so it cannot drift from SQL semantics the way a hand-written
// map would; this suite is what would notice if a future adapter did.

const tmp = scratch("contract");
afterAll(() => tmp.dispose());
let n = 0;

const adapters: [string, (o?: StoreOptions) => Store][] = [
  ["file", (o) => must(openStore(path.join(tmp.dir, `c-${++n}.sqlite`), o))],
  ["memory", (o) => must(openStore(":memory:", o))],
];

const SCHEMA = `
CREATE TABLE kv (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
CREATE TABLE parent (id TEXT PRIMARY KEY);
CREATE TABLE child (id TEXT PRIMARY KEY, parent TEXT NOT NULL REFERENCES parent (id));`;

function seeded(make: (o?: StoreOptions) => Store, o?: StoreOptions): Store {
  const s = make(o);
  must(s.tx((t) => t.exec(SCHEMA)));
  return s;
}

const count = (s: Store): number => {
  const v = must(s.read((r) => r.get("SELECT count(*) AS n FROM kv")?.["n"]));
  return typeof v === "number" ? v : -1;
};

describe.each(adapters)("store contract (%s)", (_name, make) => {
  it("commits a transaction and a later read sees it", () => {
    const s = seeded(make);
    expect(must(s.tx((t) => t.run("INSERT INTO kv VALUES ('a', 1)").changes))).toBe(1);
    expect(must(s.read((r) => r.get("SELECT v FROM kv WHERE k = 'a'")?.["v"]))).toBe(1);
    s.close();
  });

  it("rolls back on a thrown AppError and keeps its code", () => {
    const s = seeded(make);
    const r = s.tx((t) => {
      t.run("INSERT INTO kv VALUES ('a', 1)");
      throw new AppError("budget", "over the ceiling");
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("budget");
    expect(count(s)).toBe(0);
    s.close();
  });

  it("turns any other throw into internal, rolled back, with the cause kept", () => {
    const s = seeded(make);
    const boom = new TypeError("bug");
    const r = s.tx((t) => {
      t.run("INSERT INTO kv VALUES ('a', 1)");
      throw boom;
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("internal");
      expect(r.error.cause).toBe(boom);
    }
    expect(count(s)).toBe(0);
    s.close();
  });

  it("refuses and rolls back a body that returns a promise", () => {
    const s = seeded(make);
    // The type already forbids an async body; `as never` is the test's way past it.
    const asyncBody = (t: Tx): number => {
      t.run("INSERT INTO kv VALUES ('a', 1)");
      return Promise.resolve(1) as never;
    };
    const r = s.tx(asyncBody);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/promise/);
    expect(count(s)).toBe(0);
    s.close();
  });

  it("maps a constraint violation to conflict", () => {
    const s = seeded(make);
    must(s.tx((t) => t.run("INSERT INTO kv VALUES ('a', 1)")));
    const r = s.tx((t) => t.run("INSERT INTO kv VALUES ('a', 2)"));
    expect(!r.ok && r.error.code).toBe("conflict");
    s.close();
  });

  it("enforces foreign keys on every connection", () => {
    const s = seeded(make);
    const r = s.tx((t) => t.run("INSERT INTO child VALUES ('c', 'nobody')"));
    expect(!r.ok && r.error.code).toBe("conflict");
    s.close();
  });

  it("refuses a transaction opened inside another", () => {
    const s = seeded(make);
    const outer = s.tx(() => s.tx((t) => t.run("INSERT INTO kv VALUES ('a', 1)")));
    const inner = must(outer);
    expect(inner.ok).toBe(false);
    expect(count(s)).toBe(0);
    s.close();
  });

  it("refuses a handle used after its transaction ended", () => {
    const s = seeded(make);
    const leaked = must(s.tx((t) => t));
    expect(() => leaked.run("INSERT INTO kv VALUES ('a', 1)")).toThrow(/after its transaction ended/);
    expect(count(s)).toBe(0);
    s.close();
  });

  it("a read transaction cannot write, and the store still writes afterwards", () => {
    const s = seeded(make);
    const sneaky = s.read((r) => r.get("INSERT INTO kv VALUES ('a', 1) RETURNING v"));
    expect(sneaky.ok).toBe(false);
    expect(count(s)).toBe(0);
    must(s.tx((t) => t.run("INSERT INTO kv VALUES ('b', 2)")));
    expect(count(s)).toBe(1);
    s.close();
  });

  it("stamps one instant per transaction from the store's clock", () => {
    const s = seeded(make, { clock: fixedClock("2026-01-02T03:04:05.000Z") });
    expect(must(s.tx((t) => t.at))).toBe("2026-01-02T03:04:05.000Z");
    s.close();
  });

  it("a closed store is unavailable, not a crash", () => {
    const s = seeded(make);
    s.close();
    const r = s.tx((t) => t.run("INSERT INTO kv VALUES ('a', 1)"));
    expect(!r.ok && r.error.code).toBe("unavailable");
  });
});
