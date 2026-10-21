// LANE — safeFetch BOUNDS EVERY HOP (dynamic).
//
// A caller that passes no signal used to get a fetch with no deadline: a far end
// that accepts the connection and never answers held the request forever. Each
// hop now gets a default abort timeout; a caller's own signal is kept as given.
import { test, expect } from "@playwright/test";

import { DEFAULT_HOP_TIMEOUT_MS, safeFetch, type Resolver } from "@/lib/imaging/safeUrl";

const resolve: Resolver = async () => [{ address: "93.184.216.34" }];

/** A fetch that never answers on its own and rejects only when its signal aborts. */
function hangingFetch(seen: (AbortSignal | null | undefined)[]): typeof fetch {
  return ((_url: unknown, init?: RequestInit) => {
    seen.push(init?.signal);
    return new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(init.signal?.reason ?? new Error("aborted")));
    });
  }) as typeof fetch;
}

test.describe("safeFetch default timeout", () => {
  const realFetch = globalThis.fetch;
  const realTimeout = AbortSignal.timeout;
  test.afterEach(() => {
    globalThis.fetch = realFetch;
    AbortSignal.timeout = realTimeout;
  });

  test("a never-answering fetch with no signal rejects", async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    const asked: number[] = [];
    globalThis.fetch = hangingFetch(seen);
    AbortSignal.timeout = (ms: number) => {
      asked.push(ms);
      return realTimeout.call(AbortSignal, 20);
    };
    await expect(safeFetch("https://cdn.example.com/a.png", {}, resolve)).rejects.toBeTruthy();
    expect(asked).toEqual([DEFAULT_HOP_TIMEOUT_MS]);
    expect(seen[0]).toBeTruthy();
  });

  test("a caller-supplied signal is kept unchanged", async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    globalThis.fetch = hangingFetch(seen);
    const ctl = new AbortController();
    const p = safeFetch("https://cdn.example.com/a.png", { signal: ctl.signal }, resolve);
    const settled = expect(p).rejects.toBeTruthy();
    await new Promise((r) => setTimeout(r, 30));
    ctl.abort();
    await settled;
    expect(seen[0]).toBe(ctl.signal);
  });
});
