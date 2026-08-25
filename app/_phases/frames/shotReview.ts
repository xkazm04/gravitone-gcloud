"use client";

// The shot-list review — what a derived cut can be checked for, and what it
// cannot.
//
// Shaped like `sceneSpec.ts:reviewSceneSpecs`, deliberately and for the same
// reason: findings are COLLECTED, never thrown. A shot list is minutes of a
// human's structural thinking, and one malformed rung must not take the other
// fifteen down with it.
//
// ─── THE ONE HONESTY RULE, INHERITED ────────────────────────────────────────
//
// `gate.ts` states it at the top of the script step and this file is held to
// exactly the same standard:
//
//   **A check may never report `pass` for something it did not check.**
//
// So every `ShotCheck` carries `examined` — how many sites it actually looked
// at — and `finalise()` mechanically downgrades any `pass` with `examined === 0`
// to `not-engaged`. That is enforcement rather than a promise: a future check
// written carelessly cannot manufacture a pass here even if its author forgot
// the rule. `tests/golden-path/shot-decomposition.probe.spec.ts` drives that
// downgrade directly, because a rule nobody proved can fail is a rule nobody
// has.
//
// `not-engaged` (the population was empty) and `unmeasured` (the population
// existed and the instrument could not read it) are kept apart, because they
// call for opposite responses: the first is fine, the second is a gap.
//
// ─── WHAT IS DELIBERATELY NOT CHECKED ───────────────────────────────────────
//
// `sceneSpec.ts:129-133` already refused a verb whitelist and a duration
// validator over impressions — "Nothing has measured those, and a validator
// built on an impression rejects good direction with total confidence." That
// refusal is inherited verbatim and extended: this file does not grade a
// motion, does not rank a size choice, and does not score a cut. Everything it
// declines to look at is NAMED in `report.notChecked`, so the gap is visible on
// the surface rather than implied by the silence of a green report.
//
// The ceiling is the registry's own, and it is the last line of the review:
// **a structural checker can establish that a cut is malformed; it cannot
// establish that a cut works.** The instrument practitioners actually use for
// the second question is an audience survey, and this file is not one.

import {
  PACE_BAND,
  TAIL_BAND,
  sizeSteps,
  type Shot,
  type TrailerRole,
} from "./shots";

/* ── The report ───────────────────────────────────────────────────────────── */

/** The same four verdicts `gate.ts` uses. One vocabulary per repo, not two. */
export type ShotVerdict = "pass" | "violation" | "not-engaged" | "unmeasured";

export interface ShotCheck {
  rule: string;
  verdict: ShotVerdict;
  /** What the rule tests, in the reviewer's own words. Shown on the row. */
  tests: string;
  /** How many sites this run actually examined. `0` can never be a `pass`. */
  examined: number;
  /** The shots the finding is about, by id. Empty on a pass. */
  shots: string[];
  detail: string;
}

export interface ShotListReport {
  shots: number;
  beats: number;
  checks: ShotCheck[];
  /** Named gaps. Not a disclaimer — the list a reader needs to size the green by. */
  notChecked: readonly string[];
  /** How many of the executed checks looked at anything at all. The honest denominator. */
  engaged: number;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const byRole = (shots: readonly Shot[], role: TrailerRole) => shots.filter((s) => s.role === role);

/** Consecutive pairs in cut order. The population every adjacency rule runs over. */
const pairs = (shots: readonly Shot[]) =>
  shots.slice(0, -1).map((a, i) => [a, shots[i + 1]] as const);

const mean = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);

/**
 * The shortest cut the hold bands may be applied to.
 *
 * [R] trailer-structure § "Length is a ladder": the theatrical cut carries a
 * 2:30 ceiling and "the measured centre of gravity across nine decades of
 * releases sits just above two minutes". Two minutes is that centre, and the
 * population [A]'s hold bands were sheeted from. Below it the family is on a
 * different rung of the ladder and the bands do not describe it.
 */
const BAND_POPULATION_MIN_S = 120;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The enforcement of the honesty rule, applied to every check on its way out.
 *
 * A check that examined nothing is `not-engaged` no matter what verdict its
 * author reached, and the detail says so rather than being quietly rewritten —
 * a downgraded pass should be legible as one.
 */
function finalise(c: ShotCheck): ShotCheck {
  if (c.examined === 0 && (c.verdict === "pass" || c.verdict === "violation")) {
    return {
      ...c,
      verdict: "not-engaged",
      detail: `${c.detail} · examined nothing, so this is not a verdict about the cut`,
    };
  }
  return c;
}

/* ── The checks ───────────────────────────────────────────────────────────── */

