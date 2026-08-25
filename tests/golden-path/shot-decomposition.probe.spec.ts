// SHOT DECOMPOSITION — dynamic probes over the ACTUAL derivation and review.
//
// Three things are pinned here, and the third is the one that matters:
//
//   1. An explainer render derives ZERO shots. The 1:1 beat→frame assumption is
//      untouched for every format that already worked.
//   2. A trailer beat chain decomposes the way the doctrine says: the reset is
//      one held shot, the peak is many short ones, the setup is few and slow —
//      and every hold is the beat's own span divided, never a constant.
//   3. THE REVIEW CAN FAIL, AND CANNOT PASS VACUOUSLY. `gate-vacuous-pass`
//      already established this repo's rule — a check that examined nothing may
//      not count as enforcement — and a review nobody has watched fail is a
//      review nobody has.
//
// These import the real modules. Nothing here re-implements a rule it checks.
import { test, expect } from "@playwright/test";

import { reviewShotList } from "@/app/_phases/frames/shotReview";
import {
  isTrailerFormat,
  shotCountFor,
  shotsFromBeats,
  shotsFromRender,
  type Shot,
  type ShotSourceBeat,
  type TrailerRole,
} from "@/app/_phases/frames/shots";
import { framesFromRender } from "@/app/_phases/frames/frames";
import { RENDERS } from "@/app/_phases/script/renders";

const beat = (at: string, role: TrailerRole | undefined, label: string): ShotSourceBeat => ({
  at,
  kind: role ?? "unknown-kind",
  label,
  text: `${label} — probe copy.`,
  role,
});

/** A 40 s teaser shaped like the atlas's own worked sequences (§ Sequences A/B/C). */
const TEASER: ShotSourceBeat[] = [
  beat("0:00", "setup", "cold open · one light in the void"),
  beat("0:16", "rung", "escalation 1 · the threat has a direction"),
  beat("0:24", "rung", "escalation 2 · and it is closer"),
  beat("0:30", "reset", "the quiet wide where sound stops"),
  beat("0:34", "peak", "climax montage"),
  beat("0:40", "tail", "title"),
];
const TEASER_TOTAL_S = 45;

const of = (shots: Shot[], role: TrailerRole) => shots.filter((s) => s.role === role);

/* ── 1. the existing format is untouched ─────────────────────────────────── */

test("an explainer render derives zero shots, and its frame list is unchanged", () => {
  for (const r of RENDERS) {
    expect(isTrailerFormat(r.template), `${r.id} must not read as a trailer`).toBe(false);
    expect(shotsFromRender(r), `${r.id} must decompose into no shots at all`).toHaveLength(0);
    // The load-bearing half: the frame list is still exactly one frame per beat.
    expect(framesFromRender(r)).toHaveLength(r.beats.length);
  }
  console.log(`[shots] ${RENDERS.length} explainer render(s): 0 shots, frames still 1:1`);
});

/* ── 2. the decomposition follows the doctrine ───────────────────────────── */

test("a trailer beat decomposes 1..n: reset holds one, peak is many, setup is few", () => {
  const shots = shotsFromBeats(TEASER, TEASER_TOTAL_S);

  // [R] dynamic-reset — "Fill the silence with one thing."
  expect(of(shots, "reset")).toHaveLength(1);
  // [A] beats 11–13 — the title is one held card.
  expect(of(shots, "tail")).toHaveLength(1);
  // [R] escalation-without-mechanism — a rung states, then lands.
  expect(of(shots, "rung")).toHaveLength(4); // two rungs × two shots
  // [A] — climax plates 0.5–1.5 s, so a 6 s peak beat carries more than one.
  expect(of(shots, "peak").length).toBeGreaterThan(1);
  // The whole point of the layer: more shots than beats.
  expect(shots.length).toBeGreaterThan(TEASER.length);

  console.log(
    `[shots] ${TEASER.length} beats -> ${shots.length} shots ` +
      `(setup ${of(shots, "setup").length}, rung ${of(shots, "rung").length}, reset ${
        of(shots, "reset").length
      }, peak ${of(shots, "peak").length}, tail ${of(shots, "tail").length})`,
  );
});

