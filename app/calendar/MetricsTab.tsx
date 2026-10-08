"use client";

// The Metrics tab: what came back from each publication, where anything did.
// Measurement honesty (StatReel metricsGroup.ts; lib/publish/types.ts): a null
// is "—", never 0; a sum with an unmeasured member is a lower bound, drawn
// "≥ N" and hatched where its bar runs out; a dry-run publication says so on
// its row. The arithmetic is the engine's own, lib/publish/metrics.ts (pure,
// client-safe): totals are the latest non-null lifetime value, the daily line
// is per-day DELTAS with the first day null — a gap, not a dip — and groups
// carry `lowerBound`.
//
// The publication list only grows, so the table draws 25 rows and a Pager
// under them (every row also grabs its export's poster, one video read per
// export); the rows are derived once per read of the store, not on every tick
// of the page clock, and the sort is remembered.

import { RefreshCw, SquareTerminal } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";

import { Pager, useWindow } from "@/components/kit";
import { useRemembered } from "@/lib/useRemembered";

import { usePrefersReducedMotion } from "@/components/ui/motionPreference";
import { Panel } from "@/components/ui/Primitives";
import { CHIP_CLASS, TALLY_TONE, Tally } from "@/components/ui/signal";
import { EASE } from "@/components/ui/tokens";
import { dailySeries, groupSums, publicationTotals, snapshotsOf, type MetricKey, type MetricsData } from "@/lib/publish/metrics";
import type { ChannelId, MetricSnapshot, Publication, ScheduleSlot } from "@/lib/publish/types";

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
  type Figure,
} from "./calendarModel";
import { Poster } from "./poster";
import { ChannelGlyph, CopyButton, FailureCard, SectionHead, Sparkline, type PushToast } from "./ui";
import type { Calendar } from "./useCalendar";

interface Row {
  pub: Publication;
  title: string;
  exportId: string | null;
  data: MetricsData;
  totals: Record<MetricKey, number | null>;
  daily: (number | null)[];
}

type SortKey = "title" | "views" | "likes" | "comments" | "published";
const SORTS: readonly SortKey[] = ["title", "views", "likes", "comments", "published"];
const PAGE = 25;

const COLS: { key: MetricKey; head: string; fmt: (n: number | null) => string }[] = [
  { key: "views", head: "Views", fmt: fmtNum },
  { key: "avgViewDurationS", head: "Avg view", fmt: fmtDuration },
  { key: "watchTimeS", head: "Watch", fmt: fmtWatch },
  { key: "likes", head: "Likes", fmt: fmtNum },
  { key: "comments", head: "Comments", fmt: fmtNum },
  { key: "shares", head: "Shares", fmt: fmtNum },
  { key: "subsDelta", head: "Subs ±", fmt: fmtSigned },
];

/** Sum a metric over the rows that measured it; a lower bound when any row did not. */
function total(rows: Row[], key: MetricKey): Figure {
  const vals = rows.map((r) => r.totals[key]);
  const measured = vals.filter((v): v is number => v !== null);
  return { value: measured.length ? measured.reduce((a, b) => a + b, 0) : null, lowerBound: measured.length > 0 && measured.length < vals.length };
}

/** One table row per publication. The slot it went out from is found through
 *  one map, not a search of every slot per publication. */
function rowsOf(publications: Publication[], snapshots: readonly MetricSnapshot[], slots: readonly ScheduleSlot[]): Row[] {
  const bySlot = new Map(slots.map((s) => [s.id, s]));
  return publications.map((p) => {
    const t = publicationTotals(p, snapshots);
    const slot = bySlot.get(p.slotId);
    return {
      pub: p,
      title: slot?.title ?? p.slotId,
      exportId: slot?.exportId ?? null,
      data: t.data,
      totals: t.totals,
      daily: dailySeries(snapshotsOf(p.id, snapshots), "views").map((d) => d.delta),
    };
  });
}

