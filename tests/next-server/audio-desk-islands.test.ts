// THE AUDIO DESK'S ARRANGE ISLAND, ITS REQUEST POSTURE (app/(studio)/audio/_audio/Arrange.tsx).
// The board's writes are requests to the sound store (drag-drop ownership-boundaries): a move is
// drawn provisional until the store answers, and "nothing floats provisional forever". These
// cases hold the one helper every board write awaits through, `answered`: a write that answers is
// its answer, one that never answers is "no-answer" at the wait, and one that REJECTS - a Server
// Action whose round trip failed rejects rather than answering `ok: false` - is its words, never a
// rejection that skips the caller's settle and strands the card (and, for the rows, `rowsBusy`).

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("../../app/(studio)/_shell/Providers.tsx", () => ({ useShell: () => ({ toast: () => {} }) }));

import { answered } from "../../app/(studio)/audio/_audio/Arrange.tsx";

afterEach(() => {
  vi.useRealTimers();
});

describe("answered - every board write's wait", () => {
  it("a write that answers is its answer, and leaves no timer behind", async () => {
    vi.useFakeTimers();
    const r = await answered(Promise.resolve({ ok: true as const, value: 1 }), 15_000);
    expect(r).toEqual({ ok: true, value: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a write that never answers is no-answer at the wait", async () => {
    vi.useFakeTimers();
    const r = answered(new Promise<never>(() => {}), 15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await r).toBe("no-answer");
  });

  it("a write that rejects resolves to its words, so the caller settles the card", async () => {
    const r = await answered(Promise.reject(new Error("Failed to fetch")), 15_000).catch((e: unknown) => ({ rejected: String(e) }));
    expect(r).toEqual({ threw: "Failed to fetch" });
  });
});
