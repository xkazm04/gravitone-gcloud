"use client";

// The bell. Shows UNREAD events only — that is the brief, and it is also the
// honest reading of what a notification is for: a thing that happened while you
// were not looking. Once you have looked, it is history, and history belongs
// somewhere else (the run log in the step) rather than in a tray that never
// empties.
//
// Running work is shown too, above the events, because "is it still going?" is
// the question a bell is actually opened to answer.
//
// AND STORAGE TROUBLE, which is the same kind of thing and had nowhere to go.
// `useStorageTrouble` was built in wave 3 so a surface could learn that the
// store is failing, and grep found exactly one reference to it: its own
// definition. Meanwhile this component — the app's one "things that happened
// while you weren't looking" surface, mounted on every framed route by
// StudioFrame — was not listening. A creator editing for an hour against a full
// quota found out by closing the tab.

import { useEffect, useId, useRef, useState } from "react";
import { Bell } from "lucide-react";

import {
  clearStorageTrouble,
  useStorageTrouble,
  type StorageFailure,
} from "@/app/_phases/_shared/stepStore";
import { elapsed, useJobs } from "@/lib/jobs";
import { politenessFor, useAnnounce } from "@/lib/announcer";

/** What each failure MEANS FOR THE USER, in the user's terms. studioDb and
 *  stepStore classify; this is the only place that has to say what to do about
 *  it, and the five destinations call for different things. */
const TROUBLE_WORD: Record<StorageFailure, string> = {
  quota: "This browser's storage is full. Nothing more will be saved until you free space — open work is still on screen, but a reload would lose it.",
  blocked: "Another tab has this app open on an older version of the database. Close it, then reload this one.",
  unavailable: "This browser session cannot store anything — private mode, or storage is switched off. Nothing written here will survive a reload.",
  "missing-store": "This browser's database is missing the store the studio writes to. Reload; if it comes back, the database needs rebuilding.",
  failed: "The browser refused the operation.",
};

/**
 * The spoken form of a storage failure.
 *
 * Deliberately NOT `TROUBLE_WORD` verbatim: those strings are written to be read
 * with the card's heading beside them ("storage save failed") and the phase line
 * underneath, and an announcement arrives with neither. So it carries its own
 * context and stays one sentence — a paragraph read aloud into the middle of
 * someone's work is worse than silence.
 */
export function troubleAnnouncement(kind: StorageFailure, phase: string): string {
  const what: Record<StorageFailure, string> = {
    quota: "this browser's storage is full",
    blocked: "another tab is holding an older version of the database",
    unavailable: "this browser session cannot store anything",
    "missing-store": "this browser's database is missing the studio's store",
    failed: "the browser refused the operation",
  };
  return `Not saved: ${what[kind]}. ${phase} was not written. Open notifications for what to do.`;
}

