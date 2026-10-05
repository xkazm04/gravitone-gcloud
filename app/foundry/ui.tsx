"use client";

// THE FOUNDRY'S OWN LEAVES — the parts every /foundry surface draws with.
//
// These replace the kit (components/kit) on this route, and the reason is one
// the operator gave in a sentence: the page looked "like looking at wireframes"
// (2026-10-05). The kit is the Almanac print idiom — square corners, dashed
// edges for anything empty, flat 7%-white fields, caps labels everywhere —
// remapped onto Obsidian colours, and on this ground it reads as a blueprint of
// a page rather than the page. /projects and /library never used it, and they
// are the bar: glass panels off `SURFACE`, `rounded-2xl` outer and `rounded-xl`
// inner, white/8 hairlines that lift to white/15 on hover, cyan for what is
// selected, and the four state tones (emerald done, amber needs a call, rose
// broken, cyan working) spelled the way app/_projects/parts.tsx STATE_TONE and
// components/ui/signal TALLY_TONE already spell them.
//
// Foundry-local on purpose. Each of these has exactly one reader family (this
// route's four tabs); promoting one to components/ui is a decision for when a
// second route wants it, not a guess made now.
//
// No colour literal: every colour is a Tailwind palette utility or a --gt-* var.

import { AlertTriangle, Check, Copy, Hourglass, ImageOff, Loader2, RotateCcw, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Primitives";
import { CHIP_CLASS, StackBar, TALLY_TONE, type StackSegment, type TallyTone } from "@/components/ui/signal";
import { EASE, SURFACE } from "@/components/ui/tokens";
import { usePrefersReducedMotion } from "@/components/ui/motionPreference";

import type { PlantState } from "./parts";

/* ── Numbers ──────────────────────────────────────────────────────────────── */

/** A score as a percentage, or an em dash when it was never measured. */
export function pct(v: number | null | undefined): string {
  return typeof v === "number" ? `${Math.round(v * 100)}%` : "—";
}

export type Grade = "held" | "partial" | "missed" | "ungraded";

/** The thresholds every score on this route is read against — the same three
 *  the kit's ScoreChip used (components/kit/Magnitude.tsx), so a number did not
 *  change meaning when its drawing did. */
export function gradeOf(v: number | null | undefined): Grade {
  return typeof v !== "number" ? "ungraded" : v >= 0.75 ? "held" : v >= 0.5 ? "partial" : "missed";
}

const GRADE_SPOKEN: Record<Grade, string> = { held: "held", partial: "partly held", missed: "did not hold", ungraded: "not graded" };

/* ── Tones ────────────────────────────────────────────────────────────────── */

export type Tone = TallyTone;

/** A plant state's tone: cyan is the forge at work, amber is a human's turn,
 *  rose is broken, emerald is finished. */
export const STATE_TONE: Record<PlantState, Tone> = {
  live: "cyan",
  ready: "amber",
  inc: "amber",
  gate: "amber",
  failed: "rose",
  committed: "emerald",
};

const DOT: Record<Tone, string> = {
  neutral: "bg-white/40",
  cyan: "bg-cyan-300",
  emerald: "bg-emerald-300",
  amber: "bg-amber-300",
  rose: "bg-rose-400",
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-white/60",
  cyan: "text-cyan-200",
  emerald: "text-emerald-200",
  amber: "text-amber-200",
  rose: "text-rose-200",
};

const GRADE_TONE: Record<Grade, Tone> = { held: "emerald", partial: "amber", missed: "rose", ungraded: "neutral" };

const GRADE_FILL: Record<Grade, string> = {
  held: "bg-emerald-300/80",
  partial: "bg-amber-300/80",
  missed: "bg-rose-400/80",
  ungraded: "bg-transparent",
};

/* ── Small labels ─────────────────────────────────────────────────────────── */

/** The small mono caps label — for a section's name or a figure's unit, never
 *  for a sentence. */
export function Label({ children, className = "", as: Tag = "span" }: { children: React.ReactNode; className?: string; as?: "span" | "h2" | "h3" | "h4" | "p" | "div" }) {
  return <Tag className={`font-jetbrains text-label tracking-[0.16em] text-white/40 uppercase ${className}`}>{children}</Tag>;
}

/** A status dot; `live` pulses (CSS, so the reduced-motion blanket rule in
 *  globals.css stops it for free). */
export function Dot({ tone, pulse = false, className = "" }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span aria-hidden className={`relative inline-flex h-2 w-2 shrink-0 ${className}`}>
      {pulse && <span className={`absolute inset-0 animate-ping rounded-full opacity-60 ${DOT[tone]}`} />}
      <span className={`relative h-2 w-2 rounded-full ${DOT[tone]}`} />
    </span>
  );
}

