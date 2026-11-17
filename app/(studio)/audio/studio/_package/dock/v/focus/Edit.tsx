"use client";

// THE EDITOR'S ROW (variant "focus"): an editor dialog has the same rows as the read it opens from - the label on the
// left, the control where the value was - so opening it turns the read live rather than showing a different form. A
// field the agent has a value for carries it on one line under the control (a violet dot, the value, Accept), its
// source left to the details. Kit candidates `EditRow`, `AgentLine`.
import type { ReactNode } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import type { ProposalPath } from "@gt/domain/release.record";

import type { ReleaseSessionApi } from "../../../../../_release/session.ts";
import { shown } from "../../../../../_release/wizard/Suggest.tsx";
import s from "./focus.module.css";

export function AgentLine({ path, session }: { readonly path: ProposalPath; readonly session: ReleaseSessionApi }) {
  const mine = session.pending.filter((p) => p.path === path);
  if (mine.length === 0) return null;
  return (
    <>
      {mine.map((p) => {
        const v = shown(p.path, p.value);
        const text = v.kind === "text" ? v.text : v.facts.map((f) => f.v).join(" · ");
        return (
          <span key={p.id} className={s.agentLine} role="group" aria-label={`the agent's value: ${text}`}>
            <span className={s.agentDot} aria-hidden="true" />
            <span className={s.agentText}>{text}</span>
            <Button label="Accept" size="sm" tone="emerald" onPress={() => session.accept([p.id])} />
            <Button label="Dismiss" size="sm" onPress={() => session.dismiss([p.id])} />
          </span>
        );
      })}
    </>
  );
}

export function EditRow({ label, children, path, session, focus }: {
  readonly label: string;
  readonly children: ReactNode;
  readonly path?: ProposalPath;
  readonly session?: ReleaseSessionApi;
  /** The row the lead is about. */
  readonly focus?: boolean;
}) {
  return (
    <div className={s.editRow} data-focus={focus === true ? "" : undefined}>
      <span className={s.editTerm}>{label}</span>
      <div className={s.editCtl}>
        {children}
        {path !== undefined && session !== undefined && <AgentLine path={path} session={session} />}
      </div>
    </div>
  );
}

export function EditGroup({ label, children, action }: { readonly label: string; readonly children: ReactNode; readonly action?: ReactNode }) {
  return (
    <section className={s.editGroup} aria-label={label}>
      <div className={s.readHead}>
        <h3 className={s.readLabel}>{label}</h3>
        {action !== undefined && <span className={s.readAct}>{action}</span>}
      </div>
      {children}
    </section>
  );
}
