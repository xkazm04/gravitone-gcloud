"use client";

// THE BROADCAST WEEK — seven local days down a twenty-four-hour axis, StatReel's
// week (apps/studio/src/routes/Calendar.tsx WeekView :614-697) drawn as a
// broadcast schedule: every slot a card with its film's own frame on it, a
// now-line across today, the hours already gone washed back.
//
// Drag a card to another day or minute (15-minute snap; the landing card says
// the time before the drop) and it PATCHes through useCalendar.move, which
// moves it at once and snaps it back if the engine refuses. A press opens the
// slot sheet beside the grid — the keyboard path to the same move. A press on
// an empty hour hands that hour to the composer.
//
// Slots that share an hour STACK (./view.ts stackClusters): one card at full
// width — the one opened, else the one waiting on a decision, else the
// earliest — with the rest drawn as the edges of the cards behind it and
// counted on a `+N` that lists them.
//
// KEYS (./view.ts weekKey): `[` / `]` page the weeks, ← / → too while focus is
// in the week, `T` comes back to this week, `N` opens the next slot waiting on
// a decision — paging to its week and scrolling it into view — and Esc closes
// the opened slot. The week grid and its stacks are derived once per schedule
// and week, not on every pointer move of a drag or tick of the clock.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/components/ui/motionPreference";
import { Panel } from "@/components/ui/Primitives";
import { Keycaps, Tally, type KeyBinding } from "@/components/ui/signal";
import { EASE } from "@/components/ui/tokens";
import { overlayOpen, typing } from "@/lib/board/keys";
import type { ScheduleSlot } from "@/lib/publish/types";

