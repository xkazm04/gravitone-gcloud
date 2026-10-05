// THE ADS-PROMPTS REGRESSION — the concept rounds' rules cannot silently fall out.
//
//   npx tsx pipeline/ads-prompts-regression.mts
//   npx tsx pipeline/ads-prompts-regression.mts --dir <folder holding copies of both prompt files>
//
// Two halves, exit 1 if either fails:
//
//   1. PINS. Every rule pipeline/ADS-IDEAS-PROMPT.md and ADS-SCENARIOS-PROMPT.md
//      carry from the forged registry subjects (ad-concept-ideation,
//      short-ad-structure, still-to-motion-direction, ad-finishing) is pinned
//      here by its `standard:` tag AND by the sentence that states it. A prompt
//      rule has no compiler to break when it is deleted — this file is what
//      breaks. A pin is removed only when the rule it holds is deliberately
//      retired.
//   2. CASES. lib/ads/validate.ts, driven with hand-written answers:
//      `[name, input, shouldPass]`. The validator is the half of each rule a
//      model cannot talk its way past, so its refusals are pinned too.
//
// `--dir` exists so the pins can be proven to bite: copy both files somewhere,
// delete one rule from the copy, and run against it — never against the real
// files.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AdBriefQuestion, AdConceptError, parseIdeas, parseScenarios } from "../lib/ads/validate";
import type { AdBrief, AdIdea, AdTemplateId } from "../lib/ads/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirArg = process.argv.indexOf("--dir");
const DIR = dirArg > 0 && process.argv[dirArg + 1] ? path.resolve(process.argv[dirArg + 1]) : path.join(ROOT, "pipeline");

/** Whitespace collapsed, so a pin does not care where a line wrapped. */
const read = (name: string) => fs.readFileSync(path.join(DIR, name), "utf8").replace(/\s+/g, " ");

const failures: string[] = [];
let pins = 0;
const pin = (doc: string, where: string, tag: string, ...rules: RegExp[]) => {
  pins++;
  if (!doc.includes(`standard: ${tag}`)) failures.push(`${where}: the tag "standard: ${tag}" is gone`);
  for (const r of rules) if (!r.test(doc)) failures.push(`${where} [${tag}]: the rule ${r} is gone`);
};
/** The section that starts at `heading`, up to the next `## `. */
const section = (doc: string, heading: string): string => {
  const at = doc.indexOf(heading);
  if (at < 0) return "";
  const next = doc.indexOf(" ## ", at + heading.length);
  return doc.slice(at, next < 0 ? undefined : next);
};

/* ── 1. pins: ADS-IDEAS-PROMPT ────────────────────────────────────────────── */

const ideas = read("ADS-IDEAS-PROMPT.md");
const I = "ADS-IDEAS-PROMPT.md";

pin(ideas, I, "ad-concept-ideation/proposition-before-idea",
  /proposition is the creator's, verbatim/i,
  /written from the viewer's side/,
  /one product truth into `truth`\*\* before any idea/,
  /ask rather than invent/i,
  /as fixed fields/);

pin(ideas, I, "ad-concept-ideation/angle-template-seeding",
  /assigns each of the six slots a DIFFERENT angle/,
  /classify its actual mechanism/i,
  /drifted into another slot's angle/,
  /Every idea is labelled with its angle/,
  /analogy and exaggeration/,
  /problem-solution\*\* — held in reserve/,
  /shown at an extreme or by analogy/);

pin(ideas, I, "ad-concept-ideation (golden path)",
  /may EXCLUDE an angle, visibly/,
  /Tone never chooses an idea/);

pin(ideas, I, "ad-concept-ideation/divergence-before-selection",
  /Many short titles first/,
  /push them further apart; no two the same/,
  /expand one survivor per slot/i,
  /ordinary person/,
  /forced connection/,
  /De-duplicate by mechanism, not by wording/);
// The levers that do NOT work stay out of the generator as levers.
if (/be bold|ten more|temperature/i.test(ideas)) failures.push(`${I}: "be bold" / "ten more" / temperature appears as a lever`);

pin(ideas, I, "ad-concept-ideation/idea-screening-gates",
  /Gates, never a score/,
  /the swap test/i,
  /one clause/,
  /single sentence a stranger could repeat/,
  /banality floor/,
  /filmable in the medium/i,
  /dialogue/, /long continuous action/, /legible text/, /likeness held across many shots/, /precise physical handling/,
  /never by relaxing a gate/);

