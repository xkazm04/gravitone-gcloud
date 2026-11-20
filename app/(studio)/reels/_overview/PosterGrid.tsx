// VARIANT B - POSTER GRID: one poster per reel, the stage and the last verdict pinned to its corners. A hovered
// poster runs its film as a flip-book of the twelve frames (CSS steps over one row of stills - no video on the
// overview). Before a film, the reel's question is its poster.
import type { CSSProperties } from "react";
import Link from "next/link";

import { Still } from "@gt/ui/components/filmstrip/Filmstrip.tsx";

import type { ReelRow } from "../_port/types.ts";
import { lengths, reelHref } from "./facts.ts";
import { HookFace, RenderReach, StageChip, VerdictChip } from "./Marks.tsx";
import o from "./overview.module.css";

export function PosterGrid({ rows }: { readonly rows: readonly ReelRow[] }) {
  return (
    <ul className={o.grid}>
      {rows.map((r, i) => {
        const len = lengths(r);
        return (
          <li key={r.slug} className={o.cardItem} style={{ "--i": i } as CSSProperties}>
            <Link className={o.card} href={reelHref(r.slug)} prefetch={false} data-stage={r.stage}>
              <span className={o.poster}>
                {r.poster !== undefined ? <Still className={o.posterImg} src={r.poster} /> : <HookFace row={r} />}
                {r.strip.length > 0 && (
                  <span className={o.flip} aria-hidden="true">
                    <span className={o.flipReel} style={{ "--n": r.strip.length } as CSSProperties}>
                      {r.strip.map((src) => (
                        <Still key={src} src={src} />
                      ))}
                    </span>
                  </span>
                )}
                <span className={o.corner}>
                  <StageChip stage={r.stage} />
                  <VerdictChip last={r.last} />
                </span>
                {r.progress !== undefined && (
                  <span className={o.posterFoot}>
                    <RenderReach progress={r.progress} />
                  </span>
                )}
              </span>
              <span className={o.cardFoot}>
                <span className={o.cardTitle}>{r.title}</span>
                {len !== undefined && <span className={o.cardLen}>{len}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
