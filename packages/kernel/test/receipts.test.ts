import { copyFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { eventsMigrations } from "../src/events.ts";
import type { Quote } from "../src/pricing/quote.ts";
import { claimReceipt, interruptPending, readReceipt, RECEIPT_VALUE_CAP, receiptsMigrations, releaseReceipt, settleReceipt, type ReceiptKey } from "../src/pricing/receipts.ts";
import { openStore, type Store } from "../src/store.ts";
import { fixedClock, must, steppingClock, templateStores } from "./helpers.ts";

const tpl = templateStores([eventsMigrations, receiptsMigrations]);
afterAll(() => tpl.dispose());

const ACTOR = { kind: "machine", id: "box.render" } as const;
const K: ReceiptKey = { scope: "still", key: "k1", mode: "live" };
const V = z.object({ media: z.string() });
const PRICED: Quote = { usd: 0.045, basis: "estimated", note: "1 image" };
const REPORTED: Quote = { usd: 0.05, basis: "vendor-reported", note: "vendor" };

const claim = (s: Store, k: ReceiptKey = K, hash = "h1") => s.tx((t) => claimReceipt(t, k, hash, V, ACTOR));
const settle = (s: Store, q: Quote = PRICED, k: ReceiptKey = K) => must(s.tx((t) => settleReceipt(t, k, { media: "m1" }, q, ACTOR)));
const events = (s: Store) => must(s.read((r) => r.all("SELECT type, cost_usd, cost_src FROM events ORDER BY seq")));

describe("receipts (lib/imaging/receipts.ts, made durable)", () => {
  it("a miss claims; a settled key replays the first receipt and is not a new spend", () => {
    const s = tpl.fresh();
    expect(must(claim(s))).toEqual({ kind: "fresh" });
    settle(s, REPORTED);
    expect(must(claim(s))).toMatchObject({ kind: "replay", value: { media: "m1" } });
    expect(events(s)).toEqual([
      { type: "receipt.claimed", cost_usd: null, cost_src: null },
      { type: "receipt.settled", cost_usd: 0.05, cost_src: "real" },
    ]);
  });

  it("the same key with a different body is a conflict, and so is a key still in flight", () => {
    const s = tpl.fresh();
    must(claim(s));
    const inflight = claim(s);
    expect(!inflight.ok && inflight.error).toMatchObject({ code: "conflict", message: expect.stringMatching(/in flight/) });
    settle(s);
    const other = claim(s, K, "h2");
    expect(!other.ok && other.error).toMatchObject({ code: "conflict", message: expect.stringMatching(/different request/) });
  });

  it("a failure is never retained: a released claim may be tried again", () => {
    const s = tpl.fresh();
    must(claim(s));
    expect(must(s.tx((t) => releaseReceipt(t, K, ACTOR, "vendor refused")))).toBe(true);
    expect(must(claim(s))).toEqual({ kind: "fresh" });
  });

  it("a claim whose owner died is interrupted, named, and refused until an operator releases it", () => {
    const s = tpl.fresh();
    must(claim(s));
    expect(must(s.tx((t) => interruptPending(t, ACTOR)))).toEqual([K]);
    const again = claim(s);
    expect(!again.ok && again.error).toMatchObject({ code: "refused", message: expect.stringMatching(/may have billed/) });
    must(s.tx((t) => releaseReceipt(t, K, { kind: "operator", id: "owner" }, "looked: nothing was billed")));
    expect(must(claim(s))).toEqual({ kind: "fresh" });
  });

  it("a dry claim and a live claim on one key are separate rows", () => {
    const s = tpl.fresh();
    must(claim(s, { ...K, mode: "dry" }));
    settle(s, REPORTED, { ...K, mode: "dry" });
    expect(must(claim(s))).toEqual({ kind: "fresh" });
    expect(events(s).find((e) => e["type"] === "receipt.settled")).toEqual({ type: "receipt.settled", cost_usd: 0.05, cost_src: "model" });
  });

  it("an unpriced settle books no cost; a value past the cap is refused", () => {
    const s = tpl.fresh();
    must(claim(s));
    must(s.tx((t) => settleReceipt(t, K, { media: "m" }, { usd: null, basis: "unpriced", note: "no rate" }, ACTOR)));
    expect(events(s).at(-1)).toEqual({ type: "receipt.settled", cost_usd: null, cost_src: null });
    const s2 = tpl.fresh();
    must(claim(s2));
    const big = s2.tx((t) => settleReceipt(t, K, { media: "x".repeat(RECEIPT_VALUE_CAP) }, PRICED, ACTOR));
    expect(!big.ok && big.error.code).toBe("invalid");
    expect(must(s2.read((r) => readReceipt(r, K)))?.state).toBe("pending");
  });

  it("a settled receipt older than its retention is claimed afresh", () => {
    const base = tpl.fresh();
    const file = path.join(path.dirname(base.location), "ttl.sqlite");
    base.close();
    copyFileSync(base.location, file);
    const early = must(openStore(file, { clock: fixedClock("2026-10-15T12:00:00.000Z") }));
    must(early.tx((t) => claimReceipt(t, K, "h1", V, ACTOR)));
    settle(early);
    early.close();
    const later = must(openStore(file, { clock: steppingClock("2026-10-15T12:16:00.000Z") }));
    expect(must(later.tx((t) => claimReceipt(t, K, "h1", V, ACTOR)))).toEqual({ kind: "fresh" });
    later.close();
  });
});
