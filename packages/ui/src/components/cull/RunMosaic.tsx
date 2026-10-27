// The MOSAIC for a tab of pictures, clips or takes: its categories as row bands, each run one card.
// The card's shape is the content's own (operator, 2026-10-22: "tailored components and efficient
// density"): square stills, 16:9 clips, wide waveforms. In the ideas tab it draws the night's idea
// artboards, square, above the words; in the storyboards tab each board as a 16:9 card, its first frame the face.
import type { RefObject } from "react";

import type { BoardVerdict } from "../../board/boardGate.ts";
import type { Cell } from "../../board/cull.ts";
import type { ItemWords } from "../../board/port.ts";
import type { Run, Tab } from "../../board/runs.ts";
import type { TileMedia } from "./CullTile.tsx";
import { RunCard } from "./RunCard.tsx";
import s from "./Runs.module.css";

export type RunMosaicProps = {
  readonly tab: Tab;
  readonly categories: readonly { readonly category: string; readonly runs: readonly { readonly run: Run; readonly at: number }[] }[];
  readonly cells: readonly Cell[];
  readonly verdicts: Readonly<Record<string, BoardVerdict>>;
  readonly mediaOf: (id: string) => TileMedia;
  readonly wordsOf: (id: string) => ItemWords;
  readonly runIx: number;
  readonly nudged: ReadonlySet<number>;
  readonly onOpen: (run: number) => void;
  /** The first grid, measured for ↑ ↓ (a line of runs). */
  readonly grid: RefObject<HTMLDivElement | null>;
};

const GRID: Readonly<Record<Tab, string | undefined>> = { images: s.mosaic, videos: s.mosaicWide, audio: s.mosaicWave, ideas: s.mosaic, storyboards: s.mosaicWide };

export function RunMosaic({ tab, categories, cells, verdicts, mediaOf, wordsOf, runIx, nudged, onOpen, grid }: RunMosaicProps) {
  return (
    <div className={s.desk} role="grid" aria-label={`${tab} runs`}>
      {categories.map((c, ci) => (
        <section key={c.category} className={s.category} aria-label={`${c.category}, ${c.runs.length} run${c.runs.length === 1 ? "" : "s"}`}>
          <header className={s.categoryHead}>
            <span className={s.eyebrow}>{c.category}</span>
            <span className={s.count}>{c.runs.length}</span>
          </header>
          <div ref={ci === 0 ? grid : undefined} className={GRID[tab]}>
            {c.runs.map(({ run, at }) => (
              <RunCard
                key={run.row}
                run={run}
                at={at}
                cells={cells}
                verdicts={verdicts}
                mediaOf={mediaOf}
                wordsOf={wordsOf}
                shape={tab === "images" || tab === "ideas" ? "square" : "wide"}
                current={at === runIx}
                nudged={run.members.some((i) => nudged.has(i))}
                onPress={onOpen}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
