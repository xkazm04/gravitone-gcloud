import { describe, expect, it } from "vitest";
import { PART_OPTIONS } from "@gt/catalog/partOptions";
import { WORK_KINDS } from "@gt/catalog/recipes";
import { LANE_CAPACITY, RESOURCE_LANES } from "@gt/domain/lane";
import type { ModelOption } from "@gt/domain/produce";
import { launchOf, modelOptions } from "../src/records/options.ts";
import { priceLine, receiptFor, rerouteDelta, tokenOf, type PlanLine, type QueueRead } from "../src/records/receipt.ts";
import { schedule, type SchedItem } from "../src/records/schedule.ts";
import { TABLES } from "../src/router/tables.ts";
import type { RouterMedium } from "../src/router/types.ts";

const DAY = "2026-10-16";
const NOW = Date.parse("2026-10-16T09:00:00Z");
const opt = (kind: (typeof WORK_KINDS)[number], provider: string): ModelOption => {
  const o = modelOptions(kind, DAY).find((x) => x.provider === provider);
  if (o === undefined) throw new Error(`no ${kind}/${provider}`);
  return o;
};

describe("model options", () => {
  it("resolves every catalog option onto a real lane, with a pace and a price or the reason it has none", () => {
    for (const kind of WORK_KINDS)
      for (const o of modelOptions(kind, DAY)) {
        expect(RESOURCE_LANES).toContain(o.lane);
        expect(o.secondsPerUnit, o.key).toBeGreaterThan(0);
        expect(o.usdPerUnit === null, o.key).toBe(o.unpricedReason !== undefined);
        expect(o.key.startsWith(`${kind}/${o.provider}/`)).toBe(true);
      }
  });

  it("offers every router candidate that can do a kind's capability in the local posture", () => {
    for (const kind of WORK_KINDS) {
      const route = PART_OPTIONS[kind].route;
      if (route === undefined) continue;
      const table = TABLES[route.medium as RouterMedium];
      const chain = Object.values(table.plans)[0]?.[route.capability] ?? [];
      const offered = new Set(modelOptions(kind, DAY).map((o) => o.provider));
      for (const provider of chain) expect(offered.has(provider), `${kind}: the router's ${provider} is not an option`).toBe(true);
    }
  });

  it("takes a routed option's lane and wire model from the router, and its price from the price table", () => {
    const nano = opt("frames", "google");
    expect(nano.lane).toBe("cloud.google");
    expect(nano.model).toBe("gemini-3.1-flash-image");
    expect(nano.usdPerUnit).toBeCloseTo(0.045);
    expect(nano.basis.usd.src).toBe("real");
    // the prototype's illustrative minutes are kept and say so; the measured price does not launder them
    expect(nano.src).toBe("illustrative");
  });

  it("prices the narration voice by the characters it bills, on the ElevenLabs lane", () => {
    const voice = opt("voice", "elevenlabs-voice");
    expect(voice).toMatchObject({ lane: "cloud.elevenlabs", model: "eleven_multilingual_v2" });
    // A take is priced at the catalog's assumed 200 characters x the table's $0.08 per 1K.
    expect(voice.usdPerUnit).toBeCloseTo(0.016, 6);
    expect(opt("voice", "local-tts").usdPerUnit).toBeNull();
  });

  it("never presents a placeholder price: a cloud text turn is unpriced with the table's reason", () => {
    const gemini = opt("research", "google");
    expect(gemini.usdPerUnit).toBeNull();
    expect(gemini.unpricedReason).toMatch(/no usage is known/);
    const suno = opt("score", "suno");
    expect(suno.usdPerUnit).toBeNull();
    expect(suno.unpricedReason).toMatch(/credits/);
    expect(opt("frames", "comfy").usdPerUnit).toBe(0);
  });

  it("carries the article band as a measured figure with its date", () => {
    const a = opt("article", "articles");
    expect(a.usdRangePerUnit).toEqual([47, 92]);
    expect(a.basis.usd).toMatchObject({ src: "real", measuredAt: "2026-10" });
    expect(priceLine(1, a)).toMatchObject({ usd: 70, usdRange: [47, 92] });
  });

  it("names the producer and whether the router can honour a pin", () => {
    expect(launchOf("score", opt("score", "suno").key, DAY)).toMatchObject({ producer: "suno", routed: true });
    expect(launchOf("score", opt("score", "elevenlabs").key, DAY)).toMatchObject({ producer: "score", routed: true });
    expect(launchOf("frames", opt("frames", "comfy").key, DAY)).toMatchObject({ producer: "frames", routed: false });
  });
});

const item = (key: string, lane: SchedItem["lane"], seconds: number, after: string[] = [], extra: Partial<SchedItem> = {}): SchedItem => ({ key, lane, seconds, after, order: 0, status: "pending", ...extra });

