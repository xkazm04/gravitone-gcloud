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
  ROLE_HINTS,
  beatSeconds,
  isTrailerFormat,
  shotCountFor,
  shotsByBeat,
  shotsFromBeats,
  shotsFromRender,
  unplaceableBeats,
  type Shot,
  type ShotSourceBeat,
  type TrailerRole,
} from "@/app/_phases/frames/shots";
import { actionFor, promptsForShots } from "@/app/_phases/frames/shotPrompt";
import { framesFromRender } from "@/app/_phases/frames/frames";
import { RENDERS } from "@/app/_phases/script/renders";
import { compileStyleBlock, NO_TEXT_CLAUSE, PROMPT_CHAR_LIMIT } from "@/lib/stylePrompt";
import type { StyleBlock } from "@/lib/themes";

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

/** A style block shaped like the ones `lib/themes` ships — three colours, one per role. */
const BLOCK: StyleBlock = {
  technique: "Flat vector illustration with hard edges",
  subject: "Simple geometric forms with no rendering detail",
  palette: [
    { name: "navy", hex: "#0B1B2B", role: "ground" },
    { name: "cream", hex: "#F2EAD8", role: "objects" },
    { name: "cyan", hex: "#38D6E0", role: "accent" },
  ],
  finish: "Matte, no gradients and no glow",
};

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

/* ── 4. the prompt half — proposed, never called, never scored ───────────── */

test("every shot proposes a prompt, and the style block is restated in full in each", () => {
  const shots = shotsFromBeats(TEASER, TEASER_TOTAL_S);
  const prompts = promptsForShots(shots, BLOCK);
  expect(prompts).toHaveLength(shots.length);

  // `style-is-restated-not-remembered`: "there is no short form, and no call may
  // opt out of the style half of its prompt." Compared against the compiler's
  // OWN output rather than a copy of its wording.
  const style = compileStyleBlock(BLOCK);
  expect(prompts.every((p) => p.text.includes(style))).toBe(true);
  // The style half goes FIRST — CLIP-conditioned models see roughly the first
  // 77 tokens, which is `compilePrompt`'s stated reason for the order.
  expect(prompts.every((p) => p.text.indexOf(style) === 0)).toBe(true);
  // Cards and captions are the vector layer's, never the model's.
  expect(prompts.every((p) => p.text.includes(NO_TEXT_CLAUSE))).toBe(true);
  expect(prompts.every((p) => p.chars <= PROMPT_CHAR_LIMIT)).toBe(true);

  console.log(`[shots] ${prompts.length} prompts, longest ${Math.max(...prompts.map((p) => p.chars))}c`);
  console.log(`[shots] sample action: ${prompts[0].action}`);
});

test("the action block is built from the shot, never from the beat's sentence", () => {
  // `subjectFor` (frames.ts:280-286) refuses the literal words because the trial
  // grid measured them leaking text on 6 of 6 styles. The same refusal, one
  // layer down: the beat's copy must appear nowhere in the prompt.
  const shots = shotsFromBeats(TEASER, TEASER_TOTAL_S);
  const prompts = promptsForShots(shots, BLOCK);
  for (const b of TEASER) {
    expect(prompts.some((p) => p.text.includes(b.text))).toBe(false);
    expect(prompts.some((p) => p.text.includes(b.label))).toBe(false);
  }
});

test("an authored subject overrides the recipe; an unresolved role admits it has none", () => {
  const [base] = shotsFromBeats(TEASER, TEASER_TOTAL_S);
  const authored = promptsForShots([{ ...base, subject: "A cracked bell half-buried in ash." }], BLOCK)[0];
  expect(authored.authoredSubject).toBe(true);
  expect(authored.action).toContain("A cracked bell half-buried in ash.");

  // A beat whose role never resolved has no size, so no recipe applies — and
  // the prompt says so rather than inventing a subject to fill the hole.
  const [orphan] = shotsFromBeats([beat("0:00", undefined, "unclassified")], 20);
  const p = promptsForShots([orphan], BLOCK)[0];
  expect(p.subjectMissing).toBe(true);
  expect(p.authoredSubject).toBe(false);
});

test("no move is invented — the action block mentions one only when a shot carries one", () => {
  const [base] = shotsFromBeats(TEASER, TEASER_TOTAL_S);
  expect(actionFor(base)).not.toContain("first frame of a shot that");
  expect(actionFor({ ...base, motion: "pushes slowly toward the light" })).toContain(
    "first frame of a shot that pushes slowly toward the light",
  );
});

test("the prompt checks are not-engaged when there are no prompts, and never score quality", () => {
  const shots = shotsFromBeats(TEASER, TEASER_TOTAL_S);
  const promptRules = [
    "prompt-proposed-per-shot",
    "prompt-restates-the-style-block",
    "prompt-forbids-glyphs",
    "prompt-within-the-vendor-ceiling",
  ];

  // No prompts supplied: four not-engaged, and not one pass.
  const bare = reviewShotList(shots);
  for (const r of promptRules) {
    const c = bare.checks.find((x) => x.rule === r);
    expect(c?.verdict, `${r} must not pass over nothing`).toBe("not-engaged");
  }

  // Supplied: they engage and clear.
  const full = reviewShotList(shots, promptsForShots(shots, BLOCK), BLOCK);
  for (const r of promptRules) {
    const c = full.checks.find((x) => x.rule === r);
    expect(c?.verdict, r).toBe("pass");
    expect(c?.examined, r).toBeGreaterThan(0);
  }

  // And the style check CAN fail: strip the style half and it is caught.
  const tampered = promptsForShots(shots, BLOCK).map((p) => ({
    ...p,
    text: p.text.replace(compileStyleBlock(BLOCK), "(the style, as before)"),
  }));
  const c = reviewShotList(shots, tampered, BLOCK).checks.find(
    (x) => x.rule === "prompt-restates-the-style-block",
  );
  expect(c?.verdict).toBe("violation");
  console.log(`[shots] abbreviated style block -> ${c?.rule}=${c?.verdict}: ${c?.detail}`);

  // No check anywhere claims to have graded a prompt, and the gap is named.
  expect(full.checks.some((x) => /quality|good|score/i.test(x.rule))).toBe(false);
  expect(full.notChecked.some((n) => /is GOOD/.test(n))).toBe(true);
});

