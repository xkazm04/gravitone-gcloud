import { describe, expect, it } from "vitest";
import { parseAt } from "@gt/domain/door";
import { dearestRate, quote, toEstimate } from "../src/pricing/quote.ts";
import { PRICE_TABLE, priceRowSchema, rowKey, type PriceRow } from "../src/pricing/table.ts";
import { TABLES } from "../src/router/tables.ts";
import { must } from "./helpers.ts";

const ON = "2026-10-15";

describe("the merged price table", () => {
  it("every row passes its schema: a figure with a source and a date, or a reason", () => {
    for (const row of PRICE_TABLE) expect(parseAt(`price ${rowKey(row)}`, priceRowSchema, row).ok).toBe(true);
  });

  it("has one row per (provider, model, unit): the imaging and text copies of gemini-3.6-flash are one", () => {
    const keys = PRICE_TABLE.map(rowKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(PRICE_TABLE.filter((r) => r.provider === "google" && r.model === "gemini-3.6-flash").map((r) => r.unit)).toEqual(["input-token", "output-token"]);
  });

  it("refuses a row that qualifies a figure it does not have", () => {
    const bad = { provider: "x", model: "y", unit: "image", per: 1, atSize: "1K", source: "a reason that is long enough", checked: ON };
    expect(parseAt("row", priceRowSchema, bad).ok).toBe(false);
  });

  it("every model a routed candidate bills before the call has a row (priced or not)", () => {
    for (const t of Object.values(TABLES)) {
      for (const c of t.candidates) {
        for (const [key, unit] of Object.entries(c.bills ?? {})) {
          const model = c.models[key];
          expect(PRICE_TABLE.some((r) => r.provider === c.provider && r.model === model && r.unit === unit), `${c.provider}/${model} ${unit}`).toBe(true);
        }
      }
    }
  });
});

describe("quote (lib/imaging/pricing.ts priceCall + lib/text/pricing.ts priceTurn)", () => {
  it("a vendor's own figure wins over the table; a zero or negative one is missing, not free", () => {
    expect(quote({ provider: "leonardo", model: "lucid-origin", usage: { image: 1 }, on: ON, vendorUsd: 0.031 })).toMatchObject({ usd: 0.031, basis: "vendor-reported" });
    expect(quote({ provider: "leonardo", model: "lucid-origin", usage: { image: 2 }, on: ON, vendorUsd: 0 })).toMatchObject({ usd: 0.0514, basis: "estimated" });
  });

  it("prices only the size a figure was measured at", () => {
    expect(quote({ provider: "google", model: "gemini-3.1-flash-image", usage: { image: 3 }, on: ON, size: "1K" }).usd).toBeCloseTo(0.135, 10);
    for (const size of [undefined, "2K"]) {
      const q = quote({ provider: "google", model: "gemini-3.1-flash-image", usage: { image: 1 }, on: ON, ...(size === undefined ? {} : { size }) });
      expect(q).toMatchObject({ usd: null, basis: "unpriced", note: expect.stringContaining("measured at size 1K") });
    }
  });

  it("an unpriced row is unpriced with its own reason; a missing row says to add one", () => {
    expect(quote({ provider: "agy", model: "agy-image-generator", usage: { image: 1 }, on: ON }).note).toMatch(/operator's own `agy` CLI plan quota/);
    expect(quote({ provider: "google", model: "imagen-9", usage: { image: 1 }, on: ON }).note).toMatch(/^no image price is declared for google\/imagen-9/);
  });

  it("prices tokens per million, direction split, and refuses half a bill", () => {
    const q = quote({ provider: "google", model: "gemini-3.8-flash", usage: { "input-token": 2_000_000, "output-token": 100_000 }, on: ON });
    expect(q.usd).toBeCloseTo(2 * 0.75 + 0.1 * 3.75, 10);
    const half: readonly PriceRow[] = PRICE_TABLE.filter((r) => !(r.model === "gemini-3.8-flash" && r.unit === "output-token")).concat({ provider: "google", model: "gemini-3.8-flash", unit: "output-token", per: 1_000_000, source: "unread for this test, deliberately", checked: ON });
    expect(quote({ provider: "google", model: "gemini-3.8-flash", usage: { "input-token": 1000, "output-token": 1000 }, on: ON }, half).basis).toBe("unpriced");
  });

  it("a dated introductory rate stops pricing the day after it ends", () => {
    const usage = { "input-token": 1_000_000 };
    expect(quote({ provider: "google", model: "gemini-3.8-flash", usage, on: "2026-12-31T23:59:00.000Z" }).usd).toBe(0.75);
    expect(quote({ provider: "google", model: "gemini-3.8-flash", usage, on: "2027-01-01T00:00:00.000Z" })).toMatchObject({ usd: null, note: expect.stringContaining("held until 2026-12-31") });
  });

  it("a call whose usage is unknown before it runs is unpriced, never $0", () => {
    expect(quote({ provider: "claude-cli", model: "claude-opus-5", usage: {}, on: ON })).toMatchObject({ usd: null, basis: "unpriced" });
  });

  it("toEstimate goes through the record's door", () => {
    expect(must(toEstimate({ usd: 0.09, basis: "estimated", note: "n" }, 42))).toEqual({ seconds: 42, usd: 0.09 });
    expect(must(toEstimate({ usd: null, basis: "unpriced", note: "no rate" }, 42))).toEqual({ seconds: 42, usd: null, unpricedReason: "no rate" });
  });

  it("the pre-call gate's figure is the dearest priced rate, erring high", () => {
    expect(dearestRate("image", ON)).toMatchObject({ usdPerUnit: 0.045, row: { provider: "google" } });
    expect(dearestRate("clip-5s", ON)).toBeUndefined();
    expect(dearestRate("input-token", "2027-02-01")).toBeUndefined();
  });
});
