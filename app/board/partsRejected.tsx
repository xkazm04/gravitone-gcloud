"use client";

// The read-only stamp for an item in the Rejected lane, with its undo when this
// session can undo it. Split out of parts.tsx along its own banner.

import { Undo2 } from "lucide-react";
import type { BoardEntry } from "@/lib/board/source";
import type { BoardApi } from "./useBoard";
import { VerdictDot } from "./partsVerdict";
import { NativeLink } from "./partsVerdictSide";

/* ── the rejected lane ────────────────────────────────────────────────────── */

/** Read-only: a rejected item is shown, not re-decided, in the Rejected lane.
 *  Undo is offered for decisions made in this session — the stack is the
 *  session's — and a rejection from an earlier one goes back to its native
 *  surface. */
export function RejectedStamp({ entry, api, className = "" }: { entry: BoardEntry; api: BoardApi; className?: string }) {
  const { item } = entry;
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] px-4 py-3 ${className}`}>
      <VerdictDot verdict="reject" />
      <span className="font-jetbrains text-label tracking-[0.14em] text-rose-100/85 uppercase">rejected</span>
      {item.reasons.length > 0 && (
        <span className="font-jetbrains text-label text-rose-100/60">
          <span className="sr-only">reasons: </span>
          {item.reasons.join(" · ")}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2">
        {api.canUndo(item.id) ? (
          <button
            type="button"
            onClick={() => void api.undoItem(item.id)}
            aria-label={`Undo the rejection of ${item.title}`}
            className="font-jetbrains inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-label text-white/80 transition hover:border-white/30 hover:text-white"
          >
            <Undo2 aria-hidden className="h-3.5 w-3.5" />
            Undo
          </button>
        ) : (
          <NativeLink entry={entry} />
        )}
      </span>
    </div>
  );
}
