// LANE — THE PUBLISHING ENGINE, offline and against a temp store: the kernel's calendar
// (@gt/kernel/slots) driven by the publish producer (@gt/producers/publish) through the box's
// binding (lib/producers/publish.ts), the same three the worker's `publish-tick` timer and
// `pipeline/publish.mts` run. Re-pointed in Phase 6 (L62) from v1's lib/publish/{schedule,
// publisher,store}.ts; the eight cases keep their intent, each against the new home.
//
// What is pinned is what StatReel's calendar.test.ts and metrics.test.ts pinned for the code this
// was ported from: the slot transitions, the missed window (never publish late), the at-most-once
// claim (two ticks, one publication; a dead claimant's slot fails visibly instead of firing twice),
// drift, the lifetime-snapshot metrics semantics (first delta null, lower-bound group sums), and
// the one promise a dry run makes - a plan kept, NO network. `globalThis.fetch` is replaced for
// every test with a stub that counts and refuses, so a path that reached the wire would fail here.
//
// The export root is injected through PUBLISH_EXPORTS_DIR (read per call), each test gets a fresh
// temp dir and its own store file, and the env is restored afterwards (this lane is serial and
// shares one process - playwright.config.ts).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import type { Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Holder } from "@gt/domain/job";
import { dailySeries, groupSums, latestValue, publicationSchema, publicationTotals, type MetricSnapshot, type Publication } from "@gt/domain/publication";
import { INTERRUPTED_TEXT, type Channel } from "@gt/domain/slot";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { getSlot, listPublicationsIn, listSlots } from "@gt/kernel/slots/read";
import { sweep } from "@gt/kernel/slots/sweep";
import { cancelSlot, createSlot, moveSlot, type SlotDraft } from "@gt/kernel/slots/write";
import { refreshMetrics } from "@gt/producers/publish/metrics";
import { publishSlotNow, publishTick, type TickDeps } from "@gt/producers/publish/tick";
import { DRIFT_TEXT, wireSlot } from "@gt/producers/publish/wire";

import { publishDeps, type Env } from "@/lib/producers/publish";
import { missedWindowMs, WIRED_CHANNELS } from "@/lib/publish/channels";
import { snippetProblem } from "@/lib/publish/youtube";

const ENV_KEYS = ["PUBLISH_STORE_DIR", "PUBLISH_EXPORTS_DIR", "AD_EXPORT_DIR"] as const;
let saved: Record<string, string | undefined> = {};
let root = "";
let exportsDir = "";
let fetchCalls: string[] = [];
let k: Kernel;
const realFetch = globalThis.fetch;

const EXPORT_ID = "0b1c2d3e-4f50-4617-8a9b-cafe0000aaaa";
const ITEM = (id = EXPORT_ID) => `video:export:${id}`;
const NOW = new Date("2026-10-05T12:00:00.000Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();
const OP: Actor = { kind: "operator", id: "probe" };
const DRY_ENV: Env = { GRAVITONE_DRY_ONLY: "1" };

function writeExport(id = EXPORT_ID) {
  // the dry path only hashes the bytes; a real container is not needed
  writeFileSync(path.join(exportsDir, `${id}.mp4`), Buffer.alloc(300_000, 7));
}

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}
const code = (r: Result<unknown>): string | null => (r.ok ? null : r.error.code);
const deps = (env: Env = DRY_ENV, holder?: Holder): TickDeps => must(publishDeps({ store: k.store, env, clock: () => NOW, ...(holder === undefined ? {} : { holder }) }));

async function schedule(over: Partial<SlotDraft> = {}) {
  const ready = must(await deps().facts(NOW.getTime()));
  return createSlot(k.store, { libraryItemId: ITEM(), channel: "youtube", at: at(-5), title: "A cut", description: "probe", tags: ["a", "b"], ...over }, OP, ready);
}
const slots = () => must(listSlots(k.store)).map((r) => r.slot);
const publications = () => must(k.store.read((r) => listPublicationsIn(r)));