/** A plant state as a pill: a dot and the run's own status word. */
export function StatusChip({ kind, word, className = "" }: { kind: PlantState; word: string; className?: string }) {
  const tone = STATE_TONE[kind];
  return (
    <span className={`font-jetbrains inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-label whitespace-nowrap ${TALLY_TONE[tone]} ${className}`}>
      <Dot tone={tone} pulse={kind === "live"} />
      {word}
    </span>
  );
}

/** A score as a chip with its own small meter, so a column of them reads as a
 *  bar chart before a single number is read. */
export function ScorePill({ label, value, className = "" }: { label: string; value: number | null | undefined; className?: string }) {
  const g = gradeOf(value);
  return (
    <span className={`${CHIP_CLASS} ${TALLY_TONE[GRADE_TONE[g]]} ${className}`}>
      <span aria-hidden className="opacity-70">
        {label}
      </span>
      <span aria-hidden className="relative h-1.5 w-6 overflow-hidden rounded-full bg-white/10 @max-[17rem]:hidden">
        <span className={`absolute inset-y-0 left-0 rounded-full ${GRADE_FILL[g]}`} style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
      </span>
      <span aria-hidden className="tabular-nums">
        {pct(value)}
      </span>
      <span className="sr-only">
        {label} {pct(value)}, {GRADE_SPOKEN[g]}
      </span>
    </span>
  );
}

/** The two flags a grade can carry beside its scores. */
export function FlagPill({ kind }: { kind: "text" | "unmeasured" }) {
  return kind === "text" ? (
    <span className={`${CHIP_CLASS} ${TALLY_TONE.rose}`}>text</span>
  ) : (
    <span className={`${CHIP_CLASS} ${TALLY_TONE.amber}`}>unmeasured</span>
  );
}

/* ── Verdicts ─────────────────────────────────────────────────────────────── */

export type VerdictValue = "keep" | "reject";

/**
 * Keep / reject (/ clear) as two round glass buttons. Idempotent by default:
 * Keep keeps however many times it is pressed. `toggle` makes pressing the
 * active one clear it (the Extract board's rule); `clear` adds the U button
 * once something is decided (the Dojo's). Every click stops propagation so a
 * button inside a clickable tile or row never also focuses or opens it twice.
 */
export function VerdictButtons({
  value,
  onVerdict,
  subject,
  keepWord = "Keep",
  size = "md",
  toggle = false,
  clear = false,
  className = "",
}: {
  value: VerdictValue | null | undefined;
  onVerdict: (v: VerdictValue | null) => void;
  /** What the verdict is about, for the accessible name. */
  subject: string;
  keepWord?: string;
  size?: "sm" | "md";
  toggle?: boolean;
  clear?: boolean;
  className?: string;
}) {
  const box = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const ico = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const base = `inline-flex ${box} cursor-pointer items-center justify-center rounded-full border backdrop-blur-md transition focus-visible:outline-2 focus-visible:outline-offset-2`;
  const press = (v: VerdictValue) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onVerdict(toggle && value === v ? null : v);
  };
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        aria-pressed={value === "keep"}
        aria-label={`${keepWord} ${subject} (K)`}
        onClick={press("keep")}
        className={`${base} ${
          value === "keep"
            ? "border-emerald-300/70 bg-emerald-300 text-slate-950"
            : "border-white/15 bg-black/45 text-emerald-200 hover:border-emerald-300/60 hover:bg-emerald-300/15"
        }`}
      >
        <Check aria-hidden className={ico} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        aria-pressed={value === "reject"}
        aria-label={`Reject ${subject} (X)`}
        onClick={press("reject")}
        className={`${base} ${
          value === "reject"
            ? "border-rose-300/70 bg-rose-400 text-slate-950"
            : "border-white/15 bg-black/45 text-rose-200 hover:border-rose-400/60 hover:bg-rose-400/15"
        }`}
      >
        <X aria-hidden className={ico} strokeWidth={2.5} />
      </button>
      {clear && value && (
        <button
          type="button"
          aria-label={`Clear ${subject} (U)`}
          onClick={(e) => {
            e.stopPropagation();
            onVerdict(null);
          }}
          className={`${base} border-white/15 bg-black/45 text-white/70 hover:border-white/30 hover:text-white`}
        >
          <RotateCcw aria-hidden className={ico} />
        </button>
      )}
    </span>
  );
}

