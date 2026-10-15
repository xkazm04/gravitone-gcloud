import { afterAll, describe, expect, it } from "vitest";
import type { Packet } from "@gt/domain/packet";
import { canonical } from "../src/canonical.ts";
import type { Store } from "../src/store.ts";
import { commit } from "../src/decision/commit.ts";
import { openPacket, patch, patchMany } from "../src/decision/driver.ts";
import { currentDecisions, history, previewCommit, readPacket, revealPicks } from "../src/decision/read.ts";
import { agent, cid, MODULES, operator, packet, pid, preview } from "./decision.fixtures.ts";
import { fixedClock, must, templateStores } from "./helpers.ts";

// BLIND-FIRST: the machine's pick on a pair is stored and never returned by
// any read until the operator's verdict on that pair exists.
//
// The test that makes the hiding structural rather than hoped-for: two worlds
// hold the same pile with OPPOSITE machine picks, and in one of them the
// producer handed the arms over "pick first". Before any operator verdict,
// every read path - the packet, the decisions, the history, the preview, the
// pick reader and the ledger itself - must return byte-identical output in both
// worlds. A read that leaked the pick, its grades or its order would differ.

const tpl = templateStores(MODULES, { clock: fixedClock() });
afterAll(() => tpl.dispose());

const P = pid("trial-77");
const pair = (order: "ab" | "ba"): Packet => {
  const arms = [
    { id: "r1/base", row: "r1", judge: 0.31 },
    { id: "r1/chal", row: "r1", judge: 0.88 },
    { id: "r2/base", row: "r2", judge: 0.74 },
    { id: "r2/chal", row: "r2", judge: 0.12 },
  ];
  const r1 = order === "ab" ? [arms[0], arms[1]] : [arms[1], arms[0]];
  const r2 = order === "ab" ? [arms[2], arms[3]] : [arms[3], arms[2]];
  return packet("trial-77", "blind-pair", [...r1, ...r2].flatMap((a) => (a === undefined ? [] : [a])));
};

function world(picks: "challenger" | "baseline", order: "ab" | "ba"): Store {
  const s = tpl.fresh();
  const arm = picks === "challenger" ? "chal" : "base";
  must(s.tx((t) => openPacket(t, { packet: pair(order), machinePicks: [{ row: "r1", candidate: cid(`r1/${arm}`) }, { row: "r2", candidate: cid(`r2/${arm}`) }] }, agent)));
  return s;
}

/** Everything any read path can return about the packet, as bytes. */
function everything(s: Store): string {
  return must(
    s.read((r) =>
      canonical({
        packet: readPacket(r, P),
        decisions: currentDecisions(r, P),
        history: history(r, P),
        preview: ((p) => (p.plan.ok ? p.plan.value : p.plan.error.message))(previewCommit(r, P, "leave")),
        picks: Object.fromEntries(revealPicks(r, P)),
        events: r.all("SELECT type, data, hash FROM events ORDER BY seq"),
      }),
    ),
  );
}

describe("kernel/decision - blind-first reveal", () => {
  it("before the operator's verdict, no read path can tell two opposite picks (or a pick-first order) apart", () => {
    const a = world("challenger", "ab");
    const b = world("baseline", "ba");
    expect(everything(a)).toBe(everything(b));
    expect(must(a.read((r) => revealPicks(r, P))).size).toBe(0);
    // The arms' grades are the judge's tell; they are withheld too.
    expect(must(a.read((r) => readPacket(r, P))).items.every((c) => c.grades.length === 0)).toBe(true);
  });

  it("reveals a pair's pick, and its grades, only once the OPERATOR has judged that pair", () => {
    const s = world("challenger", "ab");
    must(s.tx((t) => patch(t, { ...agent, key: "trial-77::r1/base", verdict: "keep", baseRev: 0 })));
    expect(must(s.read((r) => revealPicks(r, P))).size, "an agent's verdict is not the operator's").toBe(0);
    must(s.tx((t) => patch(t, { ...operator, key: "trial-77::r1/chal", verdict: "keep", baseRev: 1 })));
    const picks = must(s.read((r) => revealPicks(r, P)));
    expect([...picks]).toEqual([["r1", { candidate: "r1/chal", outcome: null, agrees: null }]]);
    const items = must(s.read((r) => readPacket(r, P))).items;
    expect(items.filter((c) => c.row === "r1").every((c) => c.grades.length === 1)).toBe(true);
    expect(items.filter((c) => c.row === "r2").every((c) => c.grades.length === 0)).toBe(true);
  });

  it("an undecide does not re-hide a pick: once the operator has seen it, it cannot be unseen", () => {
    const s = world("baseline", "ab");
    must(s.tx((t) => patch(t, { ...operator, key: "trial-77::r2/base", verdict: "reject", baseRev: 0 })));
    expect(must(s.read((r) => revealPicks(r, P))).has("r2")).toBe(true);
    must(s.tx((t) => patch(t, { ...operator, key: "trial-77::r2/base", verdict: null, baseRev: 1 })));
    // The guard reads ANY operator verdict ever cast on the pair; once seen, a
    // pick cannot be unseen, so it stays revealed.
    expect(must(s.read((r) => revealPicks(r, P))).has("r2")).toBe(true);
  });

  it("commits only with every pair judged, and refuses picks that are not arms of their pair", () => {
    const s = world("challenger", "ab");
    const early = must(s.tx((t) => commit(t, { ...operator, packetId: P, ticket: "t", token: "-", v1Digest: "-" })));
    expect(!early.ok && early.error.code).toBe("refused");
    must(s.tx((t) => patchMany(t, { ...operator, packetId: P, baseRev: 0, changes: [{ key: "trial-77::r1/chal", verdict: "keep" }, { key: "trial-77::r1/base", verdict: "reject" }, { key: "trial-77::r2/base", verdict: "keep" }, { key: "trial-77::r2/chal", verdict: "reject" }] })));
    const shown = preview(s, P);
    expect(must(must(s.tx((t) => commit(t, { ...operator, packetId: P, ticket: "t", ...shown })))).kept).toEqual(["r1/chal", "r2/base"]);
    const bad = tpl.fresh();
    expect(bad.tx((t) => openPacket(t, { packet: pair("ab"), machinePicks: [{ row: "r1", candidate: cid("r2/chal") }] }, agent)).ok).toBe(false);
    expect(bad.tx((t) => openPacket(t, { packet: packet("cull-1", "matrix-cull", [{ id: "a" }]), machinePicks: [{ row: "r1", candidate: cid("a") }] }, agent)).ok).toBe(false);
  });
});
