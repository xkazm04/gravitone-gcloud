// LANE — TEXT-USD ON THE KERNEL STORE (dynamic).
//
// F2 of docs/next/architecture-review-2026-10-18.md, for ONE class as the
// operator ruled on 2026-10-18 ("text-usd only"): lib/spend/select.ts resolves
// `text-usd` to the kernel store through packages/kernel/src/spend/v1Port.ts,
// and every enforcing class stays on the file store. This file proves the pick,
// keeps the pins (SPEND_STORE=memory, the managed posture) where they were, runs
// the meter conformance kit against the store text-usd is now picked onto, and
// reads the class back through the Ledger's spend source.
//
// Every case has its own kernel store and spend directory, closed and removed
// afterwards (Windows will not delete an open file), so nothing here opens the
// operator's store or writes foundry-out/spend/.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { keepEnv } from "./_helpers";
import { meterConformance } from "./_meterKit";
import { MANAGED_MARKERS } from "@/lib/deployment";
import { closeKernel, kernel } from "@/lib/kernelStore";
import { readSpend } from "@/lib/ledger/v1/sources/spend";
import { SPEND_CLASSES, type SpendClassDef } from "@/lib/spend/classes";
import { HOSTED_NOT_BUILT, HostedSpendStoreNotBuilt } from "@/lib/spend/fileStore";
import { createMeter, type MeterRow } from "@/lib/spend/meter";
import { spendStoreFor } from "@/lib/spend/select";
import { __resetTextSpend, bookServedTurn, textSpendRows, textSpendStats } from "@/lib/text/spend";

keepEnv(["SPEND_STORE", "SPEND_STORE_DIR", "GRAVITONE_STORE_PATH", ...MANAGED_MARKERS]);

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "spend-sqlite-"));
  process.env.SPEND_STORE_DIR = path.join(dir, "spend");
  process.env.GRAVITONE_STORE_PATH = path.join(dir, "store", "gravitone.sqlite");
  delete process.env.SPEND_STORE;
  for (const m of MANAGED_MARKERS) delete process.env[m];
});
test.afterEach(() => {
  closeKernel();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

const CLASSES = Object.keys(SPEND_CLASSES);

test("text-usd resolves to the kernel store; imaging-usd and every other class stay on the file store", () => {
  for (const cls of CLASSES) expect(spendStoreFor(cls).kind, cls).toBe(cls === "text-usd" ? "sqlite" : "file");
  expect(spendStoreFor("imaging-usd").kind).toBe("file");
  process.env.SPEND_STORE = "file";
  expect(spendStoreFor("text-usd").kind, "SPEND_STORE=file asks for the machine's durable store").toBe("sqlite");
  expect(spendStoreFor("imaging-usd").kind).toBe("file");
});

test("the pins are unchanged for text-usd: memory when pinned, memory with the reason when managed, refused when the two contradict", async () => {
  process.env.SPEND_STORE = "memory";
  for (const cls of CLASSES) expect(spendStoreFor(cls).kind, cls).toBe("memory");

  delete process.env.SPEND_STORE;
  process.env.K_SERVICE = "probe-service";
  for (const cls of CLASSES) {
    const s = spendStoreFor(cls);
    expect(s.kind, cls).toBe("memory");
    expect(s.reason?.(), cls).toBe(HOSTED_NOT_BUILT);
  }
  process.env.SPEND_STORE = "file";
  await expect(spendStoreFor("text-usd").transact(() => 0)).rejects.toThrow(HostedSpendStoreNotBuilt);
  delete process.env.K_SERVICE;
  process.env.SPEND_STORE = "sqlite";
  await expect(spendStoreFor("text-usd").transact(() => 0)).rejects.toThrow(/SPEND_STORE=sqlite is not a spend store/);
});

test("a text turn books into spend_rows on the kernel store, writes no text-usd.json, and the Ledger reads it back", async () => {
  __resetTextSpend();
  await bookServedTurn({ turn: "edit-plan", provider: "claude-cli", model: "sonnet", costUsd: 0.31, costBasis: "vendor-reported" });
  await bookServedTurn({ turn: "edit-plan", provider: "google", model: "flash", costUsd: undefined, costBasis: "estimated" });

  const s = await textSpendStats();
  expect(s.store).toBe("sqlite");
  expect(s.counters).toMatchObject({ booked: 1, unpriced: 1 });
  const rows = await textSpendRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ amount: 0.31, basis: "vendor", outcome: "served", axes: { provider: "claude-cli", turn: "edit-plan" } });

  const k = kernel();
  if (!k.ok) throw k.error;
  const stored = k.value.store.read((r) => r.all("SELECT class, amount, basis FROM spend_rows WHERE evicted_ms IS NULL"));
  if (!stored.ok) throw stored.error;
  expect(stored.value).toEqual([{ class: "text-usd", amount: 0.31, basis: "vendor" }]);
  expect(existsSync(path.join(process.env.SPEND_STORE_DIR!, "text-usd.json"))).toBe(false);

  const read = await readSpend(process.env.SPEND_STORE_DIR!);
  if (!read.ok) throw read.error;
  const text = read.value.classes.find((c) => c.cls === "text-usd");
  expect(text?.rows).toEqual([{ at: rows[0].at, amount: 0.31, outcome: "served", basis: "vendor", axes: { model: "sonnet", provider: "claude-cli", turn: "edit-plan" } }]);
  expect(text?.counters).toMatchObject({ booked: 1, unpriced: 1, evicted: 0 });
  // The tally's identity holds on the kernel's figures as it did on the file's.
  expect(text!.counters.booked - text!.counters.evicted - text!.rows.length).toBe(0);
});

