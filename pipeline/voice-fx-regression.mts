// THE VOICE-FX REGRESSION - the chain prompt cannot drift from the schema that judges its answers.
//
//   npx tsx pipeline/voice-fx-regression.mts
//   npx tsx pipeline/voice-fx-regression.mts --dir <folder holding a copy of VOICE-FX-PROMPT.md>
//
// OFFLINE: no model is called. Three halves, exit 1 if any fails:
//
//   1. THE SCHEMA, WRITTEN OUT. Every stage kind @gt/domain/audio.fx.ts `fxStageSchema` declares,
//      and every parameter's bound, read OFF THE SCHEMA (never copied into this file) and looked
//      for on that kind's line in pipeline/VOICE-FX-PROMPT.md; a kind the prompt lists that the
//      schema does not is a failure too, and so is a missing stage count, version or answer rule.
//      A schema change that is not made in the prompt is a model told one contract and judged by
//      another - every answer refused at the door, and nothing else would notice.
//   2. THE WORKED EXAMPLES. Every ```json block in the prompt goes through the same door a model's
//      answer does (lib/sound/voiceFx/propose.ts `chainOf`), and the eight characters the brief
//      names each have one: an example the door refuses teaches the model to be refused.
//   3. CASES. `proposeChain` driven by a STUB agent with recorded answers - `[name, answer,
//      verdict]` - so the door's refusals are pinned: out of bounds, an unknown kind, a stray key,
//      too many stages, the wrong version. Each refusal must name its path; none is repaired.
//
// `--dir` exists so the pins can be proven to bite: copy the prompt somewhere, delete one bound
// from the copy, and run against it - never against the real file.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { fxStageSchema, FX_CHAIN_VERSION, FX_STAGES_MAX } from "../packages/domain/src/audio.fx.ts";
import { chainOf, FX_DOOR, FX_KINDS, fxPrompt, proposeChain, stripComments, VOICE_FX_TURN, type ReasonFn } from "../lib/sound/voiceFx/propose.ts";
import type { TextResult } from "../lib/text/types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirArg = process.argv.indexOf("--dir");
const DIR = dirArg > 0 && process.argv[dirArg + 1] ? path.resolve(process.argv[dirArg + 1] ?? "") : path.join(ROOT, "pipeline");
const P = "VOICE-FX-PROMPT.md";

const failures: string[] = [];
const sent = stripComments(fs.readFileSync(path.join(DIR, P), "utf8"));
const flat = sent.replace(/\s+/g, " ");

/* ── 1. the schema, written out ───────────────────────────────────────────── */

/** Each stage's parameters and bounds, from the schema itself. */
const STAGES = fxStageSchema.options.map((o) => ({
  kind: o.shape.kind.value,
  params: Object.entries(o.shape)
    .filter(([k]) => k !== "kind")
    .map(([k, v]) => {
      if (!(v instanceof z.ZodNumber) || v.minValue === null || v.maxValue === null) throw new Error(`${o.shape.kind.value}.${k} is not a bounded number - teach this regression the new shape`);
      return { name: k, min: v.minValue, max: v.maxValue };
    }),
}));

/** The prompt's stage list: one `- \`kind\` - ...` line per kind. */
const listed = new Map<string, string>();
for (const line of sent.split(/\r?\n/)) {
  const m = /^- `([a-z]+)` - (.*)$/.exec(line.trim());
  if (m?.[1] !== undefined) listed.set(m[1], m[2] ?? "");
}

let bounds = 0;
for (const s of STAGES) {
  const line = listed.get(s.kind);
  if (line === undefined) {
    failures.push(`${P}: the stage kind \`${s.kind}\` is not listed`);
    continue;
  }
  if (s.params.length === 0 && !/no parameters/.test(line)) failures.push(`${P}: \`${s.kind}\` takes no parameters and its line does not say so`);
  for (const p of s.params) {
    bounds++;
    const want = `\`${p.name}\` ${p.min}..${p.max}`;
    if (!line.includes(want)) failures.push(`${P}: \`${s.kind}\` must state ${want} (the schema's bound); its line reads "${line}"`);
  }
}
for (const kind of listed.keys()) if (!FX_KINDS.includes(kind)) failures.push(`${P}: lists \`${kind}\`, a kind the schema does not have`);

const rule = (what: string, re: RegExp): void => {
  if (!re.test(flat)) failures.push(`${P}: ${what} is gone (${re})`);
};
rule("the answer rule", /Answer with ONE JSON object and nothing else/);
rule("the version", new RegExp(`\`v\` is always ${FX_CHAIN_VERSION}`));
rule("the stage count", new RegExp(`\`stages\` holds 1\\.\\.${FX_STAGES_MAX} stages`));
rule("the closed stage rule", /exactly the parameters listed for that kind - no other keys/);
rule("the description slot", /\{\{DESCRIBE\}\}/);

/* ── 2. the worked examples, through the door ─────────────────────────────── */

