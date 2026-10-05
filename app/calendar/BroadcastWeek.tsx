"use client";

// V1 · BROADCAST WEEK — seven local days down a twenty-four-hour axis, StatReel's
// week (apps/studio/src/routes/Calendar.tsx WeekView :614-697) drawn as a
// broadcast schedule: every slot a card with its film's own frame on it, a
// now-line across today, the hours already gone washed back.
//
// Drag a card to another day or minute (15-minute snap; the landing card says
// the time before the drop) and it PATCHes through useCalendar.move, which
// moves it at once and snaps it back if the engine refuses. A press opens the
// slot sheet beside the grid — the keyboard path to the same move. A press on
// an empty hour hands that hour to the composer.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/components/ui/motionPreference";
import { Panel } from "@/components/ui/Primitives";
import { Tally } from "@/components/ui/signal";
import { EASE } from "@/components/ui/tokens";
import type { ScheduleSlot } from "@/lib/publish/types";

import {
  CHANNEL_NAME,
  STATUS_WORD,
  bucketByDay,
  canMove,
  dayKey,
  dayLabel,
  daysFrom,
  rangeLabel,
  timeLabel,
  toLocalInput,
  weekStart,
} from "./calendarModel";
import { Composer } from "./Composer";
import { Poster } from "./poster";
import type { ScheduleProps } from "./ScheduleTab";
import { SlotSheet } from "./SlotSheet";
import { ChannelGlyph, IconButton, LOOK, StatusDot, TONE_RULE, lookOf } from "./ui";
import { usePointerDrag } from "./useDrag";
import { atMinute, minuteOfDay, packLanes } from "./view";
import { whenWords } from "./WhenPicker";

const HOUR_H = 48;
const CARD_H = 72;
const SPAN_MIN = (CARD_H / HOUR_H) * 60;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const p2 = (n: number) => String(n).padStart(2, "0");

interface Landing {
  iso: string;
  col: number;
  minutes: number;
  past: boolean;
}

