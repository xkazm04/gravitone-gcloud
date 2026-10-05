"use client";

// The Metrics tab: what came back from each publication, where anything did.
// Measurement honesty (StatReel metricsGroup.ts; lib/publish/types.ts): a null
// is "—", never 0; a channel sum with an unmeasured member is a lower bound,
// drawn "≥ N"; a dry-run publication says so on its row. The arithmetic is the
// engine's own, lib/publish/metrics.ts (pure, client-safe): totals are the
// latest non-null lifetime value, the daily line is per-day DELTAS with the
// first day null — a gap, not a dip — and groups carry `lowerBound`.

import { useState } from "react";

import { Command, Loading, Table, type PushToast, type TableColumn } from "@/components/kit";
import { Button } from "@/components/ui/Primitives";
import { Ghost } from "@/components/ui/signal";
import { dailySeries, groupSums, publicationTotals, snapshotsOf, type MetricKey, type MetricsData } from "@/lib/publish/metrics";
import type { ChannelId, Publication } from "@/lib/publish/types";

import {
  CHANNEL_IDS,
  CHANNEL_NAME,
  dateTimeLabel,
  fmtDuration,
  fmtFigure,
  fmtNum,
  fmtSigned,
  fmtWatch,
  speakFigure,
} from "./calendarModel";
import { Badge, FetchFailure, Sparkline } from "./parts";
import type { Calendar } from "./useCalendar";

interface Row {
  id: string;
  pub: Publication;
  title: string;
  data: MetricsData;
  totals: Record<MetricKey, number | null>;
  daily: (number | null)[];
}

const num = (k: MetricKey) => (r: Row) => r.totals[k];
const DATA_BADGE: Record<MetricsData, React.ReactNode> = {
  "dry-run": <Badge tone="amber">dry run</Badge>,
  "not-pulled": <Badge>not pulled</Badge>,
  platform: null,
};

const COLUMNS: TableColumn<Row>[] = [
  {
    id: "title",
    head: "Publication",
    sortBy: (r) => r.title,
    cell: (r) => (
      <span className="block min-w-0">
        <span className="font-hanken block text-white">{r.title}</span>
        <span className="font-jetbrains block text-white/60">
          {r.pub.platformVideoId ?? "no video id"} · {dateTimeLabel(r.pub.publishedAt)}
        </span>
      </span>
    ),
  },
  { id: "channel", head: "Channel", sortBy: (r) => r.pub.channelId, cell: (r) => CHANNEL_NAME[r.pub.channelId] ?? r.pub.channelId },
  {
    id: "vis",
    head: "Visibility",
    cell: (r) => (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="font-jetbrains">{r.pub.visibility}</span>
        {DATA_BADGE[r.data]}
      </span>
    ),
  },
  { id: "views", head: "Views", num: true, sortBy: num("views"), cell: (r) => fmtNum(r.totals.views) },
  { id: "avg", head: "Avg view", num: true, sortBy: num("avgViewDurationS"), cell: (r) => fmtDuration(r.totals.avgViewDurationS) },
  { id: "watch", head: "Watch time", num: true, sortBy: num("watchTimeS"), cell: (r) => fmtWatch(r.totals.watchTimeS) },
  { id: "likes", head: "Likes", num: true, sortBy: num("likes"), cell: (r) => fmtNum(r.totals.likes) },
  { id: "comments", head: "Comments", num: true, sortBy: num("comments"), cell: (r) => fmtNum(r.totals.comments) },
  { id: "shares", head: "Shares", num: true, sortBy: num("shares"), cell: (r) => fmtNum(r.totals.shares) },
  { id: "subs", head: "Subs ±", num: true, sortBy: num("subsDelta"), cell: (r) => fmtSigned(r.totals.subsDelta) },
  { id: "daily", head: "Daily views", cell: (r) => <Sparkline values={r.daily} label={`${r.title} daily views`} /> },
];

