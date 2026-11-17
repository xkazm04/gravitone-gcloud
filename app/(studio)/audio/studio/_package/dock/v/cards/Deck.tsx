"use client";

// NO RELEASE OPEN: the releases as a deck of cards - sleeve, title, figures, status, what still blocks it - each
// opening its stack; and a card for a new one, whose shelf (pick takes, start) opens in a dialog.
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { releaseKind, type Release, type ShelfTake } from "@gt/domain/release";
import { releaseProblems } from "@gt/domain/release.problems";

import type { ReleaseRead } from "../../../../../_release/_port/port.ts";
import { clock, day, KIND_LABEL } from "../../../../../_release/wizard/fmt.ts";
import { STATUS_ENTRY } from "../../../../../_release/wizard/status.ts";
import { severityOf } from "../../../../../_release/wizard/steps.ts";
import { Sheet } from "./Door.tsx";
import { titleOf, totalOf } from "./model.ts";
import { ARRIVE } from "./motion.ts";
import { ShelfList } from "./steps/Shelf.tsx";
import s from "./deck.module.css";

function ReleaseCard({ r, i, onOpen }: { readonly r: Release; readonly i: number; readonly onOpen: () => void }) {
  const reduce = useReducedMotion() === true;
  const sev = severityOf(releaseProblems(r));
  return (
    <motion.li initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={reduce ? { duration: 0 } : { ...ARRIVE, delay: Math.min(i, 6) * 0.04 }}>
      <button type="button" className={s.card} onClick={onOpen} aria-label={`open ${titleOf(r)}`}>
        {r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt="" className={s.art} width={240} aspect={1} /> : <PlateMissing label="no sleeve" className={s.art} aspect={1} />}
        <span className={s.body}>
          <span className={s.title}>{titleOf(r)}</span>
          <span className={s.chips}>
            <Chip label={KIND_LABEL[releaseKind(r.tracks)]} casing="lower" />
            <Chip label={`${r.tracks.length} · ${clock(totalOf(r))}`} casing="lower" />
            {r.releaseDate !== null && <Chip label={day(r.releaseDate)} casing="lower" tone="violet" />}
          </span>
          <span className={s.chips}>
            <EntryPill entry={STATUS_ENTRY[r.status]} />
            {sev.block > 0 && <Chip label="block" value={sev.block} tone="rose" dot />}
            {sev.warn > 0 && <Chip label="warn" value={sev.warn} tone="amber" dot />}
          </span>
        </span>
      </button>
    </motion.li>
  );
}

function NewRelease({ read, onCreate }: { readonly read: ReleaseRead; readonly onCreate: (takes: readonly ShelfTake[]) => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // Shelf order is the release's track order.
  const takes = read.shelf.filter((t) => picked.has(t.takeId));
  return (
    <li>
      <button type="button" className={s.fresh} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className={s.plus} aria-hidden="true">
          +
        </span>
        <span className={s.title}>New release</span>
        <Chip label="shelf" value={read.shelf.length} casing="lower" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="New release" size="xl">
        <div className={s.sheet}>
          <ShelfList takes={read.shelf} label="shelf" mode={{ kind: "pick", picked, onToggle: toggle }} />
          <span className={s.start}>
            {picked.size > 0 && <Button label="Clear" size="sm" onPress={() => setPicked(new Set())} />}
            <Button
              label="Start release"
              tone="emerald"
              disabled={takes.length === 0}
              badge={takes.length === 0 ? undefined : { label: KIND_LABEL[releaseKind(takes)], value: `${takes.length} · ${clock(takes.reduce((a, t) => a + t.durationS, 0))}`, tone: "emerald" }}
              onPress={() => {
                setOpen(false);
                onCreate(takes);
                setPicked(new Set());
              }}
            />
          </span>
        </div>
      </Sheet>
    </li>
  );
}

export function Deck({ read, releases, onOpen, onCreate }: { readonly read: ReleaseRead; readonly releases: readonly Release[]; readonly onOpen: (id: string) => void; readonly onCreate: (takes: readonly ShelfTake[]) => void }) {
  return (
    <div className={s.deck}>
      <span className={s.head}>
        <span className={s.headTitle}>Releases</span>
        <Chip label="releases" value={releases.length} casing="lower" />
      </span>
      {releases.length === 0 && read.shelf.length === 0 && <Empty label="No releases and no kept takes" />}
      <ul className={s.cards} aria-label="releases">
        {releases.map((r, i) => (
          <ReleaseCard key={r.id} r={r} i={i} onOpen={() => onOpen(r.id)} />
        ))}
        <NewRelease read={read} onCreate={onCreate} />
      </ul>
    </div>
  );
}
