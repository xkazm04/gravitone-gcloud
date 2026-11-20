import { describe, expect, it } from "vitest";

import type { SleeveRequest } from "@gt/domain/release.sleeve";

import { sleevePlan, takeOf, takeStep } from "../src/release-sleeve/define.ts";
import { pixelsOf } from "../src/release-sleeve/pixels.ts";

// The sleeve producer's plan and its pixel reader (spark studio-to-release WP3), pure: N take steps, none once booked;
// a take's size and colour read off its own header. The bound launch and drive are tests/next-server/release-sleeve.test.ts.

const booked = (...names: string[]) => new Map(names.map((n) => [n, {} as never]));
const req = (takes: number): SleeveRequest => ({ releaseId: "rel-0000000000a1", prompt: "a lyre of light", provider: "codex", takes, estimates: { take: { seconds: 120, usd: 0 } }, by: "op" }) as SleeveRequest;

describe("the sleeve plan", () => {
  it("plans one step per take, in order, and only the takes not yet booked", () => {
    expect(sleevePlan(req(4), booked()).map((s) => s.name)).toEqual(["take:1", "take:2", "take:3", "take:4"]);
    expect(sleevePlan(req(4), booked(takeStep(1), takeStep(3))).map((s) => s.name)).toEqual(["take:2", "take:4"]);
    expect(sleevePlan(req(2), booked(takeStep(1), takeStep(2)))).toEqual([]);
    expect(sleevePlan(req(1), booked())[0]?.estimate).toEqual({ seconds: 120, usd: 0 });
  });

  it("names a take only inside the request's count", () => {
    expect(takeOf("take:4", req(4))).toBe(4);
    expect(takeOf("take:5", req(4))).toBeNull();
    expect(takeOf("take:0", req(4))).toBeNull();
    expect(takeOf("draw", req(4))).toBeNull();
  });
});

const png = (w: number, h: number, colour: number): Uint8Array => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  b[24] = 8;
  b[25] = colour;
  return b;
};
const jpeg = (w: number, h: number, components: number): Uint8Array => {
  const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, components, 0, 0, 0, 0, 0, 0]);
  return b;
};
const webpX = (w: number, h: number): Uint8Array => {
  const b = new Uint8Array(30);
  b.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
  b.set([..."WEBPVP8X"].map((c) => c.charCodeAt(0)), 8);
  b.set([(w - 1) & 255, ((w - 1) >> 8) & 255, (w - 1) >> 16, (h - 1) & 255, ((h - 1) >> 8) & 255, (h - 1) >> 16], 24);
  return b;
};

describe("pixelsOf", () => {
  it("reads a PNG's size and calls truecolour and palette RGB, grey not", () => {
    expect(pixelsOf(png(3000, 3000, 2))).toEqual({ widthPx: 3000, heightPx: 3000, rgb: true, mime: "image/png" });
    expect(pixelsOf(png(1152, 1152, 6))?.rgb).toBe(true);
    expect(pixelsOf(png(1024, 1024, 3))?.rgb).toBe(true);
    expect(pixelsOf(png(1, 1, 4))).toEqual({ widthPx: 1, heightPx: 1, rgb: false, mime: "image/png" });
    expect(pixelsOf(png(64, 64, 0))?.rgb).toBe(false);
  });

  it("reads a JPEG frame: three components RGB, one grey, four CMYK", () => {
    expect(pixelsOf(jpeg(1600, 1200, 3))).toEqual({ widthPx: 1600, heightPx: 1200, rgb: true, mime: "image/jpeg" });
    expect(pixelsOf(jpeg(1600, 1200, 1))?.rgb).toBe(false);
    expect(pixelsOf(jpeg(3000, 3000, 4))?.rgb).toBe(false);
  });

  it("reads an extended WebP's canvas, and nothing from bytes that are no picture", () => {
    expect(pixelsOf(webpX(2048, 2048))).toEqual({ widthPx: 2048, heightPx: 2048, rgb: true, mime: "image/webp" });
    expect(pixelsOf(new TextEncoder().encode("not a picture at all, just words"))).toBeNull();
  });
});
