import { describe, expect, it } from "vitest";

import { styleSchema, type Style } from "../src/style.ts";
import {
  blockDigest,
  compileStyleBlock,
  isLegacySheet,
  lockBlocker,
  PINNED_REFS,
  PROOF_CAP,
  proofEvidence,
  ratchetBlocker,
  SEND_REFS,
  sheetCoverage,
  statusOf,
  STYLE_TRIALS,
  styleRefs,
} from "../src/style.ratchet.ts";
import { styleSummary, styleView, summaryOfView } from "../src/styleView.ts";
import { accept, refuse } from "./_records.ts";

// THE MERGED RECORD AND ITS RATCHET (Phase 5 decisions 1-2): the door derives status, the
// ratchet reads one record for both v1 halves, the view is the one projection a screen gets.

const BLOCK = {
  technique: "Flat vector shapes",
  subject: "Simple iconic objects",
  palette: [
    { name: "ink", hex: "#0b0d12", role: "ground" as const },
    { name: "bone", hex: "#e8e1d4", role: "objects" as const },
    { name: "neon", hex: "#2fb7ff", role: "accent" as const },
  ],
  finish: "Matte",
};
const D = blockDigest(BLOCK);
const shaOf = (id: string) => [...id].map((c) => c.charCodeAt(0).toString(16)).join("").padStart(64, "0");
type ProofOver = { state?: "pending" | "approved" | "rejected"; trialId?: string; blockDigest?: string; at?: string };
const proof = (id: string, over: ProofOver = {}, digest = true) => ({
  id,
  label: id,
  media: { sha256: shaOf(id), bytes: 10, mime: "image/png" },
  state: "approved" as const,
  at: "2026-10-17T09:00:00.000Z",
  ...(digest ? { blockDigest: D } : {}),
  ...over,
});
const base = {
  id: "flat",
  name: "Flat",
  family: "graphic",
  status: "candidate",
  origin: { kind: "preset", presetId: "flat-vector" },
  observables: {},
  recipe: "Flat vector shapes.",
  negative: "",
  evidence: [],
  block: BLOCK,
};
const kept = (scene: string, by = "operator") => ({ run: "r1", scene, mechanism: "m", verdict: "keep", at: "2026-10-17T08:00:00.000Z", by });

describe("the record's door derives status", () => {
  it("refuses a status its own evidence and lock do not give, in either direction", () => {
    refuse(styleSchema, { ...base, status: "proven" }, "status is derived: this record reads candidate, not proven");
    refuse(styleSchema, { ...base, evidence: [kept("a"), kept("b")] }, "reads proven, not candidate");
    refuse(styleSchema, { ...base, status: "locked", evidence: [kept("a"), kept("b")] }, "no lock");
    accept(styleSchema, { ...base, status: "locked", evidence: [kept("a"), kept("b")], lock: { at: "2026-10-17T10:00:00.000Z", by: "op" } });
  });
  it("a sheet or a lock needs a block; proof ids are unique", () => {
    const { block: _b, ...noBlock } = base;
    void _b;
    refuse(styleSchema, { ...noBlock, proofs: [proof("p")] }, "needs a block");
    refuse(styleSchema, { ...base, proofs: [proof("p"), proof("p")] }, "unique");
  });
  it("defaults the theme half for a v1 catalogue entry", () => {
    const { block: _b, ...entry } = base;
    void _b;
    expect(accept(styleSchema, entry)).toMatchObject({ elements: [], exemplars: [], proofs: [] });
  });
});

const style = (over: Record<string, unknown>): Style => accept(styleSchema, { ...base, ...over });

