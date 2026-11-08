"use client";

// THE COMMIT FLOW, wired: preview the consequence, show it, commit with its token, and when the
// kernel answers 409 stale-preview, preview again and show the fresh one (Phase 3 decision 6).
// The steps are @gt/ui/board/commit.ts `commitFlow`; the plan and its ticketing are the gate's
// (`prepareCommit`, `commit`), so a plan that lands after a cancel is dropped there.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { Consequence } from "@gt/domain/board";
import { isAppError } from "@gt/domain/errors";
import type { BoardPacket, CommitReceipt } from "@gt/ui/board/port";
import type { BoardVerdict } from "@gt/ui/board/boardGate";
import type { Gate } from "@gt/ui/board/gate";
import { isStalePreview } from "@gt/ui/board/port";
import { useLayer } from "@gt/ui/layers/useLayer";
import { Button } from "@gt/ui/components/button/Button.tsx";
import c from "@gt/ui/components/consequence/Consequence.module.css";
import { ConsequencePanel } from "@gt/ui/components/consequence/ConsequencePanel.tsx";

type BoardGateT = Gate<BoardPacket, BoardVerdict, Consequence, CommitReceipt>;

export type CommitFlow = {
  readonly open: boolean;
  readonly busy: boolean;
  readonly consequence: Consequence | null;
  readonly refreshed: boolean;
  readonly error?: string;
  /** What the commit leaves behind in tabs never opened, asked first (a statement of consequence), or null. */
  readonly asking: readonly string[] | null;
  /** Commit; handed `heldBack` lines, it asks about them before it previews. */
  readonly start: (heldBack?: readonly string[]) => void;
  readonly proceed: () => void;
  readonly dismiss: () => void;
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

  const [asking, setAsking] = useState<readonly string[] | null>(null);
  const begin = useCallback(() => {
    setAsking(null);
    setOpen(true);
    setRefreshed(false);
    setError(undefined);
    void gate.prepareCommit();
  }, [gate]);
  // A deliberate partial still works: the ask is only a pause before the same preview.
  const start = useCallback((heldBack?: readonly string[]) => (heldBack !== undefined && heldBack.length > 0 ? setAsking(heldBack) : begin()), [begin]);
  const dismiss = useCallback(() => setAsking(null), []);

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
        // A commit in parts names what went on to the remainder packet (spark scout-storyboards).
        const words = `committed · ${r.kept} kept · ${r.rejected} rejected${r.undecided === undefined ? "" : ` · ${r.undecided} later`}`;
        toast(words);
        announce(words);
        onDone();
      },
      (e: unknown) => {
        setCommitting(false);
        if (isAppError(e) && isStalePreview({ error: e.message, code: e.code, ...(e.detail === undefined ? {} : { detail: e.detail }) })) {
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
    asking,
    start,
    proceed: begin,
    dismiss,
    confirm,
    cancel,
  };
}

/** The statement of what a partial commit leaves in tabs never opened, before the preview: Commit goes on, Back returns to the desk. */
function HeldBack({ lines, onConfirm, onCancel }: { readonly lines: readonly string[]; readonly onConfirm: () => void; readonly onCancel: () => void }) {
  const panel = useRef<HTMLDivElement | null>(null);
  useLayer(true, { kind: "dialog", panelRef: panel, onClose: onCancel });
  useEffect(() => {
    const buttons = panel.current?.querySelectorAll("button");
    buttons?.[buttons.length - 1]?.focus();
  }, []);
  return (
    <div className={c.backdrop}>
      <div ref={panel} className={c.panel} role="alertdialog" aria-modal="true" aria-label="Commit · tabs never opened">
        <div className={c.head}>
          <h3 className={c.title}>Commit</h3>
        </div>
        <ul className={c.rows}>
          {lines.map((line) => (
            <li key={line} className={c.amber}>
              {line}
            </li>
          ))}
        </ul>
        <div className={c.foot}>
          <Button label="Back" onPress={onCancel} />
          <Button label="Commit" tone="amber" onPress={onConfirm} />
        </div>
      </div>
    </div>
  );
}

export function CommitLayer({ flow }: { readonly flow: CommitFlow }) {
  if (flow.asking !== null) return <HeldBack lines={flow.asking} onConfirm={flow.proceed} onCancel={flow.dismiss} />;
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
