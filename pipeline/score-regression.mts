// THE SCORE-PROMPT REGRESSION (A1 + A2) - the score prompt cannot drift from the schema and
// catalog that judge its answers.
//
//   npx tsx pipeline/score-regression.mts
//   npx tsx pipeline/score-regression.mts --dir <folder holding a copy of SCORE-PROMPT.md>
//
// OFFLINE: no model is called. Three halves, exit 1 if any fails:
//
//   1. THE SCHEMA & A0 CATALOG, WRITTEN OUT. Every bound and every catalog instrument in
//      @gt/domain/audio.score.ts is read OFF THE SCHEMA/CATALOG and checked in
//      pipeline/SCORE-PROMPT.md.
//   2. THE WORKED EXAMPLES & COMPILED MIDI. Every ```json block in the prompt passes through
//      `scoreOf` (`parseScoreSpec`), and its compiled SMF MIDI is verified to have the exact
//      declared tempo and bar duration to the sample.
//   3. CASES. `proposeScoreSpec` driven by a STUB agent with recorded answers so the door's
//      refusals are pinned: out-of-key note with exact bar & track path, silent MiniGrand VST3,
//      slow/unlicensed Hybrid VST3, out-of-range tempo, duplicate role, stray key, wrong version.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  INSTRUMENT_CATALOG,
  SCORE_KEYS,
  SCORE_ROLES,
  SCORE_SPEC_VERSION,
  STYLE_TEMPLATES,
} from "../packages/domain/src/audio.score.ts";
import {
  SCORE_DOOR,
  SCORE_PROPOSE_TURN,
  draftScoreFromBrief,
  proposeScoreSpec,
  scoreOf,
  scorePrompt,
  stripComments,
  type ReasonFn,
} from "../lib/sound/scorePropose.ts";
import type { TextResult } from "../lib/text/types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirArg = process.argv.indexOf("--dir");
const DIR = dirArg > 0 && process.argv[dirArg + 1] ? path.resolve(process.argv[dirArg + 1] ?? "") : path.join(ROOT, "pipeline");
const P = "SCORE-PROMPT.md";

const failures: string[] = [];
const sent = stripComments(fs.readFileSync(path.join(DIR, P), "utf8"));
const flat = sent.replace(/\s+/g, " ");

/* ── 1. the schema & A0 catalog, written out ──────────────────────────────── */

const listed = new Map<string, string>();
for (const line of sent.split(/\r?\n/)) {
  const m = /^- `([a-z0-9-]+)` - (.*)$/.exec(line.trim());
  if (m?.[1] !== undefined) listed.set(m[1], m[2] ?? "");
}

for (const inst of INSTRUMENT_CATALOG) {
  const line = listed.get(inst.id);
  if (line === undefined) {
    failures.push(`${P}: catalog instrument \`${inst.id}\` is not listed`);
    continue;
  }
  if (!line.includes(`role \`${inst.role}\``)) {
    failures.push(`${P}: \`${inst.id}\` must state role \`${inst.role}\`; line reads "${line}"`);
  }
  if (inst.audition.status === "ready") {
    const wantRange = `pitchRange ${inst.pitchRange[0]}..${inst.pitchRange[1]}`;
    if (!line.includes(`engine \`${inst.engine}\``) || !line.includes(wantRange)) {
      failures.push(`${P}: ready instrument \`${inst.id}\` must state engine \`${inst.engine}\` and ${wantRange}`);
    }
  } else if (!line.includes("refused")) {
    failures.push(`${P}: refused instrument \`${inst.id}\` must state refused on its line`);
  }
}

const rule = (what: string, re: RegExp): void => {
  if (!re.test(flat)) failures.push(`${P}: ${what} is gone (${re})`);
};
rule("the answer rule", /Answer with ONE JSON object and nothing else/);
rule("the version", new RegExp(`\`v\` is always ${SCORE_SPEC_VERSION}`));
rule("the tempo bound", /`tempoBpm` - `40\.\.220`/);
rule("the seed bound", /`seed` - integer `0\.\.2147483647`/);
rule("the controls bounds", /`density` 0\.\.1, `brightness` 0\.\.1, `lift` 0\.\.1, `swing` 0\.\.0\.5, `humanise` 0\.\.1/);
rule("the sections count", /`sections` holds 1\.\.8 sections/);
rule("the tracks count", /`tracks` holds 1\.\.4 tracks/);
rule("the brief slot", /\{\{IDEA\}\}/);
for (const st of STYLE_TEMPLATES) if (!flat.includes(`\`${st}\``)) failures.push(`${P}: missing style \`${st}\``);
for (const k of SCORE_KEYS) if (!flat.includes(`\`${k}\``)) failures.push(`${P}: missing key \`${k}\``);
for (const r of SCORE_ROLES) if (!flat.includes(`\`${r}\``)) failures.push(`${P}: missing role \`${r}\``);

