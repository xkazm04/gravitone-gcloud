import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { blobStore } from "../src/blob.ts";
import { registerScore } from "../src/calibration/series.ts";
import { enumerateCrashes, type CrashSpec } from "../src/crash.ts";
import { commit, openPacket, patch } from "../src/decision/driver.ts";
import { currentDecisions } from "../src/decision/read.ts";
import { liveEffects, type Effects } from "../src/effects.ts";
import { migrate } from "../src/migrate.ts";
import { openStore, type Store } from "../src/store.ts";
import { agent, cull, MODULES, operator, pid } from "./decision.fixtures.ts";
import { must, scratch } from "./helpers.ts";

// THE CRASH-PREFIX SCENARIO for kernel/decision and kernel/calibration: a
// grader registers its score, the operator keeps a plate, the Board commits
// under a ticket, and the producer then deletes the rejected media (v1's
// forge commit order: indices first, files after). Killed after every effect.
//
// INVARIANT (crashed): the packet is committed exactly when its commit record
// and its `decision.committed` Event exist - never one without the others.
// INVARIANT (recovered): recovery re-sends the SAME ticket, as a retried
// request would; the packet ends committed once, with one Event, and the keep
// the operator cast before the crash is in the result.

const tmp = scratch("decision-crash");
afterAll(() => tmp.dispose());
const P = pid("run-0412");
let n = 0;

type World = { file: string; store: Store; deleted: number };

const count = (s: Store, sql: string): number => {
  const v = must(s.read((r) => r.get(sql)?.["n"]));
  return typeof v === "number" ? v : -1;
};

async function run(fx: Effects, w: World): Promise<void> {
  const rev = must(w.store.read((r) => currentDecisions(r, P))).rev;
  const scored = count(w.store, "SELECT count(*) AS n FROM calibration_scores");
  if (scored === 0) must(fx.tx("score", (t) => registerScore(t, { series: "gemini@abc123", field: "craft", key: "run-0412::s1/a", value: 0.9 }, "grader")));
  if (rev === 0) must(fx.tx("keep", (t) => patch(t, { ...operator, key: "run-0412::s1/a", verdict: "keep", baseRev: 0 })));
  const result = must(must(fx.tx("commit", (t) => commit(t, { ...operator, packetId: P, ticket: "board-7f3" }))));
  await fx.call("delete-rejected", async () => {
    w.deleted = result.rejected.length;
  });
}

const spec: CrashSpec<World> = {
  open: () => {
    const file = path.join(tmp.dir, `d${++n}.sqlite`);
    const store = must(openStore(file));
    must(migrate(store, MODULES, { snapshotDir: tmp.dir }));
    must(store.tx((t) => openPacket(t, { packet: cull() }, agent)));
    return { file, store, deleted: 0 };
  },
  reopen: (w) => {
    w.store.close();
    return { ...w, store: must(openStore(w.file)) };
  },
  close: (w) => w.store.close(),
  effects: (w) => liveEffects(w.store, blobStore(path.join(tmp.dir, "blobs"))),
  scenario: run,
  recover: run,
  invariant(w, phase) {
    const state = must(w.store.read((r) => r.get("SELECT state FROM packets WHERE id = 'run-0412'")?.["state"]));
    const commits = count(w.store, "SELECT count(*) AS n FROM packet_commits");
    const events = count(w.store, "SELECT count(*) AS n FROM events WHERE type = 'decision.committed'");
    const committed = state === "committed";
    if (committed !== (commits === 1) || committed !== (events === 1)) return `state ${String(state)}, ${commits} commit record(s), ${events} committed event(s)`;
    if (phase === "recovered") {
      if (!committed) return "recovery did not commit";
      const kept = must(w.store.read((r) => r.get("SELECT result FROM packet_commits")?.["result"]));
      if (typeof kept !== "string" || !kept.includes('"kept":["s1/a"]')) return `the keep is not in the committed result: ${String(kept)}`;
      if (w.deleted !== 5) return `the producer deleted ${w.deleted} rejected plates, not 5`;
    }
    return undefined;
  },
};

describe("kernel/decision - crash prefixes of score -> keep -> commit -> delete", () => {
  it("a commit is all or nothing at every prefix, and a retried ticket converges", async () => {
    const report = await enumerateCrashes(spec);
    expect(report.effects).toEqual(["tx:score", "tx:keep", "tx:commit", "call:delete-rejected"]);
    expect(report.violations).toEqual([]);
  });
});
