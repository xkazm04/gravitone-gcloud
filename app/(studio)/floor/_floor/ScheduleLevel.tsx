"use client";

// THE SCHEDULE SHEET over the Floor (v1 app/calendar/Composer.tsx's door, Phase 6 L63): a level
// sheet holding @gt/ui floor/ScheduleForm over the calendar port's `schedule` verb. It opens from
// the month (the bar's Schedule, or a selected day's - that day is the form's date) and from a
// Library item's Schedule act (`/floor?cal=1&new=1&item=<id>`, ./model.ts scheduleHref), which
// picks that item.
//
// The exports are read when the sheet opens (port.items), not with the Floor: most Floor renders
// never schedule anything. A send is disarmed synchronously (a ref), so a second press before
// the re-render cannot make a second slot (async-ui-states action-busy-states); the engine's
// refusal is drawn verbatim in the form and the draft is kept. A slot that lands closes the
// sheet onto its own record, so the operator sees what was made, and the Floor re-reads.

import { useEffect, useRef, useState } from "react";

import type { RailSlot } from "@gt/ui/components/floor/calendar.ts";
import { ScheduleForm, type ScheduleItems } from "@gt/ui/components/floor/ScheduleForm.tsx";
import type { ScheduleDraft } from "@gt/ui/components/floor/schedule.ts";
import { LevelSheet } from "@gt/ui/components/sheet/LevelSheet.tsx";

import { useShell } from "../../_shell/Providers.tsx";
import type { CalendarFacts, CalendarPort } from "../_calendar/contract.ts";
import { settle } from "./settle.ts";

export type ScheduleLevelProps = {
  readonly port: CalendarPort;
  readonly facts: CalendarFacts;
  readonly slots: readonly RailSlot[];
  readonly nowMs: number;
  readonly day: string | null;
  readonly item: string | null;
  readonly onClose: () => void;
  readonly onFloor: () => void;
  /** A slot landed: open its record. */
  readonly onMade: (slotId: string) => void;
};

export function ScheduleLevel({ port, facts, slots, nowMs, day, item, onClose, onFloor, onMade }: ScheduleLevelProps) {
  const { toast } = useShell();
  const [items, setItems] = useState<ScheduleItems>({ kind: "reading" });
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  const armed = useRef(false);

  useEffect(() => {
    let live = true;
    void settle(port.items()).then((r) => {
      if (live) setItems(r.ok ? { kind: "read", items: r.value } : { kind: "failed", error: r.error.error });
    });
    return () => {
      live = false;
    };
  }, [port]);

  const send = (draft: ScheduleDraft): void => {
    if (armed.current) return;
    armed.current = true;
    setBusy(true);
    setRefusal(undefined);
    void settle(port.schedule(draft)).then((r) => {
      armed.current = false;
      setBusy(false);
      if (!r.ok) {
        setRefusal(r.error.error);
        return;
      }
      toast(`${r.value.slot.title} · scheduled`, { href: r.value.ledger, subject: r.value.slot.id });
      onMade(r.value.slot.id);
    });
  };

  return (
    <LevelSheet trail={[{ label: "Floor", onPress: onFloor }, { label: "Calendar", onPress: onClose }]} here="Schedule" mode="schedule" back="Calendar" onClose={onClose}>
      <ScheduleForm items={items} channels={facts.channels} slots={slots} nowMs={nowMs} day={day} item={item} lastChannel={facts.lastChannel} busy={busy} {...(refusal === undefined ? {} : { refusal })} onSchedule={send} />
    </LevelSheet>
  );
}
