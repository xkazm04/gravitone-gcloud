// The Calendar rail grown into a month (prototype index.html `renderMonth`, `MonthSlot`,
// floor.css `#month`, `.m-bar`, `.mday`, `.mslot`, `.m-side`): a Monday-first grid of whole
// weeks, each day's slots with their hour, channel and - when it failed or was missed - its
// error verbatim; channel toggles; the month's state counts; beside it, the selected day's
// agenda, or the month's failures and what is next.
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
import { Tally } from "../tally/Tally.tsx";
import { BADGE_CHANNELS } from "../channel/ChannelBadge.tsx";
import { vars } from "../vars.ts";
import { MONTHS, WEEK, byDay, clock, dayKey, dayLabel, isBad, monthCells, type RailSlot, type YearMonth } from "./calendar.ts";
import { SlotMark, SlotRow } from "./SlotRow.tsx";
import s from "./MonthCalendar.module.css";

export const MAX_PER_DAY = 3;

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
  readonly slotHref?: string;
  readonly panelRef?: Ref<HTMLElement>;
};

export function MonthCalendar(p: MonthCalendarProps) {
  const { slots, nowMs, month, day, channelsOff, onMonth, onToday, onDay, onChannel, onClose, slotHref, panelRef } = p;
  const shown = slots.filter((x) => !channelsOff.has(x.channel));
  const days = byDay(shown);
  const { weeks, cells } = monthCells(month);
  const today = dayKey(nowMs);
  const inMonth = shown.filter((x) => {
    const d = new Date(x.publishAt);
    return d.getUTCFullYear() === month.y && d.getUTCMonth() === month.m;
  });
  const chans = [...BADGE_CHANNELS, ...new Set(slots.map((x) => x.channel))].filter((c, i, all) => all.indexOf(c) === i && slots.some((x) => x.channel === c));
  const href = slotHref === undefined ? {} : { href: slotHref };
  const title = `${MONTHS[month.m] ?? ""} ${month.y}`;
  const selected = day === null ? null : (days.get(day) ?? []);
  const failed = inMonth.filter(isBad).sort((a, b) => b.publishAt.localeCompare(a.publishAt));
  const upcoming = shown.filter((x) => Date.parse(x.publishAt) >= nowMs && (x.status === "scheduled" || x.status === "publishing")).slice(0, 8);
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
          {chans.map((c) => (
            <button key={c} type="button" className={s.chan} aria-pressed={!channelsOff.has(c)} onClick={() => onChannel(c)}>
              <SlotMark channel={c} />
              <span aria-hidden="true">{slots.filter((x) => x.channel === c).length}</span>
            </button>
          ))}
        </div>
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
              const more = list.length - MAX_PER_DAY;
              return (
                <div
                  key={c.key}
                  role="gridcell"
                  data-day={c.key}
                  tabIndex={day === c.key || (day === null && c.key === today) ? 0 : -1}
                  aria-selected={day === c.key}
                  aria-label={`${dayLabel(c.key)}, ${list.length} slots${fails > 0 ? `, ${fails} failed` : ""}`}
                  className={cx(s.day, c.out && s.out, c.key < today && s.past, c.key === today && s.today, day === c.key && s.sel, fails > 0 && s.hasFail)}
                  onClick={() => onDay(day === c.key ? null : c.key)}
                >
                  <span className={s.dayHead} aria-hidden="true">
                    <span className={s.dn}>{c.date}</span>
                    {fails > 0 && <span className={s.fail}>{fails} failed</span>}
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
              </div>
              {selected.map((x) => (
                <SlotRow key={x.id} slot={x} {...href} />
              ))}
            </>
          ) : (
            <>
              <div className={cx(s.sideHead, s.bad)}>
                failed · missed <Tally value={failed.length} />
              </div>
              {failed.map((x) => (
                <SlotRow key={x.id} slot={x} {...href} />
              ))}
              <div className={cx(s.sideHead, s.next)}>
                next <Tally value={upcoming.length} />
              </div>
              {upcoming.map((x) => (
                <SlotRow key={x.id} slot={x} showError={false} {...href} />
              ))}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
