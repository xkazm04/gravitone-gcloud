import { spawn } from "node:child_process";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { openStore } from "../src/store.ts";
import { must, scratch } from "./helpers.ts";

// What only a FILE store can promise: cross-process exclusion, WAL, a bounded
// wait, snapshots that carry the WAL, and a refusal to treat a non-database as
// one. The contract suite covers what both adapters share.

const tmp = scratch("file");
afterAll(() => tmp.dispose());
const here = path.dirname(fileURLToPath(import.meta.url));
const child = path.join(here, "fixtures", "counter-child.ts");

function runChild(db: string, times: number): Promise<{ code: number | null; out: string; errText: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", child, db, String(times)], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let errText = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (errText += d.toString()));
    p.on("close", (code) => resolve({ code, out, errText }));
  });
}

describe("file store", () => {
  it("two real processes incrementing one counter lose no update", async () => {
    const db = path.join(tmp.dir, "counter.sqlite");
    const s = must(openStore(db));
    must(s.tx((t) => t.exec("CREATE TABLE counter (id INTEGER PRIMARY KEY, v INTEGER NOT NULL); INSERT INTO counter VALUES (1, 0);")));
    s.close();
    const N = 300;
    const [a, b] = await Promise.all([runChild(db, N), runChild(db, N)]);
    expect(a.errText + b.errText).toBe("");
    expect([a.code, b.code]).toEqual([0, 0]);
    const after = must(openStore(db));
    expect(must(after.read((r) => r.get("SELECT v FROM counter WHERE id = 1")?.["v"]))).toBe(2 * N);
    after.close();
  }, 120_000);

  it("runs in WAL with synchronous FULL, and names sidecars by appending (a store with no extension)", () => {
    const db = path.join(tmp.dir, "ledger");
    const s = must(openStore(db));
    const mode = must(s.read((r) => [r.get("PRAGMA journal_mode")?.["journal_mode"], r.get("PRAGMA synchronous")?.["synchronous"]]));
    expect(mode).toEqual(["wal", 2]);
    must(s.tx((t) => t.exec("CREATE TABLE x (a)")));
    expect(existsSync(`${db}-wal`)).toBe(true);
    s.close();
  });

  it("a writer held past busy_timeout is unavailable, and the store recovers when it lets go", () => {
    const db = path.join(tmp.dir, "busy.sqlite");
    const s = must(openStore(db, { busyTimeoutMs: 50 }));
    must(s.tx((t) => t.exec("CREATE TABLE x (a)")));
    const holder = new DatabaseSync(db);
    holder.exec("BEGIN IMMEDIATE");
    const r = s.tx((t) => t.run("INSERT INTO x VALUES (1)"));
    expect(!r.ok && r.error.code).toBe("unavailable");
    holder.exec("ROLLBACK");
    holder.close();
    expect(must(s.tx((t) => t.run("INSERT INTO x VALUES (1)").changes))).toBe(1);
    s.close();
  });

  it("a snapshot carries rows still in the WAL; a copy of the main file alone does not", () => {
    const db = path.join(tmp.dir, "snap.sqlite");
    const s = must(openStore(db));
    must(s.tx((t) => t.exec("PRAGMA wal_autocheckpoint = 0; CREATE TABLE x (a TEXT)")));
    must(s.tx((t) => t.run("INSERT INTO x VALUES ('only-in-the-wal')")));
    // Negative control: the naive backup (copy the .sqlite, forget the -wal)
    // loses the row. Copied while the store is open, as a careless backup would.
    const naive = path.join(tmp.dir, "naive.sqlite");
    copyFileSync(db, naive);
    const snap = path.join(tmp.dir, "snap.copy.sqlite");
    must(s.snapshot(snap));
    s.close();
    const read = (file: string): unknown => {
      const d = new DatabaseSync(file, { readOnly: true });
      try {
        return d.prepare("SELECT a FROM x").get()?.["a"];
      } catch (e) {
        return e instanceof Error ? `error: ${e.message}` : "error";
      } finally {
        d.close();
      }
    };
    expect(read(snap)).toBe("only-in-the-wal");
    expect(read(naive)).not.toBe("only-in-the-wal");
  });

  it("a file that is not a database is refused at open, never treated as empty", () => {
    const db = path.join(tmp.dir, "garbage.sqlite");
    writeFileSync(db, Buffer.alloc(8192, 0x5a));
    const r = openStore(db);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("internal");
  });
});
