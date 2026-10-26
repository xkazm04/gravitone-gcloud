import { afterAll, describe, expect, it } from "vitest";
import { applyStatus } from "../src/decision/apply.ts";
import { commit } from "../src/decision/commit.ts";
import { openPacket, patchMany } from "../src/decision/driver.ts";
import { listPacketSummaries, readPacketView } from "../src/decision/view.ts";
import type { Reader, Store } from "../src/store.ts";
import { agent, cid, cull, MODULES, operator, packet, pid, preview } from "./decision.fixtures.ts";
import { must, steppingClock, templateStores } from "./helpers.ts";

// THE RAIL'S READ: one statement however many packets it lists, and each packet's apply status
// exactly what `applyStatus` answers for it alone (the rail joins the outbox row; it does not
// re-derive it).

const tpl = templateStores(MODULES, { clock: steppingClock() });
afterAll(() => tpl.dispose());

const ALL = ["s1/a", "s1/b", "s1/c", "s2/a", "s2/b", "s2/c"];

function pile(n: number, committedEvery: number): Store {
  const s = tpl.fresh();
  for (let i = 0; i < n; i++) {
    const id = `run-${String(i).padStart(4, "0")}`;
    const p = pid(id);
    must(s.tx((t) => openPacket(t, { packet: cull(id) }, agent)));
    if (i % committedEvery !== 0) continue;
    must(s.tx((t) => patchMany(t, { ...operator, packetId: p, baseRev: 0, changes: ALL.map((c) => ({ key: `${id}::${c}`, verdict: "keep" as const })) })));
    const shown = preview(s, p);
    must(must(s.tx((t) => commit(t, { ...operator, packetId: p, ticket: `t-${id}`, ...shown }))));
  }
  must(s.tx((t) => t.run("UPDATE packet_applies SET state = 'stuck', last_error = 'the render box is asleep', done_at = ? WHERE packet_id = 'run-0000'", t.at)));
  return s;
}

function counting(r: Reader): { reader: Reader; count: () => number } {
  let n = 0;
  return {
    reader: { at: r.at, get: (sql, ...p) => (n++, r.get(sql, ...p)), all: (sql, ...p) => (n++, r.all(sql, ...p)) },
    count: () => n,
  };
}

describe("kernel/decision - the rail", () => {
  it("lists every packet in one statement, with each apply status as applyStatus reads it", () => {
    const s = pile(12, 3);
    const { list, statements } = must(
      s.read((r) => {
        const c = counting(r);
        return { list: listPacketSummaries(c.reader), statements: c.count() };
      }),
    );
    expect(list.packets).toHaveLength(12);
    expect(statements).toBe(1);
    const alone = must(s.read((r) => list.packets.map((p) => applyStatus(r, p.id))));
    expect(list.packets.map((p) => p.apply)).toEqual(alone);
    expect(alone.filter((a) => a !== undefined).map((a) => a?.state).sort()).toEqual(["pending", "pending", "pending", "stuck"]);
    expect(list.packets.find((p) => p.id === "run-0000")?.apply).toEqual({ act: "commit", state: "stuck", attempts: 0, lastError: "the render box is asleep" });
  });
});

// THE SHEET'S READ: one packet view re-derives the decisions from the one rows() read, so the
// statements it issues are counted, not walked.
const mediaUrl = (): string => "/m";

function viewStatements(s: Store, id: string): number {
  return must(
    s.read((r) => {
      const c = counting(r);
      readPacketView(c.reader, id, { mediaUrl });
      return c.count();
    }),
  );
}

describe("kernel/decision - the sheet", () => {
  it("reads a cull view in at most 5 statements and a blind pair in at most 11", () => {
    const s = tpl.fresh();
    must(s.tx((t) => openPacket(t, { packet: cull("run-0001") }, agent)));
    const blind = packet("trial-9", "blind-pair", [
      { id: "r1/base", row: "r1", judge: 0.3 },
      { id: "r1/chal", row: "r1", judge: 0.9 },
    ]);
    must(s.tx((t) => openPacket(t, { packet: blind, machinePicks: [{ row: "r1", candidate: cid("r1/chal") }] }, agent)));
    const counts = { cull: viewStatements(s, "run-0001"), blind: viewStatements(s, "trial-9") };
    expect(counts.cull).toBeLessThanOrEqual(5);
    expect(counts.blind).toBeLessThanOrEqual(11);
  });
});
