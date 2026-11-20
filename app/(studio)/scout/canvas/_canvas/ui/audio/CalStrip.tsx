"use client";

// THE RELEASE CALENDAR STRIP - one lane per channel the desk's reels go to, a day per cell from tomorrow (day 0 is the
// server's today), a slot as a filled cell; the picked slot's card moves it a day, publishes it now or cancels it. Under
// it, the reel's road with each step's vendor and cost (ChainSteps). Port of the winner's audio.js `calendar()`.

import type { CanvasSlot } from "../../../_port/contract.ts";
import { slotAct } from "../../acts.ts";
import type { CanvasStore } from "../../store.ts";
import { CALENDAR } from "../../tables.ts";
import { ChainSteps } from "../ChainPips.tsx";
import { cx, Gl, kit } from "../kit.tsx";
import d from "../desk.module.css";

const DAY_MS = 86_400_000;

/** Day `n` of the calendar as a UTC date: `today` (YYYY-MM-DD) plus n days. */
const dayDate = (today: string, n: number): Date => new Date(Date.parse(`${today}T00:00:00Z`) + n * DAY_MS);

/** "Nov 21", as the winner labelled a day. */
export const dayLabel = (today: string, n: number): string => dayDate(today, n).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Fri". */
export const dayName = (today: string, n: number): string => dayDate(today, n).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

export function CalStrip({ st, channels, sel, onSel, can }: { readonly st: CanvasStore; readonly channels: readonly string[]; readonly sel: string | null; readonly onSel: (id: string | null) => void; readonly can: boolean }) {
  const today = st.view.today;
  const slots = st.ui.slots;
  const maxDay = Math.min(CALENDAR.days, Math.max(14, ...slots.map((s) => s.day)));
  const cols = { gridTemplateColumns: `34px repeat(${maxDay},1fr)` };
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);
  const picked = slots.find((s) => s.id === sel) ?? null;

  return (
    <div className={cx(d.col, d.cal)} data-role="cal-strip">
      <h3>
        Release calendar{" "}
        <span className={d.sub}>
          {dayLabel(today, 1)} – {dayLabel(today, maxDay)}
        </span>
      </h3>
      <div className={cx(d.lane, d.head)} style={cols}>
        <span />
        {days.map((x) => (
          <span key={x} className={d.d}>
            {x % 7 === 1 || x === 1 ? (dayLabel(today, x).split(" ")[1] ?? "") : ""}
          </span>
        ))}
      </div>
      {channels.map((cid) => (
        <div key={cid} className={d.lane} style={cols}>
          <span className={d.id}>{cid}</span>
          {days.map((x) => {
            const s = slots.find((y) => y.channel === cid && y.day === x);
            if (s === undefined) return <span key={x} className={cx(d.d, x % 7 === 0 && d.wk)} />;
            return (
              <button
                key={x}
                type="button"
                className={cx(d.d, d.on, s.state === "published" && d.pub, s.id === sel && d.sel)}
                title={`${s.title} · ${dayLabel(today, x)}`}
                aria-label={`${s.title} ${dayLabel(today, x)}`}
                aria-pressed={s.id === sel}
                onClick={() => onSel(s.id)}
              />
            );
          })}
        </div>
      ))}
      {picked !== null && <SlotCard st={st} s={picked} can={can} onGone={() => onSel(null)} />}
      <div className={d.calSteps}>
        <ChainSteps />
      </div>
    </div>
  );
}

function SlotCard({ st, s, can, onGone }: { readonly st: CanvasStore; readonly s: CanvasSlot; readonly can: boolean; readonly onGone: () => void }) {
  const today = st.view.today;
  const when = `${dayName(today, s.day)} ${dayLabel(today, s.day)}`;
  return (
    <div className={d.slotcard}>
      <b>{s.title}</b>
      <div className={d.m}>
        {s.channel} · {s.state} · {when} {s.time} · video:export · YouTube private
      </div>
      <div className={kit.inline}>
        <button type="button" className={kit.btn} disabled={!can} aria-label={`${s.title}: a day earlier`} onClick={() => void slotAct(st, "move", s, -1)}>
          <Gl name="prev" size={12} />
          day
        </button>
        <button type="button" className={kit.btn} disabled={!can} aria-label={`${s.title}: a day later`} onClick={() => void slotAct(st, "move", s, 1)}>
          day
          <Gl name="next" size={12} />
        </button>
        <button type="button" className={kit.btn} disabled={!can} onClick={() => void slotAct(st, "publish", s)}>
          Publish now
        </button>
        <button
          type="button"
          className={cx(kit.btn, kit.reject)}
          disabled={!can}
          onClick={() => {
            onGone();
            void slotAct(st, "cancel", s);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
