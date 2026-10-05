"use client";

// The Schedule tab: three directional variants over ONE data hook
// (useCalendar), behind `?v=1|2|3` (components/ui/VariantSwitch — prototype
// only, deleted when the round's winner is consolidated). The form and the slot
// panel are the same components in all three; only the arrangement differs.

import { useState } from "react";

import { Loading } from "@/components/kit";
import { Ghost } from "@/components/ui/signal";
import { useVariant } from "@/components/ui/VariantSwitch";
import type { ScheduleSlot } from "@/lib/publish/types";
import type { PushToast } from "@/components/kit";

import { Agenda } from "./Agenda";
import { ChannelLanes } from "./ChannelLanes";
import { CHANNEL_NAME, dateTimeLabel } from "./calendarModel";
import { FetchFailure } from "./parts";
import type { Fetched } from "./publishClient";
import { ScheduleForm } from "./ScheduleForm";
import { SlotPanel } from "./SlotPanel";
import { useProjectChoices, type Calendar } from "./useCalendar";
import { WeekGrid } from "./WeekGrid";

export function ScheduleTab({ cal, now, push }: { cal: Calendar; now: number | null; push: (t: PushToast) => void }) {
  const [v] = useVariant();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const projects = useProjectChoices();

  if (!cal.schedule || now === null) return <Loading />;
  if (!cal.schedule.ok) return <FetchFailure r={cal.schedule} onRetry={cal.reload} />;

  const slots = cal.schedule.data.slots;
  const selected = slots.find((s) => s.id === selectedId) ?? null;

  const report = (verb: string, r: Fetched<{ slot: ScheduleSlot }>) => {
    if (r.ok)
      push({
        kind: "ok",
        text: `${verb} · ${r.data.slot.title} · ${CHANNEL_NAME[r.data.slot.channelId]} · ${dateTimeLabel(r.data.slot.publishAt)}`,
      });
    else push({ kind: "failed", text: `${verb} refused · ${r.status || "network"} · ${r.error}`, ttl: null });
    return r;
  };
  const move = async (s: ScheduleSlot, at: string) => report("moved", await cal.move(s, at));
  const cancel = async (s: ScheduleSlot) => report("cancelled", await cal.cancel(s));
  const created = (s: ScheduleSlot) => {
    setSelectedId(s.id);
    push({ kind: "ok", text: `scheduled · ${s.title} · ${CHANNEL_NAME[s.channelId]} · ${dateTimeLabel(s.publishAt)}` });
  };

  const panel = selected && (
    <SlotPanel key={selected.id} slot={selected} now={now} onMove={move} onCancel={cancel} onClose={() => setSelectedId(null)} />
  );
  const form = (
    <ScheduleForm exports={cal.exports} channels={cal.channels} slots={slots} now={now} projects={projects} onCreate={cal.create} onDone={created} />
  );
  const exportsFailed = cal.exports && !cal.exports.ok ? <FetchFailure r={cal.exports} onRetry={cal.reload} /> : null;

  if (v === 3) {
    return (
      <>
        {exportsFailed}
        <Agenda
          slots={slots}
          exports={cal.exports}
          channels={cal.channels}
          now={now}
          projects={projects}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMove={move}
          onCancel={cancel}
          onCreate={cal.create}
          onCreated={created}
        />
      </>
    );
  }

  if (v === 2) {
    return (
      <div className="space-y-6">
        <ChannelLanes
          slots={slots}
          channels={cal.channels?.ok ? cal.channels.data.channels : null}
          now={now}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <div>{panel ?? <Ghost shape="card" label="no slot selected" />}</div>
          <div className="space-y-3">
            {exportsFailed}
            {form}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <WeekGrid slots={slots} now={now} selectedId={selectedId} onSelect={setSelectedId} onMove={(s, at) => void move(s, at)} />
      <aside className="space-y-6" aria-label="Slot and schedule">
        {panel}
        {exportsFailed}
        {form}
      </aside>
    </div>
  );
}
