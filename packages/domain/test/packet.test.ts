import { describe, expect, expectTypeOf, it } from "vitest";

import { candidateSchema, shownGrades, type Grade } from "../src/candidate.ts";
import { decisionKey, decisionSchema } from "../src/decision.ts";
import { candidateIdSchema, packetIdSchema } from "../src/ids.ts";
import { packetSchema, type Packet } from "../src/packet.ts";
import { checkVerdict, SOURCES, type PacketSource } from "../src/source.ts";
import { accept, AT, forgeCandidate, refuse } from "./_records.ts";

const cull = {
  id: "pkt_forge_sweep01",
  lane: "image",
  source: "forge",
  mode: "matrix-cull",
  items: [forgeCandidate("lotr-cavalry/painted-3d--text", "lotr-cavalry"), forgeCandidate("lotr-cavalry/painted-3d--ref-early", "lotr-cavalry")],
  state: "open",
  runId: "2026-08-26-sweep-01",
};

describe("candidate and grade", () => {
  it("parses a forge plate with its grades", () => {
    expect(accept(candidateSchema, cull.items[0]).grades).toHaveLength(2);
  });
  it("a grade cannot omit its calibration status", () => {
    const c = forgeCandidate("a", "r");
    const { calibration: _c, ...bare } = c.grades[0]!;
    refuse(candidateSchema, { ...c, grades: [bare] }, "grades.0.calibration");
    expectTypeOf<Grade["calibration"]["status"]>().toEqualTypeOf<"calibrated" | "inverted" | "chance" | "insufficient">();
  });
  it("only calibrated grades are shown — v1's inverted craft score is not", () => {
    const shown = shownGrades(accept(candidateSchema, forgeCandidate("a", "r")));
    expect(shown.map((g) => g.field)).toEqual(["dojo_judge"]);
  });
  it("a status must agree with its CI", () => {
    const c = forgeCandidate("a", "r");
    const bad = { ...c.grades[0]!, calibration: { status: "calibrated", auc: 0.58, ci: [0.44, 0.71], nKeep: 41, nReject: 46 } };
    refuse(candidateSchema, { ...c, grades: [bad] }, "ci");
    const inv = { ...c.grades[1]!, calibration: { status: "inverted", auc: 0.45, ci: [0.31, 0.6], nKeep: 41, nReject: 46 } };
    refuse(candidateSchema, { ...c, grades: [inv] }, "ci");
  });
  it("insufficient carries no AUC at all", () => {
    const c = forgeCandidate("a", "r");
    const thin = { ...c.grades[0]!, calibration: { status: "insufficient", short: "floor", nKeep: 3, nReject: 5 } };
    const g = accept(candidateSchema, { ...c, grades: [thin] }).grades[0]!;
    expect("auc" in g.calibration).toBe(false);
  });
  it("one grade per field", () => {
    const c = forgeCandidate("a", "r");
    refuse(candidateSchema, { ...c, grades: [c.grades[0], c.grades[0]] }, "one grade per field");
  });
});

describe("packet", () => {
  it("parses an open matrix cull", () => {
    const p = accept(packetSchema, cull);
    expect("partId" in p).toBe(false);
  });
  it("refuses an empty pile and duplicate candidates", () => {
    refuse(packetSchema, { ...cull, items: [] }, "items");
    refuse(packetSchema, { ...cull, items: [cull.items[0], cull.items[0]] }, "unique");
  });
  it("a blind pair is exactly two arms per pair", () => {
    const pairs = { ...cull, id: "pkt_pairs_mech", source: "trials", mode: "blind-pair" };
    accept(packetSchema, pairs);
    refuse(packetSchema, { ...pairs, items: [...cull.items, forgeCandidate("c", "lotr-cavalry")] }, "3 arms");
    refuse(packetSchema, { ...pairs, items: [forgeCandidate("a", "p1"), forgeCandidate("b", "p2")] }, "1 arms");
  });
  it("a step packet names the part it gates", () => {
    refuse(packetSchema, { ...cull, source: "step", mode: "packet-review" }, "partId");
    accept(packetSchema, { ...cull, source: "step", mode: "packet-review", partId: "p-cut" });
  });
  it("a source is decided only in its own modes", () => {
    refuse(packetSchema, { ...cull, mode: "blind-pair", items: [forgeCandidate("a", "p1"), forgeCandidate("b", "p1")] }, "forge packet is decided in matrix-cull");
    refuse(packetSchema, { ...cull, source: "triage" }, "source");
  });
  it("only a packet review is sent back for another turn", () => {
    refuse(packetSchema, { ...cull, state: "returned" }, "packet review");
    accept(packetSchema, { ...cull, source: "article", lane: "article", mode: "packet-review", state: "returned" });
  });
});

