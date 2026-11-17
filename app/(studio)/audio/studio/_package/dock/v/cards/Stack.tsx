"use client";

// THE DECISION STACK (prototype dock-package, "cards"): every step in order, in one list. The step in focus is the
// decision card; the steps before it are folded rows above, the steps after it thin edges below. Each step keeps ONE
// list item for its whole life and the item's material (the shell) springs between a row, a card and an edge, so
// Next folds the card up into the finished stack while the next edge rises and opens into the card - the same item,
// growing (`layout` on the shell, `layout="position"` on the item). What sits on the shell fades in once it lands.
// Reduced motion: no layout animation, no fade, the stack simply re-draws.
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode, Ref } from "react";

import type { Release } from "@gt/domain/release";
import type { ReleaseProblem } from "@gt/domain/release.problems";

import { pendingIn } from "../../../../../_release/pending.ts";
import { problemsOf, STEPS, type StepId, type StepProps } from "../../../../../_release/wizard/steps.ts";
import { DecisionCard } from "./Card.tsx";
import { FoldedRow, WaitingEdge } from "./Folded.tsx";
import type { StepMark } from "./model.ts";
import { ARRIVE, FOLD, INSTANT } from "./motion.ts";
import s from "./stack.module.css";
import { BODY } from "./steps/bodies.ts";

export interface StackProps {
  readonly release: Release;
  readonly problems: readonly ReleaseProblem[];
  readonly marks: readonly StepMark[];
  readonly step: StepId;
  /** +1 when the walk moved forward, -1 back: the side the card's content arrives from. */
  readonly dir: 1 | -1;
  readonly heading: Ref<HTMLHeadingElement>;
  readonly props: StepProps;
}

type Kind = "folded" | "card" | "edge";

export function Stack({ release, problems, marks, step, dir, heading, props }: StackProps) {
  const reduce = useReducedMotion() === true;
  const at = STEPS.indexOf(step);
  const tracks = release.tracks.map((t) => t.title);
  return (
    <LayoutGroup id="cards-stack">
      <ol className={s.stack} aria-label="steps">
        {STEPS.map((x, i) => {
          const kind: Kind = i < at ? "folded" : i === at ? "card" : "edge";
          const m = marks[i];
          if (m === undefined) return null;
          const depth = { "--depth": Math.min(Math.max(i - at, 0), 4) } as CSSProperties;
          let face: ReactNode;
          if (kind === "folded") face = <FoldedRow m={m} n={i + 1} release={release} onOpen={() => props.go(x)} />;
          else if (kind === "edge") face = <WaitingEdge m={m} n={i + 1} onOpen={() => props.go(x)} />;
          else {
            const Body = BODY[x];
            face = (
              <DecisionCard step={x} heading={heading} problems={problemsOf(problems, x)} pending={pendingIn(props.session.pending, x)} session={props.session} tracks={tracks} go={props.go}>
                <Body {...props} />
              </DecisionCard>
            );
          }
          return (
            <motion.li key={x} className={s.slot} data-kind={kind} data-mark={m.mark} style={depth} layout={reduce ? false : "position"} transition={reduce ? INSTANT : FOLD}>
              <motion.div className={s.shell} aria-hidden="true" layout={!reduce} transition={reduce ? INSTANT : FOLD} />
              <motion.div
                key={kind}
                className={s.face}
                initial={reduce ? false : kind === "card" ? { opacity: 0, y: dir * 18 } : { opacity: 0 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduce ? INSTANT : kind === "card" ? ARRIVE : { duration: 0.2, delay: 0.08 }}
              >
                {face}
              </motion.div>
            </motion.li>
          );
        })}
      </ol>
    </LayoutGroup>
  );
}
