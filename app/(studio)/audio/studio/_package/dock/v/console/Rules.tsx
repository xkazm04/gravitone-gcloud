"use client";

// THE RULES A STEP BREAKS, IN THE STORE'S WORDS (prototype dock-package, "console"): each problem as its lamp and its
// PROBLEM_TEXT verbatim - that sentence is the work. A rule may carry a door (the review sends to the strip that
// fixes it). Entries leave with a fade when the edit that fixes them lands.
import { AnimatePresence, motion } from "motion/react";

import { PROBLEM_TEXT, type ReleaseProblem } from "@gt/domain/release.problems";

import { Lamp } from "./Instruments.tsx";
import s from "./editor.module.css";

export function Rules({ problems, label, reduce, door }: {
  readonly problems: readonly ReleaseProblem[];
  readonly label: string;
  readonly reduce: boolean;
  /** A door per rule: the place that fixes it, and the press that goes there. */
  readonly door?: (p: ReleaseProblem) => { readonly where: string; readonly go: () => void };
}) {
  return (
    <ul className={s.rules} aria-label={label}>
      <AnimatePresence initial={false}>
        {problems.map((p, i) => {
          const d = door?.(p);
          const body = (
            <>
              <Lamp tone={p.severity === "block" ? "rose" : "amber"} on label={p.severity === "block" ? "blk" : "wrn"} />
              <span className={s.ruleText}>{PROBLEM_TEXT[p.code]}</span>
              {d !== undefined && (
                <span className={s.ruleWhere} aria-hidden="true">
                  {d.where} ›
                </span>
              )}
            </>
          );
          return (
            <motion.li
              key={`${p.code}:${p.at}:${i}`}
              className={s.rule}
              data-severity={p.severity}
              initial={reduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 }}
              transition={{ duration: reduce ? 0 : 0.22 }}
            >
              {d === undefined ? (
                <span className={s.ruleRow}>{body}</span>
              ) : (
                <button type="button" className={s.ruleRow} data-door="" onClick={d.go} aria-label={`${PROBLEM_TEXT[p.code]} Fix in ${d.where}`}>
                  {body}
                </button>
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
