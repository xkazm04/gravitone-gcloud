import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { projectPublish, publishSource, type PublishSnapshot } from "../../lib/ledger/v1/sources/publish.ts";
import type { IngestEvent, ProjectCtx } from "../../lib/ledger/v1/types.ts";

// The Calendar over literal schedule / publications / metrics files
// (lib/publish/types.ts). A reschedule is observed, never back-dated; the
// reader never sweeps (listSlots would write schedule.json).

const ctx = (iso = "2026-10-15T12:00:00.000Z"): ProjectCtx => ({ now: new Date(iso), universe: "real" });
type Slot = PublishSnapshot["schedule"]["slots"][number];
const slot = (id: string, status: Slot["status"], publishAt: string, over: Partial<Slot> = {}): Slot => ({
  id, projectId: "seed-glass-harbor", exportId: "mv-1", channelId: "youtube", publishAt, status, title: `slot ${id}`, publicationId: null, error: null, createdAt: "2026-10-10T08:00:00.000Z", missedAt: null, ...over,
});
const snap = (slots: Slot[]): PublishSnapshot => ({
  schedule: { slots },
  publications: { publications: [{ id: "pub-1", slotId: "s-pub", channelId: "youtube", platformVideoId: "abc", dry: false, publishedAt: "2026-10-12T18:00:04.000Z" }] },
  metrics: {
    snapshots: [
      { publicationId: "pub-1", at: "2026-10-13T18:00:00.000Z", views: 120, watchTimeS: null, avgViewDurationS: null, likes: 4, comments: 0, shares: null, subsDelta: null },
      { publicationId: "pub-1", at: "2026-10-14T18:00:00.000Z", views: 300, watchTimeS: 2100, avgViewDurationS: 7, likes: 9, comments: 1, shares: 0, subsDelta: 1 },
    ],
  },
});
const slots = [
  slot("s-next", "scheduled", "2026-10-16T18:00:00.000Z"),
  slot("s-pub", "published", "2026-10-12T18:00:00.000Z", { publicationId: "pub-1" }),
  slot("s-missed", "missed", "2026-10-11T09:00:00.000Z", { missedAt: "2026-10-11T10:05:00.000Z" }),
  slot("s-now", "publishing", "2026-10-15T11:58:00.000Z"),
  slot("s-gone", "cancelled", "2026-10-09T09:00:00.000Z"),
  slot("s-fail", "failed", "2026-10-14T09:00:00.000Z", { error: "videos.insert (init) 403: quotaExceeded" }),
];
const byType = (events: readonly IngestEvent[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};

describe("publish projection", () => {
  it("counts the facts it projects; publications and metric snapshots are recorded", () => {
    const p = projectPublish(snap(slots), ctx());
    expect(byType(p.events)).toEqual(p.tally.facts);
    expect(new Set(p.events.map((e) => e.key)).size).toBe(p.events.length);
    expect(p.events.filter((e) => e.type === "publish" || e.type === "metric.snapshot").map((e) => [e.type, e.atSrc, e.data["projectId"] ?? null])).toEqual([
      ["publish", "recorded", "seed-glass-harbor"],
      ["metric.snapshot", "recorded", null],
      ["metric.snapshot", "recorded", null],
    ]);
  });

  it("a reschedule is a new observed fact at the sync's clock, carrying the new time; the old one stays", () => {
    const a = projectPublish(snap([slot("s-next", "scheduled", "2026-10-16T18:00:00.000Z")]), ctx()).events.filter((e) => e.type === "slot.schedule");
    const b = projectPublish(snap([slot("s-next", "scheduled", "2026-10-18T18:00:00.000Z")]), ctx("2026-10-15T13:00:00.000Z")).events.filter((e) => e.type === "slot.schedule");
    expect([...a, ...b].map((e) => [e.key, e.atSrc, e.occurredAt, e.data["publishAt"]])).toEqual([
      ["publish:s-next:at.2026-10-16T18:00:00.000Z", "derived", "2026-10-15T12:00:00.000Z", "2026-10-16T18:00:00.000Z"],
      ["publish:s-next:at.2026-10-18T18:00:00.000Z", "derived", "2026-10-15T13:00:00.000Z", "2026-10-18T18:00:00.000Z"],
    ]);
  });

  it("the unsettled slots are the Calendar row, earliest first; no slot is a job", () => {
    const p = projectPublish(snap(slots), ctx());
    expect(p.live).toEqual([]);
    expect(p.slots?.map((s) => [s.id, s.status, s.error ?? null])).toEqual([
      ["s-missed", "missed", null],
      ["s-fail", "failed", "videos.insert (init) 403: quotaExceeded"],
      ["s-now", "publishing", null],
      ["s-next", "scheduled", null],
    ]);
  });
});

describe("publish reader", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gt-publish-"));
  const before = process.env["PUBLISH_STORE_DIR"];
  afterAll(() => {
    if (before === undefined) delete process.env["PUBLISH_STORE_DIR"];
    else process.env["PUBLISH_STORE_DIR"] = before;
    rmSync(root, { recursive: true, force: true });
  });

  it("reads the three files as they stand: an overdue slot is NOT swept to missed by the read", async () => {
    process.env["PUBLISH_STORE_DIR"] = root;
    const overdue = { ...slot("s-old", "scheduled", "2026-01-01T00:00:00.000Z"), description: "", tags: [] };
    const body = JSON.stringify({ version: 1, slots: [overdue], claims: {} });
    writeFileSync(path.join(root, "schedule.json"), body);
    const r = await publishSource.read();
    expect(r.ok && r.value.schedule.slots.map((s) => s.status)).toEqual(["scheduled"]);
    expect(r.ok && r.value.publications.publications).toEqual([]);
    expect(readFileSync(path.join(root, "schedule.json"), "utf8")).toBe(body);
  });
});
