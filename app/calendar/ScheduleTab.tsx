"use client";

// The Schedule tab: the broadcast week (./BroadcastWeek.tsx) over ONE data
// hook (useCalendar) — a time grid, drag to move, the composer and the slot
// sheet beside it. The week won round 2 over a channel runway and an editorial
// agenda (the operator's pick, 2026-10-05,
// .vault/Spark/briefs/platform-consolidation/); this file keeps what the
// prototypes shared — the toasts a move or cancel answers with, the preset an
// empty hour hands the composer — so the week stays layout.

import { useState } from "react";

import type { Publication, ScheduleSlot } from "@/lib/publish/types";

import { BroadcastWeek } from "./BroadcastWeek";
import { CHANNEL_NAME, dateTimeLabel } from "./calendarModel";
import type { Preset } from "./Composer";
import type { Fetched } from "./publishClient";
import { FailureCard, type PushToast } from "./ui";
import { useProjectChoices, type Calendar, type ProjectChoice } from "./useCalendar";

/** What the week is handed. */
export interface ScheduleProps {
  cal: Calendar;
  slots: ScheduleSlot[];
  now: number;
  projects: ProjectChoice[] | null;
  selectedId: string | null;
  select: (id: string | null) => void;
  preset: Preset | undefined;
  prefill: (p: Omit<Preset, "nonce">) => void;
  move: (s: ScheduleSlot, at: string) => Promise<Fetched<{ slot: ScheduleSlot }>>;
  cancel: (s: ScheduleSlot) => Promise<Fetched<{ slot: ScheduleSlot }>>;
  created: (s: ScheduleSlot) => void;
  publicationOf: (s: ScheduleSlot) => Publication | null;
}

export function ScheduleTab({ cal, now, push }: { cal: Calendar; now: number | null; push: PushToast }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset | undefined>(undefined);
  const projects = useProjectChoices();

  if (!cal.schedule || now === null) return <ScheduleLoading />;
  if (!cal.schedule.ok) return <FailureCard r={cal.schedule} onRetry={cal.reload} />;

  const slots = cal.schedule.data.slots;
  const pubs = cal.metrics?.ok ? cal.metrics.data.publications : [];

  const report = (verb: string, r: Fetched<{ slot: ScheduleSlot }>) => {
    if (r.ok)
      push({
        tone: "ok",
        text: `${verb} · ${r.data.slot.title} · ${CHANNEL_NAME[r.data.slot.channelId]} · ${dateTimeLabel(r.data.slot.publishAt)}`,
      });
    else push({ tone: "failed", text: `${verb} refused · ${r.status || "network"} · ${r.error}`, sticky: true });
    return r;
  };

  const props: ScheduleProps = {
    cal,
    slots,
    now,
    projects,
    selectedId: slots.some((s) => s.id === selectedId) ? selectedId : null,
    select: setSelectedId,
    preset,
    prefill: (p) => setPreset((cur) => ({ ...p, nonce: (cur?.nonce ?? 0) + 1 })),
    move: async (s, at) => report("moved", await cal.move(s, at)),
    cancel: async (s) => report("cancelled", await cal.cancel(s)),
    created: (s) => {
      setSelectedId(s.id);
      push({ tone: "ok", text: `scheduled · ${s.title} · ${CHANNEL_NAME[s.channelId]} · ${dateTimeLabel(s.publishAt)}` });
    },
    publicationOf: (s) => (s.publicationId ? (pubs.find((p) => p.id === s.publicationId) ?? null) : null),
  };

  return (
    <div className="space-y-4">
      {cal.exports && !cal.exports.ok && <FailureCard r={cal.exports} onRetry={cal.reload} />}
      <BroadcastWeek {...props} />
    </div>
  );
}

/** First read in flight: the page's shape, breathing. */
function ScheduleLoading() {
  return (
    <div aria-busy="true" aria-label="Loading schedule" className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
      <div className="h-[44rem] animate-pulse rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.04] to-white/[0.01]" />
      <div className="h-[44rem] animate-pulse rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.04] to-white/[0.01]" />
    </div>
  );
}
