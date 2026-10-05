"use client";

// V3 · AGENDA — what can go out on the left, what is set to go out on the
// right. StatReel's slotGroups (apps/studio/src/calendar.ts) re-cut to this
// engine's statuses: Needs decision is missed or failed, Upcoming is scheduled
// or publishing, History is published or cancelled, newest first. An export
// opens the schedule form in place; a slot opens its panel in place.

import { useState } from "react";

import { Tally, Ghost } from "@/components/ui/signal";
import type { ScheduleSlot } from "@/lib/publish/types";

import { CHANNEL_NAME, dateTimeLabel, fmtBytes, relWhen, slotGroups } from "./calendarModel";
import { STATUS_SKIN, SlotState, basename } from "./parts";
import type { ChannelList, ExportList, Fetched, NewSlot } from "./publishClient";
import { ScheduleForm } from "./ScheduleForm";
import { SlotPanel } from "./SlotPanel";
import type { Load, ProjectChoice } from "./useCalendar";

const EMPTY: Record<string, string> = {
  decide: "nothing waits on a decision",
  upcoming: "nothing upcoming",
  history: "no history yet",
};

export function Agenda({
  slots,
  exports,
  channels,
  now,
  projects,
  selectedId,
  onSelect,
  onMove,
  onCancel,
  onCreate,
  onCreated,
}: {
  slots: readonly ScheduleSlot[];
  exports: Load<ExportList>;
  channels: Load<ChannelList>;
  now: number;
  projects: ProjectChoice[] | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (slot: ScheduleSlot, publishAt: string) => Promise<Fetched<{ slot: ScheduleSlot }>>;
  onCancel: (slot: ScheduleSlot) => Promise<Fetched<{ slot: ScheduleSlot }>>;
  onCreate: (body: NewSlot) => Promise<Fetched<{ slot: ScheduleSlot }>>;
  onCreated: (slot: ScheduleSlot) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const list = exports?.ok ? exports.data.exports : [];
  const groups = slotGroups(slots);
  const onCal = (exportId: string) => slots.filter((s) => s.exportId === exportId && s.status !== "cancelled").length;

  return (
    <div className="grid gap-6 lg:grid-cols-[26rem_minmax(0,1fr)]" data-testid="calendar-agenda">
      <section aria-labelledby="agenda-exports" className="space-y-3">
        <h2 id="agenda-exports" className="font-jetbrains flex items-center gap-2 text-label tracking-[0.14em] text-white/70 uppercase">
          Ready exports
          {exports?.ok && <Tally value={list.length} />}
        </h2>
        {exports?.ok && list.length === 0 && (
          <ScheduleForm exports={exports} channels={channels} slots={slots} now={now} projects={projects} onCreate={onCreate} onDone={onCreated} />
        )}
        <ul className="space-y-2">
          {list.map((x) => {
            const open = picked === x.id;
            const n = onCal(x.id);
            return (
              <li key={x.id} className="rounded-xl border border-white/10 bg-white/[0.02]">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setPicked(open ? null : x.id)}
                  className="flex w-full flex-col items-start gap-1 px-3 py-2.5 text-left hover:bg-white/[0.03]"
                  data-testid={`calendar-export-${x.id}`}
                >
                  <span className="font-jetbrains flex w-full items-center gap-2 text-label text-white">
                    <span className="truncate">{basename(x.path)}</span>
                    <span className="ml-auto shrink-0">
                      <Tally value={n} label="on cal" tone={n > 0 ? "cyan" : "neutral"} />
                    </span>
                  </span>
                  <span className="font-jetbrains text-label text-white/60">
                    {x.projectId ?? "no project"} · {fmtBytes(x.bytes)} · {relWhen(x.createdAt, now)}
                  </span>
                </button>
                {open && (
                  <div className="border-t border-white/10 p-3">
                    <ScheduleForm
                      key={x.id}
                      exports={exports}
                      channels={channels}
                      slots={slots}
                      now={now}
                      projects={projects}
                      presetExportId={x.id}
                      onCreate={onCreate}
                      onDone={(s) => {
                        setPicked(null);
                        onCreated(s);
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`agenda-${g.key}`} className="space-y-2" data-testid={`calendar-group-${g.key}`}>
            <h2 id={`agenda-${g.key}`} className="font-jetbrains flex items-center gap-2 text-label tracking-[0.14em] text-white/70 uppercase">
              {g.label}
              <Tally value={g.slots.length} tone={g.key === "decide" && g.slots.length > 0 ? "rose" : "neutral"} />
            </h2>
            {g.slots.length === 0 ? (
              <Ghost shape="row" count={1} label={EMPTY[g.key]} />
            ) : (
              <ul className="space-y-1.5">
                {g.slots.map((s) => {
                  const open = selectedId === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => onSelect(open ? null : s.id)}
                        data-testid={`calendar-agenda-slot-${s.id}`}
                        className={`grid w-full grid-cols-[12rem_9rem_minmax(0,1fr)_7rem] items-center gap-3 rounded-lg border px-3 py-2 text-left text-label ${STATUS_SKIN[s.status]} ${
                          open ? "ring-2 ring-cyan-300/70" : ""
                        }`}
                      >
                        <span className="font-jetbrains">
                          {dateTimeLabel(s.publishAt)}
                          <span className="block opacity-75">{relWhen(s.publishAt, now)}</span>
                        </span>
                        <SlotState status={s.status} />
                        <span className="font-hanken min-w-0">
                          <span className="block truncate text-content">{s.title}</span>
                          {s.error && <span className="font-jetbrains block truncate opacity-85">{s.error}</span>}
                        </span>
                        <span className="font-jetbrains text-right">{CHANNEL_NAME[s.channelId]}</span>
                      </button>
                      {open && (
                        <div className="mt-1.5">
                          <SlotPanel key={s.id} slot={s} now={now} onMove={onMove} onCancel={onCancel} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
