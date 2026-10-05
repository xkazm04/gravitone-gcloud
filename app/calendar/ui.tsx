"use client";

// THE CALENDAR'S SMALL PARTS, in the Projects/Library idiom (app/_projects/
// parts.tsx STATE_TONE, app/library/PresetRail.tsx): glass, rounded, hairlines
// at white/8, state in four tones — cyan working, amber needs a call, rose
// broke, emerald done. Nothing here is a kit part: round 1 drew this page in
// the kit's print idiom and it read as a wireframe on Obsidian.
//
// A status is never colour alone: every chip carries a glyph AND its word.

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Film,
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Lock,
  Radio,
  TimerOff,
  Unlink,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { CHIP_CLASS, TALLY_TONE, type TallyTone } from "@/components/ui/signal";
import type { ChannelId, ChannelStatus, ScheduleSlot, SlotStatus } from "@/lib/publish/types";

import { needsDecision, STATUS_WORD } from "./calendarModel";
import type { Fetched } from "./publishClient";

/* ── tone ─────────────────────────────────────────────────────────────── */

export type Tone = "cyan" | "amber" | "rose" | "emerald" | "neutral";

export const TONE_TEXT: Record<Tone, string> = {
  cyan: "text-cyan-200",
  amber: "text-amber-200",
  rose: "text-rose-200",
  emerald: "text-emerald-200",
  neutral: "text-white/55",
};
export const TONE_RULE: Record<Tone, string> = {
  cyan: "bg-cyan-300",
  amber: "bg-amber-300",
  rose: "bg-rose-400",
  emerald: "bg-emerald-300",
  neutral: "bg-white/25",
};
export const TONE_RING: Record<Tone, string> = {
  cyan: "border-cyan-300/35",
  amber: "border-amber-300/55",
  rose: "border-rose-400/55",
  emerald: "border-emerald-300/35",
  neutral: "border-white/10",
};

/** A drifted slot (still `scheduled`, `error` says why it will not fire) is its
 *  own state on screen: it waits on a person like a missed one does. */
export type SlotLook = SlotStatus | "drifted";
export const lookOf = (s: Pick<ScheduleSlot, "status" | "error">): SlotLook =>
  s.status === "scheduled" && s.error !== null ? "drifted" : s.status;

export const LOOK: Record<SlotLook, { tone: Tone; Icon: LucideIcon; word: string }> = {
  scheduled: { tone: "cyan", Icon: Clock3, word: STATUS_WORD.scheduled },
  publishing: { tone: "cyan", Icon: Radio, word: STATUS_WORD.publishing },
  published: { tone: "emerald", Icon: CheckCircle2, word: STATUS_WORD.published },
  failed: { tone: "rose", Icon: AlertTriangle, word: STATUS_WORD.failed },
  missed: { tone: "amber", Icon: TimerOff, word: STATUS_WORD.missed },
  cancelled: { tone: "neutral", Icon: Ban, word: STATUS_WORD.cancelled },
  drifted: { tone: "amber", Icon: Unlink, word: "drifted" },
};

export function StatusChip({ slot, className = "" }: { slot: Pick<ScheduleSlot, "status" | "error">; className?: string }) {
  const l = LOOK[lookOf(slot)];
  return (
    <span className={`${CHIP_CLASS} ${TALLY_TONE[l.tone === "neutral" ? "neutral" : l.tone]} uppercase ${className}`}>
      <l.Icon aria-hidden className={`h-3.5 w-3.5 ${slot.status === "publishing" ? "animate-pulse" : ""}`} />
      {l.word}
    </span>
  );
}

/** A chip laid over a poster sits on its own ink seat: the chip's tint is a
 *  wash meant for the glass ground, and over a pale frame it would vanish. */
export function OnImage({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex rounded bg-[var(--gt-ink)]/85 backdrop-blur ${className}`}>{children}</span>;
}

/** Just the glyph in a small round seat, for a card corner. Named for a reader. */
export function StatusDot({ slot, className = "" }: { slot: Pick<ScheduleSlot, "status" | "error">; className?: string }) {
  const l = LOOK[lookOf(slot)];
  return (
    <span
      role="img"
      aria-label={l.word}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border bg-[var(--gt-ink)]/80 backdrop-blur ${TONE_RING[l.tone]} ${TONE_TEXT[l.tone]} ${className}`}
    >
      <l.Icon aria-hidden className="h-3.5 w-3.5" />
    </span>
  );
}

export const decides = (s: Pick<ScheduleSlot, "status" | "error">) => needsDecision(s);

/* ── channels ─────────────────────────────────────────────────────────── */

/** A platform's mark, drawn in currentColor: identity by SHAPE, so colour stays
 *  free to mean state. Generic glyphs (a play tile, a note, a lens), not the
 *  platforms' artwork. */
