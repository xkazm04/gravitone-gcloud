"use client";

// The desk's left column: the kept takes, picked several at a time, then made into a new release or
// added to the open one. A take already on the open release says where it sits.
import type { Release, ShelfTake } from "@gt/domain/release";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";

import { clock, fig } from "./fmt.ts";
import s from "./desk.module.css";

export type ShelfProps = {
  readonly shelf: readonly ShelfTake[];
  readonly picked: readonly string[];
  readonly current: Release | null;
  readonly onPick: (takeId: string) => void;
  readonly onClear: () => void;
  readonly onNew: () => void;
  readonly onAdd: () => void;
};

export function Shelf({ shelf, picked, current, onPick, onClear, onNew, onAdd }: ShelfProps) {
  const none = picked.length === 0;
  return (
    <section className={s.col} aria-label="shelf">
      <header className={s.colHead}>
        <CapsHeading text="shelf" tally={{ value: shelf.length, label: "kept" }} />
        {!none && <Chip label="picked" value={picked.length} tone="cyan" onPress={onClear} name={`clear ${picked.length} picked`} />}
      </header>
      <div className={s.shelfActs}>
        <Button label="New release" size="sm" tone="cyan" disabled={none} onPress={onNew} />
        <Button label="Add to open" size="sm" disabled={none || current === null} onPress={onAdd} />
      </div>
      {shelf.length === 0 ? (
        <Empty label="no kept takes" />
      ) : (
        <ul className={s.takes}>
          {shelf.map((t) => {
            const on = picked.includes(t.takeId);
            const at = current === null ? -1 : current.tracks.findIndex((x) => x.takeId === t.takeId);
            return (
              <li key={t.takeId}>
                <button type="button" className={s.take} aria-pressed={on} onClick={() => onPick(t.takeId)}>
                  <span className={s.box} aria-hidden="true" />
                  <span className={s.takeText}>
                    <span className={s.takeTitle}>{t.title}</span>
                    <span className={s.takeMeta}>
                      <span>{clock(t.durationS)}</span>
                      <span>{fig(t.lufs)} LUFS</span>
                      <span>{fig(t.truePeakDb)} dBTP</span>
                      <span>{t.provider}</span>
                    </span>
                  </span>
                  {at >= 0 && <Chip label="on" value={`#${at + 1}`} casing="lower" name={`on the open release, track ${at + 1}`} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
