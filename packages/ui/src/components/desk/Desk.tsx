// The desk's frame and its shared parts (prototype index.html `BoardDesk`, `Oracle`, the
// `.desk-top / .desk-main / .desk-foot` triple and the `.commit` button). Every desk mode
// draws inside one: a title with its second line, what the machine said before the gate, the
// work itself, and a foot with the keys and the one act the packet ends in.
import type { ReactNode } from "react";

import type { LoadSummary } from "@gt/domain/load";

import type { Oracle } from "../../board/port.ts";
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { Keycap } from "../keycaps/Keycaps.tsx";
import { LoadBand } from "../load/LoadBand.tsx";
import s from "./Desk.module.css";

export function BoardDesk({ rail, children }: { readonly rail: ReactNode; readonly children: ReactNode }) {
  return (
    <div className={s.board} data-component="BoardDesk">
      {rail}
      <div className={s.desk} id="desk">
        {children}
      </div>
    </div>
  );
}

export type DeskFrameProps = {
  readonly title: string;
  /** The second line: the run, the bundle, the turn - mono and faint. */
  readonly meta?: string;
  /** Chips beside the title: the oracle, a calibration note. */
  readonly marks?: ReactNode;
  /** A /scout night's machine load (Presentation.load), drawn under the title and marks; absent, nothing. */
  readonly load?: LoadSummary;
  readonly foot: ReactNode;
  readonly children: ReactNode;
  /** Drawn over the main area (the zoom lens). */
  readonly over?: ReactNode;
};

export function DeskFrame({ title, meta, marks, load, foot, children, over }: DeskFrameProps) {
  return (
    <>
      <div className={s.top}>
        <div>
          <h2 className={s.title}>{title}</h2>
          {meta !== undefined && <span className={s.meta}>{meta}</span>}
        </div>
        {marks}
        {load !== undefined && (
          <div className={s.load}>
            <LoadBand load={load} />
          </div>
        )}
      </div>
      <div className={s.main} data-desk-main="">
        {children}
      </div>
      <div className={s.foot}>{foot}</div>
      {over}
    </>
  );
}

/** What the machine said before the gate (hitl-approval oracle-before-gate), verbatim. */
export function OracleStrip({ oracle }: { readonly oracle: Oracle }) {
  return (
    <div className={s.oracle} aria-label="oracle before gate" role="group">
      <Chip label={oracle.passed ? "oracle pass" : "oracle fail"} tone={oracle.passed ? "emerald" : "rose"} dot />
      <Chip label={oracle.summary} casing="lower" />
      {oracle.digest !== undefined && <Chip label={oracle.digest} casing="lower" />}
      {oracle.fixture === true && <Chip label="fixture" />}
    </div>
  );
}

export type CommitButtonProps = {
  /** The keymap mode whose `commit` row runs it (the cap is drawn from there). */
  readonly mode: string;
  /** What still stands in the way (`7 undecided`, `3 left`); the button then waits. */
  readonly waiting?: string;
  /** Bumped on each refusal, to replay the shake. */
  readonly refusals: number;
  readonly busy?: boolean;
  /** A commit in parts (spark scout-storyboards): `now` decided cells commit, `later` go on to the remainder packet. */
  readonly split?: { readonly now: number; readonly later: number };
  readonly onPress: () => void;
};

/** The one act a packet ends in. It is never disabled: pressed early, it refuses and says why. */
export function CommitButton({ mode, waiting, refusals, busy = false, split, onPress }: CommitButtonProps) {
  const parts = split === undefined ? "" : `${split.now} · ${split.later} later`;
  return (
    // Each refusal restarts the shake by swapping between two identical animations (a changed
    // animation-name restarts it). A changed `key` did it by remounting, and the press that was
    // refused lost focus with the node it was on.
    <button
      type="button"
      className={cx(s.commit, waiting !== undefined && s.wait, refusals > 0 && s.refuse, refusals > 0 && refusals % 2 === 0 && s.again)}
      aria-label={`commit packet${parts === "" ? "" : `, ${parts}`}${waiting === undefined ? "" : `, ${waiting}`}`}
      aria-busy={busy || undefined}
      onClick={onPress}
    >
      Commit {split === undefined ? "packet" : split.now} {split !== undefined && <Chip label={`${split.later} later`} />}
      {waiting !== undefined && <Chip label={waiting} />}
      <Keycap mode={mode} verb="commit" />
    </button>
  );
}