/**
 * Review a derived or authored shot list.
 *
 * Takes shots alone. It does NOT take the beats, and that is a property rather
 * than an omission: a review that re-derived the list it is reviewing would be
 * comparing the derivation to itself, which is the shape of every gate that
 * passes while checking nothing.
 */
export function reviewShotList(shots: readonly Shot[]): ShotListReport {
  const checks: ShotCheck[] = [];
  const beats = new Set(shots.map((s) => s.beatAt)).size;

  /* 1 — the reset holds one thing.
     [R] dynamic-reset: "Fill the silence with one thing. A line, an image, a
     breath. A reset that holds two ideas has spent its whole value carrying
     neither." */
  {
    const resets = byRole(shots, "reset");
    const beatsWithResets = new Map<string, Shot[]>();
    for (const s of resets) beatsWithResets.set(s.beatAt, [...(beatsWithResets.get(s.beatAt) ?? []), s]);
    const overloaded = [...beatsWithResets.values()].filter((g) => g.length > 1);
    checks.push(
      finalise({
        rule: "reset-holds-one-thing",
        tests: "a reset beat decomposes into exactly one shot",
        examined: beatsWithResets.size,
        verdict: overloaded.length ? "violation" : "pass",
        shots: overloaded.flat().map((s) => s.id),
        detail: overloaded.length
          ? `${overloaded.length} reset beat(s) carry more than one shot`
          : `${beatsWithResets.size} reset beat(s), each one shot`,
      }),
    );
  }

  /* 2 — one reset before the peak, not three.
     [R] dynamic-reset: "Count the other resets in the cut. More than one before
     the peak and the device has stopped resetting anything." */
  {
    const firstPeak = shots.findIndex((s) => s.role === "peak");
    const before = firstPeak === -1 ? [] : shots.slice(0, firstPeak).filter((s) => s.role === "reset");
    const beatsBefore = new Set(before.map((s) => s.beatAt));
    checks.push(
      finalise({
        rule: "one-reset-before-the-peak",
        tests: "at most one reset sits between the escalation and the peak",
        // The population is "cuts that have a peak" — a cut with none has
        // nothing to count resets against, and says so instead of passing.
        examined: firstPeak === -1 ? 0 : 1,
        verdict: beatsBefore.size > 1 ? "violation" : "pass",
        shots: beatsBefore.size > 1 ? before.map((s) => s.id) : [],
        detail:
          firstPeak === -1
            ? "no peak in this cut"
            : `${beatsBefore.size} reset(s) before the peak`,
      }),
    );
  }

  /* 3 — a peak needs a reset in front of it.
     [R] dynamic-reset: "When the cut has no reset, it has no climax — regardless
     of how large the ending is. This is the first thing to check on a cut that
     'builds and builds and doesn't land'." */
  {
    const firstPeak = shots.findIndex((s) => s.role === "peak");
    const hasReset = firstPeak !== -1 && shots.slice(0, firstPeak).some((s) => s.role === "reset");
    checks.push(
      finalise({
        rule: "peak-is-preceded-by-a-reset",
        tests: "the cut falls to a reset before its largest moment",
        examined: firstPeak === -1 ? 0 : 1,
        verdict: firstPeak === -1 ? "not-engaged" : hasReset ? "pass" : "violation",
        shots: firstPeak === -1 || hasReset ? [] : [shots[firstPeak].id],
        detail:
          firstPeak === -1
            ? "no peak in this cut"
            : hasReset
              ? "a reset precedes the peak"
              : "the escalation runs straight into the peak — the viewer cannot tell the peak happened",
      }),
    );
  }

  /* 4 — the reset spike.
     [R] trailer-structure § "What is measurable": shot length falls across the
     acts, and the reset produces "a spike in shot length immediately before the
     peak, in an otherwise monotonically falling curve" — the form's single most
     detectable structural signature. */
  {
    const resets = byRole(shots, "reset");
    const peaks = byRole(shots, "peak");
    const engaged = resets.length > 0 && peaks.length > 0;
    const resetMean = round1(mean(resets.map((s) => s.holdS)));
    const peakMean = round1(mean(peaks.map((s) => s.holdS)));
    checks.push(
      finalise({
        rule: "reset-spikes-above-the-peak",
        tests: "the reset holds longer than the peak's shots — the falling curve's one spike",
        examined: engaged ? resets.length + peaks.length : 0,
        verdict: !engaged ? "not-engaged" : resetMean > peakMean ? "pass" : "violation",
        shots: engaged && resetMean <= peakMean ? resets.map((s) => s.id) : [],
        detail: engaged
          ? `reset holds ${resetMean}s vs peak mean ${peakMean}s`
          : "this cut has no reset/peak pair to compare",
      }),
    );
  }

  /* 5 — the size ladder.
     [A] § Staging 4: "Consecutive stills should change size by at least two
     steps (EWS→MS, MS→ECU) or change angle ≥30°, otherwise the cut reads as a
     jump."

     THE DISJUNCTION IS THE POINT. An adjacent pair whose sizes are <2 steps
     apart is only a violation if the angles do NOT rescue it — and `angle` is
     never seeded, so in a derived list the answer is unknown rather than bad.
     That population goes to `unmeasured`, which is why `Shot.angle` exists at
     all. */
  {
    const all = pairs(shots);
    const typed = all.filter(([a, b]) => a.size && b.size);
    const tooClose = typed.filter(([a, b]) => sizeSteps(a.size!, b.size!) < 2);
    const rescued = tooClose.filter(([a, b]) => a.angle && b.angle && a.angle !== b.angle);
    const unknown = tooClose.filter(([a, b]) => !a.angle || !b.angle);
    const bad = tooClose.filter(([a, b]) => a.angle && b.angle && a.angle === b.angle);
    checks.push(
      finalise({
        rule: "size-jump-or-angle-change",
        tests: "consecutive shots differ by ≥2 size steps, or by a declared angle change",
        examined: typed.length,
        verdict: bad.length ? "violation" : unknown.length ? "unmeasured" : "pass",
        shots: (bad.length ? bad : unknown).map(([, b]) => b.id),
        detail:
          `${typed.length} of ${all.length} adjacent pair(s) had both sizes declared` +
          (tooClose.length
            ? ` · ${tooClose.length} under two steps (${bad.length} with matching angles, ${unknown.length} with no angle declared, ${rescued.length} rescued by one)`
            : " · all cleared two steps") +
          // The derivation aims at this rule, so a pass here is a statement
          // about the chooser and not about anyone's direction.
          (shots.every((s) => s.seeded)
            ? " · every shot is seeded, and the derivation picks sizes to satisfy this rule — a pass confirms the chooser, not the direction"
            : ""),
      }),
    );
  }

  /* 6 — screen direction.
     [A] § Staging 3 (Katz's line of action): fix the direction once per
     sequence; "the only legal reversal is a neutral shot (frontal approach
     toward camera, top-down, or a card) between them". */
  {
    const flips = pairs(shots).filter(
      ([a, b]) =>
        (a.direction === "screen-left" && b.direction === "screen-right") ||
        (a.direction === "screen-right" && b.direction === "screen-left"),
    );
    const directional = shots.filter((s) => s.direction === "screen-left" || s.direction === "screen-right");
    checks.push(
      finalise({
        rule: "no-reversal-without-a-neutral",
        tests: "screen direction never flips without a neutral shot between",
        examined: Math.max(0, directional.length - 1),
        verdict: flips.length ? "violation" : "pass",
        shots: flips.map(([, b]) => b.id),
        detail:
          `${flips.length} unmediated flip(s) over ${directional.length} directional shot(s)` +
          // Stated because it is true and because a check that structurally
          // cannot fire is worth less than its green suggests.
          (shots.every((s) => s.seeded)
            ? " · a seeded list holds one sequence direction throughout, so this cannot fire on derived data"
            : ""),
      }),
    );
  }

  /* 7 — placement against the hold.
     [A] § Staging 1: Miller's crosshair doctrine serves cuts ≤2 s ("Put the
     cross hairs on her nose!", Fury Road at 2.67 s ASL); holds ≥3 s "may use
     thirds and negative space", and [A]'s own counter-evidence warns that
     applying the crosshair to a held shot flattens it. Between 2 and 3 seconds
     the document says nothing, and neither does this check. */
  {
    const fast = shots.filter((s) => s.holdS <= 2);
    const slow = shots.filter((s) => s.holdS >= 3);
    const wrongFast = fast.filter((s) => s.placement !== null && s.placement !== "crosshair");
    const wrongSlow = slow.filter((s) => s.placement === "crosshair");
    const gap = shots.filter((s) => s.holdS > 2 && s.holdS < 3);
    checks.push(
      finalise({
        rule: "placement-matches-the-hold",
        tests: "shots under 2 s put the subject on the crosshair; holds over 3 s may use thirds",
        examined: fast.length + slow.length,
        verdict: wrongFast.length + wrongSlow.length ? "violation" : "pass",
        shots: [...wrongFast, ...wrongSlow].map((s) => s.id),
        detail:
          `${fast.length} fast + ${slow.length} held shot(s) checked` +
          (gap.length ? ` · ${gap.length} in the 2–3 s band the source does not cover` : ""),
      }),
    );
  }

  /* 8 — the hold against the pace it was directed at.
     [A]'s measured bands — AND THE POPULATION THEY WERE MEASURED ON, which is
     the whole reason this check has a gate in front of it.

     The bands come off 20 finished trailers, a population whose length [R]
     § "Length is a ladder" measures as centring "just above two minutes". [A]'s
     OWN worked 40 s teasers hold 3–5 s throughout — sequence A opens on a 4 s
     cold open against a band that says a cold-open wide runs 6–13 s. So the
     band rejects the same document's own teaser direction, and running it over
     a short cut is applying a measurement outside its population: the check
     would fire on every teaser and be right about none of them.

     It therefore engages only on a cut long enough to belong to the population,
     and reports the reason when it does not. A band applied outside its
     population is not a stricter check, it is a wrong one. */
  {
    // The cut's own length, from the holds themselves. No second input, so the
    // gate cannot drift from the list it is gating.
    const totalS = round1(shots.reduce((a, s) => a + s.holdS, 0));
    const inPopulation = totalS >= BAND_POPULATION_MIN_S;
    const outOfBand: Shot[] = [];
    if (inPopulation) {
      for (const s of shots) {
        const [lo, hi] = s.role === "tail" ? TAIL_BAND : PACE_BAND[s.pace];
        if (s.holdS < lo || s.holdS > hi) outOfBand.push(s);
      }
    }
    const inferred = shots.filter((s) => s.pace === "measured" && s.role !== "tail").length;
    checks.push(
      finalise({
        rule: "hold-sits-in-its-paces-band",
        tests: "each shot's derived hold falls inside the measured band for the pace it was directed at",
        examined: inPopulation ? shots.length : 0,
        verdict: outOfBand.length ? "violation" : "pass",
        shots: outOfBand.map((s) => s.id),
        detail: inPopulation
          ? `${outOfBand.length} of ${shots.length} shot(s) outside their band` +
            (inferred
              ? ` · ${inferred} judged against the "measured" band, which is INFERRED between two measured ones and not itself measured`
              : "")
          : `this cut runs ${totalS}s; the bands were measured on trailers centring just above two minutes, and the source's own 40 s teasers would fail them`,
      }),
    );
  }

  /* 9 — the seam with the beat layer.
     Not a craft rule: a report on whether the input was classified at all. A
     role this layer inferred from `ROLE_HINTS` is weaker evidence than one the
     beat layer declared, and a beat with neither was never decomposed. */
  {
    const undeclared = shots.filter((s) => !s.roleDeclared);
    const undeclaredBeats = new Set(undeclared.map((s) => s.beatAt));
    checks.push(
      finalise({
        rule: "beat-roles-were-declared",
        tests: "every beat carried a structural role from the beat layer rather than a hint",
        examined: new Set(shots.map((s) => s.beatAt)).size,
        verdict: undeclared.length ? "unmeasured" : "pass",
        shots: undeclared.map((s) => s.id),
        detail: undeclared.length
          ? `${undeclaredBeats.size} beat(s) had no declared role — their decomposition rests on a name match or on nothing`
          : "every beat carried a declared role",
      }),
    );
  }

  return {
    shots: shots.length,
    beats,
    checks,
    engaged: checks.filter((c) => c.examined > 0).length,
    notChecked: NOT_CHECKED,
  };
}

