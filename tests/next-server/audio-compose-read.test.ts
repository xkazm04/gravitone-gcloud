// THE COMPOSER'S SERVER READ (app/(studio)/audio/_audio/read.ts `readAudio`): its reads share
// nothing - the takes, the ledger and hands behind the terms, the Suno queue behind the drafts - so
// they wait together, and each still fails on its own. Held by the readers' overlap: each stand-in
// counts the reads in flight while it waits. Before the fix the three parts were awaited one after
// another, so at most the ledger and the hands (already paired) overlapped: 2 of 4 in flight.

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
  return { wait, max: () => max, reset: () => ((now = 0), (max = 0)) };
});

vi.mock("../../lib/sound/takes.ts", async (orig) => ({ ...(await orig<object>()), listTakes: () => gate.wait([]) }));
vi.mock("../../lib/sound/store.ts", async (orig) => ({ ...(await orig<object>()), readLedger: () => gate.wait({ verdicts: [], lessons: [] }) }));
vi.mock("../../lib/sound/hands.ts", async (orig) => ({ ...(await orig<object>()), readHands: () => gate.wait({}) }));
vi.mock("../../lib/sound/suno/queue.ts", async (orig) => ({ ...(await orig<object>()), readSunoLive: () => gate.wait({ file: { proposals: [], clips: [] }, jobs: [] }) }));

import { readAudio } from "../../app/(studio)/audio/_audio/read.ts";

describe("readAudio", () => {
  it("waits for its four store reads together, and each part still answers", async () => {
    gate.reset();
    const v = await readAudio();
    expect(gate.max()).toBe(4);
    expect([v.takes.ok, v.terms.ok, v.drafts.ok]).toEqual([true, true, true]);
  });
});
