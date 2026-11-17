"use client";

// THE LINER NOTES, OPEN (direction "sleeve"): the frame of one release - the sleeve's own light as the ground, the
// sleeve and its masthead on the left, the spine of sides beside it, and the page of the side in hand, which turns like
// a page (direction-aware slide and fade) with the agent's pencilled notes in its margin. The store's refusal is drawn
// in full over the page, never behind a click.
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, type Variants } from "motion/react";
import { useState, type ReactNode, type Ref } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import type { ReleaseProblem } from "@gt/domain/release.problems";

import { pendingIn } from "../../../../../_release/pending.ts";
import { problemsOf, severityOf, STEP_LABEL, STEPS, type StepId } from "../../../../../_release/wizard/steps.ts";
import { ArtWash, hrefOf } from "./Art.tsx";
import { SIDE, type SideProps } from "./liner.ts";
import { Margin } from "./Margin.tsx";
import { Masthead } from "./Masthead.tsx";
import { Errata } from "./Print.tsx";
import { Spine } from "./Spine.tsx";
import { PrintedCard } from "./PrintedCard.tsx";
import { ChannelsSide } from "./sides/ChannelsSide.tsx";
import { DetailsSide } from "./sides/DetailsSide.tsx";
import { ExtrasSide } from "./sides/ExtrasSide.tsx";
import { ReviewSide } from "./sides/ReviewSide.tsx";
import { RightsSide } from "./sides/RightsSide.tsx";
import { SleeveSide } from "./sides/SleeveSide.tsx";
import { TracksSide } from "./sides/TracksSide.tsx";
import f from "./frame.module.css";

const BODY: Readonly<Record<StepId, (p: SideProps) => ReactNode>> = {
  tracks: TracksSide,
  details: DetailsSide,
  rights: RightsSide,
  sleeve: SleeveSide,
  channels: ChannelsSide,
  extras: ExtrasSide,
  review: ReviewSide,
};

const leaf: Variants = {
  enter: (d: number) => ({ x: d * 44, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d * -44, opacity: 0 }),
};

export interface LinerProps {
  readonly side: SideProps;
  readonly step: StepId;
  readonly dir: number;
  /** The body's key: the walk's first id and the step, so a page-made release taking the store's id remounts nothing. */
  readonly leafKey: string;
  readonly heading: Ref<HTMLHeadingElement>;
  readonly onLeave: () => void;
}

/** The side's head: its marker, its name, and its problems as toned counts that open the errata card. */
function PageHead({ step, problems, heading }: { readonly step: StepId; readonly problems: readonly ReleaseProblem[]; readonly heading: Ref<HTMLHeadingElement> }) {
  const [open, setOpen] = useState(false);
  const mine = step === "review" ? [] : problemsOf(problems, step);
  const sev = severityOf(mine);
  const at = STEPS.indexOf(step);
  return (
    <div className={f.pageHead}>
      <span className={f.pageMarker} aria-hidden="true">
        {SIDE[step]}
      </span>
      <h2 id="liner-side-heading" ref={heading} tabIndex={-1} className={f.pageTitle}>
        {STEP_LABEL[step]}
      </h2>
      <span className={f.pageMarks}>
        {sev.block > 0 && <Chip label="block" value={sev.block} tone="rose" onPress={() => setOpen(true)} name={`${sev.block} blocked: the rules`} />}
        {sev.warn > 0 && <Chip label="warn" value={sev.warn} tone="amber" onPress={() => setOpen(true)} name={`${sev.warn} warnings: the rules`} />}
        <span className={f.pageNo} aria-hidden="true">
          {at + 1}/{STEPS.length}
        </span>
      </span>
      <PrintedCard open={open} onClose={() => setOpen(false)} title={`${STEP_LABEL[step]} · errata`} mark={`${SIDE[step]} · ${mine.length} ${mine.length === 1 ? "rule" : "rules"}`}>
        <Errata problems={mine} label={`${STEP_LABEL[step]} problems`} />
      </PrintedCard>
    </div>
  );
}

export function Liner({ side, step, dir, leafKey, heading, onLeave }: LinerProps) {
  const reduce = useReducedMotion() === true;
  const { release: r, session, problems, go } = side;
  const at = STEPS.indexOf(step);
  const prev = STEPS[at - 1];
  const next = STEPS[at + 1];
  const Body = BODY[step];
  return (
    <div className={f.root}>
      <ArtWash href={hrefOf(r)} />
      <LayoutGroup id="liner">
        <div className={f.frame}>
          <motion.div className={f.left} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            <Masthead release={r} saving={session.saving} sleeveOut={step === "sleeve"} onLeave={onLeave} />
          </motion.div>
          <Spine problems={problems} pending={session.pending} current={step} onGo={(x) => go(x)} />
          <section className={f.page} aria-labelledby="liner-side-heading">
            <PageHead step={step} problems={problems} heading={heading} />
            {session.notice !== null && (
              <div className={f.notice}>
                <ErrorLine message={session.notice} live />
              </div>
            )}
            <p className={f.sr} aria-live="polite">{`Side ${SIDE[step]}, ${STEP_LABEL[step]}, ${at + 1} of ${STEPS.length}`}</p>
            <div className={f.stage}>
              <AnimatePresence initial={false} custom={dir}>
                <motion.div
                  key={leafKey}
                  className={f.leaf}
                  custom={dir}
                  variants={leaf}
                  initial={reduce ? false : "enter"}
                  animate="center"
                  exit={reduce ? { opacity: 0, transition: { duration: 0 } } : "exit"}
                  transition={{ duration: reduce ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className={f.body}>
                    <Body {...side} />
                  </div>
                  <Margin notes={pendingIn(session.pending, step)} session={session} side={`${SIDE[step]} ${STEP_LABEL[step]}`} />
                </motion.div>
              </AnimatePresence>
            </div>
            <footer className={f.foot}>
              {prev !== undefined ? <Button label={`Back · ${SIDE[prev]} ${STEP_LABEL[prev]}`} onPress={() => go(prev)} /> : <span />}
              {next !== undefined && <Button label={`Next · ${SIDE[next]} ${STEP_LABEL[next]}`} tone="cyan" glyphAfter="chevR" onPress={() => go(next)} />}
            </footer>
          </section>
        </div>
      </LayoutGroup>
    </div>
  );
}
