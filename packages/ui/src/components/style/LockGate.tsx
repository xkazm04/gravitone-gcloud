// THE RATCHET, DRAWN - where a style stands on candidate -> proven -> locked, and what holds
// it there, in the work's words (v1 parts.tsx `StyleStepper` + SpecEditor's blocker line +
// parts.tsx's coverage pips). Both steps are one-way (COMMON decision 2): proven is earned by
// operator keeps in PROVEN_KEEPS distinct cells, locked by an explicit act the server admits
// only when the gate holds. The two pip rows are the two gates' own counts, so the sentence
// under them never has to restate a number the pips already show.
//
// Upgraded from v1: the blocker is the server's sentence (the same function the kernel refuses
// a lock with), never a view's re-derivation - v1's `useThemes.lock` skipped `canLock`, and the
// gate the dossier drew was not the gate the write enforced.
import type { StyleView } from "@gt/domain/styleView";

import { cx } from "../cx.ts";
import { PipRow } from "../piprow/PipRow.tsx";
import { StatusPill } from "../status/StatusPill.tsx";
import s from "./Style.module.css";

const STEPS = ["candidate", "proven", "locked"] as const;

export type LockGateProps = Pick<StyleView, "status" | "why" | "keptCells" | "provenKeeps" | "coverage" | "lockProblems" | "lock">;

export function LockGate({ status, why, keptCells, provenKeeps, coverage, lockProblems, lock }: LockGateProps) {
  const at = STEPS.indexOf(status);
  const covered = coverage.filter((c) => c.covered).length;
  return (
    <section className={s.gate} aria-label="ratchet" data-component="LockGate" data-status={status} data-can-lock={lock.can ? "" : undefined}>
      <ol className={s.steps} aria-label={`at ${status}`}>
        {STEPS.map((step, i) => (
          <li key={step} className={cx(s.step, i < at && s.passed, i === at && s.here)} aria-current={i === at ? "step" : undefined}>
            {step}
          </li>
        ))}
      </ol>
      <div className={s.gateRow}>
        <StatusPill machine="style" state={status} />
        <span className={s.why}>{why}</span>
      </div>
      <div className={s.gateRow}>
        <span className={s.gateTerm}>kept cells</span>
        <PipRow looks={Array.from({ length: Math.min(keptCells, provenKeeps) }, () => "done" as const)} max={provenKeeps} label={`${keptCells} of ${provenKeeps} kept cells to prove`} />
        <span className={s.gateTerm}>problems</span>
        <PipRow looks={Array.from({ length: Math.min(covered, lockProblems) }, () => "done" as const)} max={lockProblems} label={`${covered} of ${lockProblems} trial problems covered to lock`} />
      </div>
      {status === "locked" ? (
        <p className={s.locked} role="status">
          locked{lock.lockedAt === undefined ? "" : ` ${lock.lockedAt.slice(0, 10)}`}
          {lock.lockedBy === undefined ? "" : ` by ${lock.lockedBy}`}
        </p>
      ) : (
        // The blocker is drawn once: when it IS the one-line why (a proven style held at the
        // gate), the line above already says it.
        lock.blocker !== null &&
        lock.blocker !== why && (
          <p className={s.blocker} role="status" data-blocker="">
            {lock.blocker}
          </p>
        )
      )}
    </section>
  );
}
