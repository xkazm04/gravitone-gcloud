import { afterEach, describe, expect, it, vi } from "vitest";
import { sleep } from "../../lib/sleep";

describe("lib/sleep", () => {
  afterEach(() => vi.useRealTimers());

  it("stays pending until the delay has elapsed, then resolves with undefined", async () => {
    vi.useFakeTimers();
    let done = false;
    const p = sleep(500).then((v) => {
      done = true;
      return v;
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    await expect(p).resolves.toBeUndefined();
  });

  it("resolves for a zero delay", async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});
