"use client";

// THE HEAD OF ONE DESK LANE (spark audio-agent-studio, variant "desk"): a stem's mark, its words,
// what it does in the mix now, a play mark for it alone, and four controls a person who never
// opened a DAW can read - mute, only this, volume and left / right. The values are the caller's
// (a transport's live mix); the head only proposes the next one. A planned stem (no audio yet)
// keeps its controls, so a proposal that pans it still shows, and says it is not audible yet.
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
  /** The play mark for this part alone; null when it has no audio. */
  readonly ear: { readonly state: EarState; readonly onPress: () => void } | null;
  /** The turn marked the part illustrative: drawn provisional. */
  readonly illustrative?: boolean;
  readonly onMute: (on: boolean) => void;
  readonly onSolo: (on: boolean) => void;
  readonly onLevel: (db: number) => void;
  readonly onPan: (pan: number) => void;
};

export function LaneHead({ role, label, state, mix, ear, illustrative = false, onMute, onSolo, onLevel, onPan }: LaneHeadProps) {
  const db = Math.max(LANE_DB.min, Math.min(LANE_DB.max, mix.levelDb ?? 0));
  const pan = mix.pan ?? 0;
  const muted = mix.muted === true;
  const solo = mix.solo === true;
  return (
    <div className={cx(s.head, illustrative && s.provisional)} data-state={state}>
      <div className={s.top}>
        <RoleMark role={role} />
        <span className={s.words}>
          <b className={s.label}>{label}</b>
          <span className={s.state}>{`${ROLE_WORDS[role]} · ${LANE_WORDS[state]}`}</span>
        </span>
        {illustrative && <SourceTag kind="illustrative" />}
        {ear === null ? <span className={s.noEar} aria-hidden="true" /> : <EarButton state={ear.state} name={`${label} alone`} onPress={ear.onPress} big />}
      </div>
      <div className={s.keys}>
        <button type="button" className={cx(s.key, s.mute)} aria-pressed={muted} aria-label={`mute ${label}`} onClick={() => onMute(!muted)}>
          mute
        </button>
        <button type="button" className={cx(s.key, s.solo)} aria-pressed={solo} aria-label={`play only ${label}`} onClick={() => onSolo(!solo)}>
          only this
        </button>
      </div>
      <div className={s.knob}>
        <span className={s.cap}>
          volume <b className={s.val}>{levelWords(mix.levelDb ?? 0)}</b>
        </span>
        <Fader label={`volume of ${label}`} value={db} min={LANE_DB.min} max={LANE_DB.max} step={LANE_DB.step} onChange={onLevel} valueText={levelWords(db)} />
      </div>
      <div className={s.knob}>
        <span className={s.cap}>
          left or right <b className={s.val}>{panWords(pan)}</b>
        </span>
        <Fader label={`left or right for ${label}`} value={pan} min={-1} max={1} step={0.1} onChange={(p) => onPan(Math.round(p * 10) / 10)} valueText={panWords(pan)} centred />
      </div>
    </div>
  );
}
