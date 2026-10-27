// THE HUNT RETURN'S UPLOAD CLIENT (app/(studio)/audio/_hunt/returnClient.ts): an upload the studio
// never answers must settle. Before the deadline, a fetch that neither resolved nor rejected held
// its leaf in `returning` until a reload, and a second drop on that leaf was refused meanwhile.
// The deadline scales with the file at a stated minimum rate, so a slow live upload of a large WAV
// is not cut off by a flat number.

import { afterEach, describe, expect, it, vi } from "vitest";

import { returnDeadlineMs, uploadLeafReturn } from "../../app/(studio)/audio/_hunt/returnClient.ts";

const file = (bytes: number): File => new File([new Uint8Array(bytes)], "take.wav", { type: "audio/wav" });
const input = (bytes: number) => ({ hunt: "h", node: "n", file: file(bytes), op: "op" });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("uploadLeafReturn", () => {
  it("a fetch the studio never answers settles as a refusal that names the deadline", async () => {
    vi.useFakeTimers();
    // a stalled connection: pending until its signal aborts, as a real fetch does
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    let settled: Awaited<ReturnType<typeof uploadLeafReturn>> | undefined;
    void uploadLeafReturn(input(1024)).then((r) => (settled = r));
    await vi.advanceTimersByTimeAsync(returnDeadlineMs(1024) + 1);
    expect(settled).toBeDefined();
    expect(settled?.ok).toBe(false);
    expect(settled && !settled.ok ? settled.error : "").toMatch(/did not answer within \d+ s/);
  });

  it("a live upload inside its deadline is not cut off", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ id: "t1", created: true }), { status: 200 }));
    const r = await uploadLeafReturn(input(1024));
    expect(r).toEqual({ ok: true, value: { id: "t1", created: true } });
  });

  it("the deadline grows with the file and covers the largest at the minimum rate", () => {
    expect(returnDeadlineMs(60 * 1048576)).toBeGreaterThan(returnDeadlineMs(1024));
    expect(returnDeadlineMs(60 * 1048576)).toBeGreaterThanOrEqual((60 * 1048576 * 1000) / 131072);
  });
});
