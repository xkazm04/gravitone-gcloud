// EVERY OUTPUT KIND OF THE PACKET, named (operator, 2026-11-20: "runs contain output types which are not present
// anywhere in the UI"). The tabs file categories by the SHAPE they draw in - a night's 8 s reels sat under `images`,
// its findings under `ideas` - so the kinds themselves were only small eyebrows inside a tab. Here each category is a
// chip with its run count and a StackBar of its runs kept / rejected / open; pressing one takes the cursor (and so the
// tab) to its first run. Beside them, the one button that walks every run of the packet in turn (MatrixCull's sweep).
import type { BoardVerdict } from "../../board/boardGate.ts";
import type { Cell } from "../../board/cull.ts";
import { runState, type Run } from "../../board/runs.ts";
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { StackBar } from "../stackbar/StackBar.tsx";
import s from "./Runs.module.css";

export type KindsBarProps = {
  readonly categories: readonly { readonly category: string; readonly runs: readonly { readonly run: Run; readonly at: number }[] }[];
  readonly cells: readonly Cell[];
  readonly verdicts: Readonly<Record<string, BoardVerdict>>;
  /** The category of the run under the cursor: its chip is pressed. */
  readonly current: string | undefined;
  readonly onKind: (firstRun: number) => void;
  /** Runs of the packet still open: the verdict pass's tally. */
  readonly open: number;
  readonly onSweep: () => void;
};

export function KindsBar({ categories, cells, verdicts, current, onKind, open, onSweep }: KindsBarProps) {
  return (
    <div className={s.tabs}>
      <div className={s.kinds} role="group" aria-label="output kinds">
        {categories.map((c) => {
          const states = c.runs.map(({ run }) => runState(run, cells, verdicts));
          const kept = states.filter((x) => x === "kept").length;
          const rejected = states.filter((x) => x === "rejected").length;
          const first = c.runs[0]?.at;
          return (
            <span key={c.category} className={s.kind}>
              <Chip label={c.category} value={c.runs.length} casing="lower" pressed={c.category === current} {...(first === undefined ? {} : { onPress: () => onKind(first) })} />
              <StackBar kept={kept} rejected={rejected} undecided={states.length - kept - rejected} label={c.category} />
            </span>
          );
        })}
      </div>
      <Button label="Verdict mode" tone="cyan" tally={{ value: open, label: "open" }} shortcut={{ mode: "board.cull", verb: "sweep" }} onPress={onSweep} />
    </div>
  );
}
