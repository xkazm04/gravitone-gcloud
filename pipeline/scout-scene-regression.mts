// THE SCOUT-SCENE REGRESSION — the scene readback's rules cannot silently fall out.
//
//   npx tsx pipeline/scout-scene-regression.mts
//   npx tsx pipeline/scout-scene-regression.mts --dir <folder holding a copy of SCOUT-SCENE-PROMPT.md>
//
// OFFLINE: no model is called. Two halves, exit 1 if either fails:
//
//   1. PINS. Every rule pipeline/SCOUT-SCENE-PROMPT.md carries is pinned here by its `standard:`
//      tag AND by the sentence that states it. A prompt rule has no compiler to break when it is
//      deleted — this file is what breaks.
//   2. CASES. lib/foundry/scout/scene.ts `recipeOf`, the door every recognize answer passes before
//      it becomes a SceneRecipe, driven with fixed sample answers: `[name, answer, verdict]`, where
//      the verdict is `ok`, `invalid` (the shape) or `refused` (a name). The door is the half of a
//      rule a model cannot talk its way past, so its verdicts are pinned too.
//
// `--dir` exists so the pins can be proven to bite: copy the prompt somewhere, delete one rule from
// the copy, and run against it — never against the real file.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { denylistOf, recipeOf, standDraft, stripComments, type SceneTiming } from "../lib/foundry/scout/scene.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirArg = process.argv.indexOf("--dir");
const DIR = dirArg > 0 && process.argv[dirArg + 1] ? path.resolve(process.argv[dirArg + 1] ?? "") : path.join(ROOT, "pipeline");

const failures: string[] = [];

/* ── 1. pins ─────────────────────────────────────────────────────────────── */

const raw = fs.readFileSync(path.join(DIR, "SCOUT-SCENE-PROMPT.md"), "utf8");
// What the model is SENT (comments stripped), whitespace collapsed so a pin ignores line wraps.
const doc = stripComments(raw).replace(/\s+/g, " ");
const P = "SCOUT-SCENE-PROMPT.md";
let pins = 0;
const pin = (tag: string, ...rules: RegExp[]): void => {
  pins++;
  if (!doc.includes(`standard: ${tag}`)) failures.push(`${P}: the tag "standard: ${tag}" is gone`);
  for (const r of rules) if (!r.test(doc)) failures.push(`${P} [${tag}]: the rule ${r} is gone`);
};

pin("visual-style-locking/style-onboarding-from-sample", /Craft, not content\./, /The frame you see is never a reference for anything; only your words leave this call\./);
pin("scout-scene/no-names", /No names, of anything\./, /Never the words of the source's title\./, /Write every word in lower case except the first word of a sentence/);
pin("scout-scene/shot-sizes", /`extreme-wide`, `wide`, `medium`, `close`, `extreme-close`, `insert`/);
pin("scout-scene/camera", /never a millimetre figure or an equipment name/);
pin("scout-scene/motion-in-evidence", /Motion only in evidence\./, /A fluent move nobody saw is the failure this rule exists for\./);
pin("scout-scene/light", /Name the light source, and say what stays dark\./);
pin("scout-scene/palette-jobs", /Two to six entries/, /the ONE job it does/, /A colour with no job is re-cast on every generation; a colour with a job is a look\./);
pin("scout-scene/rhythm", /`pace unknown from stills`/);
pin("scout-scene/replica-prompt", /Its FIRST clause names the medium/, /No names, no titles, no writing/);

/* ── 2. cases: fixed answers through the door ─────────────────────────────── */

const SOURCES = [{ title: "Harbour Chase - Official Trailer", channel: "Moonfall Pictures" }];
const deny = denylistOf(SOURCES);
const timing: SceneTiming = { cuts: [1, 2.5, 4, 7], at: {}, durationS: 3, rhythm: "5 shots over 10 s, median 1.5 s, 30 cuts a minute; this shot holds 3 s" };

const GOOD = {
  shot: "wide",
  camera: "low and level, the figure on the left third, a wide lens with the near edge stretched",
  motion: "camera pushes in slowly; rain drifts right to left; the figure holds",
  composition: "one figure against a long receding line of lamps, open water on the right",
  lighting: "a hard sodium key from frame right; everything left of the figure falls to black",
  palette: [
    { colour: "teal", job: "ground" },
    { colour: "sodium amber", job: "light" },
    { colour: "near-black", job: "shadow" },
  ],
  rhythm: "held long against quick cutting around it",
  duration_s: 4,
  prompt:
    "A photoreal film still: a wide low shot of a lone figure in a long coat on a wet quay at night, a hard amber key from the right, teal air, the left of frame falling to black, rain drifting across the lamps.",
};

type Verdict = "ok" | "invalid" | "refused";
const CASES: readonly (readonly [string, unknown, Verdict])[] = [
  ["good: a craft answer", GOOD, "ok"],
  ["good: the dry stand-in", standDraft(timing), "ok"],
  ["good: the one capitalised craft term and an acronym", { ...GOOD, camera: "a Dutch angle, low and wide; soft HDR rolloff" }, "ok"],
  ["names a franchise mid-sentence", { ...GOOD, prompt: GOOD.prompt.replace("a lone figure in a long coat", "a lone Jedi in a long robe") }, "refused"],
  ["names a franchise in its own capitals", { ...GOOD, motion: "the camera pushes in like a Star Wars opening crawl" }, "refused"],
  ["repeats the source's title, lower case", { ...GOOD, composition: "the harbour wall on the right, one figure on the left" }, "refused"],
  ["repeats the source's channel inside a compound", { ...GOOD, lighting: "a moonfall-style cold key from above" }, "refused"],
  ["names a cinematographer", { ...GOOD, lighting: "lit the way Deakins lights a night exterior" }, "refused"],
  ["malformed: not an object", "the shot is wide and dark", "invalid"],
  ["malformed: no answer at all", undefined, "invalid"],
  ["malformed: a missing field", (({ lighting: _gone, ...rest }) => rest)(GOOD), "invalid"],
  ["malformed: a shot size outside the six", { ...GOOD, shot: "cowboy" }, "invalid"],
  ["malformed: a duration that is not a number", { ...GOOD, duration_s: "four" }, "invalid"],
  ["palette without roles: bare colour words", { ...GOOD, palette: ["teal", "amber", "black"] }, "invalid"],
  ["palette without roles: a colour with no job", { ...GOOD, palette: [{ colour: "teal" }, { colour: "amber", job: "accent" }] }, "invalid"],
  ["palette: a job outside the seven", { ...GOOD, palette: [{ colour: "teal", job: "mood" }, { colour: "amber", job: "accent" }] }, "invalid"],
  ["palette: one colour is not a palette", { ...GOOD, palette: [{ colour: "teal", job: "ground" }] }, "invalid"],
];

for (const [name, answer, want] of CASES) {
  const r = recipeOf(answer, { deny, timing });
  const got: Verdict = r.ok ? "ok" : r.error.code === "refused" ? "refused" : "invalid";
  if (got !== want) failures.push(`case "${name}": expected ${want}, the door said ${got}${r.ok ? "" : ` (${r.error.message})`}`);
}

// A passing recipe carries the cut-derived length and pace, never the model's guess, when the cuts are known.
const good = recipeOf(GOOD, { deny, timing });
if (!good.ok || good.value.durationS !== 3 || good.value.rhythm !== timing.rhythm) failures.push("the recipe does not take its length and pace from the source's cut timestamps");

if (failures.length > 0) {
  console.error(`scout-scene regression FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(`scout-scene regression OK — ${pins} prompt rules pinned, ${CASES.length} door cases hold (offline, no model).`);
