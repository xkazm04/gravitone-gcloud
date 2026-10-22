// One RUN opened: its reference beside its variants, at most THREE to a row so each is large
// (operator, 2026-10-22), judged one by one with the cull's own CullTile (same badge, reasons, cursor
// and spoken name). A clip plays where it lies.
import type { BoardVerdict } from "../../board/boardGate.ts";
import type { Cell } from "../../board/cull.ts";
import type { ItemWords } from "../../board/port.ts";
import type { Run } from "../../board/runs.ts";
import { Plate } from "../desk/Plate.tsx";
import { cx } from "../cx.ts";
import { CullTile, type TileMedia } from "./CullTile.tsx";
import s from "./Runs.module.css";

export type RunViewProps = {
  readonly run: Run;
  readonly cells: readonly Cell[];
  readonly verdicts: Readonly<Record<string, BoardVerdict>>;
  readonly mediaOf: (id: string) => TileMedia;
  readonly wordsOf: (id: string) => ItemWords;
  readonly cur: number;
  readonly nudged: ReadonlySet<number>;
  readonly onPress: (cell: number) => void;
};

export function RunView({ run, cells, verdicts, mediaOf, wordsOf, cur, nudged, onPress }: RunViewProps) {
  const label = run.words?.label ?? run.row;
  const n = Math.min(3, run.members.length);
  return (
    <section className={cx(s.run, run.words?.ref === undefined && s.runBare)} aria-label={`run ${label}`}>
      {run.words?.ref !== undefined && (
        <figure className={s.runRef}>
          <Plate className={s.runRefFace} src={run.words.ref} alt={`reference ${label}`} />
          <figcaption className={s.runRefNote}>reference · not output</figcaption>
        </figure>
      )}
      <div className={cx(s.runTiles, n === 1 && s.cols1, n === 2 && s.cols2)} role="grid" aria-label="variants">
        {run.members.map((i) => {
          const id = cells[i]?.id ?? "";
          return <CullTile key={id} index={i} words={wordsOf(id)} media={mediaOf(id)} verdict={verdicts[id]} current={i === cur} nudged={nudged.has(i) && verdicts[id] === undefined} onPress={onPress} play large />;
        })}
      </div>
    </section>
  );
}
