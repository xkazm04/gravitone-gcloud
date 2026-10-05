// LANE — THE PUBLISHING ENGINE (lib/publish), offline and against a temp store.
//
// What is pinned here is what StatReel's calendar.test.ts and metrics.test.ts
// pinned for the code this was ported from: the slot transitions, the missed
// window (never publish late), the at-most-once claim (two ticks, one
// publication; a dead claimant's slot fails visibly instead of firing twice),
// drift, the lifetime-snapshot metrics semantics (first delta null, lower-bound
// group sums), and the one promise a dry run makes — a plan on disk and NO
// network. `globalThis.fetch` is replaced for every test with a stub that
// counts and refuses, so a path that reached the wire would fail here first.
//
// The store and export roots are injected through PUBLISH_STORE_DIR and
// PUBLISH_EXPORTS_DIR (read lazily per call), each test gets fresh temp dirs,
// and the env is restored afterwards (this lane is serial and shares one
// process — playwright.config.ts).

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { dailySeries, groupSums, latestValue, publicationTotals } from "@/lib/publish/metrics";
import { publishNow, refreshMetrics, tick } from "@/lib/publish/publisher";
import {
  cancelSlot,
  createSlot,
  DRIFT_TEXT,
  INTERRUPTED_TEXT,
  listSlots,
  parseScheduleInput,
  parseSlotPatch,
  PublishError,
  sweep,
  updateSlot,
} from "@/lib/publish/schedule";
import { planPath, readPublications, readSchedule, withStore } from "@/lib/publish/store";
import type { MetricSnapshot, Publication } from "@/lib/publish/types";

const ENV_KEYS = ["PUBLISH_STORE_DIR", "PUBLISH_EXPORTS_DIR", "PUBLISH_MODE", "PUBLISH_MISSED_MIN"] as const;
let saved: Record<string, string | undefined> = {};
let root = "";
let exportsDir = "";
let fetchCalls: string[] = [];
const realFetch = globalThis.fetch;

const EXPORT_ID = "0b1c2d3e-4f50-4617-8a9b-cafe0000aaaa";
const NOW = new Date("2026-10-05T12:00:00.000Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

function writeExport(id = EXPORT_ID) {
  // the dry path only hashes the bytes; a real container is not needed
  writeFileSync(path.join(exportsDir, `${id}.mp4`), Buffer.alloc(300_000, 7));
}

const input = (over: Record<string, unknown> = {}) =>
  parseScheduleInput({
    projectId: "proj-1",
    exportId: EXPORT_ID,
    channelId: "youtube",
    publishAt: at(-5),
    title: "A cut",
    description: "probe",
    tags: ["a", "b"],
    ...over,
  });

async function status(e: Promise<unknown>): Promise<number | null> {
  try {
    await e;
    return null;
  } catch (err) {
    return err instanceof PublishError ? err.status : -1;
  }
}

test.beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  root = mkdtempSync(path.join(tmpdir(), "publish-probe-"));
  exportsDir = path.join(root, "exports");
  mkdirSync(exportsDir);
  process.env.PUBLISH_STORE_DIR = path.join(root, "store");
  process.env.PUBLISH_EXPORTS_DIR = exportsDir;
  delete process.env.PUBLISH_MODE;
  delete process.env.PUBLISH_MISSED_MIN;
  fetchCalls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCalls.push(String(input));
    throw new Error("network refused by publish.probe");
  }) as typeof fetch;
  writeExport();
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(root, { recursive: true, force: true });
});

test("schedule: refuses an unwired channel, an unknown export and a second slot for the same export (409); bad input is 400", async () => {
  expect(await status(createSlot(input({ channelId: "tiktok" })))).toBe(409);
  expect(await status(createSlot(input({ channelId: "instagram" })))).toBe(409);
  expect(await status(createSlot(input({ exportId: "nope" })))).toBe(409);
  const slot = await createSlot(input({ publishAt: at(60) }), NOW);
  expect(slot).toMatchObject({ status: "scheduled", publicationId: null, error: null, missedAt: null, projectId: "proj-1" });
  expect(await status(createSlot(input()))).toBe(409);

  expect(() => input({ publishAt: "tomorrow-ish" })).toThrow(PublishError);
  expect(() => input({ channelId: "myspace" })).toThrow(PublishError);
  expect(() => input({ title: "x".repeat(101) })).toThrow(/100 characters/);
  expect(() => input({ title: "<b>" })).toThrow(/'<' or '>'/);
  expect(() => parseSlotPatch({})).toThrow(/nothing to change/);
  expect(() => parseSlotPatch({ status: "published" })).toThrow(PublishError);
});

