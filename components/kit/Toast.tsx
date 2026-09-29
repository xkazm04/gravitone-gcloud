"use client";

// THE OUTCOME OF AN ACTION, FOR A MOMENT. The bell keeps the record; a toast is
// only the moment.
//
//   useToast()   local state for a surface: `{ toasts, push, dismiss }`. No
//                provider and no global store, so a surface owns its own tray.
//   ToastTray    the stack, fixed above the dock (or `inline` inside a page).
//
// Three rules the shape carries so nobody re-derives them:
//
//   · A FAILURE STAYS. `ok` and `info` leave after `ttl` (5 s); `failed` has no
//     timer, because a failure that vanishes while the person looks elsewhere is
//     an error nobody was told about. It goes when it is dismissed.
//   · ONE WRITER FOR THE SCREEN READER. The tray is not itself a live region:
//     `push` hands the text to lib/announcer's queue (a no-op outside its
//     provider), which is the app's single voice. Two live regions race.
//   · THE MARK IS THE STATE. ok = committed, failed = failed, info = live; the
//     word is the caller's real sentence, not a label for the kind.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAnnounce } from "@/lib/announcer";
import { StatusGlyph, type StatusKind } from "./StatusGlyph";

export type ToastKind = "ok" | "failed" | "info";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  /** The real sentence: what happened, or the error verbatim. */
  text: string;
  /** A follow-up, as a `<Button size="sm" variant="ghost">`. */
  action?: React.ReactNode;
}

export interface PushToast {
  kind: ToastKind;
  text: string;
  action?: React.ReactNode;
  /** Milliseconds before it leaves; `null` keeps it. Default 5000, and `null` for `failed`. */
  ttl?: number | null;
  /** The same key never stacks twice: pushing it again replaces the earlier toast. */
  key?: string;
}

const TTL_MS = 5000;
const MARK: Record<ToastKind, StatusKind> = { ok: "committed", failed: "failed", info: "live" };

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);
  const announce = useAnnounce();

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((all) => all.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    ({ kind, text, action, ttl, key }: PushToast) => {
      const id = key ?? `toast-${++seq.current}`;
      const prior = timers.current.get(id);
      if (prior) clearTimeout(prior);
      setToasts((all) => [...all.filter((x) => x.id !== id), { id, kind, text, action }]);
      announce({ key: `${id}:${text}`, text: kind === "failed" ? `Failed: ${text}` : text });
      const life = ttl === undefined ? (kind === "failed" ? null : TTL_MS) : ttl;
      if (life !== null) timers.current.set(id, setTimeout(() => dismiss(id), life));
      return id;
    },
    [announce, dismiss],
  );

  useEffect(() => {
    const held = timers.current;
    return () => held.forEach((t) => clearTimeout(t));
  }, []);

  return { toasts, push, dismiss };
}

export function ToastTray({
  toasts,
  onDismiss,
  inline = false,
  label = "Notifications",
}: {
  toasts: readonly ToastItem[];
  onDismiss: (id: string) => void;
  /** Draw in the page flow instead of fixed to the corner (specimens, panels). */
  inline?: boolean;
  label?: string;
}) {
  if (toasts.length === 0) return null;
  return (
    <ol className={`k-toasts${inline ? " k-toasts--inline" : ""}`} aria-label={label}>
      {toasts.map((t) => (
        <li key={t.id} className={`k-toast k-toast--${t.kind}`}>
          <span className="k-toast__mark">
            <StatusGlyph kind={MARK[t.kind]} />
          </span>
          <div className="k-toast__body">
            <p className="k-toast__text">{t.text}</p>
            {t.action && <div className="k-toast__act">{t.action}</div>}
          </div>
          <button type="button" className="k-toast__x" aria-label={`Dismiss: ${t.text}`} onClick={() => onDismiss(t.id)}>
            ×
          </button>
        </li>
      ))}
    </ol>
  );
}
