// THE STAGE'S LIGHTING STRIP (spark audio-agent-studio, variant "stage"): the song's parts (intro,
// lift, outro) as a row of lights along the front of the stage, each as wide as it is long in bars
// and as bright as its energy. Pressing one picks it (the stage then shows who plays there); pressing
// it again lets it go. While the song plays, the part under the playhead is lit and a thin line walks
// across the strip. Each light says how many players play in it.
import type { CSSProperties } from "react";

import s from "./LightStrip.module.css";

export type LightStripProps = {
  readonly sections: readonly { readonly name: string; readonly bars: number; readonly energy: number }[];
  /** The picked part; null when none is picked. */
  readonly picked: number | null;
  readonly onPick: (i: number | null) => void;
  /** The part under the playhead while the song plays; null otherwise. */
  readonly live: number | null;
  /** The playhead along the whole strip, 0..1; null when nothing plays or the parts have no length in time. */
  readonly at: number | null;
  /** Players in each part, and how many players there are; absent when there is no band on screen. */
  readonly playing?: { readonly per: readonly number[]; readonly of: number };
};

export function LightStrip({ sections, picked, onPick, live, at, playing }: LightStripProps) {
  return (
    <div className={s.strip} role="group" aria-label="the parts of the song">
      {sections.map((sec, i) => {
        const n = playing?.per[i];
        const style = { "--energy": String(Math.max(0, Math.min(1, sec.energy))), "--bars": String(sec.bars) } as CSSProperties;
        return (
          <button key={i} type="button" className={s.light} style={style} aria-pressed={picked === i} data-live={live === i || undefined} onClick={() => onPick(picked === i ? null : i)}>
            <span className={s.lamp} aria-hidden="true" />
            <span className={s.name}>{sec.name}</span>
            <span className={s.meta}>{n === undefined || playing === undefined ? `${sec.bars} bars` : `${n} of ${playing.of} play`}</span>
          </button>
        );
      })}
      {at !== null && <span className={s.head} style={{ "--at": String(Math.max(0, Math.min(1, at))) } as CSSProperties} aria-hidden="true" />}
    </div>
  );
}
