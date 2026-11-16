"use client";

// The shelf drawer: the kept takes a release is pressed from. Picking is the drawer's own state (it
// is not a field of any release); pressing makes a new release from the picks, or adds them to the
// one open on the board.
import { useState } from "react";

import type { Release, ShelfTake } from "@gt/domain/release";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import { clock, signed } from "./board.ts";
import s from "./board.module.css";

export interface ShelfProps {
  readonly id: string;
  readonly open: boolean;
  readonly shelf: readonly ShelfTake[];
  readonly target: Release | null;
  readonly onCreate: (takes: readonly ShelfTake[]) => void;
  readonly onAdd: (takes: readonly ShelfTake[]) => void;
  readonly onClose: () => void;
}

export function Shelf({ id, open, shelf, target, onCreate, onAdd, onClose }: ShelfProps) {
  const [picked, setPicked] = useState<readonly string[]>([]);
  const takes = shelf.filter((t) => picked.includes(t.takeId));
  const onTarget = new Set(target?.tracks.map((t) => t.takeId) ?? []);
  const fresh = takes.filter((t) => !onTarget.has(t.takeId));
  const flip = (takeId: string) => setPicked((p) => (p.includes(takeId) ? p.filter((x) => x !== takeId) : [...p, takeId]));
  return (
    <aside id={id} className={s.shelf} hidden={!open} aria-label="shelf">
      <div className={s.shelfHead}>
        <h3 className={s.colHead}>
          shelf
          <Tally value={shelf.length} label="kept" />
        </h3>
        <span className={s.grow} />
        <Button label="close" size="sm" onPress={onClose} />
      </div>
      {shelf.length === 0 ? (
        <Empty label="no kept takes" />
      ) : (
        <ul className={s.takes}>
          {shelf.map((t) => (
            <li key={t.takeId}>
              <button type="button" className={s.take} aria-pressed={picked.includes(t.takeId)} onClick={() => flip(t.takeId)}>
                <span className={s.pick} aria-hidden="true" />
                <span className={s.takeTitle}>{t.title}</span>
                <span className={s.takeTime}>{clock(t.durationS)}</span>
                <span className={s.takeMeas}>
                  <span>{t.lufs === null ? "— LUFS" : `${signed(t.lufs)} LUFS`}</span>
                  <span>{t.truePeakDb === null ? "— dBTP" : `${signed(t.truePeakDb)} dBTP`}</span>
                  <span>{t.provider}</span>
                  {t.audioHref === null && <Chip label="no audio" ghost casing="lower" />}
                  {onTarget.has(t.takeId) && <Chip label="on release" tone="emerald" casing="lower" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {shelf.length > 0 && (
        <div className={s.shelfActs}>
          <Button
            label="new release"
            tone="cyan"
            tally={{ value: takes.length, label: "picked" }}
            disabled={takes.length === 0}
            onPress={() => {
              onCreate(takes);
              setPicked([]);
            }}
          />
          {target !== null && (
            <Button
              label={`add to ${target.title || "untitled"}`}
              tally={{ value: fresh.length }}
              disabled={fresh.length === 0}
              onPress={() => {
                onAdd(fresh);
                setPicked([]);
              }}
            />
          )}
        </div>
      )}
    </aside>
  );
}
