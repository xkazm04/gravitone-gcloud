"use client";

// THE STRIP, PULLED FORWARD (prototype dock-package, "console"): the prototype's one Dialog (../_kit/Dialog.tsx) with
// the strip's face as its head - the face carries its layoutId, so pressing a strip morphs its face into this head and
// closing sends it back. The body is the step's editor; the foot walks to the neighbouring strips (the head morphs
// again) and accepts every signal on this one. A readout opens the editor at its own field (`data-field`).
import { motion } from "motion/react";
import { useEffect, useId, type ReactNode } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";

import { STEP_LABEL, STEPS, type StepId } from "../../../../../_release/wizard/steps.ts";
import { Dialog } from "../_kit/Dialog.tsx";
import { ChannelsEditor } from "./editors/Channels.tsx";
import { DetailsEditor } from "./editors/Details.tsx";
import type { EditorProps } from "./editors/props.ts";
import { ReviewEditor } from "./editors/Review.tsx";
import { RightsEditor } from "./editors/Rights.tsx";
import { ExtrasEditor, SleeveEditor } from "./editors/StopGap.tsx";
import { TracksEditor } from "./editors/Tracks.tsx";
import { Face, type FaceState } from "./Face.tsx";
import s from "./editor.module.css";

const EDITOR: Readonly<Record<StepId, (p: EditorProps) => ReactNode>> = {
  tracks: TracksEditor,
  details: DetailsEditor,
  rights: RightsEditor,
  sleeve: SleeveEditor,
  channels: ChannelsEditor,
  extras: ExtrasEditor,
  review: ReviewEditor,
};

const FOCUSABLE = "input:not([disabled]),textarea:not([disabled]),button:not([disabled]),[role=combobox],[tabindex]:not([tabindex='-1'])";

export interface Opened {
  readonly step: StepId;
  /** The field a readout asked for, or null for the editor's top. */
  readonly field: string | null;
  /** Bumped on every open, so a second press on the same readout moves focus again. */
  readonly n: number;
  /** Closed, the step stays: it is the strip the console has selected, and the head it closes from. */
  readonly open: boolean;
}

export function StepDialog({ opened, face, editor, incoming, commit, onStep, onClose, onAcceptAll }: {
  readonly opened: Opened;
  readonly face: (step: StepId) => FaceState;
  readonly editor: EditorProps;
  readonly incoming: (step: StepId) => number;
  /** The master's commit, drawn in the review's foot. */
  readonly commit: ReactNode;
  readonly onStep: (step: StepId) => void;
  readonly onClose: () => void;
  readonly onAcceptAll: (step: StepId) => void;
}) {
  const bodyId = useId();
  const reduce = editor.reduce;
  useEffect(() => {
    if (!opened.open || opened.field === null) return;
    const id = requestAnimationFrame(() => {
      const at = document.getElementById(bodyId)?.querySelector<HTMLElement>(`[data-field="${CSS.escape(opened.field ?? "")}"]`);
      if (at === null || at === undefined) return;
      at.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
      at.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [opened, bodyId, reduce]);

  const step = opened.step;
  const at = STEPS.indexOf(step);
  const prev = STEPS[at - 1];
  const next = STEPS[at + 1];
  const waiting = incoming(step);
  const Editor = EDITOR[step];
  return (
    <Dialog
      open={opened.open}
      onClose={onClose}
      title={STEP_LABEL[step]}
      head={<Face state={face(step)} morph={!reduce} place="head" />}
      width="wide"
      className={s.panel}
      foot={
        <div className={s.foot}>
          {prev !== undefined ? <Button label={`‹ ${STEP_LABEL[prev]}`} size="sm" onPress={() => onStep(prev)} /> : <span />}
          {waiting > 0 && <Button label="Accept all" size="sm" tone="emerald" tally={{ value: waiting }} onPress={() => onAcceptAll(step)} />}
          {next !== undefined ? <Button label={`${STEP_LABEL[next]} ›`} size="sm" tone="cyan" onPress={() => onStep(next)} /> : commit}
        </div>
      }
    >
      <motion.div key={step} id={bodyId} className={s.body} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.22, delay: reduce ? 0 : 0.06 }}>
        <Editor {...editor} />
      </motion.div>
    </Dialog>
  );
}
