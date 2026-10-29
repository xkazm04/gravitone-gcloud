"use client";

// THE HEAD OF ONE DESK LANE (spark audio-agent-studio, variant "desk"): a stem's mark, its words,
// what it does in the mix now, a play mark for it alone, and four controls a person who never
// opened a DAW can read - mute, only this, volume and left / right. The values are the caller's
// (a transport's live mix); the head only proposes the next one. A planned stem (no audio yet)
// keeps its controls, so a proposal that pans it still shows, and says it is not audible yet.
// Compact (six parts or more): the keys sit beside the words, a small play mark, and both faders
// share one line under them with their words on one line each; the illustrative tag is left to the
// lanes' group head (the label still reads provisional).
import type { StudioRole } from "@gt/domain/audio.studio.kinds";
import { EarButton } from "../audio/EarButton.tsx";
import type { StemMix } from "../audio/mix.ts";
import type { EarState } from "../audio/useEar.ts";
import { cx } from "../cx.ts";
import { Fader } from "../fader/Fader.tsx";
import { SourceTag } from "../source/SourceTag.tsx";
import { LANE_WORDS, levelWords, panWords, type LaneState } from "./desk.ts";
import { RoleMark, ROLE_WORDS } from "./RoleMark.tsx";
import s from "./LaneHead.module.css";

/** The volume range a lane offers, in dB (the transport takes -60..12; a person needs less). */
export const LANE_DB = { min: -30, max: 6, step: 1 } as const;

export type LaneHeadProps = {
  readonly role: StudioRole;
  readonly label: string;
  readonly state: LaneState;
  readonly mix: StemMix;
  /** How the take was made (the turn's own level and pan for this part; the renderer writes parts
   *  before their fader): the live value equal to it reads "as made". Absent = level 0, middle. */
  readonly made?: StemMix;
  /** The play mark for this part alone; null when it has no audio. */
  readonly ear: { readonly state: EarState; readonly onPress: () => void } | null;
  /** The turn marked the part illustrative: drawn provisional. */
  readonly illustrative?: boolean;
  /** One line of controls under the words (six parts or more, so eight still read on one screen). */
  readonly compact?: boolean;
  readonly onMute: (on: boolean) => void;
  readonly onSolo: (on: boolean) => void;
  readonly onLevel: (db: number) => void;
  readonly onPan: (pan: number) => void;
};

/** A value in words, said as how the take was made when it is: "as made", or "as made, 2 dB quieter". */
export function madeWords(words: string, asMade: boolean): string {
  if (!asMade) return words;
  return words === "as made" || words === "in the middle" ? "as made" : `as made, ${words}`;
}

export function LaneHead({ role, label, state, mix, made = {}, ear, illustrative = false, compact = false, onMute, onSolo, onLevel, onPan }: LaneHeadProps) {
  const db = Math.max(LANE_DB.min, Math.min(LANE_DB.max, mix.levelDb ?? 0));
  const pan = mix.pan ?? 0;
  const muted = mix.muted === true;
  const solo = mix.solo === true;
  const keys = (
    <div className={s.keys}>
      <button type="button" className={cx(s.key, s.mute)} aria-pressed={muted} aria-label={`mute ${label}`} onClick={() => onMute(!muted)}>
        mute
      </button>
      <button type="button" className={cx(s.key, s.solo)} aria-pressed={solo} aria-label={`play only ${label}`} onClick={() => onSolo(!solo)}>
        only this
      </button>
    </div>
  );
  return (
    <div className={cx(s.head, illustrative && s.provisional, compact && s.compact)} data-state={state}>
      <div className={s.top}>
        <RoleMark role={role} />
        <span className={s.words}>
          <b className={s.label}>{label}</b>
          <span className={s.state}>{`${ROLE_WORDS[role]} · ${LANE_WORDS[state]}`}</span>
        </span>
        {illustrative && !compact && <SourceTag kind="illustrative" />}
        {compact && keys}
        {ear === null ? <span className={s.noEar} aria-hidden="true" /> : <EarButton state={ear.state} name={`${label} alone`} onPress={ear.onPress} big={!compact} />}
      </div>
      {!compact && keys}
      <div className={s.knob}>
        <span className={s.cap}>
          volume <b className={s.val}>{madeWords(levelWords(mix.levelDb ?? 0), Math.abs((mix.levelDb ?? 0) - (made.levelDb ?? 0)) < 0.5)}</b>
        </span>
        <Fader label={`volume of ${label}`} value={db} min={LANE_DB.min} max={LANE_DB.max} step={LANE_DB.step} onChange={onLevel} valueText={levelWords(db)} />
      </div>
      <div className={s.knob}>
        <span className={s.cap}>
          left or right <b className={s.val}>{madeWords(panWords(pan), Math.abs(pan - (made.pan ?? 0)) < 0.05)}</b>
        </span>
        <Fader label={`left or right for ${label}`} value={pan} min={-1} max={1} step={0.1} onChange={(p) => onPan(Math.round(p * 10) / 10)} valueText={panWords(pan)} centred />
      </div>
    </div>
  );
}