test.beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  root = mkdtempSync(path.join(tmpdir(), "publish-probe-"));
  exportsDir = path.join(root, "exports");
  mkdirSync(exportsDir);
  process.env.PUBLISH_STORE_DIR = path.join(root, "store");
  process.env.PUBLISH_EXPORTS_DIR = exportsDir;
  delete process.env.AD_EXPORT_DIR;
  fetchCalls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCalls.push(String(input));
    throw new Error("network refused by publish.probe");
  }) as typeof fetch;
  writeExport();
  k = must(openKernel(path.join(root, "gravitone.sqlite"), { clock: () => NOW }));
});

test.afterEach(() => {
  k.close();
  globalThis.fetch = realFetch;
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  rmSync(root, { recursive: true, force: true });
});

test("schedule: refuses an unwired channel, an unknown export and a second slot for the same export (conflict); bad input is invalid", async () => {
  expect(code(await schedule({ channel: "tiktok" }))).toBe("conflict");
  expect(code(await schedule({ channel: "instagram" }))).toBe("conflict");
  expect(code(await schedule({ libraryItemId: ITEM("nope") }))).toBe("conflict");
  const slot = must(await schedule({ at: at(60) })).slot;
  expect(slot).toMatchObject({ state: "scheduled" });
  expect(slot.publicationId).toBeUndefined();
  expect(slot.error).toBeUndefined();
  expect(code(await schedule())).toBe("conflict");

  expect(code(await schedule({ at: "tomorrow-ish" }))).toBe("invalid");
  expect(code(await schedule({ channel: "myspace" as Channel }))).toBe("invalid");
  // the platform's own limits, as the CLI checks them before a slot is made
  expect(snippetProblem({ title: "x".repeat(101), description: "" })).toMatch(/100 characters/);
  expect(snippetProblem({ title: "<b>", description: "" })).toMatch(/'<' or '>'/);
  expect(WIRED_CHANNELS).toEqual(["youtube"]);
});

test("transitions: reschedule moves a scheduled slot; cancel is soft and idempotent; a cancelled slot cannot come back", async () => {
  const s = must(await schedule({ at: at(60) })).slot;
  const when = { now: NOW.getTime(), windowMs: missedWindowMs({}) };
  expect(must(moveSlot(k.store, s.id, at(120), OP, when)).slot).toMatchObject({ state: "scheduled", at: at(120) });

  expect(must(cancelSlot(k.store, s.id, OP)).slot.state).toBe("cancelled");
  expect(must(cancelSlot(k.store, s.id, OP)).slot.state).toBe("cancelled");
  expect(slots()).toHaveLength(1); // never a hard delete
  expect(code(moveSlot(k.store, s.id, at(30), OP, when))).toBe("conflict");
  expect(code(moveSlot(k.store, "sl-missing", at(30), OP, when))).toBe("not-found");

  // a cancelled slot no longer holds the export: it can be scheduled again
  expect(must(await schedule({ at: at(60) })).slot.state).toBe("scheduled");
});

test("missed: overdue past the window is marked missed (never published late); the window is configurable; a missed slot reschedules", async () => {
  const late = must(await schedule({ at: at(-61) })).slot;
  const r = must(await publishTick(deps(), NOW));
  expect(r.outcomes).toHaveLength(0);
  expect(r.missed).toEqual([late.id]);
  expect(slots()[0]).toMatchObject({ state: "missed", missedAt: NOW.toISOString() });
  expect(publications()).toHaveLength(0);

  // rescheduling INTO the window would be re-missed at once - refused
  const when = { now: NOW.getTime(), windowMs: missedWindowMs({}) };
  expect(code(moveSlot(k.store, late.id, at(-61), OP, when))).toBe("conflict");
  const back = must(moveSlot(k.store, late.id, at(30), OP, when)).slot;
  expect(back).toMatchObject({ state: "scheduled" });
  expect(back.missedAt).toBeUndefined();

  // PUBLISH_MISSED_MIN widens the window: 90 minutes late is still on time under 120
  must(cancelSlot(k.store, late.id, OP));
  must(await schedule({ at: at(-90) }));
  const r2 = must(await publishTick(deps({ ...DRY_ENV, PUBLISH_MISSED_MIN: "120" }), NOW));
  expect(r2.missed).toHaveLength(0);
  expect(r2.outcomes.map((o) => o.kind)).toEqual(["published"]);
});

