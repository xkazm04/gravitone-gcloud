import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Discipline } from "@gt/catalog/projects";
import { encodeRecord } from "@gt/domain/steps/registry";

import { partVerdict, type VerdictInput } from "../../lib/parts/verdict.ts";

// THE GATING PARTS' VERDICTS (L36) on literal records: READY only when the part's own checks say
// complete; the ads faces read their own records against the PICKED scenario; motion has one.

const SHA = "9f2c6a1e0b7d4c3f8a5e2d1c0b9a8f7e6d5c4b3a29180f7e6d5c4b3a2918a0b1";
const BLOB = { sha256: SHA, bytes: 7, mime: "image/png" };

function input(discipline: Discipline, records: Record<string, unknown>, extra: Partial<VerdictInput> = {}): VerdictInput {
  const decoded = new Map<string, Readonly<Record<string, unknown>>>();
  for (const [k, raw] of Object.entries(records)) {
    const d = encodeRecord(k, raw);
    if (!d.ok) throw new Error(d.error.message);
    if (typeof d.value === "object" && d.value !== null) decoded.set(k, { ...d.value });
  }
  return { projectId: "p1", title: "Glass Harbor", discipline, targetS: 30, plansVoice: false, records: decoded, ...extra };
}

const unit = (id: string, plate: Record<string, unknown>, startS: number, more: Record<string, unknown> = {}) => ({
  id, sourceId: "cut-1", beatRef: { at: `0:${String(startS).padStart(2, "0")}` }, ordinal: 1, ofBeat: 1, startS, holdS: 15, kind: "beat", beatKind: "hook", title: id, line: "", plate, clip: { status: "not-started", motion: "" }, elements: [], texts: [], ...more,
});
const frames = (...units: unknown[]) => ({ frames: { renderId: "cut-1", units } });
const READY = { state: "ready", blob: BLOB };

describe("frames", () => {
  it("is READY only with every plate composed, none stale, no figure unsourced", () => {
    expect(partVerdict("frames", input("educational", frames(unit("u1", READY, 0), unit("u2", READY, 15))))).toEqual({ state: "ready", codes: [{ code: "plates-composed", text: "2 of 2 plates composed" }] });
    expect(partVerdict("frames", input("educational", frames(unit("u1", READY, 0), unit("u2", { state: "empty" }, 15)))).state).toBe("working");
    const stale = partVerdict("frames", input("educational", frames(unit("u1", { ...READY, subject: "a gull", renderedSubject: "a pier" }, 0))));
    expect(stale).toMatchObject({ state: "working", codes: [{ code: "plates-composed" }, { code: "plate-stale", text: "1 plate behind its subject" }] });
    const figure = partVerdict("frames", input("educational", frames(unit("u1", READY, 0, { texts: [{ id: "t", role: "figure", value: "4%" }] }))));
    expect(figure.codes.map((c) => c.text)).toContain("1 figure unsourced");
    expect(figure.state).toBe("working");
    expect(partVerdict("frames", input("educational", frames(unit("u1", { state: "refused" }, 0))))).toEqual({ state: "blocked", codes: [{ code: "plate-refused", text: "1 plate refused" }] });
    expect(partVerdict("frames", input("educational", {})).state).toBe("empty");
  });

  it("reads the ads shots against the PICKED scenario, and a take for another reads stale", () => {
    const scen = { "ads-scenarios": { ideaId: "i1", pickedId: "s1", options: [{ id: "s1", title: "S1", shots: [{ id: "a", durationS: 5 }, { id: "b", durationS: 5 }] }] } };
    expect(partVerdict("frames", input("ads", { ...scen, "ads-shots": { scenarioId: "s1", shots: { a: { adoptedImage: "img-a" }, b: { adoptedImage: "img-b" } } } }))).toEqual({ state: "ready", codes: [{ code: "images-adopted", text: "2 of 2 images adopted" }] });
    expect(partVerdict("frames", input("ads", { ...scen, "ads-shots": { scenarioId: "s0", shots: { a: { adoptedImage: "x" } } } })).codes[0]?.code).toBe("scenario-changed");
    expect(partVerdict("frames", input("ads", {})).codes[0]?.code).toBe("no-scenario");
  });
});

