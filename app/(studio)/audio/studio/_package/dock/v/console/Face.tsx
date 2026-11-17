"use client";

// A STRIP'S FACE (prototype dock-package, "console"): the step's number, its name and its four lamps - block, warn,
// incoming, clear. The same face is the strip's head on the console and the dialog's head when the strip is open: a
// shared `layoutId` carries it from one place to the other, so the editor reads as the strip pulled forward.
import { motion } from "motion/react";

import { STEP_LABEL, STEPS, type Severity, type StepId } from "../../../../../_release/wizard/steps.ts";
import { Lamp } from "./Instruments.tsx";
import type { Level } from "./strips.ts";
import s from "./strip.module.css";

export interface FaceState {
  readonly step: StepId;
  readonly sev: Severity;
  readonly level: Level;
  readonly incoming: number;
}

export const faceId = (step: StepId): string => `console-face-${step}`;

/** What the face says to a screen reader: its number, its name, its counts. */
export function spokenFace({ step, sev, incoming }: FaceState): string {
  const counts = [sev.block > 0 ? `${sev.block} block` : "", sev.warn > 0 ? `${sev.warn} warn` : "", incoming > 0 ? `${incoming} suggested` : ""].filter((x) => x !== "");
  return `${STEPS.indexOf(step) + 1} ${STEP_LABEL[step]}, ${counts.length === 0 ? "clear" : counts.join(", ")}`;
}

/** The face. `morph` gives it the shared layoutId; without it (reduced motion, or the socket left behind) it is still. */
export function Face({ state, morph, place }: { readonly state: FaceState; readonly morph: boolean; readonly place: "strip" | "head" | "socket" }) {
  const { step, sev, level, incoming } = state;
  const n = String(STEPS.indexOf(step) + 1).padStart(2, "0");
  const body = (
    <>
      <span className={s.faceTop}>
        <span className={s.faceNo}>{n}</span>
        <span className={s.faceName}>{STEP_LABEL[step]}</span>
      </span>
      <span className={s.lamps}>
        <Lamp tone="rose" on={sev.block > 0} label="blk" count={sev.block} />
        <Lamp tone="amber" on={sev.warn > 0} label="wrn" count={sev.warn} />
        <Lamp tone="violet" on={incoming > 0} label="sig" count={incoming} />
        <Lamp tone="emerald" on={level === "clear" && incoming === 0} label="ok" />
      </span>
    </>
  );
  if (!morph) {
    return (
      <span className={s.face} data-place={place} data-level={level}>
        {body}
      </span>
    );
  }
  return (
    <motion.span layoutId={faceId(step)} className={s.face} data-place={place} data-level={level} transition={{ type: "spring", stiffness: 380, damping: 36 }}>
      {body}
    </motion.span>
  );
}