const CHARACTERS = ["cavern", "ghost", "broken radio", "robot", "demon", "giant", "tiny", "stadium"] as const;
const blocks = [...sent.matchAll(/([^\n]*)\n+```json\n([\s\S]*?)\n```/g)].map((m) => ({ said: (m[1] ?? "").toLowerCase(), body: m[2] ?? "" }));
if (blocks.length < 6 || blocks.length > 8) failures.push(`${P}: ${blocks.length} worked examples; the prompt carries 6 to 8`);
for (const [i, b] of blocks.entries()) {
  let raw: unknown;
  try {
    raw = JSON.parse(b.body);
  } catch (e) {
    failures.push(`${P}: example ${i + 1} ("${b.said}") is not JSON: ${e instanceof Error ? e.message : String(e)}`);
    continue;
  }
  const c = chainOf(raw);
  if (!c.ok) failures.push(`${P}: example ${i + 1} ("${b.said}") is refused by the door: ${c.error.message}`);
}
for (const who of CHARACTERS) if (!blocks.some((b) => b.said.includes(who))) failures.push(`${P}: no worked example for "${who}"`);

/* ── 3. cases: a stub agent's recorded answers through proposeChain ───────── */

const PROV = { provider: "claude-cli", model: "stub", transport: "local-subprocess", rung: "preferred", turn: VOICE_FX_TURN, schemaEnforcement: "prompted", durationMs: 1, costBasis: "unpriced", promptChars: 0 } as const;
let asked = 0;
const stub =
  (answer: unknown): ReasonFn =>
  async (req) => {
    asked++;
    if (req.turn !== VOICE_FX_TURN) failures.push(`the turn went out as ${req.turn}, not ${VOICE_FX_TURN}`);
    if (!req.prompt.includes("a ghost in a stairwell")) failures.push("the description did not reach the prompt");
    const r: TextResult = { text: JSON.stringify(answer), json: answer, provenance: { ...PROV, promptChars: req.prompt.length } };
    return r;
  };

const GOOD = { v: 1, stages: [{ kind: "pitch", semitones: -2 }, { kind: "reverb", roomSize: 0.95, damping: 0.6, wet: 0.6, dry: 0.4, width: 1 }] };
type Verdict = "ok" | "refused";
const CASES: readonly (readonly [string, unknown, Verdict, string?])[] = [
  ["good: a two-stage ghost", GOOD, "ok"],
  ["out of bounds: pitch two octaves down", { v: 1, stages: [{ kind: "pitch", semitones: -24 }] }, "refused", "stages.0.semitones"],
  ["out of bounds: a wet reverb past 1", { v: 1, stages: [{ kind: "reverb", roomSize: 0.5, damping: 0.5, wet: 1.4, dry: 0.5, width: 1 }] }, "refused", "stages.0.wet"],
  ["out of bounds: feedback that runs away", { v: 1, stages: [{ kind: "delay", delayS: 0.3, feedback: 0.95, mix: 0.3 }] }, "refused", "stages.0.feedback"],
  ["a kind the schema does not have", { v: 1, stages: [{ kind: "flanger", rateHz: 1 }] }, "refused", "stages.0.kind"],
  ["a stray key on a stage", { v: 1, stages: [{ kind: "gain", db: -3, pan: 0.5 }] }, "refused", "stages.0"],
  ["a missing parameter", { v: 1, stages: [{ kind: "chorus", rateHz: 1, depth: 0.5 }] }, "refused", "stages.0.mix"],
  ["too many stages", { v: 1, stages: Array.from({ length: FX_STAGES_MAX + 1 }, () => ({ kind: "gsm" })) }, "refused", "stages"],
  ["no stages", { v: 1, stages: [] }, "refused", "stages"],
  ["the wrong version", { ...GOOD, v: 2 }, "refused", "v"],
  ["prose, not an object", "a spooky reverb", "refused", "(root)"],
];

for (const [name, answer, want, at] of CASES) {
  const r = await proposeChain("a ghost in a stairwell", stub(answer));
  const got: Verdict = r.ok ? "ok" : "refused";
  if (got !== want) failures.push(`case "${name}": expected ${want}, got ${got}${r.ok ? "" : ` (${r.error.message})`}`);
  if (!r.ok && at !== undefined && !r.error.message.startsWith(`${FX_DOOR}: ${at}`)) failures.push(`case "${name}": the refusal does not name its path ${at}: "${r.error.message}"`);
  // Never repaired: what passes is exactly what was answered.
  if (r.ok && JSON.stringify(r.value.chain) !== JSON.stringify(answer)) failures.push(`case "${name}": the chain that passed is not the chain that was answered`);
}
const before = asked;
const empty = await proposeChain("   ", stub(GOOD));
if (empty.ok || asked !== before) failures.push("an empty description reached the agent instead of being refused before the turn");
if (!fxPrompt(sent, "  a ghost in a stairwell ").includes("a ghost in a stairwell")) failures.push("fxPrompt does not fill the description slot");

if (failures.length > 0) {
  console.error(`voice-fx regression FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(`voice-fx regression OK — ${STAGES.length} stage kinds and ${bounds} bounds match the schema, ${blocks.length} worked examples pass the door, ${CASES.length + 1} stub-agent cases hold (offline, no model).`);
