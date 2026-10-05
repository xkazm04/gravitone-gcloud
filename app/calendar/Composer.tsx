"use client";

// THE ONE SCHEDULE FORM, shared by all three schedule variants: an export, a
// channel, an instant, and the words the platform shows. The engine is the
// authority (it 409s a not_wired channel or an unknown export, and its refusal
// is shown verbatim); the form only blocks what cannot be sent at all and warns
// about what the engine will decide — a past time, a same-minute clash
// (StatReel calendar.ts `checkSchedule`, one validation door).
//
// A variant can hand it a PRESET — an export picked off a shelf, a channel and
// an hour clicked on a lane — as `{ nonce, ... }`. A new nonce resets the
// fields to that preset; the same nonce leaves the person's edits alone.

import { Lock, Plus } from "lucide-react";
import { useId, useState } from "react";

import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Primitives";
import { Select } from "@/components/ui/Select";
import { CHIP_CLASS, TALLY_TONE } from "@/components/ui/signal";
import type { ChannelId, ExportRef, ScheduleSlot } from "@/lib/publish/types";

import { dayKey, fmtBytes, fromLocalInput, nextFullHour, splitTags, timeLabel, toLocalInput } from "./calendarModel";
import { Poster, aspectWord, usePoster } from "./poster";
import type { ChannelList, ExportList, Fetched, NewSlot } from "./publishClient";
import { CHANNEL_STATUS_WORD, ChannelGlyph, CutAnExport, Refusal } from "./ui";
import type { Load, ProjectChoice } from "./useCalendar";
import { activeSlotOf, exportName, projectTitle, shortId } from "./view";
import { WhenPicker, whenWords } from "./WhenPicker";

export interface Preset {
  nonce: number;
  exportId?: string;
  channelId?: ChannelId;
  /** datetime-local */
  when?: string;
}

export function Composer(props: {
  exports: Load<ExportList>;
  channels: Load<ChannelList>;
  slots: readonly ScheduleSlot[];
  now: number | null;
  projects: ProjectChoice[] | null;
  preset?: Preset;
  /** the shelf above already picks the export (V3): draw it, do not re-offer it */
  exportPicker?: "strip" | "header";
  onCreate: (body: NewSlot) => Promise<Fetched<{ slot: ScheduleSlot }>>;
  onDone: (slot: ScheduleSlot) => void;
  align?: "left" | "right";
}) {
  // keyed by the preset's nonce: a new preset is a fresh form
  return <ComposerForm key={props.preset?.nonce ?? 0} {...props} />;
}