/* ── 5. the seam with the beat lane ──────────────────────────────────────── */

test("an unparseable position yields NO shots — it is never folded to zero", () => {
  // `frames.ts#secondsOf` folds "tbd" to 0 and would place the beat at the head
  // of the cut, stealing every following beat's span. The beat lane's
  // `atSeconds()` returns null instead, and this layer matches it.
  expect(beatSeconds({ at: "tbd", kind: "rung", label: "l", text: "t" })).toBeNull();
  expect(beatSeconds({ at: "1:20", kind: "rung", label: "l", text: "t" })).toBe(80);
  expect(beatSeconds({ at: "1:02:03", kind: "rung", label: "l", text: "t" })).toBe(3723);
  // An `atS` the beat layer already resolved wins, INCLUDING its null.
  expect(beatSeconds({ at: "0:10", atS: null, kind: "rung", label: "l", text: "t" })).toBeNull();

  const bad: ShotSourceBeat[] = [
    { at: "0:00", kind: "cold-open", label: "ok", text: "t" },
    { at: "soon", kind: "peak", label: "broken", text: "t" },
  ];
  expect(unplaceableBeats(bad)).toHaveLength(1);
  const shots = shotsFromBeats(bad, 40);
  expect(shots.every((s) => s.beatAt === "0:00")).toBe(true);
});

test("an unplaceable beat in the MIDDLE does not hand its predecessor the rest of the cut", () => {
  // The boundary is the next beat that PARSES. Before this was fixed the
  // derivation looked only at `beats[i + 1]`, got null, fell through to the
  // cut's total length, and gave the cold open the whole 40 s — 4 setup shots
  // instead of 3 — even though a placeable beat sat at 0:30. On a `peak` the
  // same fall-through multiplies the count by `beatS / 1.5`.
  const chain: ShotSourceBeat[] = [
    { at: "0:00", kind: "cold-open", label: "open", text: "t" },
    { at: "soon", kind: "rung", label: "unplaceable", text: "t" },
    { at: "0:30", kind: "reset", label: "the stop", text: "t" },
  ];
  const shots = shotsFromBeats(chain, 40);
  const open = shots.filter((s) => s.beatAt === "0:00");
  // 0:00 → 0:30 is 30 s, and a setup wide runs to 13 s: ceil(30 / 13) = 3.
  expect(open).toHaveLength(3);
  expect(open.every((s) => s.holdS === 10)).toBe(true);
  // The unplaceable beat still derives nothing at all, and the beat after it is
  // untouched.
  expect(shots.some((s) => s.beatAt === "soon")).toBe(false);
  expect(shots.filter((s) => s.beatAt === "0:30")).toHaveLength(1);
  console.log(`[shots] mid-chain unplaceable: cold open ${open.length} shot(s) at ${open[0].holdS}s`);
});

test("two beats at the same timecode stay two groups — a position is not an identity", () => {
  // shots.ts says it in its own words: `beatAt` "is a position and positions
  // repeat". Grouping on it merged these two beats into one row block, dropped
  // the second's label and basis, and gave a surface keyed by `beatAt` the same
  // React key twice.
  const chain: ShotSourceBeat[] = [
    { id: "b1", at: "0:12", kind: "reset", label: "the stop", text: "t" },
    { id: "b2", at: "0:12", kind: "reset", label: "a different beat, same second", text: "t" },
    { id: "b3", at: "0:20", kind: "peak", label: "climax", text: "t" },
  ];
  const groups = shotsByBeat(shotsFromBeats(chain, 30));
  expect(groups.map((g) => g.beatLabel)).toEqual([
    "the stop",
    "a different beat, same second",
    "climax",
  ]);
  // What a surface keys rows by has to be unique across the whole list.
  const keys = groups.map((g) => g.shots[0].id);
  expect(new Set(keys).size).toBe(keys.length);
  console.log(`[shots] same-timecode beats -> ${groups.length} groups, keys ${keys.join(",")}`);
});

test("every kind the beat lane can emit resolves to a role — no key is dead", () => {
  // TrailerBeatKind, as declared on `trailer/story-model`. If that union grows,
  // this list and ROLE_HINTS are the one line each that reconciles it.
  const KINDS = ["cold-open", "stakes", "rung", "reset", "peak", "title", "button", "cta"];
  for (const k of KINDS) expect(ROLE_HINTS[k], `${k} has no role`).toBeTruthy();
  expect(Object.keys(ROLE_HINTS).sort()).toEqual([...KINDS].sort());

  // And a hinted beat really does decompose — the hint path is not decorative.
  const hinted = shotsFromBeats(
    [
      { id: "b1", at: "0:00", kind: "cold-open", label: "open", text: "t", movement: "m1" },
      { id: "b2", at: "0:20", kind: "reset", label: "stop", text: "t", movement: "m2" },
    ],
    30,
  );
  expect(hinted.every((s) => s.roleDeclared)).toBe(false);
  expect(hinted.map((s) => s.role)).toEqual(["setup", "setup", "reset"]);
  // The ids and the movement come across rather than being dropped.
  expect(hinted[0].beatId).toBe("b1");
  expect(hinted[0].movementId).toBe("m1");
});