test("at-most-once: two concurrent ticks publish a due slot exactly once; a future slot is left alone", async () => {
  must(await schedule({ at: at(-5) }));
  writeExport("0b1c2d3e-4f50-4617-8a9b-cafe0000bbbb");
  const future = must(await schedule({ libraryItemId: ITEM("0b1c2d3e-4f50-4617-8a9b-cafe0000bbbb"), at: at(30) })).slot;

  const [a, b] = await Promise.all([publishTick(deps(), NOW), publishTick(deps(), NOW)]);
  expect(must(a).outcomes.length + must(b).outcomes.length).toBe(1);
  const pubs = publications();
  expect(pubs).toHaveLength(1);
  expect(slots().find((s) => s.id === future.id)?.state).toBe("scheduled");
  // a third tick finds nothing left to fire
  expect(must(await publishTick(deps(), NOW)).outcomes).toHaveLength(0);
  // and a publish-now of the published slot is refused, not a second upload
  expect(code(await publishSlotNow(deps(), pubs[0]?.slotId ?? "", NOW))).toBe("conflict");
});

test("at-most-once: a slot claimed by a process that died is failed visibly, never published again", async () => {
  const s = must(await schedule({ at: at(-5) })).slot;
  // a crash between claim and publish: the claim names a holder on this box whose process is gone
  const dead: Holder = { bootId: "boot-dead", pid: 2 ** 22 + 12_345, host: deps().holder.host };
  const facts = must(await deps().facts(NOW.getTime()));
  expect(must(sweep(k.store, facts, { claim: true, holder: dead })).claimed.map((c) => c.slot.id)).toEqual([s.id]);
  const r = must(await publishTick(deps(), NOW));
  expect(r.interrupted).toEqual([s.id]);
  expect(r.outcomes).toHaveLength(0);
  expect(slots()[0]).toMatchObject({ state: "failed", error: INTERRUPTED_TEXT });
  expect(must(getSlot(k.store, s.id)).fence).toBeUndefined();
  expect(publications()).toHaveLength(0);
  expect(must(await publishTick(deps(), NOW)).outcomes).toHaveLength(0);
});

test("drift: a slot whose export vanished is annotated and never fired; the reason clears when the export returns", async () => {
  const s = must(await schedule({ at: at(-5) })).slot;
  rmSync(path.join(exportsDir, `${EXPORT_ID}.mp4`));
  const r = must(await publishTick(deps(), NOW));
  expect(r.drifted).toEqual([s.id]);
  expect(r.outcomes).toHaveLength(0);
  expect(slots()[0]).toMatchObject({ state: "scheduled", drift: "export_missing" });
  // the CLI still says it in v1's words
  expect(wireSlot(must(getSlot(k.store, s.id))).error).toBe(DRIFT_TEXT.export_missing);

  writeExport();
  const facts = must(await deps().facts(NOW.getTime()));
  expect(must(sweep(k.store, facts, { claim: false })).cleared).toEqual([s.id]);
  expect(slots()[0]?.drift).toBeUndefined();
  // a read never sweeps (v1's GET wrote): an overdue slot reads as it was left
  must(moveSlot(k.store, s.id, at(-30), OP, { now: NOW.getTime(), windowMs: missedWindowMs({}) }));
  expect(must(listSlots(k.store))[0]?.slot.state).toBe("scheduled");
});

