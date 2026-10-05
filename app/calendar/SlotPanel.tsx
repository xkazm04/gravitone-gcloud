"use client";

// ONE SLOT, OPENED: its facts verbatim, and the two things a person can do to it
// — move it, or take it off the calendar. Shared by all three schedule variants
// (the week grid's keyboard path to a move is this panel, not the drag).
//
// A missed slot's move field starts at the next full hour, not at its own past
// time (calendarModel.moveDefault). A cancel never deletes: the contract's
// DELETE sets status cancelled, so the slot stays in History.

import { useId, useState } from "react";

import { Chip, Chips, ErrorBox } from "@/components/kit";
import { Field, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Primitives";
import type { ScheduleSlot } from "@/lib/publish/types";

import { CHANNEL_NAME, canCancel, canMove, dateTimeLabel, fromLocalInput, moveDefault, relWhen } from "./calendarModel";
import { SlotState } from "./parts";
import type { Fetched } from "./publishClient";

type Act = (slot: ScheduleSlot) => Promise<Fetched<{ slot: ScheduleSlot }>>;

export function SlotPanel({
  slot,
  now,
  onMove,
  onCancel,
  onClose,
}: {
  slot: ScheduleSlot;
  now: number | null;
  onMove: (slot: ScheduleSlot, publishAt: string) => Promise<Fetched<{ slot: ScheduleSlot }>>;
  onCancel: Act;
  onClose?: () => void;
}) {
  const id = useId();
  const [when, setWhen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const whenValue = when ?? (now === null ? "" : moveDefault(slot, new Date(now)));
  const at = fromLocalInput(whenValue);

  const run = async (p: Promise<Fetched<{ slot: ScheduleSlot }>>) => {
    setBusy(true);
    setRefusal(null);
    const r = await p;
    setBusy(false);
    setConfirming(false);
    if (!r.ok) setRefusal(`${r.status || "network"} · ${r.error}`);
    else setWhen(null);
  };

  return (
    <section
      aria-labelledby={`${id}-h`}
      className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4"
      data-testid="calendar-slot-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <SlotState status={slot.status} />
          <h2 id={`${id}-h`} className="font-hanken text-content break-words text-white">
            {slot.title || slot.id}
          </h2>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close slot">
            ×
          </Button>
        )}
      </div>
      <Chips>
        <Chip name="channel">{CHANNEL_NAME[slot.channelId] ?? slot.channelId}</Chip>
        <Chip name="at">
          {dateTimeLabel(slot.publishAt)}
          {now !== null && ` · ${relWhen(slot.publishAt, now)}`}
        </Chip>
        <Chip name="export">{slot.exportId}</Chip>
        <Chip name="project">{slot.projectId || "none"}</Chip>
        {slot.tags.length > 0 && <Chip name="tags">{slot.tags.join(", ")}</Chip>}
        {slot.missedAt && (
          <Chip name="missed" tone="gold">
            {dateTimeLabel(slot.missedAt)}
          </Chip>
        )}
        {slot.publicationId && <Chip name="publication">{slot.publicationId}</Chip>}
      </Chips>
      {slot.description && <p className="font-hanken text-content whitespace-pre-wrap text-white/80">{slot.description}</p>}
      {slot.error && (
        <ErrorBox role="status">
          <span className="font-jetbrains">{slot.error}</span>
        </ErrorBox>
      )}

      {canMove(slot) && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (at) void run(onMove(slot, at));
          }}
        >
          <div className="min-w-56 grow">
            <Field label={slot.status === "scheduled" ? "Move to" : "Reschedule to"} htmlFor={`${id}-at`}>
              <TextInput
                id={`${id}-at`}
                type="datetime-local"
                value={whenValue}
                onChange={(e) => setWhen(e.target.value)}
                className="[color-scheme:dark]"
              />
            </Field>
          </div>
          <Button type="submit" size="sm" disabled={busy || !at} data-testid="calendar-slot-move">
            {slot.status === "scheduled" ? "Move" : slot.status === "failed" ? "Retry" : "Reschedule"}
          </Button>
        </form>
      )}

      {canCancel(slot) &&
        (confirming ? (
          <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Confirm cancel">
            <span className="font-jetbrains text-label text-white/75">status → cancelled · kept in History</span>
            <Button variant="danger" size="sm" disabled={busy} onClick={() => void run(onCancel(slot))} data-testid="calendar-slot-cancel-confirm">
              Cancel slot
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(true)} data-testid="calendar-slot-cancel">
            Cancel slot…
          </Button>
        ))}

      {refusal && <ErrorBox>{refusal}</ErrorBox>}
    </section>
  );
}
