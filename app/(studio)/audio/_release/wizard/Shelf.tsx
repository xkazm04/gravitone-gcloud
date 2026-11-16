"use client";

// The shelf: kept takes with what was measured on them (length, integrated loudness, true peak) and
// the provider that made them. Two uses - pick several to start a release, or add one to the open
// release - one row shape.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import type { ShelfTake } from "@gt/domain/release";

import { clock, db } from "./fmt.ts";
import s from "./step.module.css";

type Mode =
  | { readonly kind: "pick"; readonly picked: ReadonlySet<string>; readonly onToggle: (takeId: string) => void }
  | { readonly kind: "add"; readonly onAdd: (take: ShelfTake) => void };

export function Shelf({ takes, mode, label }: { readonly takes: readonly ShelfTake[]; readonly mode: Mode; readonly label: string }) {
  if (takes.length === 0) return <Empty label="No kept takes on the shelf" />;
  return (
    <ul className={s.shelf} data-mode={mode.kind} aria-label={label}>
      {takes.map((t) => {
        const on = mode.kind === "pick" && mode.picked.has(t.takeId);
        return (
          <li key={t.takeId} className={s.shelfRow} data-on={on ? "" : undefined}>
            {mode.kind === "pick" ? (
              <button type="button" className={s.pick} aria-pressed={on} aria-label={`pick ${t.title}`} onClick={() => mode.onToggle(t.takeId)}>
                <span aria-hidden="true">{on ? "✓" : ""}</span>
              </button>
            ) : null}
            <span className={s.shelfTitle}>{t.title}</span>
            <span className={s.num}>{clock(t.durationS)}</span>
            <span className={s.num} aria-label={t.lufs === null ? "loudness not measured" : `${t.lufs} LUFS`}>
              {t.lufs === null ? "—" : `${db(t.lufs)} LUFS`}
            </span>
            <span className={s.num} aria-label={t.truePeakDb === null ? "true peak not measured" : `${t.truePeakDb} dBTP`}>
              {t.truePeakDb === null ? "—" : `${db(t.truePeakDb)} dBTP`}
            </span>
            <Chip label={t.provider} casing="lower" />
            <span className={s.shelfFlag}>{t.audioHref === null && <Chip label="no audio" ghost />}</span>
            {mode.kind === "add" && <Button label="Add" size="sm" onPress={() => mode.onAdd(t)} />}
          </li>
        );
      })}
    </ul>
  );
}
