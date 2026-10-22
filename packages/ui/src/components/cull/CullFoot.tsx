// The cull's bottom bar - the keymap's caps, the packet's tally and the commit - one copy for every
// view of the matrix (the row desk and the run grid alike), so the operator's fingers meet the same
// bar whichever view the packet is drawn in.
import { REASON_KEYS } from "@gt/domain/source";

import type { Tally } from "../../board/cull.ts";
import { CommitButton } from "../desk/Desk.tsx";
import { Keycaps } from "../keycaps/Keycaps.tsx";
import { StackBar } from "../stackbar/StackBar.tsx";
import s from "./Cull.module.css";

export type CullFootProps = {
  readonly tally: Tally;
  /** How many reason keys the source binds (1-9, 0, − in order). */
  readonly reasons: number;
  readonly audio?: boolean;
  readonly refusals: number;
  readonly busy: boolean;
  readonly onCommit: () => void;
};

export function CullFoot({ tally: t, reasons, audio = false, refusals, busy, onCommit }: CullFootProps) {
  return (
    <>
      <Keycaps mode="board.cull" label="cull keys" facts={new Set(audio ? ["audio"] : [])} only={{ reason: REASON_KEYS.slice(0, reasons) }} />
      <div className={s.tally}>
        <div className={s.stack}>
          <StackBar kept={t.kept} rejected={t.rejected} undecided={t.undecided} label="packet" />
        </div>
        <span className={s.counts} aria-hidden="true">
          <span className={s.k}>{t.kept}</span> · <span className={s.x}>{t.rejected}</span> · <span className={s.u}>{t.undecided}</span>
        </span>
      </div>
      <CommitButton mode="board.cull" refusals={refusals} busy={busy} onPress={onCommit} {...(t.undecided > 0 ? { waiting: `${t.undecided} undecided` } : {})} />
    </>
  );
}