export function MetricsTab({ cal, push }: { cal: Calendar; push: PushToast }) {
  const reduced = usePrefersReducedMotion();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const [sort, setSort] = useRemembered<SortKey>("calendar.metrics.sort", "published", SORTS);
  const data = cal.metrics?.ok ? cal.metrics.data : null;
  const slotList = cal.schedule?.ok ? cal.schedule.data.slots : null;
  const rows = useMemo(() => (data ? rowsOf(data.publications, data.snapshots, slotList ?? []) : []), [data, slotList]);
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title);
        if (sort === "published") return b.pub.publishedAt.localeCompare(a.pub.publishedAt);
        return (b.totals[sort] ?? -1) - (a.totals[sort] ?? -1);
      }),
    [rows, sort],
  );
  const win = useWindow(sorted, { size: PAGE, key: sort });

  if (!cal.metrics) {
    return (
      <div aria-busy="true" aria-label="Loading metrics" className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
      </div>
    );
  }
  if (!cal.metrics.ok) return <FailureCard r={cal.metrics} onRetry={cal.reload} />;

  const { publications, snapshots } = cal.metrics.data;
  const dry = publications.filter((p) => p.dry).length;
  // every channel gets its row, a channel nothing went out on included: its
  // absence is a fact about the work, not a gap in the chart
  const summed = groupSums(publications, snapshots, (p) => p.channelId);
  const groups = CHANNEL_IDS.map(
    (id) => summed.find((g) => g.key === id) ?? { key: id, publications: 0, value: null, measured: 0, unmeasured: 0, lowerBound: false },
  );
  // a lower bound needs room past its bar for the hatch that says "at least"
  const max = Math.max(1, ...groups.map((g) => (g.value ?? 0) * (g.lowerBound ? 1.18 : 1)));

  const refresh = async () => {
    setBusy(true);
    const r = await cal.refresh();
    setBusy(false);
    if (r.ok) setLast(`refreshed ${r.data.refreshed}${r.data.note ? ` · ${r.data.note}` : ""}`);
    else push({ tone: "failed", text: `refresh refused · ${r.status || "network"} · ${r.error}`, sticky: true });
  };

  const kpis: { label: string; fig: Figure; sub?: string; tone?: "amber" }[] = [
    { label: "Publications", fig: { value: publications.length, lowerBound: false }, sub: dry ? `${dry} dry run` : undefined, tone: dry ? "amber" : undefined },
    { label: "Views", fig: total(rows, "views") },
    { label: "Likes", fig: total(rows, "likes") },
    { label: "Comments", fig: total(rows, "comments") },
  ];

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center gap-3">
        <SectionHead title="Returns">
          <Tally value={publications.length} label="pubs" />
          {dry > 0 && <Tally value={dry} label="dry run" tone="amber" />}
        </SectionHead>
        <div className="ml-auto flex items-center gap-3">
          {last && (
            <span className="font-jetbrains text-label text-white/60" role="status">
              {last}
            </span>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            data-testid="calendar-metrics-refresh"
            className="font-jetbrains inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-3.5 py-1.5 text-label text-white/80 transition hover:border-white/25 hover:bg-white/[0.06] disabled:opacity-60"
          >
            <RefreshCw aria-hidden className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: reduced ? 0 : i * 0.05, ease: EASE }}
            className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-5 backdrop-blur-[14px]"
            aria-label={`${k.label}: ${speakFigure(k.fig)}${k.sub ? `, ${k.sub}` : ""}`}
            role="group"
          >
            <span aria-hidden className="pointer-events-none absolute -top-16 -right-10 h-36 w-36 rounded-full bg-cyan-400/10 blur-3xl" />
            <p aria-hidden className="font-jetbrains text-label tracking-[0.18em] text-white/40 uppercase">
              {k.label}
            </p>
            <p aria-hidden className={`font-instrument mt-2 text-5xl leading-none ${k.fig.value === null ? "text-white/30" : "text-white"}`}>
              {fmtFigure(k.fig)}
            </p>
            <p aria-hidden className="mt-2 flex min-h-6 items-center gap-2">
              {k.sub && <span className={`${CHIP_CLASS} ${TALLY_TONE.amber} uppercase`}>{k.sub}</span>}
              {k.fig.lowerBound && <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>lower bound</span>}
              {k.fig.value === null && <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>not measured</span>}
            </p>
          </motion.div>
        ))}
      </div>

      {publications.length === 0 ? (
        <EmptyReturns />
      ) : (
        <>
          <Panel className="overflow-hidden">
            <div className="scroll-x overflow-x-auto">
              <table className="w-full min-w-[68rem] border-collapse">
                <caption className="sr-only">Publications</caption>
                <thead>
                  <tr className="border-b border-white/8">
                    <SortHead label="Publication" k="title" sort={sort} onSort={setSort} className="pl-5 text-left" />
                    <th scope="col" className="font-jetbrains px-3 py-3 text-left text-label font-normal tracking-[0.16em] text-white/40 uppercase">
                      Channel
                    </th>
                    {COLS.map((c) => (
                      <th key={c.key} scope="col" className="font-jetbrains px-3 py-3 text-right text-label font-normal tracking-[0.16em] text-white/40 uppercase">
                        {c.key === "views" || c.key === "likes" || c.key === "comments" ? (
                          <button type="button" onClick={() => setSort(c.key as SortKey)} className={`uppercase transition hover:text-white ${sort === c.key ? "text-cyan-200" : ""}`} aria-pressed={sort === c.key}>
                            {c.head}
                          </button>
                        ) : (
                          c.head
                        )}
                      </th>
                    ))}
                    <th scope="col" className="font-jetbrains px-5 py-3 text-right text-label font-normal tracking-[0.16em] text-white/40 uppercase">
                      Daily views
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {win.visible.map((r) => (
                    <tr key={r.pub.id} className="border-b border-white/[0.05] last:border-b-0 transition hover:bg-white/[0.025]">
                      <th scope="row" className="py-3 pr-3 pl-5 text-left font-normal">
                        <span className="flex items-center gap-3.5">
                          <Poster exportId={r.exportId} className="aspect-video w-24 shrink-0 rounded-lg" />
                          <span className="min-w-0">
                            <span className="font-hanken block truncate text-content text-white">{r.title}</span>
                            <span className="font-jetbrains flex flex-wrap items-center gap-2 text-label text-white/45">
                              {dateTimeLabel(r.pub.publishedAt)}
                              <span className="text-white/30">{r.pub.platformVideoId ?? "no video id"}</span>
                              {r.data === "dry-run" && <span className={`${CHIP_CLASS} ${TALLY_TONE.amber} uppercase`}>dry run</span>}
                              {r.data === "not-pulled" && <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral} uppercase`}>not pulled</span>}
                            </span>
                          </span>
                        </span>
                      </th>
                      <td className="px-3 py-3">
                        <span className="font-hanken inline-flex items-center gap-2 text-label text-white/75">
                          <ChannelGlyph id={r.pub.channelId} className="h-4 w-4" />
                          {CHANNEL_NAME[r.pub.channelId] ?? r.pub.channelId}
                        </span>
                      </td>
                      {COLS.map((c) => {
                        const v = r.totals[c.key];
                        return (
                          <td key={c.key} className={`font-jetbrains px-3 py-3 text-right text-content tabular-nums ${v === null ? "text-white/30" : "text-white/90"}`}>
                            {c.fmt(v)}
                          </td>
                        );
                      })}
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex justify-end">
                          <Sparkline values={r.daily} label={`${r.title} daily views`} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {win.total > PAGE && (
              <div className="px-5 pb-4">
                <Pager shown={win.shown} total={win.total} onMore={win.more} onAll={win.all} step={PAGE} noun="publications" />
              </div>
            )}
          </Panel>

          <section aria-labelledby="m-groups" className="space-y-3">
            <SectionHead id="m-groups" title="Views by channel" />
            <Panel className="space-y-1 p-3">
              {groups.map((g) => {
                const ch = CHANNEL_NAME[g.key as ChannelId] ?? g.key;
                const dryN = publications.filter((p) => p.channelId === g.key && p.dry).length;
                const fig = { value: g.value, lowerBound: g.lowerBound };
                const w = g.value === null ? 0 : (g.value / max) * 100;
                return (
                  <div
                    key={g.key}
                    role="group"
                    aria-label={`${ch}: ${speakFigure(fig)} views · ${g.measured} of ${g.publications} measured${dryN ? ` · ${dryN} dry` : ""}`}
                    className="grid grid-cols-[11rem_minmax(0,1fr)_14rem] items-center gap-4 rounded-xl px-3 py-3 transition hover:bg-white/[0.025]"
                  >
                    <span aria-hidden className="font-hanken flex items-center gap-2.5 text-content text-white">
                      <ChannelGlyph id={g.key as ChannelId} className="h-5 w-5 text-white/70" />
                      {ch}
                    </span>
                    <span aria-hidden className="relative h-3.5 overflow-hidden rounded-full bg-white/[0.04]">
                      {g.value === null ? (
                        <span className="absolute inset-0 bg-[repeating-linear-gradient(135deg,var(--gt-wash)_0_2px,transparent_2px_9px)]" />
                      ) : (
                        <>
                          <span
                            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400/60 to-cyan-200 shadow-[0_0_18px_-2px_var(--gt-glow-cyan)]"
                            style={{ width: `${w}%` }}
                          />
                          {g.lowerBound && (
                            <span
                              className="absolute inset-y-0 rounded-r-full bg-[repeating-linear-gradient(135deg,var(--gt-ring-cyan)_0_2px,transparent_2px_7px)]"
                              style={{ left: `${w}%`, width: `${Math.min(14, 100 - w)}%` }}
                            />
                          )}
                        </>
                      )}
                    </span>
                    <span aria-hidden className="flex items-baseline justify-end gap-3">
                      <span className={`font-instrument text-2xl leading-none ${g.value === null ? "text-white/30" : "text-white"}`}>{fmtFigure(fig)}</span>
                      <span className="font-jetbrains text-label text-white/45">
                        {g.measured}/{g.publications}
                        {dryN ? ` · ${dryN} dry` : ""}
                      </span>
                    </span>
                  </div>
                );
              })}
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}

function SortHead({
  label,
  k,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  return (
    <th scope="col" className={`font-jetbrains px-3 py-3 text-label font-normal tracking-[0.16em] text-white/40 uppercase ${className}`}>
      <button type="button" onClick={() => onSort(sort === k ? "published" : k)} aria-pressed={sort === k} className={`uppercase transition hover:text-white ${sort === k ? "text-cyan-200" : ""}`}>
        {label}
      </button>
    </th>
  );
}

/** Nothing published yet: the table's shape, three rows deep, and the one
 *  command that fills it from a terminal. */
function EmptyReturns() {
  const line = "npx tsx pipeline/publish.mts metrics --json";
  return (
    <div className="space-y-4" data-testid="calendar-metrics-empty">
      <p className="sr-only">No publications yet</p>
      <Panel className="overflow-hidden">
        <div aria-hidden className="divide-y divide-white/[0.05]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5" style={{ opacity: 1 - i * 0.28 }}>
              <span className="aspect-video w-24 rounded-lg bg-gradient-to-br from-white/[0.07] to-transparent" />
              <span className="space-y-2">
                <span className="block h-3 w-52 rounded-full bg-white/[0.08]" />
                <span className="block h-2 w-28 rounded-full bg-white/[0.05]" />
              </span>
              <span className="ml-auto flex gap-8">
                {[0, 1, 2, 3, 4].map((j) => (
                  <span key={j} className="font-jetbrains text-content text-white/20">
                    —
                  </span>
                ))}
              </span>
              <svg viewBox="0 0 132 34" width="132" height="34" className="text-white/10">
                {[10, 14, 12, 20, 18, 26, 30].map((h, j) => (
                  <rect key={j} x={4 + j * 18} y={32 - h} width={11} height={h} rx={1.5} fill="currentColor" />
                ))}
              </svg>
            </div>
          ))}
        </div>
      </Panel>
      <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5">
        <SquareTerminal aria-hidden className="h-4 w-4 text-cyan-300/80" />
        <code className="font-jetbrains grow text-label text-white/75">{line}</code>
        <CopyButton text={line} label="Copy metrics command" />
      </div>
    </div>
  );
}
