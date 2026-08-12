"use client";

// The bell. Shows UNREAD events only — that is the brief, and it is also the
// honest reading of what a notification is for: a thing that happened while you
// were not looking. Once you have looked, it is history, and history belongs
// somewhere else (the run log in the step) rather than in a tray that never
// empties.
//
// Running work is shown too, above the events, because "is it still going?" is
// the question a bell is actually opened to answer.

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

import { elapsed, useJobs } from "@/lib/jobs";

export default function NotificationBell() {
  const { unread, jobs, markRead, markAllRead } = useJobs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const running = jobs.filter((j) => j.status === "running");
  // Work that was live when the page reloaded. Not running, not finished, and
  // NOT something to hide: the user asked for research and is owed the truth
  // that it did not complete.
  const interrupted = jobs.filter((j) => j.status === "interrupted");

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = unread.length;

  return (
    <div ref={ref} className="relative">
      <button
        data-testid="bell"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          count ? `${count} unread notification${count === 1 ? "" : "s"}` : "Notifications"
        }
        aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/60 transition hover:border-white/25 hover:text-white/90 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span
            data-testid="bell-count"
            className="font-jetbrains absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-cyan-300 px-1 text-[9px] font-semibold text-slate-950"
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
        {/* running work gets a quiet pulse, distinct from the unread badge */}
        {(running.length > 0 || interrupted.length > 0) && count === 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-cyan-300/70" />
        )}
      </button>

      {open && (
        <div
          data-testid="bell-panel"
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[22rem] rounded-2xl border border-white/12 bg-[var(--gt-ink)]/95 p-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="font-jetbrains text-[10px] tracking-[0.16em] text-white/45 uppercase">
              notifications
            </p>
            {count > 0 && (
              <button
                data-testid="bell-mark-all"
                onClick={markAllRead}
                className="font-jetbrains text-[10px] text-white/40 transition hover:text-white/75"
              >
                mark all read
              </button>
            )}
          </div>

          {running.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {running.map((j) => (
                <div
                  key={j.id}
                  data-testid={`bell-running-${j.kind}`}
                  className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-jetbrains text-[10px] tracking-[0.12em] text-cyan-200 uppercase">
                      {j.kind} running
                    </span>
                    <span className="font-jetbrains text-[10px] text-white/35">{elapsed(j)}</span>
                  </div>
                  <p className="mt-1 truncate text-[12px] text-slate-300">{j.label}</p>
                  <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="block h-full rounded-full bg-cyan-300/70 transition-[width] duration-200"
                      style={{ width: `${Math.round(j.progress * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {interrupted.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {interrupted.map((j) => (
                <div
                  key={j.id}
                  data-testid="bell-interrupted"
                  className="rounded-xl border border-amber-400/30 bg-amber-400/[0.05] px-3 py-2"
                >
                  <p className="font-jetbrains text-[10px] tracking-[0.12em] text-amber-200 uppercase">
                    {j.kind} interrupted
                  </p>
                  <p className="mt-1 truncate text-[12px] text-slate-300">{j.label}</p>
                  <p className="font-jetbrains mt-1 text-[10px] leading-snug text-white/45">
                    The page reloaded while it was running — start it again.
                  </p>
                </div>
              ))}
            </div>
          )}

          {count === 0 ? (
            <p className="px-1 py-3 text-[12px] text-white/35">
              {running.length
                ? "Nothing to report yet — work is still running."
                : interrupted.length
                  ? "Nothing unread. The interrupted run above did not finish."
                  : "Nothing unread. Finished runs stay in the step's own log."}
            </p>
          ) : (
            <ul className="max-h-[19rem] space-y-1.5 overflow-y-auto scroll-y">
              {unread.map((e) => (
                <li
                  key={e.id}
                  data-testid={`bell-event-${e.ok ? "ok" : "fail"}`}
                  className={`rounded-xl border px-3 py-2 ${
                    e.ok
                      ? "border-white/10 bg-white/[0.03]"
                      : "border-rose-400/30 bg-rose-400/[0.05]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`font-jetbrains text-[10px] tracking-[0.12em] uppercase ${
                        e.ok ? "text-cyan-200" : "text-rose-200"
                      }`}
                    >
                      {e.title}
                    </p>
                    <button
                      onClick={() => markRead(e.id)}
                      className="font-jetbrains shrink-0 text-[10px] text-white/30 transition hover:text-white/70"
                    >
                      dismiss
                    </button>
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-slate-300">{e.detail}</p>
                  <p className="font-jetbrains mt-1 truncate text-[10px] text-white/30">{e.title.includes("failed") ? "" : ""}{e.detail && ""}{`“${eventLabel(e.jobId, jobs)}”`}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function eventLabel(jobId: string, jobs: { id: string; label: string }[]) {
  return jobs.find((j) => j.id === jobId)?.label ?? "";
}
