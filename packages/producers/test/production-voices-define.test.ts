import { describe, expect, it } from "vitest";

import { CREATE_STEP, designCalls, designStep, levelStep, parseVoicesRequest, previewAt, voicesPlan } from "../src/production-voices/define.ts";

// A round's voices as steps, pure (spark concept-casting-stages S3): five candidates are two design calls, then one level
// step per preview; a resumed job plans only what it has not booked; a create job is one step. The bound job, against a
// fake fetch, is tests/next-server/voice-design.test.ts.

const booked = (...names: string[]) => new Map(names.map((n) => [n, {} as never]));
const script = "x".repeat(120);

const parsed = (raw: Record<string, unknown>) => {
  const r = parseVoicesRequest(raw);
  if (!r.ok) throw r.error;
  return r.value;
};
const round = (over: Record<string, unknown> = {}) => parsed({ act: "round", productionId: "prdn:the-pour", roleId: "archer", roundId: "round-1", brief: "a gravelly old voice", script, count: 5, by: "op", ...over });
const create = () => parsed({ act: "create", productionId: "prdn:the-pour", roleId: "archer", roundId: "round-1", candidateId: "voice-2", generatedVoiceId: "gen-2", name: "Archer", brief: "a gravelly old voice", pickedBy: "op" });

describe("the voices plan", () => {
  it("five candidates are two design calls, three then two, then a level per preview", () => {
    expect(designCalls(5)).toBe(2);
    expect(voicesPlan(round(), booked()).map((s) => s.name)).toEqual([designStep(1), designStep(2), levelStep(1), levelStep(2), levelStep(3), levelStep(4), levelStep(5)]);
  });

  it("a resumed job plans only what is missing, never a booked design", () => {
    expect(voicesPlan(round(), booked(designStep(1))).map((s) => s.name)).toEqual([designStep(2), levelStep(1), levelStep(2), levelStep(3), levelStep(4), levelStep(5)]);
    expect(voicesPlan(round(), booked(designStep(1), designStep(2), levelStep(1))).map((s) => s.name)).toEqual([levelStep(2), levelStep(3), levelStep(4), levelStep(5)]);
  });

  it("a create job is one step and resumes to none", () => {
    expect(voicesPlan(create(), booked()).map((s) => s.name)).toEqual([CREATE_STEP]);
    expect(voicesPlan(create(), booked(CREATE_STEP))).toEqual([]);
  });

  it("a paid step is admitted as credits; a level step costs nothing", () => {
    const [design] = voicesPlan(round(), booked());
    expect(design?.credit).toMatch(/credits/);
    const level = voicesPlan(round(), booked(designStep(1), designStep(2)))[0];
    expect(level?.credit).toBeUndefined();
    expect(level?.estimate.usd).toBe(0);
  });

  it("refuses a script the design call would refuse", () => {
    expect(parseVoicesRequest({ act: "round", productionId: "p", roleId: "r", roundId: "x", brief: "b", script: "too short", count: 5, by: "op" }).ok).toBe(false);
  });

  it("finds a preview across calls, in call order", () => {
    const blob = { sha256: "a".repeat(64), bytes: 4, mime: "audio/mpeg" };
    const call = (k: number, ids: string[]) => ({ step: designStep(k), at: "t", value: { k, previews: ids.map((id) => ({ generatedVoiceId: id, blob })), used: 1, read: "character-cost-header" } });
    const outs = new Map([[designStep(1), call(1, ["a", "b", "c"])], [designStep(2), call(2, ["d", "e"])]]);
    const fourth = previewAt(outs as never, 5, 4);
    if (!fourth.ok) throw fourth.error;
    expect(fourth.value?.generatedVoiceId).toBe("d");
  });
});
