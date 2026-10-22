// A verdict by click (operator, 2026-10-22: "do not rely on shortcuts, put radio buttons under each
// variant"): keep or reject as two pressed buttons - one pressed at most, pressing the pressed one
// takes the verdict back - and, once rejected, the source's reasons as toggles. The markup is the
// Seg pattern, not native radios: a radio group owns the arrow keys, and the desk's ← → walk the
// variants. The keys still work; this is the same act.
import type { BoardVerdict } from "../../board/boardGate.ts";
import { cx } from "../cx.ts";
import s from "./Verdict.module.css";

export type VerdictPickProps = {
  /** What is being decided, for the group's name ("replica 1", "the whole run"). */
  readonly label: string;
  readonly verdict: BoardVerdict | undefined;
  /** The source's reject reasons, in key order; empty: a reject is one thing. */
  readonly reasons: readonly string[];
  readonly maxReasons: number;
  readonly onChange: (v: BoardVerdict | null) => void;
  readonly size?: "md" | "sm";
};

export function VerdictPick({ label, verdict, reasons, maxReasons, onChange, size = "md" }: VerdictPickProps) {
  const v = verdict?.verdict;
  const picked = verdict?.reasons ?? [];
  const toggle = (r: string) => {
    const has = picked.includes(r);
    if (!has && picked.length >= maxReasons) return;
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
      {v === "reject" && reasons.length > 0 && (
        <div className={s.reasons} role="group" aria-label={`reasons for rejecting ${label}`}>
          {reasons.map((r) => (
            <button key={r} type="button" className={s.reason} aria-pressed={picked.includes(r)} onMouseDown={(e) => e.preventDefault()} onClick={() => toggle(r)}>
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
