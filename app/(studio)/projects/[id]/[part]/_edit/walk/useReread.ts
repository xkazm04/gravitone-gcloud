"use client";

// WORK IN FLIGHT LANDS ON SCREEN (spark fable-ten, package A). An act the Plan launched, or one
// that outlived its confirm's wait (../../../_part/real.ts ACT_WAIT_MS), runs on the worker; the
// view says so in `running`, and until now nothing read the part again, so a job that landed
// changed nothing until a reload.
//
// Why a poll and not the ledger's stream: the stream (_shell/liveFeed.ts openFeed) resumes from
// the seq the page rendered at, and the part page does not carry one - and a job's progress is
// not always an event. So while `running` is non-empty the editor re-reads its part on a
// visibility-aware poll (@gt/ui usePollBackstop: paused while hidden, caught up on return), and
// the poll stops the render `running` empties. A re-read replaces the copy only when the write
// model allows it (@gt/ui part.ts `mayAdopt`): no write in flight, no field being typed in, and
// not older than the copy on screen.

import { useEffect, useRef } from "react";

import type { PartView } from "@gt/domain/partView";
import { mayAdopt } from "@gt/ui/components/part/part.ts";
import { usePollBackstop } from "@gt/ui/freshness/useFreshness";

import { settled } from "../../../../../audio/_hunt/settled.ts";
import type { PartPort } from "../../../_part/contract.ts";

/** How often a part with a job in flight is read again. */
export const REREAD_MS = 4_000;

/** Is the operator typing? A text field (or a contenteditable) holding the focus may hold text
 *  its blur has not committed; a redraw under it would reset that text. */
function typing(): boolean {
  const a = document.activeElement;
  if (!(a instanceof HTMLElement)) return false;
  return a.isContentEditable || a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !["button", "checkbox", "radio", "range", "submit"].includes((a as HTMLInputElement).type));
}

export function useReread(view: PartView, port: PartPort, inflight: { readonly current: boolean }, adopt: (v: PartView) => void): void {
  // The copy on screen when the read comes back, not when it left.
  const shown = useRef(view);
  useEffect(() => {
    shown.current = view;
  }, [view]);
  usePollBackstop(
    async () => {
      const r = await settled(port.loadPart({ projectId: view.projectId, key: view.key }));
      // A failed re-read changes nothing: the next tick asks again, and the copy stays the truth it was.
      if (!r.ok) return;
      const now = shown.current;
      if (r.value.partId !== now.partId) return;
      if (mayAdopt({ inflight: inflight.current, editing: typing(), shownRev: now.rev, freshRev: r.value.rev })) adopt(r.value);
    },
    REREAD_MS,
    view.running.length > 0,
  );
}
