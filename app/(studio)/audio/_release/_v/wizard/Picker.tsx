"use client";

// Before the walk: which release. The releases in the draft, each with its sleeve, kind, status and
// what still blocks it; or a new one, started from takes picked off the shelf.
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { releaseKind, type Release, type ShelfTake } from "@gt/domain/release";
import { releaseProblems } from "@gt/domain/release.problems";

import type { ReleaseRead } from "../../_port/port.ts";
import { clock, day, KIND_LABEL } from "./fmt.ts";
import { Shelf } from "./Shelf.tsx";
import { severityOf } from "./steps.ts";
import { STATUS_ENTRY } from "./status.ts";
import s from "./wizard.module.css";

function ReleaseCard({ release: r, onOpen }: { readonly release: Release; readonly onOpen: () => void }) {
  const sev = severityOf(releaseProblems(r));
  const total = r.tracks.reduce((a, t) => a + t.durationS, 0);
  return (
    <li>
      <button type="button" className={s.card} onClick={onOpen} aria-label={`open ${r.title.trim() === "" ? "untitled release" : r.title}`}>
        {r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt="" className={s.cardArt} width={220} aspect={1} /> : <PlateMissing label="no sleeve" className={s.cardArt} aspect={1} />}
        <span className={s.cardBody}>
          <span className={s.cardTitle}>{r.title.trim() === "" ? "untitled" : r.title}</span>
          <span className={s.cardMeta}>
            {r.artist} · {KIND_LABEL[releaseKind(r.tracks)]} · {r.tracks.length} {r.tracks.length === 1 ? "track" : "tracks"} · {clock(total)}
          </span>
          <span className={s.cardChips}>
            <EntryPill entry={STATUS_ENTRY[r.status]} />
            {r.releaseDate !== null && <Chip label={day(r.releaseDate)} casing="lower" tone="violet" />}
            {sev.block > 0 && <Chip label="block" value={sev.block} tone="rose" />}
            {sev.warn > 0 && <Chip label="warn" value={sev.warn} tone="amber" />}
          </span>
        </span>
      </button>
    </li>
  );
}

export function Picker({ read, releases, onOpen, onCreate }: {
  readonly read: ReleaseRead;
  readonly releases: readonly Release[];
  readonly onOpen: (id: string) => void;
  readonly onCreate: (takes: readonly ShelfTake[]) => void;
}) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // Shelf order is the release's track order: the takes go in as they sit on the shelf.
  const takes = read.shelf.filter((t) => picked.has(t.takeId));
  const total = takes.reduce((a, t) => a + t.durationS, 0);
  return (
    <div className={s.picker}>
      <section className={s.pickerCol} aria-label="releases">
        <CapsHeading text="Releases" tally={{ value: releases.length }} level={2} />
        <ul className={s.cards}>
          {releases.map((r) => (
            <ReleaseCard key={r.id} release={r} onOpen={() => onOpen(r.id)} />
          ))}
        </ul>
      </section>
      <section className={s.pickerCol} aria-label="new release from the shelf">
        <CapsHeading text="New from the shelf" tally={{ value: read.shelf.length, label: "kept" }} level={2} />
        <div className={s.startBar}>
          <Button
            label="Start release"
            tone="emerald"
            disabled={takes.length === 0}
            badge={takes.length === 0 ? undefined : { label: KIND_LABEL[releaseKind(takes)], value: `${takes.length} · ${clock(total)}`, tone: "emerald" }}
            onPress={() => {
              onCreate(takes);
              setPicked(new Set());
            }}
          />
          {picked.size > 0 && <Button label="Clear" size="sm" onPress={() => setPicked(new Set())} />}
        </div>
        <Shelf takes={read.shelf} label="shelf" mode={{ kind: "pick", picked, onToggle: toggle }} />
      </section>
    </div>
  );
}
