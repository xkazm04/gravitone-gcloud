"use client";

// THE CHECKLIST'S RAIL (prototype dock-package, round 2, variant "checklist"): every step, its name and ONE mark - the
// worst of its rows (./model.ts `stepMark`): needs you, agent suggests, warning, done, or not started. No counts: the
// count is the step's own list, one press away. Sits in the wizard's rail container, so its width cannot drift.
import { STEP_LABEL, STEPS, type StepId } from "../../../../../_release/wizard/steps.ts";
import w from "../../../../../_release/wizard/wizard.module.css";
import { StateMark } from "./ItemList.tsx";
import { MARK_WORD, type Mark } from "./model.ts";
import c from "./checklist.module.css";

export function Rail({ marks, current, onGo }: { readonly marks: Readonly<Record<StepId, Mark>>; readonly current: StepId; readonly onGo: (step: StepId) => void }) {
  return (
    <nav className={w.rail} aria-label="release steps">
      <ol className={c.railList}>
        {STEPS.map((step, i) => (
          <li key={step}>
            <button
              type="button"
              className={c.railStep}
              data-mark={marks[step]}
              aria-current={step === current ? "step" : undefined}
              aria-label={`${i + 1} ${STEP_LABEL[step]}, ${marks[step] === "idle" ? "not started" : MARK_WORD[marks[step]]}`}
              onClick={() => onGo(step)}
            >
              <span className={c.railNo} aria-hidden="true">
                {i + 1}
              </span>
              <span className={c.railLabel} aria-hidden="true">
                {STEP_LABEL[step]}
              </span>
              <StateMark mark={marks[step]} />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