describe("the ratchet (v1 canLock / lockBlocker / ratchetBlocker / styleRefs, one reading)", () => {
  it("an approval on a trial problem is a kept cell; a free subject is a cell of its own", () => {
    const a = proofEvidence("flat", { id: "p1", trialId: "flywheel" }, "keep", "2026-10-17T09:00:00.000Z");
    const b = proofEvidence("flat", { id: "p2", trialId: "flywheel" }, "keep", "2026-10-17T09:00:00.000Z");
    const c = proofEvidence("flat", { id: "p3" }, "keep", "2026-10-17T09:00:00.000Z");
    expect(statusOf({ evidence: [a, b] })).toBe("candidate");
    expect(statusOf({ evidence: [a, c] })).toBe("proven");
    expect(statusOf({ evidence: [a, { ...c, by: "agent" }] })).toBe("candidate");
  });
  it("the blocker names what is missing in the work's words, stale approvals included", () => {
    const sheet = [proof("a", { trialId: "peak-and-fall" }), proof("b", { trialId: "wish-list", blockDigest: "00000000" })];
    expect(lockBlocker(style({ proofs: sheet }))).toBe("approve 2 more problems — 1 of 3 covered; missing inventory, analogy, mechanism, flow (1 approved under an earlier block no longer count)");
    expect(lockBlocker(style({ proofs: [proof("a", { state: "pending", trialId: "flywheel" })] }))).toBe("1 proof still undecided");
    expect(lockBlocker(style({ proofs: [] }))).toBe("generate at least one proof first");
  });
  it("covering three problems locks; a legacy sheet not yet locked is held to coverage too (ruled 2026-10-17)", () => {
    const three = STYLE_TRIALS.slice(0, 3).map((t) => proof(t.id, { trialId: t.id }));
    const evidence = three.map((p) => proofEvidence("flat", p, "keep", "2026-10-17T09:00:00.000Z"));
    expect(lockBlocker(style({ proofs: three, evidence, status: "proven" }))).toBeNull();
    const legacy = [proof("old", {}, false)];
    expect(isLegacySheet({ proofs: legacy })).toBe(true);
    expect(lockBlocker(style({ proofs: legacy }))).toBe("approve 3 more problems — 0 of 3 covered; missing quantity, inventory, analogy, mechanism, flow");
  });
  it("styleRefs pins the founding approvals and rolls the newest, never sending a stale or pending one", () => {
    const sheet = ["a", "b", "c", "d", "e", "f"].map((id, i) => proof(id, { at: `2026-10-17T09:0${i}:00.000Z` }));
    sheet.push(proof("g", { state: "pending", at: "2026-10-17T09:09:00.000Z" }), proof("h", { blockDigest: "00000000", at: "2026-10-17T09:08:00.000Z" }));
    const s = style({ proofs: sheet });
    const refs = styleRefs(s).map((r) => s.proofs.find((p) => p.media.sha256 === r.sha256)?.id);
    expect(refs).toEqual(["a", "b", "f", "e"]);
    expect(PINNED_REFS).toBeLessThan(SEND_REFS);
  });
  it("the master may not walk away: the founding proof survives a full sheet, the newest still reaches the model (pipeline/style-ref-stability.mts)", () => {
    const sheetOf = (n: number) => style({ proofs: Array.from({ length: n }, (_, i) => proof(`p${i + 1}`, { at: new Date(Date.UTC(2026, 9, 17, 9, 0, i)).toISOString() })) });
    const ids = (s: Style) => styleRefs(s).map((r) => s.proofs.find((p) => p.media.sha256 === r.sha256)?.id);
    expect(PINNED_REFS).toBeLessThan(SEND_REFS);
    expect(SEND_REFS - PINNED_REFS).toBeGreaterThanOrEqual(1);
    const full = sheetOf(PROOF_CAP);
    expect(ids(full)).toContain("p1");
    expect(ids(full)).toContain(`p${PROOF_CAP}`);
    expect(ids(full)).toHaveLength(SEND_REFS);
    expect(styleRefs(sheetOf(0))).toEqual([]);
    for (let n = PINNED_REFS; n <= PROOF_CAP; n++) expect(ids(sheetOf(n)).slice(0, PINNED_REFS)).toEqual(["p1", "p2"]);
  });
  it("a lock freezes the block and itself, keeps an approval, and nothing demotes", () => {
    const evidence = [kept("a"), kept("b")];
    const lock = { at: "2026-10-17T10:00:00.000Z", by: "op" };
    const locked = style({ status: "locked", evidence, lock, proofs: [proof("a")] });
    expect(ratchetBlocker(locked, { ...locked, block: { ...BLOCK, finish: "Gloss" } })).toContain("duplicate it into a new draft to change the block");
    expect(ratchetBlocker(locked, { ...locked, proofs: [] })).toContain("keep at least one approval");
    const { lock: _l, ...unlocked } = locked;
    void _l;
    expect(ratchetBlocker(locked, unlocked)).toBe("the ratchet is one-way — a locked style cannot become proven");
    const renamed: Style = { ...locked, name: "Renamed", proofs: [proof("a"), proof("z")] };
    expect(ratchetBlocker(locked, renamed)).toBeNull();
    const proven = style({ status: "proven", evidence });
    expect(ratchetBlocker(proven, { ...proven, evidence: [] })).toContain("cannot become candidate");
  });
  it("the digest is of v1's compiled words, so a proof's recorded digest survives the move", () => {
    expect(compileStyleBlock(BLOCK)).toBe(
      "Flat vector shapes. Simple iconic objects. Strict three-colour palette: ink (#0b0d12) as the dominant background, bone (#e8e1d4) for the objects, neon (#2fb7ff) used only on the single element that carries the point, and nowhere else. Matte.",
    );
    expect(D).toMatch(/^[0-9a-f]{8}$/);
    expect(sheetCoverage({ block: BLOCK, proofs: [] }).digest).toBe(D);
  });
});