// ── the conformance kit, on the store text-usd is picked onto ──────────────

class KitInvalid extends Error {}
class KitOverBudget extends Error {}
type KitAxes = { cap?: string };
type KitRowIn = { amount: number | undefined; outcome: "served" | "failed"; at?: number; attributed?: boolean };

// The kit needs a ceiling to test the laws of one; the STORE is text-usd's, as
// spendStoreFor picks it, which is what the switch changed.
const KIT_DEF: SpendClassDef = {
  ...SPEND_CLASSES["imaging-usd"],
  ceilingVar: "SPEND_KIT_SQLITE_CEILING",
  windowVar: "SPEND_KIT_SQLITE_WINDOW_MS",
  floorVar: "SPEND_KIT_SQLITE_FLOOR",
  defaultCeiling: 3,
  defaultWindowMs: 120_000,
};

const textStore = spendStoreFor<MeterRow<KitAxes, "estimate">>("text-usd");
const kit = createMeter<KitRowIn, KitAxes, "estimate">(
  KIT_DEF,
  {
    entry: (r) => ({ amount: r.amount, outcome: r.outcome, basis: "estimate", axes: { cap: r.attributed === false ? undefined : "kit" }, at: r.at }),
    refuse: (r) => new KitOverBudget(`refused ${r.amount}`),
    invalid: (a) => new KitInvalid(`invalid ${a}`),
  },
  textStore,
);

test.describe("text-usd's store", () => {
  test.beforeEach(() => {
    expect(textStore.kind).toBe("sqlite");
  });

  meterConformance({
    name: "kernel (lib/spend/meter, text-usd's SQLITE store)",
    ceilingVar: KIT_DEF.ceilingVar,
    windowVar: KIT_DEF.windowVar,
    floorVar: KIT_DEF.floorVar,
    defaultCeiling: KIT_DEF.defaultCeiling,
    defaultWindowMs: KIT_DEF.defaultWindowMs,
    attributionAxis: KIT_DEF.attributionAxis,
    reset: () => kit.reset(),
    reserve: (a, now) => kit.reserve(a, now),
    release: (h) => kit.release(h),
    settle: (h, rows) => kit.settle(h, rows),
    book: (r) => kit.book(r),
    stats: async (now) => {
      const s = await kit.stats(now);
      return { ...s, counters: { ...s.counters } };
    },
    byAxis: async (now) => {
      const a = await kit.byAxis(now);
      return { total: a.total, served: a.byOutcome.served, failed: a.byOutcome.failed, unattributed: a.unattributed, axes: a.byAxis };
    },
    rows: (now) => kit.rows(now),
    tamper: async () => {
      const s = await kit.stats();
      s.counters.booked = 0;
      s.spent = 999;
      for (const r of await kit.rows()) {
        r.amount = 999;
        r.axes.cap = "tampered";
      }
      const a = await kit.byAxis();
      a.total = 999;
      a.byOutcome.served = 999;
      for (const axis of Object.values(a.byAxis)) for (const k of Object.keys(axis)) axis[k] = 999;
    },
    isOverBudget: (e) => e instanceof KitOverBudget,
    isInvalid: (e) => e instanceof KitInvalid,
  });
});
