"use client";

// The Schedule tab: three directional variants over ONE data hook
// (useCalendar), behind `?v=1|2|3` (components/ui/VariantSwitch — prototype
// only, deleted when the round's winner is consolidated). The composer and the
// slot sheet are the same components in all three; the variants differ in how
// a week is LAID OUT and where those two live.
//
//   1 · Broadcast week   a time grid, drag to move, the composer beside it
//   2 · Channel runway   one lane per channel along weeks, a drawer for detail
//   3 · Editorial agenda the ready exports as a poster shelf, slots as a feed

import { useState } from "react";

import { useVariant } from "@/components/ui/VariantSwitch";
import type { Publication, ScheduleSlot } from "@/lib/publish/types";

import { BroadcastWeek } from "./BroadcastWeek";
import { CHANNEL_NAME, dateTimeLabel } from "./calendarModel";
import { ChannelRunway } from "./ChannelRunway";
import type { Preset } from "./Composer";
import { EditorialAgenda } from "./EditorialAgenda";
import type { Fetched } from "./publishClient";
import { FailureCard, type PushToast } from "./ui";
import { useProjectChoices, type Calendar, type ProjectChoice } from "./useCalendar";

/** What every schedule variant is handed. */
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
  const [v] = useVariant();
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
      {v === 3 ? <EditorialAgenda {...props} /> : v === 2 ? <ChannelRunway {...props} /> : <BroadcastWeek {...props} />}
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
