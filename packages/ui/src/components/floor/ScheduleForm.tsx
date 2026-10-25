"use client";

// PUT AN EXPORT ON THE CALENDAR (v1 app/calendar/Composer.tsx, absorbed; ./schedule.ts holds its
// rules). An item from the Library, a channel, an instant in UTC, and the words the platform
// shows. The engine decides; this form blocks only what cannot be sent and warns about what the
// engine or the tick will decide (./schedule.ts says which is which).
//
// The submit lifecycle (form submit-lifecycle): one send per press - the caller's `busy` holds
// every control that could send a second; a refusal comes back verbatim into the form-level
// slot with the draft kept exactly as sent (server-error-mapping, rung 2: the engine's sentence
// names the item, the channel and the slot that holds it); a success is the caller's - the sheet
// closes on the slot it made. Negative feedback waits for a settling point: a blocked field says
// so beside the submit, not under every keystroke (validation-timing).
//
// Items arrive after the sheet opens (the caller reads them on demand), so the strip has three
// honest states: reading, could not be read (its words), and read-and-empty - never the third
// for the first two (async-ui-states failure-states).

import { useId, useState } from "react";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { Plate } from "../desk/Plate.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Field, TextArea } from "../field/Field.tsx";
import { Ghost } from "../ghost/Ghost.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { clock, whenUtc as at, type RailSlot } from "./calendar.ts";
import { canSchedule, channelDefault, checkSchedule, holds, itemDefault, scheduleWarnings, splitTags, whenDefault, DESCRIPTION_MAX, TITLE_MAX, type ChannelReady, type ScheduleDraft, type ScheduleItem, type ScheduleWarning } from "./schedule.ts";
import { SlotMark } from "./SlotRow.tsx";
import { STATE_WORDS } from "./ChannelReadiness.tsx";
import s from "./ScheduleForm.module.css";

export type ScheduleItems = { readonly kind: "reading" } | { readonly kind: "failed"; readonly error: string } | { readonly kind: "read"; readonly items: readonly ScheduleItem[] };

export type ScheduleFormProps = {
  readonly items: ScheduleItems;
  readonly channels: readonly ChannelReady[];
  /** Every slot the calendar holds, for the clash and held warnings. */
  readonly slots: readonly RailSlot[];
  readonly nowMs: number;
  /** The day the form was opened on (the month's selected day), else null. */
  readonly day: string | null;
  /** The item asked for (a Library item's Schedule act). */
  readonly item: string | null;
  /** The channel the calendar last scheduled on. */
  readonly lastChannel: string | null;
  readonly busy: boolean;
  /** The engine's refusal, verbatim. */
  readonly refusal?: string;
  readonly onSchedule: (draft: ScheduleDraft) => void;
};

function Warning({ w }: { readonly w: ScheduleWarning }) {
  if (w.kind === "past") return <li className={s.warn}>past · {at(w.at)}</li>;
  if (w.kind === "clash")
    return (
      <li className={s.warn}>
        same minute · {w.slot.title} · {clock(Date.parse(w.slot.publishAt))}
      </li>
    );
  return (
    <li className={s.warn}>
      held · {w.slot.title} · {w.slot.status} · {at(w.slot.publishAt)}
    </li>
  );
}

