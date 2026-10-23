// The cull's bottom bar - the keymap's caps, the packet's tally and the commit - one copy for every
// view of the matrix (the row desk and the run grid alike), so the operator's fingers meet the same
// bar whichever view the packet is drawn in.
import { REASON_KEYS, type ReasonVocabulary } from "@gt/domain/source";

import type { Tally } from "../../board/cull.ts";
import { CommitButton } from "../desk/Desk.tsx";
import { Keycaps, type CapTip } from "../keycaps/Keycaps.tsx";
import { StackBar } from "../stackbar/StackBar.tsx";
import s from "./Cull.module.css";

export type CullFootProps = {
  readonly tally: Tally;
  /** Rejects still owing their reason (a source whose reject requires one): not done, as the undecided are. */
  readonly reasonless?: number;
  /** The source's reasons, bound to 1-9, 0, − in order; each key's cap tips its reason's meaning. A
   *  source that keeps a note (`noteMax`) draws E. */
  readonly reasons: Pick<ReasonVocabulary, "list" | "meaning"> & Partial<Pick<ReasonVocabulary, "noteMax">>;
  readonly audio?: boolean;
  readonly refusals: number;
  readonly busy: boolean;
  readonly onCommit: () => void;
};

/** Each bound reason key's tip, by cap; a reason with no meaning draws a bare cap. */
export function reasonTips(reasons: Pick<ReasonVocabulary, "list" | "meaning">): Readonly<Record<string, CapTip>> {
  return Object.fromEntries(
    reasons.list.flatMap((r, i) => {
      const key = REASON_KEYS[i];
      const text = reasons.meaning[r];
      return key === undefined || text === undefined ? [] : [[key, { term: r, text }]];
    }),
  );
}

export function CullFoot({ tally: t, reasonless = 0, reasons, audio = false, refusals, busy, onCommit }: CullFootProps) {
  const waiting = [t.undecided > 0 ? `${t.undecided} undecided` : "", reasonless > 0 ? `${reasonless} need a reason` : ""].filter((x) => x !== "").join(" · ");
  return (
    <>
      <Keycaps mode="board.cull" label="cull keys" facts={new Set([...(audio ? ["audio"] : []), ...((reasons.noteMax ?? 0) > 0 ? ["notes"] : [])])} only={{ reason: REASON_KEYS.slice(0, reasons.list.length) }} tips={{ reason: reasonTips(reasons) }} />
      <div className={s.tally}>
        <div className={s.stack}>
          <StackBar kept={t.kept} rejected={t.rejected} undecided={t.undecided} label="packet" />
        </div>
        <span className={s.counts} aria-hidden="true">
          <span className={s.k}>{t.kept}</span> · <span className={s.x}>{t.rejected}</span> · <span className={s.u}>{t.undecided}</span>
        </span>
      </div>
      <CommitButton mode="board.cull" refusals={refusals} busy={busy} onPress={onCommit} {...(waiting === "" ? {} : { waiting })} />
    </>
  );
}
