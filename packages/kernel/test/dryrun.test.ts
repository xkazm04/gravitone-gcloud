import { afterAll, describe, expect, it } from "vitest";
import { blobStore } from "../src/blob.ts";
import { armLive, DRY, isDryStop, paid, runModeFrom, withDryRun } from "../src/dryrun.ts";
import { liveEffects, type Effects } from "../src/effects.ts";
import { eventsMigrations } from "../src/events.ts";
import { receiptsMigrations } from "../src/pricing/receipts.ts";
import type { Store } from "../src/store.ts";
import { must, scratch, templateStores } from "./helpers.ts";
import { spendMigrations } from "../src/spend/ledger.ts";
import { ACTOR, classes, renderStill } from "./router.driver.ts";

const tpl = templateStores([eventsMigrations, receiptsMigrations, spendMigrations]);
const tmp = scratch("dryrun");
afterAll(() => {
  tpl.dispose();
  tmp.dispose();
});

const fxOf = (s: Store): Effects => liveEffects(s, blobStore(`${tmp.dir}/blobs`));
const count = (s: Store, sql: string): unknown => must(s.read((r) => r.get(sql)?.["n"]));
const OPERATOR = { kind: "operator", id: "owner" } as const;
const subject = { kind: "still", id: "s1" };

describe("run mode", () => {
  it("is dry when the request states nothing, and refuses a malformed mode rather than guessing", () => {
    expect(must(runModeFrom(undefined))).toEqual({ kind: "dry" });
    expect(must(runModeFrom({ kind: "dry" }))).toEqual({ kind: "dry" });
    const bad = runModeFrom({ kind: "live" });
    expect(!bad.ok && bad.error.code).toBe("invalid");
    expect(!runModeFrom("live").ok).toBe(true);
  });

  it("leaves dry only through an attributed arm with a reason", () => {
    const live = must(armLive(OPERATOR, "2026-10-15T12:00:00.000Z", "launch the still"));
    expect(live).toEqual({ kind: "live", arm: { by: OPERATOR, at: "2026-10-15T12:00:00.000Z", reason: "launch the still" } });
    expect(armLive(OPERATOR, "2026-10-15T12:00:00.000Z", "  ").ok).toBe(false);
  });
});

