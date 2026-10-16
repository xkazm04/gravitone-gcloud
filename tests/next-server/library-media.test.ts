import { describe, expect, it } from "vitest";

import { blobRoute, coverUrl, drawsFace } from "../../lib/library/media.ts";

// The client twin of lib/parts/gates.ts `blobRouteUrl`: the same address, and no
// address for something that is not a sha (a broken row must not become a fetch).

const SHA = "ab".repeat(32);

describe("blobRoute", () => {
  it("addresses L39's blob route with the type, as the server does", () => {
    expect(blobRoute(SHA, "image/jpeg")).toBe(`/api/blob/${SHA}?type=image%2Fjpeg`);
    expect(coverUrl({ blobSha: SHA, mime: null, nearBlack: false })).toBe(`/api/blob/${SHA}`);
  });
  it("gives no address for no blob or a malformed one", () => {
    expect(blobRoute(null, "image/png")).toBeNull();
    expect(blobRoute("../etc/passwd", "image/png")).toBeNull();
  });
  it("draws a face only where there is no picture and something to draw", () => {
    const none = { blobSha: null, mime: null, nearBlack: false };
    expect(drawsFace({ cover: none, peaks: [0.1] })).toBe(true);
    expect(drawsFace({ cover: none })).toBe(false);
    expect(drawsFace({ cover: { blobSha: SHA, mime: "image/png", nearBlack: false }, palette: ["#000000"] })).toBe(false);
  });
});