/* ── 2. the worked examples & compiled MIDI verification ──────────────────── */

const blocks = [...sent.matchAll(/([^\n]*)\n+```json\n([\s\S]*?)\n```/g)].map((m) => ({
  said: (m[1] ?? "").toLowerCase(),
  body: m[2] ?? "",
}));
if (blocks.length !== 4) failures.push(`${P}: ${blocks.length} worked examples; expected 4 (one per style template)`);

const parsedExamples: unknown[] = [];
for (const [i, b] of blocks.entries()) {
  let raw: unknown;
  try {
    raw = JSON.parse(b.body);
  } catch (e) {
    failures.push(`${P}: example ${i + 1} ("${b.said}") is not JSON: ${e instanceof Error ? e.message : String(e)}`);
    continue;
  }
  const c = scoreOf(raw);
  if (!c.ok) {
    failures.push(`${P}: example ${i + 1} ("${b.said}") is refused by the door: ${c.error.message}`);
    continue;
  }
  parsedExamples.push(c.value);
}

for (const st of STYLE_TEMPLATES) {
  if (!parsedExamples.some((ex) => (ex as { style?: string }).style === st)) {
    failures.push(`${P}: no worked example for style "${st}"`);
  }
}

if (parsedExamples.length === 4) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-score-reg-"));
  try {
    const specsFile = path.join(tmpDir, "examples.json");
    fs.writeFileSync(specsFile, JSON.stringify(parsedExamples));
    const pyCheck = `
import json, os, sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, "pipeline", "audio"))})
import render_score, score_compiler, score_instruments

with open(${JSON.stringify(specsFile)}, "r", encoding="utf-8") as f:
    specs = json.load(f)

rate = score_instruments.RATE
for idx, spec in enumerate(specs):
    v = score_compiler.validate_spec(spec)
    bpm = float(v["tempoBpm"])
    total_bars = sum(int(s["bars"]) for s in v["sections"])
    expected_body_s = total_bars * (240.0 / bpm)
    expected_samples = int(round(expected_body_s * rate))
    for tr in v["tracks"]:
        events = score_compiler.compile_track_events(v, tr)
        assert len(events) > 0, f"example {idx} role {tr['role']} compiled 0 events"
        mid_path = os.path.join(${JSON.stringify(tmpDir)}, f"ex-{idx}-{tr['role']}.mid")
        score_instruments.write_smf_midi(events, bpm, mid_path)
        parsed_events, parsed_bpm, parsed_dur = render_score.read_smf_midi(mid_path)
        assert abs(parsed_bpm - bpm) < 0.05, f"example {idx} MIDI bpm {parsed_bpm} != {bpm}"
        max_end_samples = int(round(max(e[1] for e in parsed_events) * rate))
        assert 0 < max_end_samples <= expected_samples + int(0.5 * rate), f"example {idx} MIDI sample span {max_end_samples} outside {expected_samples}"
print("OK")
`;
    const pyOut = execFileSync("python", ["-c", pyCheck], { encoding: "utf8" }).trim();
    if (pyOut !== "OK") failures.push(`MIDI compile check returned: ${pyOut}`);
  } catch (e) {
    failures.push(`MIDI compile check failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/* ── 3. stub-agent cases through proposeScoreSpec + draftScoreFromBrief ───── */

const PROV = {
  provider: "claude-cli",
  model: "stub",
  transport: "local-subprocess",
  rung: "preferred",
  turn: SCORE_PROPOSE_TURN,
  schemaEnforcement: "prompted",
  durationMs: 1,
  costBasis: "unpriced",
  promptChars: 0,
} as const;

let asked = 0;
const stub =
  (answer: unknown): ReasonFn =>
  async (req) => {
    asked++;
    if (req.turn !== SCORE_PROPOSE_TURN) failures.push(`turn went out as ${req.turn}, not ${SCORE_PROPOSE_TURN}`);
    if (!req.prompt.includes("calm narrative bed in C major")) failures.push("the brief did not reach the prompt");
    const r: TextResult = { text: JSON.stringify(answer), json: answer, provenance: { ...PROV, promptChars: req.prompt.length } };
    return r;
  };

const GOOD = parsedExamples[0] as Record<string, unknown>;
type Verdict = "ok" | "refused";
const CASES: readonly (readonly [string, unknown, Verdict, string?])[] = [
  ["good: chill-hiphop worked example", GOOD, "ok"],
  [
    "out-of-key note: C#4 (midi 61) in A minor bar 2",
    {
      ...GOOD,
      tracks: (GOOD["tracks"] as Record<string, unknown>[]).map((t) =>
        t["role"] === "lead" ? { ...t, notes: [{ bar: 2, beat: 0, durationBeats: 1, midi: 61, velocity: 90 }] } : t,
      ),
    },
    "refused",
    "tracks.3.notes.0.midi",
  ],
  [
    "refused silent plugin: minigrand-vst3",
    {
      ...GOOD,
      tracks: (GOOD["tracks"] as Record<string, unknown>[]).map((t) => (t["role"] === "chords" ? { ...t, instrument: "minigrand-vst3" } : t)),
    },
    "refused",
    "tracks.2.instrument",
  ],
  [
    "refused slow/unlicensed plugin: hybrid-vst3",
    {
      ...GOOD,
      tracks: (GOOD["tracks"] as Record<string, unknown>[]).map((t) => (t["role"] === "lead" ? { ...t, instrument: "hybrid-vst3" } : t)),
    },
    "refused",
    "tracks.3.instrument",
  ],
  ["out of bounds: tempoBpm 300", { ...GOOD, tempoBpm: 300 }, "refused", "tempoBpm"],
  [
    "out of bounds: swing 0.85",
    { ...GOOD, controls: { ...(GOOD["controls"] as Record<string, unknown>), swing: 0.85 } },
    "refused",
    "controls.swing",
  ],
  [
    "duplicate role track",
    {
      ...GOOD,
      tracks: [
        { role: "drums", instrument: "kit-808-warm" },
        { role: "drums", instrument: "kit-909-pulse" },
      ],
    },
    "refused",
    "tracks.1.role",
  ],
  ["stray key on root", { ...GOOD, extraField: true }, "refused", "(root)"],
  ["wrong version", { ...GOOD, v: 2 }, "refused", "v"],
  ["prose, not an object", "a warm piano bed", "refused", "(root)"],
];

for (const [name, answer, want, at] of CASES) {
  const r = await proposeScoreSpec("calm narrative bed in C major", stub(answer));
  const got: Verdict = r.ok ? "ok" : "refused";
  if (got !== want) failures.push(`case "${name}": expected ${want}, got ${got}${r.ok ? "" : ` (${r.error.message})`}`);
  if (!r.ok && at !== undefined && !r.error.message.startsWith(`${SCORE_DOOR}: ${at}`)) {
    failures.push(`case "${name}": refusal does not name path ${at}: "${r.error.message}"`);
  }
}

const before = asked;
const empty = await proposeScoreSpec("   ", stub(GOOD));
if (empty.ok || asked !== before) failures.push("an empty brief reached the agent instead of being refused before the turn");
if (!scorePrompt(sent, "  calm narrative bed ").includes("calm narrative bed")) failures.push("scorePrompt does not fill {{IDEA}}");

const drafted = draftScoreFromBrief("calm bed, 60 seconds, gentle lift in the middle, C major, felt piano");
if (!drafted.ok || drafted.value.spec.key !== "C major" || drafted.value.spec.style !== "calm-bed") {
  failures.push("draftScoreFromBrief failed to compile plain-English brief");
}

if (failures.length > 0) {
  console.error(`score regression FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(
  `score regression OK — ${INSTRUMENT_CATALOG.length} catalog instruments and all schema bounds match SCORE-PROMPT.md, ${blocks.length} worked examples pass the door and compile to exact-tempo SMF MIDI, ${CASES.length + 2} stub-agent & brief cases hold (offline, no model).`,
);
