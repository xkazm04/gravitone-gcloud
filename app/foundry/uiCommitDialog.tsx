"use client";

// The commit confirm and the plan it waits on: CommitDialog, useCommitPlan,
// PlanFact. Split out of ui.tsx (which re-exports them) so the door stays under
// the 200-line cap. useCommitPlan lives here beside the dialog whose plan it
// prepares.

import { useCallback, useRef, useState } from "react";

import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Primitives";
import { StackBar, type StackSegment } from "@/components/ui/signal";

/* ── The commit confirm ───────────────────────────────────────────────────── */

/**
 * A destructive confirm: the rail of what will happen, the consequence in
 * full (a destructive confirm is entitled to its sentence — CLAUDE.md's
 * standing exemption), and a failure rendered INSIDE the dialog by the caller,
 * because aria-modal hides everything behind it.
 */
export function CommitDialog({
  open,
  onClose,
  title,
  eyebrow,
  rail,
  railLabel,
  consequence,
  busy,
  preparing = false,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: React.ReactNode;
  rail: StackSegment[];
  railLabel: string;
  consequence: React.ReactNode;
  busy: boolean;
  /** The server is still computing the plan this confirm commits against:
   *  the confirm waits for it, Cancel does not. */
  preparing?: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** A commit that deletes; false for one that only writes. */
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      eyebrow={eyebrow}
      className="max-w-xl"
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy || preparing} className={danger ? "!px-5 !py-2" : "!px-5 !py-2"}>
            {busy ? "committing…" : preparing ? "Preparing…" : confirmLabel}
          </Button>
        </div>
      }
    >
      <StackBar segments={rail} label={railLabel} />
      <p className="font-hanken mt-4 text-content leading-relaxed text-white/75 [&_code]:font-jetbrains [&_code]:text-label [&_code]:text-cyan-200/90">{consequence}</p>
      {children}
    </Modal>
  );
}

/**
 * The server's plan for a commit, asked for when its confirm opens.
 *
 * The plan carries the counts the server WILL apply and a token over the
 * verdicts and catalogue it was computed from; the commit sends the token back
 * and the server refuses (409) if either moved in between, so the numbers on
 * the confirm are the numbers committed (lib/foundry/commitPlan.ts).
 *
 * A ticket, not a flag, guards the answer: a plan that lands after the dialog
 * was cancelled, or after another run was selected, belongs to a question
 * nobody is asking any more and must not be held as this commit's plan.
 */
export function useCommitPlan<P>() {
  const [plan, setPlan] = useState<P | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ticket = useRef(0);

  const clear = useCallback(() => {
    ticket.current++;
    setPlan(null);
    setLoading(false);
    setError(null);
  }, []);

  const prepare = useCallback((ask: () => Promise<P>) => {
    const mine = ++ticket.current;
    setPlan(null);
    setError(null);
    setLoading(true);
    ask().then(
      (p) => {
        if (mine !== ticket.current) return;
        setPlan(p);
        setLoading(false);
      },
      (e) => {
        if (mine !== ticket.current) return;
        setError(e instanceof Error ? e.message : "could not prepare the commit plan");
        setLoading(false);
      },
    );
  }, []);

  return { plan, loading, error, prepare, clear };
}

/** One fact of a commit plan the server returned, under the consequence. */
export function PlanFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="mt-3 text-label text-white/60">
      {label}: <span className="font-jetbrains text-white/85">{children}</span>
    </p>
  );
}
