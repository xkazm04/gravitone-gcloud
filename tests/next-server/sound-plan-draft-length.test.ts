// A plan op drafted from a prompt (lib/sound/generate.ts): the draft is asked for at most
// PLAN_DRAFT_MAX_S, so a request for more is REFUSED by name instead of being drafted short and
// filed as a shorter take (parseGenerateRequest's own DURATION_BOUNDS say 600 for music).

import { describe, expect, it } from "vitest";

import { parseGenerateRequest, PLAN_DRAFT_MAX_S } from "../../lib/sound/generate.ts";

const req = (over: Record<string, unknown> = {}) => ({
  kind: "music",
  provider: "elevenlabs",
  op: "plan",
  prompt: "Warm lo-fi instrumental, 80 BPM, rhodes and vinyl",
  negative: null,
  durationS: 120,
  loop: null,
  technique: [],
  terms: { genre: [], mood: [], instrument: [], sfxCategory: null },
  tempoBpm: null,
  key: null,
  origin: "lab",
  sourceTakeId: null,
  editModes: null,
  plan: null,
  huntId: null,
  nodeId: null,
  title: null,
  ...over,
});

const refusal = (f: () => unknown): { status?: number; message: string } | undefined => {
  try {
    f();
  } catch (e) {
    return { status: (e as { status?: number }).status, message: (e as Error).message };
  }
  return undefined;
};

describe("a plan op drafted from a prompt", () => {
  it("refuses a length past the draft ceiling, naming it", () => {
    const r = refusal(() => parseGenerateRequest(req({ durationS: 600 })));
    expect(r?.status).toBe(400);
    expect(r?.message).toContain(String(PLAN_DRAFT_MAX_S));
  });

  it("takes the ceiling itself", () => {
    expect(parseGenerateRequest(req({ durationS: PLAN_DRAFT_MAX_S })).durationS).toBe(PLAN_DRAFT_MAX_S);
  });

  it("leaves a compose of the same length alone: the ceiling is the draft's, not the music bound", () => {
    expect(parseGenerateRequest(req({ op: "compose", durationS: 600 })).durationS).toBe(600);
  });
});
