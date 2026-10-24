// THE STRIP-EXPLAINER REGRESSION - the explainer addendum cannot drift from the door that judges
// what the author turn writes under it (spark explainer-real-article-strips WP-B).
//
//   npx tsx pipeline/strip-explainer-regression.mts
//   npx tsx pipeline/strip-explainer-regression.mts --dir <folder holding a copy of STRIP-EXPLAINER-PROMPT.md>
//
// OFFLINE: no model is called. Three halves, exit 1 if any fails:
//
//   1. THE BOUNDS, WRITTEN OUT. The caption's word bounds and the derived step count are read OFF
//      THE CODE (lib/foundry/strips/brief.ts `CAPTION_WORDS`, `DERIVED_STEPS`) and looked for in
//      pipeline/STRIP-EXPLAINER-PROMPT.md, with the file the caption goes to, its one key, and the
//      rules the door enforces (no markdown, nothing pointing at the picture, the lint's refusal).
//      A bound changed in the code and not in the prompt is a turn told one rule and refused by
//      another - every caption redone in the fix round, and nothing else would notice.
//   2. THE WORKED EXAMPLE. Every ```json block in the prompt goes through the caption's door
//      (`captionOf`): an example the door refuses teaches the model to be refused.
//   3. CASES. Fixed answers through the same door - `[name, file text, verdict]` - so its refusals
//      are pinned: too short (the 12-word caption), too long, the bounds themselves, markdown,
//      pointing at the picture, a stray key, no file, not JSON. None is repaired.
//
// `--dir` exists so the pins can be proven to bite: copy the prompt somewhere, change one bound in
// the copy, and run against it - never against the real file.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CAPTION_FILE, CAPTION_WORDS, captionOf, DERIVED_STEPS, stripComments, withAddendum } from "../lib/foundry/strips/brief.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirArg = process.argv.indexOf("--dir");
const DIR = dirArg > 0 && process.argv[dirArg + 1] ? path.resolve(process.argv[dirArg + 1] ?? "") : path.join(ROOT, "pipeline");
const P = "STRIP-EXPLAINER-PROMPT.md";

const failures: string[] = [];
const raw = fs.readFileSync(path.join(DIR, P), "utf8");
const sent = stripComments(raw);
const flat = sent.replace(/\s+/g, " ");

/* ── 1. the bounds, written out ───────────────────────────────────────── */

const rule = (what: string, re: RegExp): void => {
  if (!re.test(flat)) failures.push(`${P}: ${what} is gone (${re})`);
};
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
rule(`the caption's bounds (${CAPTION_WORDS.min} to ${CAPTION_WORDS.max} words, from brief.ts)`, new RegExp(`\\b${CAPTION_WORDS.min} to ${CAPTION_WORDS.max} words\\b`));
rule(`the derived step count (${DERIVED_STEPS.min} to ${DERIVED_STEPS.max}, from brief.ts)`, new RegExp(`\\b${DERIVED_STEPS.min} to ${DERIVED_STEPS.max} causal steps\\b`));
rule(`the caption's file (out/${CAPTION_FILE})`, new RegExp(esc(`\`out/${CAPTION_FILE}\``)));
rule("the caption's one key", /holding exactly one key/);
rule("the third file beside the contract's two", /Besides `out\/strip\.html` and `out\/style\.json`/);
rule("the empty steps, said", /`steps` list is empty on purpose/);
rule("words only from the section", /Words only from the section/);
rule("no markdown", /No markdown/);
rule("nothing pointing at the picture", /points at the picture/);
rule("the lint's refusal", /fails the lint/);
// Every other bound-looking pair in the prompt must be the code's: a stale "25 to 50 words" next
// to the real one would be read as well.
for (const m of flat.matchAll(/\b(\d+) to (\d+) (words|causal steps)\b/g)) {
  const [, a, b, what] = m;
  const want = what === "words" ? CAPTION_WORDS : DERIVED_STEPS;
  if (Number(a) !== want.min || Number(b) !== want.max) failures.push(`${P}: states "${m[0]}", the code's bound is ${want.min} to ${want.max} ${what}`);
}
if (/<!--/.test(sent)) failures.push(`${P}: a comment survives stripComments and would be sent`);

