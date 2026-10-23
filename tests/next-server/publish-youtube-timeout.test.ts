import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { YouTubeClient, YouTubeNetworkTimeout } from "../../lib/publish/youtube.ts";

// A hung socket must surface as a named network failure through the existing retry path,
// even when the injected fetch ignores its signal.

const dir = mkdtempSync(path.join(tmpdir(), "gt-yt-timeout-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("YouTube request timeout", () => {
  it("rejects a session-start that never answers, after retrying it", async () => {
    const file = path.join(dir, "v.mp4");
    writeFileSync(file, Buffer.alloc(1024, 1));
    let calls = 0;
    let signalSeen = false;
    const client = new YouTubeClient({
      mode: "live",
      tokenProvider: { getAccessToken: async () => "t" },
      fetch: ((_u: RequestInfo | URL, init?: RequestInit) => {
        calls++;
        signalSeen = init?.signal instanceof AbortSignal;
        return new Promise<Response>(() => {});
      }) as typeof fetch,
      maxRetries: 1,
      requestTimeoutMs: 20,
      sleep: async () => {},
    });
    const started = Date.now();
    await expect(
      client.uploadVideo({ file, title: "t", description: "d", containsSyntheticMedia: true, categoryId: "10" }),
    ).rejects.toBeInstanceOf(YouTubeNetworkTimeout);
    expect(calls).toBe(2);
    expect(signalSeen).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
