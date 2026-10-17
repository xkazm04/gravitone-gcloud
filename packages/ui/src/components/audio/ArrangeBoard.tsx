// THE ARRANGE BOARD'S GRID - stages across with their counts, rows down, a cell per pair holding
// its cards (v1 app/playground/arrange/Board.tsx's grid, re-expressed on the kit). It draws; the
// island (app/(studio)/audio/_audio/Arrange.tsx) owns the moves, the drag and the keys.
//
// Every cell carries `data-cell` (its cellKey): the pointer drag finds its target by asking the
// document what is under the pointer and walking up to that attribute, so the drop lands on the
// cell that was lit, never on one computed from coordinates (drag-drop drop-affordances).
import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { Tally } from "../tally/Tally.tsx";
import { buildBoard, cellKey, rowWord, STAGES, stageCounts, type Row, type Stack } from "./arrange.ts";
import type { CardTake } from "./TakeCard.tsx";
import s from "./Arrange.module.css";

export type ArrangeBoardProps = {
  readonly stacks: readonly Stack<CardTake>[];
  readonly rows: readonly Row[];
  /** The cell a drag is over, lit as the drop target. */
  readonly over: string | null;
  readonly renderCard: (stack: Stack<CardTake>) => ReactNode;
  readonly renderRowHead: (row: Row, held: number) => ReactNode;
};

export const CELL_ATTR = "data-cell";

export function ArrangeBoard({ stacks, rows, over, renderCard, renderRowHead }: ArrangeBoardProps) {
  const board = buildBoard(stacks, rows);
  const counts = stageCounts(stacks);
  return (
    <div className={s.board} role="grid" aria-label="arrange board" aria-rowcount={rows.length + 1}>
      <div className={s.boardRow} role="row">
        <span className={s.corner} role="columnheader" />
        {STAGES.map((st) => (
          <span key={st} className={cx(s.stageHead, st === "finalized" && s.finalHead)} role="columnheader">
            {st}
            <Tally value={counts[st]} />
          </span>
        ))}
      </div>
      {rows.map((row) => {
        const held = STAGES.reduce((n, st) => n + (board.get(cellKey({ stage: st, group: row.name }))?.length ?? 0), 0);
        return (
          <div key={row.key} className={s.boardRow} role="row">
            <div className={s.rowHead} role="rowheader">
              {renderRowHead(row, held)}
            </div>
            {STAGES.map((st) => {
              const key = cellKey({ stage: st, group: row.name });
              const list = board.get(key) ?? [];
              return (
                <div key={st} className={cx(s.cell, over === key && s.over)} role="gridcell" aria-label={`${st} · ${rowWord(row.name)}`} {...{ [CELL_ATTR]: key }}>
                  {list.map((stack) => (
                    <div key={stack.rootId} className={s.slot}>
                      {renderCard(stack)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
