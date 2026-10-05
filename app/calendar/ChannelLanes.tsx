"use client";

// V2 · CHANNEL LANES — one row per channel, four weeks laid out left to right.
// A slot is a mark at its instant (calendarModel.laneFraction); marks that
// would overlap stack onto a second line rather than hide one another. A
// not_wired channel keeps its lane, hatched and locked, so the absence of
// TikTok and Instagram is drawn rather than omitted.

import { useState } from "react";

import { Lock } from "lucide-react";

import { Button } from "@/components/ui/Primitives";
import { Hint, Tally } from "@/components/ui/signal";
import type { ChannelId, ChannelReadiness, ScheduleSlot } from "@/lib/publish/types";

import {
  CHANNEL_IDS,
  CHANNEL_NAME,
  STATUS_WORD,
  dateTimeLabel,
  dayKey,
  dayLabel,
  daysFrom,
  laneFraction,
  rangeLabel,
  weekStart,
} from "./calendarModel";
import { Badge, CHANNEL_STATUS_TONE, CHANNEL_STATUS_WORD, STATUS_SKIN, SlotState } from "./parts";

const SPAN = 28;
/** A mark is drawn two days wide; two marks closer than that share no line. */
const MARK = 2 / SPAN;

/** Greedy line assignment: each mark takes the first line whose last mark ends
 *  before it starts. */
function stack(marks: { s: ScheduleSlot; f: number }[]): { s: ScheduleSlot; f: number; line: number }[] {
  const ends: number[] = [];
  return marks.map((m) => {
    let line = ends.findIndex((e) => e <= m.f);
    if (line === -1) line = ends.length;
    ends[line] = m.f + MARK;
    return { ...m, line };
  });
}

export function ChannelLanes({
  slots,
  channels,
  now,
  selectedId,
  onSelect,
}: {
  slots: readonly ScheduleSlot[];
  channels: readonly ChannelReadiness[] | null;
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const today = new Date(now);
  const start = weekStart(today, offset * 4);
  const days = daysFrom(start, SPAN);
  const todayKey = dayKey(today);
  const nowF = laneFraction(today.toISOString(), start, SPAN);
  const lanes: { id: ChannelId; ch: ChannelReadiness | null }[] = CHANNEL_IDS.map((id) => ({
    id,
    ch: channels?.find((c) => c.id === id) ?? null,
  }));
  const inView = slots.filter((s) => laneFraction(s.publishAt, start, SPAN) !== null).length;

  return (
    <section aria-label="Channel lanes" className="space-y-3" data-testid="calendar-lanes">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOffset((o) => o - 1)} aria-label="Previous four weeks">
          ‹
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOffset(0)} aria-pressed={offset === 0}>
          Now
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOffset((o) => o + 1)} aria-label="Next four weeks">
          ›
        </Button>
        <span className="font-jetbrains ml-2 text-label text-white/85">{rangeLabel(start, SPAN)}</span>
        <Tally value={inView} label="slots" />
      </div>

      <div className="scroll-x overflow-x-auto rounded-xl border border-white/10">
        <div className="min-w-[72rem]">
          {/* the ruler: the four weeks named on top, a day number under each column */}
          <div className="grid grid-cols-[11rem_1fr] border-b border-white/10">
            <div />
            <div aria-hidden>
              <div className="grid grid-cols-4">
                {[0, 1, 2, 3].map((w) => (
                  <div key={w} className="font-jetbrains border-l border-white/20 px-2 pt-2 text-label text-white/85">
                    {rangeLabel(days[w * 7], 7)}
                  </div>
                ))}
              </div>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${SPAN}, minmax(0, 1fr))` }}>
                {days.map((d) => {
                  const k = dayKey(d);
                  return (
                    <div
                      key={k}
                      className={`font-jetbrains border-l px-1 pb-1.5 text-center text-label ${
                        d.getDay() === 1 ? "border-white/20" : "border-white/[0.05]"
                      } ${k === todayKey ? "text-cyan-200" : "text-white/55"}`}
                    >
                      {d.getDate()}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {lanes.map(({ id, ch }) => {
            const locked = ch?.status === "not_wired";
            const marks = stack(
              slots
                .filter((s) => s.channelId === id)
                .map((s) => ({ s, f: laneFraction(s.publishAt, start, SPAN) }))
                .filter((m): m is { s: ScheduleSlot; f: number } => m.f !== null)
                .sort((a, b) => a.f - b.f || a.s.id.localeCompare(b.s.id)),
            );
            const lines = Math.max(1, ...marks.map((m) => m.line + 1));
            return (
              <div
                key={id}
                className="grid grid-cols-[11rem_1fr] border-b border-white/[0.06] last:border-b-0"
                data-testid={`calendar-lane-${id}`}
              >
                <div className="flex flex-col justify-center gap-1 border-r border-white/10 px-3 py-2">
                  <span className="font-hanken text-content text-white">{ch?.name ?? CHANNEL_NAME[id]}</span>
                  <span className="inline-flex items-center gap-1">
                    {ch ? (
                      <Badge tone={CHANNEL_STATUS_TONE[ch.status]}>
                        {locked && <Lock className="h-3.5 w-3.5" aria-hidden />}
                        {CHANNEL_STATUS_WORD[ch.status]}
                      </Badge>
                    ) : (
                      <Badge>unknown</Badge>
                    )}
                    {locked && ch?.note && (
                      <Hint variant="lock" label={`Why ${ch.name} is locked`}>
                        {ch.note}
                      </Hint>
                    )}
                  </span>
                </div>
                <div
                  className={`relative ${locked ? "text-white/[0.07]" : ""}`}
                  style={{ height: `${lines * 3.25 + 0.75}rem` }}
                  role="list"
                  aria-label={`${CHANNEL_NAME[id]} slots`}
                >
                  {/* day lines */}
                  <div aria-hidden className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${SPAN}, minmax(0, 1fr))` }}>
                    {days.map((d) => (
                      <div key={dayKey(d)} className={`border-l ${d.getDay() === 1 ? "border-white/15" : "border-white/[0.04]"}`} />
                    ))}
                  </div>
                  {locked && (
                    <div
                      aria-hidden
                      className="absolute inset-0"
                      style={{ backgroundImage: "repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 10px)" }}
                    />
                  )}
                  {nowF !== null && (
                    <div aria-hidden className="absolute inset-y-0 w-px bg-cyan-300/70" style={{ left: `${nowF * 100}%` }} />
                  )}
                  {marks.map(({ s, f, line }) => (
                    <div key={s.id} role="listitem" className="absolute" style={{ left: `${Math.min(f, 1 - MARK) * 100}%`, top: `${line * 3.25 + 0.375}rem`, width: `${MARK * 100}%` }}>
                      <button
                        type="button"
                        onClick={() => onSelect(s.id)}
                        aria-pressed={selectedId === s.id}
                        aria-label={`${s.title}, ${dateTimeLabel(s.publishAt)}, ${STATUS_WORD[s.status]}`}
                        data-testid={`calendar-lane-slot-${s.id}`}
                        className={`flex h-12 w-full min-w-0 flex-col items-start justify-center rounded-md border px-2 text-left text-label ${STATUS_SKIN[s.status]} ${
                          selectedId === s.id ? "ring-2 ring-cyan-300/70" : ""
                        }`}
                      >
                        <span className="font-jetbrains flex items-center gap-1 whitespace-nowrap">
                          <SlotState status={s.status} word={false} />
                          {dayLabel(new Date(s.publishAt)).date}
                        </span>
                        <span className="font-hanken w-full truncate">{s.title}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
