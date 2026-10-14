import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AppError } from "@gt/domain/errors";
import { blobStore } from "../src/blob.ts";
import { enumerateCrashes, type CrashSpec } from "../src/crash.ts";
import { armLive, type RunMode } from "../src/dryrun.ts";
import { liveEffects } from "../src/effects.ts";
import { eventsMigrations, verify } from "../src/events.ts";
import { migrate } from "../src/migrate.ts";
import { interruptPending, receiptsMigrations } from "../src/pricing/receipts.ts";
import { openStore, type Store } from "../src/store.ts";
import { must, scratch } from "./helpers.ts";
import { lapseOwner, spendMigrations } from "../src/spend/ledger.ts";
import { ACTOR, classes, renderStill } from "./router.driver.ts";

// THE PAID CALL UNDER A CRASH. The driver decides, holds and claims in one
// transaction, calls the vendor, then settles. Stated invariant, for every
// crash prefix:
//   crashed     a decision exists exactly where a claim does (both or neither),
//               and a settled receipt always has its settled event;
//   recovered   the vendor was called AT MOST ONCE across the crash and the
//               recovery - a claim whose owner died is interrupted and named,
//               never re-run (the MV and Suno queues' rule: the vendor may
//               already have billed it) - and nothing is left pending.

const tmp = scratch("router-crash");
afterAll(() => tmp.dispose());
let n = 0;

type World = { file: string; store: Store; calls: number };

const one = (s: Store, sql: string): number => {
  const v = must(s.read((r) => r.get(sql)?.["n"]));
  return typeof v === "number" ? v : -1;
};

const LIVE: RunMode = must(armLive({ kind: "operator", id: "owner" }, "2026-10-15T12:00:00.000Z", "crash probe"));

function spec(split: boolean): CrashSpec<World> {
  const open = (file: string, calls: number): World => {
    const store = must(openStore(file));
    must(migrate(store, [eventsMigrations, receiptsMigrations, spendMigrations], { snapshotDir: tmp.dir }));
    return { file, store, calls };
  };
  const run = (fx: Parameters<CrashSpec<World>["scenario"]>[0], w: World) => renderStill(fx, w, { mode: LIVE, spend: classes(), key: "k1", vendorUsd: 0.05, split });
  return {
    open: () => open(path.join(tmp.dir, `w-${++n}.sqlite`), 0),
    reopen: (w) => {
      w.store.close();
      return open(w.file, w.calls);
    },
    close: (w) => w.store.close(),
    effects: (w) => liveEffects(w.store, blobStore(`${w.file}.blobs`)),
    scenario: async (fx, w) => void (await run(fx, w)),
    recover: async (fx, w) => {
      // The restarted process owns nothing that was in flight.
      // Its claims are interrupted and its holds lapse: both keep saying the
      // vendor may have been paid until someone who knows says otherwise.
      must(fx.tx("recover", (t) => {
        interruptPending(t, ACTOR);
        lapseOwner(t, classes()["imaging-usd"], ACTOR.id);
      }));
      // A resumable driver simply runs again, and the receipt decides what that
      // means: a replay, a fresh start, or a refusal naming the interrupted call.
      try {
        await run(fx, w);
      } catch (e) {
        if (!(e instanceof AppError && e.code === "refused" && /interrupted/.test(e.message))) throw e;
      }
    },
    invariant: (w, phase) => {
      const s = w.store;
      if (phase === "recovered" && w.calls > 1) return `the vendor was called ${w.calls} times`;
      const routed = one(s, "SELECT count(*) AS n FROM events WHERE type = 'router.routed'");
      const claimed = one(s, "SELECT count(*) AS n FROM events WHERE type = 'receipt.claimed'");
      if (routed !== claimed) return `${routed} routing decision(s) but ${claimed} claim(s)`;
      const settledRows = one(s, "SELECT count(*) AS n FROM receipts WHERE state = 'settled'");
      const settledEvents = one(s, "SELECT count(*) AS n FROM events WHERE type = 'receipt.settled'");
      if (settledRows !== settledEvents) return `${settledRows} settled receipt(s) but ${settledEvents} settled event(s)`;
      if (settledRows > 0 && one(s, "SELECT count(*) AS n FROM spend_reservations WHERE state <> 'settled'") > 0) return "a hold outlived the receipt that settled it";
      if (phase === "recovered" && one(s, "SELECT count(*) AS n FROM spend_reservations WHERE state = 'held'") > 0) return "recovery left a hold held by a dead owner";
      if (phase === "recovered") {
        if (one(s, "SELECT count(*) AS n FROM receipts WHERE state = 'pending'") > 0) return "recovery left a claim pending";
        if (one(s, "SELECT count(*) AS n FROM receipts") !== 1) return "recovery did not leave exactly one receipt";
      }
      const chain = must(verify(s));
      return chain.state === "intact" ? undefined : `chain broken at ${chain.seq}: ${chain.reason}`;
    },
  };
}

describe("route, reserve and call under a crash", () => {
  it("every prefix keeps decision and claim together, and recovery never calls the vendor twice", async () => {
    const report = await enumerateCrashes(spec(false));
    expect(report.effects).toEqual(["tx:route+claim", "call:provider", "tx:settle"]);
    expect(report.violations).toEqual([]);
  });

  it("negative control: deciding and claiming in two transactions is caught", async () => {
    const report = await enumerateCrashes(spec(true));
    expect(report.effects).toEqual(["tx:route", "tx:claim", "call:provider", "tx:settle"]);
    expect(report.violations).toContainEqual({ k: 1, phase: "crashed", after: "tx:route", reason: "1 routing decision(s) but 0 claim(s)" });
  });
});
