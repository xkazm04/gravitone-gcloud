"use client";

// A CHANNEL STRIP (prototype dock-package, "console"): one step of the release as a machined panel - its face (lamps),
// its LED meter beside its readouts, a lamp per track, and the agent's incoming signal when a suggestion touches it.
// Every readout and the face open the step's editor (a dialog the face morphs into); the incoming block accepts all
// of the step's suggestions in one press. All seven strips stand side by side; nothing on a strip is a sentence.
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import type { ChannelRow, Release } from "@gt/domain/release";
import { parseProposalPath } from "@gt/domain/release.record";

import { fieldLabel } from "../../../../../_release/pending.ts";
import { STEP_LABEL, STEPS } from "../../../../../_release/wizard/steps.ts";
import { Face, spokenFace } from "./Face.tsx";
import { Lamp, LedMeter, Readout, TrackLamps } from "./Instruments.tsx";
import { armLamps, type StripModel } from "./strips.ts";
import s from "./strip.module.css";

export interface StripProps {
  readonly model: StripModel;
  readonly release: Release;
  readonly channels: readonly ChannelRow[];
  /** This strip's face is up in the dialog: the strip keeps an empty socket. */
  readonly lifted: boolean;
  readonly selected: boolean;
  readonly reduce: boolean;
  readonly onOpen: (field?: string) => void;
  readonly onAcceptAll: () => void;
}

/** The field a proposal sets, as the editor marks it (`data-field`). */
export const fieldKey = (path: string): string => parseProposalPath(path)?.field ?? path;

function Incoming({ model, reduce, onOpen, onAcceptAll }: Pick<StripProps, "model" | "reduce" | "onOpen" | "onAcceptAll">) {
  const n = model.incoming.length;
  return (
    <AnimatePresence initial={false}>
      {n > 0 && (
        <motion.div
          key="incoming"
          className={s.incoming}
          initial={reduce ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 }}
          transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={s.incomingInner}>
            <span className={s.incomingHead}>
              <Lamp tone="violet" on />
              <span className={s.incomingWord}>incoming</span>
              <Button label="Accept" size="sm" tone="emerald" tally={{ value: n }} onPress={onAcceptAll} />
            </span>
            <ul className={s.incomingList} aria-label={`suggested on ${STEP_LABEL[model.step]}`}>
              {model.incoming.map((p) => (
                <li key={p.id}>
                  <button type="button" className={s.signalTag} onClick={() => onOpen(fieldKey(p.path))} aria-label={`suggested ${fieldLabel(p.path)}, open`}>
                    {fieldLabel(p.path)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Extra({ model, release: r, channels, onOpen }: Pick<StripProps, "model" | "release" | "channels" | "onOpen">) {
  if (model.step === "sleeve") {
    const sl = r.sleeve;
    return (
      <button type="button" className={s.thumb} onClick={() => onOpen("art")} aria-label={sl === null ? "no sleeve, open sleeve" : "sleeve, open"}>
        {sl !== null && sl.href !== null ? <Plate src={sl.href} alt="" className={s.thumbArt} width={200} aspect={1} /> : <PlateMissing label="no sleeve" className={s.thumbArt} aspect={1} />}
      </button>
    );
  }
  if (model.step === "channels") {
    return (
      <span className={s.arms} aria-hidden="true">
        {armLamps(r, channels).map((a) => (
          <Lamp key={a.id} tone="emerald" on={a.armed} label={a.mark} />
        ))}
      </span>
    );
  }
  return null;
}

export function Strip({ model, release, channels, lifted, selected, reduce, onOpen, onAcceptAll }: StripProps) {
  const i = STEPS.indexOf(model.step);
  const state = { step: model.step, sev: model.sev, level: model.level, incoming: model.incoming.length };
  return (
    <motion.section
      className={s.strip}
      data-level={model.level}
      data-selected={selected}
      aria-label={STEP_LABEL[model.step]}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.32, delay: reduce ? 0 : i * 0.045, ease: [0.22, 1, 0.36, 1] }}
    >
      {selected && (reduce ? <span className={s.selectEdge} aria-hidden="true" /> : <motion.span layoutId="console-select" className={s.selectEdge} aria-hidden="true" transition={{ type: "spring", stiffness: 500, damping: 40 }} />)}
      <button type="button" className={s.faceBtn} onClick={() => onOpen()} aria-label={`${spokenFace(state)}, open`} aria-haspopup="dialog">
        {lifted ? <Face state={state} morph={false} place="socket" /> : <Face state={state} morph={!reduce} place="strip" />}
      </button>
      <div className={s.bay}>
        <LedMeter value={model.meter} level={model.level} label={`${STEP_LABEL[model.step]} level`} text={model.meterText} />
        <div className={s.readouts}>
          <Extra model={model} release={release} channels={channels} onOpen={onOpen} />
          {model.readouts.map((r) => (
            <Readout key={r.label} label={r.label} value={r.value} level={r.level} name={`${r.label} ${r.value}, edit`} onPress={() => onOpen(r.field)} />
          ))}
        </div>
      </div>
      <div className={s.foot}>
        <TrackLamps levels={model.tracks} />
        <span className={s.meterText} aria-hidden="true">
          {model.meterText}
        </span>
      </div>
      <Incoming model={model} reduce={reduce} onOpen={onOpen} onAcceptAll={onAcceptAll} />
    </motion.section>
  );
}
