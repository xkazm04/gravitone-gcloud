// METRICS SEMANTICS — pure functions, no I/O, safe to import from a client
// component (the Calendar's Metrics tab computes its table, sparkline and
// group bars with these over the raw `GET /api/publish/metrics` payload).
//
// PORTED FROM StatReel apps/server/src/metrics.ts, whose header is the law:
//
//   Every snapshot is a LIFETIME total (YouTube Data API videos.list
//   statistics), not a per-day delta — so summing snapshots double-counts.
//   · a publication's total = its LATEST non-null snapshot, per metric;
//   · a per-day value = the difference between consecutive non-null
//     snapshots; the FIRST has no predecessor, so its delta is null (we do not
//     know how much of it accrued that day);
//   · a group sums its publications' totals and counts the unmeasured ones:
//     `lowerBound` is true when any member has no number, because the sum then
//     under-counts. An unmeasured number is not a zero, and a partial sum is a
//     lower bound.
//
// One adaptation: StatReel stored one row per (publication, date) and upserted
// it. Here a snapshot carries a full timestamp and a refresh appends, so two
// refreshes on one day are two snapshots; `dailySeries` collapses each day to
// its LAST measured snapshot before differencing.

import type { MetricSnapshot, Publication } from "./types";

export type MetricKey = Exclude<keyof MetricSnapshot, "publicationId" | "at">;
export const METRIC_KEYS: readonly MetricKey[] = [
  "views",
  "watchTimeS",
  "avgViewDurationS",
  "likes",
  "comments",
  "shares",
  "subsDelta",
];

/** Lifetime statistics as videos.list returns them (null = withheld). */
export interface LifetimeStats {
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
}

/** StatReel packages/publish metrics.ts normalizeYouTubeStatistics: videos.list
 *  exposes views, likes and comments only, so watch time, average view
 *  duration, shares and subscribers stay null — not 0. */
export function snapshotFromStatistics(publicationId: string, at: string, s: LifetimeStats): MetricSnapshot {
  return {
    publicationId,
    at,
    views: s.viewCount,
    watchTimeS: null,
    avgViewDurationS: null,
    likes: s.likeCount,
    comments: s.commentCount,
    shares: null,
    subsDelta: null,
  };
}

/** One publication's snapshots, oldest first. */
export function snapshotsOf(publicationId: string, snapshots: readonly MetricSnapshot[]): MetricSnapshot[] {
  return snapshots.filter((s) => s.publicationId === publicationId).sort((a, b) => a.at.localeCompare(b.at));
}

/** Latest non-null value of a lifetime metric; null when it was never measured. */
export function latestValue(snaps: readonly MetricSnapshot[], key: MetricKey): number | null {
  const sorted = [...snaps].sort((a, b) => a.at.localeCompare(b.at));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const v = sorted[i]![key];
    if (typeof v === "number") return v;
  }
  return null;
}

export interface DailyPoint {
  /** YYYY-MM-DD (UTC) */
  date: string;
  /** the lifetime total at the end of that day; null when that day measured nothing */
  total: number | null;
  /** change since the previous MEASURED day; null on the first and on unmeasured days */
  delta: number | null;
}

/** Per-day deltas of one publication's lifetime metric. */
export function dailySeries(snaps: readonly MetricSnapshot[], key: MetricKey): DailyPoint[] {
  const byDay = new Map<string, number | null>();
  for (const s of [...snaps].sort((a, b) => a.at.localeCompare(b.at))) {
    const day = s.at.slice(0, 10);
    const v = s[key];
    // the day's LAST measured value wins; a later null on the same day does not erase it
    if (typeof v === "number") byDay.set(day, v);
    else if (!byDay.has(day)) byDay.set(day, null);
  }
  let prev: number | null = null;
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => {
      if (total === null) return { date, total, delta: null };
      const delta = prev === null ? null : total - prev;
      prev = total;
      return { date, total, delta };
    });
}

/** Why a publication has the numbers it has — said, not implied by zeros. */
export type MetricsData = "dry-run" | "platform" | "not-pulled";

export function metricsDataOf(pub: Publication, snaps: readonly MetricSnapshot[]): MetricsData {
  if (pub.dry) return "dry-run";
  return snaps.some((s) => s.publicationId === pub.id) ? "platform" : "not-pulled";
}

export interface PublicationTotals {
  publicationId: string;
  data: MetricsData;
  totals: Record<MetricKey, number | null>;
}

export function publicationTotals(pub: Publication, snapshots: readonly MetricSnapshot[]): PublicationTotals {
  const snaps = snapshotsOf(pub.id, snapshots);
  const totals = Object.fromEntries(METRIC_KEYS.map((k) => [k, latestValue(snaps, k)])) as Record<MetricKey, number | null>;
  return { publicationId: pub.id, data: metricsDataOf(pub, snapshots), totals };
}

export interface GroupSum {
  key: string;
  publications: number;
  /** sum over the MEASURED members; null when none was measured */
  value: number | null;
  measured: number;
  unmeasured: number;
  /** true when any member is unmeasured — the sum under-counts */
  lowerBound: boolean;
}

/** Sum a metric's totals per group (StatReel metricsOverview group()). */
export function groupSums(
  publications: readonly Publication[],
  snapshots: readonly MetricSnapshot[],
  keyOf: (p: Publication) => string,
  metric: MetricKey = "views",
): GroupSum[] {
  const groups = new Map<string, GroupSum>();
  for (const p of publications) {
    const key = keyOf(p);
    const g = groups.get(key) ?? { key, publications: 0, value: null, measured: 0, unmeasured: 0, lowerBound: false };
    g.publications++;
    const v = latestValue(snapshotsOf(p.id, snapshots), metric);
    if (v !== null) {
      g.value = (g.value ?? 0) + v;
      g.measured++;
    } else {
      g.unmeasured++;
      g.lowerBound = true;
    }
    groups.set(key, g);
  }
  return [...groups.values()];
}
