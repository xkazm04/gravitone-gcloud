// The cull's bottom bar - the keymap's caps, the packet's tally and the commit - one copy for every
// view of the matrix (the row desk and the run grid alike), so the operator's fingers meet the same
// bar whichever view the packet is drawn in.
import { reasonsOf, REJECT_KEYS, type ReasonVocabulary } from "@gt/domain/source";

import type { Tally } from "../../board/cull.ts";
import { CommitButton } from "../desk/Desk.tsx";
import { Keycaps, type CapTip } from "../keycaps/Keycaps.tsx";
import { StackBar } from "../stackbar/StackBar.tsx";
import s from "./Cull.module.css";

export type CullFootProps = {
  readonly tally: Tally;
  /** Rejects still owing their reason (a source whose reject requires one): not done, as the undecided are. */
  readonly reasonless?: number;
  /** A packet committing in parts (cull.ts `commitGate` go): the undecided that go on to the remainder packet. They
   *  do not hold the commit, so the button says how many commit now and how many later. */
  readonly later?: number;
  /** The source's reasons; keys 2-4 name the first three of the current run's group order, and each of
   *  those caps tips its reason's meaning. A source that keeps a note (`noteMax`) draws E. */
  readonly reasons: Pick<ReasonVocabulary, "list" | "meaning"> & Partial<Pick<ReasonVocabulary, "noteMax" | "by">>;
  /** The group of the run under the cursor (`RowWords.group`): whose order keys 2-4 follow. */
  readonly group?: string;
  readonly audio?: boolean;
  readonly refusals: number;
  readonly busy: boolean;
  readonly onCommit: () => void;
};

/** The reject keys that name a reason for a run of `group`: 2-4, cut to the list (none on a source without reasons). */
export function reasonKeys(reasons: Pick<ReasonVocabulary, "list">): readonly string[] {
  return REJECT_KEYS.slice(0, reasons.list.length);
}

/** Each reject key's tip, by cap, over `group`'s order; a reason with no meaning draws a bare cap. */
export function reasonTips(reasons: Pick<ReasonVocabulary, "list" | "meaning"> & Partial<Pick<ReasonVocabulary, "by">>, group?: string): Readonly<Record<string, CapTip>> {
  return Object.fromEntries(
    reasonsOf(reasons, group).flatMap((r, i) => {
      const key = REJECT_KEYS[i];
      const text = reasons.meaning[r];
      return key === undefined || text === undefined ? [] : [[key, { term: r, text }]];
    }),
  );
}

export function CullFoot({ tally: t, reasonless = 0, later = 0, reasons, group, audio = false, refusals, busy, onCommit }: CullFootProps) {
  const waiting = [t.undecided > 0 && later === 0 ? `${t.undecided} undecided` : "", reasonless > 0 ? `${reasonless} need a reason` : ""].filter((x) => x !== "").join(" · ");
  return (
    <>
      <Keycaps mode="board.cull" label="cull keys" facts={new Set([...(audio ? ["audio"] : []), ...((reasons.noteMax ?? 0) > 0 ? ["notes"] : [])])} only={{ reason: reasonKeys(reasons) }} tips={{ reason: reasonTips(reasons, group) }} />
      <div className={s.tally}>
        <div className={s.stack}>
          <StackBar kept={t.kept} rejected={t.rejected} undecided={t.undecided} label="packet" />
        </div>
        <span className={s.counts} aria-hidden="true">
          <span className={s.k}>{t.kept}</span> · <span className={s.x}>{t.rejected}</span> · <span className={s.u}>{t.undecided}</span>
        </span>
      </div>
      <CommitButton mode="board.cull" refusals={refusals} busy={busy} onPress={onCommit} {...(waiting === "" ? {} : { waiting })} {...(later > 0 ? { split: { now: t.kept + t.rejected, later } } : {})} />
    </>
  );
}
