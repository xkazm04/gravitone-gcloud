"use client";

// The board's own small parts. The waveform, the play button, the provider
// and term chips and the score meter are the lab's shared atoms
// (app/playground/shared/README.md); what is here is only what the board
// alone needs.

import { useState } from "react";

import { Check, Copy } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A stored ISO time as "5 Oct 14:02" — no clock read, so a render stays pure. */
export const when = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function CopyButton({ text, label, children, className = "" }: { text: string; label: string; children?: React.ReactNode; className?: string }) {
  const [done, setDone] = useState<"ok" | "blocked" | null>(null);
  return (
    <button
      type="button"
      data-nodrag
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone("ok");
        } catch {
          setDone("blocked");
        }
        setTimeout(() => setDone(null), 1600);
      }}
      className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 font-jetbrains text-label transition ${
        done === "ok"
          ? "border-emerald-400/40 text-emerald-200"
          : done === "blocked"
            ? "border-rose-400/40 text-rose-200"
            : "border-white/12 text-white/65 hover:border-white/25 hover:text-white"
      } ${className}`}
    >
      {done === "ok" ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {done === "ok" ? "copied" : done === "blocked" ? "clipboard blocked" : children}
    </button>
  );
}