test("transitions: reschedule moves a scheduled slot; cancel is soft and idempotent; a cancelled slot cannot come back", async () => {
  const s = await createSlot(input({ publishAt: at(60) }), NOW);
  const moved = await updateSlot(s.id, { publishAt: at(120) }, NOW);
  expect(moved).toMatchObject({ status: "scheduled", publishAt: at(120) });

  const cancelled = await cancelSlot(s.id);
  expect(cancelled.status).toBe("cancelled");
  expect((await cancelSlot(s.id)).status).toBe("cancelled");
  expect((await readSchedule()).slots).toHaveLength(1); // never a hard delete
  expect(await status(updateSlot(s.id, { status: "scheduled", publishAt: at(30) }, NOW))).toBe(409);
  expect(await status(updateSlot("sl-missing", { publishAt: at(30) }, NOW))).toBe(404);

  // a cancelled slot no longer holds the export: it can be scheduled again
  expect((await createSlot(input({ publishAt: at(60) }), NOW)).status).toBe("scheduled");
});

test("missed: overdue past the window is marked missed (never published late); the window is configurable; a missed slot reschedules", async () => {
  const late = await createSlot(input({ publishAt: at(-61) }), NOW);
  const r = await tick(NOW);
  expect(r.outcomes).toHaveLength(0);
  expect(r.missed).toEqual([late.id]);
  const missed = (await readSchedule()).slots[0]!;
  expect(missed).toMatchObject({ status: "missed", missedAt: NOW.toISOString(), publicationId: null });
  expect((await readPublications()).publications).toHaveLength(0);

  // rescheduling INTO the window would be re-missed at once — refused
  expect(await status(updateSlot(late.id, { status: "scheduled" }, NOW))).toBe(409);
  const back = await updateSlot(late.id, { status: "scheduled", publishAt: at(30) }, NOW);
  expect(back).toMatchObject({ status: "scheduled", missedAt: null, error: null });

  // PUBLISH_MISSED_MIN widens the window: 90 minutes late is still on time under 120
  await cancelSlot(late.id);
  process.env.PUBLISH_MISSED_MIN = "120";
  await createSlot(input({ publishAt: at(-90) }), NOW);
  const r2 = await tick(NOW);
  expect(r2.missed).toHaveLength(0);
  expect(r2.outcomes.map((o) => o.slot.status)).toEqual(["published"]);
});

test("at-most-once: two concurrent ticks publish a due slot exactly once; a future slot is left alone", async () => {
  await createSlot(input({ publishAt: at(-5) }), NOW);
  writeExport("0b1c2d3e-4f50-4617-8a9b-cafe0000bbbb");
  const future = await createSlot(input({ exportId: "0b1c2d3e-4f50-4617-8a9b-cafe0000bbbb", publishAt: at(30) }), NOW);

  const [a, b] = await Promise.all([tick(NOW), tick(NOW)]);
  expect(a.outcomes.length + b.outcomes.length).toBe(1);
  const pubs = (await readPublications()).publications;
  expect(pubs).toHaveLength(1);
  const slots = (await readSchedule()).slots;
  expect(slots.find((s) => s.id === future.id)!.status).toBe("scheduled");
  // a third tick finds nothing left to fire
  expect((await tick(NOW)).outcomes).toHaveLength(0);
  // and a publish-now of the published slot is refused, not a second upload
  expect(await status(publishNow(pubs[0]!.slotId, { now: NOW }))).toBe(409);
});

test("at-most-once: a slot claimed by a process that died is failed visibly, never published again", async () => {
  const s = await createSlot(input({ publishAt: at(-5) }), NOW);
  // simulate a crash between claim and publish: the claim names a pid that is not running
  await withStore(async (tx) => {
    const f = await tx.get("schedule");
    f.slots[0]!.status = "publishing";
    f.claims[s.id] = { pid: 2 ** 22 + 12_345, at: NOW.toISOString() };
    tx.touch("schedule");
  });
  const r = await tick(NOW);
  expect(r.interrupted).toEqual([s.id]);
  expect(r.outcomes).toHaveLength(0);
  const after = (await readSchedule()).slots[0]!;
  expect(after).toMatchObject({ status: "failed", error: INTERRUPTED_TEXT });
  expect((await readSchedule()).claims[s.id]).toBeUndefined();
  expect((await readPublications()).publications).toHaveLength(0);
});

test("drift: a slot whose export vanished is annotated and never fired; the reason clears when the export returns", async () => {
  const s = await createSlot(input({ publishAt: at(-5) }), NOW);
  rmSync(path.join(exportsDir, `${EXPORT_ID}.mp4`));
  const r = await tick(NOW);
  expect(r.drifted).toEqual([s.id]);
  expect(r.outcomes).toHaveLength(0);
  expect((await readSchedule()).slots[0]).toMatchObject({ status: "scheduled", error: DRIFT_TEXT.export_missing });

  writeExport();
  await sweep(NOW);
  expect((await readSchedule()).slots[0]!.error).toBeNull();
  // a GET-style read sweeps but never claims
  const listed = await listSlots(NOW);
  expect(listed[0]!.status).toBe("scheduled");
});

