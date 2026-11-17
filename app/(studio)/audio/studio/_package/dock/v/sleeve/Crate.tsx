"use client";

// THE CRATE (direction "sleeve"): before a release is open, the releases stand as sleeves in a crate - each its face,
// its title in the serif, its figures and what still blocks it - and a new one is pressed from takes picked off the
// shelf (or dropped onto it: the wizard's Shelf with its import, reused here). The sleeves enter staggered, once.
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { releaseKind, type Release, type ShelfTake } from "@gt/domain/release";
import { releaseProblems } from "@gt/domain/release.problems";

import type { ReleaseRead } from "../../../../../_release/_port/port.ts";
import { clock, KIND_LABEL } from "../../../../../_release/wizard/fmt.ts";
import { Shelf } from "../../../../../_release/wizard/Shelf.tsx";
import { STATUS_ENTRY } from "../../../../../_release/wizard/status.ts";
import { severityOf } from "../../../../../_release/wizard/steps.ts";
import { ArtWash, hrefOf, SleeveFace } from "./Art.tsx";
import { catalogueOf, kindOf, lengthOf, titleOf } from "./liner.ts";
import f from "./frame.module.css";
import k from "./crate.module.css";

function Sleeve({ r, i, onOpen }: { readonly r: Release; readonly i: number; readonly onOpen: () => void }) {
  const reduce = useReducedMotion() === true;
  const sev = severityOf(releaseProblems(r));
  return (
    <motion.li initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, delay: Math.min(i, 8) * 0.06, ease: [0.22, 1, 0.36, 1] }}>
      <button type="button" className={k.sleeve} onClick={onOpen} aria-label={`open ${titleOf(r)}`}>
        <SleeveFace release={r} width={300} />
        <span className={k.title}>{titleOf(r)}</span>
        <span className={k.figures}>
          <Chip label={kindOf(r)} casing="lower" />
          <Chip label={lengthOf(r)} casing="lower" />
          <EntryPill entry={STATUS_ENTRY[r.status]} />
          {sev.block > 0 && <Chip label="block" value={sev.block} tone="rose" />}
          {sev.warn > 0 && <Chip label="warn" value={sev.warn} tone="amber" />}
        </span>
        <span className={k.catalogue}>{catalogueOf(r)}</span>
      </button>
    </motion.li>
  );
}

export function Crate({ read, releases, onOpen, onCreate }: { readonly read: ReleaseRead; readonly releases: readonly Release[]; readonly onOpen: (id: string) => void; readonly onCreate: (takes: readonly ShelfTake[]) => void }) {
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
  const wash = releases.map(hrefOf).find((h) => h !== null) ?? null;
  return (
    <div className={f.root}>
      <ArtWash href={wash} />
      <div className={k.crate}>
        <section className={k.shelfOf} aria-labelledby="crate-releases">
          <h2 id="crate-releases" className={k.head}>
            Releases <span className={k.count}>{releases.length}</span>
          </h2>
          {releases.length === 0 ? (
            <Chip label="no releases yet" ghost />
          ) : (
            <ul className={k.sleeves}>
              {releases.map((r, i) => (
                <Sleeve key={r.id} r={r} i={i} onOpen={() => onOpen(r.id)} />
              ))}
            </ul>
          )}
        </section>
        <section className={k.press} aria-labelledby="crate-press">
          <h2 id="crate-press" className={k.head}>
            New from the shelf <span className={k.count}>{read.shelf.length} kept</span>
          </h2>
          <div className={k.pressBar}>
            <Button
              label="Start release"
              tone="emerald"
              disabled={takes.length === 0}
              {...(takes.length === 0 ? {} : { badge: { label: KIND_LABEL[releaseKind(takes)], value: `${takes.length} · ${clock(total)}`, tone: "emerald" as const } })}
              onPress={() => {
                onCreate(takes);
                setPicked(new Set());
              }}
            />
            {picked.size > 0 && <Button label="Clear" size="sm" onPress={() => setPicked(new Set())} />}
          </div>
          {/* STOP-GAP (prototype dock-package): the wizard's shelf rows and import, reused. */}
          <Shelf takes={read.shelf} label="shelf" mode={{ kind: "pick", picked, onToggle: toggle }} importing={{ fixture: read.source === "fixture" }} />
        </section>
      </div>
    </div>
  );
}