/* ── 2. the worked example ────────────────────────────────────────────── */

const blocks = [...sent.matchAll(/```json\s*\n([\s\S]*?)```/g)].map((m) => m[1] ?? "");
if (blocks.length === 0) failures.push(`${P}: no worked example (a \`\`\`json block) - the turn is told the file's shape in prose only`);
for (const [i, b] of blocks.entries()) {
  const r = captionOf(b);
  if (r.findings.length > 0) failures.push(`${P}: worked example ${i + 1} is refused by the caption's door: ${r.findings.join("; ")}`);
}

/* ── 3. cases through the door ────────────────────────────────────────── */

const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const file = (caption: string): string => JSON.stringify({ caption });
type Verdict = "ok" | "refused";
const CASES: readonly (readonly [string, string | undefined, Verdict, RegExp?])[] = [
  ["a 40-word caption", file(words(40)), "ok"],
  ["the floor, exactly", file(words(CAPTION_WORDS.min)), "ok"],
  ["the ceiling, exactly", file(words(CAPTION_WORDS.max)), "ok"],
  ["too short: twelve words", file(words(12)), "refused", /^caption: 12 words, the bar is 30-60$/],
  ["one under the floor", file(words(CAPTION_WORDS.min - 1)), "refused", /words, the bar is/],
  ["one over the ceiling", file(words(CAPTION_WORDS.max + 1)), "refused", /words, the bar is/],
  ["markdown emphasis", file(`**Gravity** ${words(39)}`), "refused", /markdown/],
  ["a list marker", file(`- ${words(40)}`), "refused", /markdown/],
  ["pointing at the figure", file(`The figure shows ${words(37)}`), "refused", /points at the picture/],
  ["pointing on screen", file(`What you see on screen is ${words(34)}`), "refused", /points at the picture/],
  ["a stray key", JSON.stringify({ caption: words(40), steps: [] }), "refused", /^caption: /],
  ["no file", undefined, "refused", /was not written/],
  ["not JSON", "caption: the water flows", "refused", /^caption: /],
  ["an empty caption", file("   "), "refused", /^caption: /],
];
for (const [name, text, want, re] of CASES) {
  const r = captionOf(text);
  const got: Verdict = r.findings.length === 0 ? "ok" : "refused";
  if (got !== want) failures.push(`case "${name}": expected ${want}, got ${got}${r.findings.length ? ` (${r.findings.join("; ")})` : ""}`);
  if (want === "refused" && re !== undefined && !r.findings.some((f) => re.test(f))) failures.push(`case "${name}": no finding matches ${re}: ${JSON.stringify(r.findings)}`);
  // Never repaired: a caption that passes is the words the turn wrote, whitespace collapsed.
  if (got === "ok" && text !== undefined && r.caption !== (JSON.parse(text) as { caption: string }).caption.trim().replace(/\s+/g, " ")) failures.push(`case "${name}": the caption that passed is not the caption that was written`);
}
const base = "You are a motion designer who writes code.";
if (!withAddendum(base, sent).startsWith(`${base}\n\n`) || !withAddendum(base, sent).endsWith(sent)) failures.push("withAddendum does not append the addendum after the prompt it was given");

if (failures.length > 0) {
  console.error(`strip-explainer regression FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(`strip-explainer regression OK — the caption's ${CAPTION_WORDS.min}-${CAPTION_WORDS.max} words and ${DERIVED_STEPS.min}-${DERIVED_STEPS.max} steps match the code, ${blocks.length} worked example(s) pass the door, ${CASES.length} door cases hold (offline, no model).`);
