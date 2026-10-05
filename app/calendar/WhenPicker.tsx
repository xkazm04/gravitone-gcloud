"use client";

// THE CALENDAR'S DATE AND TIME FIELD. A native <input type="datetime-local">
// draws its picker in the operating system's chrome — white, square, system
// font — the same reason components/ui/Select.tsx replaced <select>. This is
// that replacement for an instant: a trigger shaped like Select's, and a glass
// popover with a month and two time columns.
//
// The VALUE is still the datetime-local string ("2026-10-07T19:30"), so the
// model's round trip (calendarModel toLocalInput / fromLocalInput, pinned by
// tests/golden-path/calendar.probe.spec.ts) is untouched: only the drawing
// changed.
//
// Keys: the trigger opens on Enter/Space/ArrowDown. In the month, arrows move a
// day (up/down a week), PageUp/PageDown a month, Enter picks. In a time column,
// up/down step it. Escape closes and hands focus back to the trigger.

import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { dayKey, fromLocalInput, relWhen, toLocalInput, weekStart } from "./calendarModel";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const p2 = (n: number) => String(n).padStart(2, "0");

function parse(v: string): Date | null {
  const iso = fromLocalInput(v);
  return iso ? new Date(iso) : null;
}

/** "Tue 6 Oct · 17:00" */
export function whenWords(d: Date): string {
  return `${SHORT_DOW[d.getDay()]} ${d.getDate()} ${SHORT_MON[d.getMonth()]} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function WhenPicker({
  value,
  onChange,
  now,
  label = "When",
  marks,
  align = "left",
  testId,
  describedBy,
}: {
  /** datetime-local string */
  value: string;
  onChange: (v: string) => void;
  now: number | null;
  label?: string;
  /** day keys (calendarModel.dayKey) that already hold a slot — drawn as a dot */
  marks?: ReadonlySet<string>;
  align?: "left" | "right";
  testId?: string;
  describedBy?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const picked = parse(value);
  const base = picked ?? (now === null ? null : new Date(now));
  // the month on show; null = follow the picked value
  const [view, setView] = useState<{ y: number; m: number } | null>(null);
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const hoursRef = useRef<HTMLDivElement>(null);
  const minsRef = useRef<HTMLDivElement>(null);

  const y = view?.y ?? base?.getFullYear() ?? 2026;
  const m = view?.m ?? base?.getMonth() ?? 0;
  const first = new Date(y, m, 1);
  const gridStart = weekStart(first);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  const todayKey = now === null ? null : dayKey(new Date(now));
  const pickedKey = picked ? dayKey(picked) : null;
  const activeKey = focusDay ?? pickedKey ?? todayKey;

  const set = (d: Date) => onChange(toLocalInput(d));
  const setDay = (d: Date) => {
    const h = picked?.getHours() ?? 18;
    const mm = picked?.getMinutes() ?? 0;
    set(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mm));
    setFocusDay(dayKey(d));
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };
  const setTime = (h: number, mm: number) => {
    const d = picked ?? base ?? new Date(2026, 0, 1);
    set(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mm));
  };

  const close = (refocus = true) => {
    setOpen(false);
    setView(null);
    setFocusDay(null);
    if (refocus) triggerRef.current?.focus();
  };

  // Outside press closes; the scroll of the two time columns lands on the
  // picked hour and minute. DOM writes only — nothing re-renders from here.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setView(null);
        setFocusDay(null);
      }
    };
    window.addEventListener("pointerdown", onDown);
    for (const col of [hoursRef.current, minsRef.current]) {
      const on = col?.querySelector<HTMLElement>("[aria-selected='true']");
      if (col && on) col.scrollTop = on.offsetTop - col.clientHeight / 2 + on.clientHeight / 2;
    }
    gridRef.current?.querySelector<HTMLElement>("[tabindex='0']")?.focus();
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const moveFocus = (days: number, months = 0) => {
    const from = activeKey ? new Date(`${activeKey}T12:00`) : new Date(y, m, 1, 12);
    const d = new Date(from.getFullYear(), from.getMonth() + months, from.getDate() + days, 12);
    setFocusDay(dayKey(d));
    setView({ y: d.getFullYear(), m: d.getMonth() });
    // focus follows on the next paint, once the cell for that day exists
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-day="${dayKey(d)}"]`)?.focus());
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    const map: Record<string, () => void> = {
      ArrowLeft: () => moveFocus(-1),
      ArrowRight: () => moveFocus(1),
      ArrowUp: () => moveFocus(-7),
      ArrowDown: () => moveFocus(7),
      PageUp: () => moveFocus(0, -1),
      PageDown: () => moveFocus(0, 1),
      Escape: () => close(),
    };
    if (map[k]) {
      e.preventDefault();
      map[k]();
    }
  };

  const columnKey = (e: React.KeyboardEvent, kind: "h" | "m") => {
    const h = picked?.getHours() ?? 18;
    const mm = picked?.getMinutes() ?? 0;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    const dir = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    if (kind === "h") setTime((h + dir + 24) % 24, mm);
    else setTime(h, (Math.round(mm / 5) * 5 + dir * 5 + 60) % 60);
  };

  const rel = picked && now !== null ? relWhen(picked.toISOString(), now) : null;
  const past = picked !== null && now !== null && picked.getTime() < now - 60_000;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-pop`}
        aria-label={`${label}: ${picked ? whenWords(picked) : "not set"}`}
        aria-describedby={describedBy}
        data-testid={testId}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(e) => {
          if (!open && e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`group flex h-11 w-full items-center gap-2.5 rounded-xl border px-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
          open ? "border-cyan-400/40 bg-cyan-400/[0.06]" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
        }`}
      >
        <CalendarClock aria-hidden className={`h-4 w-4 shrink-0 ${open ? "text-cyan-300" : "text-white/45 group-hover:text-white/70"}`} />
        <span className="font-hanken min-w-0 flex-1 truncate text-content text-white/90">{picked ? whenWords(picked) : "—"}</span>
        {rel && (
          <span className={`font-jetbrains shrink-0 text-label ${past ? "text-amber-200/90" : "text-white/45"}`}>{rel}</span>
        )}
      </button>

      {open && (
        <div
          id={`${id}-pop`}
          role="dialog"
          aria-label={`${label} — pick a day and a time`}
          className={`gt-float absolute top-[calc(100%+8px)] z-50 flex gap-3 rounded-2xl border border-white/12 bg-[var(--gt-ink)] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-3 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="w-[19.5rem]">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="font-instrument grow text-xl text-white">
                {MONTH[m]} <span className="text-white/40">{y}</span>
              </span>
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setView({ y: m === 0 ? y - 1 : y, m: (m + 11) % 12 })}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/[0.07] hover:text-white"
              >
                <ChevronLeft aria-hidden className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setView({ y: m === 11 ? y + 1 : y, m: (m + 1) % 12 })}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/[0.07] hover:text-white"
              >
                <ChevronRight aria-hidden className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5" aria-hidden>
              {DOW.map((d) => (
                <span key={d} className="font-jetbrains py-1 text-center text-label text-white/35">
                  {d.slice(0, 2)}
                </span>
              ))}
            </div>
            <div ref={gridRef} role="grid" aria-label={`${MONTH[m]} ${y}`} onKeyDown={onGridKey} className="grid grid-cols-7 gap-0.5">
              {cells.map((d) => {
                const k = dayKey(d);
                const inMonth = d.getMonth() === m;
                const isPicked = k === pickedKey;
                const isToday = k === todayKey;
                const isPast = todayKey !== null && k < todayKey;
                const marked = marks?.has(k);
                return (
                  <button
                    key={k}
                    type="button"
                    role="gridcell"
                    data-day={k}
                    tabIndex={k === activeKey ? 0 : -1}
                    aria-selected={isPicked}
                    aria-label={`${SHORT_DOW[d.getDay()]} ${d.getDate()} ${SHORT_MON[d.getMonth()]}${isToday ? ", today" : ""}${marked ? ", has a slot" : ""}`}
                    onClick={() => setDay(d)}
                    className={`relative flex h-10 items-center justify-center rounded-lg font-hanken text-content transition ${
                      isPicked
                        ? "bg-gradient-to-b from-cyan-200 to-cyan-300 font-semibold text-slate-950 shadow-[0_6px_20px_-6px_var(--gt-glow-cyan)]"
                        : isToday
                          ? "text-cyan-100 ring-1 ring-cyan-300/45 hover:bg-cyan-400/10"
                          : inMonth
                            ? isPast
                              ? "text-white/35 hover:bg-white/[0.05]"
                              : "text-white/85 hover:bg-white/[0.07]"
                            : "text-white/20 hover:bg-white/[0.04]"
                    }`}
                  >
                    {d.getDate()}
                    {marked && (
                      <span
                        aria-hidden
                        className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${isPicked ? "bg-slate-950/70" : "bg-cyan-300"}`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-1.5 border-l border-white/8 pl-3">
            {(
              [
                ["h", "Hour", HOURS, hoursRef, picked?.getHours()],
                ["m", "Minute", MINUTES, minsRef, picked ? Math.round(picked.getMinutes() / 5) * 5 : undefined],
              ] as const
            ).map(([kind, name, list, ref, cur]) => (
              <div key={kind} className="flex flex-col">
                <span className="font-jetbrains px-1 py-1 text-center text-label text-white/35" aria-hidden>
                  {kind === "h" ? "hh" : "mm"}
                </span>
                <div
                  ref={ref}
                  role="listbox"
                  aria-label={name}
                  tabIndex={0}
                  onKeyDown={(e) => columnKey(e, kind)}
                  className="scroll-y relative h-[17.5rem] w-14 overflow-y-auto rounded-lg focus-visible:outline-2 focus-visible:outline-offset-1"
                >
                  {list.map((n) => {
                    const on = n === cur;
                    return (
                      <div
                        key={n}
                        role="option"
                        aria-selected={on}
                        onClick={() => (kind === "h" ? setTime(n, picked?.getMinutes() ?? 0) : setTime(picked?.getHours() ?? 18, n))}
                        className={`font-jetbrains mx-0.5 my-0.5 cursor-pointer rounded-md py-1.5 text-center text-content tabular-nums transition ${
                          on ? "bg-cyan-400/15 text-cyan-100 shadow-[inset_0_0_0_1px_var(--gt-ring-cyan)]" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                        }`}
                      >
                        {p2(n)}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
