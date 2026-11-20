"use client";

// The progress rail: all eight steps, always, each a door. A step's marker has three states
// (registry wizard-flows/progress-communication): needs attention (its live problems, block in rose
// and warn in amber, counted), complete (visited and clean, a check), not yet reached (its number).
// The current step is a position overlaid on whichever of the three it is in. Every mark derives
// from `releaseProblems` and the visited set; the rail keeps no bookkeeping of its own.
import type { ReleaseProblem } from "@gt/domain/release.problems";
import { releaseReady } from "@gt/domain/release.problems";
import type { ReleaseProposal } from "@gt/domain/release.record";

import { pendingIn } from "../pending.ts";

import { STEP_LABEL, STEPS, problemsOf, severityOf, type StepId } from "./steps.ts";
import s from "./wizard.module.css";

type Mark = "attention" | "complete" | "ahead";

function spoken(n: number, label: string, mark: Mark, block: number, warn: number, suggested: number): string {
  const counts = [block > 0 ? `${block} block` : "", warn > 0 ? `${warn} warn` : ""].filter((x) => x !== "").join(", ");
  return `${n} ${label}, ${mark === "attention" ? counts : mark === "complete" ? "clean" : "not visited"}${suggested > 0 ? `, ${suggested} suggested` : ""}`;
}

export function Rail({ problems, pending, current, seen, onGo }: {
  readonly problems: readonly ReleaseProblem[];
  /** The agent's pending proposals, counted under the step whose field each would set. */
  readonly pending: readonly ReleaseProposal[];
  readonly current: StepId;
  readonly seen: ReadonlySet<StepId>;
  readonly onGo: (step: StepId) => void;
}) {
  const ready = releaseReady(problems);
  return (
    <nav className={s.rail} aria-label="release steps">
      <ol className={s.railList}>
        {STEPS.map((step, i) => {
          const sev = severityOf(problemsOf(problems, step));
          const review = step === "review";
          const mark: Mark = review ? (ready ? (seen.has(step) ? "complete" : "ahead") : "attention") : sev.block + sev.warn > 0 ? "attention" : seen.has(step) ? "complete" : "ahead";
          const tone = sev.block > 0 ? "block" : sev.warn > 0 ? "warn" : "clean";
          const suggested = review ? 0 : pendingIn(pending, step).length;
          return (
            <li key={step} className={s.railItem}>
              <button
                type="button"
                className={s.railStep}
                data-mark={mark}
                data-tone={tone}
                aria-current={step === current ? "step" : undefined}
                aria-label={spoken(i + 1, STEP_LABEL[step], mark, sev.block, review ? 0 : sev.warn, suggested)}
                onClick={() => onGo(step)}
              >
                <span className={s.railDot} aria-hidden="true">
                  {mark === "complete" ? "✓" : i + 1}
                </span>
                <span className={s.railLabel} aria-hidden="true">
                  {STEP_LABEL[step]}
                </span>
                <span className={s.railCounts} aria-hidden="true">
                  {sev.block > 0 && <b className={s.countBlock}>{sev.block}</b>}
                  {sev.warn > 0 && !review && <b className={s.countWarn}>{sev.warn}</b>}
                  {review && ready && <b className={s.countReady}>ready</b>}
                  {suggested > 0 && <b className={s.countPending}>{suggested}</b>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
