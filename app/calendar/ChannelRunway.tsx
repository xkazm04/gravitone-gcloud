"use client";

// V2 · CHANNEL RUNWAY — rows are channels, the x-axis is time: a week in close
// (`Days`), four in the long view (`Weeks`). StatReel's per-channel lanes
// (apps/studio/src/routes/Calendar.tsx ChannelLanes) re-drawn as a runway: each
// wired channel a lit lane its slots ride on, each not_wired channel a LOCKED
// lane that shows what it is missing — the credential names the engine reports,
// present or absent — instead of an empty strip.
//
// A card drags along its own lane (half-hour snap close in, whole days far out;
// a channel change is a new slot, not a move). A press opens the drawer; a press
// on an open stretch of a wired lane opens the composer at that channel and
// hour. Under the runway, "on deck": what needs a decision, then what airs next.

import { ChevronLeft, ChevronRight, Lock, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/components/ui/motionPreference";
import { Panel } from "@/components/ui/Primitives";
import { Tally } from "@/components/ui/signal";
import { EASE } from "@/components/ui/tokens";
import type { ChannelId, ChannelReadiness, ScheduleSlot } from "@/lib/publish/types";

import {
  CHANNEL_IDS,
  CHANNEL_NAME,
  STATUS_WORD,
  canMove,
  dayKey,
  daysFrom,
  laneFraction,
  rangeLabel,
  relWhen,
  slotGroups,
  timeLabel,
  toLocalInput,
  weekStart,
} from "./calendarModel";
import { Composer } from "./Composer";
import { Poster } from "./poster";
import type { ScheduleProps } from "./ScheduleTab";
import { SlotSheet } from "./SlotSheet";
import { ChannelStatusChip, ChannelTile, IconButton, LOOK, OnImage, Pills, StatusChip, StatusDot, TONE_RULE, lookOf } from "./ui";
import { usePointerDrag } from "./useDrag";
import { atFraction, onDay, packLanes } from "./view";
import { whenWords } from "./WhenPicker";

type Zoom = "days" | "weeks";
const SPAN: Record<Zoom, number> = { days: 7, weeks: 28 };
/** card footprint on the track, px */
const CARD_W: Record<Zoom, number> = { days: 224, weeks: 62 };
const ROW_H: Record<Zoom, number> = { days: 72, weeks: 70 };
const LANE_PAD = 22;

interface Landing {
  iso: string;
  f: number;
  past: boolean;
}

export function ChannelRunway(p: ScheduleProps) {
  const { slots, now, selectedId, select, prefill } = p;
  const reduced = usePrefersReducedMotion();
  const [zoom, setZoom] = useState<Zoom>("days");
  const [offset, setOffset] = useState(0);
  const [composing, setComposing] = useState(false);
  const [trackW, setTrackW] = useState(1280);
  const track = useRef<HTMLDivElement | null>(null);

  // the track's width decides where cards collide; measured, not guessed
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setTrackW(Math.max(320, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = SPAN[zoom];
  const today = new Date(now);
  const start = weekStart(today, offset * (zoom === "weeks" ? 4 : 1));
  const days = daysFrom(start, n);
  const todayKey = dayKey(today);
  const nowF = laneFraction(today.toISOString(), start, n);
  const chans: ChannelReadiness[] = p.cal.channels?.ok
    ? p.cal.channels.data.channels
    : CHANNEL_IDS.map((id) => ({ id, name: CHANNEL_NAME[id], status: "not_wired", env: [], cli: [] }));
  const inWindow = slots.filter((s) => laneFraction(s.publishAt, start, n) !== null);
  const selected = slots.find((s) => s.id === selectedId) ?? null;
  const drawer = selected ? "slot" : composing ? "compose" : null;

  const { drag, bind, endedDrag } = usePointerDrag<ScheduleSlot, Landing>({
    canDrag: canMove,
    resolve: (s, ptr) => {
      const f0 = laneFraction(s.publishAt, start, n);
      if (f0 === null) return null;
      const f = f0 + (ptr.x - ptr.x0) / trackW;
      let iso: string;
      if (zoom === "days") iso = atFraction(start, n, f, 30);
      else {
        const idx = Math.max(0, Math.min(n - 1, Math.floor(f * n)));
        iso = onDay(s.publishAt, days[idx]);
      }
      const fl = laneFraction(iso, start, n) ?? f;
      return { iso, f: fl, past: new Date(iso).getTime() < now };
    },
    onDrop: (s, at) => {
      if (!at.past && at.iso !== s.publishAt) void p.move(s, at.iso);
    },
  });

  const openAt = (c: ChannelReadiness, e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    const iso =
      zoom === "days"
        ? atFraction(start, n, f, 60)
        : onDay(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18).toISOString(), days[Math.floor(f * n)] ?? days[0]);
    if (new Date(iso).getTime() < now) return;
    select(null);
    prefill({ channelId: c.id, when: toLocalInput(new Date(iso)) });
    setComposing(true);
  };

  const groups = slotGroups(slots);
  const onDeck = [...groups[0].slots, ...groups[1].slots].slice(0, 6);

  return (
    <div className="space-y-5">
      <Panel as="section" className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/6 px-5 py-3.5">
          <div className="flex items-center gap-1.5">
            <IconButton label={zoom === "days" ? "Previous week" : "Previous four weeks"} onClick={() => setOffset((o) => o - 1)}>
              <ChevronLeft aria-hidden className="h-4 w-4" />
            </IconButton>
            <IconButton label={zoom === "days" ? "Next week" : "Next four weeks"} onClick={() => setOffset((o) => o + 1)}>
              <ChevronRight aria-hidden className="h-4 w-4" />
            </IconButton>
          </div>
          <button
            type="button"
            onClick={() => setOffset(0)}
            aria-pressed={offset === 0}
            className={`font-jetbrains rounded-full border px-3 py-1 text-label transition ${
              offset === 0 ? "border-cyan-300/35 bg-cyan-400/10 text-cyan-100" : "border-white/10 text-white/60 hover:text-white"
            }`}
          >
            Now
          </button>
          <h2 className="font-instrument ml-1 text-2xl leading-none text-white">{rangeLabel(start, n)}</h2>
          <Tally value={inWindow.length} label="slots" />
          <div className="ml-auto flex items-center gap-3">
            <Pills
              label="Zoom"
              value={zoom}
              onChange={(z) => {
                setZoom(z);
                setOffset(0);
              }}
              options={[
                { value: "days", label: "Days" },
                { value: "weeks", label: "Weeks" },
              ]}
            />
            <button
              type="button"
              onClick={() => {
                select(null);
                setComposing(true);
              }}
              className="font-jetbrains inline-flex items-center gap-1.5 rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3.5 py-1.5 text-label text-cyan-50 transition hover:bg-cyan-400/20"
              data-testid="calendar-runway-compose"
            >
              <Plus aria-hidden className="h-4 w-4" />
              Schedule
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[15.5rem_minmax(0,1fr)]" data-testid="calendar-lanes">
          {/* axis */}
          <div className="border-b border-white/6 px-5 py-3">
            <span className="font-jetbrains text-label tracking-[0.18em] text-white/35 uppercase">channel</span>
          </div>
          <div ref={track} className="relative grid border-b border-white/6" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
            {days.map((d) => {
              const k = dayKey(d);
              const isToday = k === todayKey;
              const monday = d.getDay() === 1;
              return (
                <div key={k} className={`relative px-2 py-2 ${monday || zoom === "days" ? "border-l border-white/8" : ""}`}>
                  {zoom === "days" ? (
                    <span className="flex items-baseline gap-2">
                      <span className={`font-instrument text-2xl leading-none ${isToday ? "text-cyan-200" : k < todayKey ? "text-white/35" : "text-white/85"}`}>
                        {d.getDate()}
                      </span>
                      <span className={`font-jetbrains text-label tracking-[0.14em] uppercase ${isToday ? "text-cyan-200/80" : "text-white/40"}`}>
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]}
                      </span>
                    </span>
                  ) : (
                    <span className={`font-jetbrains block text-center text-label tabular-nums ${isToday ? "text-cyan-200" : monday ? "text-white/70" : "text-white/30"}`}>
                      {d.getDate()}
                    </span>
                  )}
                  {isToday && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-cyan-300 shadow-[0_0_12px_var(--gt-glow-cyan)]" />}
                </div>
              );
            })}
          </div>

          {chans.map((c) => (
            <Lane
              key={c.id}
              c={c}
              zoom={zoom}
              n={n}
              days={days}
              start={start}
              todayKey={todayKey}
              nowF={nowF}
              trackW={trackW}
              slots={slots.filter((s) => s.channelId === c.id)}
              selectedId={selectedId}
              reduced={reduced}
              dragId={drag?.item.id ?? null}
              landing={drag?.item.channelId === c.id ? drag.at : null}
              dragItem={drag?.item ?? null}
              bind={bind}
              onPress={(s) => {
                if (endedDrag()) return;
                setComposing(false);
                select(s.id === selectedId ? null : s.id);
              }}
              onOpenAt={(e) => openAt(c, e)}
            />
          ))}
        </div>
      </Panel>

      <section aria-labelledby="ondeck-h" className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 id="ondeck-h" className="font-instrument text-2xl leading-none text-white">
            On deck
          </h2>
          <Tally value={groups[0].slots.length} label="decide" tone={groups[0].slots.length ? "amber" : "neutral"} />
          <Tally value={groups[1].slots.length} label="upcoming" tone={groups[1].slots.length ? "cyan" : "neutral"} />
          <span aria-hidden className="h-px grow bg-gradient-to-r from-white/10 to-transparent" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
          {onDeck.length === 0
            ? [0, 1, 2].map((i) => (
                <span key={i} aria-hidden className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                  <span className="block aspect-video bg-gradient-to-br from-white/[0.05] to-transparent" />
                  <span className="m-3 block h-2.5 w-28 rounded-full bg-white/[0.08]" />
                </span>
              ))
            : onDeck.map((s, i) => (
                <motion.button
                  key={s.id}
                  type="button"
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26, delay: reduced ? 0 : i * 0.04, ease: EASE }}
                  onClick={() => {
                    setComposing(false);
                    select(s.id);
                  }}
                  aria-pressed={s.id === selectedId}
                  className={`group overflow-hidden rounded-2xl border bg-white/[0.02] text-left transition ${
                    s.id === selectedId
                      ? "border-cyan-300/50 shadow-[0_0_0_1px_var(--gt-ring-cyan)]"
                      : LOOK[lookOf(s)].tone === "amber"
                        ? "border-amber-300/35 hover:border-amber-300/60"
                        : "border-white/8 hover:border-white/20"
                  }`}
                >
                  <span className="relative block aspect-video overflow-hidden">
                    <Poster exportId={s.exportId} fit="contain" className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.03]" />
                    <span className="absolute top-2 left-2">
                      <OnImage>
                        <StatusChip slot={s} />
                      </OnImage>
                    </span>
                  </span>
                  <span className="block space-y-1 px-3 py-2.5">
                    <span className="font-hanken block truncate text-content text-white">{s.title || s.id}</span>
                    <span className="font-jetbrains block truncate text-label text-white/50">
                      {CHANNEL_NAME[s.channelId]} · {whenWords(new Date(s.publishAt))} · {relWhen(s.publishAt, now)}
                    </span>
                  </span>
                </motion.button>
              ))}
        </div>
      </section>

      <AnimatePresence>
        {drawer && (
          <motion.aside
            key="drawer"
            aria-label={drawer === "slot" ? "Slot" : "Schedule"}
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: 28 }}
            transition={{ duration: 0.24, ease: EASE }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setComposing(false);
                select(null);
              }
            }}
            className="gt-float scroll-y fixed top-24 right-4 bottom-20 z-40 w-[27rem] overflow-y-auto rounded-2xl border border-white/10 bg-[var(--gt-ink)]/88 p-5 backdrop-blur-2xl"
          >
            {drawer === "slot" && selected ? (
              <SlotSheet
                key={selected.id}
                slot={selected}
                now={now}
                projects={p.projects}
                publication={p.publicationOf(selected)}
                onMove={p.move}
                onCancel={p.cancel}
                onClose={() => select(null)}
              />
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <h2 className="font-instrument grow text-2xl leading-none text-white">Schedule</h2>
                  <IconButton label="Close" onClick={() => setComposing(false)}>
                    <X aria-hidden className="h-4 w-4" />
                  </IconButton>
                </div>
                <Composer
                  exports={p.cal.exports}
                  channels={p.cal.channels}
                  slots={slots}
                  now={now}
                  projects={p.projects}
                  preset={p.preset}
                  onCreate={p.cal.create}
                  onDone={(s) => {
                    setComposing(false);
                    p.created(s);
                  }}
                />
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function Lane({
  c,
  zoom,
  n,
  days,
  start,
  todayKey,
  nowF,
  trackW,
  slots,
  selectedId,
  reduced,
  dragId,
  dragItem,
  landing,
  bind,
  onPress,
  onOpenAt,
}: {
  c: ChannelReadiness;
  zoom: Zoom;
  n: number;
  days: Date[];
  start: Date;
  todayKey: string;
  nowF: number | null;
  trackW: number;
  slots: ScheduleSlot[];
  selectedId: string | null;
  reduced: boolean;
  dragId: string | null;
  dragItem: ScheduleSlot | null;
  landing: Landing | null;
  bind: ReturnType<typeof usePointerDrag<ScheduleSlot, Landing>>["bind"];
  onPress: (s: ScheduleSlot) => void;
  onOpenAt: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const locked = c.status === "not_wired";
  const shown = slots.filter((s) => laneFraction(s.publishAt, start, n) !== null);
  const placed = packLanes(shown, (s) => (laneFraction(s.publishAt, start, n) ?? 0) * trackW, CARD_W[zoom] + 8);
  const rows = Math.max(1, ...placed.map((x) => x.lane + 1));
  const height = locked ? 120 : Math.max(zoom === "days" ? 132 : 112, LANE_PAD * 2 + rows * ROW_H[zoom]);
  const set = c.env.filter((e) => e.present).length;
  const active = slots.filter((s) => s.status === "scheduled" || s.status === "publishing").length;
  const decide = slots.filter((s) => LOOK[lookOf(s)].tone === "amber" || s.status === "failed").length;

  return (
    <>
      <div className="flex items-center gap-3.5 border-b border-white/6 px-5" style={{ height }} data-testid={`calendar-lane-${c.id}`}>
        <ChannelTile id={c.id} status={c.status} size="lg" />
        <div className="min-w-0 space-y-1.5">
          <p className={`font-instrument text-2xl leading-none ${locked ? "text-white/55" : "text-white"}`}>{c.name}</p>
          <div className="flex flex-col items-start gap-1.5">
            <ChannelStatusChip status={c.status} />
            {!locked && (
              <span className="font-jetbrains flex items-center gap-2 text-label" aria-label={`${active} booked, ${decide} to decide`}>
                <span aria-hidden className="inline-flex items-center gap-1 text-cyan-200/80">
                  <LOOK.scheduled.Icon className="h-3.5 w-3.5" />
                  {active}
                </span>
                {decide > 0 && (
                  <span aria-hidden className="inline-flex items-center gap-1 text-amber-200/90">
                    <LOOK.missed.Icon className="h-3.5 w-3.5" />
                    {decide}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        onClick={(e) => {
          if (!locked && e.target === e.currentTarget) onOpenAt(e);
        }}
        className={`relative overflow-hidden border-b border-white/6 ${
          locked
            ? "bg-[repeating-linear-gradient(135deg,var(--gt-wash)_0_1px,transparent_1px_12px)]"
            : "cursor-copy bg-gradient-to-r from-cyan-400/[0.05] via-cyan-400/[0.015] to-transparent"
        }`}
        style={{ height }}
      >
        {/* day rules and the past, behind everything */}
        <div aria-hidden className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
          {days.map((d) => {
            const k = dayKey(d);
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <span
                key={k}
                className={`${zoom === "days" || d.getDay() === 1 ? "border-l border-white/[0.06]" : ""} ${k < todayKey ? "bg-[var(--gt-ink)]/35" : weekend ? "bg-white/[0.012]" : ""}`}
              />
            );
          })}
        </div>
        {nowF !== null && (
          <>
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 bg-[var(--gt-ink)]/25" style={{ width: `${nowF * 100}%` }} />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-cyan-300 shadow-[0_0_14px_var(--gt-glow-cyan)]"
              style={{ left: `${nowF * 100}%` }}
            />
          </>
        )}

        {locked ? (
          <div className="absolute inset-0 flex items-center gap-4 px-6">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-[var(--gt-ink)]/70 text-white/55 backdrop-blur">
              <Lock aria-hidden className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1.5 rounded-xl bg-[var(--gt-ink)]/55 px-3 py-2 backdrop-blur">
              {c.note && <p className="font-hanken truncate text-content text-white/70">{c.note}</p>}
              <ul aria-label={`${c.name} credentials, ${set} of ${c.env.length} set`} className="flex flex-wrap gap-x-4 gap-y-1">
                {c.env.map((e) => (
                  <li key={e.name} className="font-jetbrains flex items-center gap-1.5 text-label text-white/55">
                    <span
                      aria-hidden
                      className={`h-2 w-2 rounded-full ${e.present ? "bg-emerald-300" : "border border-white/40"}`}
                    />
                    {e.name}
                    <span className="sr-only">{e.present ? "set" : "absent"}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <>
            {/* the rail the slots ride on */}
            <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-3 h-px bg-gradient-to-r from-cyan-300/40 via-cyan-300/15 to-transparent" />
            {placed.map(({ item: s, lane }, i) => {
              const f = laneFraction(s.publishAt, start, n) ?? 0;
              return (
                <RunwayCard
                  key={s.id}
                  slot={s}
                  zoom={zoom}
                  index={i}
                  reduced={reduced}
                  x={f * trackW}
                  y={LANE_PAD + lane * ROW_H[zoom]}
                  trackW={trackW}
                  selected={s.id === selectedId}
                  dragging={dragId === s.id}
                  handlers={bind(s)}
                  onPress={() => onPress(s)}
                />
              );
            })}
            {shown.length === 0 && c.status !== "not_wired" && <EmptyLane zoom={zoom} />}
            {landing && dragItem && (
              <div
                aria-hidden
                className={`pointer-events-none absolute z-30 -translate-x-3 rounded-xl border-2 px-2 py-1 ${
                  landing.past ? "border-rose-400/70 bg-rose-400/15" : "border-cyan-200/80 bg-cyan-400/15 shadow-[0_14px_40px_-12px_var(--gt-glow-cyan)]"
                }`}
                style={{ left: landing.f * trackW, top: 6 }}
              >
                <span className={`font-jetbrains text-label font-semibold ${landing.past ? "text-rose-100" : "text-cyan-50"}`}>
                  {landing.past ? "past" : whenWords(new Date(landing.iso))}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function RunwayCard({
  slot: s,
  zoom,
  index,
  reduced,
  x,
  y,
  trackW,
  selected,
  dragging,
  handlers,
  onPress,
}: {
  slot: ScheduleSlot;
  zoom: Zoom;
  trackW: number;
  index: number;
  reduced: boolean;
  x: number;
  y: number;
  selected: boolean;
  dragging: boolean;
  handlers: ReturnType<ReturnType<typeof usePointerDrag<ScheduleSlot, Landing>>["bind"]>;
  onPress: () => void;
}) {
  const look = lookOf(s);
  const l = LOOK[look];
  const ring = selected
    ? "border-cyan-200/80 shadow-[0_0_0_2px_var(--gt-ring-cyan),0_14px_40px_-12px_var(--gt-glow-cyan)]"
    : l.tone === "amber"
      ? "border-amber-300/60"
      : l.tone === "rose"
        ? "border-rose-400/60"
        : "border-white/12 hover:border-white/30";
  const label = `${s.title}, ${CHANNEL_NAME[s.channelId as ChannelId]}, ${whenWords(new Date(s.publishAt))}, ${look === "drifted" ? "drifted" : STATUS_WORD[s.status]}`;
  return (
    <motion.button
      type="button"
      initial={reduced ? false : { opacity: 0, y: y + 6 }}
      animate={{ opacity: dragging ? 0.35 : 1, y }}
      transition={{ duration: 0.24, delay: reduced ? 0 : Math.min(index, 10) * 0.03, ease: EASE }}
      {...handlers}
      onClick={onPress}
      aria-pressed={selected}
      aria-label={label}
      data-testid={`calendar-lane-slot-${s.id}`}
      className={`group absolute top-0 z-[5] touch-none overflow-hidden rounded-xl border bg-[var(--gt-ink)]/70 text-left backdrop-blur transition-[border-color,box-shadow] ${ring} ${
        canMove(s) ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${s.status === "cancelled" ? "opacity-55" : ""}`}
      style={{ left: Math.max(2, Math.min(trackW - CARD_W[zoom] - 2, x - (zoom === "days" ? 10 : CARD_W.weeks / 2))), width: CARD_W[zoom] - 4, height: ROW_H[zoom] - 8 }}
    >
      {zoom === "days" ? (
        <span className="flex h-full items-center gap-2.5 pr-2.5">
          <span className="relative h-full w-[5.5rem] shrink-0 overflow-hidden">
            <Poster exportId={s.exportId} dim={s.status === "cancelled"} className="absolute inset-0" />
            <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${TONE_RULE[l.tone]}`} />
          </span>
          <span className="min-w-0 flex-1 space-y-1">
            <span className="font-jetbrains flex items-center gap-1.5 text-label leading-none text-white/85">
              <l.Icon aria-hidden className={`h-3.5 w-3.5 ${look === "scheduled" ? "text-cyan-300" : look === "published" ? "text-emerald-300" : look === "cancelled" ? "text-white/40" : look === "failed" ? "text-rose-300" : "text-amber-300"}`} />
              {timeLabel(s.publishAt)}
            </span>
            <span className={`font-hanken block truncate text-label leading-tight text-white ${s.status === "cancelled" ? "line-through" : ""}`}>
              {s.title || s.id}
            </span>
          </span>
        </span>
      ) : (
        <span className="relative block h-full">
          <Poster exportId={s.exportId} dim={s.status === "cancelled"} className="absolute inset-0" />
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[var(--gt-ink)]/85 to-transparent" />
          <StatusDot slot={s} className="absolute top-1 right-1 scale-90" />
          <span className="font-jetbrains absolute inset-x-1 bottom-1 text-center text-label leading-none text-white/90">{timeLabel(s.publishAt)}</span>
        </span>
      )}
    </motion.button>
  );
}

/** A wired lane with nothing in view: the rail stays lit, three soft cards
 *  sit where slots would. */
function EmptyLane({ zoom }: { zoom: Zoom }) {
  return (
    <>
      <span className="sr-only">No slots in view</span>
      {[0.18, 0.46, 0.74].map((f) => (
        <span
          key={f}
          aria-hidden
          className="pointer-events-none absolute flex items-center gap-2 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]"
          style={{ left: `${f * 100}%`, top: LANE_PAD, width: CARD_W[zoom] - 4, height: ROW_H[zoom] - 8 }}
        >
          {zoom === "days" && <span className="h-full w-[5.5rem] bg-gradient-to-br from-white/[0.06] to-transparent" />}
          <span className="space-y-1.5">
            <span className="block h-2 w-10 rounded-full bg-white/[0.1]" />
            {zoom === "days" && <span className="block h-2 w-20 rounded-full bg-white/[0.07]" />}
          </span>
        </span>
      ))}
    </>
  );
}