export function ChannelGlyph({ id, className = "h-5 w-5" }: { id: ChannelId; className?: string }) {
  if (id === "youtube") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none">
        <rect x="2.5" y="5" width="19" height="14" rx="4.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" />
      </svg>
    );
  }
  if (id === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none">
        <path
          d="M13.5 3.5v11.2a3.3 3.3 0 1 1-3.3-3.3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path d="M13.5 3.5c.4 2.6 2.2 4.3 5 4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3.8" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17" cy="7" r="1.1" fill="currentColor" />
    </svg>
  );
}

export const CHANNEL_STATUS_WORD: Record<ChannelStatus, string> = { live: "live", dry: "dry run", not_wired: "not wired" };
export const CHANNEL_TONE: Record<ChannelStatus, Tone> = { live: "emerald", dry: "amber", not_wired: "neutral" };

/** The mark in its tile, the tile tinted by the channel's readiness. */
export function ChannelTile({
  id,
  status,
  size = "md",
}: {
  id: ChannelId;
  status: ChannelStatus | null;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "lg" ? "h-14 w-14 rounded-2xl" : size === "md" ? "h-10 w-10 rounded-xl" : "h-7 w-7 rounded-lg";
  const glyph = size === "lg" ? "h-7 w-7" : size === "md" ? "h-5 w-5" : "h-4 w-4";
  const skin =
    status === "live"
      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100 shadow-[0_0_24px_-6px_var(--gt-accent-emerald)]"
      : status === "dry"
        ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-100 shadow-[0_0_24px_-8px_var(--gt-glow-cyan)]"
        : "border-white/10 bg-white/[0.03] text-white/40";
  return (
    <span aria-hidden className={`relative inline-flex shrink-0 items-center justify-center border ${box} ${skin}`}>
      <ChannelGlyph id={id} className={glyph} />
      {status === "not_wired" && (
        <span className="absolute -right-1.5 -bottom-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-[var(--gt-ink)] text-white/60">
          <Lock className="h-3 w-3" />
        </span>
      )}
    </span>
  );
}

export function ChannelStatusChip({ status }: { status: ChannelStatus }) {
  const tone = CHANNEL_TONE[status];
  return (
    <span className={`${CHIP_CLASS} ${TALLY_TONE[tone as TallyTone]} uppercase`}>
      {status === "not_wired" ? (
        <Lock aria-hidden className="h-3.5 w-3.5" />
      ) : (
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${TONE_RULE[tone]} ${status === "live" ? "animate-pulse" : ""}`} />
      )}
      {CHANNEL_STATUS_WORD[status]}
    </span>
  );
}

export function ModeChip({ mode }: { mode: "dry" | "live" | null }) {
  if (mode === null) return null;
  return mode === "live" ? (
    <span className={`${CHIP_CLASS} ${TALLY_TONE.emerald} uppercase`} data-testid="calendar-mode">
      <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
      live
    </span>
  ) : (
    <span className={`${CHIP_CLASS} ${TALLY_TONE.amber} uppercase`} data-testid="calendar-mode">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-300" />
      dry run
    </span>
  );
}

/* ── controls ─────────────────────────────────────────────────────────── */

/** A round glyph-only button. `label` is its name — required, it has no text. */
export function IconButton({
  label,
  onClick,
  children,
  className = "",
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
    >
      {children}
    </button>
  );
}

/** A pill group: one choice of a few, drawn like the Projects shelf's chips. */
export function Pills<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.02] p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`font-jetbrains rounded-full px-3 py-1 text-label transition ${
              on ? "bg-cyan-400/12 text-cyan-100 shadow-[inset_0_0_0_1px_var(--gt-ring-cyan)]" : "text-white/55 hover:text-white/85"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Copy one line to the clipboard; the glyph answers. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        const done = (s: "copied" | "failed") => {
          setState(s);
          setTimeout(() => setState("idle"), 1600);
        };
        if (!navigator.clipboard) done("failed");
        else navigator.clipboard.writeText(text).then(() => done("copied"), () => done("failed"));
      }}
      className={`font-jetbrains inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-label transition ${
        state === "copied"
          ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
          : state === "failed"
            ? "border-rose-400/40 bg-rose-400/10 text-rose-100"
            : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white"
      }`}
    >
      {state === "copied" ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
      <span aria-live="polite">{state === "copied" ? "copied" : state === "failed" ? "no clipboard" : "copy"}</span>
    </button>
  );
}

/** Where an export comes from: the Cut step of a project. A real link, drawn
 *  over an empty shelf at full strength (components/ui/signal/Ghost.tsx: the
 *  one thing the person can press is never faded with the outline). */
export function CutAnExport({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/projects"
      className={`font-jetbrains inline-flex items-center gap-2 rounded-full border border-cyan-300/35 bg-[var(--gt-ink)]/80 px-4 py-2 text-label text-cyan-50 backdrop-blur transition hover:bg-cyan-400/15 ${className}`}
    >
      <Film aria-hidden className="h-4 w-4 text-cyan-300" />
      Cut an export
      <ArrowRight aria-hidden className="h-4 w-4" />
    </Link>
  );
}

/* ── failure, verbatim ────────────────────────────────────────────────── */

export function FailureCard({
  r,
  onRetry,
  className = "",
}: {
  r: Extract<Fetched<unknown>, { ok: false }>;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-3 rounded-2xl border border-rose-400/25 bg-rose-400/[0.06] px-4 py-3 ${className}`}
    >
      <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-rose-300" />
      <span className="font-jetbrains text-label text-rose-100/90">
        {r.kind === "unavailable" ? "engine unavailable" : `refused · ${r.status || "network"}`}
      </span>
      <code className="font-jetbrains min-w-0 grow text-label break-all text-white/70">
        {r.path} · {r.error}
      </code>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="font-jetbrains rounded-lg border border-white/15 px-3 py-1 text-label text-white/80 transition hover:bg-white/[0.06]"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/** One refusal line under a control: the engine's words, verbatim. */
export function Refusal({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="font-jetbrains flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] px-3 py-2 text-label break-words text-rose-100/90">
      <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/* ── toasts ───────────────────────────────────────────────────────────── */

export interface Toast {
  id: number;
  tone: "ok" | "failed";
  text: string;
}
export type PushToast = (t: { tone: "ok" | "failed"; text: string; sticky?: boolean }) => void;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push: PushToast = useCallback(
    ({ tone, text, sticky }) => {
      seq.current += 1;
      const id = seq.current;
      setToasts((t) => [...t.slice(-3), { id, tone, text }]);
      if (!sticky) setTimeout(() => dismiss(id), 5200);
    },
    [dismiss],
  );
  return { toasts, push, dismiss };
}

export function ToastTray({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "failed" ? "alert" : "status"}
          className={`gt-float pointer-events-auto flex max-w-[44rem] items-center gap-3 rounded-full border bg-[var(--gt-ink)]/90 py-2 pr-2 pl-4 backdrop-blur-xl ${
            t.tone === "failed" ? "border-rose-400/35" : "border-emerald-300/25"
          }`}
        >
          {t.tone === "failed" ? (
            <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-rose-300" />
          ) : (
            <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0 text-emerald-300" />
          )}
          <span className="font-jetbrains min-w-0 truncate text-label text-white/85">{t.text}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => onDismiss(t.id)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/45 transition hover:bg-white/[0.08] hover:text-white"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── a figure over time ───────────────────────────────────────────────── */

/** Daily deltas as a row of bars, one per day. A null day is a GAP — a short
 *  hatched stub on the baseline, never a bar of zero — and a negative delta
 *  hangs below it. Nothing measured at all draws "—". */
export function Sparkline({
  values,
  label,
  width = 132,
  height = 34,
}: {
  values: (number | null)[];
  label: string;
  width?: number;
  height?: number;
}) {
  const measured = values.filter((v): v is number => v !== null);
  if (measured.length === 0)
    return (
      <span className="font-jetbrains text-white/35" aria-label={`${label}: not measured`}>
        —
      </span>
    );
  const W = width;
  const H = height;
  const max = Math.max(1, ...measured);
  const min = Math.min(0, ...measured);
  const base = H - 2 - ((0 - min) / (max - min || 1)) * (H - 4);
  const slot = W / Math.max(values.length, 7);
  const bw = Math.max(3, slot * 0.62);
  const x0 = W - slot * values.length;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`${label}: ${values.map((v) => (v === null ? "not measured" : v)).join(", ")}`}
      className="overflow-visible text-cyan-300"
    >
      <line x1="0" x2={W} y1={base} y2={base} className="stroke-white/10" strokeWidth="1" />
      {values.map((v, i) => {
        const x = x0 + i * slot + (slot - bw) / 2;
        if (v === null)
          return <rect key={i} x={x} y={base - 3} width={bw} height={3} rx={1} className="fill-white/20" />;
        const y = H - 2 - ((v - min) / (max - min || 1)) * (H - 4);
        return (
          <rect
            key={i}
            x={x}
            y={Math.min(y, base)}
            width={bw}
            height={Math.max(1.5, Math.abs(base - y))}
            rx={1.5}
            fill="currentColor"
            opacity={i === values.length - 1 ? 1 : 0.55}
          />
        );
      })}
    </svg>
  );
}

/** A section heading in the Library's register: modest Instrument name, a
 *  count, and a hairline that runs to the edge. */
export function SectionHead({
  id,
  title,
  children,
  accent,
}: {
  id?: string;
  title: string;
  children?: React.ReactNode;
  accent?: Tone;
}) {
  return (
    <div className="flex items-center gap-3">
      {accent && <span aria-hidden className={`h-5 w-1 rounded-full ${TONE_RULE[accent]}`} />}
      <h2 id={id} className="font-instrument text-2xl leading-none text-white">
        {title}
      </h2>
      {children}
      <span aria-hidden className="h-px grow bg-gradient-to-r from-white/10 to-transparent" />
    </div>
  );
}
