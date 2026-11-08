"use client";

// A STATE THAT CROSSFADES (prototype v1): the house Chip, keyed by the state it names, so when the brief or the cover's
// job moves (queued -> running -> done, rendering -> judging) the old word fades out as the new one fades in, in
// place. One chip at a time holds the slot (popLayout), so the line around it does not jump.
import { AnimatePresence, motion } from "motion/react";

import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import type { Tone } from "@gt/ui/components/chip/tone.ts";

import { useMotionKit } from "./motion.ts";
import c from "./console.module.css";

export function StateChip({ label, value, tone, name }: { readonly label: string; readonly value?: string; readonly tone: Tone; readonly name?: string }) {
  const kit = useMotionKit();
  const key = `${label}:${value ?? ""}`;
  return (
    <span className={c.swap}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={key} className={c.swapIn} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={kit.swap}>
          <Chip label={label} {...(value === undefined ? {} : { value })} tone={tone} dot casing="lower" {...(name === undefined ? {} : { name })} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