describe("the dry port", () => {
  const intent = { provider: "google", model: "gemini-3.1-flash-image", usage: { image: 2 }, quote: { usd: 0.09, basis: "estimated", note: "2 images" } as const, payload: { prompt: "p" }, subject };

  it("never enters the vendor function, books a would-call as model cost, and continues on the stand-in", async () => {
    const s = tpl.fresh();
    let vendor = 0;
    const port = withDryRun(fxOf(s), DRY, ACTOR);
    const out = await port.effects.call("gen", paid({ ...intent, stand: () => "stand-in" }, async () => (vendor++, "pixels")));
    expect(out).toBe("stand-in");
    expect(vendor).toBe(0);
    expect(port.wouldCalls).toHaveLength(1);
    expect(port.wouldCalls[0]).toMatchObject({ provider: "google", model: "gemini-3.1-flash-image", usage: { image: 2 }, payloadDigest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(must(s.read((r) => r.all("SELECT type, cost_usd, cost_src FROM events")))).toEqual([{ type: "dryrun.would-call", cost_usd: 0.09, cost_src: "model" }]);
  });

  it("stops the driver at a call with no stand-in, still without calling", async () => {
    const s = tpl.fresh();
    let vendor = 0;
    const port = withDryRun(fxOf(s), DRY, ACTOR);
    const r = port.effects.call("gen", paid(intent, async () => (vendor++, "pixels")));
    await expect(r).rejects.toSatisfy(isDryStop);
    expect(vendor).toBe(0);
    expect(port.wouldCalls).toHaveLength(1);
  });

  it("refuses an undeclared external call instead of making it", async () => {
    const s = tpl.fresh();
    let vendor = 0;
    const port = withDryRun(fxOf(s), DRY, ACTOR);
    await expect(port.effects.call("raw-fetch", async () => (vendor++, "x"))).rejects.toSatisfy(isDryStop);
    expect(vendor).toBe(0);
    expect(count(s, "SELECT count(*) AS n FROM events")).toBe(0);
  });

  it("an unpriced would-call is booked with no cost at all, never as $0", async () => {
    const s = tpl.fresh();
    const port = withDryRun(fxOf(s), DRY, ACTOR);
    const unpriced = { ...intent, quote: { usd: null, basis: "unpriced", note: "no rate checked" } as const, stand: () => 1 };
    await port.effects.call("gen", paid(unpriced, async () => 2));
    expect(must(s.read((r) => r.get("SELECT cost_usd, cost_src, data FROM events")))).toMatchObject({ cost_usd: null, cost_src: null, data: expect.stringContaining("no rate checked") });
  });

  it("a live port passes the call through untouched", async () => {
    const s = tpl.fresh();
    const live = must(armLive(OPERATOR, "2026-10-15T12:00:00.000Z", "go"));
    const port = withDryRun(fxOf(s), live, ACTOR);
    expect(await port.effects.call("gen", paid(intent, async () => "pixels"))).toBe("pixels");
    expect(port.wouldCalls).toHaveLength(0);
  });
});

describe("a driver under the dry port", () => {
  it("makes zero real calls, holds zero spend and books zero real cost; its receipt is model cost", async () => {
    const s = tpl.fresh();
    const w = { calls: 0 };
    const spend = classes();
    const port = withDryRun(fxOf(s), DRY, ACTOR);
    const out = await renderStill(port.effects, w, { mode: DRY, spend, key: "k1", vendorUsd: 0.05 });
    expect(out).toEqual({ media: "dry:stand-in", replayed: false });
    expect(w.calls).toBe(0);
    expect(count(s, "SELECT count(*) AS n FROM spend_reservations")).toBe(0);
    expect(count(s, "SELECT count(*) AS n FROM spend_rows")).toBe(0);
    expect(count(s, "SELECT count(*) AS n FROM events WHERE cost_src = 'real'")).toBe(0);
    expect(must(s.read((r) => r.all("SELECT type, cost_src FROM events WHERE cost_src IS NOT NULL ORDER BY seq")))).toEqual([
      { type: "dryrun.would-call", cost_src: "model" },
      { type: "receipt.settled", cost_src: "model" },
    ]);
    expect(port.wouldCalls.map((c) => [c.provider, c.model, c.quote.usd])).toEqual([["google", "gemini-3.1-flash-image", 0.045]]);
    const routed = must(s.read((r) => r.get("SELECT data FROM events WHERE type = 'router.routed'")?.["data"]));
    expect(String(routed)).toContain('"mode":"dry"');
  });

  it("the same driver armed live calls once, holds once, and books the vendor's figure as real", async () => {
    const s = tpl.fresh();
    const w = { calls: 0 };
    const spend = classes();
    const live = must(armLive(OPERATOR, "2026-10-15T12:00:00.000Z", "launch"));
    const port = withDryRun(fxOf(s), live, ACTOR);
    await renderStill(port.effects, w, { mode: live, spend, key: "k1", vendorUsd: 0.05 });
    expect(w.calls).toBe(1);
    expect(must(s.read((r) => r.all("SELECT state, amount FROM spend_reservations")))).toEqual([{ state: "settled", amount: 0.045 }]);
    expect(must(s.read((r) => r.all("SELECT amount, basis FROM spend_rows")))).toEqual([{ amount: 0.05, basis: "vendor" }]);
    expect(must(s.read((r) => r.get("SELECT cost_usd, cost_src FROM events WHERE type = 'receipt.settled'")))).toEqual({ cost_usd: 0.05, cost_src: "real" });
    // A second launch with the same key replays the first receipt: no second call.
    expect(await renderStill(port.effects, w, { mode: live, spend, key: "k1" })).toEqual({ media: "sha256:pixels", replayed: true });
    expect(w.calls).toBe(1);
  });

  it("a dry rehearsal does not block the live launch that follows it", async () => {
    const s = tpl.fresh();
    const w = { calls: 0 };
    const spend = classes();
    await renderStill(withDryRun(fxOf(s), DRY, ACTOR).effects, w, { mode: DRY, spend, key: "k1" });
    const live = must(armLive(OPERATOR, "2026-10-15T12:00:00.000Z", "launch"));
    expect(await renderStill(withDryRun(fxOf(s), live, ACTOR).effects, w, { mode: live, spend, key: "k1" })).toEqual({ media: "sha256:pixels", replayed: false });
    expect(w.calls).toBe(1);
  });

  it("live and over the ceiling: refused before the vendor, the refusal counted and on the ledger", async () => {
    const s = tpl.fresh();
    const w = { calls: 0 };
    const live = must(armLive(OPERATOR, "2026-10-15T12:00:00.000Z", "launch"));
    const r = renderStill(withDryRun(fxOf(s), live, ACTOR).effects, w, { mode: live, spend: classes(0.01), key: "k1" });
    await expect(r).rejects.toMatchObject({ code: "budget" });
    expect(w.calls).toBe(0);
    expect(must(s.read((x) => x.all("SELECT type FROM events WHERE type IN ('spend.refused', 'receipt.released') ORDER BY seq")))).toEqual([{ type: "spend.refused" }, { type: "receipt.released" }]);
    expect(count(s, "SELECT count(*) AS n FROM receipts")).toBe(0);
  });
});
