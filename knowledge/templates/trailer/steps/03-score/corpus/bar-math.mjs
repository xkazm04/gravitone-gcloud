// THE ONE MEASUREMENT ON THIS STEP.
//
// Run:  node knowledge/templates/trailer/steps/03-score/corpus/bar-math.mjs
//
// It measures nothing about trailers. It measures THIS REPO'S OWN DEMO CUES —
// whether the tempo each one declares puts a whole number of 4/4 bars in the
// span of picture it plays under. That is the only question about the Score
// step this repo can answer today without a corpus, because it is arithmetic
// over data already in the tree, and `lib/music/plan.ts` already ships the
// function (`barsFit`) whose answer decides what the brief is allowed to ask
// for.
//
// The registry's rule this checks against, quoted:
//
//   "To land an accent on a picture event at T seconds after the cue's entry,
//    choose B so that T divides into whole bars"
//   — ai-registry: media-generation/audio-generation/music-prompt-composition/
//     techniques/duration-and-tempo-locking.md § The bar math
//
// INPUT PROVENANCE. Every number below is copied from the repo, with the file
// it came from, as of 2026-08-29. It is hardcoded rather than imported because
// the sources are TypeScript and this is a plain node script — so the copies
// are printed on every run and a reader can diff them against the files by eye.
//
//   app/_studio/scenes.ts  — SCENES[].targetS
//   app/_studio/score.ts   — SPOTS[].bpm, SPOTS[].sceneIds
//   lib/music/plan.ts      — barsFit(), packScenes()'s 3s floor
//
// If those files move, this script's numbers are stale and its output is a
// claim about a repo that no longer exists. Re-copy, re-run, re-date.

/** app/_studio/scenes.ts — SCENES, in narrative order. */
const SCENES = [
  { id: "sc-1", slug: "EXT. PIER 7 — NIGHT", targetS: 6 },
  { id: "sc-2", slug: "INT. CRANE CAB — NIGHT", targetS: 7 },
  { id: "sc-3", slug: "EXT. ROOFTOP — NIGHT", targetS: 6 },
  { id: "sc-4", slug: "INT. HARBOR GATE — NIGHT", targetS: 7 },
  { id: "sc-5", slug: "EXT. WATERLINE — DAWN", targetS: 5 },
];

/** app/_studio/score.ts — SPOTS. The human spotting decision. */
const SPOTS = [
  { id: "cue-1", title: "The door (build)", bpm: 84, sceneIds: ["sc-1", "sc-2"] },
  { id: "cue-2", title: "Never at the gate (turn)", bpm: 112, sceneIds: ["sc-3", "sc-4"] },
  { id: "cue-3", title: "Waterline (release)", bpm: 84, sceneIds: ["sc-5"] },
];

/** lib/music/plan.ts — verbatim, tolerance included. The tolerance is the
 *  reason this is a measurement and not a division: 0.02 bars of slack is what
 *  the repo actually accepts, so it is what gets counted. */
function barsFit(bpm, seconds) {
  const bar = 240 / bpm;
  const bars = seconds / bar;
  return Math.abs(bars - Math.round(bars)) < 0.02 ? Math.round(bars) : null;
}

/** lib/music/plan.ts — packScenes(), reduced to what affects the count: a scene
 *  under the vendor's 3s floor merges forward. None of Glass Harbor's do, so
 *  every scene is its own section; the guard is kept so the script stays true
 *  if a scene shrinks. */
const MIN_SECTION_S = 3;
function packScenes(scenes) {
  const packs = [];
  for (const s of scenes) {
    const last = packs[packs.length - 1];
    if (last && (s.targetS < MIN_SECTION_S || last.durS < MIN_SECTION_S)) {
      last.scenes.push(s);
      last.durS += s.targetS;
      continue;
    }
    packs.push({ scenes: [s], durS: s.targetS });
  }
  return packs;
}

const sceneById = new Map(SCENES.map((s) => [s.id, s]));

console.log("INPUT (copied from the repo, 2026-08-29)");
console.log("  scenes :", SCENES.map((s) => `${s.id}=${s.targetS}s`).join(" "));
console.log("  spots  :", SPOTS.map((s) => `${s.id}@${s.bpm}bpm [${s.sceneIds.join("+")}]`).join(" "));
console.log("");

let cueTotal = 0;
let cueWhole = 0;
let sectionTotal = 0;
let sectionWhole = 0;

for (const spot of SPOTS) {
  const scenes = spot.sceneIds.map((id) => sceneById.get(id));
  const durS = scenes.reduce((n, s) => n + s.targetS, 0);
  const packs = packScenes(scenes);
  const barS = 240 / spot.bpm;

  cueTotal++;
  const whole = barsFit(spot.bpm, durS);
  if (whole !== null) cueWhole++;

  console.log(`${spot.id} — "${spot.title}"`);
  console.log(`  ${durS}s of picture at ${spot.bpm} bpm · bar = ${barS.toFixed(3)}s · ${(durS / barS).toFixed(3)} bars`);
  console.log(`  cue lands on a bar line: ${whole === null ? "NO" : `yes (${whole} bars)`}`);

  for (const p of packs) {
    sectionTotal++;
    const b = barsFit(spot.bpm, p.durS);
    if (b !== null) sectionWhole++;
    console.log(
      `    section ${p.scenes.map((s) => s.id).join("+")} ${p.durS}s → ${(p.durS / barS).toFixed(3)} bars · ${b === null ? "NO — brief falls back to 'arrival' + 'cut to picture, not to the bar'" : `yes (${b} bars) — brief may ask for a hard ending on the beat`}`,
    );
  }

  // What tempo WOULD work: the registry's actual instruction is to choose B, not
  // to accept whatever B was typed. Integer tempos only, over the range a
  // trailer cue plausibly sits in — the range is this script's choice and is
  // NOT craft knowledge; it is a search window, stated so it can be argued with.
  const candidates = [];
  for (let bpm = 60; bpm <= 160; bpm++) {
    if (packs.every((p) => barsFit(bpm, p.durS) !== null) && barsFit(bpm, durS) !== null) {
      candidates.push(bpm);
    }
  }
  console.log(
    `  integer tempos 60..160 where EVERY section and the whole cue land on bar lines: ${candidates.length ? candidates.join(", ") : "none"}`,
  );

  // What `cueToPlan` ACTUALLY gates the hard ending on: the LAST section only.
  // Reported separately because the strict answer above can be "none" while the
  // ending the brief cares about is perfectly reachable.
  const lastPack = packs[packs.length - 1];
  const endingOk = [];
  for (let bpm = 60; bpm <= 160; bpm++) {
    if (barsFit(bpm, lastPack.durS) !== null) endingOk.push(bpm);
  }
  console.log(
    `  integer tempos 60..160 where the LAST section (${lastPack.durS}s) lands — what cueToPlan gates "hard ending on the beat" on: ${endingOk.length ? endingOk.join(", ") : "none"}`,
  );
  console.log("");
}

console.log("RESULT");
console.log(`  cues landing on a bar line     : ${cueWhole} of ${cueTotal}`);
console.log(`  sections landing on a bar line : ${sectionWhole} of ${sectionTotal}`);
console.log("");
console.log("Sample size is the whole population of demo cues in this repo, which is");
console.log("three. It is a measurement of THIS FIXTURE, not of trailer scoring.");