describe("motion (v1 had no verdict)", () => {
  it("is READY when every plate moves or is declined on the plate it was directed from", () => {
    const f = frames(unit("u1", READY, 0, { clip: { status: "not-started", motion: "the gull drifts left" } }), unit("u2", READY, 15));
    const declined = { "motion-direction": { byFrame: { u2: { outcome: { kind: "declined", reason: "no separable element" }, plate: SHA } } } };
    expect(partVerdict("motion", input("educational", { ...f, ...declined }))).toMatchObject({ state: "ready", codes: [{ code: "motion-directed", text: "1 moving · 1 declined of 2" }] });
    const redrawn = { "motion-direction": { byFrame: { u2: { outcome: { kind: "declined" }, plate: "another-plate" } } } };
    expect(partVerdict("motion", input("educational", { ...f, ...redrawn }))).toMatchObject({ state: "working", codes: [{ code: "units-undirected", text: "1 plate without direction" }, { code: "motion-directed", text: "1 moving · 0 declined of 2" }] });
  });

  it("reads the ads clips: adopted and done", () => {
    const scen = { "ads-scenarios": { pickedId: "s1", options: [{ id: "s1", title: "S1", shots: [{ id: "a", durationS: 5 }] }] } };
    expect(partVerdict("motion", input("ads", { ...scen, "ads-shots": { scenarioId: "s1", shots: { a: { clips: [{ id: "c1", status: "done" }], adoptedClip: "c1" } } } })).state).toBe("ready");
    expect(partVerdict("motion", input("ads", { ...scen, "ads-shots": { scenarioId: "s1", shots: { a: { clips: [{ id: "c1", status: "generating" }], adoptedClip: "c1" } } } })).state).toBe("empty");
  });
});

describe("score", () => {
  it("is READY when every cue has a take in use", () => {
    const spot = (id: string, take?: string) => ({ id, title: id, sceneIds: ["u1"], note: "", ...(take === undefined ? {} : { activeTakeId: take }) });
    expect(partVerdict("score", input("trailer", { score: { spots: [spot("c1", "t1"), spot("c2")] } }))).toEqual({ state: "working", codes: [{ code: "take-missing", text: "1 cue without a take" }, { code: "cues-spotted", text: "2 cues spotted" }] });
    expect(partVerdict("score", input("trailer", { score: { spots: [spot("c1", "t1")] } })).state).toBe("ready");
    expect(partVerdict("score", input("trailer", { score: { spots: [] } })).state).toBe("empty");
  });

  it("reads ads-score, not score, against the picked scenario (v1 read the wrong record)", () => {
    const scen = { "ads-scenarios": { pickedId: "s1", options: [{ id: "s1", title: "S1", shots: [{ id: "a", durationS: 5 }] }] } };
    expect(partVerdict("score", input("ads", { ...scen, "ads-score": { scenarioId: "s1", takeIds: ["t1"], activeTakeId: "t1" } })).state).toBe("ready");
    expect(partVerdict("score", input("ads", { ...scen, "ads-score": { scenarioId: "s0", takeIds: ["t1"], activeTakeId: "t1" } })).codes[0]?.code).toBe("scenario-changed");
  });
});

describe("cut", () => {
  const picture = frames(unit("u1", READY, 0), unit("u2", READY, 15));
  const score = { score: { spots: [{ id: "c1", title: "bed", sceneIds: ["u1", "u2"], note: "", activeTakeId: "t1", takeIds: ["t1"] }] } };

  it("holds READY on the finish line's failures, in its own deny sentences", () => {
    const v = partVerdict("cut", input("educational", { ...picture, ...score }, { takeIds: null }));
    expect(v.state).toBe("working");
    expect(v.codes).toContainEqual({ code: "finish-takes", text: "1 cue without a take" });
  });

  it("is READY when the finish line holds, and an unplanned voice lane does not hold it", () => {
    expect(partVerdict("cut", input("educational", { ...picture, ...score }, { takeIds: new Set(["t1"]) })).state).toBe("ready");
    const spoken = frames(unit("u1", READY, 0, { line: "Four percent of the harbour is gone." }), unit("u2", READY, 15));
    const v = partVerdict("cut", input("educational", { ...spoken, ...score }, { takeIds: new Set(["t1"]) }));
    expect(v.state).toBe("ready");
    expect(v.codes).toContainEqual({ code: "finish-voice", text: "1 line not recorded" });
    expect(partVerdict("cut", input("educational", { ...spoken, ...score }, { takeIds: new Set(["t1"]), plansVoice: true })).state).toBe("working");
  });

  it("reads ads-finish for an ad: a call to action and a rendered aspect", () => {
    expect(partVerdict("cut", input("ads", { "ads-finish": { endCard: { cta: "Pack one" }, exports: [{ aspect: "9:16", exportId: "e1", createdAt: 1 }] } })).state).toBe("ready");
    expect(partVerdict("cut", input("ads", { "ads-finish": { endCard: { cta: "" } } })).codes.map((c) => c.code)).toEqual(["cta-missing", "no-export"]);
  });

  it("is not a music video's part", () => {
    expect(partVerdict("cut", input("music-video", {})).codes[0]?.code).toBe("not-applicable");
  });
});
