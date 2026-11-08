"use client";

// A CHANNEL STRIP (prototype v1): one step of the cover as one line - its number marked by where it stands (a solid cap
// done, a ring now, a dashed cap later: a shape, not only a colour), its name, and its facts right-aligned - that
// unfolds into the step's controls on a click. Folding animates the height, click-gated; under reduced motion it snaps.
// `actions` sit on the line beside the toggle, never inside it (a button may not hold a button). `tools` lead the
// open body (the takes strip's keys). Extractable: a strip is a Fold with facts on its head line.
import { AnimatePresence, motion } from "motion/react";
import { useId, type ReactNode } from "react";

import { SrOnly } from "@gt/ui/components/a11y/SrOnly.tsx";
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";

import { useMotionKit } from "./motion.ts";
import type { Phase } from "./steps.ts";
import c from "./console.module.css";

export type StripProps = {
  readonly n: number;
  readonly title: string;
  readonly phase: Phase;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly facts: ReactNode;
  readonly actions?: ReactNode;
  readonly tools?: ReactNode;
  readonly children: ReactNode;
};

export function Strip({ n, title, phase, open, onToggle, facts, actions, tools, children }: StripProps) {
  const id = useId();
  const kit = useMotionKit();
  return (
    <section className={c.strip} data-phase={phase} data-open={open ? "" : undefined} aria-label={title}>
      <div className={c.line}>
        <button type="button" className={c.toggle} aria-expanded={open} aria-controls={id} onClick={onToggle}>
          <span className={c.cap} data-phase={phase} aria-hidden="true">
            {n}
          </span>
          <SrOnly text={`${phase === "now" ? "now" : phase}, `} />
          <span className={c.title}>{title}</span>
          <span className={c.facts}>{facts}</span>
          <Glyph name="down" className={open ? `${c.chev} ${c.chevOpen}` : c.chev} />
        </button>
        {actions !== undefined && <span className={c.actions}>{actions}</span>}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="body"
            className={c.clip}
            initial={kit.still ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={kit.still ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
            transition={kit.fold}
          >
            <div className={c.body}>
              {tools}
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
