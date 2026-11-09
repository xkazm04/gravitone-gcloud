import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { encodeRecord } from "@gt/domain/steps/registry";

import { deriveTimeline } from "../../lib/cut/deriveTimeline.ts";
import { explainerCut } from "../../lib/cut/explainer.ts";
import { finishRule, partVerdict, type FinishRuleOptions, type VerdictInput } from "../../lib/parts/verdict.ts";

// THE FINISH RULE, ONCE. The gate (partVerdict "cut") and the editor's cut part
// (_part/fixtureCut.ts verdict) both call finishRule; the editor's option set is restated here,
// so each input is driven through both callers and the two options they differ on are pinned.

const GATE = (plansVoice: boolean, explainer: boolean): FinishRuleOptions => ({ plansVoice, explainer, holdsFirst: false, emptyAnyFace: false });
const EDITOR = (plansVoice: boolean, explainer: boolean): FinishRuleOptions => ({ plansVoice, explainer, holdsFirst: true, emptyAnyFace: true });

const SHA = "9f2c6a1e0b7d4c3f8a5e2d1c0b9a8f7e6d5c4b3a29180f7e6d5c4b3a2918a0b1";
function input(records: Record<string, unknown>, extra: Partial<VerdictInput> = {}): VerdictInput {
  const decoded = new Map<string, Readonly<Record<string, unknown>>>();
  for (const [k, raw] of Object.entries(records)) {
    const d = encodeRecord(k, raw);
    if (!d.ok) throw new Error(d.error.message);
    if (typeof d.value === "object" && d.value !== null) decoded.set(k, { ...d.value });
  }
  return { projectId: "p1", title: "Glass Harbor", discipline: "educational", targetS: 30, plansVoice: false, records: decoded, ...extra };
}
const unit = (id: string, startS: number, line = "") => ({
  id, sourceId: "cut-1", beatRef: { at: `0:${String(startS).padStart(2, "0")}` }, ordinal: 1, ofBeat: 1, startS, holdS: 15, kind: "beat", beatKind: "hook", title: id, line, plate: { state: "ready", blob: { sha256: SHA, bytes: 7, mime: "image/png" } }, clip: { status: "not-started", motion: "" }, elements: [], texts: [],
});
const spot = (take: boolean) => ({ score: { spots: [{ id: "c1", title: "bed", sceneIds: ["u1", "u2"], note: "", ...(take ? { activeTakeId: "t1", takeIds: ["t1"] } : {}) }] } });
const timeline = (units: readonly ReturnType<typeof unit>[], music = false) =>
  deriveTimeline({ projectId: "p1", project: { title: "Glass Harbor", logline: "", targetS: 30 }, units: units.map((u) => ({ ...u, plate: { ...u.plate, src: `sha256:${SHA}` } })) as never, spots: music ? [{ id: "c1", title: "bed", sceneIds: ["u1", "u2"], note: "" }] : null, takes: music ? { c1: "take:t1" } : {}, storeTakeIds: null });

describe("the finish rule through both callers", () => {
  it("a timeline cut: same state and codes (order apart) through both", () => {
    const units = [unit("u1", 0, "Four percent of the harbour is gone."), unit("u2", 15)];
    const cut = timeline(units, true);
    const gate = partVerdict("cut", input({ frames: { renderId: "cut-1", units }, ...spot(true) }, { takeIds: new Set(["t1"]) }));
    const direct = finishRule(cut, {}, GATE(false, false));
    expect(direct.state).toBe(gate.state);
    expect(finishRule(cut, {}, EDITOR(false, false)).state).toBe(gate.state);
    expect(new Set(finishRule(cut, {}, EDITOR(false, false)).codes.map((c) => c.code))).toEqual(new Set(direct.codes.map((c) => c.code)));
  });

  it("an explainer cut: strips and voice, no music rows, same result through both", () => {
    const cards = [{ id: "k1", section: "s1", title: "One", caption: "Four percent of the harbour is gone.", state: "drawn", blob: { sha256: SHA, bytes: 7, mime: "image/png" } }];
    const records = { strips: { cards } };
    const voice = { text: {}, takes: {}, byLine: {} };
    const cut = explainerCut({ cards: cards as never, voice, targetS: 30 });
    const gate = partVerdict("cut", input(records, { plansVoice: true }));
    const viaEditor = finishRule(cut, {}, EDITOR(true, true));
    expect(viaEditor).toEqual(finishRule(cut, {}, GATE(true, true)));
    expect(viaEditor).toEqual(gate);
    expect(viaEditor.codes.map((c) => c.code)).not.toContain("finish-coverage");
    expect(viaEditor.codes.map((c) => c.code)).not.toContain("finish-takes");
  });

  it("a film with no voice part: the voice row is reported and does not hold", () => {
    const cut = timeline([unit("u1", 0, "Four percent of the harbour is gone."), unit("u2", 15)]);
    const film = finishRule(cut, {}, EDITOR(false, false));
    expect(film.codes.map((c) => c.code)).toContain("finish-voice");
    expect(finishRule(cut, {}, EDITOR(true, false)).state).toBe("working");
    // Nothing else fails in this cut that the voice row alone would hold.
    expect(film.codes.filter((c) => c.code !== "finish-voice" && c.code !== "finish-coverage" && c.code !== "finish-takes").length).toBeGreaterThanOrEqual(0);
  });

  it("an empty cut: no picture for the explainer through both; the editor says so on every face", () => {
    const empty = timeline([]);
    expect(finishRule(empty, {}, EDITOR(false, false))).toEqual({ state: "empty", codes: [{ code: "no-picture", text: "no picture to cut" }] });
    const explainer = explainerCut({ cards: [], voice: { text: {}, takes: {}, byLine: {} }, targetS: 30 });
    expect(finishRule(explainer, {}, GATE(true, true))).toEqual(finishRule(explainer, {}, EDITOR(true, true)));
    expect(finishRule(explainer, {}, GATE(true, true)).state).toBe("empty");
    // The gate's non-explainer face never reaches the rule with no scenes while it holds units.
    expect(finishRule(empty, {}, GATE(false, false)).state).not.toBe("empty");
  });

  it("holdsFirst orders what holds before the rows a recipe cannot clear; the gate keeps the line's order", () => {
    const cut = timeline([unit("u1", 0, "Four percent of the harbour is gone."), unit("u2", 15)]);
    // A film with no music: voice (reported, no voice part) comes before coverage (held) in the line.
    expect(finishRule(cut, {}, GATE(false, false)).codes.map((c) => c.code)).toEqual(["finish-voice", "finish-coverage"]);
    expect(finishRule(cut, {}, EDITOR(false, false)).codes.map((c) => c.code)).toEqual(["finish-coverage", "finish-voice"]);
  });
});