export function BroadcastWeek(p: ScheduleProps) {
  const { slots, now, selectedId, select, prefill } = p;
  const reduced = usePrefersReducedMotion();
  const [offset, setOffset] = useState(0);
  const scroller = useRef<HTMLDivElement | null>(null);
  const cols = useRef<HTMLDivElement | null>(null);

  const today = new Date(now);
  const start = weekStart(today, offset);
  const days = daysFrom(start, 7);
  const byDay = bucketByDay(slots, start);
  const inWeek = [...byDay.values()].flat();
  const todayKey = dayKey(today);
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const todayCol = days.findIndex((d) => dayKey(d) === todayKey);
  const selected = slots.find((s) => s.id === selectedId) ?? null;

  const counts = {
    scheduled: inWeek.filter((s) => s.status === "scheduled" || s.status === "publishing").length,
    missed: inWeek.filter((s) => s.status === "missed" || s.status === "failed").length,
    published: inWeek.filter((s) => s.status === "published").length,
  };

  // Open on the working day: 07:00 at the top, or the week's earliest slot
  // when one sits before it (a missed 05:56 slot scrolled out of sight is the
  // one card that most needs seeing). A DOM write, no state.
  const firstMin = Math.min(7 * 60, ...inWeek.map((s) => minuteOfDay(s.publishAt) ?? 7 * 60));
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, (firstMin / 60) * HOUR_H - 16);
  }, [firstMin, offset]);

  const { drag, bind, endedDrag } = usePointerDrag<ScheduleSlot, Landing>({
    canDrag: canMove,
    resolve: (s, ptr) => {
      const el = cols.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const col = Math.floor(((ptr.x - r.left) / r.width) * 7);
      if (col < 0 || col > 6) return null;
      const m0 = minuteOfDay(s.publishAt) ?? 0;
      const iso = atMinute(days[col], m0 + ((ptr.y - ptr.y0) / HOUR_H) * 60, 15);
      return { iso, col, minutes: minuteOfDay(iso) ?? 0, past: new Date(iso).getTime() < now };
    },
    onDrop: (s, at) => {
      if (!at.past && at.iso !== s.publishAt) void p.move(s, at.iso);
    },
  });

  const pickHour = (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const iso = atMinute(day, ((e.clientY - r.top) / HOUR_H) * 60 - 15, 30);
    if (new Date(iso).getTime() < now) return;
    select(null);
    prefill({ when: toLocalInput(new Date(iso)) });
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <Panel as="section" className="overflow-hidden" >
        <div className="flex flex-wrap items-center gap-3 border-b border-white/6 px-5 py-3.5" data-testid="calendar-week">
          <div className="flex items-center gap-1.5">
            <IconButton label="Previous week" onClick={() => setOffset((o) => o - 1)}>
              <ChevronLeft aria-hidden className="h-4 w-4" />
            </IconButton>
            <IconButton label="Next week" onClick={() => setOffset((o) => o + 1)}>
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
            This week
          </button>
          <h2 className="font-instrument ml-1 text-2xl leading-none text-white">{rangeLabel(start)}</h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Tally value={counts.scheduled} label="booked" tone={counts.scheduled ? "cyan" : "neutral"} />
            <Tally value={counts.missed} label="missed" tone={counts.missed ? "amber" : "neutral"} />
            <Tally value={counts.published} label="aired" tone={counts.published ? "emerald" : "neutral"} />
          </div>
        </div>

        <div
          ref={scroller}
          className="scroll-y relative h-[min(72vh,50rem)] overflow-y-auto"
          aria-label={`Week of ${rangeLabel(start)}`}
          tabIndex={0}
        >
          {/* day header, pinned */}
          <div className="sticky top-0 z-20 grid grid-cols-[4.25rem_repeat(7,minmax(0,1fr))] border-b border-white/8 bg-[var(--gt-ink)]/90 backdrop-blur-xl">
            <span aria-hidden />
            {days.map((d) => {
              const k = dayKey(d);
              const l = dayLabel(d);
              const isToday = k === todayKey;
              const n = byDay.get(k)?.length ?? 0;
              return (
                <div key={k} className="relative flex items-end gap-2 border-l border-white/6 px-3 pt-2.5 pb-2">
                  <span
                    className={`font-instrument text-3xl leading-none ${
                      isToday ? "text-cyan-200 [text-shadow:0_0_18px_var(--gt-glow-cyan)]" : k < todayKey ? "text-white/40" : "text-white/90"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  <span className={`font-jetbrains pb-0.5 text-label tracking-[0.14em] uppercase ${isToday ? "text-cyan-200/80" : "text-white/40"}`}>
                    {l.dow}
                  </span>
                  {n > 0 && (
                    <span aria-label={`${n} slots`} className="font-jetbrains ml-auto pb-0.5 text-label text-white/40">
                      {n}
                    </span>
                  )}
                  {isToday && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-cyan-300 shadow-[0_0_12px_var(--gt-glow-cyan)]" />}
                </div>
              );
            })}
          </div>

          <div className="relative grid grid-cols-[4.25rem_minmax(0,1fr)]">
            {/* hour gutter */}
            <div aria-hidden className="relative" style={{ height: 24 * HOUR_H }}>
              {HOURS.map((h) =>
                h === 0 || (todayCol >= 0 && Math.abs(nowMin - h * 60) < 30) ? null : (
                  <span
                    key={h}
                    className="font-jetbrains absolute right-3 -translate-y-1/2 text-label text-white/30 tabular-nums"
                    style={{ top: h * HOUR_H }}
                  >
                    {p2(h)}:00
                  </span>
                ),
              )}
              {todayCol >= 0 && (
                <span
                  className="font-jetbrains absolute right-1.5 z-10 -translate-y-1/2 rounded-full bg-cyan-300 px-1.5 text-label font-semibold text-slate-950 tabular-nums shadow-[0_0_14px_var(--gt-glow-cyan)]"
                  style={{ top: (nowMin / 60) * HOUR_H }}
                >
                  {p2(today.getHours())}:{p2(today.getMinutes())}
                </span>
              )}
            </div>

            <div
              ref={cols}
              className="relative grid grid-cols-7 bg-[repeating-linear-gradient(to_bottom,var(--gt-hairline)_0_1px,transparent_1px_48px)]"
              style={{ height: 24 * HOUR_H }}
            >
              {days.map((d, col) => {
                const k = dayKey(d);
                const isToday = k === todayKey;
                const pastDay = k < todayKey;
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                const placed = packLanes(byDay.get(k) ?? [], (s) => minuteOfDay(s.publishAt) ?? 0, SPAN_MIN);
                return (
                  <div
                    key={k}
                    onClick={(e) => {
                      if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.hour !== undefined) pickHour(d, e);
                    }}
                    className={`relative border-l border-white/6 ${isToday ? "bg-cyan-400/[0.035]" : weekend ? "bg-white/[0.012]" : ""}`}
                  >
                    {/* the hours already gone */}
                    {(pastDay || isToday) && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 bg-[repeating-linear-gradient(135deg,var(--gt-wash)_0_1px,transparent_1px_11px)] bg-[var(--gt-ink)]/30"
                        style={{ height: pastDay ? "100%" : (nowMin / 60) * HOUR_H }}
                      />
                    )}
                    {/* empty hours take a click: the composer gets that hour */}
                    {HOURS.map((h) =>
                      pastDay || (isToday && (h + 1) * 60 <= nowMin) ? null : (
                        <div
                          key={h}
                          data-hour={h}
                          aria-hidden
                          className="group/h absolute inset-x-0 cursor-copy"
                          style={{ top: h * HOUR_H, height: HOUR_H }}
                        >
                          <span className="font-jetbrains pointer-events-none absolute top-1.5 left-2 rounded-md border border-cyan-300/25 bg-cyan-400/10 px-1.5 text-label text-cyan-100 opacity-0 transition group-hover/h:opacity-100">
                            + {p2(h)}:00
                          </span>
                        </div>
                      ),
                    )}

                    {placed.map(({ item: s, lane, lanes }, i) => (
                      <SlotCard
                        key={s.id}
                        slot={s}
                        index={i + col}
                        reduced={reduced}
                        top={((minuteOfDay(s.publishAt) ?? 0) / 60) * HOUR_H}
                        left={`calc(${(lane / lanes) * 100}% + 4px)`}
                        width={`calc(${100 / lanes}% - 8px)`}
                        narrow={lanes > 1}
                        selected={s.id === selectedId}
                        dragging={drag?.item.id === s.id}
                        handlers={bind(s)}
                        onPress={() => {
                          if (endedDrag()) return;
                          select(s.id === selectedId ? null : s.id);
                        }}
                      />
                    ))}

                    {drag?.at && drag.at.col === col && <LandingCard slot={drag.item} at={drag.at} />}
                  </div>
                );
              })}

              {/* the now-line: faint across the week, lit across today */}
              {todayCol >= 0 && (
                <>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-[4] h-px bg-cyan-300/20"
                    style={{ top: (nowMin / 60) * HOUR_H }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute z-[4] h-0.5 bg-cyan-300 shadow-[0_0_14px_var(--gt-glow-cyan)]"
                    style={{ top: (nowMin / 60) * HOUR_H - 1, left: `${(todayCol / 7) * 100}%`, width: `${100 / 7}%` }}
                  >
                    <span className="absolute -top-[5px] -left-[5px] h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_12px_var(--gt-glow-cyan)]" />
                  </span>
                </>
              )}

              {inWeek.length === 0 && <EmptyWeek />}
            </div>
          </div>
        </div>
      </Panel>

      <Panel as="aside" className="space-y-5 p-5 xl:sticky xl:top-4" >
        {selected ? (
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
          <>
            <div className="flex items-baseline gap-3">
              <h2 className="font-instrument text-2xl leading-none text-white">Schedule</h2>
              {p.preset?.when && (
                <span className="font-jetbrains text-label text-cyan-200/80">{whenWords(new Date(p.preset.when))}</span>
              )}
            </div>
            <Composer
              exports={p.cal.exports}
              channels={p.cal.channels}
              slots={slots}
              now={now}
              projects={p.projects}
              preset={p.preset}
              onCreate={p.cal.create}
              onDone={p.created}
            />
          </>
        )}
      </Panel>
    </div>
  );
}

function SlotCard({
  slot: s,
  index,
  reduced,
  top,
  left,
  width,
  narrow,
  selected,
  dragging,
  handlers,
  onPress,
}: {
  slot: ScheduleSlot;
  narrow: boolean;
  index: number;
  reduced: boolean;
  top: number;
  left: string;
  width: string;
  selected: boolean;
  dragging: boolean;
  handlers: ReturnType<ReturnType<typeof usePointerDrag<ScheduleSlot, Landing>>["bind"]>;
  onPress: () => void;
}) {
  const look = lookOf(s);
  const l = LOOK[look];
  const movable = canMove(s);
  const ring = selected
    ? "border-cyan-200/80 shadow-[0_0_0_2px_var(--gt-ring-cyan),0_14px_40px_-12px_var(--gt-glow-cyan)]"
    : l.tone === "amber"
      ? "border-amber-300/60"
      : l.tone === "rose"
        ? "border-rose-400/55"
        : "border-white/12 hover:border-white/30";
  return (
    <motion.button
      type="button"
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: dragging ? 0.35 : 1, y: 0 }}
      transition={{ duration: 0.24, delay: reduced ? 0 : Math.min(index, 12) * 0.025, ease: EASE }}
      {...handlers}
      onClick={onPress}
      aria-pressed={selected}
      aria-label={`${s.title}, ${CHANNEL_NAME[s.channelId]}, ${timeLabel(s.publishAt)}, ${look === "drifted" ? "drifted" : STATUS_WORD[s.status]}`}
      data-testid={`calendar-week-slot-${s.id}`}
      className={`group absolute z-[5] touch-none overflow-hidden rounded-xl border text-left transition-[border-color,box-shadow] ${ring} ${
        movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${s.status === "cancelled" ? "opacity-60" : ""}`}
      style={{ top: top + 2, left, width, height: CARD_H - 4 }}
    >
      <Poster exportId={s.exportId} dim={s.status === "cancelled"} className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]" />
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[var(--gt-ink)]/95 from-15% via-[var(--gt-ink)]/55 via-55% to-transparent" />
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${TONE_RULE[l.tone]}`} />
      {!narrow && <StatusDot slot={s} className="absolute top-1.5 right-1.5" />}
      <span className="absolute inset-x-2.5 bottom-1.5 flex flex-col gap-0.5">
        <span className="font-jetbrains flex items-center gap-1.5 text-label leading-none text-white/90">
          <ChannelGlyph id={s.channelId} className="h-3.5 w-3.5 shrink-0" />
          {timeLabel(s.publishAt)}
        </span>
        <span className={`font-hanken text-label leading-tight text-white ${narrow ? "truncate" : "line-clamp-2"} ${s.status === "cancelled" ? "line-through" : ""}`}>
          {s.title || s.id}
        </span>
      </span>
    </motion.button>
  );
}

/** Where a dragged card will land, and when — before the drop. */
function LandingCard({ slot, at }: { slot: ScheduleSlot; at: Landing }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-1 z-30 overflow-hidden rounded-xl border-2 backdrop-blur-sm ${
        at.past ? "border-rose-400/70 bg-rose-400/10" : "border-cyan-200/80 bg-cyan-400/12 shadow-[0_18px_50px_-14px_var(--gt-glow-cyan)]"
      }`}
      style={{ top: (at.minutes / 60) * HOUR_H + 2, height: CARD_H - 4 }}
    >
      <Poster exportId={slot.exportId} className="absolute inset-0 opacity-30" />
      <span
        className={`font-jetbrains absolute top-1.5 left-2 rounded-md px-1.5 text-label font-semibold whitespace-nowrap ${
          at.past ? "bg-rose-400 text-slate-950" : "bg-cyan-300 text-slate-950"
        }`}
      >
        {at.past ? "past" : `${dayLabel(new Date(at.iso)).dow} ${new Date(at.iso).getDate()} · ${timeLabel(at.iso)}`}
      </span>
    </div>
  );
}

/** No slot this week: the week keeps its shape, and three soft cards sit where
 *  a week's slots would. */
function EmptyWeek() {
  const ghosts = [
    { col: 1, min: 12 * 60 },
    { col: 3, min: 18 * 60 + 30 },
    { col: 5, min: 10 * 60 },
  ];
  return (
    <>
      <p className="sr-only">No slots this week</p>
      {ghosts.map((g) => (
        <span
          key={g.col}
          aria-hidden
          className="pointer-events-none absolute overflow-hidden rounded-xl border border-white/[0.09] bg-gradient-to-br from-white/[0.05] to-white/[0.01]"
          style={{ top: (g.min / 60) * HOUR_H + 2, height: CARD_H - 4, left: `calc(${(g.col / 7) * 100}% + 4px)`, width: `calc(${100 / 7}% - 8px)` }}
        >
          <span className="absolute inset-y-0 left-0 w-[3px] bg-white/15" />
          <span className="absolute bottom-3 left-3 block h-2 w-12 rounded-full bg-white/[0.12]" />
          <span className="absolute bottom-7 left-3 block h-2 w-20 rounded-full bg-white/[0.08]" />
          <span className="absolute top-2 right-2 block h-5 w-5 rounded-full border border-white/10" />
        </span>
      ))}
    </>
  );
}
