"use client";

// The decision bar and its parts: DecisionBar, BarCount, LockNote, PrimaryAction.
// Split out of ui.tsx (which re-exports them) so the door stays under the 200-line
// cap.

import { Button } from "@/components/ui/Primitives";

import { Dot } from "./uiLabels";
import { TONE_TEXT, type Tone } from "./uiNumbers";
import { Rise } from "./uiSurfaces";

/* ── The decision bar ─────────────────────────────────────────────────────── */

/**
 * What a cull has decided, and the one button that makes it final — a glass
 * capsule floating over the bottom of the page.
 *
 * Centred and capped rather than full-width: the bar has five things on it and
 * a 1760px bar spends most of its length on nothing, and the capsule leaves the
 * bottom-right corner to the page's own controls.
 */
export function DecisionBar({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <Rise className="pointer-events-auto">
        <div
          role="region"
          aria-label={label}
          className="gt-float flex max-w-[min(960px,calc(100vw-2rem))] flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/10 bg-[var(--gt-ink)]/85 px-5 py-3 backdrop-blur-xl"
        >
          {children}
        </div>
      </Rise>
    </div>
  );
}

/** A count on the bar: dot, figure, word. */
export function BarCount({ tone, n, of, label }: { tone: Tone; n: number; of?: number; label: string }) {
  return (
    <span className="font-jetbrains inline-flex items-center gap-2 text-label text-white/60">
      <Dot tone={tone} />
      <span className={`tabular-nums ${n > 0 ? TONE_TEXT[tone] : "text-white/40"}`}>
        {n}
        {of !== undefined && <span className="text-white/40">/{of}</span>}
      </span>
      {label}
    </span>
  );
}

/** Why the primary action will not go, in one clause beside it. */
export function LockNote({ children }: { children: React.ReactNode }) {
  return <span className="font-jetbrains text-label text-amber-200/80">{children}</span>;
}

/** The primary action's button: the shared CTA, at the bar's size. */
export function PrimaryAction({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <Button disabled={disabled} onClick={onClick} className="!px-5 !py-2 disabled:cursor-not-allowed">
      {children}
    </Button>
  );
}
