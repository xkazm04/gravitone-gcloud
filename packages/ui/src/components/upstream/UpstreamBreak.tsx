// Blocked because an earlier step broke (floor.css UpstreamBreak; v1 signal/UpstreamBreak).
// The chain is drawn: done steps filled emerald, the broken one a rose triangle, the steps it
// never reached dashed; under it the break's message VERBATIM (`kind · op · message` is the
// work). v1's highest-value signal: four surfaces each re-taught the pipeline in 40-60 words.
//
// Kept from v1: the order comes from the caller's declared chain (a slot's publish steps, a
// project's parts) - never a second copy here - and every node's state is spoken.
// Not kept: v1's `info` severity and its navigation action. The design draws only the error
// form; the act that repairs it belongs to the surface that owns the step (wave 3+).
import { Fragment } from "react";
import { cx } from "../cx.ts";
import { SrOnly } from "../a11y/SrOnly.tsx";
import s from "./UpstreamBreak.module.css";

export type UpstreamBreakProps = {
  /** The chain in order: `scheduled`, `auth`, `upload`, `live`. */
  readonly steps: readonly string[];
  /** Index of the step that broke; the ones before it are done. */
  readonly brokeAt: number;
  /** The failure as the system wrote it. */
  readonly detail: string;
};

type NodeState = "done" | "broke" | "unreached";

export function nodeStates(steps: readonly string[], brokeAt: number): readonly NodeState[] {
  return steps.map((_, i) => (i < brokeAt ? "done" : i === brokeAt ? "broke" : "unreached"));
}

export function UpstreamBreak({ steps, brokeAt, detail }: UpstreamBreakProps) {
  const states = nodeStates(steps, brokeAt);
  return (
    <div className={s.ub}>
      <div className={s.rail} role="list">
        {steps.map((step, i) => (
          // Keyed by place: a chain may name one step twice (two upstream parts of one kind).
          <Fragment key={`${step}:${i}`}>
            {i > 0 && <span className={cx(s.link, i > brokeAt && s.off)} aria-hidden="true" />}
            <span role="listitem" className={cx(s.node, states[i] === "broke" && s.brk, states[i] === "unreached" && s.todo)}>
              <i className={s.mark} aria-hidden="true" />
              {step}
              <SrOnly text={`, ${states[i] ?? "unreached"}`} />
            </span>
          </Fragment>
        ))}
      </div>
      <div className={s.detail}>{detail}</div>
    </div>
  );
}
