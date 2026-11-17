"use client";

// THE SCRIBBLE STRIP (prototype dock-package, "console"): the release the desk is set up for, across the top the way a
// console's tape names its show - the sleeve, the title, its figures as readouts, its status, the write in flight,
// and the way back to every release.
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { releaseKind, type Release } from "@gt/domain/release";

import { clock, KIND_LABEL } from "../../../../../_release/wizard/fmt.ts";
import { STATUS_ENTRY } from "../../../../../_release/wizard/status.ts";
import { TickCounter } from "./Instruments.tsx";
import s from "./ground.module.css";

function Figure({ k, children }: { readonly k: string; readonly children: ReactNode }) {
  return (
    <span className={s.figure}>
      <span className={s.figureK}>{k}</span>
      <span className={s.figureV}>{children}</span>
    </span>
  );
}

export function Scribble({ r, saving, reduce, onLeave }: { readonly r: Release; readonly saving: boolean; readonly reduce: boolean; readonly onLeave: () => void }) {
  const total = r.tracks.reduce((a, t) => a + t.durationS, 0);
  return (
    <header className={s.scribble}>
      <span className={s.scribbleArt}>{r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt="" width={72} aspect={1} /> : <PlateMissing aspect={1} />}</span>
      <div className={s.scribbleText}>
        <h2 className={s.scribbleTitle}>{r.title.trim() === "" ? "untitled" : r.title}</h2>
        <div className={s.figures}>
          <Figure k="artist">{r.artist.trim() === "" ? "—" : r.artist}</Figure>
          <Figure k="kind">{KIND_LABEL[releaseKind(r.tracks)]}</Figure>
          <Figure k="tracks">
            <TickCounter value={r.tracks.length} />
          </Figure>
          <Figure k="length">{clock(total)}</Figure>
          <Figure k="date">{r.releaseDate ?? "on process"}</Figure>
        </div>
      </div>
      <div className={s.scribbleActs}>
        <AnimatePresence initial={false}>
          {saving && (
            <motion.span key="saving" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.2 } }}>
              <Chip label="saving" tone="cyan" dot />
            </motion.span>
          )}
        </AnimatePresence>
        <EntryPill entry={STATUS_ENTRY[r.status]} />
        <Button label="All releases" size="sm" onPress={onLeave} />
      </div>
    </header>
  );
}
