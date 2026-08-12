"use client";

// The two gates at the edges of the Research step: confirming the scope forward
// into Script, and clearing the research backward into nothing.

import Modal from "@/components/ui/Modal";
import { NOTEBOOK_COUNTS } from "../../_shared/notebook/notebook";
import type { ScopeApi } from "../useScope";

/** Freezing the scope is what the Script step reads. Reversible, and says so. */
export function ConfirmScope({ api }: { api: ScopeApi }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-jetbrains text-[11px] tracking-[0.16em] text-white/55 uppercase">
            {api.confirmed ? "scope confirmed" : "confirm the scope"}
          </p>
          <p className="font-hanken mt-1.5 max-w-xl text-sm text-slate-400">
            {api.confirmed
              ? "Step 2 is written against this frozen scope. Change anything here and it must be confirmed again."
              : `${api.summary.kept} of ${api.summary.total} cards will go to the Script step.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {api.confirmed && (
            <button
              onClick={api.unconfirm}
              className="font-jetbrains rounded-full border border-white/12 px-3.5 py-1.5 text-[11px] text-white/55 transition hover:bg-white/5"
            >
              reopen
            </button>
          )}
          <button
            data-testid="confirm-scope"
            onClick={api.confirm}
            disabled={api.summary.blocked || !!api.confirmed}
            className="font-jetbrains rounded-full border border-cyan-400/40 bg-cyan-400/[0.08] px-4 py-1.5 text-[11px] text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {api.confirmed ? "confirmed" : "confirm scope →"}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Clear is destructive once a notebook exists — say what is lost, in units the
 *  creator paid for (six searches), not in units the app cares about (a row). */
export function ClearDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="clear this research?" footer="">
      <div className="space-y-3 text-sm leading-relaxed text-slate-300">
        <p>
          This project has a notebook: <strong>{NOTEBOOK_COUNTS.facts} facts</strong>,{" "}
          {NOTEBOOK_COUNTS.mechanisms} mechanisms and {NOTEBOOK_COUNTS.reversals} reversals, plus
          every scoping decision on the board.
        </p>
        <p className="text-white/60">
          Clearing discards all of it. The research itself cost six searches and cannot be recovered
          from here — it would have to be run again, and a second run will not return the same
          notebook.
        </p>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="font-jetbrains rounded-full border border-white/15 px-4 py-1.5 text-[11px] text-white/75 transition hover:bg-white/5"
          >
            keep it
          </button>
          <button
            data-testid="confirm-clear"
            onClick={onConfirm}
            className="font-jetbrains rounded-full border border-rose-400/45 bg-rose-400/10 px-4 py-1.5 text-[11px] text-rose-200 transition hover:bg-rose-400/20"
          >
            clear the research
          </button>
        </div>
      </div>
    </Modal>
  );
}
