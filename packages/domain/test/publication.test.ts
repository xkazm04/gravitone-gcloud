import { describe, expect, it } from "vitest";

import { dailySeries, groupSums, latestValue, metricSnapshotSchema, publicationSchema, publicationTotals, type MetricSnapshot, type Publication } from "../src/publication.ts";
import { accept, refuse } from "./_records.ts";

// v1's metric semantics (tests/golden-path/publish.probe.spec.ts "metrics: ..."), at the unit
// rung against their new home, and the publication record's rules.

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

const pub = (id: string, dry: boolean): Publication =>
  accept(publicationSchema, { id, slotId: `sl-${id}`, channel: "youtube", platformId: dry ? null : `yt-${id}`, visibility: "private", dry, publishedAt: "2026-10-01T08:00:00Z" });

describe("a publication", () => {
  it("is dry with no platform id, or live with one; an upload is private, a pull request has no visibility", () => {
    pub("p1", true);
    pub("p2", false);
    const base = { id: "p", slotId: "sl-p", channel: "youtube", visibility: "private", publishedAt: "2026-10-01T08:00:00Z" };
    refuse(publicationSchema, { ...base, dry: true, platformId: "yt-x" }, "dry run sent nothing");
    refuse(publicationSchema, { ...base, dry: false, platformId: null }, "names what the platform");
    refuse(publicationSchema, { ...base, dry: true, platformId: null, visibility: undefined }, "visibility");
    const pr = { id: "p", slotId: "sl-p", channel: "blog", dry: false, platformId: "412", url: "https://github.com/acme/ai-registry/pull/412", publishedAt: "2026-10-01T08:00:00Z" };
    accept(publicationSchema, pr);
    refuse(publicationSchema, { ...pr, visibility: "private" }, "visibility");
  });

  it("a reading's unmeasured metric is null, never a missing key", () => {
    accept(metricSnapshotSchema, snap("p1", "2026-10-01T09:00:00Z", null));
    const { views: _v, ...missing } = snap("p1", "2026-10-01T09:00:00Z", 3);
    refuse(metricSnapshotSchema, missing, "views");
    refuse(metricSnapshotSchema, snap("p1", "2026-10-01T09:00:00Z", -1), "views");
  });
});

describe("metric semantics (StatReel's law, kept by v1)", () => {
  const snaps = [
    snap("p1", "2026-10-01T09:00:00Z", 100, 5),
    snap("p1", "2026-10-02T09:00:00Z", 140, null),
    snap("p1", "2026-10-02T21:00:00Z", 150, 9),
    snap("p1", "2026-10-03T09:00:00Z", null, null),
    snap("p1", "2026-10-04T09:00:00Z", 190, 12),
  ];

  it("a total is the latest measured value; never measured is null, not 0", () => {
    expect(latestValue(snaps, "views")).toBe(190);
    expect(latestValue(snaps, "watchTimeS")).toBeNull();
  });

  it("per-day deltas start null, skip unmeasured days, and a day is its last measured value", () => {
    expect(dailySeries(snaps, "views")).toEqual([
      { date: "2026-10-01", total: 100, delta: null },
      { date: "2026-10-02", total: 150, delta: 50 },
      { date: "2026-10-03", total: null, delta: null },
      { date: "2026-10-04", total: 190, delta: 40 },
    ]);
  });

  it("a group with an unmeasured member is a lower bound; a dry run says so", () => {
    const pubs = [pub("p1", false), pub("p2", true), pub("p3", false)];
    const all = [...snaps, snap("p3", "2026-10-04T09:00:00Z", 10)];
    expect(groupSums(pubs, all, () => "all")[0]).toEqual({ key: "all", publications: 3, value: 200, measured: 2, unmeasured: 1, lowerBound: true });
    expect(groupSums([pubs[0]!, pubs[2]!], all, () => "live")[0]?.lowerBound).toBe(false);
    expect(groupSums([pubs[1]!], all, () => "dry")[0]?.value).toBeNull();
    expect(publicationTotals(pubs[1]!, all).data).toBe("dry-run");
    expect(publicationTotals(pub("p9", false), all)).toMatchObject({ data: "not-pulled", totals: { views: null } });
    expect(publicationTotals(pubs[0]!, all).totals.views).toBe(190);
  });
});
