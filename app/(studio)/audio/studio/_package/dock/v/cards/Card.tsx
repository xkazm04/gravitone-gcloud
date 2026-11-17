"use client";

// THE DECISION CARD (kit candidate `DecisionCard`): the one step in focus. Its number and name; its problems as chips
// (each opening its rule); the agent's suggestions for it as the primary choice; the step's own values and the few
// edits they need; Back and Next at its foot. Long lists, records and rules live behind doors, never on the face.
import type { ReactNode, Ref } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import type { ReleaseProblem } from "@gt/domain/release.problems";
import type { ReleaseProposal } from "@gt/domain/release.record";

import type { ReleaseSessionApi } from "../../../../../_release/session.ts";
import { STEP_LABEL, STEPS, type StepId } from "../../../../../_release/wizard/steps.ts";
import { Issues } from "./Issue.tsx";
import { Offers } from "./Offer.tsx";
import s from "./stack.module.css";

export interface DecisionCardProps {
  readonly step: StepId;
  readonly heading: Ref<HTMLHeadingElement>;
  /** The step's own problems (the review: every one). */
  readonly problems: readonly ReleaseProblem[];
  readonly pending: readonly ReleaseProposal[];
  readonly session: ReleaseSessionApi;
  readonly tracks: readonly string[];
  readonly go: (step: StepId, track?: number) => void;
  /** Controls at the head's end (a track picker, a copy act). */
  readonly tools?: ReactNode;
  readonly children: ReactNode;
}

export function DecisionCard({ step, heading, problems, pending, session, tracks, go, tools, children }: DecisionCardProps) {
  const at = STEPS.indexOf(step);
  const prev = STEPS[at - 1];
  const next = STEPS[at + 1];
  const review = step === "review";
  return (
    <section className={s.card} aria-labelledby="cards-step-heading">
      <header className={s.cardHead}>
        <span className={s.cardNo} aria-hidden="true">
          {at + 1}
          <small>/{STEPS.length}</small>
        </span>
        <h2 id="cards-step-heading" ref={heading} tabIndex={-1} className={s.cardTitle}>
          {STEP_LABEL[step]}
        </h2>
        <span className={s.cardTools}>
          {tools}
          {pending.length > 1 && <Button label="Accept all" size="sm" tone="emerald" tally={{ value: pending.length }} onPress={() => session.accept(pending.map((p) => p.id))} />}
        </span>
      </header>
      <p className={s.sr} aria-live="polite">
        {`Step ${at + 1} of ${STEPS.length}, ${STEP_LABEL[step]}`}
      </p>
      {problems.length > 0 && (
        <div className={s.cardIssues}>
          <Issues problems={problems} tracks={tracks} label={`${STEP_LABEL[step]} problems`} {...(review ? { go } : {})} />
        </div>
      )}
      {pending.length > 0 && (
        <div className={s.cardOffers}>
          <Offers pending={pending} session={session} compact={review} />
        </div>
      )}
      <div className={s.cardBody}>{children}</div>
      <footer className={s.cardFoot}>
        {prev !== undefined ? <Button label={STEP_LABEL[prev]} glyph="up" onPress={() => go(prev)} /> : <span />}
        {next !== undefined && <Button label={`Next · ${STEP_LABEL[next]}`} tone="cyan" glyphAfter="down" onPress={() => go(next)} />}
      </footer>
    </section>
  );
}
