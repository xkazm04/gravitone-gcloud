// The Calendar rail grown into a month (prototype index.html `renderMonth`, `MonthSlot`,
// floor.css `#month`, `.m-bar`, `.mday`, `.mslot`, `.m-side`): a Monday-first grid of whole
// weeks, each day's slots with their hour, channel and - when it failed or was missed - its
// error verbatim (a cancelled slot's old error dim, prototype `.merr.dim`); channel toggles;
// the month's state counts; beside it, the selected day's agenda, or what needs a decision
// (failed, missed, drifted) and what is next.
//
// The page owns the state (month, selected day, channels off) and the keys (calendar mode:
// ←→ day, ↑↓ week, [ ] month, ⏎ open, Esc clears the day then closes, C back to the rail);
// this draws it. A busy day shows MAX_PER_DAY slots and counts the rest - the prototype
// measured overflow in the DOM after paint; a fixed count draws the same on the server and in
// the browser, and cannot reflow under the operator's pointer.

import type { Ref } from "react";

import { Button } from "../button/Button.tsx";
import { Crumbs } from "../crumbs/Crumbs.tsx";
import { cx } from "../cx.ts";
import { capsFor } from "../keycaps/caps.ts";
import keycap from "../keycaps/Keycaps.module.css";
import { EntryPill } from "../status/StatusPill.tsx";
import { statusOf } from "../status/status.ts";
import { Chip } from "../chip/Chip.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { SrOnly } from "../a11y/SrOnly.tsx";
import { Tally } from "../tally/Tally.tsx";
import { BADGE_CHANNELS } from "../channel/ChannelBadge.tsx";
import { vars } from "../vars.ts";
import { MONTHS, WEEK, byDay, clock, dayKey, dayLabel, isBad, monthCells, railOf, type RailSlot, type YearMonth } from "./calendar.ts";
import { ChannelReadiness, STATE_WORDS } from "./ChannelReadiness.tsx";
import type { ChannelReady, PublishTick } from "./schedule.ts";
import { SlotMark, SlotRow } from "./SlotRow.tsx";
import s from "./MonthCalendar.module.css";

export const MAX_PER_DAY = 3;
/** How many of Next the month agenda draws; its tally counts them all. */
const AGENDA_NEXT = 8;

const STATES: readonly RailSlot["status"][] = ["scheduled", "publishing", "published", "failed", "missed", "cancelled"];

export type MonthCalendarProps = {
  readonly slots: readonly RailSlot[];
  readonly nowMs: number;
  readonly month: YearMonth;
  readonly day: string | null;
  readonly channelsOff: ReadonlySet<string>;
  readonly onMonth: (by: number) => void;
  readonly onToday: () => void;
  readonly onDay: (key: string | null) => void;
  readonly onChannel: (channel: string) => void;
  readonly onClose: () => void;
  /** Where a slot's own record lives; with `onOpenSlot`, a plain click opens it in place. */
  readonly slotHref?: (id: string) => string;
  readonly onOpenSlot?: (id: string) => void;
  readonly panelRef?: Ref<HTMLElement>;
  /** Each channel's readiness (Phase 6): drawn in the agenda, and its state word on the toggle. */
  readonly channels?: readonly ChannelReady[];
  /** How a publish goes out here: a plan written (dry) or an upload (live). */
  readonly mode?: "dry" | "live";
  /** Open the schedule form, on the selected day when there is one. */
  readonly onSchedule?: (day: string | null) => void;
  /** The worker's publish timer; absent when the side cannot say. */
  readonly tick?: PublishTick;
};

/** The timer as one chip: its last tick while it runs, else that nothing ticks. */
function TickChip({ tick }: { readonly tick: PublishTick }) {
  const last = tick.lastRunAt === null ? null : clock(Date.parse(tick.lastRunAt));
  if (tick.failing !== undefined) return <Chip label={`tick failing · since ${clock(Date.parse(tick.failing.since))}`} tone="rose" casing="lower" />;
  if (!tick.running) return <Chip label={last === null ? "tick · never ran" : `tick stopped · ${last}`} tone="rose" casing="lower" />;
  return <Chip label={`tick · ${last ?? "—"}`} tone="cyan" casing="lower" />;
}

