"use client";

// WHERE AN APPROVED SUBJECT GOES ON THE CALENDAR (prototype index.html :848-850, the cut desk's
// channel toggles and proposed time): the channel, as pressed chips, and the instant, in UTC -
// the calendar's own zone, so the slot reads the same on the month as here. The value rides on
// the kept verdict (./schedule.ts encodeSchedule); this control only edits it.
import { useId } from "react";

import type { Channel } from "@gt/domain/slot";

import { ChannelBadge } from "../channel/ChannelBadge.tsx";
import { Chip } from "../chip/Chip.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { fromUtcInput, toUtcInput } from "../floor/slot.ts";
import type { ScheduleIntent } from "./schedule.ts";
import s from "./Review.module.css";

export type ApproveScheduleProps = {
  readonly channels: readonly Channel[];
  readonly value: ScheduleIntent;
  readonly onChange: (next: ScheduleIntent) => void;
};

export function ApproveSchedule({ channels, value, onChange }: ApproveScheduleProps) {
  const id = useId();
  return (
    <section className={s.calendar} data-component="ApproveSchedule" aria-labelledby={id}>
      <span id={id}>
        <CapsHeading text="calendar" />
      </span>
      <div className={s.reasons} role="group" aria-label="channel">
        {channels.length === 1 && channels[0] !== undefined ? (
          <ChannelBadge channel={channels[0]} />
        ) : (
          channels.map((c) => <Chip key={c} label={c} casing="lower" tone={value.channel === c ? "cyan" : "neutral"} pressed={value.channel === c} onPress={() => onChange({ ...value, channel: c })} />)
        )}
      </div>
      <label className={s.when}>
        <input
          className={s.noteText}
          type="datetime-local"
          aria-label="publish at, UTC"
          value={toUtcInput(Date.parse(value.publishAt))}
          onChange={(e) => {
            const at = fromUtcInput(e.currentTarget.value);
            if (at !== null) onChange({ ...value, publishAt: at });
          }}
        />
        <span className={s.utc}>UTC</span>
      </label>
    </section>
  );
}