function ComposerForm({
  exports,
  channels,
  slots,
  now,
  projects,
  preset,
  exportPicker = "strip",
  onCreate,
  onDone,
  align = "right",
}: Parameters<typeof Composer>[0]) {
  const id = useId();
  const [exportPick, setExportPick] = useState<string | null>(preset?.exportId ?? null);
  const [channelPick, setChannelPick] = useState<ChannelId | null>(preset?.channelId ?? null);
  const [projectPick, setProjectPick] = useState("");
  const [when, setWhen] = useState<string | null>(preset?.when ?? null);
  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // a refusal answers the form as it was sent; the moment any field moves it
  // is about a request nobody is making any more
  const edited =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setRefusal(null);
      set(v);
    };

  const list = exports?.ok ? exports.data.exports : [];
  const chans = channels?.ok ? channels.data.channels : [];
  const wired = chans.filter((c) => c.status !== "not_wired");

  // an export with no active slot yet is the likelier pick
  const firstFree = list.find((e) => !activeSlotOf(slots, e.id)) ?? list[0];
  const exportId = exportPick ?? firstFree?.id ?? "";
  const exp = list.find((e) => e.id === exportId) ?? null;
  const channelId: ChannelId = channelPick ?? wired[0]?.id ?? "youtube";
  const whenValue = when ?? (now === null ? "" : toLocalInput(nextFullHour(new Date(now))));
  const named = exp ? (projectTitle(exp.projectId, projects) ?? "") : "";
  const titleValue = title ?? named;
  const projectId = exp?.projectId ?? projectPick;
  const tagList = splitTags(tags);

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
  const taken = exp ? activeSlotOf(slots, exp.id, channelId) : undefined;
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
  const marks = new Set(
    slots.filter((s) => s.status === "scheduled" || s.status === "publishing").map((s) => dayKey(new Date(s.publishAt))),
  );

  if (exports && !exports.ok) return null; // the tab draws the fetch failure once, above
  if (exports?.ok && list.length === 0) return <NoExports />;

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
      tags: tagList,
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
    setExportPick(null);
    onDone(r.data.slot);
  };

  const warnId = `${id}-warn`;

  return (
    <form onSubmit={submit} aria-label="Schedule a slot" className="space-y-5" data-testid="calendar-schedule-form">
      {exportPicker === "strip" ? (
        <fieldset className="min-w-0 space-y-2">
          <legend className="font-jetbrains mb-2 text-label tracking-[0.18em] text-white/45 uppercase">
            Export <span className="tracking-normal text-white/30">{list.length}</span>
          </legend>
          <div role="radiogroup" aria-label="Export" className="scroll-x -mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pt-1 pb-2">
            {list.map((x) => (
              <ExportPick
                key={x.id}
                exp={x}
                on={x.id === exportId}
                busy={activeSlotOf(slots, x.id)}
                projects={projects}
                onPick={() => edited(setExportPick)(x.id)}
              />
            ))}
          </div>
        </fieldset>
      ) : (
        exp && <ExportHeader exp={exp} projects={projects} />
      )}

      {exp && !exp.projectId && (
        <div>
          <Select
            label="project"
            value={projectPick}
            onChange={edited(setProjectPick)}
            placeholder={projects === null ? "reading…" : projects.length ? "pick one" : "no projects"}
            options={(projects ?? []).map((p) => ({ value: p.id, label: p.title, meta: p.id.slice(0, 10) }))}
            testId="calendar-schedule-project"
          />
        </div>
      )}

      <fieldset className="min-w-0">
        <legend className="font-jetbrains mb-2 text-label tracking-[0.18em] text-white/45 uppercase">Channel</legend>
        <div role="radiogroup" aria-label="Channel" className="grid grid-cols-3 gap-2">
          {chans.map((c) => {
            const locked = c.status === "not_wired";
            const on = c.id === channelId && !locked;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={locked || undefined}
                aria-label={`${c.name}, ${CHANNEL_STATUS_WORD[c.status]}`}
                onClick={() => !locked && edited(setChannelPick)(c.id)}
                data-testid={`calendar-schedule-channel-${c.id}`}
                className={`relative flex flex-col items-start gap-2 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition ${
                  locked
                    ? "cursor-not-allowed border-white/[0.06] bg-[repeating-linear-gradient(135deg,var(--gt-wash)_0_1px,transparent_1px_9px)] text-white/35"
                    : on
                      ? "border-cyan-300/45 bg-cyan-400/10 text-cyan-50 shadow-[0_0_0_1px_var(--gt-ring-cyan),0_10px_30px_-14px_var(--gt-glow-cyan)]"
                      : "border-white/8 bg-white/[0.03] text-white/75 hover:border-white/15 hover:bg-white/[0.05]"
                }`}
              >
                <span className="flex w-full items-center justify-between">
                  <ChannelGlyph id={c.id} className="h-5 w-5" />
                  {locked && <Lock aria-hidden className="h-3.5 w-3.5" />}
                </span>
                <span className="font-hanken text-content leading-none">{c.name}</span>
                <span className="font-jetbrains text-label leading-none uppercase opacity-70">{CHANNEL_STATUS_WORD[c.status]}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <span className="font-jetbrains mb-1.5 block text-label tracking-[0.18em] text-white/45 uppercase">When</span>
        <WhenPicker
          value={whenValue}
          onChange={edited(setWhen)}
          now={now}
          marks={marks}
          align={align}
          testId="calendar-schedule-when"
          describedBy={past || clash || taken ? warnId : undefined}
        />
        {(past || clash || taken) && (
          <ul id={warnId} aria-live="polite" className="mt-2 space-y-1 rounded-xl border border-amber-300/20 bg-amber-400/[0.05] px-3 py-2">
            {past && <Warn word="past">the next tick decides</Warn>}
            {clash && (
              <Warn word="clash">
                {clash.title} · {timeLabel(clash.publishAt)}
              </Warn>
            )}
            {taken && (
              <Warn word="booked">
                {taken.status} · {whenWords(new Date(taken.publishAt))}
              </Warn>
            )}
          </ul>
        )}
      </div>

      <Field label="Title" htmlFor={`${id}-t`}>
        <TextInput id={`${id}-t`} value={titleValue} onChange={(e) => edited(setTitle)(e.target.value)} maxLength={100} />
      </Field>
      <Field label="Description" htmlFor={`${id}-d`}>
        <TextArea id={`${id}-d`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
      </Field>
      <div>
        <Field label="Tags" htmlFor={`${id}-tg`}>
          <TextInput id={`${id}-tg`} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="harbor, documentary" />
        </Field>
        {tagList.length > 0 && (
          <ul aria-label="Tags" className="mt-2 flex flex-wrap gap-1.5">
            {tagList.map((t) => (
              <li key={t} className="font-jetbrains rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-label text-white/70">
                #{t}
              </li>
            ))}
          </ul>
        )}
      </div>

      {refusal && <Refusal>{refusal}</Refusal>}

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={busy || blocked !== null} data-testid="calendar-schedule-submit" className="inline-flex items-center gap-2">
          <Plus aria-hidden className="h-4 w-4" />
          {busy ? "Scheduling…" : "Schedule"}
        </Button>
        {blocked && !busy && <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>{blocked}</span>}
      </div>
    </form>
  );
}

/** One amber line under the time field: a word for the kind, the facts after it. */
function Warn({ word, children }: { word: string; children: React.ReactNode }) {
  return (
    <li className="font-jetbrains flex gap-2 text-label leading-snug text-amber-100/85">
      <span className="shrink-0 tracking-[0.12em] text-amber-300 uppercase">{word}</span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

/** One export in the composer's strip: its poster, its project, its handle. */
function ExportPick({
  exp,
  on,
  busy,
  projects,
  onPick,
}: {
  exp: ExportRef;
  on: boolean;
  busy: ScheduleSlot | undefined;
  projects: ProjectChoice[] | null;
  onPick: () => void;
}) {
  const name = exportName(exp, projects);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={`${name}, ${shortId(exp.id)}${busy ? `, ${busy.status}` : ""}`}
      onClick={onPick}
      className={`group w-40 shrink-0 snap-start overflow-hidden rounded-xl border text-left transition ${
        on
          ? "border-cyan-300/50 shadow-[0_0_0_1px_var(--gt-ring-cyan),0_12px_32px_-14px_var(--gt-glow-cyan)]"
          : "border-white/8 hover:border-white/20"
      }`}
    >
      <span className="relative block aspect-video">
        <Poster exportId={exp.id} fit="contain" className="absolute inset-0" />
        {busy && (
          <span className="font-jetbrains absolute top-1.5 left-1.5 rounded-full border border-white/10 bg-[var(--gt-ink)]/80 px-2 text-label text-white/70 backdrop-blur">
            {busy.status === "published" ? "aired" : "booked"}
          </span>
        )}
      </span>
      <span className={`font-hanken block truncate px-2.5 pt-1.5 text-label ${on ? "text-white" : "text-white/75 group-hover:text-white"}`}>{name}</span>
      <span className="font-jetbrains block px-2.5 pb-2 text-label text-white/35">{shortId(exp.id)}</span>
    </button>
  );
}

/** The export a shelf already picked, drawn as the form's masthead. */
function ExportHeader({ exp, projects }: { exp: ExportRef; projects: ProjectChoice[] | null }) {
  const p = usePoster(exp.id);
  const aspect = aspectWord(p);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-2">
      <Poster exportId={exp.id} fit="contain" className="aspect-video w-32 shrink-0 rounded-lg" />
      <div className="min-w-0">
        <p className="font-instrument truncate text-xl leading-tight text-white">{exportName(exp, projects)}</p>
        <p className="font-jetbrains truncate text-label text-white/45">
          {shortId(exp.id)} · {fmtBytes(exp.bytes)}
          {aspect && ` · ${aspect}`}
        </p>
      </div>
    </div>
  );
}

/** No export on disk yet: the shape of the strip, and the line that lists them. */
function NoExports() {
  return (
    <div className="space-y-3" data-testid="calendar-schedule-noexports">
      <span className="font-jetbrains block text-label tracking-[0.18em] text-white/45 uppercase">Export 0</span>
      <div className="relative overflow-hidden">
      <div aria-hidden className="flex gap-2.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-40 shrink-0 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
            <span className="block aspect-video bg-gradient-to-br from-white/[0.05] to-transparent" />
            <span className="mx-2.5 mt-2 block h-2.5 w-24 rounded-full bg-white/[0.07]" />
            <span className="mx-2.5 mt-1.5 mb-2.5 block h-2 w-14 rounded-full bg-white/[0.05]" />
          </span>
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <CutAnExport />
      </div>
      </div>
      <p className="sr-only">No exports to schedule</p>
    </div>
  );
}
