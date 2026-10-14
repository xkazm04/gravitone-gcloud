import { describe, expect, expectTypeOf, it } from "vitest";

import { blobRefSchema } from "../src/blob.ts";
import { estimateSchema } from "../src/estimate.ts";
import type { MediaLane, ResourceLane } from "../src/lane.ts";
import { mediaLaneSchema, resourceLaneSchema } from "../src/lane.ts";
import { accept, BLOB, PRICED, refuse, SHA, UNPRICED } from "./_records.ts";

describe("estimate — never invent a price", () => {
  it("accepts a priced estimate, and an unpriced one that says why", () => {
    expect(accept(estimateSchema, PRICED)).toEqual(PRICED);
    expect(accept(estimateSchema, UNPRICED).unpricedReason).toBe(UNPRICED.unpricedReason);
  });
  it("leaves the reason key absent on a priced estimate", () => {
    expect("unpricedReason" in accept(estimateSchema, PRICED)).toBe(false);
  });
  it("refuses an unpriced estimate with no reason — null must not read as free", () => {
    refuse(estimateSchema, { seconds: 10, usd: null }, "unpricedReason");
    refuse(estimateSchema, { seconds: 10, usd: null, unpricedReason: "  " }, "unpricedReason");
  });
  it("refuses a price that also claims to be unpriced", () => {
    refuse(estimateSchema, { seconds: 10, usd: 0.04, unpricedReason: "vendor reports nothing" }, "unpricedReason");
  });
  it("refuses NaN, Infinity and negative money or time", () => {
    for (const usd of [Number.NaN, Number.POSITIVE_INFINITY, -0.01]) refuse(estimateSchema, { seconds: 10, usd }, "usd");
    refuse(estimateSchema, { seconds: Number.POSITIVE_INFINITY, usd: 0 }, "seconds");
  });
  it("a band holds its point figure, and needs one (articles: $47–92 per run)", () => {
    accept(estimateSchema, { seconds: 2280, usd: 69.5, usdRange: [47, 92] });
    refuse(estimateSchema, { seconds: 2280, usd: 120, usdRange: [47, 92] }, "usdRange");
    refuse(estimateSchema, { seconds: 2280, usd: null, unpricedReason: "x", usdRange: [47, 92] }, "usdRange");
  });
});

describe("lanes", () => {
  it("media and resource lanes are disjoint vocabularies that cannot be swapped", () => {
    expectTypeOf<MediaLane>().not.toExtend<ResourceLane>();
    expectTypeOf<ResourceLane>().not.toExtend<MediaLane>();
    refuse(resourceLaneSchema, "image", "(root)");
    refuse(mediaLaneSchema, "gpu.local", "(root)");
    for (const l of mediaLaneSchema.options) expect(resourceLaneSchema.options).not.toContain(l);
  });
});

describe("blob ref", () => {
  it("accepts a content address", () => {
    expect(accept(blobRefSchema, BLOB)).toEqual(BLOB);
  });
  it("refuses a digest that is short, uppercase or not hex", () => {
    refuse(blobRefSchema, { ...BLOB, sha256: SHA.slice(1) }, "sha256");
    refuse(blobRefSchema, { ...BLOB, sha256: SHA.toUpperCase() }, "sha256");
    refuse(blobRefSchema, { ...BLOB, sha256: `${SHA.slice(1)}g` }, "sha256");
  });
  it("refuses fractional or negative sizes and a mime with no subtype", () => {
    refuse(blobRefSchema, { ...BLOB, bytes: 1.5 }, "bytes");
    refuse(blobRefSchema, { ...BLOB, bytes: -1 }, "bytes");
    refuse(blobRefSchema, { ...BLOB, mime: "jpeg" }, "mime");
  });
});
