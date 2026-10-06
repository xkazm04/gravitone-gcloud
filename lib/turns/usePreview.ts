"use client";

// THE PRE-FLIGHT READ — what a turn would send and who would serve it, asked
// for as the creator edits, before anything is spent (AIO-B session 2).
//
// Debounced, because the preview's one process is the router's `claude
// --version` probe and an edit burst should cost one of those, not one per
// keystroke. Keyed on the serialised input: an answer is only ever shown
// against the input it was computed for, so a slow reply to an older edit can
// never decorate the newer one (`hydratedFor`'s shape — the key is stored with
// the answer, and a mismatch reads as "not yet", never as stale data).
//
// No setState in an effect body: the effect only schedules, and the state is
// written from the timer and the promise.

import { useEffect, useMemo, useRef, useState } from "react";

import { previewTurn, type PreviewOutcome } from "./client";

const DEBOUNCE_MS = 600;

export function useTurnPreview(kind: string, input: unknown, enabled: boolean): PreviewOutcome | null {
  const key = useMemo(() => (enabled ? `${kind}:${JSON.stringify(input)}` : null), [kind, input, enabled]);
  const [answer, setAnswer] = useState<{ key: string; outcome: PreviewOutcome } | null>(null);
  // The input itself is read through a ref: `key` is its serialisation, so the
  // effect below re-runs exactly when the content changes, not when a caller
  // rebuilds an equal object.
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });

  useEffect(() => {
    if (!key) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      void previewTurn(kind, latest.current, ctl.signal)
        .then((outcome) => setAnswer({ key, outcome }))
        // Aborted (a newer edit), or the network failed: no preview is the
        // honest answer, and the run control falls back to its own route.
        .catch(() => undefined);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [kind, key]);

  return answer && answer.key === key ? answer.outcome : null;
}
