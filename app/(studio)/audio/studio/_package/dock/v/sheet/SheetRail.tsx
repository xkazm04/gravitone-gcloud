"use client";

// THE SHEET'S RAIL (variant "sheet"): every step, each a door, each with its name and ONE mark - to fix, to check,
// suggested, clear or not started (model.ts `markOf`), never a count. The container is the wizard's (`wizard.module.css`
// `.rail`, its column `--w-rail`), so the frame cannot drift; the rows are this variant's. The mark settles in when it
// changes (an accept, an edit), not on mount. Kit candidate: StepRail { steps, current, markOf, onGo }.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type { ReleaseProblem } from "@gt/domain/release.problems";
import type { ReleaseProposal } from "@gt/domain/release.record";

import { STEP_LABEL, STEPS, type StepId } from "../../../../../_release/wizard/steps.ts";
import w from "../../../../../_release/wizard/wizard.module.css";
import { MARK_WORD, markOf } from "./model.ts";
import s from "./rail.module.css";

export function SheetRail({ problems, pending, current, seen, onGo }: {
  readonly problems: readonly ReleaseProblem[];
  readonly pending: readonly ReleaseProposal[];
  readonly current: StepId;
  readonly seen: ReadonlySet<StepId>;
  readonly onGo: (step: StepId) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <nav className={w.rail} aria-label="release steps">
      <ol className={s.list}>
        {STEPS.map((step, i) => {
          const mark = markOf(problems, pending, step, seen.has(step));
          return (
            <li key={step}>
              <button type="button" className={s.step} aria-current={step === current ? "step" : undefined} aria-label={`${i + 1} ${STEP_LABEL[step]}, ${MARK_WORD[mark]}`} onClick={() => onGo(step)}>
                <span className={s.name} aria-hidden="true">
                  {STEP_LABEL[step]}
                </span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={mark}
                    className={s.mark}
                    data-mark={mark}
                    aria-hidden="true"
                    initial={reduce ? false : { opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.5 }}
                    transition={{ duration: reduce ? 0 : 0.16 }}
                  >
                    {mark === "clear" ? "✓" : ""}
                  </motion.span>
                </AnimatePresence>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
