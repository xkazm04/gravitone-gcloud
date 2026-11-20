"use client";

// Step 6, channels: the five a release reaches over their own public upload APIs, each with the
// server's readiness and its sentence verbatim, picked or not; then the five stores that ingest only
// from a licensed distributor, which no route from here reaches today.
import { ChannelBadge, isBadgeChannel } from "@gt/ui/components/channel/ChannelBadge.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { CHANNEL_NAMES, RELEASE_CHANNELS, type ChannelRow, type ReleaseChannelId } from "@gt/domain/release";

import { Problems } from "./Problems.tsx";
import { CHANNEL_ENTRY } from "./status.ts";
import { problemsOf, type StepProps } from "./steps.ts";
import s from "./step.module.css";

const isDirect = (id: ChannelRow["id"]): id is ReleaseChannelId => (RELEASE_CHANNELS as readonly string[]).includes(id);

export function StepChannels({ release: r, read, problems, dispatch }: StepProps) {
  const direct = read.channels.filter((c) => c.kind === "direct");
  const dsps = read.channels.filter((c) => c.kind === "dsp");
  return (
    <div className={s.stack}>
      <Problems problems={problemsOf(problems, "channels")} label="channel problems" />
      <section className={s.section} aria-label="direct channels">
        <CapsHeading text="Direct" tally={{ value: r.channels.length, of: direct.length, label: "picked" }} variant="section" />
        <ul className={s.channels}>
          {direct.map((c) => {
            const id = c.id;
            if (!isDirect(id)) return null;
            const on = r.channels.includes(id);
            return (
              <li key={id}>
                <button type="button" className={s.channel} aria-pressed={on} onClick={() => dispatch({ type: "toggleChannel", id: r.id, channel: id })}>
                  <span className={s.check} aria-hidden="true">
                    {on ? "✓" : ""}
                  </span>
                  <span className={s.chanName}>
                    {isBadgeChannel(id) && <ChannelBadge channel={id} />}
                    {CHANNEL_NAMES[id]}
                  </span>
                  <EntryPill entry={CHANNEL_ENTRY[c.state]} />
                  <span className={s.detail}>{c.detail ?? ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section className={s.section} aria-label="stores">
        <CapsHeading text="Stores" tally={{ value: dsps.length }} variant="section" />
        <ul className={s.channels}>
          {dsps.map((c) => (
            <li key={c.id} className={s.store}>
              <span className={s.check} data-off="" aria-hidden="true" />
              <span className={s.chanName}>{CHANNEL_NAMES[c.id]}</span>
              <EntryPill entry={CHANNEL_ENTRY[c.state]} />
              <span className={s.detail}>{c.detail ?? ""}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