test("dry run: publishing writes a plan, records dry with no platform id, and calls fetch ZERO times", async () => {
  const s = await createSlot(input({ publishAt: at(-1) }), NOW);
  const r = await tick(NOW);
  expect(r.outcomes).toHaveLength(1);
  const o = r.outcomes[0]!;
  expect(o.slot).toMatchObject({ status: "published", error: null });
  expect(o.publication).toMatchObject({ slotId: s.id, channelId: "youtube", dry: true, platformVideoId: null, visibility: "private" });
  expect(o.slot.publicationId).toBe(o.publication!.id);

  const file = planPath(s.id);
  expect(o.planFile).toBe(file);
  expect(existsSync(file)).toBe(true);
  const plan = JSON.parse(readFileSync(file, "utf8")) as {
    mode: string;
    requests: { method: string; url: string; headers: Record<string, string>; body?: { status?: { privacyStatus?: string } } }[];
  };
  expect(plan.mode).toBe("dry");
  expect(plan.requests[0]!.method).toBe("POST");
  expect(plan.requests[0]!.url).toContain("uploadType=resumable");
  expect(plan.requests[0]!.body?.status?.privacyStatus).toBe("private");
  expect(plan.requests.some((q) => Object.keys(q.headers).some((h) => h.toLowerCase() === "authorization"))).toBe(false);
  // 300 000 bytes in 8 MiB chunks = one PUT
  expect(plan.requests.filter((q) => q.method === "PUT")).toHaveLength(1);

  // metrics: nothing live, so nothing pulled — an honest zero count and a note, no fetch
  const m = await refreshMetrics({ now: NOW });
  expect(m.refreshed).toBe(0);
  expect(m.note).toMatch(/no live publications/);

  // PUBLISH_MODE=live without the YouTube variables still runs dry, and says so in the record
  process.env.PUBLISH_MODE = "live";
  writeExport("0b1c2d3e-4f50-4617-8a9b-cafe0000cccc");
  const s2 = await createSlot(input({ exportId: "0b1c2d3e-4f50-4617-8a9b-cafe0000cccc", publishAt: at(-1) }), NOW);
  const o2 = await publishNow(s2.id, { now: NOW });
  expect(o2.publication).toMatchObject({ dry: true, platformVideoId: null });

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
    snap("p1", "2026-10-01T09:00:00Z", 100, 5),
    snap("p1", "2026-10-02T09:00:00Z", 140, null),
    snap("p1", "2026-10-02T21:00:00Z", 150, 9), // same day: the last measured value wins
    snap("p1", "2026-10-03T09:00:00Z", null, null), // unmeasured day
    snap("p1", "2026-10-04T09:00:00Z", 190, 12),
  ];
  expect(latestValue(snaps, "views")).toBe(190);
  expect(latestValue(snaps, "watchTimeS")).toBeNull(); // never measured is null, not 0
  expect(dailySeries(snaps, "views")).toEqual([
    { date: "2026-10-01", total: 100, delta: null },
    { date: "2026-10-02", total: 150, delta: 50 },
    { date: "2026-10-03", total: null, delta: null },
    { date: "2026-10-04", total: 190, delta: 40 },
  ]);

  const pub = (id: string, dry: boolean): Publication => ({
    id,
    slotId: `sl-${id}`,
    channelId: "youtube",
    platformVideoId: dry ? null : `yt-${id}`,
    visibility: "private",
    dry,
    publishedAt: "2026-10-01T08:00:00Z",
  });
  const pubs = [pub("p1", false), pub("p2", true), pub("p3", false)];
  const all = [...snaps, snap("p3", "2026-10-04T09:00:00Z", 10)];
  const [g] = groupSums(pubs, all, () => "all");
  expect(g).toEqual({ key: "all", publications: 3, value: 200, measured: 2, unmeasured: 1, lowerBound: true });
  const measuredOnly = groupSums([pubs[0]!, pubs[2]!], all, () => "live")[0]!;
  expect(measuredOnly.lowerBound).toBe(false);
  const none = groupSums([pubs[1]!], all, () => "dry")[0]!;
  expect(none.value).toBeNull();

  expect(publicationTotals(pubs[1]!, all).data).toBe("dry-run");
  expect(publicationTotals(pub("p9", false), all)).toMatchObject({ data: "not-pulled", totals: { views: null } });
  expect(publicationTotals(pubs[0]!, all).totals.views).toBe(190);
});
