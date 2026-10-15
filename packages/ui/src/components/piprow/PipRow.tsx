// Discrete state, drawn: one pip per slot (tokens.css `.piprow`, GT.PipRow(states, label)).
//
// The prototype's pips were five of its state words; here a pip takes a Look from the one
// status table, so a project's parts draw `PipRow looks={parts.map(p => lookOf("part", p))}`
// and no surface keeps a sixth copy of the mapping (projects.js mapped queued, paused and
// failed by hand before drawing). Shapes differ as well as hues: filled, ringed, pulsing,
// triangle, dashed - never colour alone.
//
// Every pip is aria-hidden and the row is one image with one name. The name is REQUIRED:
// v1 generated "n of m done" when a caller gave none, which was honest and toneless; the
// caller knows the verb ("2 of 6 parts shipped").
import { cx } from "../cx.ts";
import type { Look } from "../status/status.ts";
import s from "./PipRow.module.css";

/** Looks a pip draws distinctly; the rest draw as a pending (dashed) slot. */
const PIP: { readonly [L in Look]: "done" | "awaiting" | "running" | "failed" | "idle" } = {
  done: "done",
  awaiting: "awaiting",
  running: "running",
  failed: "failed",
  idle: "idle",
  paused: "idle",
  reference: "idle",
  candidate: "idle",
};

export type PipRowProps = {
  readonly looks: readonly Look[];
  /** Capacity: slots past `looks.length` draw as bare pips. */
  readonly max?: number;
  readonly label: string;
};

export function pipClasses({ looks, max }: Pick<PipRowProps, "looks" | "max">): readonly ("bare" | (typeof PIP)[Look])[] {
  const spare = Math.max(0, (max ?? 0) - looks.length);
  return [...looks.map((l) => PIP[l]), ...Array.from({ length: spare }, () => "bare" as const)];
}

export function PipRow({ looks, max, label }: PipRowProps) {
  return (
    <span className={s.row} role="img" aria-label={label}>
      {pipClasses(max === undefined ? { looks } : { looks, max }).map((c, i) => (
        <i key={i} className={cx(s.pip, c !== "bare" && s[c])} aria-hidden="true" />
      ))}
    </span>
  );
}
