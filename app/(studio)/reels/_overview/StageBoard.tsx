// VARIANT C - STAGE BOARD: a column per film stage, in the walk's order, each reel a small poster card in the
// column it stands in, so where the work is piling up is read by the columns' heights. Redo and dropped close the
// board: a redo walks back to authoring, a drop leaves the walk. The board scrolls sideways inside itself.
import Link from "next/link";

import { Still } from "@gt/ui/components/filmstrip/Filmstrip.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import { FILM_STAGES } from "@/lib/reel/film";

import type { ReelRow } from "../_port/types.ts";
import { lengths, reelHref, STAGE_LOOK } from "./facts.ts";
import { HookFace, RenderReach, VerdictChip } from "./Marks.tsx";
import o from "./overview.module.css";

export function StageBoard({ rows }: { readonly rows: readonly ReelRow[] }) {
  return (
    <div className={o.board} role="list" aria-label="stages">
      {FILM_STAGES.map((stage) => {
        const here = rows.filter((r) => r.stage === stage);
        const look = STAGE_LOOK[stage];
        return (
          <section key={stage} className={o.col} role="listitem" aria-label={look.label} data-stage={stage} data-yours={look.yours ? "" : undefined}>
            <h3 className={o.colHead}>
              <span className={o.colName}>{look.label}</span>
              <Tally value={here.length} />
            </h3>
            <ul className={o.colCards}>
              {here.map((r) => {
                const len = lengths(r);
                return (
                  <li key={r.slug}>
                    <Link className={o.mini} href={reelHref(r.slug)} prefetch={false}>
                      <span className={o.miniFace}>{r.poster !== undefined ? <Still src={r.poster} /> : <HookFace row={r} size="sm" />}</span>
                      <span className={o.miniTitle}>{r.title}</span>
                      {r.progress !== undefined && <RenderReach progress={r.progress} />}
                      <span className={o.miniMeta}>
                        <VerdictChip last={r.last} />
                        {len !== undefined && <span className={o.cardLen}>{len}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
