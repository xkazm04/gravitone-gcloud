"use client";

// THE ANNOUNCEMENT CHANNEL — what the app tells a screen reader.
//
// WHY THIS FILE EXISTS. The bell (components/ui/NotificationBell.tsx) is this
// app's primary feedback channel: every job completion, every failure, and every
// storage problem lands there and nowhere else. It had no live region. So the
// badge changed, the tray filled, and a screen-reader user was told nothing at
// all — the operation failed, the system "told the user", and one class of users
// was told nothing. A notification positioned away from the locus of work is
// carried by peripheral vision for a sighted user and by nothing whatsoever for
// anyone else, unless it is ANNOUNCED.
//
// FOUR RULES, and every one of them is a way this fails silently if skipped.
//
//  1. THE REGION EXISTS BEFORE THE NEWS. Both regions mount empty with the app
//     shell (app/layout.tsx) and live for the session. Assistive technologies
//     announce MUTATIONS INSIDE a region they are already observing; a region
//     mounted with its text already in it announces nowhere, reliably enough to
//     bet against. This is the classic silent failure in the area, and it is
//     invisible in review because the markup looks correct.
//
//  2. ONE WRITER. Components ask this service to announce; they do not scatter
//     their own `aria-live` nodes through the tree. Two regions updated in the
//     same breath race, and assistive technology generally voices the latest
//     change — so the loser is dropped with no trace anywhere.
//
//  3. POLITENESS DERIVES FROM SEVERITY, not from the call site. Routine news
//     waits its turn; only something blocking what the user is doing right now
//     interrupts. Assertive interrupts mid-word, and a stream of interruptions
//     teaches a user to pay LESS attention, not more.
//
//  4. TRANSITIONS, NOT RENDERS. Every announcement carries a `key` that
//     identifies the EVENT. The same key never speaks twice, so a re-render, a
//     remount, or a tray reopening is inaudible — display churn is not news.
//
// SERIAL DRAIN. Speech is one voice and events arrive in bursts. Writing three
// messages into one region in a single frame voices ONE of them (last mutation
// wins) and loses the other two. So this keeps its own queue and drains it with
// spacing, one region mutation at a time. Assertive messages jump the queue;
// they do not erase it, and polite messages resume behind them.
//
// FOCUS IS NEVER TOUCHED. Announcement is the whole mechanism. Nothing here
// moves the caret or the reading position — for a screen-reader user, focus IS
// their place in the world.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/** How long one utterance is given before the next region mutation. Long enough
 *  that a short sentence lands; short enough that a burst of four does not feel
 *  abandoned. Not derived from any animation — the announcement layer was never
 *  motion, so a reduced-motion preference must not change its timing. */
const DRAIN_MS = 1400;

/** The gap between CLEARING a region and WRITING into it — see `step`. One
 *  tick is the whole point; the length only has to outlast a render commit.
 *  Inaudible next to DRAIN_MS, and not derived from any animation either. */
const CLEAR_MS = 50;

/** Bounded, so a storm cannot build a backlog that replays minutes later. Under
 *  pressure the OLDEST polite messages are shed first: an assistive user gets
 *  the same triage a sighted user gets from a visual queue, not a transcript. */
const MAX_QUEUE = 8;

export interface Announcement {
  /** Event identity. The same key is never announced twice — this is what makes
   *  the channel key off transitions rather than renders. */
  key: string;
  text: string;
  /** Interrupt speech in progress. Reserve it for something that blocks what the
   *  user is doing RIGHT NOW; see `politenessFor`. */
  assertive?: boolean;
}

interface AnnouncerApi {
  announce: (a: Announcement) => void;
}

const Ctx = createContext<AnnouncerApi | null>(null);

/**
 * Severity → politeness, in one place.
 *
 * Derived from the same vocabulary every other presentation channel reads, so
 * the tray's colour and the announcement's urgency cannot disagree about how
 * serious something is.
 *
 *   ok / info      polite — the user's current utterance is their current task
 *   failure        polite — bad news, but it does not block this keystroke
 *   blocking       assertive — the store stopped accepting writes; what the user
 *                  is doing right now is not being saved, and hearing that after
 *                  the current sentence finishes is too late to be useful
 */
export function politenessFor(severity: "ok" | "failure" | "blocking"): boolean {
  return severity === "blocking";
}

/** What the queue needs from the world. Injected so the policy below is testable
 *  without a DOM, a renderer or a real clock. */
export interface AnnouncerSink {
  /** Write into the polite region. Called once per drain. */
  polite: (text: string) => void;
  /** Write into the assertive region. */
  assertive: (text: string) => void;
  /** Schedule the next drain. Returns a handle the queue can cancel. */
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
}

export interface AnnouncerQueue {
  announce: (a: Announcement) => void;
  /** Stop draining. Idempotent. */
  stop: () => void;
  /** Inspection, for tests and diagnostics only — never read by the policy. */
  peek: () => { pending: Announcement[]; spoken: number };
}