export function MonthCalendar(p: MonthCalendarProps) {
  const { slots, nowMs, month, day, channelsOff, onMonth, onToday, onDay, onChannel, onClose, slotHref, onOpenSlot, panelRef, channels, mode, onSchedule, tick } = p;
  const stateOf = (c: string) => channels?.find((x) => x.channel === c)?.state;
  const shown = slots.filter((x) => !channelsOff.has(x.channel));
  const days = byDay(shown);
  const { weeks, cells } = monthCells(month);
  const today = dayKey(nowMs);
  const inMonth = shown.filter((x) => {
    const d = new Date(x.publishAt);
    return d.getUTCFullYear() === month.y && d.getUTCMonth() === month.m;
  });
  const chans = [...BADGE_CHANNELS, ...new Set(slots.map((x) => x.channel))].filter((c, i, all) => all.indexOf(c) === i && slots.some((x) => x.channel === c));
  const href = (id: string) => (slotHref === undefined ? {} : { href: slotHref(id), ...(onOpenSlot === undefined ? {} : { onOpen: onOpenSlot }) });
  const title = `${MONTHS[month.m] ?? ""} ${month.y}`;
  const selected = day === null ? null : (days.get(day) ?? []);
  // The agenda is the rail's (./calendar.ts railOf), whichever page is open: what is owed
  // (failed, missed, drifted) newest first, a failure from last month or a drift on next month's
  // slot included; and Next earliest first, a slot past its hour that no tick has settled kept at
  // the head rather than in no section, and counted in full.
  const rail = railOf(shown, nowMs);
  const failed = rail.failed;
  const upcoming = rail.next.flatMap((g) => g.slots.filter((x) => x.status !== "cancelled")).slice(0, AGENDA_NEXT);
  const close = capsFor("calendar", "rail")[0];
  return (
    <section className={s.month} data-component="MonthCalendar" aria-label={`Calendar, ${title}`} ref={panelRef} tabIndex={-1}>
      <div className={s.bar}>
        <Crumbs trail={[{ label: "Floor", onPress: onClose }, { label: "Calendar", onPress: () => onDay(null) }]} here={title} />
        <div className={s.group} role="group" aria-label="month">
          <Button label="‹" size="sm" onPress={() => onMonth(-1)} />
          <Button label="today" size="sm" onPress={onToday} />
          <Button label="›" size="sm" onPress={() => onMonth(1)} />
        </div>
        <div className={s.group} role="group" aria-label="channels">
          {chans.map((c) => {
            const st = stateOf(c);
            // Only a channel nothing can publish on says so on its toggle; the rest speak their state.
            return (
              <button key={c} type="button" className={s.chan} aria-pressed={!channelsOff.has(c)} data-state={st} onClick={() => onChannel(c)}>
                <SlotMark channel={c} />
                <span aria-hidden="true">{slots.filter((x) => x.channel === c).length}</span>
                {st === "not_wired" ? <span className={s.chanState}>{STATE_WORDS[st]}</span> : st !== undefined && <SrOnly text={STATE_WORDS[st]} />}
              </button>
            );
          })}
        </div>
        {mode !== undefined && <Chip label={mode === "dry" ? "dry run" : "live"} tone={mode === "dry" ? "amber" : "emerald"} casing="lower" />}
        {tick !== undefined && <TickChip tick={tick} />}
        <div className={s.tallies}>
          {STATES.map((st) => {
            const n = inMonth.filter((x) => x.status === st).length;
            return n === 0 ? null : (
              <span key={st} className={s.tally}>
                <b>{n}</b>
                <EntryPill entry={statusOf("slot", st)} />
              </span>
            );
          })}
        </div>
        <div className={s.close}>
          {onSchedule !== undefined && <Button label="Schedule" tone="violet" size="sm" onPress={() => onSchedule(day)} />}
          {close !== undefined && <kbd className={keycap.cap}>{close}</kbd>}
          <Button label="rail" size="sm" onPress={onClose} />
        </div>
      </div>
      <div className={s.body}>
        <div className={s.grid} role="grid" aria-label={title}>
          <div className={s.dow} role="row">
            {WEEK.map((d) => (
              <span key={d} role="columnheader">
                {d}
              </span>
            ))}
          </div>
          <div className={s.weeks} role="rowgroup" style={vars({ "--weeks": weeks })}>
            {cells.map((c) => {
              const list = days.get(c.key) ?? [];
              const fails = list.filter(isBad).length;
              // Missed is not failed: no platform refused it, the tick never fired it. Each state under its own word.
              const tally = [["failed", list.filter((x) => x.status === "failed").length], ["missed", list.filter((x) => x.status === "missed").length]] as const;
              const said = tally.filter(([, n]) => n > 0).map(([w, n]) => `${n} ${w}`);
              const more = list.length - MAX_PER_DAY;
              return (
                <div
                  key={c.key}
                  role="gridcell"
                  data-day={c.key}
                  tabIndex={day === c.key || (day === null && c.key === today) ? 0 : -1}
                  aria-selected={day === c.key}
                  aria-label={`${dayLabel(c.key)}, ${list.length} ${list.length === 1 ? "slot" : "slots"}${said.length > 0 ? `, ${said.join(", ")}` : ""}`}
                  className={cx(s.day, c.out && s.out, c.key < today && s.past, c.key === today && s.today, day === c.key && s.sel, fails > 0 && s.hasFail)}
                  onClick={() => onDay(day === c.key ? null : c.key)}
                >
                  <span className={s.dayHead} aria-hidden="true">
                    <span className={s.dn}>{c.date}</span>
                    {fails > 0 && <span className={s.fail}>{said.join(" · ")}</span>}
                    {list.length > 0 && <span className={s.count}>{list.length}</span>}
                  </span>
                  <span className={s.list}>
                    {list.slice(0, MAX_PER_DAY).map((x) => (
                      <span key={x.id} className={cx(s.slot, s[statusOf("slot", x.status).look], x.status === "cancelled" && s.cancelled)}>
                        <span className={s.row}>
                          <span className={s.tm}>{clock(Date.parse(x.publishAt))}</span>
                          <span className={s.t}>{x.title}</span>
                        </span>
                        {isBad(x) && x.error !== undefined && <span className={s.err}>{x.error}</span>}
                        {x.status === "cancelled" && x.error !== undefined && <span className={cx(s.err, s.dim)}>{x.error}</span>}
                      </span>
                    ))}
                  </span>
                  {more > 0 && <span className={s.more}>+{more}</span>}
                </div>
              );
            })}
          </div>
        </div>
        <aside className={s.side} aria-label={selected === null ? "month agenda" : "day agenda"}>
          {selected !== null && day !== null ? (
            <>
              <div className={s.sideHead}>
                {dayLabel(day)} <Tally value={selected.length} label="slots" />
                {onSchedule !== undefined && (
                  <span className={s.push}>
                    <Button label="Schedule" tone="violet" size="sm" onPress={() => onSchedule(day)} />
                  </span>
                )}
              </div>
              {selected.map((x) => (
                <SlotRow key={x.id} slot={x} {...href(x.id)} />
              ))}
            </>
          ) : (
            <>
              <div className={cx(s.sideHead, s.bad)}>
                failed · missed · drift <Tally value={failed.length} />
              </div>
              {failed.map((x) => (
                <SlotRow key={x.id} slot={x} {...href(x.id)} />
              ))}
              <div className={cx(s.sideHead, s.next)}>
                next <Tally value={rail.nextCount} />
              </div>
              {upcoming.map((x) => (
                <SlotRow key={x.id} slot={x} showError={false} {...href(x.id)} />
              ))}
              {channels !== undefined && channels.length > 0 && (
                <>
                  <div className={cx(s.sideHead, s.chans)}>
                    channels <Tally value={channels.filter((c) => c.state === "not_wired").length} label="not wired" />
                  </div>
                  {tick?.failing !== undefined && <ErrorLine message={tick.failing.error} />}
                  <ChannelReadiness channels={channels} />
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
