// THE STRENGTHS SECTION'S SERVER READ (app/(studio)/audio/_insight/read.ts `readStrengths`): the
// ledger's verdict rows make the table, the judged takes make each cell's evidence, and each part
// fails on its own - "an unreadable ledger is a line over the table, not a blank page", and an
// unreadable takes file is a line too, never an empty evidence list that reads as "0 takes" under
// a cell the ledger counts three for (the sign then sends n=0 and the door refuses it with words
// that name the wrong cause).

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const gate = vi.hoisted(() => ({ takesFail: false }));

vi.mock("../../lib/sound/takes.ts", async (orig) => ({
  ...(await orig<object>()),
  listTakes: async () => {
    if (gate.takesFail) throw new Error("takes.json: Unexpected end of JSON input");
    return [];
  },
}));
vi.mock("../../lib/sound/store.ts", async (orig) => ({ ...(await orig<object>()), readLedger: async () => ({ verdicts: [], lessons: [] }) }));

import { readStrengths } from "../../app/(studio)/audio/_insight/read.ts";

describe("readStrengths", () => {
  it("an unreadable takes file is the evidence's refusal, and the table still reads", async () => {
    gate.takesFail = true;
    const v = await readStrengths("music");
    gate.takesFail = false;
    expect(v.cells.ok).toBe(true);
    expect(v.evidence).toEqual({ ok: false, error: "takes.json: Unexpected end of JSON input" });
  });

  it("readable takes are the evidence", async () => {
    const v = await readStrengths("music");
    expect(v.evidence).toEqual({ ok: true, value: [] });
  });
});
