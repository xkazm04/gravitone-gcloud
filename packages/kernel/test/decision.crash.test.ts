import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ok } from "@gt/domain/errors";
import { blobStore } from "../src/blob.ts";
import { registerScore } from "../src/calibration/series.ts";
import { enumerateCrashes, type CrashSpec } from "../src/crash.ts";
import { applyNext, drainApplies, type Applier } from "../src/decision/apply.ts";
import { commit } from "../src/decision/commit.ts";
import { openPacket, patchMany } from "../src/decision/driver.ts";
import { currentDecisions } from "../src/decision/read.ts";
import { liveEffects, type Effects } from "../src/effects.ts";
import { migrate } from "../src/migrate.ts";
import { openStore, type Store } from "../src/store.ts";
import { agent, cull, MODULES, operator, pid, preview } from "./decision.fixtures.ts";
import { must, scratch } from "./helpers.ts";

// THE CRASH-PREFIX SCENARIO for kernel/decision, its apply outbox and
// kernel/calibration: a grader registers its score, the operator decides the
// pile in one act, the Board commits under a ticket (the commit writes its
// apply row in the same transaction), and the applier delivers the outcome to
// v1 - v1's own writer records the keeps and deletes the rejected plates (the
// forge commit's order: indices first, files after). Killed after every effect.
//
// INVARIANT (crashed): the packet is committed exactly when its commit record,
// its `decision.committed` Event and its apply row exist - never one without
// the others. An apply reads `applied` exactly when its `decision.applied`
// Event exists, and only after v1 holds the outcome (v1 may hold it before:
// delivery is at-least-once, the writer is idempotent).
// INVARIANT (recovered): recovery re-sends the SAME ticket, as a retried
// request would, and drains the outbox an hour later (any claim the crash
// stranded has expired); the packet ends committed once and applied once,
// and v1 holds exactly the keep the operator cast.

const tmp = scratch("decision-crash");
afterAll(() => tmp.dispose());
const P = pid("run-0412");
const ALL = ["s1/a", "s1/b", "s1/c", "s2/a", "s2/b", "s2/c"];
let n = 0;

type V1 = { kept: Map<string, string>; deleted: Set<string>; writes: number };
type World = { file: string; store: Store; v1: V1; now: number };

const count = (s: Store, sql: string): number => {
  const v = must(s.read((r) => r.get(sql)?.["n"]));
  return typeof v === "number" ? v : -1;
};

/** v1's writer, idempotent: it replaces the run's keep list and deletes what is not there yet. */
const applier = (w: World): Applier => async (claim) => {
  if (claim.outcome.act === "commit") {
    w.v1.kept.set(claim.packetId, JSON.stringify(claim.outcome.result.kept));
    for (const c of claim.outcome.result.rejected) w.v1.deleted.add(c);
    w.v1.writes++;
  }
  return ok(undefined);
};

async function run(fx: Effects, w: World): Promise<void> {
  const rev = must(w.store.read((r) => currentDecisions(r, P))).rev;
  const scored = count(w.store, "SELECT count(*) AS n FROM calibration_scores");
  if (scored === 0) must(fx.tx("score", (t) => registerScore(t, { series: "gemini@abc123", field: "craft", key: "run-0412::s1/a", value: 0.9 }, "grader")));
  if (rev === 0) must(fx.tx("decide", (t) => patchMany(t, { ...operator, packetId: P, baseRev: 0, changes: ALL.map((c) => ({ key: `run-0412::${c}`, verdict: c === "s1/a" ? ("keep" as const) : ("reject" as const) })) })));
  const shown = preview(w.store, P);
  must(must(fx.tx("commit", (t) => commit(t, { ...operator, packetId: P, ticket: "board-7f3", ...shown }))));
  await applyNext(fx, { holder: "applier-1", apply: applier(w) });
}

async function recover(fx: Effects, w: World): Promise<void> {
  await run(fx, w);
  await drainApplies(fx, { holder: "applier-2", apply: applier(w) });
}

const open = (file: string, w: { now: number }) => must(openStore(file, { clock: () => new Date(w.now) }));

const spec: CrashSpec<World> = {
  open: () => {
    const file = path.join(tmp.dir, `d${++n}.sqlite`);
    const clock = { now: Date.parse("2026-10-15T12:00:00.000Z") };
    const store = open(file, clock);
    must(migrate(store, MODULES, { snapshotDir: tmp.dir }));
    must(store.tx((t) => openPacket(t, { packet: cull() }, agent)));
    return { file, store, v1: { kept: new Map(), deleted: new Set(), writes: 0 }, now: clock.now };
  },
  reopen: (w) => {
    w.store.close();
    // The restarted process comes back an hour later: every lease the crash stranded has run out.
    const later = { ...w, now: w.now + 3_600_000 };
    return { ...later, store: open(w.file, later) };
  },
  close: (w) => w.store.close(),
  effects: (w) => liveEffects(w.store, blobStore(path.join(tmp.dir, "blobs"))),
  scenario: run,
  recover,
  invariant(w, phase) {
    const state = must(w.store.read((r) => r.get("SELECT state FROM packets WHERE id = 'run-0412'")?.["state"]));
    const commits = count(w.store, "SELECT count(*) AS n FROM packet_commits");
    const committedEvents = count(w.store, "SELECT count(*) AS n FROM events WHERE type = 'decision.committed'");
    const applyRows = count(w.store, "SELECT count(*) AS n FROM packet_applies");
    const committed = state === "committed";
    if (committed !== (commits === 1) || committed !== (committedEvents === 1) || committed !== (applyRows === 1)) {
      return `state ${String(state)}, ${commits} commit record(s), ${committedEvents} committed event(s), ${applyRows} apply row(s)`;
    }
    const applied = count(w.store, "SELECT count(*) AS n FROM packet_applies WHERE state = 'applied'");
    const appliedEvents = count(w.store, "SELECT count(*) AS n FROM events WHERE type = 'decision.applied'");
    if (applied !== appliedEvents) return `${applied} applied row(s) against ${appliedEvents} applied event(s)`;
    if (applied === 1 && !w.v1.kept.has("run-0412")) return "the apply reads applied, and v1 never received the outcome";
    if (phase === "recovered") {
      if (!committed || applied !== 1) return `recovery did not converge: ${String(state)}, applied ${applied}`;
      if (w.v1.kept.get("run-0412") !== JSON.stringify(["s1/a"])) return `v1 holds ${String(w.v1.kept.get("run-0412"))}, not the operator's keep`;
      if (w.v1.deleted.size !== 5) return `v1 deleted ${w.v1.deleted.size} rejected plates, not 5`;
    }
    return undefined;
  },
};

describe("kernel/decision - crash prefixes of score -> decide -> commit -> apply to v1", () => {
  it("a commit and its outbox row are all or nothing at every prefix, and a retried ticket plus a drain converge", async () => {
    const report = await enumerateCrashes(spec);
    expect(report.effects).toEqual(["tx:score", "tx:decide", "tx:commit", "tx:take-apply", "call:apply:forge", "tx:finish-apply"]);
    expect(report.violations).toEqual([]);
  });
});
