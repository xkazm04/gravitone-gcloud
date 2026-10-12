"use client";

// The board's keymap and its toasts: the key table every surface shares, and
// the notices for decisions and refusals. Split out of parts.tsx along its own
// banners.

import { Check, LockKeyhole, X } from "lucide-react";
import { Keycaps, keycapsRows, type KeyBinding } from "@/components/ui/signal";
import { BOARD_KEYMAP } from "@/lib/board/keys";
import type { BoardApi } from "./useBoard";

/* ── the keymap ───────────────────────────────────────────────────────────── */

// Drawn FROM the keymap the Board binds (lib/board/keys.ts), so the disclosure
// cannot name a key the window listener does not honour.
export const BOARD_KEYS: KeyBinding[] = keycapsRows(BOARD_KEYMAP);

export function BoardKeymap({ extra = [] }: { extra?: KeyBinding[] }) {
  return <Keycaps map={[...BOARD_KEYS, ...extra]} label="Board keys" />;
}

/* ── toasts ───────────────────────────────────────────────────────────────── */

/** The decide path's receipts and refusals (useBoard `push`). A refusal is the
 *  source's own sentence; a failure stays until dismissed. */
export function BoardToasts({ api }: { api: BoardApi }) {
  const { toasts, dismiss } = api.toasts;
  if (!toasts.length) return null;
  return (
    <ol aria-label="Board notices" className="pointer-events-none fixed bottom-6 left-20 z-50 flex max-w-[min(32rem,calc(100vw-10rem))] flex-col gap-2">
      {toasts.map((t) => {
        const tone =
          t.kind === "failed" ? "border-rose-400/35 text-rose-100" : t.kind === "info" ? "border-amber-400/30 text-amber-50" : "border-white/10 text-white/85";
        const Icon = t.kind === "failed" ? X : t.kind === "info" ? LockKeyhole : Check;
        return (
          <li
            key={t.id}
            className={`gt-rise gt-float pointer-events-auto flex items-start gap-3 rounded-2xl border bg-[var(--gt-ink)]/90 px-4 py-2.5 backdrop-blur-xl ${tone}`}
          >
            <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${t.kind === "failed" ? "text-rose-300" : t.kind === "info" ? "text-amber-300" : "text-emerald-300"}`} />
            <span className="font-hanken min-w-0 flex-1 text-content leading-snug">{t.text}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 rounded-full p-0.5 text-white/40 transition hover:text-white"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
