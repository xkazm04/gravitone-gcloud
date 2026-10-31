// A prompt version's lineage (spark suno-advisor): each field it changed against its parent as
// `field  was -> now` with the reason beside it, and the verdict it answers as one quote. The parent's
// name is the caller's to draw (a card heads it, a versions rail already sits beside it).
import type { SunoChange } from "@gt/domain/audio.studio";

import { SrOnly } from "../a11y/SrOnly.tsx";
import s from "./Lineage.module.css";

export type LineageProps = {
  readonly changes: readonly SunoChange[];
  /** The verdict this version answers, in the person's words. */
  readonly because?: string;
};

export function Lineage({ changes, because }: LineageProps) {
  if (changes.length === 0 && because === undefined) return null;
  return (
    <div className={s.lineage}>
      {because !== undefined && (
        <blockquote className={s.because}>
          <SrOnly text="answers: " />
          {because}
        </blockquote>
      )}
      {changes.length > 0 && (
        <ul className={s.changes} aria-label="changed from the parent">
          {changes.map((c, i) => (
            <li key={`${c.field}:${i}`} className={s.change}>
              <span className={s.field}>{c.field}</span>
              <span className={s.delta}>
                {c.was !== undefined && (
                  <>
                    <del className={s.was}>
                      <SrOnly text="was " />
                      {c.was}
                    </del>
                    <span className={s.arrow} aria-hidden="true">
                      {" -> "}
                    </span>
                  </>
                )}
                <span className={s.now}>
                  <SrOnly text="now " />
                  {c.now}
                </span>
              </span>
              <span className={s.why}>{c.why}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
