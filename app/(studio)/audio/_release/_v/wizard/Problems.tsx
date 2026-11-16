"use client";

// A step's problems where it is fixed: each rule in the store's own words (PROBLEM_TEXT, quoted
// verbatim - that sentence is the work), marked block or warn. A warning is drawn as loud as a block
// and stops nothing (owner, wave 2).
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { PROBLEM_TEXT, type ReleaseProblem } from "@gt/domain/release.problems";

import s from "./step.module.css";

export function Problems({ problems, label }: { readonly problems: readonly ReleaseProblem[]; readonly label: string }) {
  if (problems.length === 0) return null;
  return (
    <ul className={s.problems} aria-label={label}>
      {problems.map((p, i) => (
        <li key={`${p.code}:${p.at}:${i}`} className={p.severity === "block" ? s.block : s.warn}>
          <Chip label={p.severity} tone={p.severity === "block" ? "rose" : "amber"} dot />
          <span>{PROBLEM_TEXT[p.code]}</span>
        </li>
      ))}
    </ul>
  );
}
