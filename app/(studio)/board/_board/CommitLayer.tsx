"use client";

// The commit's dialogs: the held-back ask and the consequence panel. Only a commit opens them, so
// they are their own chunk (./LazyCommit.tsx fetches it when the desk is idle, ahead of the first
// commit); the flow's state (./commitFlow.tsx) stays eager.
import { useEffect, useRef } from "react";

import { useLayer } from "@gt/ui/layers/useLayer";
import { Button } from "@gt/ui/components/button/Button.tsx";
import c from "@gt/ui/components/consequence/Consequence.module.css";
import { ConsequencePanel } from "@gt/ui/components/consequence/ConsequencePanel.tsx";

import type { CommitFlow } from "./commitFlow.tsx";

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

export default function CommitLayer({ flow }: { readonly flow: CommitFlow }) {
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
