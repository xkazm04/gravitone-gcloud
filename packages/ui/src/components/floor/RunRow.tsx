// One run in a lane's Foundry column (prototype index.html `RunRow`, floor.css `[data-component=
// RunRow]`, `.run-thumb`, `.run-meta`, `.run-bar`): a thumbnail, the title, the state in the job
// vocabulary (STATUS.job - never a word of its own), what is done of what, and a progress rail.
//
// READ-ONLY (COMMON decision 11): no composer launched it and no control steers it here. A row
// whose record has a page is a link to it; the rest are text.
//
// The rail draws a share only when v1 counted one (plates 3/20); running work with no count
// shimmers instead of drawing a made-up fraction (the prototype's `.shimmer` on model runs).
// The thumbnail is the lane's mark: v1's live work carries no preview (lib/ledger/v1 LiveJob),
// and a picture of the wrong plate is worse than none.

import type { JobState } from "@gt/domain/job.machine";
import type { MediaLane } from "@gt/domain/lane";

import { cx } from "../cx.ts";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { StatusPill } from "../status/StatusPill.tsx";
import { vars } from "../vars.ts";
import { FloorGlyph } from "./FloorGlyph.tsx";
import { progressShare } from "./floor.ts";
import s from "./RunRow.module.css";

export type RunRowProps = {
  readonly title: string;
  readonly media: MediaLane;
  readonly state: JobState;
  readonly progress?: { readonly done: number; readonly total: number; readonly stage?: string };
  readonly attempt?: number;
  /** v1's own words when the run failed or was interrupted. */
  readonly error?: string;
  readonly href?: string;
};

export function RunRow({ title, media, state, progress, attempt, error, href }: RunRowProps) {
  const share = progressShare(progress);
  const body = (
    <>
      <span className={s.thumb} aria-hidden="true">
        {media === "article" ? <span className={s.para}>¶</span> : <FloorGlyph name={media} className={s.thumbMark} />}
      </span>
      <span className={s.main}>
        <span className={s.title}>{title}</span>
        <span className={s.meta}>
          <StatusPill machine="job" state={state} />
          {progress !== undefined && progress.total > 0 && (
            <span>
              {progress.done}/{progress.total}
            </span>
          )}
          {progress?.stage !== undefined && <span className={s.stage}>{progress.stage}</span>}
          {attempt !== undefined && attempt > 1 && <span>attempt {attempt}</span>}
        </span>
        {error !== undefined && (
          <span className={s.err}>
            <ErrorLine message={error} />
          </span>
        )}
        <span className={cx(s.bar, share === null && state === "running" && s.shimmer)} aria-hidden="true">
          <i className={s.fill} style={vars({ "--share": share ?? 0 })} />
        </span>
      </span>
    </>
  );
  // The rim tints cyan while running, but the state is SAID by the pill: the rim is ambience,
  // never the only carrier. The prototype's dashed rim for queued work is not drawn: a dashed
  // hairline is a mark under the 3:1 floor, and the pill already says `queued`.
  const cls = cx(s.row, state === "running" && s.running, href !== undefined && s.door);
  return href === undefined ? (
    <div className={cls} data-component="RunRow">
      {body}
    </div>
  ) : (
    <a className={cls} data-component="RunRow" href={href}>
      {body}
    </a>
  );
}
