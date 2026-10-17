// ONE JUDGED TAKE ON THE RUBRIC: its verdict, its brief held against its bytes, and a row of ten
// per dimension (v1 app/playground/shared/Rubric.tsx's meter, re-expressed as pressable steps).
// The score ships with its breakdown (./rubric.ts `readRubric`): every dimension the take has,
// scored or not; the mean with how many of them it is over; "proven" when a kept take's mean
// reaches 7. An unscored dimension draws no number - a zero would be a score nobody gave.
//
// The row is focusable, not a button: the number row scores the active dimension and the
// arrows walk dimensions (the island binds them, mode `audio.rubric`). A step pressed again
// clears its dimension. A dimension whose write is in flight is aria-busy.
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { Tally } from "../tally/Tally.tsx";
import { PlayMark } from "./AudioPreview.tsx";
import { BriefDelta } from "./BriefDelta.tsx";
import type { BriefCheck } from "./brief.ts";
import { meanWord, SCORE_MAX, type RubricRead } from "./rubric.ts";
import s from "./Rubric.module.css";

export type RubricTakeView = {
  readonly id: string;
  readonly title: string;
  readonly provider: string;
  readonly verdict: "kept" | "rejected";
  readonly src: string | null;
  readonly rubric: RubricRead;
  readonly brief: BriefCheck;
};

export type RubricCardProps = {
  readonly take: RubricTakeView;
  readonly focused: boolean;
  /** The dimension the number row scores while this take is focused. */
  readonly dim: number;
  readonly playing: boolean;
  /** Dimensions whose write is in flight. */
  readonly busy: readonly string[];
  readonly onFocus: () => void;
  readonly onPlay: () => void;
  readonly onScore: (dim: string, value: number | null) => void;
};

const STEPS = Array.from({ length: SCORE_MAX }, (_, i) => i + 1);

export function RubricCard({ take, focused, dim, playing, busy, onFocus, onPlay, onScore }: RubricCardProps) {
  const r = take.rubric;
  return (
    <article className={cx(s.take, focused && s.focused)} tabIndex={0} data-take={take.id} aria-label={take.title} onFocus={onFocus}>
      <div className={s.head}>
        {take.src !== null && (
          <button type="button" className={cx(s.play, playing && s.playOn)} aria-label={`${playing ? "pause" : "play"} ${take.title}`} onClick={onPlay}>
            <PlayMark on={playing} className={s.playMark} />
          </button>
        )}
        <span className={s.title}>{take.title}</span>
        <Chip label={take.provider} casing="lower" />
        <Chip label={take.verdict} casing="lower" tone={take.verdict === "kept" ? "emerald" : "rose"} />
        {r.proven && <Chip label="proven" casing="lower" tone="emerald" dot />}
      </div>
      <BriefDelta check={take.brief} label={`${take.title} brief`} />
      <div className={s.dims} role="group" aria-label={`${take.title} rubric`}>
        {r.dims.map((d, i) => (
          <div key={d.dim} className={cx(s.dim, focused && i === dim && s.active)} role="group" aria-label={d.label} aria-busy={busy.includes(d.dim) || undefined}>
            <span className={s.dimName} aria-hidden="true">
              {d.short}
            </span>
            <span className={s.steps}>
              {STEPS.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={d.value === v}
                  aria-label={`${d.label} ${v}`}
                  tabIndex={focused && i === dim && (d.value ?? 1) === v ? 0 : -1}
                  className={cx(s.step, d.value !== null && v <= d.value && s.lit, d.value === v && s.at)}
                  onClick={() => onScore(d.dim, d.value === v ? null : v)}
                />
              ))}
            </span>
            <b className={cx(s.score, d.value === null && s.unscored)}>{d.value ?? "—"}</b>
          </div>
        ))}
      </div>
      <div className={s.foot}>
        <Tally value={meanWord(r.mean)} label="mean" />
        <Tally value={r.scored} of={r.of} label="scored" />
      </div>
    </article>
  );
}
