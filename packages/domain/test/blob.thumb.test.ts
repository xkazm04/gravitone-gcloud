import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { THUMB_WIDTHS, thumbUrl, thumbWidthOf } from "../src/blob.thumb.ts";

const SHA = "ab".repeat(32);

describe("thumbUrl", () => {
  it("asks a bare blob address for its width", () => {
    expect(thumbUrl(`/api/blob/${SHA}`, 640)).toBe(`/api/blob/${SHA}?w=640`);
  });

  it("keeps the type a blob address already carries, and replaces a width rather than doubling it", () => {
    expect(thumbUrl(`/api/blob/${SHA}?type=image%2Fpng`, 320)).toBe(`/api/blob/${SHA}?type=image%2Fpng&w=320`);
    expect(thumbUrl(`/api/blob/${SHA}?w=320&type=image%2Fpng`, 1280)).toBe(`/api/blob/${SHA}?type=image%2Fpng&w=1280`);
  });

  it("leaves every other URL unchanged", () => {
    for (const u of [
      "/api/audio/cover/x.png",
      "/api/foundry/file?run=r&f=a.png",
      "data:image/png;base64,iVBORw0KGgo=",
      "/fixtures/plate-01.webp",
      `/api/blob/${SHA.toUpperCase()}`,
      `/api/blob/${SHA}/x`,
      `https://cdn.example/api/blob/${SHA}`,
    ]) {
      expect(thumbUrl(u, 640)).toBe(u);
    }
  });
});

describe("the width list", () => {
  it("admits exactly the three widths, spelled exactly", () => {
    expect(THUMB_WIDTHS).toEqual([320, 640, 1280]);
    expect(THUMB_WIDTHS.map((w) => thumbWidthOf(String(w)))).toEqual([320, 640, 1280]);
    for (const s of ["641", "0640", "640.0", "+640", " 640", "", "1e3", "2560"]) expect(thumbWidthOf(s)).toBeUndefined();
  });

  it("stays importable from a client bundle: no imports at all", () => {
    const src = readFileSync(new URL("../src/blob.thumb.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});