export function MetricsTab({ cal, push }: { cal: Calendar; push: (t: PushToast) => void }) {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  if (!cal.metrics) return <Loading />;
  if (!cal.metrics.ok) return <FetchFailure r={cal.metrics} onRetry={cal.reload} />;

  const { publications, snapshots } = cal.metrics.data;
  const slots = cal.schedule?.ok ? cal.schedule.data.slots : [];
  const rows: Row[] = publications.map((p) => {
    const t = publicationTotals(p, snapshots);
    return {
      id: p.id,
      pub: p,
      title: slots.find((s) => s.id === p.slotId)?.title ?? p.slotId,
      data: t.data,
      totals: t.totals,
      daily: dailySeries(snapshotsOf(p.id, snapshots), "views").map((d) => d.delta),
    };
  });
  const dryOf = (ch: string) => publications.filter((p) => p.channelId === ch && p.dry).length;
  const groups = groupSums(publications, snapshots, (p) => p.channelId).sort(
    (a, b) => CHANNEL_IDS.indexOf(a.key as ChannelId) - CHANNEL_IDS.indexOf(b.key as ChannelId),
  );
  const max = Math.max(1, ...groups.map((g) => g.value ?? 0));

  const refresh = async () => {
    setBusy(true);
    const r = await cal.refresh();
    setBusy(false);
    if (r.ok) setLast(`refreshed ${r.data.refreshed}${r.data.note ? ` · ${r.data.note}` : ""}`);
    else push({ kind: "failed", text: `refresh refused · ${r.status || "network"} · ${r.error}`, ttl: null });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={busy} data-testid="calendar-metrics-refresh">
          {busy ? "refreshing…" : "Refresh"}
        </Button>
        {last && (
          <span className="font-jetbrains text-label text-white/75" role="status">
            {last}
          </span>
        )}
      </div>

      {publications.length === 0 ? (
        <div className="space-y-3" data-testid="calendar-metrics-empty">
          <Ghost shape="row" count={3} label="no publications yet" />
          <Command label="metrics">npx tsx pipeline/publish.mts metrics --json</Command>
        </div>
      ) : (
        <>
          <Table label="Publications" columns={COLUMNS} rows={rows} defaultSort={{ column: "title", dir: "asc" }} />
          <section aria-labelledby="m-groups" className="space-y-3">
            <h2 id="m-groups" className="font-jetbrains text-label tracking-[0.14em] text-white/70 uppercase">
              Views by channel
            </h2>
            <ul className="max-w-3xl space-y-3">
              {groups.map((g) => {
                const ch = CHANNEL_NAME[g.key as ChannelId] ?? g.key;
                const dry = dryOf(g.key);
                const fig = { value: g.value, lowerBound: g.lowerBound };
                const label = `${ch}: ${speakFigure(fig)} views · ${g.measured} of ${g.publications} measured${dry ? ` · ${dry} dry` : ""}`;
                return (
                  <li key={g.key} className="grid grid-cols-[8rem_minmax(0,1fr)_18rem] items-center gap-3" aria-label={label}>
                    <span className="font-hanken text-white">{ch}</span>
                    <span aria-hidden className="relative h-3 rounded-sm border border-white/10">
                      {g.value === null ? (
                        <span
                          className="absolute inset-0 text-white/15"
                          style={{ backgroundImage: "repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 8px)" }}
                        />
                      ) : (
                        <span
                          className={`absolute inset-y-0 left-0 rounded-sm ${g.lowerBound ? "bg-cyan-300/50" : "bg-cyan-300/80"}`}
                          style={{ width: `${(g.value / max) * 100}%` }}
                        />
                      )}
                    </span>
                    <span aria-hidden className="font-jetbrains flex items-baseline justify-end gap-3 text-white">
                      <span className="text-content">{fmtFigure(fig)}</span>
                      <span className="text-white/60">
                        {g.measured}/{g.publications} measured{dry ? ` · ${dry} dry` : ""}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
