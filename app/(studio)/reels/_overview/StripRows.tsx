// VARIANT A - FILMSTRIP ROWS: a reel per row, its film laid out as twelve frames, so the night's films are compared
// by picture down the page. The row is one link to the reel; a hovered frame lifts to a larger still. Before a film
// exists the strip keeps its shape, empty, with the render's reach over it while one runs.
import type { CSSProperties } from "react";
import Link from "next/link";

import { Filmstrip } from "@gt/ui/components/filmstrip/Filmstrip.tsx";

import type { ReelRow } from "../_port/types.ts";
import { lengths, reelHref, sizes } from "./facts.ts";
import { RenderReach, StageChip, VerdictChip } from "./Marks.tsx";
import o from "./overview.module.css";

export function StripRows({ rows }: { readonly rows: readonly ReelRow[] }) {
  return (
    <ol className={o.rows}>
      {rows.map((r, i) => (
        <li key={r.slug} className={o.rowItem} style={{ "--i": i } as CSSProperties}>
          <Link className={o.row} href={reelHref(r.slug)} prefetch={false} data-stage={r.stage}>
            <span className={o.rowHead}>
              <span className={o.rowTitle}>{r.title}</span>
              <span className={o.chips}>
                <StageChip stage={r.stage} />
                <VerdictChip last={r.last} />
              </span>
            </span>
            <span className={o.rowStrip}>
              <Filmstrip frames={r.strip} label={`${r.title}, twelve frames`} loupe />
              {r.progress !== undefined && (
                <span className={o.rowOver}>
                  <RenderReach progress={r.progress} />
                </span>
              )}
              {r.strip.length === 0 && r.progress === undefined && <span className={o.rowOver}><span className={o.rowHook}>{r.hook}</span></span>}
            </span>
            <Figures row={r} />
          </Link>
        </li>
      ))}
    </ol>
  );
}

function Figures({ row }: { readonly row: ReelRow }) {
  const len = lengths(row);
  const size = sizes(row);
  return (
    <dl className={o.figures}>
      <div>
        <dt>length</dt>
        <dd>{len ?? "—"}</dd>
      </div>
      <div>
        <dt>size</dt>
        <dd>{size ?? "—"}</dd>
      </div>
    </dl>
  );
}
