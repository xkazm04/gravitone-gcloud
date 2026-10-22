// One RUN opened: its reference large beside its variants as large tiles, judged one by one with the
// cull's own CullTile (same badge, reasons, cursor and spoken name). Shared by both run-grid views
// (prototype 2026-10-22): the sheet draws it as the whole desk, the band as a strip in the grid.
import type { BoardVerdict } from "../../board/boardGate.ts";
import type { Cell } from "../../board/cull.ts";
import type { ItemWords } from "../../board/port.ts";
import type { Run } from "../../board/runs.ts";
import { Plate } from "../desk/Plate.tsx";
import { CullTile, type TileMedia } from "./CullTile.tsx";
import s from "./Runs.module.css";

export type RunViewProps = {
  readonly run: Run;
  readonly at: number;
  readonly of: number;
  readonly cells: readonly Cell[];
  readonly verdicts: Readonly<Record<string, BoardVerdict>>;
  readonly mediaOf: (id: string) => TileMedia;
  readonly wordsOf: (id: string) => ItemWords;
  readonly cur: number;
  readonly nudged: ReadonlySet<number>;
  readonly onPress: (cell: number) => void;
};

export function RunView({ run, at, of, cells, verdicts, mediaOf, wordsOf, cur, nudged, onPress }: RunViewProps) {
  const label = run.words?.label ?? run.row;
  return (
    <section className={s.run} aria-label={`run ${label}`}>
      <div className={s.runRef}>
        <span className={s.runHead}>
          {label}
          <span className={s.runPos}>
            {at + 1}/{of}
          </span>
        </span>
        {run.words?.ref !== undefined && <Plate className={s.runRefFace} src={run.words.ref} alt={`reference ${label}`} />}
      </div>
      <div className={s.runTiles} role="grid" aria-label="variants">
        {run.members.map((i) => {
          const id = cells[i]?.id ?? "";
          return <CullTile key={id} index={i} words={wordsOf(id)} media={mediaOf(id)} verdict={verdicts[id]} current={i === cur} nudged={nudged.has(i) && verdicts[id] === undefined} onPress={onPress} />;
        })}
      </div>
    </section>
  );
}
