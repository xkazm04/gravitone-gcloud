import { describe, expect, it } from "vitest";
import { SEAT_UNPRICED_REASONS } from "@gt/catalog/partOptions";
import { isFreeReceipt } from "../src/mcp.ts";
import type { Receipt, ReceiptLine } from "../src/produce.ts";

// The FREE rule an agent's live launch is judged by: no priced dollar, no range above zero, and every
// unpriced line the operator's Claude seat. Any other unpriced line (Suno, Leonardo credits) is spend.

const base: Omit<ReceiptLine, "usd" | "lane" | "provider" | "model"> = {
  key: "k",
  label: "a step",
  units: 1,
  seconds: 60,
  src: "real",
  queuePos: 1,
  start: "2026-10-24T12:00:00.000Z",
  end: "2026-10-24T12:01:00.000Z",
};
const localFree: ReceiptLine = { ...base, lane: "gpu.local", provider: "comfyui", model: "flux", usd: 0 };
const seat = (reason: string): ReceiptLine => ({ ...base, lane: "seat.text", provider: "claude", model: "seat", usd: null, unpricedReason: reason });
const suno: ReceiptLine = { ...base, lane: "cloud.google", provider: "suno", model: "v4", usd: null, unpricedReason: "Suno bills subscription credits, not dollars; the driver reads the credits left, never a price" };
const leonardo: ReceiptLine = {
  ...base,
  lane: "cloud.leonardo",
  provider: "leonardo",
  model: "phoenix",
  usd: null,
  unpricedReason: "Leonardo studio credits from the prepaid plan (71 for one still, read 2026-10-12); no USD per credit is checked",
};

function receipt(lines: readonly ReceiptLine[], totals: Partial<Receipt["totals"]> = {}): Receipt {
  const usd = lines.reduce((a, l) => a + (l.usd ?? 0), 0);
  return {
    token: "rcpt",
    subject: { kind: "run", lane: "image" },
    mode: "live",
    lines,
    totals: { seconds: 60 * lines.length, usd, unpriced: lines.filter((l) => l.usd === null).length, src: "real", ...totals },
    queuePos: 1,
    etaAt: "2026-10-24T12:01:00.000Z",
    overCeiling: false,
    readAt: "2026-10-24T12:00:00.000Z",
  };
}

describe("isFreeReceipt", () => {
  it("is true for local $0 lines only", () => {
    expect(isFreeReceipt(receipt([localFree, { ...localFree, key: "k2" }]))).toBe(true);
  });

  it("is true for local $0 beside the Claude seat, under either of the seat's sentences", () => {
    expect(SEAT_UNPRICED_REASONS).toHaveLength(2);
    for (const reason of SEAT_UNPRICED_REASONS) expect(isFreeReceipt(receipt([localFree, seat(reason)])), reason).toBe(true);
  });

  it("is false for a Suno-credit line and for a Leonardo-credit line", () => {
    expect(isFreeReceipt(receipt([localFree, suno]))).toBe(false);
    expect(isFreeReceipt(receipt([localFree, leonardo]))).toBe(false);
  });

  it("is false for any priced dollar, and for a range that reaches above zero", () => {
    expect(isFreeReceipt(receipt([localFree, { ...localFree, key: "paid", lane: "cloud.qwen", usd: 0.04 }]))).toBe(false);
    expect(isFreeReceipt(receipt([localFree], { usdRange: [0, 0.4] }))).toBe(false);
  });
});
