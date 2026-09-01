// THE FRAMES-PROMPT REGRESSION — dojo-reflected rules cannot silently fall out.
//
//   npx tsx pipeline/frames-prompt-regression.mts
//
// Each check below pins a rule that a human gated through Foundry -> Dojo
// (seed-matched A/B, blind-judged, then approved by eye). A prompt-surface
// rule has no compiler to break when it is deleted — this file is what breaks.
// One check per gated cycle, named by it; a check added here is removed only
// when the rule it pins is deliberately retired by the operator.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const failures: string[] = [];
const check = (name: string, ok: boolean, where: string) => {
  if (!ok) failures.push(`${name} — the gated rule is gone from ${where}`);
};

const doc = read("pipeline/FRAMES-SCENE-PROMPT.md");
const shot = read("app/_phases/frames/shotPrompt.ts");

// 2026-08-30-what-stays-dark (lighting-as-dramatic-instrument, unanimous)
check("what-stays-dark: authoring rule", /Name the light source, and say what stays dark/.test(doc), "FRAMES-SCENE-PROMPT.md");
check("what-stays-dark: MCU recipe names its dark side", /far side of the face falling to near-black/.test(shot), "shotPrompt.ts SUBJECT_RECIPE");
check("what-stays-dark: ECU recipe names its only source", /the sparks themselves the only light/.test(shot), "shotPrompt.ts SUBJECT_RECIPE");

// 2026-08-30-camera-attitude (camera-position-semantics)
check("camera-attitude: LA is an attitude, not mechanics", /looms against what is behind it, granted power/.test(shot), "shotPrompt.ts ANGLE_PHRASE");
check("camera-attitude: HA carries the diminishment", /diminished, small and surveilled/.test(shot), "shotPrompt.ts ANGLE_PHRASE");

// 2026-08-30-lens-as-effect (lens-effect-language) — with its measured caveat
check("lens-as-effect: authoring rule", /Optics are described effects, never notation/.test(doc), "FRAMES-SCENE-PROMPT.md");
check("lens-as-effect: the compression caveat survives", /long-lens compression did not land from words/.test(doc), "FRAMES-SCENE-PROMPT.md");

// 2026-08-30-genre-as-contract (genre-visual-contracts)
check("genre-as-contract: authoring rule with the imperfection budget", /IMPERFECTION BUDGET/.test(doc), "FRAMES-SCENE-PROMPT.md");

// 2026-08-31-study-diagonal (corpus study -> placement vocabulary)
check("study-diagonal: the placement vocabulary can say diagonal", /diagonal: "the composition built on one strong diagonal/.test(shot), "shotPrompt.ts PLACEMENT_PHRASE");

// 2026-08-31-study-light-layers (rule 7's environmental-layer refinement)
check("study-light-layers: rule 7 carries the environmental layer", /ONE named\s+environmental layer/.test(doc), "FRAMES-SCENE-PROMPT.md rule 7");

// 2026-08-30-counted-beats (performance-direction, unanimous)
check("counted-beats: authoring rule", /Performance is counted beats, never a category verb/.test(doc), "FRAMES-SCENE-PROMPT.md");

if (failures.length) {
  console.error(`frames-prompt regression FAILED — ${failures.length} gated rule(s) missing:`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("frames-prompt regression OK — all dojo-gated rules present in FRAMES-SCENE-PROMPT.md and shotPrompt.ts.");
