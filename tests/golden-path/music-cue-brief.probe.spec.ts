// LANE — THE CUE BRIEF IS BUILT FROM THE FILM (dynamic).
//
// Spotting means scoring AGAINST PICTURE, and this pipeline had never seen the
// picture. `cueToPlan` — the entire "scored script → music brief" translation —
// took `{ title, intent, bpm, durS, styleBlock }` and nothing else: no scene, no
// slugline, no mood, no position on the clock. Its inputs were hand-typed
// literals in app/_studio/score.ts, and what it produced above 20 seconds was a
// mechanical 2:1 Build→Release split with two hardcoded style words, identical
// for a pier walk and a rooftop turn.
//
// Worse, `durS` and `startS` were AUTHORED beside the span they were supposed to
// describe. Two copies of one fact with nothing holding them together: the
// seconds of music bought could disagree with the seconds of film covered
// forever and neither number would notice.
//
// This probe drives the REAL derivation and the REAL translation and pins:
//
//   · a cue's span is DERIVED from the project's scene record, not typed;
//   · the sections follow the CUTS — one per scene, at the scene's length;
//   · what the model is told traces to the script/scene record, verbatim;
//   · a project with no picture gets NO CUE — never a default one standing in
//     for a film that does not exist — and the engine refuses to brief one;
//   · `cueToPlan` is pure: no I/O, and the same input gives the same plan.
import { test, expect } from "@playwright/test";

import { CUES, SPOTS, UNSPOTTABLE, cuesFrom, pictureFor, sceneClock } from "@/app/_studio/score";
import { MUSIC_STYLE_BLOCK } from "@/app/_studio/score";
import { SCENES } from "@/app/_studio/scenes";
import { barsFit, cueDurationS, cueStartS, cueToPlan } from "@/lib/music/plan";
import { MusicError } from "@/lib/music/errors";
import type { CueBrief, CuePicture } from "@/lib/music/types";

const brief = (picture: CuePicture, bpm = 84): CueBrief => ({
  title: "probe cue",
  intent: "hold the approach",
  bpm,
  styleBlock: MUSIC_STYLE_BLOCK,
  picture,
});

/** A picture assembled by hand, so a case can exist that the fixture does not. */
const picture = (scenes: CuePicture["scenes"]): CuePicture => ({
  projectTitle: "Probe",
  logline: "A probe.",
  scenes,
});

const scene = (index: number, startS: number, durS: number, mood = "tense / patient") => ({
  index,
  slug: `EXT. PROBE ${index} — NIGHT`,
  mood,
  startS,
  durS,
});

// ── The span is derived from the film, not typed beside it ──────────────────

test("every cue's start and length come from the project's own scene clock", () => {
  const clock = sceneClock(SCENES);
  for (const spot of SPOTS) {
    const cue = CUES.find((c) => c.id === spot.id)!;
    const rows = spot.sceneIds.map((id) => clock.find((c) => c.scene.id === id)!);
    const expectedStart = rows[0].startS;
    const expectedDur = rows.reduce((n, r) => n + r.scene.targetS, 0);
    console.log(
      `[music] ${cue.id} covers ${spot.sceneIds.join("+")} -> ${cue.startS}s..${cue.startS + cue.durS}s`,
    );
    expect(cue.startS, `${cue.id} start drifted from the picture`).toBe(expectedStart);
    expect(cue.durS, `${cue.id} length drifted from the picture`).toBe(expectedDur);
  }
});

test("the cue's span and its picture are the same fact, computed once", () => {
  for (const cue of CUES) {
    expect(cueDurationS(cue.picture)).toBe(cue.durS);
    expect(cueStartS(cue.picture)).toBe(cue.startS);
  }
});

test("the cues tile the clock with no gap the fixture invented", () => {
  const covered = CUES.reduce((n, c) => n + c.durS, 0);
  const film = SCENES.reduce((n, s) => n + s.targetS, 0);
  console.log(`[music] cues cover ${covered}s of ${film}s of film`);
  expect(covered).toBeLessThanOrEqual(film);
});

// ── What the model is told traces to the scene record ───────────────────────

test("the sections follow the CUTS: one per scene, at the scene's own length", () => {
  const cue = CUES[0];
  const plan = cueToPlan(brief(cue.picture, cue.bpm));
  console.log(`[music] ${cue.id}: ${plan.sections.map((s) => `${s.name}=${s.durationMs}ms`).join(" ")}`);
  expect(plan.sections).toHaveLength(cue.picture.scenes.length);
  plan.sections.forEach((sec, i) => {
    expect(sec.durationMs).toBe(cue.picture.scenes[i].durS * 1000);
    expect(sec.name).toContain(`sc ${cue.picture.scenes[i].index}`);
  });
});

test("the vendor is asked for exactly the seconds of film the cue covers", () => {
  for (const cue of CUES) {
    const plan = cueToPlan(brief(cue.picture, cue.bpm));
    const totalMs = plan.sections.reduce((n, s) => n + s.durationMs, 0);
    // THE DEFECT THIS CLOSES: `durS` was a separate typed number, so the music
    // bought and the picture covered were free to differ.
    expect(totalMs, `${cue.id} asks for the wrong amount of music`).toBe(cue.durS * 1000);
  }
});

