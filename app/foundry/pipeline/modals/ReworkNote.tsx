"use client";

// A MOVE BACK TO DRAFTING REQUIRES THE OPERATOR'S INSTRUCTION, and this is the
// door you open deliberately. The engine collects the same note when the move is
// dragged (../MovePrompt.tsx); both ends feed the same draft turn.
//
// `NOTE_MAX_CHARS` is the SERVER's bound, imported rather than retyped: the
// field's limit and the route's refusal have to be one number or the field lies.

import { useState } from "react";

import Modal from "@/components/ui/Modal";
import { TextArea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Primitives";
import { NOTE_MAX_CHARS } from "@/lib/articles/types";

import { costLine } from "../moves";
import { Label } from "../../ui";
import { Failure, Receipt, useWrite, type Arm, type OfferedMove, type RunMove } from "./write";

export function ReworkNote({
  open,
  title,
  move,
  arm,
  run,
  onClose,
}: {
  open: boolean;
  title: string;
  move: OfferedMove;
  arm: Arm;
  run: RunMove;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const { phase, submit, reset } = useWrite(run, onClose);
  const busy = phase.kind === "busy";
  const done = phase.kind === "stub";
  const line = costLine(move.cost);
  const valid = text.trim().length > 0;
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
      className="max-w-lg"
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
              onClick={() => void submit(text.trim())}
              disabled={busy || !valid}
              aria-busy={busy}
              data-testid="pipeline-rework-confirm"
            >
              {busy ? "sending…" : phase.kind === "failed" && phase.retryable ? "Retry" : arm === "live" ? move.verb : "Dry run"}
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
      <TextArea
        autoFocus
        rows={4}
        maxLength={NOTE_MAX_CHARS}
        aria-label="Rework note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy || done}
        className="mt-3"
        data-testid="pipeline-rework-note"
      />
      {phase.kind === "stub" && <Receipt wouldCall={phase.wouldCall} />}
      {phase.kind === "failed" && <Failure reason={phase.reason} />}
    </Modal>
  );
}

/* ── 3. the detail, in two mounts ─────────────────────────────────────────── */
