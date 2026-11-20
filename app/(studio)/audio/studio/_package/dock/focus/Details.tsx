"use client";

// THE LEAD'S DETAILS (variant "focus"): everything the page does not show, on one press - every problem of the step in
// the store's own words (PROBLEM_TEXT, verbatim), every suggestion with its value and the agent's source, each with its
// act, and accept-all. Opened only from the lead's `details`; the page itself carries no rule sentence and no source.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import type { Release } from "@gt/domain/release";
import { PROBLEM_TEXT, type ReleaseProblem } from "@gt/domain/release.problems";
import type { ReleaseProposal } from "@gt/domain/release.record";

import { stepOfPath } from "../../../../_release/pending.ts";
import type { ReleaseSessionApi } from "../../../../_release/session.ts";
import { shown } from "../../../../_release/wizard/Suggest.tsx";
import { STEP_LABEL, stepOf, type StepId } from "../../../../_release/wizard/steps.ts";
import { Dialog } from "../_kit/Dialog.tsx";
import { fieldOf, PROBLEM_SHORT, whereOf } from "./lead.ts";
import s from "./focus.module.css";

function ProblemItem({ p, r, review, onFix }: { readonly p: ReleaseProblem; readonly r: Release; readonly review: boolean; readonly onFix: (p: ReleaseProblem) => void }) {
  return (
    <li className={s.item} data-kind={p.severity}>
      <div className={s.itemTop}>
        <span className={s.itemDot} aria-hidden="true" />
        <span className={s.itemName}>{PROBLEM_SHORT[p.code]}</span>
        <span className={s.itemAt}>
          {p.severity} · {whereOf(p, r, review)}
        </span>
      </div>
      <p className={s.rule}>{PROBLEM_TEXT[p.code]}</p>
      <span className={s.itemActs}>
        <Button label={review ? `Open ${STEP_LABEL[stepOf(p)]}` : "Fix"} size="sm" onPress={() => onFix(p)} />
      </span>
    </li>
  );
}

function ProposalItem({ q, review, session }: { readonly q: ReleaseProposal; readonly review: boolean; readonly session: ReleaseSessionApi }) {
  const f = fieldOf(q.path);
  const v = shown(q.path, q.value);
  return (
    <li className={s.item} data-kind="agent">
      <div className={s.itemTop}>
        <span className={s.itemDot} aria-hidden="true" />
        <span className={s.itemName}>{`${f.name.slice(0, 1).toUpperCase()}${f.name.slice(1)}`}</span>
        <span className={s.itemAt}>{review ? `${STEP_LABEL[stepOfPath(q.path)]} · ${f.at}` : f.at}</span>
      </div>
      {v.kind === "text" ? (
        <p className={s.itemValue}>{v.text}</p>
      ) : (
        <dl className={s.itemFacts}>
          {v.facts.map((x) => (
            <div key={`${x.k}:${x.v}`} className={s.itemFact}>
              <dt>{x.k}</dt>
              <dd>{x.v}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className={s.source}>
        <span className={s.sourceK}>source</span>
        {q.source}
      </p>
      <span className={s.itemActs}>
        <Button label="Accept" size="sm" tone="emerald" onPress={() => session.accept([q.id])} />
        <Button label="Dismiss" size="sm" onPress={() => session.dismiss([q.id])} />
      </span>
    </li>
  );
}

export function Details({ open, onClose, step, release, problems, pending, session, onFix }: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly step: StepId;
  readonly release: Release;
  readonly problems: readonly ReleaseProblem[];
  readonly pending: readonly ReleaseProposal[];
  readonly session: ReleaseSessionApi;
  readonly onFix: (p: ReleaseProblem) => void;
}) {
  const review = step === "review";
  const ordered = [...problems.filter((p) => p.severity === "block"), ...problems.filter((p) => p.severity === "warn")];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${STEP_LABEL[step]} · details`}
      className={s.dialog}
      width="wide"
      {...(pending.length > 1 ? { foot: <Button label="Accept all" tone="emerald" tally={{ value: pending.length }} onPress={() => session.accept(pending.map((q) => q.id))} /> } : {})}
    >
      <div className={s.detailCols}>
        {ordered.length > 0 && (
          <section className={s.detailGroup} aria-label="problems">
            <CapsHeading text="Problems" tally={{ value: ordered.length }} variant="section" />
            <ul className={s.items}>
              {ordered.map((p, i) => (
                <ProblemItem key={`${p.code}:${p.at}:${i}`} p={p} r={release} review={review} onFix={onFix} />
              ))}
            </ul>
          </section>
        )}
        {pending.length > 0 && (
          <section className={s.detailGroup} aria-label="suggestions">
            <CapsHeading text="Suggestions" tally={{ value: pending.length }} variant="section" />
            <ul className={s.items}>
              {pending.map((q) => (
                <ProposalItem key={q.id} q={q} review={review} session={session} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}
