"use client";

// The calendar's small shared marks. Nothing here is a new chip spelling: badges
// are the signal vocabulary's CHIP_CLASS + TALLY_TONE (components/ui/signal/
// Tally.tsx), states are the kit's StatusGlyph, failures are the kit's ErrorBox.

import { useState } from "react";

import { ErrorBox } from "@/components/kit";
import { StatusGlyph, type StatusKind } from "@/components/kit/StatusGlyph";
import { Button } from "@/components/ui/Primitives";
import { CHIP_CLASS, Hint, TALLY_TONE, type TallyTone } from "@/components/ui/signal";
import type { ChannelStatus, SlotStatus } from "@/lib/publish/types";

import { STATUS_WORD } from "./calendarModel";
import type { Fetched, Source } from "./publishClient";

/** A word as a stamp, in the one chip spelling. */
export function Badge({ tone = "neutral", children }: { tone?: TallyTone; children: React.ReactNode }) {
  return <span className={`${CHIP_CLASS} ${TALLY_TONE[tone]} uppercase`}>{children}</span>;
}

/** Marks a screen fed from ./fixtures.ts. Never absent when the source is a
 *  fixture: a fabricated slot must not pass for a scheduled one. */
export function SourceBadge({ source }: { source: Source | null }) {
  if (source !== "fixture") return null;
  return (
    <span className="inline-flex items-center gap-1" data-testid="calendar-fixture-badge">
      <Badge tone="amber">fixture</Badge>
      <Hint tone="amber" variant="warn" label="Why fixture data">
        /api/publish/* answered 404 · dev fixture, in memory
      </Hint>
    </span>
  );
}

export function ModeBadge({ mode }: { mode: "dry" | "live" | null }) {
  if (mode === null) return null;
  return mode === "live" ? <Badge tone="emerald">live</Badge> : <Badge tone="amber">dry run</Badge>;
}

export const CHANNEL_STATUS_WORD: Record<ChannelStatus, string> = { live: "live", dry: "dry run", not_wired: "not wired" };
export const CHANNEL_STATUS_TONE: Record<ChannelStatus, TallyTone> = { live: "emerald", dry: "amber", not_wired: "neutral" };

const STATUS_KIND: Record<SlotStatus, StatusKind> = {
  scheduled: "queued",
  publishing: "live",
  published: "committed",
  failed: "failed",
  missed: "gate",
  cancelled: "reject",
};

/** Block skin per status. Shape carries it too (dashed = needs a person or is
 *  gone), so colour is never the only signal. */
export const STATUS_SKIN: Record<SlotStatus, string> = {
  scheduled: "border-cyan-400/40 bg-cyan-400/10 text-cyan-50",
  publishing: "border-amber-400/45 bg-amber-400/10 text-amber-50",
  published: "border-emerald-400/35 bg-emerald-400/[0.08] text-emerald-50",
  failed: "border-rose-400/50 bg-rose-400/10 text-rose-50",
  missed: "border-dashed border-amber-400/60 bg-amber-400/[0.06] text-amber-50",
  cancelled: "border-dashed border-white/20 text-white/60 line-through",
};

/** The status mark and its word. */
export function SlotState({ status, word = true }: { status: SlotStatus; word?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusGlyph kind={STATUS_KIND[status]} decorative={word} label={STATUS_WORD[status]} />
      {word && <span className="font-jetbrains uppercase tracking-[0.08em]">{STATUS_WORD[status]}</span>}
    </span>
  );
}

/** A failed fetch, verbatim: the route and what it said. */
export function FetchFailure({ r, onRetry }: { r: Extract<Fetched<unknown>, { ok: false }>; onRetry?: () => void }) {
  return (
    <ErrorBox
      action={
        onRetry ? (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    >
      {r.kind === "unavailable" ? "publishing engine unavailable" : "refused"} · {r.path} · {r.error}
    </ErrorBox>
  );
}

/** The last path segment — an export's file name. */
export const basename = (p: string): string => p.split(/[\\/]/).filter(Boolean).at(-1) ?? p;

/** A copy-to-clipboard control for one command. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => setDone("copied"))
          .catch(() => setDone("failed"));
        setTimeout(() => setDone("idle"), 1600);
      }}
      className="font-jetbrains shrink-0 rounded border border-white/15 px-2 py-0.5 text-label text-white/75 transition hover:bg-white/5 hover:text-white"
    >
      {done === "copied" ? "copied" : done === "failed" ? "no clipboard" : "copy"}
    </button>
  );
}

/** Daily deltas as a line. A null day is a GAP, never a dip to zero: the line
 *  breaks there. Fewer than one measured day draws "—". */
export function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const measured = values.filter((v): v is number => v !== null);
  if (measured.length === 0) return <span aria-label={`${label}: not measured`}>—</span>;
  const W = 112;
  const Hh = 26;
  const max = Math.max(1, ...measured);
  const min = Math.min(0, ...measured);
  const x = (i: number) => (values.length <= 1 ? W / 2 : (i / (values.length - 1)) * (W - 4) + 2);
  const y = (v: number) => Hh - 2 - ((v - min) / (max - min || 1)) * (Hh - 4);
  const runs: string[] = [];
  let cur: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (cur.length) runs.push(cur.join(" "));
      cur = [];
    } else cur.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (cur.length) runs.push(cur.join(" "));
  return (
    <svg
      viewBox={`0 0 ${W} ${Hh}`}
      width={W}
      height={Hh}
      role="img"
      aria-label={`${label}: ${values.map((v) => (v === null ? "not measured" : v)).join(", ")}`}
      className="text-cyan-300"
    >
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="stroke-white/15" strokeWidth="1" />
      {runs.map((pts, i) =>
        pts.includes(" ") ? (
          <polyline key={i} points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        ) : (
          <circle key={i} cx={pts.split(",")[0]} cy={pts.split(",")[1]} r="1.8" fill="currentColor" />
        ),
      )}
    </svg>
  );
}
