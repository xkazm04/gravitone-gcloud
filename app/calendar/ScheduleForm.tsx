"use client";

// THE ONE SCHEDULE FORM, shared by all three schedule variants: an export, a
// channel, an instant, and the words the platform shows. The engine is the
// authority (it 409s a not_wired channel or an unknown export, and its refusal
// is shown verbatim); the form only blocks what cannot be sent at all and warns
// about what the engine will decide — a past time, a same-minute clash
// (StatReel calendar.ts `checkSchedule`, one validation door).

import { useId, useState } from "react";

import { Command, ErrorBox } from "@/components/kit";
import { Field, Select, TextArea, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Primitives";
import { Ghost } from "@/components/ui/signal";
import type { ChannelId, ScheduleSlot } from "@/lib/publish/types";

import { fmtBytes, fromLocalInput, nextFullHour, splitTags, timeLabel, toLocalInput } from "./calendarModel";
import { CHANNEL_STATUS_WORD, basename } from "./parts";
import type { ChannelList, ExportList, Fetched, NewSlot } from "./publishClient";
import type { Load, ProjectChoice } from "./useCalendar";

const stem = (p: string) => basename(p).replace(/\.[a-z0-9]+$/i, "");

export function ScheduleForm({
  exports,
  channels,
  slots,
  now,
  presetExportId,
  projects,
  onCreate,
  onDone,
}: {
  exports: Load<ExportList>;
  channels: Load<ChannelList>;
  slots: readonly ScheduleSlot[];
  now: number | null;
  presetExportId?: string | null;
  /** The account's projects, for an export that names none; null while read. */
  projects: ProjectChoice[] | null;
  onCreate: (body: NewSlot) => Promise<Fetched<{ slot: ScheduleSlot }>>;
  onDone: (slot: ScheduleSlot) => void;
}) {
  const id = useId();
  const [exportPick, setExportPick] = useState<string | null>(null);
  const [channelPick, setChannelPick] = useState<ChannelId | null>(null);
  const [projectPick, setProjectPick] = useState("");
  const [when, setWhen] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const list = exports?.ok ? exports.data.exports : [];
  const chans = channels?.ok ? channels.data.channels : [];
  const wired = chans.filter((c) => c.status !== "not_wired");

  const exportId = exportPick ?? presetExportId ?? list[0]?.id ?? "";
  const exp = list.find((e) => e.id === exportId) ?? null;
  const channelId: ChannelId = channelPick ?? wired[0]?.id ?? "youtube";
  const whenValue = when ?? (now === null ? "" : toLocalInput(nextFullHour(new Date(now))));
  const titleValue = title ?? (exp ? stem(exp.path) : "");
  const projectId = exp?.projectId ?? projectPick;

  const at = fromLocalInput(whenValue);
  const blocked = !exp
    ? "no export"
    : !projectId
      ? "no project"
      : !at
        ? "no time"
        : !wired.some((c) => c.id === channelId)
          ? "channel not wired"
          : !titleValue.trim()
            ? "no title"
            : null;
  // lib/publish/schedule.ts clashOf: one active slot per export per channel.
  const taken = exp
    ? slots.find(
        (s) =>
          s.exportId === exp.id &&
          s.channelId === channelId &&
          (s.status === "scheduled" || s.status === "publishing" || s.status === "published"),
      )
    : undefined;
  const past = at !== null && now !== null && new Date(at).getTime() < now - 60_000;
  const minute = at ? Math.floor(new Date(at).getTime() / 60_000) : null;
  const clash =
    minute === null
      ? undefined
      : slots.find(
          (s) =>
            s.channelId === channelId &&
            (s.status === "scheduled" || s.status === "publishing") &&
            Math.floor(new Date(s.publishAt).getTime() / 60_000) === minute,
        );

  if (exports && !exports.ok) return null; // the tab draws the fetch failure once, above
  if (exports?.ok && list.length === 0) {
    return (
      <section aria-labelledby={`${id}-h`} className="space-y-3">
        <h2 id={`${id}-h`} className="font-jetbrains text-label tracking-[0.14em] text-white/70 uppercase">
          Schedule
        </h2>
        <Ghost shape="slot" label="no exports to schedule" />
        <Command label="exports">npx tsx pipeline/publish.mts exports --json</Command>
      </section>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked || !exp || !at) return;
    setBusy(true);
    setRefusal(null);
    const r = await onCreate({
      // ExportRef.projectId is nullable on the wire and the POST body's is
      // required (lib/publish/schedule.ts parseScheduleInput), so an export
      // that names no project takes the one the person picked — never a guess.
      projectId,
      exportId: exp.id,
      channelId,
      publishAt: at,
      title: titleValue.trim(),
      description,
      tags: splitTags(tags),
    });
    setBusy(false);
    if (!r.ok) {
      setRefusal(`${r.status || "network"} · ${r.error}`);
      return;
    }
    setTitle(null);
    setProjectPick("");
    setDescription("");
    setTags("");
    setWhen(null);
    onDone(r.data.slot);
  };

  return (
    <form onSubmit={submit} aria-labelledby={`${id}-h`} className="space-y-4" data-testid="calendar-schedule-form">
      <h2 id={`${id}-h`} className="font-jetbrains text-label tracking-[0.14em] text-white/70 uppercase">
        Schedule
      </h2>
      <Field label="Export" htmlFor={`${id}-exp`}>
        <Select id={`${id}-exp`} value={exportId} onChange={(e) => setExportPick(e.target.value)} disabled={!exports}>
          {list.map((x) => (
            <option key={x.id} value={x.id}>
              {basename(x.path)} · {x.projectId ?? "no project"} · {fmtBytes(x.bytes)}
            </option>
          ))}
        </Select>
      </Field>
      {exp &&
        (exp.projectId ? null : (
          <Field label="Project" htmlFor={`${id}-pj`}>
            <Select id={`${id}-pj`} value={projectPick} onChange={(e) => setProjectPick(e.target.value)} disabled={!projects}>
              <option value="">{projects === null ? "reading…" : projects.length ? "pick a project" : "no projects"}</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} · {p.id}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      <Field label="Channel" htmlFor={`${id}-ch`}>
        <Select id={`${id}-ch`} value={channelId} onChange={(e) => setChannelPick(e.target.value as ChannelId)} disabled={!channels?.ok}>
          {chans.map((c) => (
            <option key={c.id} value={c.id} disabled={c.status === "not_wired"}>
              {c.name} · {CHANNEL_STATUS_WORD[c.status]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="When" htmlFor={`${id}-at`}>
        <TextInput
          id={`${id}-at`}
          type="datetime-local"
          value={whenValue}
          onChange={(e) => setWhen(e.target.value)}
          aria-describedby={past || clash || taken ? `${id}-warn` : undefined}
          className="[color-scheme:dark]"
        />
      </Field>
      {(past || clash || taken) && (
        <p id={`${id}-warn`} className="font-jetbrains text-label text-amber-200" aria-live="polite">
          {[
            past && "past · the next tick decides: published late or missed",
            clash && `clash · ${clash.title} at ${timeLabel(clash.publishAt)}`,
            taken && `already on this channel · ${taken.id} ${taken.status}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <Field label="Title" htmlFor={`${id}-t`}>
        <TextInput id={`${id}-t`} value={titleValue} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
      </Field>
      <Field label="Description" htmlFor={`${id}-d`}>
        <TextArea id={`${id}-d`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
      </Field>
      <Field label="Tags" htmlFor={`${id}-tg`}>
        <TextInput id={`${id}-tg`} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="harbor, documentary" />
      </Field>
      {refusal && <ErrorBox>{refusal}</ErrorBox>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || blocked !== null} data-testid="calendar-schedule-submit">
          {busy ? "scheduling…" : "Schedule"}
        </Button>
        {blocked && !busy && <span className="font-jetbrains text-label text-white/60">{blocked}</span>}
      </div>
    </form>
  );
}
