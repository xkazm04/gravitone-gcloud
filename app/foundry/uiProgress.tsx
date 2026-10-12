"use client";

// Progress, save, loading and error notes: ProgressRail, SaveNote, Loading,
// ErrorNote. Split out of ui.tsx (which re-exports them) so the door stays under
// the 200-line cap.

import { AlertTriangle, Check, Loader2 } from "lucide-react";

import { DOT, TONE_TEXT, type Tone } from "./uiNumbers";

/* ── Progress, save, loading, errors ──────────────────────────────────────── */

/** done/total as a thin rail with its figure. */
export function ProgressRail({ done, total, tone = "cyan", className = "" }: { done: number; total: number; tone?: Tone; className?: string }) {
  const p = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div aria-hidden className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        <span className={`absolute inset-y-0 left-0 rounded-full ${DOT[tone]} opacity-80`} style={{ width: `${p * 100}%` }} />
      </div>
      <span aria-hidden className="font-jetbrains text-label tabular-nums text-white/60">
        {done}/{total}
      </span>
      <span className="sr-only">
        {done} of {total}
      </span>
    </div>
  );
}

export type SaveKind = "idle" | "saving" | "saved" | "error";

/** Where the debounced verdict save stands. */
export function SaveNote({ state, final = false }: { state: SaveKind; final?: boolean }) {
  // Nothing to say before the first verdict, and nothing after a commit — the
  // live region is still rendered so the first "saving" is announced.
  if (final) return null;
  if (state === "idle") return <span aria-live="polite" className="sr-only" />;
  const word = state === "saving" ? "saving" : state === "saved" ? "saved" : state === "error" ? "not saved" : "";
  const tone: Tone = state === "error" ? "rose" : state === "saved" ? "emerald" : "neutral";
  return (
    <span aria-live="polite" className={`font-jetbrains inline-flex min-w-[6rem] items-center gap-2 text-label ${TONE_TEXT[tone]}`}>
      {state === "saving" && <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />}
      {state === "saved" && <Check aria-hidden className="h-3.5 w-3.5" />}
      {state === "error" && <AlertTriangle aria-hidden className="h-3.5 w-3.5" />}
      {word}
    </span>
  );
}

export function Loading({ label = "loading" }: { label?: string }) {
  return (
    <div role="status" className="font-jetbrains flex items-center gap-2 py-6 text-label text-white/45">
      <Loader2 aria-hidden className="h-4 w-4 animate-spin text-cyan-300/70" />
      {label}
    </div>
  );
}

/** A real error, verbatim — the work, not narration. */
export function ErrorNote({ children, action, role }: { children: React.ReactNode; action?: React.ReactNode; role?: "alert" }) {
  return (
    <div role={role} className="flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-400/[0.07] px-3.5 py-2.5">
      <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
      <div className="font-hanken min-w-0 flex-1 text-label break-words text-rose-100/90">{children}</div>
      {action}
    </div>
  );
}
