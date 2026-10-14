import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { enumerateCrashes, type CrashSpec } from "../src/crash.ts";
import { liveEffects } from "../src/effects.ts";
import { blobStore } from "../src/blob.ts";
import { eventsMigrations } from "../src/events.ts";
import { migrate } from "../src/migrate.ts";
import type { SpendClass } from "../src/spend/core.ts";
import { lapseOwner, release, stats, spendMigrations } from "../src/spend/ledger.ts";
import { createSettler, meteredCall } from "../src/spend/settler.ts";
import { openStore, type Store } from "../src/store.ts";
import { must, scratch } from "./helpers.ts";

// THE CRASH-PREFIX SCENARIO for kernel/spend: reserve -> external call ->
// settle, the process killed after every effect.
//
// INVARIANT: the period total (spent + held + lapsed) never under-counts money
// that may have been spent. The vendor is the outside world, so its ledger
// survives the crash: once it has charged, the store must count either the
// reported figure (settled) or the reservation's estimate (held or lapsed). A
// crash between the charge and the settle is the case v1's TTL reclaim
// dropped: there the money left the account and the window fell anyway.
//
// RECOVERY is what the job lot's sweep will do for a dead holder: lapse every
// hold its owner left. Afterwards nothing is `held` by a dead owner, and the
// invariant still holds.

const tmp = scratch("spend-crash");
afterAll(() => tmp.dispose());
const cls: SpendClass = { id: "imaging-usd", unit: "usd", windowMs: 3_600_000, ceiling: 5 };
const ESTIMATE = 0.12;
const ACTUAL = 0.08;
const OWNER = "boot-1:4412";

type World = { file: string; store: Store; vendor: { charged: number } };
let n = 0;

function totalOf(s: Store): { total: number; held: number; spent: number } {
  const x = must(s.read((r) => stats(r, cls)));
  return { total: x.spent + x.held + x.lapsed, held: x.held, spent: x.spent };
}

function spec(recover: "lapse" | "release-like-v1-reclaim"): CrashSpec<World> {
  const open = (file: string, charged: number): World => {
    const store = must(openStore(file, { busyTimeoutMs: 200 }));
    must(migrate(store, [eventsMigrations, spendMigrations], { snapshotDir: tmp.dir }));
    return { file, store, vendor: { charged } };
  };
  return {
    open: () => open(path.join(tmp.dir, `w${++n}.sqlite`), 0),
    reopen: (w) => {
      w.store.close();
      return open(w.file, w.vendor.charged);
    },
    close: (w) => w.store.close(),
    effects: (w) => liveEffects(w.store, blobStore(path.join(tmp.dir, "blobs"))),
    async scenario(fx, w) {
      const r = await meteredCall(fx, createSettler(fx), cls, { id: "call-1", amount: ESTIMATE, owner: OWNER, vendor: "leonardo" }, async () => {
        w.vendor.charged += ACTUAL;
        return { reached: true, report: { value: "plate.png", entries: [{ amount: ACTUAL, outcome: "served", basis: "vendor", axes: { cap: "plate" } }] } };
      });
      must(r);
    },
    async recover(fx) {
      must(fx.tx("sweep", (t) => {
        if (recover === "lapse") return lapseOwner(t, cls, OWNER);
        // The control: v1's reclaim, which drops a dead owner's hold unbooked.
        const held = t.all("SELECT id FROM spend_reservations WHERE state = 'held'");
        for (const row of held) must(release(t, cls, { id: String(row["id"]), by: "sweep" }));
        return held.length;
      }));
    },
    invariant(w, phase) {
      const { total, held } = totalOf(w.store);
      if (w.vendor.charged > 0 && total + 1e-12 < Math.min(w.vendor.charged, ESTIMATE)) {
        return `the vendor charged ${w.vendor.charged} and the window counts ${total}`;
      }
      if (phase === "recovered" && held > 0) return `a dead owner still holds ${held} after recovery`;
      return undefined;
    },
  };
}

describe("kernel/spend - crash prefixes of reserve -> call -> settle", () => {
  it("never under-counts money that may have been spent, at any prefix, crashed or recovered", async () => {
    const report = await enumerateCrashes(spec("lapse"));
    expect(report.effects).toEqual(["tx:spend.reserve", "call:leonardo", "tx:spend.settle"]);
    expect(report.prefixes).toBe(3);
    expect(report.violations).toEqual([]);
  });

  it("the harness sees the v1 reclaim's hole: releasing a dead owner's hold under-counts after the charge", async () => {
    const report = await enumerateCrashes(spec("release-like-v1-reclaim"));
    expect(report.violations.map((v) => [v.k, v.phase, v.after])).toEqual([[2, "recovered", "call:leonardo"]]);
  });
});
