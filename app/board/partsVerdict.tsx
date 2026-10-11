"use client";

// The verdict control every decision goes through: the dot, the Approve /
// Reject / Clear bar and its icon-only form. Split out of parts.tsx along its
// `verdict` banner; the reject reasons and the facts beside it live in
// partsVerdictSide.tsx to keep each file under the 200-line gate.

import { Check, Lock, LockKeyhole, RotateCcw, X } from "lucide-react";
import { Hint } from "@/components/ui/signal";
import type { BoardEntry } from "@/lib/board/source";
import type { BoardVerdict } from "@/lib/board/types";
import type { BoardApi } from "./useBoard";

/* ── verdict ──────────────────────────────────────────────────────────────── */

/** The state of an item at a glance: an open ring, a kept check, a cut cross. */
export function VerdictDot({ verdict, className = "" }: { verdict: BoardVerdict; className?: string }) {
  if (verdict === "approve")
    return (
      <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/90 text-slate-950 ${className}`}>
        <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
        <span className="sr-only">approved</span>
      </span>
    );
  if (verdict === "reject")
    return (
      <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-400/90 text-slate-950 ${className}`}>
        <X aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
        <span className="sr-only">rejected</span>
      </span>
    );
  return (
    <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 ${className}`}>
      <span className="sr-only">undecided</span>
    </span>
  );
}

type VerdictSize = "lg" | "icon";

const KEY_CAP = "font-jetbrains rounded-md border px-1.5 text-label leading-snug";

/**
 * Approve · Reject · Clear — the one control every decision goes through.
 *
 * A verdict the source cannot take is drawn LOCKED with the source's own
 * reason beside it (lib/board/source.ts `refuse`), never hidden: a missing
 * Reject button reads as a bug, a locked one reads as a rule.
 */
export function VerdictBar({ entry, api, size = "lg", className = "" }: { entry: BoardEntry; api: BoardApi; size?: VerdictSize; className?: string }) {
  const { item, refuse } = entry;
  const busy = api.busy.has(item.id);
  const v = item.verdict;
  const go = (next: BoardVerdict) => void api.decide(entry, next);
  const refusal = refuse.reject ?? null;

  if (size === "icon")
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`} aria-busy={busy}>
        <IconVerdict tone="approve" on={v === "approve"} locked={Boolean(refuse.approve)} label={`Approve ${item.title}`} onClick={() => go("approve")} />
        <IconVerdict tone="reject" on={v === "reject"} locked={Boolean(refuse.reject)} label={`Reject ${item.title}`} onClick={() => go("reject")} />
      </span>
    );

  const base =
    "group inline-flex h-14 flex-1 items-center gap-3 rounded-2xl border px-5 font-hanken text-content transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed";
  const approveCls =
    v === "approve"
      ? "border-emerald-300/70 bg-emerald-400/20 text-white ring-2 ring-emerald-300/25 shadow-lg shadow-emerald-500/10"
      : "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-100 hover:border-emerald-300/50 hover:bg-emerald-400/[0.12]";
  const rejectCls = refuse.reject
    ? "border-white/8 bg-white/[0.02] text-white/35"
    : v === "reject"
      ? "border-rose-300/70 bg-rose-400/20 text-white ring-2 ring-rose-300/25 shadow-lg shadow-rose-500/10"
      : "border-rose-400/25 bg-rose-400/[0.06] text-rose-100 hover:border-rose-300/50 hover:bg-rose-400/[0.12]";
  const clearable = v !== null && !refuse.clear;

  return (
    <div className={`flex w-full items-center gap-2.5 ${className}`} role="group" aria-label={`Verdict on ${item.title}`} aria-busy={busy}>
      <button
        type="button"
        aria-pressed={v === "approve"}
        aria-label={`Approve ${item.title} (A)`}
        disabled={busy || Boolean(refuse.approve)}
        onClick={() => go("approve")}
        className={`${base} ${approveCls}`}
      >
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${v === "approve" ? "bg-emerald-300 text-slate-950" : "bg-emerald-400/15 text-emerald-200"}`}>
          <Check aria-hidden className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <span>{v === "approve" ? "Approved" : "Approve"}</span>
        <kbd aria-hidden className={`${KEY_CAP} ml-auto border-emerald-300/25 text-emerald-200/70`}>
          A
        </kbd>
      </button>
      <button
        type="button"
        aria-pressed={v === "reject"}
        aria-label={refuse.reject ? `Reject is refused: ${refuse.reject}` : `Reject ${item.title} (X)`}
        disabled={busy || Boolean(refuse.reject)}
        onClick={() => go("reject")}
        className={`${base} ${rejectCls}`}
      >
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full ${
            refuse.reject ? "bg-white/[0.05] text-white/40" : v === "reject" ? "bg-rose-300 text-slate-950" : "bg-rose-400/15 text-rose-200"
          }`}
        >
          {refuse.reject ? <LockKeyhole aria-hidden className="h-3.5 w-3.5" /> : <X aria-hidden className="h-4 w-4" strokeWidth={2.5} />}
        </span>
        <span>{v === "reject" ? "Rejected" : "Reject"}</span>
        <kbd aria-hidden className={`${KEY_CAP} ml-auto ${refuse.reject ? "border-white/10 text-white/25" : "border-rose-300/25 text-rose-200/70"}`}>
          X
        </kbd>
      </button>
      <button
        type="button"
        aria-label={refuse.clear ? `Clear is refused: ${refuse.clear}` : `Clear the verdict on ${item.title} (U)`}
        disabled={busy || !clearable}
        onClick={() => go(null)}
        className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/55 transition hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-35"
      >
        <RotateCcw aria-hidden className="h-4 w-4" />
      </button>
      {refusal && (
        <Hint variant="lock" tone="amber" label="Why reject is refused">
          {refusal}
        </Hint>
      )}
    </div>
  );
}

function IconVerdict({ tone, on, locked, label, onClick }: { tone: "approve" | "reject"; on: boolean; locked: boolean; label: string; onClick: () => void }) {
  const Icon = locked ? Lock : tone === "approve" ? Check : X;
  const cls = locked
    ? "border-white/10 bg-black/50 text-white/35"
    : tone === "approve"
      ? on
        ? "border-emerald-300 bg-emerald-300 text-slate-950"
        : "border-emerald-300/40 bg-black/55 text-emerald-200 hover:bg-emerald-400/30"
      : on
        ? "border-rose-300 bg-rose-300 text-slate-950"
        : "border-rose-300/40 bg-black/55 text-rose-200 hover:bg-rose-400/30";
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={locked}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${cls}`}
    >
      <Icon aria-hidden className="h-4 w-4" strokeWidth={2.5} />
    </button>
  );
}
