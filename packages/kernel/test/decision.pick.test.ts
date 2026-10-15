import { afterAll, describe, expect, it } from "vitest";
import type { Packet } from "@gt/domain/packet";
import type { Store } from "../src/store.ts";
import { openPacket, patch, pick, undo } from "../src/decision/driver.ts";
import { currentDecisions, readPacket, revealPicks } from "../src/decision/read.ts";
import { readPacketView } from "../src/decision/view.ts";
import { agent, cid, cull, MODULES, operator, packet, pid } from "./decision.fixtures.ts";
import { fixedClock, must, templateStores } from "./helpers.ts";

// BLIND PICKS (Phase 3 decision 7): a | b | tie | both-bad per pair, one
// revision over both arms, mapped to the arms' verdicts by the source's rule,
// the outcome kept, one undo taking the whole pick back, and the machine's
// agreement computed only at reveal.

const tpl = templateStores(MODULES, { clock: fixedClock() });
afterAll(() => tpl.dispose());

const P = pid("trial-9");
const pair = (): Packet =>
  packet("trial-9", "blind-pair", [
    { id: "r1/base", row: "r1", judge: 0.3 },
    { id: "r1/chal", row: "r1", judge: 0.9 },
    { id: "r2/base", row: "r2", judge: 0.7 },
    { id: "r2/chal", row: "r2", judge: 0.2 },
  ]);

function world(): Store {
  const s = tpl.fresh();
  must(s.tx((t) => openPacket(t, { packet: pair(), machinePicks: [{ row: "r1", candidate: cid("r1/chal") }, { row: "r2", candidate: cid("r2/base") }] }, agent)));
  return s;
}

/** The arms of a pair in the order the desk shows them: a, then b. */
const arms = (s: Store, row: string): [string, string] => {
  const its = must(s.read((r) => readPacket(r, P))).items.filter((c) => c.row === row).map((c) => c.id);
  return [its[0] ?? "", its[1] ?? ""];
};
const verdictOf = (s: Store) => must(s.read((r) => new Map(currentDecisions(r, P).decisions.map((d) => [d.key.split("::")[1], d.verdict]))));
const view = (s: Store) => must(s.read((r) => readPacketView(r, P, { mediaUrl: (m) => `/blob/${m.sha256}` })));

describe("kernel/decision - blind picks", () => {
  it("maps each outcome to the arms in desk order, as one revision with one Event", () => {
    for (const [outcome, want] of [["a", ["keep", "reject"]], ["b", ["reject", "keep"]], ["tie", ["keep", "keep"]], ["both-bad", ["reject", "reject"]]] as const) {
      const s = world();
      const r = must(s.tx((t) => pick(t, { ...operator, packetId: P, baseRev: 0, pair: "r1", outcome })));
      expect(r.ok && r.value.rev).toBe(1);
      const [a, b] = arms(s, "r1");
      const v = verdictOf(s);
      expect([v.get(a), v.get(b)], outcome).toEqual([...want]);
      expect(view(s).pairs.find((p) => p.row === "r1")?.outcome).toBe(outcome);
      const picked = must(s.read((x) => x.all("SELECT type FROM events WHERE type = 'decision.picked'")));
      expect(picked).toHaveLength(1);
    }
  });

  it("one undo takes the whole pick back - both arms and the outcome", () => {
    const s = world();
    must(s.tx((t) => pick(t, { ...operator, packetId: P, baseRev: 0, pair: "r1", outcome: "a" })));
    must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 1 })));
    expect([...verdictOf(s).values()]).toEqual([null, null]);
    expect(view(s).pairs.find((p) => p.row === "r1")?.outcome).toBeNull();
  });

  it("a repeated pick changes nothing; a different one is a new act; a patch after it overrides the outcome", () => {
    const s = world();
    must(s.tx((t) => pick(t, { ...operator, packetId: P, baseRev: 0, pair: "r1", outcome: "tie" })));
    const again = must(s.tx((t) => pick(t, { ...operator, packetId: P, baseRev: 1, pair: "r1", outcome: "tie" })));
    expect(again.ok && again.value).toEqual({ rev: 1, changed: [] });
    must(s.tx((t) => pick(t, { ...operator, packetId: P, baseRev: 1, pair: "r1", outcome: "both-bad" })));
    expect(view(s).pairs.find((p) => p.row === "r1")?.outcome).toBe("both-bad");
    const [a] = arms(s, "r1");
    must(s.tx((t) => patch(t, { ...operator, key: `trial-9::${a}`, verdict: "keep", baseRev: 2 })));
    expect(view(s).pairs.find((p) => p.row === "r1")?.outcome).toBeNull();
    must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 3 })));
    expect(view(s).pairs.find((p) => p.row === "r1")?.outcome).toBe("both-bad");
  });

  it("agreement is computed at reveal: the chosen arm against the machine's, a tie or both-bad disagreeing", () => {
    const s = world();
    const slot = arms(s, "r1")[0] === "r1/chal" ? "a" : "b";
    must(s.tx((t) => pick(t, { ...operator, packetId: P, baseRev: 0, pair: "r1", outcome: slot })));
    must(s.tx((t) => pick(t, { ...operator, packetId: P, baseRev: 1, pair: "r2", outcome: "tie" })));
    const shown = must(s.read((r) => revealPicks(r, P)));
    expect(shown.get("r1")).toEqual({ candidate: "r1/chal", outcome: slot, agrees: true });
    expect(shown.get("r2")).toEqual({ candidate: "r2/base", outcome: "tie", agrees: false });
    expect(view(s).pairs.map((p) => p.machine?.agrees)).toEqual([true, false]);
  });

  it("the blind EXISTS guard holds for picks too: an agent's pick reveals nothing", () => {
    const s = world();
    must(s.tx((t) => pick(t, { ...agent, packetId: P, baseRev: 0, pair: "r1", outcome: "a" })));
    expect(must(s.read((r) => revealPicks(r, P))).size).toBe(0);
    expect(view(s).pairs.every((p) => p.machine === undefined)).toBe(true);
    expect(view(s).items.every((c) => c.grades.length === 0)).toBe(true);
  });

  it("refuses a pick on a pile that is not a blind pair, an unknown pair, and a stale base", () => {
    const c = tpl.fresh();
    must(c.tx((t) => openPacket(t, { packet: cull() }, agent)));
    const notPair = must(c.tx((t) => pick(t, { ...operator, packetId: pid("run-0412"), baseRev: 0, pair: "s1", outcome: "a" })));
    expect(!notPair.ok && notPair.error.code).toBe("refused");
    const s = world();
    const unknown = must(s.tx((t) => pick(t, { ...operator, packetId: P, baseRev: 0, pair: "r9", outcome: "a" })));
    expect(!unknown.ok && unknown.error.code).toBe("invalid");
    must(s.tx((t) => pick(t, { ...operator, packetId: P, baseRev: 0, pair: "r1", outcome: "a" })));
    const stale = must(s.tx((t) => pick(t, { ...operator, packetId: P, baseRev: 0, pair: "r2", outcome: "a" })));
    expect(!stale.ok && stale.error.code).toBe("conflict");
  });
});