describe("decision", () => {
  const keep = { key: "pkt_forge_sweep01::lotr-cavalry/painted-3d--text", verdict: "keep", reasons: [], rev: 4, by: "operator", surface: "board", at: AT };
  it("parses a keep, keeping v1's <scope>::<item> key", () => {
    expect(accept(decisionSchema, keep).key).toBe(keep.key);
    const [packet, cand] = [cull.id, cull.items[0]!.id];
    expect(decisionKey(packetIdSchema.parse(packet), candidateIdSchema.parse(cand))).toBe(`${packet}::${cand}`);
  });
  it("null is a real verdict — not judged yet", () => {
    expect(accept(decisionSchema, { ...keep, verdict: null }).verdict).toBeNull();
    refuse(decisionSchema, { ...keep, verdict: undefined }, "verdict");
  });
  it("only a reject carries reasons, and only a verdict carries a note", () => {
    accept(decisionSchema, { ...keep, verdict: "reject", reasons: ["style", "text"] });
    refuse(decisionSchema, { ...keep, reasons: ["style"] }, "only a reject");
    accept(decisionSchema, { ...keep, note: "the horse reads" });
    refuse(decisionSchema, { ...keep, verdict: null, note: "x" }, "no note");
  });
  it("refuses a key with no scope, and revision 0", () => {
    refuse(decisionSchema, { ...keep, key: "lotr-cavalry/painted-3d--text" }, "key");
    refuse(decisionSchema, { ...keep, key: "::x" }, "key");
    refuse(decisionSchema, { ...keep, rev: 0 }, "rev");
  });
  it("by is the ledger's actor word, not v1's", () => {
    refuse(decisionSchema, { ...keep, by: "human" }, "by");
  });
  it("admits every source's widest verdict, and nothing wider than the widest", () => {
    for (const [source, spec] of Object.entries(SOURCES)) {
      const reasons = spec.reasons.slice(0, spec.maxReasons);
      const note = spec.noteMax > 0 ? { note: "n".repeat(spec.noteMax) } : {};
      expect(checkVerdict(source as PacketSource, { verdict: "reject", reasons, ...note }).ok, source).toBe(true);
      accept(decisionSchema, { ...keep, verdict: "reject", reasons, ...note });
    }
    const widest = Math.max(...Object.values(SOURCES).map((s) => s.maxReasons));
    const longest = Math.max(...Object.values(SOURCES).map((s) => s.noteMax));
    refuse(decisionSchema, { ...keep, verdict: "reject", reasons: Array.from({ length: widest + 1 }, (_, i) => `r${i}`) }, "reasons");
    refuse(decisionSchema, { ...keep, note: "n".repeat(longest + 1) }, "note");
  });
});

describe("the Packet type", () => {
  it("is the door's absent-key shape: an optional key is absent, never an explicit undefined", () => {
    // @ts-expect-error title?: string, not string | undefined (the door drops undefined keys)
    const bad: Pick<Packet, "title"> = { title: undefined };
    expect(bad.title).toBeUndefined();
    expectTypeOf<Packet>().toHaveProperty("title");
  });
});
