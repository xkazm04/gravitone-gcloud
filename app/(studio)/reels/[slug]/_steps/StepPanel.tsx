"use client";

// One step: a heading whose button folds the body, the step's state as a Tally, and the body. The body mounts
// on its first open and stays mounted (hidden) after, so a half-typed note survives a fold (the Fold rule).
import { useId, useState, type ReactNode } from "react";

import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import { STATE_WORD, STEP_TITLE, type StepKey, type StepState } from "./view.ts";
import s from "./Steps.module.css";

export function StepPanel({ step, state, open, onToggle, children }: { readonly step: StepKey; readonly state: StepState; readonly open: boolean; readonly onToggle: (next: boolean) => void; readonly children: ReactNode }) {
  const id = useId();
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
  return (
    <section className={s.step} data-step={step} data-state={state} aria-label={STEP_TITLE[step]}>
      <h3 className={s.head}>
        <button type="button" className={s.toggle} aria-expanded={open} aria-controls={id} onClick={() => onToggle(!open)}>
          <Glyph name="down" className={s.chev} />
          <span className={s.title}>{STEP_TITLE[step]}</span>
          <span className={s.headEnd}>
            <Tally value={STATE_WORD[state]} />
          </span>
        </button>
      </h3>
      <div id={id} className={s.body} hidden={!open}>
        {seen && children}
      </div>
    </section>
  );
}
