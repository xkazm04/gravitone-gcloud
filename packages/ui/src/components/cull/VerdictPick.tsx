// A verdict by click (operator, 2026-10-22: "do not rely on shortcuts, put radio buttons under each
// variant"): keep or reject as two pressed buttons - one pressed at most, pressing the pressed one
// takes the verdict back - and, once rejected, the source's reasons as toggles. The markup is the
// Seg pattern, not native radios: a radio group owns the arrow keys, and the desk's ← → walk the
// variants. The keys still work; this is the same act. A reason with a meaning opens it as a tip on
// hover and focus (operator, 2026-10-23), the chip described by it; one without draws the bare chip.
//
// Where the keys judge exactly what this pick decides (the whole run; a words row), the chips are KEYED
// (spark scout-storyboards): the list arrives in the run's group order and the first three carry the
// cap the keymap binds them to (`board.cull` reason, 2-4), read off the table, never typed here. After
// 5 (a reject with no reason) the chips are ASKED: ringed, focus left where it was (a focused chip opens
// its tip over the run's keep/reject pair), so the next click - or Tab and Enter - names the reason.
import type { ReasonVocabulary } from "@gt/domain/source";
import { Fragment } from "react";

import type { BoardVerdict } from "../../board/boardGate.ts";
import { cx } from "../cx.ts";
import { Tip } from "../hint/Tip.tsx";
import { capsFor } from "../keycaps/caps.ts";
import keycap from "../keycaps/Keycaps.module.css";
import s from "./Verdict.module.css";

export type VerdictPickProps = {
  /** What is being decided, for the group's name ("replica 1", "the whole run"). */
  readonly label: string;
  readonly verdict: BoardVerdict | undefined;
  /** The source's reject reasons in key order (empty: a reject is one thing), the cap, each one's meaning. */
  readonly reasons: VerdictReasons;
  readonly onChange: (v: BoardVerdict | null) => void;
  readonly size?: "md" | "sm";
  /** The reason whose tip is drawn open: a /kit specimen. */
  readonly seededTip?: string;
  /** The chips carry the reject keys' caps (2-4 on the first three): the keys act on this very pick. */
  readonly keyed?: boolean;
  /** A reject with no reason waits on a chip: the chips are ringed. */
  readonly ask?: boolean;
};

/** The slice of a packet view's vocabulary a verdict by click needs (PacketView.reasons is one); `required`
 *  marks a source whose reject is not done until it names a reason. */
export type VerdictReasons = Pick<ReasonVocabulary, "list" | "max" | "meaning" | "required" | "by">;

export function VerdictPick({ label, verdict, reasons, onChange, size = "md", seededTip, keyed = false, ask = false }: VerdictPickProps) {
  const v = verdict?.verdict;
  const picked = verdict?.reasons ?? [];
  const caps = keyed ? capsFor("board.cull", "reason") : [];
  const toggle = (r: string) => {
    const has = picked.includes(r);
    if (!has && picked.length >= reasons.max) return;
    onChange({ verdict: "reject", reasons: has ? picked.filter((x) => x !== r) : [...picked, r] });
  };
  return (
    <div className={cx(s.pick, size === "sm" && s.sm)}>
      <div className={s.pair} role="group" aria-label={`verdict on ${label}`}>
        <button type="button" className={cx(s.opt, s.keep)} aria-pressed={v === "keep"} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(v === "keep" ? null : { verdict: "keep", reasons: [] })}>
          <span className={s.dot} aria-hidden="true" />
          keep
        </button>
        <button type="button" className={cx(s.opt, s.reject)} aria-pressed={v === "reject"} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(v === "reject" ? null : { verdict: "reject", reasons: [] })}>
          <span className={s.dot} aria-hidden="true" />
          reject
        </button>
      </div>
      {v === "reject" && reasons.list.length > 0 && (
        <div className={cx(s.reasons, ask && s.asked)} role="group" aria-label={`reasons for rejecting ${label}`} data-asked={ask ? "" : undefined}>
          {reasons.list.map((r, i) => {
            const cap = caps[i];
            const chip = (describedBy?: string) => (
              <button type="button" className={s.reason} aria-pressed={picked.includes(r)} aria-describedby={describedBy} aria-keyshortcuts={cap} onMouseDown={(e) => e.preventDefault()} onClick={() => toggle(r)}>
                {cap !== undefined && (
                  <kbd className={cx(keycap.cap, keycap.sm, s.reasonCap)} aria-hidden="true">
                    {cap}
                  </kbd>
                )}
                {r}
              </button>
            );
            const meaning = reasons.meaning[r];
            return meaning === undefined ? (
              <Fragment key={r}>{chip()}</Fragment>
            ) : (
              <Tip key={r} text={meaning} above seededOpen={seededTip === r}>
                {chip}
              </Tip>
            );
          })}
        </div>
      )}
    </div>
  );
}
