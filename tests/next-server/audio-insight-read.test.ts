// THE STRENGTHS SECTION'S SERVER READ (app/(studio)/audio/_insight/read.ts `readStrengths`): the
// ledger's verdict rows make the table, the judged takes make each cell's evidence, and each part
// fails on its own - "an unreadable ledger is a line over the table, not a blank page", and an
// unreadable takes file is a line too, never an empty evidence list that reads as "0 takes" under
// a cell the ledger counts three for (the sign then sends n=0 and the door refuses it with words
// that name the wrong cause). The two reads share nothing, so they wait together: each stand-in
// counts the reads in flight while it waits (before the fix, one after the other: 1 of 2).

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const gate = vi.hoisted(() => {
  let now = 0;
  let max = 0;
  const wait = async <T,>(v: T): Promise<T> => {
    now++;
    max = Math.max(max, now);
    await new Promise((r) => setTimeout(r, 5));
    now--;
    return v;
  };
  return { takesFail: false, takes: [] as unknown[], rubricReads: 0, wait, max: () => max, reset: () => ((now = 0), (max = 0)) };
});

vi.mock("../../lib/sound/takes.ts", async (orig) => ({
  ...(await orig<object>()),
  listTakes: async () => {
    const v = await gate.wait(gate.takes);
    if (gate.takesFail) throw new Error("takes.json: Unexpected end of JSON input");
    return v;
  },
}));
vi.mock("@gt/ui/components/audio/rubric.ts", async (orig) => {
  const m = await orig<typeof import("@gt/ui/components/audio/rubric.ts")>();
  return { ...m, readRubric: (...a: Parameters<typeof m.readRubric>) => (gate.rubricReads++, m.readRubric(...a)) };
});
vi.mock("../../lib/sound/store.ts", async (orig) => ({ ...(await orig<object>()), readLedger: () => gate.wait({ verdicts: [], lessons: [] }) }));

import { readStrengths, unscoredCount } from "../../app/(studio)/audio/_insight/read.ts";

describe("readStrengths", () => {
  it("an unreadable takes file is the evidence's refusal, and the table still reads", async () => {
    gate.takesFail = true;
    const v = await readStrengths("music");
    gate.takesFail = false;
    expect(v.cells.ok).toBe(true);
    expect(v.evidence).toEqual({ ok: false, error: "takes.json: Unexpected end of JSON input" });
  });

  it("waits for the ledger and the takes together", async () => {
    gate.reset();
    await readStrengths("music");
    expect(gate.max()).toBe(2);
  });

  it("readable takes are the evidence", async () => {
    const v = await readStrengths("music");
    expect(v.evidence).toEqual({ ok: true, value: [] });
  });
});

describe("unscoredCount - the rubric tab's tally", () => {
  it("counts the judged takes with a dimension unscored, reading each take's rubric once", async () => {
    const take = (id: string, verdict: string, ratings: Record<string, number>) => ({ id, kind: "music", verdict, loop: null, ratings });
    gate.takes = [take("a", "kept", {}), take("b", "rejected", {}), take("c", "unjudged", {})];
    gate.rubricReads = 0;
    const r = await unscoredCount("music");
    gate.takes = [];
    expect(r).toEqual({ ok: true, value: 2 });
    expect(gate.rubricReads).toBe(2);
  });
});
