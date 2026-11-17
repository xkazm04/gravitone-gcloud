"use client";

// THE SEGMENTED PROGRESS BAR (kit candidate `StepMeter`): one segment per step, filled in its mark's tone (block rose,
// warn amber, done emerald, ahead a hairline), each a door to its step; the current one carries the cursor, which
// springs to the next segment on a step change (a shared layoutId). The release's counts ride at its end.
import { motion, useReducedMotion } from "motion/react";

import { Chip } from "@gt/ui/components/chip/Chip.tsx";

import { STEP_LABEL, type StepId } from "../../../../../_release/wizard/steps.ts";
import type { StepMark } from "./model.ts";
import { FOLD } from "./motion.ts";
import s from "./stack.module.css";

function spoken(i: number, m: StepMark): string {
  const parts = [m.block > 0 ? `${m.block} block` : "", m.warn > 0 ? `${m.warn} warn` : "", m.suggested > 0 ? `${m.suggested} suggested` : ""].filter((x) => x !== "");
  return `${i + 1} ${STEP_LABEL[m.step]}, ${parts.length === 0 ? (m.mark === "done" ? "clean" : "not visited") : parts.join(", ")}`;
}

export function Progress({ marks, current, onGo }: { readonly marks: readonly StepMark[]; readonly current: StepId; readonly onGo: (step: StepId) => void }) {
  const reduce = useReducedMotion() === true;
  const steps = marks.filter((m) => m.step !== "review");
  const block = steps.reduce((a, m) => a + m.block, 0);
  const warn = steps.reduce((a, m) => a + m.warn, 0);
  const suggested = steps.reduce((a, m) => a + m.suggested, 0);
  const clear = steps.filter((m) => m.block + m.warn === 0).length;
  return (
    <nav className={s.progress} aria-label="release steps">
      <ol className={s.segs}>
        {marks.map((m, i) => (
          <li key={m.step} className={s.segItem}>
            <button type="button" className={s.seg} data-mark={m.mark} aria-current={m.step === current ? "step" : undefined} aria-label={spoken(i, m)} onClick={() => onGo(m.step)}>
              <span className={s.segBar} aria-hidden="true">
                {m.step === current && (reduce ? <span className={s.segCursor} /> : <motion.span layoutId="cards-cursor" className={s.segCursor} transition={FOLD} />)}
              </span>
              <span className={s.segLabel} aria-hidden="true">
                {STEP_LABEL[m.step]}
                {m.suggested > 0 && <span className={s.segDot} />}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <span className={s.counts}>
        <Chip label="clear" value={`${clear}/${steps.length}`} tone={clear === steps.length ? "emerald" : "neutral"} />
        {block > 0 && <Chip label="block" value={block} tone="rose" dot />}
        {warn > 0 && <Chip label="warn" value={warn} tone="amber" dot />}
        {suggested > 0 && <Chip label="suggested" value={suggested} tone="violet" dot />}
      </span>
    </nav>
  );
}
