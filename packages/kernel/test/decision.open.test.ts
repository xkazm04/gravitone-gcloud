import { afterAll, describe, expect, it } from "vitest";
import { canonical } from "../src/canonical.ts";
import { calibrationMigrations } from "../src/calibration/series.ts";
import { decisionMigrations } from "../src/decision/schema.ts";
import { openPacket, patch, undo, type InitialDecision } from "../src/decision/driver.ts";
import { currentDecisions, history } from "../src/decision/read.ts";
import { listPacketSummaries, readPacketView } from "../src/decision/view.ts";
import { eventsMigrations } from "../src/events.ts";
import { migrate, schemaOf } from "../src/migrate.ts";
import { openStore } from "../src/store.ts";
import { agent, cull, MODULES, operator, packet, pid } from "./decision.fixtures.ts";
import { must, scratch, steppingClock, templateStores } from "./helpers.ts";

// OPENING FROM v1 (Phase 3 decision 3), THE v2 UPGRADE, AND THE BOARD'S READS.

const tpl = templateStores(MODULES, { clock: steppingClock() });
const tmp = scratch("decision-open");
afterAll(() => {
  tpl.dispose();
  tmp.dispose();
});

const P = pid("run-0412");
const V1_AT = "2026-09-30T08:15:00+00:00";
const imported: InitialDecision[] = [
  { candidate: "s1/a", verdict: "keep", by: "operator", surface: "foundry", at: V1_AT },
  { candidate: "s1/b", verdict: "reject", reasons: ["subject", "style"], note: "wrong horse", by: "agent", surface: "foundry", at: V1_AT },
];
const mediaUrl = (m: { sha256: string }) => `/api/blob/${m.sha256}`;

describe("kernel/decision - open from v1", () => {
  it("writes v1's verdicts as the first revision, keeping v1's author and instant", () => {
    const s = tpl.fresh();
    must(s.tx((t) => openPacket(t, { packet: cull(), initial: imported }, agent)));
    const view = must(s.read((r) => currentDecisions(r, P)));
    expect(view.rev).toBe(1);
    expect(view.decisions.map((d) => [d.key, d.verdict, d.reasons, d.note, d.by, d.at])).toEqual([
      ["run-0412::s1/a", "keep", [], undefined, "operator", "2026-09-30T08:15:00.000Z"],
      ["run-0412::s1/b", "reject", ["style", "subject"], "wrong horse", "agent", "2026-09-30T08:15:00.000Z"],
    ]);
  });

  it("the import is history, not an act the operator can take back", () => {
    const s = tpl.fresh();
    must(s.tx((t) => openPacket(t, { packet: cull(), initial: imported }, agent)));
    const none = must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 1 })));
    expect(!none.ok && none.error.code).toBe("refused");
    must(s.tx((t) => patch(t, { ...operator, key: "run-0412::s1/a", verdict: "reject", baseRev: 1 })));
    must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 2 })));
    expect(must(s.read((r) => currentDecisions(r, P))).decisions[0]?.verdict).toBe("keep");
  });

  it("re-opening the same content is a no-op; other content under the id is a conflict", () => {
    const s = tpl.fresh();
    must(s.tx((t) => openPacket(t, { packet: cull(), initial: imported }, agent)));
    must(s.tx((t) => openPacket(t, { packet: cull(), initial: [...imported].reverse() }, agent)));
    expect(must(s.read((r) => history(r, P)))).toHaveLength(2);
    expect(must(s.read((r) => r.all("SELECT 1 FROM events WHERE type = 'decision.opened'")))).toHaveLength(1);
    const otherVerdict = s.tx((t) => openPacket(t, { packet: cull(), initial: [{ ...imported[0]!, verdict: "reject" }] }, agent));
    const otherItems = s.tx((t) => openPacket(t, { packet: packet("run-0412", "matrix-cull", [{ id: "s1/a", row: "s1" }]) }, agent));
    for (const r of [otherVerdict, otherItems]) expect(!r.ok && r.error.code).toBe("conflict");
  });

  it("refuses an import the source's vocabulary does not hold, or a candidate outside the pile", () => {
    const s = tpl.fresh();
    const bad = s.tx((t) => openPacket(t, { packet: cull(), initial: [{ ...imported[1]!, reasons: ["vibes"] }] }, agent));
    const foreign = s.tx((t) => openPacket(t, { packet: cull(), initial: [{ ...imported[0]!, candidate: "s9/z" }] }, agent));
    for (const r of [bad, foreign]) expect(!r.ok && r.error.code).toBe("invalid");
    expect(must(s.read((r) => r.all("SELECT id FROM packets")))).toEqual([]);
  });
});

