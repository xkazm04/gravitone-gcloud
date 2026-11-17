"use client";

// A FIELD'S CELL (prototype dock-package, "console"): a mono label over the control, and under it the agent's signal
// for that field when one is waiting (the cell takes the violet edge). `field` is the mark a readout opens the
// editor at (`data-field`).
import type { ReactNode } from "react";

import type { ProposalPath } from "@gt/domain/release.record";

import type { ReleaseSessionApi } from "../../../../../../_release/session.ts";
import { signalled, Signals } from "../Signal.tsx";
import s from "../editor.module.css";

export function Cell({ field, label, path, session, reduce, wide = false, children }: {
  readonly field: string;
  readonly label: string;
  readonly path?: ProposalPath;
  readonly session: ReleaseSessionApi;
  readonly reduce: boolean;
  readonly wide?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className={s.cell} data-field={field} data-w={wide ? "wide" : undefined} data-signal={path !== undefined && signalled(session, path) ? "" : undefined}>
      <span className={s.k} aria-hidden="true">
        {label}
      </span>
      {children}
      {path !== undefined && <Signals paths={[path]} session={session} reduce={reduce} />}
    </div>
  );
}

/** A module: a recessed well on the dialog's panel, its label in mono caps and an optional count beside it. */
export function Module({ label, count, aside, children, field }: { readonly label: string; readonly count?: string; readonly aside?: ReactNode; readonly children: ReactNode; readonly field?: string }) {
  return (
    <section className={s.module} aria-label={label} data-field={field}>
      <header className={s.moduleHead}>
        <span className={s.moduleLabel}>{label}</span>
        {count !== undefined && <span className={s.moduleCount}>{count}</span>}
        {aside !== undefined && <span className={s.moduleAside}>{aside}</span>}
      </header>
      {children}
    </section>
  );
}