test("every scene's slugline and mood reach the brief verbatim", () => {
  const cue = CUES[1]; // sc 3 (vertigo / turn) + sc 4 (held breath)
  const plan = cueToPlan(brief(cue.picture, cue.bpm));
  const text = JSON.stringify(plan);
  for (const sc of cue.picture.scenes) {
    console.log(`[music] brief carries: ${sc.slug} — ${sc.mood}`);
    expect(text, `the brief never mentions ${sc.slug}`).toContain(sc.slug);
    // The mood is split into terms the way the record writes it: "vertigo /
    // turn" is two directions, not one adjective.
    for (const term of sc.mood.split("/").map((t) => t.trim()))
      expect(text, `the brief lost the mood term "${term}"`).toContain(term);
  }
  // And the story itself — the only global narrative context a section-level
  // brief ever gets.
  expect(plan.positiveGlobalStyles.join(" ")).toContain("Glass Harbor");
});

test("the intent sentence opens the cue exactly once, not on every section", () => {
  const cue = CUES[0];
  const plan = cueToPlan(brief(cue.picture, cue.bpm));
  const hits = plan.sections.filter((s) => (s.directions ?? []).includes("hold the approach"));
  expect(hits).toHaveLength(1);
  expect(plan.sections[0].directions?.[0]).toBe("hold the approach");
});

// ── barsFit finally has a caller, and it tells the truth either way ─────────

test("a hard ending is asked for only when the span IS whole bars at that tempo", () => {
  // 6s at 80bpm = exactly 2 bars of 4/4 (bar = 240/80 = 3s).
  expect(barsFit(80, 6)).toBe(2);
  const fits = cueToPlan(brief(picture([scene(1, 0, 6)]), 80));
  console.log(`[music] whole-bars section styles -> ${fits.sections[0].positiveStyles.join(", ")}`);
  expect(fits.sections[0].positiveStyles).toContain("hard ending on the beat");
  expect(fits.sections[0].directions?.join(" ")).toContain("2 bars of 4/4");

  // 6s at 84bpm is 2.1 bars — not a bar line in sight.
  expect(barsFit(84, 6)).toBeNull();
  const ragged = cueToPlan(brief(picture([scene(1, 0, 6)]), 84));
  console.log(`[music] ragged section directions -> ${ragged.sections[0].directions?.join(" | ")}`);
  // Said out loud rather than hoped away: asking a model to land on the beat
  // across a span with no bar line makes it choose between tempo and cut.
  expect(ragged.sections[0].positiveStyles).not.toContain("hard ending on the beat");
  expect(ragged.sections[0].directions?.join(" ")).toContain("not a whole number of bars");
});

// ── Honest absence: no picture, no cue ──────────────────────────────────────

test("a project with NO scenes yields no cues at all — never a default one", () => {
  const { cues, unspottable } = cuesFrom(SPOTS, []);
  console.log(`[music] empty picture -> ${cues.length} cues, ${unspottable.length} unspottable`);
  expect(cues).toHaveLength(0);
  expect(unspottable).toHaveLength(SPOTS.length);
  for (const u of unspottable) expect(u.why).toContain("no scenes");
});

test("a spot naming a scene the project does not have is unspottable, not defaulted", () => {
  const ghost = { ...SPOTS[0], id: "cue-ghost", sceneIds: ["sc-1", "sc-99"] };
  const { cues, unspottable } = cuesFrom([ghost], SCENES);
  console.log(`[music] ghost spot -> ${unspottable[0]?.why}`);
  expect(cues).toHaveLength(0);
  // NOT "score sc-1 and quietly forget sc-99": a cue that half-covers its own
  // spotting is the silent-untruth shape this whole direction is about.
  expect(unspottable).toHaveLength(1);
  expect(pictureFor(ghost, SCENES)).toBeNull();
});

test("the shipped fixture is fully spottable — the empty state is reachable, not the norm", () => {
  expect(UNSPOTTABLE).toHaveLength(0);
  expect(CUES).toHaveLength(SPOTS.length);
});

test("the ENGINE refuses to brief a cue with no picture", () => {
  let err: unknown;
  try {
    cueToPlan(brief(picture([])));
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(MusicError);
  const kind = (err as MusicError).kind;
  console.log(`[music] empty-picture brief -> ${kind}: ${(err as MusicError).message.slice(0, 80)}`);
  expect(kind).toBe("bad-request");
  // The surface already declines to draw such a cue; this is the last line of
  // the same rule, so a caller that bypasses the surface cannot buy music for a
  // film that does not exist.
  expect((err as MusicError).message).toContain("no scenes");
});

// ── A scene too short to be a section is merged, never dropped ──────────────

test("a sub-3s scene is folded into its neighbour, and no film is lost", () => {
  const p = picture([scene(1, 0, 6), scene(2, 6, 1.5, "blink"), scene(3, 7.5, 5, "release")]);
  const plan = cueToPlan(brief(p));
  const totalMs = plan.sections.reduce((n, s) => n + s.durationMs, 0);
  console.log(`[music] short-scene pack -> ${plan.sections.map((s) => s.name).join(" ")}`);
  // The vendor floors a section at 3s, so sc 2 cannot stand alone. It joins a
  // neighbour rather than disappearing — a dropped scene is film the score
  // silently stopped covering.
  expect(plan.sections.length).toBeLessThan(3);
  expect(totalMs).toBe(12_500);
  expect(JSON.stringify(plan)).toContain("blink");
});

// ── Pure, and provably not spending anything ────────────────────────────────

test("cueToPlan performs no I/O and is deterministic", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("cueToPlan reached the network");
  }) as unknown as typeof fetch;
  try {
    const a = cueToPlan(brief(CUES[0].picture, CUES[0].bpm));
    const b = cueToPlan(brief(CUES[0].picture, CUES[0].bpm));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  } finally {
    globalThis.fetch = realFetch;
  }
});
