"use client";

// THE RELEASE IN HAND (kit candidate `ReleaseBadge`): its sleeve, its title in the display serif, its figures as chips,
// its status and the saving mark - one line above the stack, with the way back to every release.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { releaseKind, type Release } from "@gt/domain/release";

import { clock, day, KIND_LABEL } from "../../../../../_release/wizard/fmt.ts";
import { STATUS_ENTRY } from "../../../../../_release/wizard/status.ts";
import { titleOf, totalOf } from "./model.ts";
import s from "./stack.module.css";

export function Header({ r, saving, onLeave }: { readonly r: Release; readonly saving: boolean; readonly onLeave: () => void }) {
  const reduce = useReducedMotion() === true;
  return (
    <header className={s.header}>
      {r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt="" className={s.headerArt} width={56} aspect={1} /> : <PlateMissing className={s.headerArt} aspect={1} />}
      <div className={s.headerText}>
        <span className={s.headerTitle}>{titleOf(r)}</span>
        <span className={s.headerFacts}>
          <span className={s.headerArtist}>{r.artist.trim() === "" ? "no artist" : r.artist}</span>
          <Chip label={KIND_LABEL[releaseKind(r.tracks)]} casing="lower" />
          <Chip label={`${r.tracks.length} ${r.tracks.length === 1 ? "track" : "tracks"}`} casing="lower" />
          <Chip label={clock(totalOf(r))} casing="lower" />
          {r.releaseDate !== null && <Chip label={day(r.releaseDate)} casing="lower" tone="violet" />}
        </span>
      </div>
      <span className={s.headerEnd}>
        <AnimatePresence>
          {saving && (
            <motion.span initial={reduce ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.16 }}>
              <Chip label="saving" tone="cyan" dot />
            </motion.span>
          )}
        </AnimatePresence>
        <EntryPill entry={STATUS_ENTRY[r.status]} />
        <Button label="All releases" size="sm" glyph="grid" onPress={onLeave} />
      </span>
    </header>
  );
}
