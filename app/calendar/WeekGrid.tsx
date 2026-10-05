"use client";

// V1 · WEEK GRID — seven local days by twenty-four hours, StatReel's week
// (apps/studio/src/routes/Calendar.tsx WeekView :614-697) given an hour axis so
// a slot can be DRAGGED to another day and hour. The drop keeps the slot's own
// minutes (calendarModel.dropTarget) and PATCHes through useCalendar.move, which
// moves the block at once and snaps it back if the engine refuses.
//
// The drag is the mouse path. The keyboard path is the same move through the
// slot panel: every block is a button that opens it.

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Primitives";
import { Tally } from "@/components/ui/signal";
import type { ScheduleSlot } from "@/lib/publish/types";

import {
  CHANNEL_NAME,
  bucketByCell,
  canMove,
  cellKey,
  dayKey,
  dayLabel,
  daysFrom,
  dropTarget,
  rangeLabel,
  timeLabel,
  weekStart,
  STATUS_WORD,
} from "./calendarModel";
import { STATUS_SKIN, SlotState } from "./parts";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const p2 = (n: number) => String(n).padStart(2, "0");

export function WeekGrid({
  slots,
  now,
  selectedId,
  onSelect,
  onMove,
}: {
  slots: readonly ScheduleSlot[];
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (slot: ScheduleSlot, publishAt: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [over, setOver] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  const today = new Date(now);
  const start = weekStart(today, offset);
  const days = daysFrom(start, 7);
  const cells = bucketByCell(slots, start);
  const count = [...cells.values()].reduce((a, l) => a + l.length, 0);
  const todayKey = dayKey(today);
  const nowHour = today.getHours();

  // Open on the working day, not on midnight: the 07:00 row at the top, or
  // the week's earliest slot when one sits before it (a missed 05:56 slot
  // scrolled out of sight is the one block that most needs seeing). A DOM
  // write in an effect, no state — nothing re-renders.
  const firstHour = Math.min(7, ...[...cells.keys()].map((k) => Number(k.slice(-2))));
  useEffect(() => {
    const el = scroller.current;
    const row = el?.querySelector<HTMLElement>(`[data-hour="${p2(firstHour)}"]`);
    if (el && row) el.scrollTop = row.offsetTop - (el.querySelector<HTMLElement>("[data-head]")?.offsetHeight ?? 0);
  }, [firstHour, offset]);

  const byId = (id: string) => slots.find((s) => s.id === id);

  return (
    <section aria-label="Week" className="space-y-3" data-testid="calendar-week">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOffset((o) => o - 1)} aria-label="Previous week">
          ‹
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOffset(0)} aria-pressed={offset === 0}>
          This week
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOffset((o) => o + 1)} aria-label="Next week">
          ›
        </Button>
        <span className="font-jetbrains ml-2 text-label text-white/85">{rangeLabel(start)}</span>
        <Tally value={count} label="slots" />
      </div>

      <div
        ref={scroller}
        className="scroll-y relative max-h-[68vh] overflow-y-auto rounded-xl border border-white/10"
        tabIndex={0}
        aria-label={`Week of ${rangeLabel(start)}`}
      >
        <div className="grid min-w-[56rem] grid-cols-[4.5rem_repeat(7,minmax(0,1fr))]">
          <div data-head className="sticky top-0 z-10 border-b border-white/10 bg-[var(--gt-ink)]" />
            {days.map((d) => {
              const k = dayKey(d);
              const l = dayLabel(d);
              const isToday = k === todayKey;
              return (
                <div
                  key={k}
                  className={`font-jetbrains sticky top-0 z-10 border-b border-l border-white/10 bg-[var(--gt-ink)] px-2 py-2 text-label ${
                    isToday ? "text-cyan-200" : "text-white/80"
                  }`}
                >
                  <span className="uppercase">{l.dow}</span> {l.date}
                  {isToday && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-cyan-300 align-middle" aria-label="today" />}
                </div>
              );
            })}

          {HOURS.map((h) => (
            <div key={h} className="contents">
              <div data-hour={p2(h)} className="font-jetbrains border-b border-white/[0.06] px-2 pt-1 text-right text-label text-white/55">
                {p2(h)}:00
              </div>
              {days.map((d) => {
                const k = cellKey(d, h);
                const list = cells.get(k) ?? [];
                const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h + 1).getTime();
                const past = end <= now;
                const isNow = dayKey(d) === todayKey && h === nowHour;
                const hot = over === k && !past;
                return (
                  <div
                    key={k}
                    data-cell={k}
                    onDragOver={(e) => {
                      if (past || !dragId) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (over !== k) setOver(k);
                    }}
                    onDragLeave={() => over === k && setOver(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      const s = byId(e.dataTransfer.getData("text/plain") || dragId || "");
                      setOver(null);
                      setDragId(null);
                      if (!s || !canMove(s) || past) return;
                      const iso = dropTarget(s, d, h);
                      if (iso !== s.publishAt) onMove(s, iso);
                    }}
                    className={`min-h-14 space-y-1 border-b border-l border-white/[0.06] p-1 transition-colors ${
                      past ? "bg-white/[0.015]" : ""
                    } ${hot ? "bg-cyan-400/10 outline-1 -outline-offset-1 outline-cyan-300/60 outline-dashed" : ""} ${
                      isNow ? "border-t border-t-cyan-300/70" : ""
                    }`}
                  >
                    {list.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        draggable={canMove(s)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", s.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragId(s.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOver(null);
                        }}
                        onClick={() => onSelect(s.id)}
                        aria-pressed={selectedId === s.id}
                        aria-label={`${s.title}, ${CHANNEL_NAME[s.channelId]}, ${timeLabel(s.publishAt)}, ${STATUS_WORD[s.status]}`}
                        data-testid={`calendar-week-slot-${s.id}`}
                        className={`flex w-full flex-col items-start gap-0.5 rounded-md border px-2 py-1 text-left text-label ${STATUS_SKIN[s.status]} ${
                          selectedId === s.id ? "ring-2 ring-cyan-300/70" : ""
                        } ${canMove(s) ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${dragId === s.id ? "opacity-60" : ""}`}
                      >
                        <span className="font-jetbrains flex w-full items-center gap-1.5">
                          <SlotState status={s.status} word={false} />
                          {timeLabel(s.publishAt)}
                          <span className="ml-auto truncate opacity-80">{CHANNEL_NAME[s.channelId]}</span>
                        </span>
                        <span className="font-hanken w-full truncate">{s.title}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