test("every hold is the beat's own span divided — no constant is added to it", () => {
  const shots = shotsFromBeats(TEASER, TEASER_TOTAL_S);
  // The reset beat runs 0:30 → 0:34. One shot, so it holds the whole 4 s.
  const reset = of(shots, "reset")[0];
  expect(reset.holdS).toBe(4);
  // The peak beat runs 0:34 → 0:40. Its shots must sum back to 6 s.
  const peak = of(shots, "peak");
  const sum = Math.round(peak.reduce((a, s) => a + s.holdS, 0) * 10) / 10;
  expect(sum).toBe(6);
  console.log(`[shots] reset hold ${reset.holdS}s · peak ${peak.length} shots summing to ${sum}s`);
});

test("motion is never seeded — the one field this layer refuses to invent", () => {
  const shots = shotsFromBeats(TEASER, TEASER_TOTAL_S);
  expect(shots.every((s) => s.motion === "")).toBe(true);
  // And the same refusal is why `angle` stays null: an undeclared angle is what
  // turns a size-jump violation into an honest `unmeasured`.
  expect(shots.every((s) => s.angle === null)).toBe(true);
});

test("a beat with no role and no hint is decomposed into one shot, never guessed", () => {
  const shots = shotsFromBeats([beat("0:00", undefined, "who knows"), beat("0:20", undefined, "nor this")], 40);
  expect(shots).toHaveLength(2);
  expect(shots.every((s) => s.roleDeclared)).toBe(false);
  expect(shots.every((s) => s.size === null)).toBe(true);
  expect(shotCountFor(null, 300)).toBe(1);
});

/* ── 3. the review is honest ─────────────────────────────────────────────── */

test("the review reports pass ONLY where it examined something", () => {
  const report = reviewShotList(shotsFromBeats(TEASER, TEASER_TOTAL_S));
  const vacuous = report.checks.filter((c) => c.verdict === "pass" && c.examined === 0);
  console.log(
    `[shots] ${report.checks.length} checks, ${report.engaged} engaged, ` +
      report.checks.map((c) => `${c.rule}=${c.verdict}/${c.examined}`).join(" "),
  );
  expect(vacuous, "a pass over zero sites is a manufactured pass").toHaveLength(0);
  // And the honesty rule is ENFORCED, not merely observed: an empty list must
  // produce no passes at all, because there is nothing anywhere to examine.
  const empty = reviewShotList([]);
  expect(empty.checks.filter((c) => c.verdict === "pass")).toHaveLength(0);
  expect(empty.engaged).toBe(0);
});

test("the review CAN fail — a peak with no reset in front of it is caught", () => {
  // The registry's first diagnostic for a cut that "builds and builds and
  // doesn't land": the reset is removed and nothing else changes.
  const noReset = TEASER.filter((b) => b.role !== "reset");
  const report = reviewShotList(shotsFromBeats(noReset, TEASER_TOTAL_S));
  const c = report.checks.find((x) => x.rule === "peak-is-preceded-by-a-reset");
  expect(c?.verdict, "removing the reset must be a violation, not a shrug").toBe("violation");
  expect(c?.examined).toBeGreaterThan(0);
  console.log(`[shots] no-reset cut -> ${c?.rule}=${c?.verdict}: ${c?.detail}`);
});

test("the review CAN fail — a reset that holds two things is caught", () => {
  // Hand-authored rather than derived: the derivation cannot produce this, and
  // a check that only ever sees its own derivation's output is not a check.
  const shots = shotsFromBeats(TEASER, TEASER_TOTAL_S);
  const reset = of(shots, "reset")[0];
  const doubled = [...shots, { ...reset, id: `${reset.id}-b`, ordinal: 2, ofBeat: 2 }];
  const c = reviewShotList(doubled).checks.find((x) => x.rule === "reset-holds-one-thing");
  expect(c?.verdict).toBe("violation");
  expect(c?.shots.length).toBeGreaterThan(0);
});