describe("kernel/decision - v2 upgrades a store written by v1 of the kernel", () => {
  it("old rows read back as reasons: [reason], the triggers hold, and the schema matches a fresh store", () => {
    const file = `${tmp.dir}/v1.sqlite`;
    const s = must(openStore(file, { clock: steppingClock() }));
    const v1Only = { module: "decision", steps: decisionMigrations.steps.slice(0, 1) };
    must(migrate(s, [eventsMigrations, v1Only, calibrationMigrations], { snapshotDir: tmp.dir }));
    must(s.tx((t) => {
      t.run("INSERT INTO packets (id, mode, state, rev, body, opened_at) VALUES ('run-0412', 'matrix-cull', 'open', 2, ?, ?)", canonical(cull()), t.at);
      cull().items.forEach((c, i) => t.run("INSERT INTO packet_items (packet_id, candidate_id, row, ord) VALUES ('run-0412', ?, ?, ?)", c.id, c.row ?? null, i));
      t.run("INSERT INTO decisions (packet_id, candidate_id, verdict, reason, rev, by, surface, at, act) VALUES ('run-0412', 's1/a', 'reject', 'style', 1, 'operator', 'board', ?, 'patch')", t.at);
      t.run("INSERT INTO decisions (packet_id, candidate_id, verdict, reason, rev, by, surface, at, act) VALUES ('run-0412', 's1/b', 'keep', NULL, 2, 'operator', 'board', ?, 'patch')", t.at);
    }));
    const report = must(migrate(s, MODULES, { snapshotDir: tmp.dir }));
    expect(report.applied).toEqual([{ module: "decision", version: 2 }]);
    const ds = must(s.read((r) => currentDecisions(r, P))).decisions;
    expect(ds.map((d) => [d.key, d.verdict, d.reasons])).toEqual([
      ["run-0412::s1/a", "reject", ["style"]],
      ["run-0412::s1/b", "keep", []],
    ]);
    expect(s.tx((t) => t.run("DELETE FROM decisions")).ok).toBe(false);
    // The rebuilt log keeps working: an undo walks back an act written before the upgrade.
    const back = must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 2 })));
    expect(back.ok).toBe(true);
    const fresh = tpl.fresh();
    expect(must(schemaOf(s))).toEqual(must(schemaOf(fresh)));
    s.close();
  });
});

describe("kernel/decision - the Board's reads", () => {
  it("a packet view carries the source's vocabulary, the decisions, the counts, the urls and undo", () => {
    const s = tpl.fresh();
    must(s.tx((t) => openPacket(t, { packet: { ...cull(), title: "lotr cavalry sweep" }, initial: imported }, agent)));
    const v = must(s.read((r) => readPacketView(r, P, { mediaUrl })));
    expect([v.source, v.mode, v.state, v.rev, v.title, v.undecided, v.canUndo]).toEqual(["forge", "matrix-cull", "open", 1, "lotr cavalry sweep", 4, false]);
    expect(v.reasons).toEqual({ list: ["style", "subject", "text", "craft"], max: 4, noteMax: 2000 });
    expect(v.items[0]?.url).toMatch(/^\/api\/blob\/[0-9a-f]{64}$/);
    expect(v.decisions).toHaveLength(2);
    expect(v.pairs).toEqual([]);
    must(s.tx((t) => patch(t, { ...operator, key: "run-0412::s2/a", verdict: "keep", baseRev: 1 })));
    expect(must(s.read((r) => readPacketView(r, P, { mediaUrl }))).canUndo).toBe(true);
  });

  it("the rail lists open piles first, filters by state and lane, counts decided, and says when it was cut", () => {
    const s = tpl.fresh();
    must(s.tx((t) => openPacket(t, { packet: cull("run-a"), initial: imported }, agent)));
    must(s.tx((t) => openPacket(t, { packet: cull("run-b") }, agent)));
    must(s.tx((t) => openPacket(t, { packet: { ...packet("art-1", "packet-review", [{ id: "d" }]), lane: "article" } }, agent)));
    const all = must(s.read((r) => listPacketSummaries(r)));
    expect(all.truncated).toBe(false);
    expect(all.packets.map((p) => [p.id, p.items, p.decided])).toEqual([["art-1", 1, 0], ["run-b", 6, 0], ["run-a", 6, 2]]);
    const cut = must(s.read((r) => listPacketSummaries(r, { limit: 2 })));
    expect([cut.packets.length, cut.truncated]).toEqual([2, true]);
    expect(must(s.read((r) => listPacketSummaries(r, { lane: "article" }))).packets.map((p) => p.id)).toEqual(["art-1"]);
    expect(must(s.read((r) => listPacketSummaries(r, { state: "committed" }))).packets).toEqual([]);
    expect(s.read((r) => listPacketSummaries(r, { limit: 501 })).ok).toBe(false);
  });
});
