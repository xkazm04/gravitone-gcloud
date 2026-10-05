"use client";

// ONE SLOT, OPENED: its poster, its facts verbatim, and the two things a person
// can do to it — move it, or take it off the calendar. Shared by all three
// schedule variants (the week grid's keyboard path to a move is this sheet,
// not the drag).
//
// A missed slot's move field starts at the next full hour, not at its own past
// time (calendarModel.moveDefault). A cancel never deletes: the contract's
// DELETE sets status cancelled, so the slot stays in History.

import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Primitives";
import { CHIP_CLASS, TALLY_TONE } from "@/components/ui/signal";
import type { Publication, ScheduleSlot } from "@/lib/publish/types";

import { CHANNEL_NAME, canCancel, canMove, dateTimeLabel, fromLocalInput, moveDefault, relWhen } from "./calendarModel";
import { Poster, aspectWord, usePoster } from "./poster";
import type { Fetched } from "./publishClient";
import { ChannelGlyph, OnImage, Refusal, StatusChip, lookOf } from "./ui";
import type { ProjectChoice } from "./useCalendar";
import { projectTitle, shortId } from "./view";
import { WhenPicker } from "./WhenPicker";

type Act = (slot: ScheduleSlot) => Promise<Fetched<{ slot: ScheduleSlot }>>;

