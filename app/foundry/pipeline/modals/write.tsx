"use client";

// WHAT EVERY DIALOG HERE SHARES: the write, and the two ways it can end badly.
//
// THE DRY PATH IS A RESULT, NOT A SILENCE. `MoveResult` says so in
// lib/board/pipeline.ts: `stub` rides on the SUCCESS variant, so a caller that
// commits on `ok` alone draws a move that never happened. `useWrite` reads
// `isStubbedMove` and, when it is true, holds the dialog open carrying
// `wouldCall` — the route that was NOT called, verbatim. That string is the
// receipt the STUB arm is worth having.

import { useCallback, useState } from "react";

import { Unplug } from "lucide-react";

import { isStubbedMove, type CanonStage, type MoveCost, type MoveResult } from "@/lib/board/pipeline";

import { ErrorNote, Label } from "../../ui";

export type Arm = "stub" | "live";

/** What a dialog does when it is confirmed: the shell builds the `MoveRequest`
 *  (it owns the arm and the layout) and this is what comes back. */
export type RunMove = (note?: string) => Promise<MoveResult>;

/** A move the operator can order from the detail surface, as the authority
 *  described it. `to`/`band` are what the shell will send. */
export interface OfferedMove {
  to: CanonStage;
  band: string | null;
  needs: "note" | "confirm";
  prompt: string;
  cost?: MoveCost;
  /** The destination's word, for the button. */
  verb: string;
}

/* ── the shared tail of a write dialog ────────────────────────────────────── */

type Phase = { kind: "idle" } | { kind: "busy" } | { kind: "stub"; wouldCall: string } | { kind: "failed"; reason: string; retryable: boolean };

/** Run a move, keep the dialog's phase, and close only on a REAL success. */
export function useWrite(run: RunMove, onDone: () => void) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const submit = useCallback(
    async (note?: string) => {
      setPhase({ kind: "busy" });
      const r = await run(note);
      if (!r.ok) {
        setPhase({ kind: "failed", reason: r.reason, retryable: r.retryable });
        return;
      }
      // A dry move is a success of the DRY path: nothing was written, so the
      // dialog has not finished its job until the operator has read what would
      // have been called.
      if (isStubbedMove(r)) {
        setPhase({ kind: "stub", wouldCall: r.wouldCall ?? "" });
        return;
      }
      setPhase({ kind: "idle" });
      onDone();
    },
    [run, onDone],
  );
  return { phase, submit, reset: useCallback(() => setPhase({ kind: "idle" }), []) };
}

export function Receipt({ wouldCall }: { wouldCall: string }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.07] px-3.5 py-2.5">
      <Unplug aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <div className="min-w-0 flex-1">
        <Label>not called</Label>
        <p className="font-jetbrains mt-1 text-label break-words text-amber-100/90">{wouldCall}</p>
      </div>
    </div>
  );
}

export function Failure({ reason }: { reason: string }) {
  return (
    <div className="mt-4">
      <ErrorNote>{reason}</ErrorNote>
    </div>
  );
}

/* ── 1. the money gate ────────────────────────────────────────────────────── */

/**
 * The confirm for a move that spends. The authority's `prompt` names the vendor
 * or the seat and its `cost` carries the figures; both are rendered verbatim,
 * because a price and a vendor are the WORK.
 *
 * In STUB the same figures are shown as what a LIVE dispatch would cost, and
 * the confirm is a dry run: nothing is written and nothing is spent.
 */
