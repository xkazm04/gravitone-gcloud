"use client";

// The two gates at the edges of the Research step: confirming the scope forward
// into Script, and clearing the research backward into nothing.

import Modal from "@/components/ui/Modal";
import { Hint } from "@/components/ui/signal";
import { NOTEBOOK_COUNTS } from "../../_shared/notebook/notebook";
import type { ScopeApi } from "../useScope";

/** Confirming freezes the board as a CHECKPOINT, and says what that is worth.
 *
 *  The copy here used to read "Step 2 is written against this frozen scope.
 *  Change anything here and it must be confirmed again." Both sentences were
 *  false. Nothing outside this directory reads `confirmed` — Step 2 reads the
 *  live scope, and its matrix WRITES to it (`_matrix/shared.tsx`'s ScopePip),
 *  which is why pointing it at the snapshot is not the fix. And nothing made
 *  the creator confirm again: the board stayed editable, the button stayed
 *  disabled at "confirmed", and a card cut after confirming went to the script
 *  with no sign anywhere that the checkpoint no longer described the board.
 *
 *  So the promise is cut and the drift is drawn instead. `api.diverged` names
 *  every card whose kept-or-cut has moved since, and the button comes back to
 *  take a fresh checkpoint. */
export function ConfirmScope({ api }: { api: ScopeApi }) {
  const drifted = api.diverged.length;
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          {/* THE NUMBER STAYS; THE TWO PROSE BRANCHES GO. "How many cards will
              go to the Script step" is the work and is the only thing here a
              reader cannot see anywhere else. The other two branches described
              the surface they were printed on — "The board matches the
              checkpoint you confirmed" is what the eyebrow beside it says in
              two words, and the drift branch's own count and ids are drawn
              below as `moved · <ids>` with a button that reads "confirm again
              →". What survives the trim is the one non-obvious mechanic —
              Script reads the LIVE board, not the checkpoint — and it survives
              behind a disclosure on the state that raises the question. */}
          <p className="font-jetbrains flex items-center gap-1 text-content tracking-[0.16em] text-white/55 uppercase">
            {!api.confirmed ? "confirm the scope" : drifted ? "scope has moved" : "scope confirmed"}
            {!!api.confirmed && drifted > 0 && (
              <Hint variant="warn" tone="amber" label="What the Script step is reading">
                Script reads the live board — confirming moves the checkpoint
              </Hint>
            )}
          </p>
          {!api.confirmed && (
            <p className="font-hanken mt-1.5 max-w-xl text-content text-slate-400">
              {api.summary.kept} of {api.summary.total} cards will go to the Script step.
            </p>
          )}
          {drifted > 0 && (
            <p
              data-testid="scope-diverged"
              className="font-jetbrains mt-1.5 text-label leading-relaxed text-amber-200/85"
            >
              moved · {api.diverged.join(", ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {api.confirmed && (
            <button
              type="button"
              onClick={api.unconfirm}
              className="font-jetbrains rounded-full border border-white/12 px-3.5 py-1.5 text-label text-white/55 transition hover:bg-white/5"
            >
              reopen
            </button>
          )}
          <button
            type="button"
            data-testid="confirm-scope"
            onClick={api.confirm}
            disabled={api.summary.blocked || (!!api.confirmed && drifted === 0)}
            className="font-jetbrains rounded-full border border-cyan-400/40 bg-cyan-400/[0.08] px-4 py-1.5 text-label text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {!api.confirmed ? "confirm scope →" : drifted ? "confirm again →" : "confirmed"}
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
      <div className="space-y-3 text-content leading-relaxed text-slate-300">
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
            className="font-jetbrains rounded-full border border-white/15 px-4 py-1.5 text-label text-white/75 transition hover:bg-white/5"
          >
            keep it
          </button>
          <button
            data-testid="confirm-clear"
            onClick={onConfirm}
            className="font-jetbrains rounded-full border border-rose-400/45 bg-rose-400/10 px-4 py-1.5 text-label text-rose-200 transition hover:bg-rose-400/20"
          >
            clear the research
          </button>
        </div>
      </div>
    </Modal>
  );
}