pin(ideas, I, "ad-concept-ideation/idea-screening-gates + honest-risk-statement",
  /What does the picture claim about the product\?/,
  /substantiation/,
  /read(s)? it as literal/,
  /blocking/);

// The wanted quality is stated positively, and the banality floor list is a
// judge pass's (v1 has none) — recorded as a follow-up, not stuffed in.
pin(ideas, I, "ad-concept-ideation/banality-screen", /The quality wanted/, /FOLLOW-UP \(banality-screen\)/);
{
  const q = section(ideas, "## The quality wanted");
  if (!q) failures.push(`${I}: the "## The quality wanted" section is gone`);
  else if (/\b(do not|don't|avoid|never|no )\b/i.test(q.replace(/<!--.*?-->/g, "")))
    failures.push(`${I}: the wanted-quality section carries a "do not" list — state it positively`);
}

pin(ideas, I, "ad-concept-ideation/divergence-before-selection (the model never ranks)",
  /You screen; the creator chooses/,
  /No field carries a score, a rank/);

pin(ideas, I, "ad-concept-ideation/honest-risk-statement",
  /a failure mode and the condition that triggers it/,
  /would fit another idea in the set is not about this one/,
  /same length and weight/);

/* ── 1. pins: ADS-SCENARIOS-PROMPT ────────────────────────────────────────── */

const scen = read("ADS-SCENARIOS-PROMPT.md");
const S = "ADS-SCENARIOS-PROMPT.md";

pin(scen, S, "short-ad-structure/timed-shot-list (law typed-input-owns-its-channel)",
  /Reserve the end card's hold first/,
  /Allocate by function, not evenly/,
  /hook is short and sharp; the shot that carries the product truth gets the most time/,
  /at most one clip long \(10 seconds\)/,
  /usable part of a clip to be its first seconds/,
  /about 1\.5 seconds/,
  /reading time/,
  /plus the end card equal the runtime exactly/,
  /No duration words in the motion prose/,
  /link by "but" or "therefore", never "and then"/);

pin(scen, S, "short-ad-structure/length-rungs",
  /15s rung — hook, truth, payoff, end card/,
  /30s rung — hook, set-up, truth, turn, payoff, end card/,
  /hook, the payoff, the brand and the ask are never dropped/);

pin(scen, S, "short-ad-structure/product-tied-hook",
  /opens a question the product answers/,
  /the payoff first/, /the problem at its extreme/, /the product doing something it shouldn't/,
  /sound off/,
  /never a logo card/);

pin(scen, S, "short-ad-structure/brand-presence-timing",
  /cue in the opening shots/,
  /pulses/,
  /brand on the end card/,
  /not a watermark/);

pin(scen, S, "short-ad-structure/payoff-before-ask",
  /visibly BECAUSE of the product/,
  /lands before the ask/,
  /One call to action/,
  /restates the proposition; it never adds/,
  /Nothing comes after the card/);

pin(scen, S, "short-ad-structure/one-message-spine",
  /One message across every shot, every super and the end card/);

pin(scen, S, "ad-finishing/drawn-supers",
  /five to seven words/,
  /0\.2 seconds per word plus 2 seconds/,
  /Never shorten the hold/,
  /move the super .*or cut words/);

pin(scen, S, "ad-finishing/single-bed-loudness",
  /ONE music bed/,
  /resolution lands on the end card/);

pin(scen, S, "still-to-motion-direction/animatable-key-image + product-fidelity",
  /Decide the camera move first and leave room for it/,
  /One subject, separated from a simple ground/,
  /moment BEFORE the shot's action/,
  /No lettering anywhere in the plate/,
  /native aspect/,
  /quiet region where the super will sit/,
  /legible product label is never generated/,
  /Keep the product implied/);

pin(scen, S, "still-to-motion-direction/motion-line-composition + motion-amount-tradeoff",
  /Exactly one camera move/,
  /One visible subject action/,
  /A speed word/,
  /three to eight words naming the look as a medium/,
  /generically/,
  /Do not re-describe the image/,
  /State stillness positively \("locked-off camera; the frame holds steady"\)/,
  /no duration, no mood adjectives/,
  /Product and likeness shots move little, mostly by the camera/,
  /energy on the hook/);

/* ── 2. cases: lib/ads/validate.ts ────────────────────────────────────────── */

const brief: AdBrief = {
  product: "Rainshell packable jacket",
  audience: "city cyclists",
  proposition: "This jacket keeps you dry in a downpour.",
  tone: "deadpan",
  mustInclude: ["logo on the end card"],
  cta: "Pack one today",
  platform: "vertical feed",
};
const yes = (why: string) => `yes — ${why}`;
const gates = {
  swap: yes("a rival's jacket does not fold into a pocket that small"),
  singleMinded: yes("you stay dry in a downpour"),
  oneLine: yes("a cyclist rides through a storm wearing a raincloud as a hat"),
  ownable: yes("nobody in the category shows the rain losing"),
  filmable: yes("four stills, no dialogue, no text"),
};
const ANGLES = ["analogy", "twist", "exaggeration", "demo", "emotional", "absurd"] as const;
const goodIdeas = () => ({
  proposition: brief.proposition,
  truth: "it packs into its own chest pocket and still sheds a cloudburst",
  ask: null,
  exclusion: null,
  longlist: Array.from({ length: 14 }, (_, i) => `title ${i + 1}`),
  ideas: ANGLES.map((angle, i) => ({
    slot: i + 1,
    angle,
    classifiedAs: angle,
    title: `Idea ${i + 1}: the rain gives up`,
    hook: "a cyclist under a private cloud",
    twist: "the weather is the loser",
    whyItWorks: "the truth is felt, not stated",
    gates,
    pictureClaim: angle === "demo" ? "water beads off the shell — substantiated by the brief's waterproof rating" : null,
    needsTurn: null,
    risk: `risk ${i + 1}: misread if the register is not absurd from the first shot`,
  })),
});
type RawShot = {
  parts: string[];
  link: string | null;
  brandCue: boolean;
  durationS: number;
  image: string;
  motion: string;
  super: string | null;
};
const shot = (over: Partial<RawShot> = {}): RawShot => ({
  parts: ["truth"],
  link: "therefore",
  brandCue: false,
  durationS: 4,
  image: "a cyclist at a red light, rain hammering, the jacket's hood up",
  motion: "slow push in; the rider glances up steadily; glossy studio product film",
  super: null,
  ...over,
});
const goodScenario = () => ({
  title: "The private cloud",
  logline: "A rider stays dry while the street drowns.",
  medium: "glossy studio product film",
  shots: [
    shot({ parts: ["hook"], link: null, brandCue: true, durationS: 2.5 }),
    shot({ parts: ["truth"], durationS: 5.5, link: "but" }),
    shot({ parts: ["payoff"], durationS: 5, super: "Dry. Every ride." }),
  ],
  musicMood: "a dry snare bed that resolves on the card",
  endCard: { cta: "anything", line: "Dry in a downpour." },
});
const goodScenarios = () => ({ scenarios: [goodScenario(), goodScenario(), goodScenario()] });
const idea: AdIdea = {
  id: "idea-x",
  angle: "analogy",
  title: "t",
  hook: "h",
  twist: "w",
  whyItWorks: "y",
  risk: "r",
};
const ideasReq = { brief, template: "ad-social-15" as const };
const scenReq: { brief: AdBrief; template: AdTemplateId; idea: AdIdea } = { brief, template: "ad-social-15", idea };

type Case = [string, () => unknown, boolean, string?];
const mutateIdeas = (f: (r: ReturnType<typeof goodIdeas>) => void) => () => {
  const r = goodIdeas();
  f(r);
  return parseIdeas(r, ideasReq);
};
const mutateScen = (f: (r: ReturnType<typeof goodScenarios>) => void, req = scenReq) => () => {
  const r = goodScenarios();
  f(r);
  return parseScenarios(r, req);
};

const cases: Case[] = [
  ["ideas: a well-formed round passes", mutateIdeas(() => {}), true],
  ["ideas: a fenced JSON string passes", () => parseIdeas("```json\n" + JSON.stringify(goodIdeas()) + "\n```", ideasReq), true],
  ["ideas: five ideas refused", mutateIdeas((r) => r.ideas.pop()), false, "expected 6 ideas"],
  ["ideas: an angle used twice refused", mutateIdeas((r) => (r.ideas[1].angle = "analogy")), false, "angle used twice"],
  ["ideas: an unknown angle refused", mutateIdeas((r) => ((r.ideas[0] as { angle: string }).angle = "humour")), false, "is not an angle"],
  ["ideas: an unassigned angle (reserve without exclusion) refused", mutateIdeas((r) => ((r.ideas[5] as { angle: string; classifiedAs: string }).angle = "problem-solution", ((r.ideas[5] as { classifiedAs: string }).classifiedAs = "problem-solution"))), false, "not assigned"],
  ["ideas: the reserve WITH a reasoned exclusion passes", mutateIdeas((r) => {
    (r as { exclusion: unknown }).exclusion = { angle: "absurd", reason: "the tone is solemn" };
    (r.ideas[5] as { angle: string; classifiedAs: string }).angle = "problem-solution";
    (r.ideas[5] as { classifiedAs: string }).classifiedAs = "problem-solution";
  }), true],
  ["ideas: a drifted mechanism refused", mutateIdeas((r) => ((r.ideas[5] as { classifiedAs: string }).classifiedAs = "problem-solution")), false, "drifted"],
  ["ideas: a 91-character title refused", mutateIdeas((r) => (r.ideas[0].title = "x".repeat(91))), false, "91 characters"],
  ["ideas: an empty risk refused", mutateIdeas((r) => (r.ideas[2].risk = " ")), false, "no risk"],
  ["ideas: two identical risks refused", mutateIdeas((r) => (r.ideas[3].risk = r.ideas[2].risk)), false, "same risk"],
  ["ideas: a failed gate refused", mutateIdeas((r) => (r.ideas[0].gates = { ...gates, swap: "no — any jacket works" })), false, "swap test gate"],
  ["ideas: a bare yes refused", mutateIdeas((r) => (r.ideas[0].gates = { ...gates, filmable: "yes" })), false, "filmable gate"],
  ["ideas: a demo with no picture claim refused", mutateIdeas((r) => (r.ideas[3].pictureClaim = null)), false, "picture claims"],
  ["ideas: no truth refused", mutateIdeas((r) => (r.truth = "")), false, "no product truth"],
  ["ideas: a skipped long list refused", mutateIdeas((r) => (r.longlist = ["one"])), false, "long list"],
  ["ideas: an ask is a question, not ideas", () => {
    try {
      parseIdeas({ ...goodIdeas(), ask: "Which benefit — dry or light?", ideas: [] }, ideasReq);
    } catch (e) {
      if (e instanceof AdBriefQuestion) throw e;
    }
    return "no question";
  }, false, "Which benefit"],
  ["ideas: a mint that always collides still yields unique ids", () => {
    const out = parseIdeas(goodIdeas(), ideasReq, { mint: () => "same" });
    if (new Set(out.map((o) => o.id)).size !== out.length) throw new Error("ids collide");
  }, true],
  ["scenarios: a well-formed round passes", mutateScen(() => {}), true],
  ["scenarios: a mint that always collides still yields unique ids", () => {
    const out = parseScenarios(goodScenarios(), scenReq, { mint: () => "same" });
    if (new Set(out.map((o) => o.id)).size !== out.length) throw new Error("ids collide");
    if (new Set(out.flatMap((o) => o.shots.map((s) => s.id))).size !== out.reduce((n, o) => n + o.shots.length, 0)) throw new Error("shot ids collide");
  }, true],
  ["scenarios: two scenarios refused", mutateScen((r) => r.scenarios.pop()), false, "expected 3 scenarios"],
  ["scenarios: seven shots refused", mutateScen((r) => (r.scenarios[0].shots = Array.from({ length: 7 }, (_, i) => shot({ parts: i === 0 ? ["hook"] : i === 6 ? ["payoff"] : ["truth"], link: i === 0 ? null : "but", brandCue: i === 0, durationS: 1.5 })))), false, "7 shots"],
  ["scenarios: a 10.5s shot refused (longer than one clip)", mutateScen((r) => (r.scenarios[0].shots[1].durationS = 10.5)), false, "longer than one clip"],
  ["scenarios: a 1.2s shot refused (under the floor)", mutateScen((r) => (r.scenarios[0].shots[0].durationS = 1.2)), false, "under the 1.5s floor"],
  ["scenarios: a runtime outside the band refused", mutateScen((r) => (r.scenarios[0].shots[1].durationS = 10, r.scenarios[0].shots[2].durationS = 10)), false, "outside 6–20s"],
  ["scenarios: an eight-word super refused", mutateScen((r) => (r.scenarios[0].shots[2].super = "one two three four five six seven eight")), false, "super is 8 words"],
  ["scenarios: a super whose hold outruns its shot refused", mutateScen((r) => (r.scenarios[0].shots[0].super = "Dry every single ride")), false, "needs 2.8s on screen"],
  ["scenarios: a duration in the motion refused", mutateScen((r) => (r.scenarios[0].shots[1].motion = "slow push in over 3s; glossy studio product film")), false, "states a duration"],
  ["scenarios: 'seconds' in the motion refused", mutateScen((r) => (r.scenarios[0].shots[1].motion = "slow push in for five seconds; glossy studio product film")), false, "states a duration"],
  ["scenarios: a negation in the motion refused", mutateScen((r) => (r.scenarios[0].shots[1].motion = "no camera movement; glossy studio product film")), false, "negation"],
  ["scenarios: a 26-word motion refused", mutateScen((r) => (r.scenarios[0].shots[1].motion = `${"slowly ".repeat(22)}glossy studio product film`)), false, "motion is 26 words"],
  ["scenarios: a motion without the medium phrase refused", mutateScen((r) => (r.scenarios[0].shots[1].motion = "slow push in; the rider glances up")), false, "medium phrase"],
  ["scenarios: 'and then' linking refused", mutateScen((r) => ((r.scenarios[0].shots[1] as { link: string }).link = "and then")), false, "and then"],
  ["scenarios: shot 1 not the hook refused", mutateScen((r) => (r.scenarios[0].shots[0].parts = ["truth"])), false, "shot 1 is not the hook"],
  ["scenarios: no brand cue in the opening refused", mutateScen((r) => (r.scenarios[0].shots[0].brandCue = false)), false, "brand or product cue"],
  ["scenarios: a 30s spot passes with all six parts", mutateScen((r) => {
    for (const sc of r.scenarios)
      sc.shots = [
        shot({ parts: ["hook", "set-up"], link: null, brandCue: true, durationS: 4 }),
        shot({ parts: ["truth"], link: "but", durationS: 8 }),
        shot({ parts: ["turn"], link: "therefore", durationS: 8 }),
        shot({ parts: ["payoff"], link: "therefore", durationS: 8 }),
      ];
  }, { ...scenReq, template: "ad-spot-30" }), true],
  ["scenarios: 30s without a turn refused", mutateScen((r) => {
    for (const sc of r.scenarios)
      sc.shots = [
        shot({ parts: ["hook", "set-up"], link: null, brandCue: true, durationS: 6 }),
        shot({ parts: ["truth"], link: "but", durationS: 10 }),
        shot({ parts: ["payoff"], link: "therefore", durationS: 10 }),
      ];
  }, { ...scenReq, template: "ad-spot-30" }), false, "no shot carries the turn"],
  ["scenarios: 30s with the turn merged into the payoff refused", mutateScen((r) => {
    for (const sc of r.scenarios)
      sc.shots = [
        shot({ parts: ["hook", "set-up"], link: null, brandCue: true, durationS: 6 }),
        shot({ parts: ["truth"], link: "but", durationS: 10 }),
        shot({ parts: ["turn", "payoff"], link: "therefore", durationS: 10 }),
      ];
  }, { ...scenReq, template: "ad-spot-30" }), false, "merged into the payoff"],
];

let passed = 0;
for (const [name, run, shouldPass, expect] of cases) {
  let ok: boolean;
  let why = "";
  try {
    run();
    ok = true;
  } catch (e) {
    ok = false;
    why = e instanceof AdConceptError ? e.findings.join("; ") : e instanceof Error ? e.message : String(e);
  }
  // A refusal must be the RIGHT refusal: the finding the case was written for.
  if (ok === shouldPass && (ok || !expect || why.includes(expect))) passed++;
  else if (ok === shouldPass) failures.push(`case "${name}": refused, but not for "${expect}" — ${why.slice(0, 200)}`);
  else failures.push(`case "${name}": expected ${shouldPass ? "pass" : "refuse"}, got ${ok ? "pass" : `refuse (${why.slice(0, 160)})`}`);
}

// The stamps the validator owns, checked on a passing round.
{
  const sc = parseScenarios(goodScenarios(), scenReq);
  if (sc.some((s) => s.ideaId !== idea.id)) failures.push("scenarios: ideaId is not stamped from the request");
  if (sc.some((s) => s.endCard.cta !== brief.cta)) failures.push("scenarios: the end card's CTA is not the brief's");
  if (new Set(sc.map((s) => s.id)).size !== sc.length) failures.push("scenarios: scenario ids are not unique");
  const ids = parseIdeas(goodIdeas(), ideasReq);
  if (ids.some((i) => i.truth !== goodIdeas().truth)) failures.push("ideas: the round's truth is not stamped on every idea");
  if (ids.some((i) => !i.gateNotes || i.gateNotes.length !== 5)) failures.push("ideas: gate verdicts are not kept in words");
}

if (failures.length) {
  console.error(`ads-prompts regression FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(`ads-prompts regression OK — ${pins} rule pins across ${I} and ${S} (${DIR}), ${passed}/${cases.length} validator cases.`);
