// A character's kept stills as a row of thumbnails (spark scout-use-aim): one portrait per look she
// was kept in, newest first, each captioned with its look direction (or the night, on a legacy night
// that kept no look). A thumbnail with a door filters the Library by that look; without one it is a
// plain figure. The picture's accessible name is the caption and the genre rung, never a sentence.

import { cx } from "../cx.ts";
import s from "./LookStrip.module.css";

export type LookThumb = {
  /** The look direction's slug, or the night when no look was recorded: what the door filters by. */
  readonly key: string;
  readonly image: string;
  readonly label: string;
  /** The genre rung under the label (`anime cel`). */
  readonly sub?: string;
  readonly pressed?: boolean;
  /** Set when a look has no filter value (a legacy night): the thumbnail is then a figure, not a door. */
  readonly inert?: boolean;
};

function Thumb({ t }: { readonly t: LookThumb }) {
  const alt = t.sub === undefined ? t.label : `${t.label} · ${t.sub}`;
  // A kept still is its own bytes, at the strip's size (FaceView's exemption from next/image).
  // eslint-disable-next-line @next/next/no-img-element -- see above
  const picture = <img className={s.img} src={t.image} alt={alt} loading="lazy" decoding="async" draggable={false} />;
  return (
    <>
      {picture}
      <span className={s.label}>{t.label}</span>
      {t.sub !== undefined && <span className={s.sub}>{t.sub}</span>}
    </>
  );
}

export function LookStrip({ looks, onPress }: { readonly looks: readonly LookThumb[]; readonly onPress?: (key: string) => void }) {
  return (
    <ul className={s.strip}>
      {looks.map((t, i) => (
        <li key={`${t.key}-${i}`} className={s.item}>
          {onPress === undefined || t.inert === true ? (
            <figure className={s.cell}>
              <Thumb t={t} />
            </figure>
          ) : (
            <button type="button" className={cx(s.cell, s.door, t.pressed === true && s.pressed)} aria-pressed={t.pressed === true} onClick={() => onPress(t.key)}>
              <Thumb t={t} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