export function SlotSheet({
  slot,
  now,
  projects,
  publication,
  onMove,
  onCancel,
  onClose,
  compact = false,
  align = "right",
}: {
  slot: ScheduleSlot;
  now: number | null;
  projects: ProjectChoice[] | null;
  /** the record a published slot left, when the metrics read has it */
  publication?: Publication | null;
  onMove: (slot: ScheduleSlot, publishAt: string) => Promise<Fetched<{ slot: ScheduleSlot }>>;
  onCancel: Act;
  onClose?: () => void;
  /** inline under an agenda row: no poster, no title — the row already has them */
  compact?: boolean;
  align?: "left" | "right";
}) {
  const [when, setWhen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const poster = usePoster(slot.exportId);
  const aspect = aspectWord(poster);

  const whenValue = when ?? (now === null ? "" : moveDefault(slot, new Date(now)));
  const at = fromLocalInput(whenValue);
  const look = lookOf(slot);
  const project = projectTitle(slot.projectId, projects);

  const run = async (p: Promise<Fetched<{ slot: ScheduleSlot }>>) => {
    setBusy(true);
    setRefusal(null);
    const r = await p;
    setBusy(false);
    setConfirming(false);
    if (!r.ok) setRefusal(`${r.status || "network"} · ${r.error}`);
    else setWhen(null);
  };

  const verb = slot.status === "scheduled" ? "Move" : slot.status === "failed" ? "Retry" : "Reschedule";

  return (
    <section aria-label={`Slot ${slot.title || slot.id}`} className="space-y-4" data-testid="calendar-slot-panel">
      {!compact && (
        <div className="relative overflow-hidden rounded-xl border border-white/8">
          <Poster exportId={slot.exportId} fit="contain" dim={slot.status === "cancelled"} className="aspect-video w-full" />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[var(--gt-ink)]/90 to-transparent" />
          <div className="absolute top-2.5 left-2.5">
            <OnImage>
              <StatusChip slot={slot} />
            </OnImage>
          </div>
          {onClose && (
            <button
              type="button"
              aria-label="Close slot"
              onClick={onClose}
              className="absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-[var(--gt-ink)]/70 text-white/70 backdrop-blur transition hover:text-white"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          )}
          <div className="absolute inset-x-3 bottom-2.5 flex items-center gap-2 text-white/85">
            <ChannelGlyph id={slot.channelId} className="h-4 w-4" />
            <span className="font-jetbrains text-label">{CHANNEL_NAME[slot.channelId] ?? slot.channelId}</span>
            {aspect && <span className="font-jetbrains ml-auto text-label text-white/55">{aspect}</span>}
          </div>
        </div>
      )}

      {!compact && (
        <div className="space-y-1.5">
          <h2 className="font-instrument text-2xl leading-tight break-words text-white">{slot.title || slot.id}</h2>
          <p className="font-jetbrains text-label text-white/70">
            {dateTimeLabel(slot.publishAt)}
            {now !== null && <span className="text-white/40"> · {relWhen(slot.publishAt, now)}</span>}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-label">
        <dt className="font-jetbrains tracking-[0.14em] text-white/35 uppercase">project</dt>
        <dd className="font-hanken min-w-0 truncate text-white/80">
          {project ?? <span className="font-jetbrains text-white/55">{slot.projectId || "none"}</span>}
        </dd>
        <dt className="font-jetbrains tracking-[0.14em] text-white/35 uppercase">export</dt>
        <dd className="font-jetbrains min-w-0 truncate text-white/65">{shortId(slot.exportId)}</dd>
        <dt className="font-jetbrains tracking-[0.14em] text-white/35 uppercase">slot</dt>
        <dd className="font-jetbrains min-w-0 truncate text-white/65">{slot.id}</dd>
        {slot.missedAt && (
          <>
            <dt className="font-jetbrains tracking-[0.14em] text-amber-200/60 uppercase">missed</dt>
            <dd className="font-jetbrains text-amber-100/85">{dateTimeLabel(slot.missedAt)}</dd>
          </>
        )}
        {slot.publicationId && (
          <>
            <dt className="font-jetbrains tracking-[0.14em] text-white/35 uppercase">publication</dt>
            <dd className="font-jetbrains flex min-w-0 items-center gap-2 text-white/65">
              <span className="truncate">{slot.publicationId}</span>
              {publication?.dry && <span className={`${CHIP_CLASS} ${TALLY_TONE.amber} uppercase`}>dry run</span>}
            </dd>
          </>
        )}
      </dl>

      {slot.tags.length > 0 && (
        <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
          {slot.tags.map((t) => (
            <li key={t} className="font-jetbrains rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-label text-white/65">
              #{t}
            </li>
          ))}
        </ul>
      )}
      {!compact && slot.description && (
        <p className="font-hanken text-content whitespace-pre-wrap text-white/70">{slot.description}</p>
      )}
      {slot.error && (
        <p
          role="status"
          className={`font-jetbrains rounded-xl border px-3 py-2 text-label break-words ${
            look === "failed" ? "border-rose-400/25 bg-rose-400/[0.06] text-rose-100/90" : "border-amber-300/25 bg-amber-400/[0.06] text-amber-100/90"
          }`}
        >
          {slot.error}
        </p>
      )}

      {canMove(slot) && (
        <form
          className={compact ? "flex items-center gap-2" : "space-y-2"}
          onSubmit={(e) => {
            e.preventDefault();
            if (at) void run(onMove(slot, at));
          }}
        >
          <div className={compact ? "max-w-md min-w-0 grow" : "min-w-0"}>
            <WhenPicker
              value={whenValue}
              onChange={setWhen}
              now={now}
              label={slot.status === "scheduled" ? "Move to" : "Reschedule to"}
              align={align}
              testId="calendar-slot-when"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !at}
            data-testid="calendar-slot-move"
            className={`font-jetbrains rounded-xl border px-4 text-label transition disabled:opacity-50 ${compact ? "h-11 shrink-0" : "h-10 w-full"} ${
              slot.status === "scheduled"
                ? "border-cyan-300/35 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/20"
                : "border-amber-300/45 bg-amber-400/12 text-amber-50 hover:bg-amber-400/20"
            }`}
          >
            {verb}
          </button>
        </form>
      )}

      {canCancel(slot) &&
        (confirming ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.04] p-2" role="group" aria-label="Confirm cancel">
            <span className="font-jetbrains grow pl-1 text-label text-rose-100/80">status → cancelled · kept in history</span>
            <Button variant="danger" size="sm" disabled={busy} onClick={() => void run(onCancel(slot))} data-testid="calendar-slot-cancel-confirm">
              Cancel slot
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            data-testid="calendar-slot-cancel"
            className="font-jetbrains text-label text-white/45 underline-offset-4 transition hover:text-rose-200 hover:underline"
          >
            Cancel slot…
          </button>
        ))}

      {refusal && <Refusal>{refusal}</Refusal>}
    </section>
  );
}