test("dry run: publishing keeps a plan, records dry with no platform id, and calls fetch ZERO times", async () => {
  const s = must(await schedule({ at: at(-1) })).slot;
  const r = must(await publishTick(deps(), NOW));
  expect(r.outcomes).toHaveLength(1);
  const o = r.outcomes[0];
  if (o?.kind !== "published") throw new Error(JSON.stringify(o));
  expect(o.publication).toMatchObject({ slotId: s.id, channel: "youtube", dry: true, platformId: null, visibility: "private" });
  expect(must(getSlot(k.store, s.id)).slot.publicationId).toBe(o.publication.id);
  expect(o.plan?.file).toBeTruthy();

  // metrics: nothing live, so nothing pulled - an honest zero count and a note, no fetch
  const m = must(await refreshMetrics(deps(), NOW));
  expect(m.refreshed).toBe(0);
  expect(m.note).toMatch(/no live publications/);

  // PUBLISH_MODE=live without the YouTube variables still runs dry, and says so in the record
  writeExport("0b1c2d3e-4f50-4617-8a9b-cafe0000cccc");
  const s2 = must(await schedule({ libraryItemId: ITEM("0b1c2d3e-4f50-4617-8a9b-cafe0000cccc"), at: at(-1) })).slot;
  const liveAsked = deps({ PUBLISH_MODE: "live" });
  expect(liveAsked.mode.kind).toBe("dry");
  const o2 = must(await publishSlotNow(liveAsked, s2.id, NOW));
  expect(o2.kind === "published" && o2.publication).toMatchObject({ dry: true, platformId: null });

  expect(fetchCalls).toEqual([]);
});

test("metrics: totals are the latest snapshot, per-day deltas start null, groups with an unmeasured member are a lower bound", () => {
  const snap = (publicationId: string, at: string, views: number | null, likes: number | null = null): MetricSnapshot => ({
    publicationId,
    at,
    views,
    watchTimeS: null,
    avgViewDurationS: null,
    likes,
    comments: null,
    shares: null,
    subsDelta: null,
  });
  const snaps = [
    snap("p1", "2026-10-01T09:00:00.000Z", 100, 5),
    snap("p1", "2026-10-02T09:00:00.000Z", 140, null),
    snap("p1", "2026-10-02T21:00:00.000Z", 150, 9), // same day: the last measured value wins
    snap("p1", "2026-10-03T09:00:00.000Z", null, null), // unmeasured day
    snap("p1", "2026-10-04T09:00:00.000Z", 190, 12),
  ];
  expect(latestValue(snaps, "views")).toBe(190);
  expect(latestValue(snaps, "watchTimeS")).toBeNull(); // never measured is null, not 0
  expect(dailySeries(snaps, "views")).toEqual([
    { date: "2026-10-01", total: 100, delta: null },
    { date: "2026-10-02", total: 150, delta: 50 },
    { date: "2026-10-03", total: null, delta: null },
    { date: "2026-10-04", total: 190, delta: 40 },
  ]);

  const pub = (id: string, dry: boolean): Publication =>
    publicationSchema.parse({ id, slotId: `sl-${id}`, channel: "youtube", platformId: dry ? null : `yt-${id}`, visibility: "private", dry, publishedAt: "2026-10-01T08:00:00.000Z" });
  const pubs = [pub("p1", false), pub("p2", true), pub("p3", false)];
  const all = [...snaps, snap("p3", "2026-10-04T09:00:00.000Z", 10)];
  const [g] = groupSums(pubs, all, () => "all");
  expect(g).toEqual({ key: "all", publications: 3, value: 200, measured: 2, unmeasured: 1, lowerBound: true });
  const measuredOnly = groupSums([pub("p1", false), pub("p3", false)], all, () => "live")[0];
  expect(measuredOnly?.lowerBound).toBe(false);
  const none = groupSums([pub("p2", true)], all, () => "dry")[0];
  expect(none?.value).toBeNull();

  expect(publicationTotals(pub("p2", true), all).data).toBe("dry-run");
  expect(publicationTotals(pub("p9", false), all)).toMatchObject({ data: "not-pulled", totals: { views: null } });
  expect(publicationTotals(pub("p1", false), all).totals.views).toBe(190);
});
