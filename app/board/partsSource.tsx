"use client";

// A source's state, as the shelf draws it: the tone of a state, its dot colour,
// the pending figure, and the absence that stands in for an unreadable or empty
// source. Split out of parts.tsx along its own banner; the empty-shape drawing
// lives in partsEmpty.tsx to keep each file under the 200-line gate.

import Link from "next/link";
import { ArrowUpRight, Lock, RotateCw, X } from "lucide-react";
import type { SourceState } from "@/lib/board/registry";
import { SOURCE_LABEL } from "@/lib/board/registry";
import type { BoardSourceId } from "@/lib/board/types";
import { SOURCE_ICON } from "./look";
import { EmptyShape } from "./partsEmpty";
import type { BoardApi } from "./useBoard";

/* ── a source's state ─────────────────────────────────────────────────────── */

export type SourceTone = "waiting" | "clear" | "empty" | "locked" | "failed" | "loading";

export function toneOf(state: SourceState): SourceTone {
  switch (state.kind) {
    case "idle":
    case "loading":
      return "loading";
    case "counted":
    case "loaded":
      return (state.count.pending ?? 1) > 0 ? "waiting" : "clear";
    case "empty":
      return "empty";
    case "unavailable":
      return "locked";
    case "error":
      return "failed";
  }
}

/** A dot for the Select and the rail, in the shelf's state colours. */
export const TONE_DOT: Record<SourceTone, string> = {
  waiting: "bg-amber-400",
  clear: "bg-emerald-300",
  empty: "bg-white/25",
  locked: "bg-white/40",
  failed: "bg-rose-400",
  loading: "bg-cyan-300/60",
};

/** The pending figure, or the word for why there is none. */
export function pendingWord(state: SourceState): string {
  switch (state.kind) {
    case "idle":
    case "loading":
      return "…";
    case "counted":
    case "loaded":
      return state.count.pending === null ? "—" : String(state.count.pending);
    case "empty":
      return "0";
    case "unavailable":
      return "n/a";
    case "error":
      return "!";
  }
}

/**
 * What a source shows where its items would be when it has none — composed,
 * never a blank dashed box. Unreadable: the reason verbatim, Retry, and the
 * native surface. Empty: the ghost of the cards that would be here.
 * `compact` is the one-row form a list or a sheet carries between its rolls.
 */
export function SourceAbsence({ id, state, api, compact = false }: { id: BoardSourceId; state: SourceState; api: BoardApi; compact?: boolean }) {
  const native = api.nativeOf(id);
  if (state.kind !== "unavailable" && state.kind !== "error")
    return <EmptyShape icon={id} label={`${SOURCE_LABEL[id]}: nothing waiting`} title={`Nothing in ${SOURCE_LABEL[id]}`} native={native} compact={compact} />;
  const err = state.kind === "error";
  const words = err ? state.message : state.reason;
  const actions = (
    <span className="flex shrink-0 flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => api.reload(id)}
        aria-label={`Retry ${SOURCE_LABEL[id]}`}
        className="font-jetbrains inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-label text-cyan-100 transition hover:bg-cyan-400/20"
      >
        <RotateCw aria-hidden className="h-3.5 w-3.5" />
        Retry
      </button>
      {native && (
        <Link
          href={native.href}
          className="font-jetbrains inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-label text-white/60 transition hover:border-white/25 hover:text-white"
        >
          {native.label}
          <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      )}
    </span>
  );
  if (compact)
    return (
      <div
        role={err ? "alert" : "status"}
        className={`gt-rise flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-3 py-2.5 ${err ? "border-rose-400/25 bg-rose-400/[0.05]" : "border-white/8 bg-white/[0.02]"}`}
      >
        <Medallion id={id} err={err} small />
        <span className="font-instrument text-xl text-white/85">{SOURCE_LABEL[id]}</span>
        <span className={`font-jetbrains min-w-0 flex-1 text-label break-words ${err ? "text-rose-200/85" : "text-white/50"}`}>{words}</span>
        {actions}
      </div>
    );
  return (
    <EmptyShape icon={id} label={`${SOURCE_LABEL[id]}: ${words}`} title={SOURCE_LABEL[id]} medallion={<Medallion id={id} err={err} />} role={err ? "alert" : "status"}>
      <span className={`font-jetbrains max-w-[48ch] text-label break-words ${err ? "text-rose-200/85" : "text-white/55"}`}>{words}</span>
      {actions}
    </EmptyShape>
  );
}

/** A source's glyph with what is wrong with it pinned to the corner. */
function Medallion({ id, err, small = false }: { id: BoardSourceId; err: boolean; small?: boolean }) {
  const Icon = SOURCE_ICON[id];
  return (
    <span
      aria-hidden
      className={`relative flex shrink-0 items-center justify-center rounded-xl border ${small ? "h-10 w-10" : "h-12 w-12"} ${
        err ? "border-rose-400/30 bg-rose-400/10" : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <Icon className={`h-5 w-5 ${err ? "text-rose-200" : "text-white/45"}`} strokeWidth={1.75} />
      <span
        className={`absolute -right-1.5 -bottom-1.5 flex h-5 w-5 items-center justify-center rounded-full border ${
          err ? "border-rose-300/40 bg-rose-500/80" : "border-amber-300/40 bg-[var(--gt-ink)]"
        }`}
      >
        {err ? <X className="h-3 w-3 text-white" strokeWidth={3} /> : <Lock className="h-3 w-3 text-amber-200" />}
      </span>
    </span>
  );
}
