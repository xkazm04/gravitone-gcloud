"use client";

// THE SPINE (direction "sleeve"): the seven steps printed down the sleeve's spine as the record's sides - side A the
// music (tracks, details, AI & rights), side B the package (sleeve, channels, extras), the run-out the review. Each
// side carries its live marks (block, warn, pencilled), derived from the release on every render; the side in hand has
// a lit edge that travels (a shared layoutId). Kit candidate: `SpineNav` (sections with marks and a travelling edge).
import { LayoutGroup, motion, useReducedMotion } from "motion/react";

import { SrOnly } from "@gt/ui/components/a11y/SrOnly.tsx";
import type { ReleaseProblem } from "@gt/domain/release.problems";
import type { ReleaseProposal } from "@gt/domain/release.record";

import { pendingIn } from "../../../../../_release/pending.ts";
import { problemsOf, severityOf, STEP_LABEL, STEPS, type StepId } from "../../../../../_release/wizard/steps.ts";
import { SIDE } from "./liner.ts";
import { PencilMark } from "./Print.tsx";
import sp from "./spine.module.css";

const GROUPS: readonly { readonly name: string; readonly steps: readonly StepId[] }[] = [
  { name: "side A", steps: STEPS.slice(0, 3) },
  { name: "side B", steps: STEPS.slice(3, 6) },
  { name: "run-out", steps: ["review"] },
];

function spoken(step: StepId, block: number, warn: number, pencilled: number): string {
  const parts = [block > 0 ? `${block} blocked` : null, warn > 0 ? `${warn} ${warn === 1 ? "warning" : "warnings"}` : null, pencilled > 0 ? `${pencilled} pencilled` : null].filter((x) => x !== null);
  return `${SIDE[step]} ${STEP_LABEL[step]}${parts.length === 0 ? "" : `: ${parts.join(", ")}`}`;
}

function Side({ step, here, problems, pending, onGo }: { readonly step: StepId; readonly here: boolean; readonly problems: readonly ReleaseProblem[]; readonly pending: readonly ReleaseProposal[]; readonly onGo: (s: StepId) => void }) {
  const reduce = useReducedMotion() === true;
  const sev = step === "review" ? { block: 0, warn: 0 } : severityOf(problemsOf(problems, step));
  const notes = step === "review" ? 0 : pendingIn(pending, step).length;
  return (
    <li>
      <button type="button" className={sp.side} aria-current={here ? "step" : undefined} onClick={() => onGo(step)}>
        {here && (reduce ? <span className={sp.edge} aria-hidden="true" /> : <motion.span layoutId="liner-spine-edge" className={sp.edge} transition={{ type: "spring", stiffness: 480, damping: 40 }} aria-hidden="true" />)}
        <span className={sp.marker} aria-hidden="true">
          {SIDE[step]}
        </span>
        <span className={sp.label} aria-hidden="true">
          {STEP_LABEL[step]}
        </span>
        <span className={sp.marks} aria-hidden="true">
          {sev.block > 0 && (
            <span className={sp.count} data-level="block">
              {sev.block}
            </span>
          )}
          {sev.warn > 0 && (
            <span className={sp.count} data-level="warn">
              {sev.warn}
            </span>
          )}
          {notes > 0 && (
            <span className={sp.count} data-level="pencil">
              <PencilMark say={null} />
              {notes}
            </span>
          )}
        </span>
        <SrOnly text={spoken(step, sev.block, sev.warn, notes)} />
      </button>
    </li>
  );
}

export function Spine({ problems, pending, current, onGo }: { readonly problems: readonly ReleaseProblem[]; readonly pending: readonly ReleaseProposal[]; readonly current: StepId; readonly onGo: (s: StepId) => void }) {
  return (
    <nav className={sp.spine} aria-label="sides">
      <LayoutGroup id="liner-spine">
        {GROUPS.map((g) => (
          <div key={g.name} className={sp.group}>
            <span className={sp.groupName} aria-hidden="true">
              {g.name}
            </span>
            <ol className={sp.list}>
              {g.steps.map((x) => (
                <Side key={x} step={x} here={x === current} problems={problems} pending={pending} onGo={onGo} />
              ))}
            </ol>
          </div>
        ))}
      </LayoutGroup>
    </nav>
  );
}
