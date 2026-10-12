"use client";

// The keep / reject controls and the verdict drawn on a picture: VerdictButtons,
// VerdictStamp, verdictRing. Split out of ui.tsx (which re-exports them) so the
// door stays under the 200-line cap.

import { Check, RotateCcw, X } from "lucide-react";

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
