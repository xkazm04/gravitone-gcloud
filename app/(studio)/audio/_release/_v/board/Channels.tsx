"use client";

// Where the release goes: the five direct channels, each picked or not, with the adapter's own state
// and sentence; the five stores that ingest only through a licensed distributor, read-only.
import { CHANNEL_NAMES, RELEASE_CHANNELS, type ChannelRow, type ChannelState, type ReleaseChannelId } from "@gt/domain/release";
import type { Tone } from "@gt/ui/components/chip/tone.ts";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import { sectionOf, type SectionProps } from "./board.ts";
import { ChanMark } from "./Card.tsx";
import { ProblemLine } from "./Sheet.tsx";
import s from "./sheet.module.css";

const STATE_TONE: Readonly<Record<ChannelState, Tone>> = { ready: "emerald", dry: "amber", "not-wired": "neutral", "not-reachable": "neutral" };
const STATE_LABEL: Readonly<Record<ChannelState, string>> = { ready: "ready", dry: "dry", "not-wired": "not wired", "not-reachable": "not reachable" };

export function StateChip({ state }: { readonly state: ChannelState }) {
  return <Chip label={STATE_LABEL[state]} tone={STATE_TONE[state]} ghost={state === "not-wired" || state === "not-reachable"} />;
}

const isDirect = (id: ChannelRow["id"]): id is ReleaseChannelId => (RELEASE_CHANNELS as readonly string[]).includes(id);

export function Channels({ release: r, problems, read, dispatch }: SectionProps) {
  const here = problems.filter((p) => sectionOf(p) === "channels");
  const direct = read.channels.filter((c) => c.kind === "direct");
  const dsps = read.channels.filter((c) => c.kind === "dsp");
  return (
    <div className={s.channels} data-jump="channels">
      <CapsHeading text="direct" tally={{ value: r.channels.length, of: direct.length, label: "picked" }} variant="section" />
      <ul className={s.chanRows}>
        {direct.map((c) => {
          const id = c.id;
          if (!isDirect(id)) return null;
          const on = r.channels.includes(id);
          return (
            <li key={id} className={s.chanRow} data-on={on ? "" : undefined}>
              <ChanMark channel={id} />
              <Toggle label={CHANNEL_NAMES[id]} on={on} onToggle={() => dispatch({ type: "toggleChannel", id: r.id, channel: id })} />
              <StateChip state={c.state} />
              <span className={s.detail}>{c.detail ?? ""}</span>
            </li>
          );
        })}
      </ul>
      {here.length > 0 && (
        <div className={s.lines}>
          {here.map((p) => (
            <ProblemLine key={p.code} problem={p} />
          ))}
        </div>
      )}
      <CapsHeading text="stores" tally={{ value: dsps.length }} variant="section" />
      <ul className={s.chanRows}>
        {dsps.map((c) => (
          <li key={c.id} className={s.chanRow} data-dsp="">
            <span className={s.dspName}>{CHANNEL_NAMES[c.id]}</span>
            <StateChip state={c.state} />
            <span className={s.detail}>{c.detail ?? ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
