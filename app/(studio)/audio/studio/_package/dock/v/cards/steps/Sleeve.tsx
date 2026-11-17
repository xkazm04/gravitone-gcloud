"use client";

// THE SLEEVE ON THE CARD: the picture large (or the hatched gap where it is missing), the stores' three checks as
// pass/fail marks against it (square, size, RGB), its source, and the prompt it is made from. Choosing one - generate,
// upload or an MV still - opens in a dialog.
//
// STOP-GAP (prototype dock-package): the chooser inside the dialog is the wizard's own StepSleeve, reused whole - the
// takes run through ../../../../../../_release/sleeveActs.ts on press, the fixture answers from its pictures. The design
// judgement of this variant is the card; the generation flow keeps the wizard's look until it is redrawn.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { SLEEVE_PX } from "@gt/domain/release";

import type { StepProps } from "../../../../../../_release/wizard/steps.ts";
import { StepSleeve } from "../../../../../../_release/wizard/StepSleeve.tsx";
import { Sheet } from "../Door.tsx";
import { ARRIVE, INSTANT } from "../motion.ts";
import s from "./steps.module.css";

const SOURCE_WORD = { generated: "generated", upload: "upload", "mv-look": "MV still" } as const;

function Check({ label, ok, tone = "block" }: { readonly label: string; readonly ok: boolean | null; readonly tone?: "block" | "warn" }) {
  const state = ok === null ? "unknown" : ok ? "pass" : tone;
  return (
    <span className={s.check} data-state={state} aria-label={`${label}: ${ok === null ? "no sleeve" : ok ? "pass" : "fail"}`}>
      <span className={s.checkMark} aria-hidden="true">
        {ok === null ? "·" : ok ? "✓" : "×"}
      </span>
      <span className={s.checkLabel} aria-hidden="true">
        {label}
      </span>
    </span>
  );
}

export function SleeveBody(props: StepProps) {
  const { release: r, dispatch } = props;
  const reduce = useReducedMotion() === true;
  const [open, setOpen] = useState(false);
  const sl = r.sleeve;
  const prompt = r.sleevePrompt;
  return (
    <div className={s.sleeve}>
      <figure className={s.sleeveArt}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={sl?.href ?? "none"} className={s.sleeveFrame} initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={reduce ? { opacity: 0, transition: INSTANT } : { opacity: 0, scale: 0.98 }} transition={reduce ? INSTANT : ARRIVE}>
            {sl !== null && sl.href !== null ? <Plate src={sl.href} alt={`sleeve of ${r.title}`} className={s.sleevePlate} width={360} aspect={1} /> : <PlateMissing label="no sleeve" className={s.sleevePlate} aspect={1} />}
          </motion.div>
        </AnimatePresence>
      </figure>
      <div className={s.sleeveSide}>
        <div className={s.checks} role="group" aria-label="store checks">
          <Check label="square" ok={sl === null ? null : sl.widthPx === sl.heightPx} />
          <Check label={`${SLEEVE_PX} px`} ok={sl === null ? null : Math.min(sl.widthPx, sl.heightPx) >= SLEEVE_PX} tone="warn" />
          <Check label="RGB" ok={sl === null ? null : sl.rgb} />
        </div>
        {sl !== null && (
          <span className={s.sealChips}>
            <Chip label="size" value={`${sl.widthPx} × ${sl.heightPx}`} casing="lower" />
            <Chip label="source" value={SOURCE_WORD[sl.source]} casing="lower" />
          </span>
        )}
        <div className={s.prompt}>
          <span className={s.k}>prompt</span>
          {prompt === null ? <span className={s.promptEmpty}>—</span> : <q className={s.promptText}>{prompt}</q>}
        </div>
        <span className={s.acts}>
          <Button label={sl === null ? "Choose sleeve" : "Change sleeve"} tone={sl === null ? "cyan" : "neutral"} glyph="grid" onPress={() => setOpen(true)} />
          {sl !== null && <Button label="Remove" size="sm" tone="rose" onPress={() => dispatch({ type: "sleeve", id: r.id, sleeve: null })} />}
        </span>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Sleeve" size="xl">
        <StepSleeve {...props} />
      </Sheet>
    </div>
  );
}
