"use client";

// THE RAIL (variant "focus"): each step's name and ONE mark - the kind of the lead that step's body opens with (block,
// warn, agent), a check when it is visited and clear, a hollow ring when not reached. One derivation (./lead.ts) feeds
// both, so the rail never says something the step does not lead with. Counts live behind the lead's details.
import type { Release } from "@gt/domain/release";
import type { ReleaseProblem } from "@gt/domain/release.problems";
import type { ReleaseProposal } from "@gt/domain/release.record";

import { STEP_LABEL, STEPS, type StepId } from "../../../../_release/wizard/steps.ts";
import w from "../../../../_release/wizard/wizard.module.css";
import { leadOf } from "./lead.ts";
import s from "./focus.module.css";

type Mark = "block" | "warn" | "agent" | "clear" | "ahead";
const SPOKEN: Readonly<Record<Mark, string>> = { block: "blocked", warn: "warning", agent: "suggestion waiting", clear: "clear", ahead: "not started" };

export function Rail({ release, problems, pending, current, seen, onGo }: {
  readonly release: Release;
  readonly problems: readonly ReleaseProblem[];
  readonly pending: readonly ReleaseProposal[];
  readonly current: StepId;
  readonly seen: ReadonlySet<StepId>;
  readonly onGo: (step: StepId) => void;
}) {
  return (
    <nav className={w.rail} aria-label="release steps">
      <ol className={s.railList}>
        {STEPS.map((step) => {
          const k = leadOf(step, problems, pending, release).kind;
          const mark: Mark = k === "block" || k === "warn" || k === "agent" ? k : k === "ready" || seen.has(step) ? "clear" : "ahead";
          return (
            <li key={step}>
              <button type="button" className={s.railStep} data-mark={mark} aria-current={step === current ? "step" : undefined} aria-label={`${STEP_LABEL[step]}, ${SPOKEN[mark]}`} onClick={() => onGo(step)}>
                <span className={s.railName} aria-hidden="true">
                  {STEP_LABEL[step]}
                </span>
                <span className={s.railMark} aria-hidden="true">
                  {mark === "clear" ? "✓" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