/**
 * The named gaps. Each one is a thing a reader might reasonably assume a green
 * report covered, and does not.
 */
export const NOT_CHECKED: readonly string[] = [
  // Inherited verbatim from `sceneSpec.ts:129-133`.
  "whether a shot's motion is a good move — no verb whitelist, no easing vocabulary. Nothing has measured those.",
  // The refusal `FrameClip` makes, unchanged: the atlas measures how long real
  // trailers HOLD, not how long a generated clip should RUN.
  "whether an absolute shot duration is right. The bands are holds measured off 20 finished trailers at ±0.5 s, not a spec for a clip nobody has rendered.",
  // [R] escalation-without-mechanism: "In a tool, make the raised variable an
  // explicit field. A rung that declares no variable, or repeats the previous
  // one, is mechanically detectable." That field belongs on the BEAT, not the
  // shot, so this layer cannot see it.
  "whether the escalation actually rises. A rung's raised variable (scale · threat · speed · intimacy · cost) is a beat-layer field; nothing here can tell a rung that climbs from one that repeats.",
  // [R] escalation-without-mechanism / but-therefore-beat-linking.
  "whether adjacent beats link with but/therefore rather than 'and then'. That is the beat chain's property and the script step already owns it.",
  // [R] promise-ledger / withholding-budget.
  "what the cut promises against what the work can pay, and what it spends by showing.",
  // The ceiling, [R] trailer-structure § "What is measurable, and what is not".
  "whether the cut WORKS. A structural checker can establish that a cut is malformed; it cannot. The instrument practitioners use for that is an audience survey.",
];
