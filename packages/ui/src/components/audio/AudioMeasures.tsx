// The "Measured" grid of an audio take (prototype library.js :552-554, library.css `.meas`):
// bpm, key, length / lufs, true peak, energy. Each cell is ./audio.ts `measureCells`: the
// measured figure, and - only where the bytes DISAGREE with the brief - the asked one beside it
// in amber (`asked 120`), because a half-time read is a finding (v1 app/library/audio/take.ts).
// A figure read off the brief because nothing was measured says so in its label's tone.
import { cx } from "../cx.ts";
import { measureCells, type AudioFacts } from "./audio.ts";
import s from "./AudioMeasures.module.css";

export function AudioMeasures({ facts }: { readonly facts: AudioFacts }) {
  return (
    <dl className={s.meas}>
      {measureCells(facts).map((c) => (
        <div key={c.key} className={s.cell} data-from={c.from}>
          <dt className={s.label}>
            {c.label}
            {c.from === "asked" && <span className={s.from}> · asked</span>}
          </dt>
          <dd className={cx(s.value, c.from === "none" && s.none)}>
            {c.value}
            {c.asked !== undefined && <span className={s.asked}>asked {c.asked}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
