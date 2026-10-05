// THE FINISH LINE — what stands between this cut and a render, as rows.
//
// Shaped after StatReel's render gate (apps/studio/src/studio/RenderGatePage.tsx):
// one row per check, each with the VALUE measured, the TARGET it is held to,
// and a verdict. Three verdicts, not two: a check with nothing to measure is
// `unmeasured`, never a pass — a cut with no picture has not "passed" its
// plate check, it has not been asked it.
//
// Pure, so the probe can hold it to its arithmetic; the surface only draws it.

import type { CutClip, DerivedCut, OwnerStep } from "./deriveTimeline";
import { offsetFrom, type Offsets } from "./offsets";

export type Verdict = "pass" | "fail" | "unmeasured";

export interface FinishCheck {
  id: "picture" | "voice" | "coverage" | "takes" | "drift" | "runtime" | "unplaced";
  label: string;
  value: string;
  target: string;
  verdict: Verdict;
  /** The step that clears it. */
  owner?: OwnerStep;
  /** What is in the way, when it fails — the work, in a few words. */
  deny?: string;
}


/** RUNTIME TOLERANCE. A cut within 5% of its target (and never tighter than a
 *  second) counts as on target. This is a stated choice, not a measurement:
 *  no platform spec in this repo fixes one, and a zero tolerance would fail
 *  every cut whose last beat closed on durationOf's 1s floor. */
export const RUNTIME_TOLERANCE = 0.05;

/** Seconds of [0, totalS] covered by at least one of the spans — a union, so
 *  two cues over the same seconds are not counted twice. */
export function coveredS(spans: { startS: number; durS: number }[], totalS: number): number {
  const xs = spans
    .map((s) => [Math.max(0, s.startS), Math.min(totalS, s.startS + s.durS)] as const)
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let sum = 0;
  let end = -Infinity;
  let start = 0;
  for (const [a, b] of xs) {
    if (a > end) {
      if (end > -Infinity) sum += end - start;
      start = a;
      end = b;
    } else end = Math.max(end, b);
  }
  if (end > -Infinity) sum += end - start;
  return sum;
}

/** A drifting clip that the bench has brought back to zero is on its mark. */
export function isDrifting(c: CutClip, offsets: Offsets): boolean {
  return c.status === "drift" && offsetFrom(offsets, c) !== 0;
}

const s1 = (n: number) => `${Math.round(n * 10) / 10}s`;
const n_ = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function finishLine(cut: DerivedCut, offsets: Offsets = {}): FinishCheck[] {
  const lane = (t: CutClip["track"]) => cut.clips.filter((c) => c.track === t);
  const pic = lane("video");
  const vo = lane("vo");
  const mus = lane("music");
  const rows: FinishCheck[] = [];

  const picOk = pic.filter((c) => c.status !== "missing").length;
  rows.push({
    id: "picture",
    label: "picture",
    value: `${picOk}/${pic.length}`,
    target: `${pic.length}/${pic.length}`,
    verdict: pic.length === 0 ? "unmeasured" : picOk === pic.length ? "pass" : "fail",
    owner: "frames",
    ...(pic.length && picOk < pic.length ? { deny: `${n_(pic.length - picOk, "shot", "shots")} without a plate` } : {}),
  });

  const voOk = vo.filter((c) => c.status !== "missing").length;
  rows.push({
    id: "voice",
    label: "voice",
    value: `${voOk}/${vo.length}`,
    target: `${vo.length}/${vo.length}`,
    verdict: vo.length === 0 ? "unmeasured" : voOk === vo.length ? "pass" : "fail",
    owner: "script",
    ...(vo.length && voOk < vo.length ? { deny: `${n_(vo.length - voOk, "line", "lines")} not recorded` } : {}),
  });

  const covered = coveredS(mus, cut.totalS);
  rows.push({
    id: "coverage",
    label: "music coverage",
    value: cut.totalS > 0 ? s1(covered) : "—",
    target: cut.totalS > 0 ? s1(cut.totalS) : "—",
    verdict: cut.totalS <= 0 ? "unmeasured" : covered >= cut.totalS - 0.05 ? "pass" : "fail",
    owner: "score",
    ...(cut.totalS > 0 && covered < cut.totalS - 0.05 ? { deny: `${s1(cut.totalS - covered)} unscored` } : {}),
  });

  const takes = mus.filter((c) => c.status === "ok").length;
  rows.push({
    id: "takes",
    label: "takes in hand",
    value: `${takes}/${mus.length}`,
    target: `${mus.length}/${mus.length}`,
    verdict: mus.length === 0 ? "unmeasured" : takes === mus.length ? "pass" : "fail",
    owner: "score",
    ...(mus.length && takes < mus.length ? { deny: `${n_(mus.length - takes, "cue", "cues")} without a take` } : {}),
  });

  const drifting = cut.clips.filter((c) => isDrifting(c, offsets)).length;
  rows.push({
    id: "drift",
    label: "drift",
    value: String(drifting),
    target: "0",
    verdict: cut.clips.length === 0 ? "unmeasured" : drifting === 0 ? "pass" : "fail",
    ...(drifting ? { deny: `${drifting} off the mark` } : {}),
  });

  const tol = cut.targetS ? Math.max(1, cut.targetS * RUNTIME_TOLERANCE) : 0;
  const off = cut.targetS ? cut.totalS - cut.targetS : 0;
  rows.push({
    id: "runtime",
    label: "runtime",
    value: cut.totalS > 0 ? s1(cut.totalS) : "—",
    target: cut.targetS ? `${cut.targetS}s ± ${s1(tol)}` : "—",
    verdict: !cut.targetS || cut.totalS <= 0 ? "unmeasured" : Math.abs(off) <= tol ? "pass" : "fail",
    owner: "frames",
    ...(cut.targetS && cut.totalS > 0 && Math.abs(off) > tol
      ? { deny: `${off > 0 ? "+" : "−"}${s1(Math.abs(off))} vs target` }
      : {}),
  });

  rows.push({
    id: "unplaced",
    label: "unplaced",
    value: String(cut.unplaced.length),
    target: "0",
    verdict: cut.origin === "empty" ? "unmeasured" : cut.unplaced.length === 0 ? "pass" : "fail",
    ...(cut.unplaced.length ? { deny: cut.unplaced.map((u) => u.label).join(" · ") } : {}),
  });

  return rows;
}
