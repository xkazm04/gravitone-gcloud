"use client";

// THE ANSWER A MOVE ASKS FOR — a rework note, a finalize label, a confirmation
// for a move that spends money.
//
// The authority said, through `admits()`, what it will require; this is where the
// hand supplies it, BEFORE the write, so the refusal happens in the dialog
// instead of as a 409 after it. The prompt's words and the cost's figures are the
// authority's, shown verbatim.
//
// THE DIALOG DOES NOT CLOSE UNTIL THE WRITE HAS SUCCEEDED. Confirming calls the
// move and waits: while it is in flight the controls are inert, and if the
// authority refuses, the dialog stays up carrying the authority's own words (and
// is retryable if the failure was). Cancel is the only way out that does not move
// the card, and it is unavailable while a request is in flight — closing then
// would hide the answer of a write the user cannot take back.
//
// A drag that ends in this dialog has ENDED: the pointer mode is over and the
// dialog is a separate state, not a drag that survived. Cancelling returns the
// card home exactly as an Escape mid-drag would have.

import { useState } from "react";

import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Primitives";
import { TextArea, TextInput } from "@/components/ui/Field";
import type { MoveCost, MoveNeed } from "@/lib/board/pipeline";

import { costLine } from "./moves";

export interface PromptAnswer {
  note?: string;
  label?: string;
  live?: boolean;
}

export type PromptOutcome = { ok: true } | { ok: false; reason: string; retryable: boolean };

export default function MovePrompt({
  title,
  verb,
  need,
  prompt,
  cost,
  onSubmit,
  onCancel,
}: {
  /** The card's title, or "3 cards". */
  title: string;
  /** What the confirm button says: the destination. */
  verb: string;
  need: MoveNeed;
  prompt: string;
  cost?: MoveCost;
  onSubmit: (a: PromptAnswer) => Promise<PromptOutcome>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ reason: string; retryable: boolean } | null>(null);
  const valid = need === "confirm" || text.trim().length > 0;

  const submit = async () => {
    if (busy || !valid) return;
    setBusy(true);
    setFailure(null);
    const answer: PromptAnswer = need === "note" ? { note: text.trim() } : need === "label" ? { label: text.trim() } : { live: true };
    const r = await onSubmit(answer);
    // On success the owner closes this dialog; only a failure is ours to show.
    if (!r.ok) {
      setFailure({ reason: r.reason, retryable: r.retryable });
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={title}
      onClose={() => {
        if (!busy) onCancel();
      }}
      className="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy || !valid} aria-busy={busy}>
            {failure?.retryable ? "Retry" : verb}
          </Button>
        </div>
      }
    >
      <div
        onKeyDown={(e) => {
          // Enter submits from the one-line field only; a note keeps its Enter, and a focused button keeps its own.
          if (e.key === "Enter" && need === "label" && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault();
            void submit();
          }
        }}
        className="flex flex-col gap-3"
      >
        <p className="font-hanken text-content text-white/90">{prompt}</p>
        {cost && <p className="font-jetbrains text-label text-amber-200/90">{costLine(cost)}</p>}
        {need === "note" && <TextArea autoFocus rows={3} aria-label="Note" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />}
        {need === "label" && <TextInput autoFocus aria-label="Label" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />}
        {failure && <p className="font-hanken text-content text-rose-200">{failure.reason}</p>}
      </div>
    </Modal>
  );
}
