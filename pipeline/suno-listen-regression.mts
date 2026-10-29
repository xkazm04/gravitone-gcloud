// THE SUNO-LISTEN REGRESSION - the listener's prompt cannot drift from the door that judges its answers.
//
//   npx tsx pipeline/suno-listen-regression.mts
//   npx tsx pipeline/suno-listen-regression.mts --dir <folder holding a copy of SUNO-LISTEN-PROMPT.md>
//
// OFFLINE: no model is called. Four halves, run over the prompt file AND a CRLF copy of it (a checkout
// under core.autocrlf hands the file over with \r\n, and a previous spark shipped an LF-only parser);
// exit 1 if any fails:
//
//   1. THE PROMPT'S SECTIONS AND RULES. Every `## ` heading the read depends on, the duration slot, the
//      answer rule, the never-name rule, the independent-estimate rule, the "uncertain" rule, and each
//      prominence word read OFF THE SCHEMA (@gt/domain/audio.suno LISTEN_PROMINENCE).
//   2. THE SCHEMA ROUND TRIP. The schema the router is handed (lib/sound/suno/listenPrompt.ts
//      LISTEN_SCHEMA) against the door's own (studioListenSchema, written out by zod): the same answer
//      keys, the same required keys, the same caps, the same enum - at every depth. A door that grew a
//      field the vendor is never asked for refuses every answer; a cap the vendor is told and the door
//      is not lets an answer through that the door then refuses.
//   3. THE WORKED EXAMPLE, through the same door a model's answer passes (readOf), and back: the read
//      it makes, serialised and re-parsed, is the same read.
//   4. CASES. Recorded answers through readOf - a bad prominence, an answer setting standIn, a missing
//      vocals, a section past the take - each refused naming its path; a good one passes unchanged.
//
// `--dir` exists so the pins can be proven to bite: copy the prompt somewhere, delete one heading
// from the copy, and run against it - never against the real file.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { LISTEN_PROMINENCE } from "../packages/domain/src/audio.suno.ts";
import { parseStudioListen, studioListenSchema } from "../packages/domain/src/audio.suno.schema.ts";
import { ANSWER_KEYS, LISTEN_DOOR, LISTEN_MODEL, LISTEN_SCHEMA, listenPrompt, promptText, readOf } from "../lib/sound/suno/listenPrompt.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirArg = process.argv.indexOf("--dir");
const DIR = dirArg > 0 && process.argv[dirArg + 1] ? path.resolve(process.argv[dirArg + 1] ?? "") : path.join(ROOT, "pipeline");
const P = "SUNO-LISTEN-PROMPT.md";

const failures: string[] = [];

const HEADINGS = ["Never name an artist or a song", "Tempo and key", "Genre and mood", "Vocals", "Instruments", "Sections", "When you are not sure", "Answer"] as const;

/* ── 1. the prompt's sections and rules ───────────────────────────────────── */

