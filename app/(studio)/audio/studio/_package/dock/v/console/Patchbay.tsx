"use client";

// THE PATCHBAY (prototype dock-package, "console"): no release is on the desk. The releases stand as cartridges - the
// sleeve, the title, the kind and length, the status and the lamps of what still blocks, warns or waits - and a new
// one is patched from takes picked off the shelf (the wizard's Shelf, reused, with its import drop).
import { motion } from "motion/react";
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { releaseKind, type Release, type ShelfTake } from "@gt/domain/release";
import { releaseProblems } from "@gt/domain/release.problems";

import type { ReleaseRead } from "../../../../../_release/_port/port.ts";
import { clock, KIND_LABEL } from "../../../../../_release/wizard/fmt.ts";
import { Shelf } from "../../../../../_release/wizard/Shelf.tsx";
import { STATUS_ENTRY } from "../../../../../_release/wizard/status.ts";
import { severityOf } from "../../../../../_release/wizard/steps.ts";
import { Lamp } from "./Instruments.tsx";
import s from "./ground.module.css";

function Cartridge({ r, waiting, i, reduce, onOpen }: { readonly r: Release; readonly waiting: number; readonly i: number; readonly reduce: boolean; readonly onOpen: () => void }) {
  const sev = severityOf(releaseProblems(r));
  const total = r.tracks.reduce((a, t) => a + t.durationS, 0);
  const title = r.title.trim() === "" ? "untitled" : r.title;
  return (
    <motion.li initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.28, delay: reduce ? 0 : i * 0.05 }}>
      <button type="button" className={s.cart} onClick={onOpen} aria-label={`open ${title}, ${sev.block} block, ${sev.warn} warn, ${waiting} suggested`}>
        <span className={s.cartArt}>{r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt="" width={160} aspect={1} /> : <PlateMissing label="no sleeve" aspect={1} />}</span>
        <span className={s.cartBody}>
          <span className={s.cartTitle}>{title}</span>
          <span className={s.cartMeta}>
            {KIND_LABEL[releaseKind(r.tracks)]} · {r.tracks.length} · {clock(total)}
          </span>
          <EntryPill entry={STATUS_ENTRY[r.status]} />
          <span className={s.cartLamps}>
            <Lamp tone="rose" on={sev.block > 0} label="blk" count={sev.block} />
            <Lamp tone="amber" on={sev.warn > 0} label="wrn" count={sev.warn} />
            <Lamp tone="violet" on={waiting > 0} label="sig" count={waiting} />
          </span>
        </span>
      </button>
    </motion.li>
  );
}

export function Patchbay({ read, releases, waitingOf, reduce, onOpen, onCreate }: {
  readonly read: ReleaseRead;
  readonly releases: readonly Release[];
  readonly waitingOf: (id: string) => number;
  readonly reduce: boolean;
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
    <div className={s.patchbay}>
      <section className={s.bayCol} aria-label="releases">
        <h2 className={s.bayHead}>
          releases <span className={s.bayCount}>{releases.length}</span>
        </h2>
        <ul className={s.carts}>
          {releases.map((r, i) => (
            <Cartridge key={r.id} r={r} i={i} waiting={waitingOf(r.id)} reduce={reduce} onOpen={() => onOpen(r.id)} />
          ))}
        </ul>
      </section>
      <section className={s.bayCol} data-panel="" aria-label="new release from the shelf">
        <h2 className={s.bayHead}>
          shelf <span className={s.bayCount}>{read.shelf.length}</span>
        </h2>
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
        <Shelf takes={read.shelf} label="shelf" mode={{ kind: "pick", picked, onToggle: toggle }} importing={{ fixture: read.source === "fixture" }} />
      </section>
    </div>
  );
}
