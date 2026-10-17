// WHAT EACH CHANNEL CAN DO HERE, NOW (v1 app/calendar/ChannelsTab.tsx, absorbed; the facts come
// from the server's readiness seam, ./schedule.ts ChannelReady). Per channel: its state, each
// variable it needs by NAME with whether it is set (a value never leaves the server, and the
// names arrive as data - `npm run check:bundle` fails a browser chunk that spells one), the
// seam's own note, the headless command that reports it, and its standing from the calendar
// itself: when it last went out, and its last failure in the platform's words
// (outbound-notifications channel-health-tracking: "when did this last work?" is answered from
// the record, so a channel that broke weeks ago is not discovered at the next send). A failure is
// shown only while it stands - "failed ×3" since the last success - so a channel that recovered
// does not wear yesterday's red.
//
// Drawn in the month's agenda beside the channel toggles it explains; a toggle carries its
// channel's state word too (./MonthCalendar.tsx).
import { Chip } from "../chip/Chip.tsx";
import type { Tone } from "../chip/tone.ts";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { clock, dayKey, dayLabel } from "./calendar.ts";
import type { ChannelReady, ChannelState } from "./schedule.ts";
import { SlotMark } from "./SlotRow.tsx";
import s from "./ChannelReadiness.module.css";

export const STATE_WORDS: Readonly<Record<ChannelState, string>> = { live: "live", dry: "dry run", not_wired: "not wired", act: "by approve" };
export const STATE_TONE: Readonly<Record<ChannelState, Tone>> = { live: "emerald", dry: "amber", not_wired: "rose", act: "cyan" };

const when = (iso: string): string => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : `${dayLabel(dayKey(t))} ${clock(t)}`;
};

export function ChannelReadiness({ channels }: { readonly channels: readonly ChannelReady[] }) {
  return (
    <ul className={s.list} aria-label="channel readiness" data-component="ChannelReadiness">
      {channels.map((c) => (
        <li key={c.channel} className={s.row} data-channel={c.channel} data-state={c.state}>
          <div className={s.head}>
            <SlotMark channel={c.channel} />
            <span className={s.name}>{c.channel}</span>
            <Chip label={STATE_WORDS[c.state]} tone={STATE_TONE[c.state]} casing="lower" />
          </div>
          {c.env.length > 0 && (
            <div className={s.env} role="list" aria-label={`${c.channel} variables`}>
              {c.env.map((e) => (
                <span role="listitem" key={e.name}>
                  <Chip label={`${e.name} · ${e.present ? "set" : "unset"}`} tone={e.present ? "emerald" : "rose"} casing="lower" />
                </span>
              ))}
            </div>
          )}
          {c.note !== undefined && <span className={s.note}>{c.note}</span>}
          <div className={s.standing}>
            {c.lastOut !== undefined && <Chip label={`out · ${when(c.lastOut)}`} casing="lower" />}
            {c.lastFailure !== undefined && <Chip label={`failed${c.lastFailure.inARow > 1 ? ` ×${c.lastFailure.inARow}` : ""} · ${when(c.lastFailure.at)}`} tone="rose" casing="lower" />}
          </div>
          {c.lastFailure !== undefined && <ErrorLine message={c.lastFailure.error} />}
          <code className={s.cmd}>{c.command}</code>
        </li>
      ))}
    </ul>
  );
}
