"use client";

// THE MONEY GATE. One of CLAUDE.md's three standing exemptions from the
// narration law: the real figures and the real vendor belong here verbatim,
// because a destructive confirm's statement of consequence is the product
// working rather than the app explaining itself.
//
// The figures are the AUTHORITY'S, read off the `MoveCost` that `admits()`
// returned, never retyped here — `costLine` (../moves.ts) is the one formatter.

import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Primitives";

import { costLine } from "../moves";
import { Label } from "../../ui";
import { Failure, Receipt, useWrite, type Arm, type OfferedMove, type RunMove } from "./write";

export function DispatchConfirm({
  open,
  title,
  move,
  arm,
  run,
  onClose,
}: {
  open: boolean;
  /** The card's own title. */
  title: string;
  move: OfferedMove;
  arm: Arm;
  run: RunMove;
  onClose: () => void;
}) {
  const { phase, submit, reset } = useWrite(run, onClose);
  const busy = phase.kind === "busy";
  const done = phase.kind === "stub";
  const line = costLine(move.cost);
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      eyebrow={<Label>{move.verb}</Label>}
      className="max-w-xl"
      footer={
        <div className="flex items-center justify-end gap-3">
          {!done && (
            <Button variant="ghost" size="sm" onClick={close} disabled={busy}>
              Cancel
            </Button>
          )}
          {done ? (
            <Button size="sm" onClick={close}>
              Close
            </Button>
          ) : (
            <Button
              size="sm"
              variant={arm === "live" ? "danger" : "primary"}
              onClick={() => void submit()}
              disabled={busy}
              aria-busy={busy}
              data-testid="pipeline-dispatch-confirm"
            >
              {busy ? "dispatching…" : phase.kind === "failed" && phase.retryable ? "Retry" : arm === "live" ? move.verb : "Dry run"}
            </Button>
          )}
        </div>
      }
    >
      <p className="font-hanken text-content leading-relaxed text-white/90">{move.prompt}</p>
      {line && (
        <p className={`font-jetbrains mt-3 text-label ${arm === "live" ? "text-amber-200/90" : "text-white/55"}`}>
          {line}
        </p>
      )}
      {arm === "stub" && (
        <p className="font-hanken mt-3 text-content leading-relaxed text-white/70">Nothing is written and nothing is spent.</p>
      )}
      {phase.kind === "stub" && <Receipt wouldCall={phase.wouldCall} />}
      {phase.kind === "failed" && <Failure reason={phase.reason} />}
    </Modal>
  );
}

/* ── 2. the rework note ───────────────────────────────────────────────────── */

/**
 * A move back to drafting, which the authority refuses without the operator's
 * instruction — that instruction is what the draft turn is fed.
 *
 * `maxLength` is `NOTE_MAX_CHARS` from lib/articles/types.ts. It used to live in
 * engine.ts, which imports `node:child_process` and is server-only, so no
 * client could reach it - and the field was built with no bound at all, letting
 * the operator type past the limit and lose the note to a 400. RunView.tsx had
 * answered the same problem with a bare `maxLength={2000}`, a second copy
 * already drifting from the server's number. The constant moved to types.ts
 * (client-safe, where `RUN_COST_HINT` lives), engine.ts re-exports and still
 * enforces it, and both fields now read the one number: the bound is the
 * server's, the hint is the client's. The route's refusal is still rendered
 * verbatim below, because a bound is not a guarantee.
 */
