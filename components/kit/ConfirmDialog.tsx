"use client";

// THE DESTRUCTIVE CONFIRM. The rail is the sentence: kept on one side, thrown on
// the other, undecided hatched into the thrown side because it is not a third
// outcome. What stays in words is the consequence a destructive confirm is
// entitled to state, the path the judgement is written to, and a real error, which
// keeps the dialog open and says nothing was deleted.
//
// A shell over Modal (focus trap, Escape, scroll lock), drawn in the world the
// surrounding <WorldRoot> declares. State belongs to the caller.

import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Primitives";
import { StackBar, type StackSegment } from "@/components/ui/signal";

export function ConfirmDialog({
  open,
  onClose,
  title,
  eyebrow,
  railLabel,
  rail,
  consequence,
  children,
  busy = false,
  cancelLabel = "Not yet",
  confirmLabel,
  busyLabel = "committing…",
  onConfirm,
  onCancel,
  tone = "danger",
}: {
  open: boolean;
  /** Escape, the scrim, the close mark. The caller decides whether `busy` blocks it. */
  onClose: () => void;
  title: string;
  eyebrow?: React.ReactNode;
  railLabel: string;
  rail: StackSegment[];
  /** What this does and where it is written. Facts, not instructions. */
  consequence: React.ReactNode;
  /** A failure, as an `<ErrorBox role="alert">`. */
  children?: React.ReactNode;
  busy?: boolean;
  cancelLabel?: string;
  /** The button says the arithmetic: "Delete 9, keep 3". */
  confirmLabel: string;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** `danger` for a commit that deletes; `gold` for one that only writes. */
  tone?: "danger" | "gold";
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      eyebrow={eyebrow}
      className="max-w-md"
      footer={
        <div className="k-acts">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="k-confirm">
        <StackBar label={railLabel} segments={rail} />
        <p>{consequence}</p>
        {children}
      </div>
    </Modal>
  );
}