import {
  CHANNEL_NAME,
  STATUS_WORD,
  bucketByDay,
  canMove,
  dayKey,
  dayLabel,
  daysFrom,
  needsDecision,
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
import { atMinute, minuteOfDay, nextWaiting, stackClusters, weekKey, weekOffsetOf } from "./view";
import { whenWords } from "./WhenPicker";

const HOUR_H = 48;
const CARD_H = 72;
const SPAN_MIN = (CARD_H / HOUR_H) * 60;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const p2 = (n: number) => String(n).padStart(2, "0");

const KEYS: KeyBinding[] = [
  { keys: ["[", "]"], does: "week" },
  { keys: ["←", "→"], does: "week (in grid)" },
  { keys: ["T"], does: "this week" },
  { keys: ["N"], does: "next to decide" },
  { keys: ["Esc"], does: "close slot" },
];

/** The day the week `offset` weeks from `now` starts, as "YYYY-MM-DD". */
const startKeyOf = (now: number, offset: number): string => dayKey(weekStart(new Date(now), offset));

/** The week from the day it starts ("YYYY-MM-DD"): its days, its slots by day,
 *  and each day's stacks. */
function weekGrid(slots: readonly ScheduleSlot[], startKey: string) {
  const [y, m, d] = startKey.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const days = daysFrom(start, 7);
  const byDay = bucketByDay(slots, start);
  const stacks = new Map(days.map((day) => [dayKey(day), stackClusters(byDay.get(dayKey(day)) ?? [], (s) => minuteOfDay(s.publishAt) ?? 0, SPAN_MIN)]));
  return { start, days, byDay, inWeek: [...byDay.values()].flat(), stacks };
}

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
  /** the stack whose `+N` list is open: `${dayKey}:${first slot id}` */
  const [opened, setOpened] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const cols = useRef<HTMLDivElement | null>(null);

  const today = new Date(now);
  const todayKey = dayKey(today);
  // The week's shape depends on the schedule and on which week it is, never on
  // the clock's minute or a drag's pointer: keyed on the day the week starts,
  // so the 30-second tick and every pointermove of a drag reuse it.
  const startKey = startKeyOf(now, offset);
  const { start, days, byDay, inWeek, stacks } = useMemo(() => weekGrid(slots, startKey), [slots, startKey]);
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

  // The opened slot, brought into view: `N` may have paged to its week and it
  // can sit above or below the scrolled hours. Runs after the scroll above.
  useEffect(() => {
    if (!selectedId) return;
    scroller.current?.querySelector(`[data-slot-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId, offset]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || typing(e.target) || overlayOpen()) return;
    const el = e.target as Element | null;
    // the date picker's popover and grid own their keys, arrows included
    if (el?.closest?.('[role="dialog"], [role="grid"]')) return;
    const act = weekKey(e, Boolean(el?.closest?.("[data-calendar-week]")));
    if (!act) return;
    if (act === "close") {
      if (!selectedId) return;
      select(null);
    } else if (act === "prev") setOffset((o) => o - 1);
    else if (act === "next") setOffset((o) => o + 1);
    else if (act === "today") setOffset(0);
    else {
      const s = nextWaiting(slots, selectedId, needsDecision);
      const off = s ? weekOffsetOf(s.publishAt, now) : null;
      if (!s || off === null) return;
      setOffset(off);
      select(s.id);
    }
    e.preventDefault();
  });
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        <div className="flex flex-wrap items-center gap-3 border-b border-white/6 px-5 py-3.5" data-testid="calendar-week" data-calendar-week>
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
            <Keycaps map={KEYS} label="Week keys" />
          </div>
        </div>

        <div
          ref={scroller}
          className="scroll-y relative h-[min(72vh,50rem)] overflow-y-auto"
          aria-label={`Week of ${rangeLabel(start)}`}
          tabIndex={0}
          data-calendar-week
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

                    {(stacks.get(k) ?? []).map((stack, i) => {
                      const s = stack.find((x) => x.id === selectedId) ?? stack.find(needsDecision) ?? stack[0];
                      const top = ((minuteOfDay(s.publishAt) ?? 0) / 60) * HOUR_H;
                      const key = `${k}:${stack[0].id}`;
                      return (
                        <div key={key}>
                          {stack.length > 1 && <StackEdges top={top} n={stack.length - 1} />}
                          <SlotCard
                            slot={s}
                            index={i + col}
                            reduced={reduced}
                            top={top}
                            selected={s.id === selectedId}
                            dragging={drag?.item.id === s.id}
                            handlers={bind(s)}
                            onPress={() => {
                              if (endedDrag()) return;
                              select(s.id === selectedId ? null : s.id);
                            }}
                          />
                          {stack.length > 1 && (
                            <StackMore
                              stack={stack}
                              front={s}
                              top={top}
                              alignRight={col >= 5}
                              open={opened === key}
                              onToggle={(on) => setOpened(on ? key : null)}
                              onPick={(id) => {
                                setOpened(null);
                                select(id);
                              }}
                            />
                          )}
                        </div>
                      );
                    })}

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
  selected,
  dragging,
  handlers,
  onPress,
}: {
  slot: ScheduleSlot;
  index: number;
  reduced: boolean;
  top: number;
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
      data-slot-id={s.id}
      className={`group absolute z-[5] touch-none overflow-hidden rounded-xl border text-left transition-[border-color,box-shadow] ${ring} ${
        movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${s.status === "cancelled" ? "opacity-60" : ""}`}
      style={{ top: top + 2, left: 4, right: 4, height: CARD_H - 4 }}
    >
      <Poster exportId={s.exportId} dim={s.status === "cancelled"} className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]" />
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[var(--gt-ink)]/95 from-15% via-[var(--gt-ink)]/55 via-55% to-transparent" />
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${TONE_RULE[l.tone]}`} />
      <StatusDot slot={s} className="absolute top-1.5 right-1.5" />
      <span className="absolute inset-x-2.5 bottom-1.5 flex flex-col gap-0.5">
        <span className="font-jetbrains flex items-center gap-1.5 text-label leading-none text-white/90">
          <ChannelGlyph id={s.channelId} className="h-3.5 w-3.5 shrink-0" />
          {timeLabel(s.publishAt)}
        </span>
        <span className={`font-hanken line-clamp-2 text-label leading-tight text-white ${s.status === "cancelled" ? "line-through" : ""}`}>
          {s.title || s.id}
        </span>
      </span>
    </motion.button>
  );
}

/** The cards behind a stack's front one: their top edges, one rule per card
 *  up to two, so a stack reads as a stack before its count is read. */
function StackEdges({ top, n }: { top: number; n: number }) {
  return (
    <>
      {Array.from({ length: Math.min(n, 2) }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute z-[4] rounded-xl border border-white/12 bg-gradient-to-b from-white/[0.08] to-white/[0.02]"
          style={{ top: top + 2 - 5 * (i + 1), left: 4 + 6 * (i + 1), right: 4 + 6 * (i + 1), height: CARD_H - 4 }}
        />
      ))}
    </>
  );
}

/** `+N` on a stack, and the list it opens: every slot in the stack, the front
 *  one marked; a press opens that slot's sheet and brings it to the front. */
function StackMore({
  stack,
  front,
  top,
  alignRight,
  open,
  onToggle,
  onPick,
}: {
  stack: ScheduleSlot[];
  front: ScheduleSlot;
  top: number;
  alignRight: boolean;
  open: boolean;
  onToggle: (open: boolean) => void;
  onPick: (id: string) => void;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement | null>(null);
  // A press anywhere else closes the list; so does Esc, from inside it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onToggle(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, onToggle]);
  const rest = stack.length - 1;
  return (
    <div
      ref={box}
      className="absolute z-[6]"
      style={{ top: top + 7, right: 36 }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          onToggle(false);
        }
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${rest} more ${rest === 1 ? "slot" : "slots"} at this hour`}
        onClick={() => onToggle(!open)}
        data-testid={`calendar-week-stack-${stack[0].id}`}
        className={`font-jetbrains inline-flex h-6 items-center rounded-full border px-2 text-label leading-none tabular-nums backdrop-blur transition ${
          open ? "border-cyan-200/70 bg-cyan-300 text-slate-950" : "border-white/25 bg-[var(--gt-ink)]/80 text-white/85 hover:border-white/50 hover:text-white"
        }`}
      >
        +{rest}
      </button>
      {open && (
        <ul
          id={id}
          aria-label="Slots at this hour"
          className="gt-rise absolute top-8 z-30 w-[17rem] space-y-1 rounded-2xl border border-white/10 bg-[var(--gt-ink)]/95 p-1.5 shadow-[0_24px_60px_-20px_var(--gt-glow-cyan)] backdrop-blur-xl"
          style={alignRight ? { right: -32 } : { left: -110 }}
        >
          {stack.map((s) => {
            const on = s.id === front.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={on || undefined}
                  onClick={() => onPick(s.id)}
                  data-testid={`calendar-week-stack-pick-${s.id}`}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                    on ? "bg-cyan-400/10 ring-1 ring-cyan-300/30" : "hover:bg-white/[0.05]"
                  }`}
                >
                  <ChannelGlyph id={s.channelId} className="h-4 w-4 shrink-0 text-white/75" />
                  <span className="font-jetbrains shrink-0 text-label text-white/70 tabular-nums">{timeLabel(s.publishAt)}</span>
                  <span className={`font-hanken min-w-0 flex-1 truncate text-label text-white/90 ${s.status === "cancelled" ? "line-through opacity-60" : ""}`}>
                    {s.title || s.id}
                  </span>
                  <StatusDot slot={s} className="shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
