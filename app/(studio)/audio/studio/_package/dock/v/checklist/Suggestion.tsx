"use client";

// ONE AGENT SUGGESTION IN THE DIALOG (prototype dock-package, round 2, variant "checklist"; kit candidate
// `Suggestion`): the value as its field would show it, the agent's source verbatim, Accept and Dismiss. The page never
// shows a source; the dialog is where it is read.
import { Button } from "@gt/ui/components/button/Button.tsx";
import type { ReleaseProposal } from "@gt/domain/release.record";

import { fieldLabel } from "../../../../../_release/pending.ts";
import type { ReleaseSessionApi } from "../../../../../_release/session.ts";
import { shown } from "../../../../../_release/wizard/Suggest.tsx";
import { StateMark } from "./ItemList.tsx";
import d from "./detail.module.css";

export function Suggestion({ p, session, field }: { readonly p: ReleaseProposal; readonly session: ReleaseSessionApi; readonly field?: boolean }) {
  const v = shown(p.path, p.value);
  return (
    <div className={d.suggestion} role="group" aria-label={`suggested ${fieldLabel(p.path)}`}>
      <div className={d.sgHead}>
        <StateMark mark="agent" />
        <span className={d.sgWho}>{field === true ? fieldLabel(p.path) : "agent"}</span>
      </div>
      {v.kind === "text" ? (
        <p className={d.sgValue}>{v.text}</p>
      ) : (
        <dl className={d.sgFacts}>
          {v.facts.map((f) => (
            <div key={`${f.k}:${f.v}`}>
              <dt>{f.k}</dt>
              <dd>{f.v}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className={d.sgSource}>{p.source}</p>
      <div className={d.sgActs}>
        <Button label="Accept" size="sm" tone="violet" onPress={() => session.accept([p.id])} />
        <Button label="Dismiss" size="sm" onPress={() => session.dismiss([p.id])} />
      </div>
    </div>
  );
}