export default function NotificationBell() {
  const { unread, jobs, markRead, markAllRead } = useJobs();
  const trouble = useStorageTrouble();
  const announce = useAnnounce();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const running = jobs.filter((j) => j.status === "running");
  // Work that was live when the page reloaded. Not running, not finished, and
  // NOT something to hide: the user asked for research and is owed the truth
  // that it did not complete.
  const interrupted = jobs.filter((j) => j.status === "interrupted");

  // ── ANNOUNCE (added 2026-08-24) ─────────────────────────────────────────
  //
  // This component is the app's primary feedback channel and it was silent to
  // assistive technology: the badge changed, the tray filled, and nothing was
  // spoken. Everything below funnels through the ONE announcer service
  // (lib/announcer.tsx), keyed on event identity — so a re-render, a remount, or
  // reopening the tray says nothing, and the same news is never voiced twice.
  //
  // Nothing here touches focus. Arrival must never relocate the caret or the
  // reading position; the announcement IS the notification.

  useEffect(() => {
    for (const e of unread) {
      announce({
        key: `event:${e.id}`,
        text: `${e.title}. ${e.detail}`,
        // A finished run — good or bad — does not block the keystroke being
        // typed. It waits its turn, exactly as the visual card waits in a tray.
        assertive: politenessFor(e.ok ? "ok" : "failure"),
      });
    }
  }, [unread, announce]);

  useEffect(() => {
    if (!trouble) return;
    announce({
      // Identity is the FAILURE, not the render: the same failure re-reported by
      // a later save of the same phase is the same news.
      key: `trouble:${trouble.kind}:${trouble.phase}:${trouble.op}`,
      text: troubleAnnouncement(trouble.kind, trouble.phase),
      // The one assertive case in the app. The store has stopped accepting
      // writes, so what the user is doing RIGHT NOW is not being saved — hearing
      // that after the current sentence finishes is too late to be useful.
      assertive: politenessFor("blocking"),
    });
  }, [trouble, announce]);

  useEffect(() => {
    if (!open) return;
    // Focus moves into the tray on open and back to the bell on close. The
    // panel used to claim role="dialog" and do neither — nor aria-modal, nor a
    // trap — while Modal.tsx, twenty lines of import away, does all four. The
    // role is gone rather than faked: this is a disclosure, aria-expanded on
    // the trigger says so, and a tray you can Tab out of is the RIGHT shape for
    // a notification list. What it owes a keyboard user is a way in, a way out,
    // and a visible ring at every stop — which it now has.
    panelRef.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = unread.length;
  // The badge counts storage trouble as one more unread thing, because that is
  // exactly what it is — and because a failure the user has to OPEN the bell to
  // discover is barely better than one nobody reports. The list below still
  // keys off `count`: trouble has its own card and is not an event.
  const badge = count + (trouble ? 1 : 0);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        ref={triggerRef}
        data-testid="bell"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          badge ? `${badge} unread notification${badge === 1 ? "" : "s"}` : "Notifications"
        }
        // NOT aria-haspopup: `"true"` is the spec synonym for `"menu"`, and
        // the tray is a role="group" disclosure by the deliberate choice
        // recorded in the open effect above. Announcing a menu re-promises the
        // arrow-key contract that was dropped on purpose.
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/60 transition hover:border-white/25 hover:text-white/90 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Bell className="h-4 w-4" />
        {badge > 0 && (
          <span
            data-testid="bell-count"
            // Rose when the store is failing: an unread result and "your work is
            // not being saved" are not the same news, and the badge is the only
            // thing on screen before the panel opens.
            className={`font-jetbrains absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-semibold ${
              trouble ? "bg-rose-400 text-slate-950" : "bg-cyan-300 text-slate-950"
            }`}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
        {/* running work gets a quiet pulse, distinct from the unread badge */}
        {(running.length > 0 || interrupted.length > 0) && badge === 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-cyan-300/70" />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          data-testid="bell-panel"
          role="group"
          aria-label="Notifications"
          tabIndex={-1}
          className="gt-float absolute right-0 z-50 mt-2 w-[22rem] rounded-2xl border border-white/12 bg-[var(--gt-ink)]/95 p-3 backdrop-blur-xl focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="font-jetbrains text-[10px] tracking-[0.16em] text-white/45 uppercase">
              notifications
            </p>
            {count > 0 && (
              <button
                type="button"
                data-testid="bell-mark-all"
                onClick={markAllRead}
                className="font-jetbrains text-[10px] text-white/40 transition hover:text-white/75"
              >
                mark all read
              </button>
            )}
          </div>

          {/* First, above everything: work that is still going is a question,
              and a store that stopped answering is a problem. */}
          {trouble && (
            <div
              data-testid="bell-storage-trouble"
              className="mb-2 rounded-xl border border-rose-400/35 bg-rose-400/[0.07] px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-jetbrains text-[10px] tracking-[0.12em] text-rose-200 uppercase">
                  storage {trouble.op} failed
                </p>
                <button
                  type="button"
                  onClick={clearStorageTrouble}
                  className="font-jetbrains shrink-0 text-[10px] text-white/30 transition hover:text-white/70"
                >
                  dismiss
                </button>
              </div>
              <p className="mt-1 text-[12px] leading-snug text-rose-100/90">
                {TROUBLE_WORD[trouble.kind]}
              </p>
              {/* WHERE it happened, and what the browser actually said. The step
                  is the difference between "a notebook did not save" and "a
                  theme sheet did not save", and the raw message is the only
                  thing that survives from studioDb's own classification. */}
              <p className="font-jetbrains mt-1 truncate text-[10px] text-white/35">
                {trouble.phase} · {trouble.message}
              </p>
            </div>
          )}

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
                  {/* A DRIVEN job has no progress fraction — nobody knows how far
                      along a minutes-long model call is, and `j.progress` sits at
                      0. Drawing a determinate track off that number would report
                      "0% done" for the whole run, which is the same lie the
                      nine-second recalibrate timer used to tell from the other
                      side. `measured` is the jobs store's own word for "progress
                      means something"; unmeasured work gets a shimmer that says
                      running without claiming a position. */}
                  <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-white/10">
                    {j.measured ? (
                      <span
                        className="block h-full rounded-full bg-cyan-300/70 transition-[width] duration-200"
                        style={{ width: `${Math.round(j.progress * 100)}%` }}
                      />
                    ) : (
                      <span className="gt-indeterminate block h-full w-1/3 rounded-full bg-cyan-300/70" />
                    )}
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
              {trouble
                ? "No run has reported anything — the failure above is the storage layer itself."
                : running.length
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
                      type="button"
                      onClick={() => markRead(e.id)}
                      className="font-jetbrains shrink-0 text-[10px] text-white/30 transition hover:text-white/70"
                    >
                      dismiss
                    </button>
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-slate-300">{e.detail}</p>
                  {/* What the user asked for, in their own words. Two dead
                      ternaries used to sit in front of this — both branches
                      `""`, on a live component — so all they ever did was cost
                      a reader the time to work out that they did nothing. */}
                  <p className="font-jetbrains mt-1 truncate text-[10px] text-white/30">
                    {`“${eventLabel(e.jobId, jobs)}”`}
                  </p>
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
