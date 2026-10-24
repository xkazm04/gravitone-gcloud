import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { eventsMigrations, verify } from "../src/events.ts";
import { acquire, leaseMigrations, releaseIn } from "../src/lease.ts";
import { blobStore } from "../src/blob.ts";
import { liveEffects } from "../src/effects.ts";
import { migrate } from "../src/migrate.ts";
import { openStore } from "../src/store.ts";
import { findPython, must, scratch } from "./helpers.ts";

// Node and Python processes contend for ONE lease on ONE store file (v1's
// pipeline/gpu/selftest.py case 4, upgraded from "one try each" to sustained
// contention). Every holder writes `enter` and `exit` under its fence; if two
// ever held at once, the probe log would show two enters in a row. Python
// also appends to the hash chain, so Node verifying the whole ledger proves
// the two languages wrote one chain.

const here = path.dirname(fileURLToPath(import.meta.url));
const nodeChild = path.join(here, "fixtures", "lease-child.ts");
const pyChild = path.join(here, "..", "py", "lease_contend.py");
const tmp = scratch("lease-mixed");
afterAll(() => tmp.dispose());

const python = findPython();
if (python === undefined) console.warn("[lease.mixed] SKIPPED: no Python 3 on PATH; Node/Python contention did not run");

function run(cmd: string, args: string[]): Promise<{ code: number | null; out: string; errText: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let errText = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (errText += d.toString()));
    p.on("close", (code) => resolve({ code, out, errText }));
  });
}

describe.skipIf(python === undefined)("Node and Python contend for one lease", () => {
  it("exactly one holds at any instant, and fences strictly increase", async () => {
    const db = path.join(tmp.dir, "mixed.sqlite");
    const s = must(openStore(db));
    must(migrate(s, [eventsMigrations, leaseMigrations], { snapshotDir: tmp.dir }));
    must(s.tx((t) => t.exec("CREATE TABLE lease_probe (n INTEGER PRIMARY KEY, who TEXT NOT NULL, fence INTEGER NOT NULL, phase TEXT NOT NULL);")));
    s.close();

    const rounds = 8;
    const node = (name: string) => run(process.execPath, ["--disable-warning=ExperimentalWarning", nodeChild, db, "gpu.local", String(rounds), name]);
    const py = (name: string) => run(python ?? "python", ["-I", pyChild, db, "gpu.local", String(rounds), name]);
    const results = await Promise.all([node("node-1"), py("py-1"), node("node-2"), py("py-2")]);
    for (const r of results) expect({ code: r.code, stderr: r.errText }).toEqual({ code: 0, stderr: "" });

    const check = must(openStore(db));
    try {
      const rows = must(check.read((r) => r.all("SELECT who, fence, phase FROM lease_probe ORDER BY n")));
      expect(rows.length).toBe(4 * rounds * 2);
      let last = 0;
      for (let i = 0; i < rows.length; i += 2) {
        const enter = rows[i];
        const exit = rows[i + 1];
        expect(enter?.["phase"], `row ${i}`).toBe("enter");
        expect(exit?.["phase"], `row ${i + 1}: a second holder entered before the first left`).toBe("exit");
        expect(exit?.["fence"]).toBe(enter?.["fence"]);
        expect(exit?.["who"]).toBe(enter?.["who"]);
        const fence = Number(enter?.["fence"]);
        expect(fence, "fences strictly increase").toBeGreaterThan(last);
        last = fence;
      }
      const writers = new Set(rows.map((r) => String(r["who"])));
      expect(writers).toEqual(new Set(["node-1", "node-2", "py-1", "py-2"]));
      const claimed = must(check.read((r) => r.get("SELECT count(*) AS n FROM events WHERE type = 'lease.claimed'")?.["n"]));
      expect(claimed).toBe(4 * rounds);
      expect(must(verify(check))).toMatchObject({ state: "intact" });
    } finally {
      check.close();
    }
  }, 120_000);
});

describe.skipIf(python === undefined)("a Python waiter while Node holds", () => {
  // Deterministic, unlike the contention above: under a loaded machine the four children may
  // never overlap, and then a Python side that ignored the holder would still log clean
  // enter/exit pairs. Here Node holds for the whole Python attempt, so the only right answer
  // is Python's own timeout.
  it("is not granted, and times out with the holder named", async () => {
    const db = path.join(tmp.dir, "held.sqlite");
    const s = must(openStore(db));
    must(migrate(s, [eventsMigrations, leaseMigrations], { snapshotDir: tmp.dir }));
    const fx = liveEffects(s, blobStore(`${db}.blobs`));
    const held = must(await acquire(fx, "gpu.local", { waitMs: 1_000, ttlS: 30 }));
    try {
      const code = [
        "import sys",
        `sys.path.insert(0, ${JSON.stringify(path.join(here, "..", "py"))})`,
        "from lease import Leases, LeaseTimeout",
        `l = Leases(${JSON.stringify(db)})`,
        "try:",
        "    l.acquire('gpu.local', wait_s=0.4, ttl_s=30, poll_s=0.02)",
        "    print('GRANTED')",
        "except LeaseTimeout:",
        "    print('TIMEOUT')",
        "finally:",
        "    l.close()",
      ].join("\n");
      const r = await run(python ?? "python", ["-I", "-c", code]);
      expect({ out: r.out.trim(), stderr: r.errText }).toEqual({ out: "TIMEOUT", stderr: "" });
    } finally {
      must(s.tx((t) => releaseIn(t, "gpu.local", held.fence)));
      s.close();
    }
  });

  // src/lease.ts `acquire` leaves the queue on this path too (98d4de7f): a ticket left behind is
  // a live waiter (the pid is alive) ahead of every newcomer, so each Node drive's slot claim
  // reads busy until the waiter's TTL drops it.
  it("gives up its place in the queue when the store refuses a poll past the deadline", async () => {
    const db = path.join(tmp.dir, "held-busy.sqlite");
    const s = must(openStore(db));
    must(migrate(s, [eventsMigrations, leaseMigrations], { snapshotDir: tmp.dir }));
    const fx = liveEffects(s, blobStore(`${db}.blobs`));
    const held = must(await acquire(fx, "gpu.local", { waitMs: 1_000, ttlS: 30 }));
    try {
      const code = [
        "import sqlite3, sys",
        `sys.path.insert(0, ${JSON.stringify(path.join(here, "..", "py"))})`,
        "import lease",
        "real, polls = lease.claim_in, []",
        "def busy_after_first(*a):",
        "    polls.append(1)",
        "    if len(polls) == 1:",
        "        return real(*a)",
        "    raise sqlite3.OperationalError('database is locked')",
        "lease.claim_in = busy_after_first",
        `l = lease.Leases(${JSON.stringify(db)})`,
        "try:",
        "    l.acquire('gpu.local', wait_s=0.3, ttl_s=30, poll_s=0.02)",
        "    print('GRANTED')",
        "except sqlite3.OperationalError as e:",
        "    print('RAISED %s' % e)",
        "finally:",
        "    l.close()",
      ].join("\n");
      const r = await run(python ?? "python", ["-I", "-c", code]);
      expect({ out: r.out.trim(), stderr: r.errText }).toEqual({ out: "RAISED database is locked", stderr: "" });
      const left = must(s.read((q) => q.get("SELECT count(*) AS n FROM lease_waiters WHERE resource = 'gpu.local'")?.["n"]));
      expect(left, "the Python ticket is still queued").toBe(0);
    } finally {
      must(s.tx((t) => releaseIn(t, "gpu.local", held.fence)));
      s.close();
    }
  });
});