export function ScheduleForm({ items, channels, slots, nowMs, day, item: asked, lastChannel, busy, refusal, onSchedule }: ScheduleFormProps) {
  const id = useId();
  const list = items.kind === "read" ? items.items : [];
  const [itemPick, setItem] = useState<string | null>(null);
  const [channelPick, setChannel] = useState<string | null>(null);
  const [when, setWhen] = useState(() => whenDefault(day, nowMs));
  const [titlePick, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  const channel = channelPick ?? channelDefault(channels, lastChannel);
  const item = itemPick ?? itemDefault(list, slots, asked, channel);
  const chosen = list.find((i) => i.id === item);
  // The item's own title until the operator writes one.
  const title = titlePick ?? chosen?.title ?? "";
  const form = { item, channel, when, title, description, tags };
  const { blocked, draft } = checkSchedule(form, channels);
  const warnings = draft === null ? [] : scheduleWarnings(form, slots, nowMs);
  const tagList = splitTags(tags);
  const heldBy = (itemId: string): RailSlot | undefined => slots.find((x) => x.item === itemId && x.channel === channel && holds(x));

  return (
    <form
      className={s.form}
      data-component="ScheduleForm"
      aria-label="Schedule a slot"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft !== null && !busy) onSchedule(draft);
      }}
    >
      <section className={s.section}>
        <CapsHeading text="export" variant="section" level={4} {...(items.kind === "read" ? { tally: { value: list.length } } : {})} />
        {items.kind === "reading" ? (
          <div aria-busy="true">
            <Ghost count={3} label="reading the exports" />
          </div>
        ) : items.kind === "failed" ? (
          <ErrorLine message={items.error} live />
        ) : list.length === 0 ? (
          <Chip label="no export in the library" ghost casing="lower" />
        ) : (
          <div className={s.items} role="radiogroup" aria-label="Export">
            {list.map((x) => {
              const held = heldBy(x.id);
              return (
                <button key={x.id} type="button" role="radio" aria-checked={x.id === item} className={cx(s.item, x.id === item && s.on)} disabled={busy} onClick={() => setItem(x.id)} data-item={x.id}>
                  <span className={s.poster}>{x.poster !== undefined ? <Plate className={s.img} src={x.poster} alt="" lazy /> : <span className={s.noPoster} aria-hidden="true" />}</span>
                  <span className={s.itemTitle}>{x.title}</span>
                  <span className={s.itemMeta}>
                    {x.meta ?? x.id}
                    {held !== undefined && ` · ${held.status}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className={s.section}>
        <CapsHeading text="channel" variant="section" level={4} />
        <div className={s.channels} role="radiogroup" aria-label="Channel">
          {channels.map((c) => {
            const open = canSchedule(c);
            return (
              <button
                key={c.channel}
                type="button"
                role="radio"
                aria-checked={open && c.channel === channel}
                aria-disabled={open ? undefined : true}
                className={cx(s.channel, open && c.channel === channel && s.on, !open && s.locked)}
                disabled={busy}
                onClick={() => {
                  if (open) setChannel(c.channel);
                }}
                data-channel={c.channel}
                data-state={c.state}
              >
                <SlotMark channel={c.channel} />
                <span className={s.channelName}>{c.channel}</span>
                <span className={s.channelState}>{STATE_WORDS[c.state]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={s.section}>
        <CapsHeading text="when · UTC" variant="section" level={4} />
        <div className={s.row}>
          <Field type="datetime-local" label="publish at, UTC" value={when} disabled={busy} onChange={setWhen} describedBy={warnings.length === 0 ? undefined : `${id}-warn`} />
          <span className={s.utc}>UTC</span>
        </div>
        {warnings.length > 0 && (
          <ul id={`${id}-warn`} className={s.warnings} aria-live="polite">
            {warnings.map((w) => (
              <Warning key={w.kind} w={w} />
            ))}
          </ul>
        )}
      </section>

      <section className={s.section}>
        <CapsHeading text="title" variant="section" level={4} />
        <Field label="title" value={title} maxLength={TITLE_MAX} disabled={busy} onChange={setTitle} />
        <CapsHeading text="description" variant="section" level={4} />
        <TextArea label="description" value={description} maxLength={DESCRIPTION_MAX} disabled={busy} onChange={setDescription} />
        <CapsHeading text="tags" variant="section" level={4} />
        <Field label="tags, comma separated" value={tags} placeholder="harbor, documentary" disabled={busy} onChange={setTags} />
        {tagList.length > 0 && (
          <div className={s.tags} role="list" aria-label="tags">
            {tagList.map((t) => (
              <span role="listitem" key={t}>
                <Chip label={`#${t}`} casing="lower" />
              </span>
            ))}
          </div>
        )}
      </section>

      {refusal !== undefined && <ErrorLine message={refusal} live />}
      <div className={s.foot}>
        <Button label={busy ? "Scheduling …" : "Schedule"} tone="violet" submit disabled={busy || draft === null} />
        {blocked.length > 0 && !busy && <Chip label={blocked.map((b) => b.words).join(" · ")} casing="lower" />}
      </div>
    </form>
  );
}
