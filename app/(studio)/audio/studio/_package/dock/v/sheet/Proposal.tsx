"use client";

// ONE OF THE AGENT'S PROPOSALS, IN THE DIALOG (variant "sheet"): the field it would set, the value set as the sheet
// would print it, where it came from in the agent's words, and accept / dismiss. Only the dialog draws this - the page
// carries a count, never the proposal. A row leaves by collapsing (AnimatePresence in the list that holds it).
// Kit candidate: ProposalRow { proposal, label, onAccept, onDismiss }.
import { Button } from "@gt/ui/components/button/Button.tsx";
import type { ReleaseProposal } from "@gt/domain/release.record";

import { fieldLabel } from "../../../../../_release/pending.ts";
import type { ReleaseSessionApi } from "../../../../../_release/session.ts";
import { shown } from "../../../../../_release/wizard/Suggest.tsx";
import s from "./dialog.module.css";

export function ProposalRow({ p, session }: { readonly p: ReleaseProposal; readonly session: ReleaseSessionApi }) {
  const v = shown(p.path, p.value);
  const label = fieldLabel(p.path);
  return (
    <div className={s.item} data-tone="agent" role="group" aria-label={`suggested ${label}`}>
      <span className={s.dot} aria-hidden="true" />
      <div className={s.itemBody}>
        <span className={s.itemK}>{label}</span>
        {v.kind === "text" ? (
          <span className={s.itemV}>{v.text}</span>
        ) : (
          <dl className={s.facts}>
            {v.facts.map((f) => (
              <div key={`${f.k}:${f.v}`} className={s.fact}>
                <dt>{f.k}</dt>
                <dd>{f.v}</dd>
              </div>
            ))}
          </dl>
        )}
        <span className={s.source}>{p.source}</span>
      </div>
      <span className={s.itemActs}>
        <Button label="Accept" size="sm" tone="emerald" onPress={() => session.accept([p.id])} />
        <Button label="Dismiss" size="sm" onPress={() => session.dismiss([p.id])} />
      </span>
    </div>
  );
}
