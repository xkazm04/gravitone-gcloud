// One RUN opened: its variants, at most THREE to a row and as tall as the screen leaves them
// (operator, 2026-10-22), each a VariantCard - its media, its caption and its verdict by click.
// The reference sits in the modal's head, beside the run's purpose. A words card after stills (a storyboard's words,
// spark scout-storyboards) closes the row they began, else takes a row of its own.
import type { BoardVerdict } from "../../board/boardGate.ts";
import { stillOpen, type Cell } from "../../board/cull.ts";
import type { ItemWords } from "../../board/port.ts";
import type { Run } from "../../board/runs.ts";
import { cx } from "../cx.ts";
import { kindOf, type TileMedia } from "./CullTile.tsx";
import { VariantCard } from "./VariantCard.tsx";
import type { VerdictReasons } from "./VerdictPick.tsx";
import s from "./Runs.module.css";

export type RunViewProps = {
  readonly run: Run;
  readonly cells: readonly Cell[];
  readonly verdicts: Readonly<Record<string, BoardVerdict>>;
  readonly mediaOf: (id: string) => TileMedia;
  readonly wordsOf: (id: string) => ItemWords;
  readonly cur: number;
  readonly nudged: ReadonlySet<number>;
  readonly reasons: VerdictReasons;
  readonly onFocus: (cell: number) => void;
  readonly onVerdict: (cell: number, v: BoardVerdict | null) => void;
};

/**
 * The columns a words card takes at `at` (its place among the run's variants, `n` columns a row): what is left of a
 * row its stills began - a storyboard's 4th frame and its words share a row - or undefined for a row of its own.
 */
export function wordsSpan(at: number, n: number): 1 | 2 | undefined {
  const left = n - (at % n);
  return left === 1 || (left === 2 && n === 3) ? left : undefined;
}

export function RunView({ run, cells, verdicts, mediaOf, wordsOf, cur, nudged, reasons, onFocus, onVerdict }: RunViewProps) {
  const label = run.words?.label ?? run.row;
  const n = Math.min(3, run.members.length);
  return (
    <div className={cx(s.runTiles, n === 1 && s.cols1, n === 2 && s.cols2, run.members.length > 3 && s.runTilesMany)} role="grid" aria-label={`variants of ${label}`}>
      {run.members.map((i, at) => {
        const id = cells[i]?.id ?? "";
        const span = at > 0 && kindOf(mediaOf(id).mime) === "text" ? wordsSpan(at, n) : undefined;
        return (
          <VariantCard
            key={id}
            index={i}
            words={wordsOf(id)}
            media={mediaOf(id)}
            verdict={verdicts[id]}
            current={i === cur}
            nudged={nudged.has(i) && stillOpen(verdicts[id], reasons.required === true)}
            reasons={reasons}
            onFocus={onFocus}
            onVerdict={(v) => onVerdict(i, v)}
            {...(span === undefined ? {} : { span })}
          />
        );
      })}
    </div>
  );
}
