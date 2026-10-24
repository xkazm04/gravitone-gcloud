import { z } from "zod";

import { slotIdSchema } from "./ids.ts";
import { channelSchema } from "./slot.ts";

// WHAT A SLOT BECAME, AND WHAT IT HAS EARNED SINCE - v1's Publication and MetricSnapshot
// (lib/publish/types.ts) as records, and its metric semantics (lib/publish/metrics.ts,
// ported there from StatReel apps/server/src/metrics.ts) as pure functions over them.
//
// ABSENT IS NOT ZERO. v1's wire rule, kept as the schema's: a metric that was not read is
// `null`, never 0 and never an omitted key, because "unmeasured" and "nobody watched" are
// different facts and a sum that treats the first as the second under-counts silently.
//
// What changed from v1: `platformVideoId` is `platformId`, because a `blog` slot's
// publication is the ai-registry pull request its article's approve opened (owner ruling
// 2026-10-17) - the platform's own id is the PR number and `url` the PR. `visibility` stays
// v1's single word for the video channels (lib/publish/youtube.ts assertPrivate: every
// upload goes up private, and a person makes it public on the platform); a PR has no such
// setting, so a blog publication carries none.

export const publicationIdSchema = z.string().min(1);

export const publicationSchema = z
  .object({
    id: publicationIdSchema,
    slotId: slotIdSchema,
    channel: channelSchema,
    /** The platform's id for what went up; null for a dry run, which sent nothing. */
    platformId: z.string().min(1).nullable(),
    url: z.url().optional(),
    visibility: z.literal("private").optional(),
    /** DRY: a plan was written and no request left the machine (v1 publisher.ts). */
    dry: z.boolean(),
    publishedAt: z.iso.datetime(),
  })
  .superRefine((p, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (p.dry && p.platformId !== null) issue("platformId", "a dry run sent nothing, so the platform gave it no id");
    if (!p.dry && p.platformId === null) issue("platformId", "a live publication names what the platform made of it");
    if ((p.channel === "blog") === (p.visibility !== undefined)) issue("visibility", "an upload goes up private; a pull request has no visibility");
  });
export type Publication = z.output<typeof publicationSchema>;

/** One lifetime reading. Counts are whole and non-negative; `subsDelta` is a change and may fall. */
const count = z.number().int().nonnegative().nullable();
export const metricSnapshotSchema = z.object({
  publicationId: publicationIdSchema,
  at: z.iso.datetime(),
  views: count,
  watchTimeS: z.number().nonnegative().nullable(),
  avgViewDurationS: z.number().nonnegative().nullable(),
  likes: count,
  comments: count,
  shares: count,
  subsDelta: z.number().int().nullable(),
});
export type MetricSnapshot = z.output<typeof metricSnapshotSchema>;

export const METRIC_KEYS = ["views", "watchTimeS", "avgViewDurationS", "likes", "comments", "shares", "subsDelta"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

// ── The semantics (StatReel's header, which v1 kept as law) ─────────────────────────────
// Every snapshot is a LIFETIME total, not a per-day delta, so summing snapshots
// double-counts:
//   · a publication's total is its LATEST non-null reading, per metric;
//   · a day's change is the difference between consecutive MEASURED days; the first has no
//     predecessor, so its delta is null (how much of it accrued that day is unknown);
//   · a group sums its members' totals and counts the unmeasured ones; any unmeasured member
//     makes the sum a lower bound.

// By instant, not by spelling: the door admits any precision, and a collation puts
// "…09:00:00.500Z" before "…09:00:00Z" ('.' sorts below 'Z'), so the later reading lost. Each
// stamp is parsed once per sort (a comparator that parses is ~8x slower over a year of readings).
const byAt = <T extends { readonly at: string }>(xs: readonly T[]): T[] =>
  xs
    .map((x) => [Date.parse(x.at), x] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([, x]) => x);

/** The last measured value in readings already oldest first. */
function lastMeasured(sorted: readonly MetricSnapshot[], key: MetricKey): number | null {
  for (let i = sorted.length - 1; i >= 0; i--) {
    const v = sorted[i]?.[key];
    if (typeof v === "number") return v;
  }
  return null;
}

/** One publication's snapshots, oldest first. */
export function snapshotsOf(publicationId: string, snapshots: readonly MetricSnapshot[]): MetricSnapshot[] {
  return byAt(snapshots.filter((s) => s.publicationId === publicationId));
}

/** The latest non-null value of a lifetime metric; null when it was never measured. */
export function latestValue(snaps: readonly MetricSnapshot[], key: MetricKey): number | null {
  return lastMeasured(byAt(snaps), key);
}

export type DailyPoint = {
  /** YYYY-MM-DD, UTC. */
  readonly date: string;
  /** The lifetime total at the end of that day; null when the day measured nothing. */
  readonly total: number | null;
  /** The change since the previous MEASURED day; null on the first and on unmeasured days. */
  readonly delta: number | null;
};

/** Per-day changes of one publication's lifetime metric. Two refreshes on one day are two
 *  snapshots (a refresh appends); the day's LAST measured value stands for it. */
export function dailySeries(snaps: readonly MetricSnapshot[], key: MetricKey): DailyPoint[] {
  const byDay = new Map<string, number | null>();
  for (const s of byAt(snaps)) {
    const day = s.at.slice(0, 10);
    const v = s[key];
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

/** Why a publication has the numbers it has - said, never implied by zeros. */
export type MetricsData = "dry-run" | "platform" | "not-pulled";

export type PublicationTotals = {
  readonly publicationId: string;
  readonly data: MetricsData;
  readonly totals: Readonly<Record<MetricKey, number | null>>;
};

export function publicationTotals(pub: Publication, snapshots: readonly MetricSnapshot[]): PublicationTotals {
  const snaps = snapshotsOf(pub.id, snapshots);
  const totals: Record<MetricKey, number | null> = { views: null, watchTimeS: null, avgViewDurationS: null, likes: null, comments: null, shares: null, subsDelta: null };
  for (const k of METRIC_KEYS) totals[k] = lastMeasured(snaps, k);
  const data: MetricsData = pub.dry ? "dry-run" : snaps.length > 0 ? "platform" : "not-pulled";
  return { publicationId: pub.id, data, totals };
}

export type GroupSum = {
  readonly key: string;
  readonly publications: number;
  /** The sum over the MEASURED members; null when none was measured. */
  readonly value: number | null;
  readonly measured: number;
  readonly unmeasured: number;
  /** True when any member is unmeasured: the sum under-counts. */
  readonly lowerBound: boolean;
};

/** Sum a metric's totals per group (StatReel metricsOverview group()). */
export function groupSums(
  publications: readonly Publication[],
  snapshots: readonly MetricSnapshot[],
  keyOf: (p: Publication) => string,
  metric: MetricKey = "views",
): GroupSum[] {
  const groups = new Map<string, { publications: number; value: number | null; measured: number; unmeasured: number }>();
  for (const p of publications) {
    const key = keyOf(p);
    const g = groups.get(key) ?? { publications: 0, value: null, measured: 0, unmeasured: 0 };
    g.publications++;
    const v = lastMeasured(snapshotsOf(p.id, snapshots), metric);
    if (v === null) g.unmeasured++;
    else {
      g.value = (g.value ?? 0) + v;
      g.measured++;
    }
    groups.set(key, g);
  }
  return [...groups.entries()].map(([key, g]) => ({ key, ...g, lowerBound: g.unmeasured > 0 }));
}