function checkPrompt(label: string, sent: string): unknown {
  const flat = sent.replace(/\s+/g, " ");
  if (/\r/.test(sent)) failures.push(`${label}: the prompt as sent still carries a carriage return`);
  if (/<!--/.test(sent)) failures.push(`${label}: a comment survived into the prompt as sent`);
  const heads = new Set([...sent.matchAll(/^## (.+)$/gm)].map((m) => (m[1] ?? "").trim()));
  for (const h of HEADINGS) if (!heads.has(h)) failures.push(`${label}: the section "## ${h}" is gone`);
  const rule = (what: string, re: RegExp): void => {
    if (!re.test(flat)) failures.push(`${label}: ${what} is gone (${re})`);
  };
  rule("the duration slot", /\{\{DURATION_S\}\}/);
  rule("the answer rule", /Answer with ONE JSON object and nothing else/);
  rule("the never-name rule", /Do not name any artist, band, producer, composer, label or song/);
  rule("the independent estimate", /Make your own estimate from the audio/);
  rule("the uncertain rule", /Say "uncertain" rather than invent/);
  rule("the timestamp rule", /times in seconds from the start of the recording/);
  rule("the vocals rule", /`vocals\.heard` is true only when/);
  rule("the keys code sets", /Do not add `model`, `at`/);
  for (const p of LISTEN_PROMINENCE) rule(`the prominence word \`${p}\``, new RegExp(`\`${p}\``));
  const filled = listenPrompt(sent, 150);
  if (filled.includes("{{")) failures.push(`${label}: a slot is left unfilled after listenPrompt`);

  const blocks = [...sent.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1] ?? "");
  if (blocks.length !== 1) {
    failures.push(`${label}: ${blocks.length} worked examples; the prompt carries exactly one`);
    return undefined;
  }
  try {
    return JSON.parse(blocks[0] ?? "");
  } catch (e) {
    failures.push(`${label}: the worked example is not JSON: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

/* ── 2. the schema round trip ─────────────────────────────────────────────── */

type J = Record<string, unknown>;
const door = z.toJSONSchema(studioListenSchema, { io: "input" }) as J;
const props = (s: J): J => (s.properties ?? {}) as J;
const req = (s: J): string[] => [...((s.required as string[] | undefined) ?? [])].sort();

/** Compare the router's schema to the door's at one node: keys, required, caps, enums, recursing. */
function compare(at: string, mine: J, theirs: J): void {
  for (const k of ["maxItems", "maxLength", "minimum", "maximum"] as const) {
    // Gemini's responseSchema subset has no exclusiveMinimum: the vendor is told `minimum` at the door's
    // exclusive bound, and readOf's start-before-end check is what holds endS > 0 (startS >= 0).
    if (k === "minimum" && mine[k] !== undefined && mine[k] === theirs.exclusiveMinimum) continue;
    if (mine[k] !== undefined && mine[k] !== theirs[k]) failures.push(`schema ${at}: ${k} is ${String(mine[k])} for the vendor, ${String(theirs[k])} at the door`);
    if (k !== "minimum" && mine[k] === undefined && theirs[k] !== undefined) failures.push(`schema ${at}: the door caps ${k} at ${String(theirs[k])}; the vendor is not told`);
  }
  if (theirs.enum !== undefined && JSON.stringify(mine.enum) !== JSON.stringify(theirs.enum)) failures.push(`schema ${at}: enum ${JSON.stringify(mine.enum)} for the vendor, ${JSON.stringify(theirs.enum)} at the door`);
  if (mine.type !== theirs.type && !(mine.type === "number" && theirs.type === "number")) failures.push(`schema ${at}: type ${String(mine.type)} for the vendor, ${String(theirs.type)} at the door`);
  if (theirs.type === "object") {
    const mk = Object.keys(props(mine)).sort();
    const tk = Object.keys(props(theirs)).filter((k) => at !== "(root)" || ANSWER_KEYS.includes(k)).sort();
    if (JSON.stringify(mk) !== JSON.stringify(tk)) failures.push(`schema ${at}: keys ${mk.join(",")} for the vendor, ${tk.join(",")} at the door`);
    const tr = req(theirs).filter((k) => at !== "(root)" || ANSWER_KEYS.includes(k));
    if (JSON.stringify(req(mine)) !== JSON.stringify(tr)) failures.push(`schema ${at}: required ${req(mine).join(",")} for the vendor, ${tr.join(",")} at the door`);
    for (const k of mk) if (props(theirs)[k] !== undefined) compare(at === "(root)" ? k : `${at}.${k}`, props(mine)[k] as J, props(theirs)[k] as J);
  }
  if (theirs.type === "array" && mine.items !== undefined && theirs.items !== undefined) compare(`${at}[]`, mine.items as J, theirs.items as J);
}
compare("(root)", LISTEN_SCHEMA, door);

/* ── 3 + 4. the worked example and the cases, through the door ────────────── */

const CTX = { model: LISTEN_MODEL, at: "2026-10-29T10:00:00.000Z", durationS: 150 };

function checkExample(label: string, example: unknown): number {
  if (example === undefined) return 0;
  const r = readOf(example, CTX);
  if (!r.ok) {
    failures.push(`${label}: the worked example is refused by the door: ${r.error.message}`);
    return 0;
  }
  const back = parseStudioListen(JSON.parse(JSON.stringify(r.value)));
  if (!back.ok || JSON.stringify(back.value) !== JSON.stringify(r.value)) failures.push(`${label}: the worked example's read does not survive a JSON round trip`);
  const good = example as J;
  const CASES: readonly (readonly [string, unknown, string | null])[] = [
    ["the worked example", good, null],
    ["a prominence the door does not have", { ...good, instruments: [{ name: "bass", role: "groove", prominence: "loud" }] }, "instruments.0.prominence"],
    ["an answer that sets standIn", { ...good, standIn: true }, "standIn"],
    ["an answer that sets its model", { ...good, model: "someone-else" }, "model"],
    ["no vocals", { ...good, vocals: undefined }, "vocals"],
    ["a stray key", { ...good, artist: "nobody" }, "(root)"],
    ["a section past the take", { ...good, sections: [{ name: "all", startS: 0, endS: 400, says: "everything" }] }, "sections.0.endS"],
    ["a section that ends before it starts", { ...good, sections: [{ name: "all", startS: 30, endS: 10, says: "backwards" }] }, "sections.0.endS"],
    ["prose, not an object", "a synthwave song", "(root)"],
  ];
  for (const [name, answer, path_] of CASES) {
    const v = readOf(answer, CTX);
    if (path_ === null) {
      if (!v.ok) failures.push(`${label} case "${name}": refused (${v.error.message})`);
      continue;
    }
    if (v.ok) failures.push(`${label} case "${name}": passed; the door must refuse it`);
    else if (!v.error.message.startsWith(`${LISTEN_DOOR}: ${path_}`)) failures.push(`${label} case "${name}": the refusal does not name ${path_}: "${v.error.message}"`);
  }
  return CASES.length;
}

/* ── run over the file and a CRLF copy ────────────────────────────────────── */

const at = path.join(DIR, P);
const raw = fs.readFileSync(at, "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suno-listen-regression-"));
const copies = [
  ["LF", raw.replace(/\r\n/g, "\n")],
  ["CRLF", raw.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")],
] as const;
let cases = 0;
const sentBy: string[] = [];
for (const [eol, text] of copies) {
  const copy = path.join(tmp, `${eol}-${P}`);
  fs.writeFileSync(copy, text);
  const sent = await promptText(copy);
  if (!sent.ok) {
    failures.push(`${eol}: ${sent.error.message}`);
    continue;
  }
  sentBy.push(sent.value);
  cases += checkExample(`${P} (${eol})`, checkPrompt(`${P} (${eol})`, sent.value));
}
fs.rmSync(tmp, { recursive: true, force: true });
if (sentBy.length === 2 && sentBy[0] !== sentBy[1]) failures.push(`${P}: the LF and CRLF copies are not sent as the same prompt`);

if (failures.length > 0) {
  console.error(`suno-listen regression FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(`suno-listen regression OK — ${HEADINGS.length} sections and the rules hold in the LF and CRLF copies, the router's schema matches the door's (${ANSWER_KEYS.length} answer keys), the worked example passes the door and round-trips, ${cases} recorded cases hold (offline, no model).`);