test("an undeclared angle makes a tight size jump `unmeasured`, never `pass`", () => {
  const base = shotsFromBeats(TEASER, TEASER_TOTAL_S);
  // MS and MCU are one step apart. With no angle on either, the disjunction in
  // [A] § Staging 4 is unresolvable and the honest verdict is `unmeasured`.
  const tight: Shot[] = [
    { ...base[0], id: "x1", size: "MS", angle: null },
    { ...base[0], id: "x2", size: "MCU", angle: null },
  ];
  const c = reviewShotList(tight).checks.find((x) => x.rule === "size-jump-or-angle-change");
  expect(c?.verdict).toBe("unmeasured");
  expect(c?.examined).toBe(1);

  // Declare opposing angles and the same pair is rescued, exactly as the source
  // says it should be.
  const rescued = reviewShotList([
    { ...tight[0], angle: "LA" },
    { ...tight[1], angle: "HA" },
  ]).checks.find((x) => x.rule === "size-jump-or-angle-change");
  expect(rescued?.verdict).toBe("pass");

  // Same angle on both: nothing rescues it, and it is a violation.
  const bad = reviewShotList([
    { ...tight[0], angle: "eye" },
    { ...tight[1], angle: "eye" },
  ]).checks.find((x) => x.rule === "size-jump-or-angle-change");
  expect(bad?.verdict).toBe("violation");
});

test("the hold bands do not fire outside the population they were measured on", () => {
  // [A]'s hold bands were sheeted from full-length trailers, and [A]'s OWN 40 s
  // worked teasers hold 3-5 s throughout — a 4 s cold open against a band that
  // says 6-13 s. Applying the band to a teaser is not a stricter check, it is a
  // wrong one, so it must report that it did not engage.
  const teaser = reviewShotList(shotsFromBeats(TEASER, TEASER_TOTAL_S)).checks.find(
    (c) => c.rule === "hold-sits-in-its-paces-band",
  );
  expect(teaser?.verdict).toBe("not-engaged");
  expect(teaser?.examined).toBe(0);
  console.log(`[shots] teaser band check -> ${teaser?.verdict}: ${teaser?.detail}`);

  // Stretched to a theatrical length, the same chain is in the population and
  // the check does engage — so the gate is a scope, not an off switch.
  const long: ShotSourceBeat[] = [
    beat("0:00", "setup", "cold open"),
    beat("0:24", "rung", "escalation 1"),
    beat("0:48", "rung", "escalation 2"),
    beat("1:12", "reset", "the quiet wide"),
    beat("1:22", "peak", "climax montage"),
    beat("2:00", "tail", "title"),
  ];
  const c = reviewShotList(shotsFromBeats(long, 128)).checks.find(
    (x) => x.rule === "hold-sits-in-its-paces-band",
  );
  expect(c?.examined).toBeGreaterThan(0);
  expect(c?.verdict === "pass" || c?.verdict === "violation").toBe(true);
  console.log(`[shots] theatrical band check -> ${c?.verdict}/${c?.examined}: ${c?.detail}`);
});

test("the named gaps are on the report, not left to the reader's imagination", () => {
  const report = reviewShotList(shotsFromBeats(TEASER, TEASER_TOTAL_S));
  expect(report.notChecked.length).toBeGreaterThan(4);
  // The ceiling the registry states, carried onto the surface verbatim enough
  // that a reader meets it.
  expect(report.notChecked.some((n) => /cannot|works/i.test(n))).toBe(true);
  // The raised variable is a beat-layer field; this layer must SAY it cannot
  // see it rather than let a green structural report imply the cut escalates.
  expect(report.notChecked.some((n) => /raised variable/i.test(n))).toBe(true);
});