describe("schedule", () => {
  it("runs as many jobs at once as the lane has slots, and queues the rest", () => {
    const items = ["a", "b", "c", "d", "e"].map((k, i) => item(k, "seat.text", 600, [], { order: i }));
    const s = schedule({ items, capacity: LANE_CAPACITY, now: NOW });
    expect(["a", "b", "c", "d"].map((k) => s.get(k)?.start)).toEqual([NOW, NOW, NOW, NOW]);
    expect(s.get("e")?.start).toBe(NOW + 600_000);
    expect(s.get("e")?.queuePos).toBe(5);
    const gpu = schedule({ items: items.map((x) => ({ ...x, lane: "gpu.local" as const })), capacity: LANE_CAPACITY, now: NOW });
    expect(gpu.get("b")?.start).toBe(NOW + 600_000);
  });

  it("starts a part after everything it waits for, and counts a running slot as ahead", () => {
    const s = schedule({
      items: [item("other", "gpu.local", 1200, [], { status: "running", startedAt: NOW - 600_000 }), item("script", "seat.text", 300), item("frames", "gpu.local", 600, ["script"])],
      capacity: LANE_CAPACITY,
      now: NOW,
    });
    expect(s.get("frames")?.start).toBe(NOW + 600_000);
    expect(s.get("frames")?.queuePos).toBe(2);
  });

  it("draws work behind a stuck upstream from now, holding no slot", () => {
    const s = schedule({ items: [item("frames", "gpu.local", 600, [], { status: "stuck" }), item("motion", "gpu.local", 600, ["frames"]), item("x", "gpu.local", 60, [], { order: 5 })], capacity: LANE_CAPACITY, now: NOW });
    expect(s.get("motion")?.blocked).toBe(true);
    expect(s.get("x")?.start).toBe(NOW);
  });
});

const QUEUE: QueueRead = { others: [], digest: "empty" };
const plan = (): PlanLine[] => [
  { key: "script", label: "script", lane: "seat.text", units: 1, option: opt("script", "claude-cli"), after: [], order: 1, status: "pending" },
  { key: "frames", label: "frames", lane: "gpu.local", units: 24, option: opt("frames", "comfy"), after: ["script"], order: 2, status: "pending" },
  { key: "gate:frames", label: "◆", lane: null, units: 0, after: ["frames"], order: 3, status: "pending" },
];

describe("receipt", () => {
  const base = { subject: { kind: "project" as const, id: "p", rev: 1 }, plan: plan(), queue: QUEUE, capacity: LANE_CAPACITY, now: NOW, mode: "dry" as const };
  const lines = plan().filter((l) => l.lane !== null);

  it("lists each job's lane, model, figures and source, and totals as a lower bound when a line is unpriced", () => {
    const r = receiptFor({ ...base, lines });
    expect(r.lines.map((l) => l.key)).toEqual(["script", "frames"]);
    expect(r.totals).toMatchObject({ usd: 0, unpriced: 1, src: "illustrative" });
    expect(r.lines[1]?.seconds).toBe(24 * 96);
    expect(Date.parse(r.etaAt)).toBe(NOW + (14 * 60 + 24 * 96) * 1000);
  });

  it("changes its token with the quote, the queue, the ceiling or the mode - never with the clock", () => {
    const t = tokenOf({ ...base, lines });
    expect(receiptFor({ ...base, lines, now: NOW + 60_000 }).token).toBe(t);
    expect(tokenOf({ ...base, lines, queue: { others: [], digest: "moved" } })).not.toBe(t);
    expect(tokenOf({ ...base, lines, mode: "live" })).not.toBe(t);
    expect(tokenOf({ ...base, lines, ceilingUsd: 5 })).not.toBe(t);
    const swapped = lines.map((l) => (l.key === "frames" ? { ...l, option: opt("frames", "google") } : l));
    expect(tokenOf({ ...base, lines: swapped })).not.toBe(t);
  });

  it("is over its ceiling against the top of a band, not its middle", () => {
    const article: PlanLine[] = [{ key: "article", label: "article", lane: "seat.text", units: 1, option: opt("article", "articles"), after: [], order: 1, status: "pending" }];
    const r = receiptFor({ ...base, plan: article, lines: article, ceilingUsd: 80 });
    expect(r.totals.usd).toBe(70);
    expect(r.overCeiling).toBe(true);
    expect(receiptFor({ ...base, plan: article, lines: article, ceilingUsd: 92 }).overCeiling).toBe(false);
  });

  it("previews a re-route as the whole plan's ETA and cost delta", () => {
    const d = rerouteDelta(plan(), "frames", opt("frames", "google"), QUEUE, LANE_CAPACITY, NOW);
    expect(d.dEtaS).toBe(24 * (21 - 96));
    expect(d.dUsd).toBeCloseTo(24 * 0.045, 2);
    expect(d.queuePos).toBe(1);
  });
});
