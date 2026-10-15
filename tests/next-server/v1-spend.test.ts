import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { zeroCounters } from "@gt/kernel/spend/v1Port";

import { costSrcOf, projectSpend, readSpend, type SpendSnapshot } from "../../lib/ledger/v1/sources/spend.ts";
import type { IngestEvent, ProjectCtx } from "../../lib/ledger/v1/types.ts";

// The spend meter's class files (lib/spend/fileStore.ts), read without a
// transaction - every meter read prunes and writes - and projected as money
// only where the amount IS money.

const ctx = (iso = "2026-10-15T12:00:00.000Z"): ProjectCtx => ({ now: new Date(iso), universe: "real" });
const T = Date.parse("2026-10-15T11:00:00.000Z");
type Cls = SpendSnapshot["classes"][number];
const imaging = (over: Partial<Cls> = {}): Cls => ({
  cls: "imaging-usd",
  unit: "usd",
  rows: [
    { at: T, amount: 0.045, outcome: "served", basis: "vendor-reported", axes: { cap: "generate", provider: "google", model: "nb" } },
    { at: T, amount: 0.045, outcome: "served", basis: "vendor-reported", axes: { cap: "generate", provider: "google", model: "nb" } },
    { at: T + 1000, amount: 0.045, outcome: "failed", basis: "estimated", axes: { cap: "generate", provider: "leonardo-studio", model: "x" } },
  ],
  holds: [{ id: "hold-1", amount: 0.05, createdAt: T, pid: 77, alive: false }],
  counters: { ...zeroCounters(), booked: 5, evicted: 2, evictedAmount: 0.09 },
  ...over,
});
const music: Cls = { cls: "music-audio-s", unit: "audio-s", rows: [{ at: T, amount: 30, outcome: "served", basis: "requested", axes: { provider: "elevenlabs" } }], holds: [], counters: { ...zeroCounters(), booked: 1 } };
const byType = (events: readonly IngestEvent[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};

describe("spend projection", () => {
  it("each row is a booked fact; two identical rows are two facts; seconds are never dollars", () => {
    const p = projectSpend({ classes: [imaging(), music], skipped: [] }, ctx());
    expect(byType(p.events)).toEqual(p.tally.facts);
    expect(p.tally.facts).toEqual({ "spend.book": 4, "spend.counters": 2 });
    expect(new Set(p.events.map((e) => e.key)).size).toBe(p.events.length);
    expect(p.events.filter((e) => e.type === "spend.book").map((e) => [e.cost ?? null, e.lane ?? null])).toEqual([
      [{ usd: 0.045, src: "real" }, "cloud.google"],
      [{ usd: 0.045, src: "real" }, "cloud.google"],
      [{ usd: 0.045, src: "model" }, null],
      [null, "cloud.elevenlabs"],
    ]);
  });

  it("the counters are one observed fact per state: unchanged counters re-key the same, moved ones are new", () => {
    const key = (c: Cls) => projectSpend({ classes: [c], skipped: [] }, ctx()).events.find((e) => e.type === "spend.counters")?.key;
    expect(key(imaging())).toBe(key(imaging({ rows: [] })));
    expect(key(imaging({ counters: { ...zeroCounters(), booked: 6, evicted: 3, evictedAmount: 0.135 } }))).not.toBe(key(imaging()));
  });

  it("names a class whose rows and evictions do not add up to what it booked", () => {
    expect(projectSpend({ classes: [imaging()], skipped: [] }, ctx()).tally.records).toEqual({ "imaging-usd.rows": 3, "imaging-usd.holds": 1 });
    expect(projectSpend({ classes: [imaging({ counters: { ...zeroCounters(), booked: 9, evicted: 2 } })], skipped: [] }, ctx()).tally.records).toMatchObject({ "imaging-usd.unaccounted": 4 });
  });

  it("holds are in-flight money with their owner, never jobs and never events", () => {
    const p = projectSpend({ classes: [imaging()], skipped: [] }, ctx());
    expect(p.live).toEqual([]);
    expect(p.holds).toEqual([{ source: "spend", id: "hold-1", spendClass: "imaging-usd", amount: 0.05, unit: "usd", since: "2026-10-15T11:00:00.000Z", owner: "gone" }]);
  });

  it("an estimate is the meter's model of the money, a vendor's figure is real", () => {
    expect([costSrcOf("vendor-reported"), costSrcOf("vendor"), costSrcOf("estimated"), costSrcOf("unpriced")]).toEqual(["real", "real", "model", "model"]);
  });
});

describe("spend reader", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gt-spend-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("reads each class file without writing it; an absent class is absent; a damaged one is skipped and named", async () => {
    const body = JSON.stringify({ rows: [{ at: T, amount: 0.3, outcome: "served", basis: "vendor", axes: { turn: "edit-plan", provider: "claude-cli" } }], holds: { h: { id: "h", amount: 1, createdAt: T, pid: process.pid } }, counters: { booked: 1 } });
    writeFileSync(path.join(root, "text-usd.json"), body);
    writeFileSync(path.join(root, "video-usd.json"), "{ not json");
    const r = await readSpend(root);
    if (!r.ok) throw r.error;
    expect(r.value.classes.map((c) => [c.cls, c.rows.length, c.holds.map((h) => h.alive), c.counters.booked, c.counters.evicted])).toEqual([["text-usd", 1, [true], 1, 0]]);
    expect(r.value.skipped).toEqual([{ id: "video-usd", reason: expect.stringMatching(/^spend video-usd: not valid JSON/) }]);
    expect(readFileSync(path.join(root, "text-usd.json"), "utf8")).toBe(body);
  });
});