/** The verdict stamped on a picture — the Library proof sheet's APPROVED
 *  badge (app/library/parts.tsx ProofThumb), in the cull's two words. */
export function VerdictStamp({ verdict, keepWord = "kept", className = "" }: { verdict: VerdictValue; keepWord?: string; className?: string }) {
  return (
    <span
      className={`font-jetbrains pointer-events-none inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-label font-semibold tracking-[0.12em] uppercase text-slate-950 ${
        verdict === "keep" ? "bg-emerald-300/95" : "bg-rose-400/95"
      } ${className}`}
    >
      {verdict === "keep" ? <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} /> : <X aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />}
      {verdict === "keep" ? keepWord : "rejected"}
    </span>
  );
}

/** The ring a verdict puts round a picture. */
export function verdictRing(v: VerdictValue | null | undefined): string {
  return v === "keep" ? "ring-2 ring-emerald-300/80" : v === "reject" ? "ring-2 ring-rose-400/70" : "ring-1 ring-white/10";
}

/* ── Pictures ─────────────────────────────────────────────────────────────── */

export type ArtState = "ready" | "queued" | "generating" | "failed" | "deleted" | "missing" | "blank";

const ABSENT: Record<Exclude<ArtState, "ready" | "blank">, { icon: typeof Hourglass; word: string; tone: string }> = {
  queued: { icon: Hourglass, word: "queued", tone: "text-white/45" },
  generating: { icon: Loader2, word: "generating", tone: "text-cyan-200/90" },
  failed: { icon: AlertTriangle, word: "failed", tone: "text-rose-300/90" },
  deleted: { icon: X, word: "culled", tone: "text-white/40" },
  missing: { icon: ImageOff, word: "no image", tone: "text-white/40" },
};

/**
 * A picture in a rounded frame, or the honest absence of one.
 *
 * Absence is a WASH, not a hole: the diagonal `--gt-wash` the frames step draws
 * behind an ungenerated plate, a glyph, and the one word for why — queued,
 * failed, culled. A dashed rectangle with nothing in it was the old drawing of
 * the same fact, and it read as a page nobody had finished.
 */
