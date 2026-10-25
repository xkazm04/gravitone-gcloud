import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findPython, scratch } from "./helpers.ts";

// py/job_settle.recover settles the endings nobody settled. Its cost follows what is OWED, not the
// store's lifetime of finished jobs: with 150 settled endings and 3 owed, the sweep opens one
// query transaction and three per owed ending (load, owed, record) - never two per historical job.

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "recover_cost.py");
const python = findPython();

describe.skipIf(python === undefined)("python recover cost", () => {
  it("opens transactions for the owed endings only", () => {
    const s = scratch("recover-cost");
    try {
      const store = path.join(s.dir, "store.sqlite");
      const r = spawnSync(python!, [script, store, "150", "3"], {
        encoding: "utf8",
        env: { ...process.env, GRAVITONE_STORE_PATH: store },
        timeout: 60_000,
      });
      expect(r.status, r.stderr).toBe(0);
      const got = JSON.parse(r.stdout.trim().split("\n").pop()!) as { settled: number; tx: number };
      expect(got.settled).toBe(3);
      expect(got.tx).toBeLessThanOrEqual(1 + 3 * 3);
    } finally {
      s.dispose();
    }
  }, 90_000);
});
