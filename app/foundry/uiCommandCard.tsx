"use client";

// The copyable command card and the forge's command: CommandCard, FORGE_COMMAND.
// Split out of ui.tsx (which re-exports them) so the door stays under the 200-line
// cap.

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

/** The forge's command — one definition, so the path is fixed in one place
 *  whichever surface shows it next. */
export const FORGE_COMMAND = ["cd pipeline/foundry", "python forge.py plans/dry-run.json"];