export function Art({
  src,
  alt,
  state = src ? "ready" : "missing",
  className = "aspect-video",
  rounded = "rounded-xl",
  fit = "cover",
  absentWord,
  children,
}: {
  src?: string | null;
  alt: string;
  state?: ArtState;
  className?: string;
  rounded?: string;
  fit?: "cover" | "contain";
  /** The one word for an absence, when the default ("no image") is not the
   *  work's own — a style with no render yet says so. */
  absentWord?: string;
  /** Overlays — stamps, chips, controls — positioned by the caller. */
  children?: React.ReactNode;
}) {
  // `blank` is the wash alone — a slot in a mosaic that has nothing to show
  // yet, where a glyph and a word in every cell would be noise.
  // A src that 404s is an absence too. styles.json names kept renders by the
  // path they had on the machine that forged them; on another checkout the
  // file is not there, and the browser's broken-image glyph is the one drawing
  // of absence this frame must never fall back to. Keyed by the src that
  // failed, so a new src gets its own chance.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const broken = Boolean(src) && failedSrc === src;
  // Glyph only, no word: a broken file is most often a 60px mosaic slot,
  // where "NO IMAGE" cannot fit and the glyph alone says it.
  const shown: ArtState = broken ? "missing" : state;
  const a = shown === "ready" || shown === "blank" ? null : ABSENT[shown];
  const wordless = broken && !absentWord;
  return (
    <div className={`relative overflow-hidden bg-white/[0.03] ${rounded} ${className}`}>
      {src && shown === "ready" ? (
        // eslint-disable-next-line @next/next/no-img-element -- served off local disk through /api/foundry/file; nothing for next/image to optimise
        <img src={src} alt={alt} loading="lazy" onError={() => setFailedSrc(src)} className={`absolute inset-0 h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`} />
      ) : (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5"
          style={{ backgroundImage: "linear-gradient(135deg, var(--gt-wash), transparent 70%)" }}
        >
          {a && (
            <>
              <a.icon aria-hidden className={`h-5 w-5 ${a.tone} ${state === "generating" ? "animate-spin" : ""}`} />
              {!wordless && (
                <span className={`font-jetbrains text-label tracking-[0.12em] uppercase ${a.tone}`}>{absentWord ?? a.word}</span>
              )}
              <span className="sr-only">{alt}</span>
            </>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/* ── Progress, save, loading, errors ──────────────────────────────────────── */

/** done/total as a thin rail with its figure. */
export function ProgressRail({ done, total, tone = "cyan", className = "", showFigure = true }: { done: number; total: number; tone?: Tone; className?: string; showFigure?: boolean }) {
  const p = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div aria-hidden className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        <span className={`absolute inset-y-0 left-0 rounded-full ${DOT[tone]} opacity-80`} style={{ width: `${p * 100}%` }} />
      </div>
      {showFigure && (
        <span className="font-jetbrains text-label tabular-nums text-white/60">
          {done}/{total}
        </span>
      )}
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

/* ── Surfaces ─────────────────────────────────────────────────────────────── */

/** The glass panel, at the route's own weight. `SURFACE` is the one spelling. */
export function Glass({ children, className = "", as: Tag = "div", id }: { children: React.ReactNode; className?: string; as?: "div" | "section" | "aside" | "article"; id?: string }) {
  return (
    <Tag id={id} className={`${SURFACE} rounded-2xl ${className}`}>
      {children}
    </Tag>
  );
}

/** Entrance-only rise, reduced-motion safe. 220ms on the one curve. */
export function Rise({ children, className = "", delay = 0, as = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" }) {
  const still = usePrefersReducedMotion();
  const M = as === "section" ? motion.section : as === "li" ? motion.li : motion.div;
  return (
    <M
      className={className}
      initial={still ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE, delay: still ? 0 : delay }}
    >
      {children}
    </M>
  );
}

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

/* ── The commit confirm ───────────────────────────────────────────────────── */

/**
 * A destructive confirm: the rail of what will happen, the consequence in
 * full (a destructive confirm is entitled to its sentence — CLAUDE.md's
 * standing exemption), and a failure rendered INSIDE the dialog by the caller,
 * because aria-modal hides everything behind it.
 */
export function CommitDialog({
  open,
  onClose,
  title,
  eyebrow,
  rail,
  railLabel,
  consequence,
  busy,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: React.ReactNode;
  rail: StackSegment[];
  railLabel: string;
  consequence: React.ReactNode;
  busy: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** A commit that deletes; false for one that only writes. */
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      eyebrow={eyebrow}
      className="max-w-xl"
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy} className={danger ? "!px-5 !py-2" : "!px-5 !py-2"}>
            {busy ? "committing…" : confirmLabel}
          </Button>
        </div>
      }
    >
      <StackBar segments={rail} label={railLabel} />
      <p className="font-hanken mt-4 text-content leading-relaxed text-white/75 [&_code]:font-jetbrains [&_code]:text-label [&_code]:text-cyan-200/90">{consequence}</p>
      {children}
    </Modal>
  );
}

/* ── The command, copyable ────────────────────────────────────────────────── */

/** A shell command drawn as one: prompt glyphs, mono, and a copy button that
 *  says when it worked. */
export function CommandCard({ lines, label, className = "" }: { lines: string[]; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  const copy = () => {
    navigator.clipboard?.writeText(lines.join("\n")).then(
      () => {
        setCopied(true);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1600);
      },
      () => undefined,
    );
  };
  return (
    <figure className={`overflow-hidden rounded-xl border border-white/10 bg-black/40 ${className}`}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-white/8 bg-white/[0.03] px-3.5 py-2">
        <span className="flex items-center gap-1.5" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-rose-400/50" />
          <span className="h-2 w-2 rounded-full bg-amber-300/50" />
          <span className="h-2 w-2 rounded-full bg-emerald-300/50" />
        </span>
        <span className="sr-only">{label}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy: ${label}`}
          className={`font-jetbrains inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-0.5 text-label transition ${
            copied ? "border-emerald-300/40 text-emerald-200" : "border-white/10 text-white/55 hover:border-white/25 hover:text-white"
          }`}
        >
          {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
          {copied ? "copied" : "copy"}
        </button>
      </figcaption>
      <pre className="font-jetbrains px-4 py-3 text-label leading-7 break-normal whitespace-pre-wrap text-white/85">
        {lines.map((l) => (
          <div key={l} className="flex gap-3">
            <span aria-hidden className="text-cyan-300/70 select-none">
              $
            </span>
            <span className="min-w-0">{l}</span>
          </div>
        ))}
      </pre>
    </figure>
  );
}

/** The forge's command — one definition, because three variants show it and a
 *  path drawn three times is a path that gets fixed twice. */
export const FORGE_COMMAND = ["cd pipeline/foundry", "python forge.py plans/dry-run.json"];
