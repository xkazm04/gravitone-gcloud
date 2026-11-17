"use client";

// THE SHELF IN A DIALOG: kept takes with what was measured on them, either picked several at a time (a new release)
// or added one at a time (the open release). One row shape for both.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import type { ShelfTake } from "@gt/domain/release";

import { clock, db } from "../../../../../../_release/wizard/fmt.ts";
import s from "./steps.module.css";

export type ShelfMode =
  | { readonly kind: "pick"; readonly picked: ReadonlySet<string>; readonly onToggle: (takeId: string) => void }
  | { readonly kind: "add"; readonly onAdd: (take: ShelfTake) => void };

export function ShelfList({ takes, mode, label }: { readonly takes: readonly ShelfTake[]; readonly mode: ShelfMode; readonly label: string }) {
  if (takes.length === 0) return <Empty label="No kept takes on the shelf" />;
  return (
    <ul className={s.shelf} aria-label={label}>
      {takes.map((t) => {
        const on = mode.kind === "pick" && mode.picked.has(t.takeId);
        return (
          <li key={t.takeId} className={s.shelfRow} data-on={on ? "" : undefined}>
            {mode.kind === "pick" && (
              <button type="button" className={s.pick} aria-pressed={on} aria-label={`pick ${t.title}`} onClick={() => mode.onToggle(t.takeId)}>
                <span aria-hidden="true">{on ? "✓" : ""}</span>
              </button>
            )}
            <span className={s.shelfTitle}>{t.title}</span>
            <span className={s.num}>{clock(t.durationS)}</span>
            <span className={s.num}>{t.lufs === null ? "—" : `${db(t.lufs)} LUFS`}</span>
            <Chip label={t.provider} casing="lower" />
            {t.audioHref === null && <Chip label="no audio" ghost />}
            {mode.kind === "add" && <Button label="Add" size="sm" glyph="down" onPress={() => mode.onAdd(t)} />}
          </li>
        );
      })}
    </ul>
  );
}