describe("the view a screen is handed", () => {
  it("carries the gate's sentence, coverage per problem, lineage per proof and the refs", () => {
    const s = style({ proofs: [proof("a", { trialId: "flywheel" }), proof("b", { state: "rejected", trialId: "wish-list" }), proof("c", {}, false)] });
    const v = styleView(s, 7, "2026-10-17T11:00:00.000Z");
    expect(v).toMatchObject({ rev: 7, status: "candidate", blockDigest: D, sheet: { approved: 2, rejected: 1, pending: 0, cap: 14 } });
    expect(v.why).toBe("candidate — operator keeps in 0 of 2 distinct cells; approvals on trial problems count");
    expect(summaryOfView(v)).toEqual(styleSummary(s, 7, "2026-10-17T11:00:00.000Z"));
    expect(v.proofs.map((p) => [p.id, p.lineage, p.problem ?? null])).toEqual([["a", "current", "mechanism"], ["b", "current", "inventory"], ["c", "unknown", null]]);
    expect(v.coverage.find((c) => c.problem === "mechanism")).toMatchObject({ approved: 1, covered: true, trialIds: ["flywheel"] });
    expect(v.lock).toMatchObject({ can: false, legacySheet: false });
    expect(styleSummary(s, 7, "2026-10-17T11:00:00.000Z")).toMatchObject({ cover: s.proofs[0]?.media, proofs: { approved: 2, rejected: 1, pending: 0 } });
  });
  it("fills the reference window with approvals that are sent, so a stale one leaves room", () => {
    const sheet = (stale: number) =>
      style({ proofs: Array.from({ length: PROOF_CAP }, (_, i) => proof(`p${i}`, i < stale ? { blockDigest: "00000000" } : {})) });
    expect(styleView(sheet(0), 1, "2026-10-17T11:00:00.000Z").sheet).toMatchObject({ approved: PROOF_CAP, full: true });
    expect(styleView(sheet(1), 1, "2026-10-17T11:00:00.000Z").sheet).toMatchObject({ approved: PROOF_CAP, full: false });
  });
  it("counts an operator's keep and shows an agent's", () => {
    const v = styleView(style({ evidence: [kept("a"), kept("b", "agent")] }), 1, "2026-10-17T11:00:00.000Z");
    expect(v.evidence.map((e) => [e.by, e.counts])).toEqual([["operator", true], ["agent", false]]);
    expect(v.keptCells).toBe(1);
  });
});
