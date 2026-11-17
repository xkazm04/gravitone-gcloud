"use client";

// THE PRINTED MARKS (direction "sleeve"): what a value looks like once it is in print, a blank left to write in, the
// severity dot a problem leaves on what it sits on, the pencil an agent's note leaves, and the errata slip - the
// store's rules in its own words (PROBLEM_TEXT, verbatim: that sentence is the work). Kit candidates, each named.
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { SrOnly } from "@gt/ui/components/a11y/SrOnly.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { PROBLEM_TEXT, type ReleaseProblem } from "@gt/domain/release.problems";

import { STEP_LABEL, stepOf, trackIndexOf, type StepId } from "../../../../../_release/wizard/steps.ts";
import { SIDE } from "./liner.ts";
import p from "./print.module.css";

export type Face = "serif" | "mono" | "sans";

/** The class a paper surface wears so the marks inside it print in paper ink (the review's back cover, a blank sleeve). */
export const PAPER_STOCK: string = p.paperStock ?? "";

/** A value in print. A change inks in once (an accepted note, an edit); never on mount, never on its own. */
export function Printed({ text, face = "serif", strong = false }: { readonly text: string; readonly face?: Face; readonly strong?: boolean }) {
  const reduce = useReducedMotion() === true;
  // The previous value is held in state (React's reset-on-prop pattern): a change bumps `ink`, which remounts the span
  // from a faded start; the first paint has ink 0 and no start.
  const [seen, setSeen] = useState(text);
  const [ink, setInk] = useState(0);
  if (seen !== text) {
    setSeen(text);
    setInk((n) => n + 1);
  }
  return (
    <motion.span key={ink} className={p.printed} data-face={face} data-strong={strong ? "" : undefined} initial={ink === 0 || reduce ? false : { opacity: 0.3 }} animate={{ opacity: 1 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
      {text}
    </motion.span>
  );
}

/** The line left for a value nobody has written: a dashed rule, named for the ear. */
export function WriteIn({ what }: { readonly what: string }) {
  return (
    <span className={p.writeIn}>
      <SrOnly text={`${what} blank`} />
    </span>
  );
}

/** A value, or its blank. */
export function ValueOr({ value, what, face }: { readonly value: string | null; readonly what: string; readonly face?: Face }) {
  return value === null || value.trim() === "" ? <WriteIn what={what} /> : <Printed text={value} {...(face === undefined ? {} : { face })} />;
}

/** The dot a problem leaves on what it sits on. */
export function ProblemDot({ level }: { readonly level: "block" | "warn" | null }) {
  if (level === null) return null;
  return (
    <span className={p.dot} data-level={level}>
      <SrOnly text={level === "block" ? "blocked" : "warning"} />
    </span>
  );
}

/** The pencil an agent's note leaves on the value it would set; `say` is its spoken name (null where words beside it
 *  already say it). */
export function PencilMark({ say = "pencilled" }: { readonly say?: string | null }) {
  return (
    <span className={p.pencil}>
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M3 13l1-3.5L11 2.5l2.5 2.5L6.5 12z M10 4l2 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      {say !== null && <SrOnly text={say} />}
    </span>
  );
}

/** Where a problem is fixed, as the notes print it: `A2 Details · 1`. */
export function whereOf(pr: ReleaseProblem): { readonly step: StepId; readonly track: number | null; readonly label: string } {
  const step = stepOf(pr);
  const track = trackIndexOf(pr);
  return { step, track, label: `${SIDE[step]} ${STEP_LABEL[step]}${track === null ? "" : ` · ${track + 1}`}` };
}

/** The errata slip: each rule in the store's words, its severity, and - with `onGo` - a door to the side that fixes it. */
export function Errata({ problems, onGo, label }: { readonly problems: readonly ReleaseProblem[]; readonly onGo?: (step: StepId, track: number | null) => void; readonly label: string }) {
  if (problems.length === 0) return null;
  return (
    <ul className={p.errata} aria-label={label}>
      {problems.map((pr, i) => {
        const w = whereOf(pr);
        const body = (
          <>
            <Chip label={pr.severity} tone={pr.severity === "block" ? "rose" : "amber"} dot />
            <span className={p.rule}>{PROBLEM_TEXT[pr.code]}</span>
            {onGo !== undefined && (
              <span className={p.where} aria-hidden="true">
                {w.label} ›
              </span>
            )}
          </>
        );
        return (
          <li key={`${pr.code}:${pr.at}:${i}`}>
            {onGo === undefined ? (
              <span className={p.erratum}>{body}</span>
            ) : (
              <button type="button" className={p.erratum} data-door="" onClick={() => onGo(w.step, w.track)} aria-label={`${PROBLEM_TEXT[pr.code]} Fix in ${w.label}`}>
                {body}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