/**
 * The announcement policy, with no React in it.
 *
 * Extracted deliberately: everything interesting about this channel — dedupe by
 * event key, serial draining, assertive jumping the queue without erasing it,
 * bounded shedding of the oldest polite message — is pure logic, and leaving it
 * tangled with hooks would have made it unassertable in a Node probe suite. The
 * provider below is a thin React wrapper over this.
 */
export function createAnnouncerQueue(
  sink: AnnouncerSink,
  drainMs = DRAIN_MS,
  clearMs = CLEAR_MS,
): AnnouncerQueue {
  /** Keys already spoken. Unbounded in principle and tiny in practice — one
   *  entry per real event in a session. */
  const spoken = new Set<string>();
  const queue: Announcement[] = [];
  let draining = false;
  let handle: unknown = null;
  let stopped = false;

  const step = () => {
    if (stopped) return;
    const next = queue.shift();
    if (!next) {
      draining = false;
      return;
    }
    const write = next.assertive ? sink.assertive : sink.polite;
    // CLEAR NOW, SPEAK ON THE NEXT TICK — two commits, never one.
    //
    // Writing an identical string into a region is not a mutation, and assistive
    // technology voices mutations, so every utterance is clear-then-write. That
    // used to happen in one synchronous breath: `sink.polite("")` then
    // `sink.polite(text)`. The sink is React state, and React batches two
    // setState calls made in one task into ONE render — so the region went from
    // its old text straight to the new text, the clear never touched the DOM,
    // and when the two texts were equal nothing changed at all. The repeat this
    // channel was designed to survive was the one it swallowed: remove two
    // plates that share a name and "Removed plate from the shelf." is voiced
    // once; two research runs finishing with one detail line, likewise.
    //
    // Scheduling the write one tick later puts the clear in its own commit. The
    // drain gap is counted from the write, not the clear, so the cadence a
    // listener hears is unchanged.
    write("");
    handle = sink.schedule(() => {
      if (stopped) return;
      write(next.text);
      handle = sink.schedule(step, drainMs);
    }, clearMs);
  };

  return {
    announce(a: Announcement) {
      if (stopped || !a.text) return;
      // Transitions, not renders.
      if (spoken.has(a.key)) return;
      spoken.add(a.key);

      if (a.assertive) {
        // Jumps the queue; does not erase it.
        queue.unshift(a);
      } else {
        queue.push(a);
      }
      // Shed the oldest POLITE message under pressure, never an assertive one
      // while a polite one remains. When ONLY assertive messages remain the
      // oldest of those goes — and because assertive messages are unshifted,
      // the oldest is at the BACK. This used to splice index 0, which in that
      // case is the interrupt that was just queued: the newest news about the
      // store, dropped to make room for eight older lines about it.
      while (queue.length > MAX_QUEUE) {
        const i = queue.findIndex((q) => !q.assertive);
        queue.splice(i === -1 ? queue.length - 1 : i, 1);
      }
      if (!draining) {
        draining = true;
        step();
      }
    },
    stop() {
      stopped = true;
      if (handle !== null) sink.cancel(handle);
    },
    peek: () => ({ pending: [...queue], spoken: spoken.size }),
  };
}

export function AnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");

  const queue = useRef<AnnouncerQueue | null>(null);
  if (queue.current === null) {
    queue.current = createAnnouncerQueue({
      polite: setPolite,
      assertive: setAssertive,
      schedule: (fn, ms) => setTimeout(fn, ms),
      cancel: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    });
  }

  useEffect(() => {
    const q = queue.current;
    // Stop on unmount so a drain scheduled a moment earlier cannot set state on
    // a dead component.
    return () => q?.stop();
  }, []);

  const announce = useCallback((a: Announcement) => queue.current?.announce(a), []);
  const api = useMemo<AnnouncerApi>(() => ({ announce }), [announce]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* BOTH REGIONS MOUNT EMPTY AND STAY MOUNTED. Do not render these
          conditionally, and do not give either an initial message: a region that
          arrives carrying its text announces nothing. `aria-atomic` so a reader
          voices the whole replacement rather than diffing words out of it. */}
      <div
        data-testid="announcer-polite"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {polite}
      </div>
      <div
        data-testid="announcer-assertive"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertive}
      </div>
    </Ctx.Provider>
  );
}

/**
 * Ask for an announcement.
 *
 * Returns a no-op when no provider is mounted rather than throwing. A missing
 * announcer must not take down a surface — the visual channel still works, and
 * the honest failure here is silence, not a crash. The provider is mounted at
 * the app root, so the fallback is for tests and isolated renders.
 */
export function useAnnounce(): (a: Announcement) => void {
  const ctx = useContext(Ctx);
  return ctx?.announce ?? noop;
}

const noop = () => {};
