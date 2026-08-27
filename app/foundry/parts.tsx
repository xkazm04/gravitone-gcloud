"use client";

// Small shared pieces of the /foundry surface: score chips, verdict stamps,
// the status word for a run. Nothing here fetches.

import type { ExtractStatus } from "@/lib/foundry/extract/types";
import type { Candidate, RunStatus, Verdict } from "@/lib/foundry/types";

export const STATUS_WORD: Record<RunStatus, string> = {
  created: "queued",
  annotating: "annotating sources",
  generating: "generating",
  grading: "grading",
  done: "ready to cull",
  failed: "failed",
  committed: "committed",
};

export const LIVE: RunStatus[] = ["created", "annotating", "generating", "grading"];

export const EXTRACT_STATUS_WORD: Record<ExtractStatus, string> = {
  created: "ready to start",
  reading: "reading sources",
  grouping: "grouping into styles",
  replicating: "replicating",
  transferring: "transferring",
  done: "ready to cull",
  failed: "failed",
  committed: "committed",
};

export const EXTRACT_LIVE: ExtractStatus[] = ["created", "reading", "grouping", "replicating", "transferring"];

export function pct(x: number | null | undefined): string {
  return typeof x === "number" ? `${Math.round(100 * x)}%` : "—";
}

/** Craft / style score as a chip. Colour is a reading aid, not a verdict:
 *  the registry is explicit that an automatic grade points at where to look. */
export function ScoreChip({ label, value }: { label: string; value: number | null | undefined }) {
  const tone =
    typeof value !== "number"
      ? "border-amber-400/30 text-amber-200/80"
      : value >= 0.75
        ? "border-emerald-400/30 text-emerald-200"
        : value >= 0.5
          ? "border-white/15 text-white/70"
          : "border-rose-400/30 text-rose-200/90";
  return (
    <span className={`font-jetbrains rounded border bg-black/50 px-1 py-0.5 text-[9px] tracking-wide ${tone}`}>
      {label} {pct(value)}
    </span>
  );
}

export function VetoChip({ candidate }: { candidate: Candidate }) {
  if (candidate.grade?.veto?.has_text)
    return (
      <span className="font-jetbrains rounded border border-rose-400/50 bg-rose-400/20 px-1 py-0.5 text-[9px] font-semibold tracking-wide text-rose-100">
        TEXT
      </span>
    );
  if (candidate.status === "unmeasured")
    return (
      <span className="font-jetbrains rounded border border-amber-400/40 bg-amber-400/15 px-1 py-0.5 text-[9px] tracking-wide text-amber-100">
        unmeasured
      </span>
    );
  return null;
}

export function VerdictStamp({ verdict }: { verdict: Verdict | undefined }) {
  if (!verdict) return null;
  return verdict === "keep" ? (
    <span className="font-jetbrains pointer-events-none absolute top-1 left-1.5 rounded bg-emerald-300/90 px-1.5 py-0.5 text-[9px] font-semibold text-slate-950">
      KEPT
    </span>
  ) : (
    <span className="font-jetbrains pointer-events-none absolute top-1 left-1.5 rounded bg-rose-400/90 px-1.5 py-0.5 text-[9px] font-semibold text-slate-950">
      REJECTED
    </span>
  );
}

export const VERDICT_RING: Record<Verdict | "none", string> = {
  keep: "border-emerald-300/60",
  reject: "border-rose-400/40 opacity-45",
  none: "border-white/10",
};

/** Credit → colour, the same three-way reading the vlm-probe gallery uses. */
export function creditTone(v: number | undefined): string {
  if (v === 1) return "text-emerald-300";
  if (v === 0.5) return "text-amber-300";
  if (v === 0) return "text-rose-300";
  return "text-white/40";
}
