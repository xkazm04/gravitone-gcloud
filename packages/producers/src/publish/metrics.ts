import { ok, type Result } from "@gt/domain/errors";
import type { MetricSnapshot, Publication } from "@gt/domain/publication";
import type { Channel } from "@gt/domain/slot";
import { paid, withDryRun } from "@gt/kernel/dryrun";
import { actorOf } from "@gt/kernel/lease";
import type { Quote } from "@gt/kernel/pricing/quote";
import { listPublicationsIn } from "@gt/kernel/slots/read";
import { recordMetric } from "@gt/kernel/slots/outcome";
import type { LifetimeStats } from "./adapter.ts";
import type { PublishDeps } from "./publish.ts";

// THE METRICS PULL - v1 publisher.ts `refreshMetrics`, the worker's slower timer
// (`metrics-refresh`) and `pipeline/publish.mts metrics`. v1's rules, kept word for word where
// they are words: LIVE publications only (a dry one has nothing on any platform, so it gets no
// snapshot rather than a row of zeros), nothing pulled while publishing is dry (that would be a
// network call from a dry process), and a video the platform withheld numbers for is named in
// the note, never booked as zeros. A snapshot is a LIFETIME reading appended through the kernel
// (`recordMetric`, one `metric.snapshot` event each); totals and deltas are
// @gt/domain/publication's pure functions over them.
//
// Upgraded: the pull is a declared call through the DryRun port like the upload, so the one
// process-wide rule "no external call without a declared intent" holds here too.

const STATS_QUOTE: Quote = { usd: 0, basis: "estimated", note: "a statistics read is not billed; videos.list spends 1 quota unit per 50 ids" };

export type MetricsRefresh = { readonly refreshed: number; readonly note: string | null };

/** v1 metrics.ts snapshotFromStatistics: the platform reads views, likes and comments only, so
 *  the rest stays null - unmeasured, not zero. */
export function snapshotOf(publicationId: string, at: string, s: LifetimeStats): MetricSnapshot {
  return { publicationId, at, views: s.views, watchTimeS: null, avgViewDurationS: null, likes: s.likes, comments: s.comments, shares: null, subsDelta: null };
}

export async function refreshMetrics(deps: PublishDeps, now: Date): Promise<Result<MetricsRefresh>> {
  const pubs = deps.store.read((r) => listPublicationsIn(r));
  if (!pubs.ok) return pubs;
  const readable = (p: Publication): boolean => !p.dry && p.platformId !== null && deps.adapters.get(p.channel)?.stats !== undefined;
  const live = pubs.value.filter(readable);
  const dryCount = pubs.value.filter((p) => p.dry).length;
  if (live.length === 0) {
    return ok({
      refreshed: 0,
      note: pubs.value.length > 0 ? `no live publications (${dryCount} dry): nothing was uploaded, so there are no platform metrics` : "no publications yet",
    });
  }
  if (deps.mode.kind !== "live") return ok({ refreshed: 0, note: `${live.length} live publication(s) not refreshed: publishing is in dry mode, which makes no network call` });

  const at = now.toISOString();
  const by = actorOf(deps.holder);
  const port = withDryRun(deps.fx, deps.mode, by);
  let refreshed = 0;
  let withheld = 0;
  const byChannel = new Map<Channel, Publication[]>();
  for (const p of live) byChannel.set(p.channel, [...(byChannel.get(p.channel) ?? []), p]);
  for (const [channel, group] of byChannel) {
    const stats = deps.adapters.get(channel)?.stats;
    if (stats === undefined) continue;
    const ids = group.flatMap((p) => (p.platformId === null ? [] : [p.platformId]));
    const read = await port.effects.call(
      `${channel}.stats`,
      paid({ provider: channel, model: "stats", usage: {}, quote: STATS_QUOTE, payload: { ids }, subject: { kind: "channel", id: channel } }, () => stats(ids)),
    );
    if (!read.ok) return read;
    const byId = new Map(group.map((p) => [p.platformId, p]));
    for (const s of read.value) {
      const pub = byId.get(s.platformId);
      if (pub === undefined) continue;
      if (s.views === null) withheld++;
      const put = recordMetric(deps.store, snapshotOf(pub.id, at, s), by);
      if (!put.ok) return put;
      refreshed++;
    }
  }
  return ok({ refreshed, note: withheld > 0 ? `${withheld} video(s) returned no statistics (deleted or not visible to this token)` : null });
}
