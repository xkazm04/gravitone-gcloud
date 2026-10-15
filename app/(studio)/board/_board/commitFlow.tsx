"use client";

// THE COMMIT FLOW, wired: preview the consequence, show it, commit with its token, and when the
// kernel answers 409 stale-preview, preview again and show the fresh one (Phase 3 decision 6).
// The steps are @gt/ui/board/commit.ts `commitFlow`; the plan and its ticketing are the gate's
// (`prepareCommit`, `commit`), so a plan that lands after a cancel is dropped there.
import { useCallback, useState, useSyncExternalStore } from "react";

import type { Consequence } from "@gt/domain/board";
import { AppError } from "@gt/domain/errors";
import type { BoardPacket, CommitReceipt } from "@gt/ui/board/port";
import type { BoardVerdict } from "@gt/ui/board/boardGate";
import type { Gate } from "@gt/ui/board/gate";
import { isStalePreview } from "@gt/ui/board/port";
import { ConsequencePanel } from "@gt/ui/components/consequence/ConsequencePanel.tsx";

type BoardGateT = Gate<BoardPacket, BoardVerdict, Consequence, CommitReceipt>;

export type CommitFlow = {
  readonly open: boolean;
  readonly busy: boolean;
  readonly consequence: Consequence | null;
  readonly refreshed: boolean;
  readonly error?: string;
  readonly start: () => void;
  readonly confirm: () => void;
  readonly cancel: () => void;
};

export function useCommitFlow(gate: BoardGateT, opts: { readonly onDone: () => void; readonly toast: (m: string) => void; readonly announce: (m: string) => void }): CommitFlow {
  const plan = useSyncExternalStore(gate.subscribe, () => gate.getSnapshot().plan, () => gate.getSnapshot().plan);
  const [open, setOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const { onDone, toast, announce } = opts;

  const start = useCallback(() => {
    setOpen(true);
    setRefreshed(false);
    setError(undefined);
    void gate.prepareCommit();
  }, [gate]);

  const cancel = useCallback(() => {
    gate.clearPlan();
    setOpen(false);
    setCommitting(false);
  }, [gate]);

  const confirm = useCallback(() => {
    if (committing || plan.plan === null) return;
    setCommitting(true);
    setError(undefined);
    gate.commit().then(
      (r) => {
        setCommitting(false);
        setOpen(false);
        gate.clearPlan();
        const words = `committed · ${r.kept} kept · ${r.rejected} rejected`;
        toast(words);
        announce(words);
        onDone();
      },
      (e: unknown) => {
        setCommitting(false);
        if (e instanceof AppError && isStalePreview({ error: e.message, code: e.code, ...(e.detail === undefined ? {} : { detail: e.detail }) })) {
          setRefreshed(true);
          void gate.prepareCommit();
          return;
        }
        setError(e instanceof Error ? e.message : "the commit did not land");
      },
    );
  }, [announce, committing, gate, onDone, plan.plan, toast]);

  const shownError = error ?? plan.error ?? undefined;
  return {
    open,
    busy: committing || plan.loading,
    consequence: plan.plan,
    refreshed,
    ...(shownError === undefined ? {} : { error: shownError }),
    start,
    confirm,
    cancel,
  };
}

export function CommitLayer({ flow }: { readonly flow: CommitFlow }) {
  return (
    <ConsequencePanel
      consequence={flow.consequence}
      refreshed={flow.refreshed}
      busy={flow.busy}
      {...(flow.error === undefined ? {} : { error: flow.error })}
      onConfirm={flow.confirm}
      onCancel={flow.cancel}
    />
  );
}
