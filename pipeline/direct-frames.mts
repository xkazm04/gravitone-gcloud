// ART-DIRECT THE CUT, then measure whether it beat the template.
//
// Run:  npx tsx pipeline/direct-frames.mts                 # direct only
//       npx tsx pipeline/direct-frames.mts --render 5      # + render a sample
//       npx tsx pipeline/direct-frames.mts --render 5 --baseline  # + the same
//                                                            beats templated,
//                                                            for comparison
//
// The question this answers is the one that matters for Step 3: does letting a
// model read the whole script and compose each frame produce something better
// than a lookup table keyed on the beat's rhetorical kind?
//
// It is measured, not asserted. Both arms render the same beats in the same
// style through the same vendor, and a vision model grades every plate against
// its own brief. The template arm is the control — without it, "the authored
// ones look better" is a sentence with no evidence under it.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function loadEnv(file = ".env.local") {
  const p = path.join(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const { runClaude } = await import("../lib/claudeCli");
const { RENDERS } = await import("../app/_phases/script/renders");
const { FACTS } = await import("../app/_phases/_shared/notebook/facts");
const { framesFromRender, subjectFor } = await import("../app/_phases/frames/frames");
const { parseSceneSpecs, SCENE_SCHEMA } = await import("../app/_phases/frames/sceneSpec");
const { PRESETS } = await import("../app/library/presets");
const { compilePrompt, NEGATIVE_PROMPT } = await import("../lib/stylePrompt");
const { compileFormatBrief } = await import("../lib/formatBrief");
const { generate, recognize } = await import("../lib/imaging/router");
const { ImagingError } = await import("../lib/imaging/errors");

const argv = process.argv.slice(2);
const arg = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const renderN = Number(arg("--render") ?? 0);
const withBaseline = argv.includes("--baseline");

const outDir = path.join(process.cwd(), "frames-direction-out");
mkdirSync(outDir, { recursive: true });

const render = RENDERS[0];
const frames = framesFromRender(render);
const style = PRESETS[0].block; // Signal Ledger — the trial grid's strongest

/* ── 1. direct ────────────────────────────────────────────────────────────── */

console.log(`\ndirecting "${render.title}" · ${frames.length} beats · style ${PRESETS[0].name}\n`);

const system = readFileSync(path.join(process.cwd(), "pipeline", "FRAMES-SCENE-PROMPT.md"), "utf8");
const prompt = [
  system,
  "",
  "---",
  "",
  "# THE RUN",
  "",
  "Return ONE JSON object and nothing else — no prose before or after, no code fence.",
  "It must satisfy this schema:",
  JSON.stringify(SCENE_SCHEMA, null, 2),
  "",
  // The probe has no project record, so it states the format the RENDER declares
  // (`ScriptRender.template`/`durationS`). That is a different authority from the
  // app's — /api/frames is given the project's — and it is the honest one here:
  // this arm directs a fixture script, and the fixture is what says which format
  // it was written as. Left out entirely, the block would read "NOT STATED" and
  // the probe would be measuring a brief the app never sends.
  compileFormatBrief(render.template, render.durationS),
  "",
  `## THE SCRIPT — ${render.title}`,
  JSON.stringify(
    frames.map((f) => ({ at: f.at, kind: f.kind, label: f.title, text: f.line, device: f.device })),
    null,
    2,
  ),
  "",
  "## THE NOTEBOOK — every fact you may cite",
  JSON.stringify(FACTS.map((f) => ({ id: f.id, claim: f.claim, confidence: f.confidence, loadBearing: f.loadBearing })), null, 2),
  "",
  "## THE LOCKED VISUAL STYLE",
  JSON.stringify(style, null, 2),
].join("\n");

const t0 = Date.now();
const run = await runClaude(prompt, 900_000);
console.log(`engine · ${((Date.now() - t0) / 1000).toFixed(0)}s${run.costUsd ? ` · $${run.costUsd.toFixed(3)}` : ""}`);

let specs;
try {
  specs = parseSceneSpecs(run.text, frames, new Set(FACTS.map((f) => f.id)));
} catch (e) {
  console.error(`\nREJECTED — ${e instanceof Error ? e.message : String(e)}`);
  writeFileSync(path.join(outDir, "raw-rejected.txt"), run.text);
  process.exit(1);
}

writeFileSync(path.join(outDir, "scenes.json"), JSON.stringify({ renderId: render.id, specs }, null, 2));
console.log(`accepted · ${specs.length} scenes → frames-direction-out/scenes.json\n`);

// What the direction actually did, as text — readable without rendering a pixel.
for (const s of specs.slice(0, 4)) {
  console.log(`${s.beatAt}  ${s.subject.slice(0, 96)}…`);
  console.log(`       why · ${s.rationale.slice(0, 96)}`);
}

/* ── how varied is it? the anti-PowerPoint measure ───────────────────────── */
// A template scores ~1.0 here by construction: same kind, same words. The whole
// claim of authoring is that this number is LOW.
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
let pairs = 0;
let overlap = 0;
for (let i = 0; i < specs.length; i++)
  for (let j = i + 1; j < specs.length; j++) {
    const a = words(specs[i].subject);
    const b = words(specs[j].subject);
    const inter = [...a].filter((w) => b.has(w)).length;
    overlap += inter / Math.max(1, Math.min(a.size, b.size));
    pairs++;
  }
const authoredSim = overlap / pairs;

let templateSim = 0;
{
  const t = frames.map((f) => subjectFor(f));
  let o = 0;
  let n = 0;
  for (let i = 0; i < t.length; i++)
    for (let j = i + 1; j < t.length; j++) {
      const a = words(t[i]);
      const b = words(t[j]);
      o += [...a].filter((w) => b.has(w)).length / Math.max(1, Math.min(a.size, b.size));
      n++;
    }
  templateSim = o / n;
}
console.log(
  `\nsubject similarity across the cut · authored ${(authoredSim * 100).toFixed(0)}% vs template ${(templateSim * 100).toFixed(0)}%` +
    `  (lower is more varied — a deck scores high)`,
);

const figures = specs.reduce((n, s) => n + s.texts.filter((t) => t.role === "figure").length, 0);
const cited = new Set(specs.flatMap((s) => s.texts.map((t) => t.factId).filter(Boolean)));
console.log(`figures on screen · ${figures}, all fact-bound (the parser rejects any that are not)`);
console.log(`distinct facts cited · ${cited.size} of ${FACTS.length}`);

if (!renderN) process.exit(0);

/* ── 2. render a sample, and grade it ─────────────────────────────────────── */

const GRADE = {
  type: "object",
  required: ["hasText", "matchesBrief", "clutter", "description"],
  properties: {
    hasText: { type: "boolean", description: "any letters, numbers or glyph-like marks" },
    matchesBrief: { type: "boolean", description: "does the image show what the brief described" },
    clutter: { type: "integer", description: "1 clean at thumbnail size, 5 illegible" },
    description: { type: "string" },
  },
} as const;

interface Grade { hasText?: boolean; matchesBrief?: boolean; clutter?: number }

async function renderAndGrade(tag: string, at: string, subject: string): Promise<Grade | null> {
  try {
    const gen = await generate({ prompt: compilePrompt(style, subject), negativePrompt: NEGATIVE_PROMPT, aspect: "16:9", count: 1 });
    const img = gen.images[0];
    if (!img) throw new Error("no image");
    const file = path.join(outDir, `${tag}-${at.replace(":", "")}.jpg`);
    writeFileSync(file, Buffer.from(img.base64, "base64"));
    let grade: Grade = {};
    try {
      const r = await recognize({
        image: img,
        instruction: `This image was generated from the following brief:\n\n"${subject}"\n\nGrade it against that brief.`,
        schema: GRADE as unknown as Record<string, unknown>,
      });
      grade = (r.json ?? {}) as typeof grade;
    } catch {
      /* ungraded — reported as such */
    }
    console.log(
      `  ${tag} ${at} · text=${grade.hasText ?? "?"} onBrief=${grade.matchesBrief ?? "?"} clutter=${grade.clutter ?? "?"}`,
    );
    return grade;
  } catch (e) {
    console.log(`  ${tag} ${at} · FAILED ${e instanceof ImagingError ? e.kind : ""}`);
    return null;
  }
}

// Spread the sample across the cut rather than taking the first N — the opening
// beats are the easiest ones, and a sample of easy cases proves nothing.
const step = Math.max(1, Math.floor(specs.length / renderN));
const picked = specs.filter((_, i) => i % step === 0).slice(0, renderN);

console.log(`\nrendering ${picked.length} authored frames…`);
const authored: (Grade | null)[] = [];
for (const s of picked) authored.push(await renderAndGrade("authored", s.beatAt, s.subject));

let baseline: (Grade | null)[] = [];
if (withBaseline) {
  console.log(`\nrendering the same ${picked.length} beats from the TEMPLATE…`);
  baseline = [];
  for (const s of picked) {
    const f = frames.find((x) => x.at === s.beatAt)!;
    baseline.push(await renderAndGrade("template", s.beatAt, subjectFor(f)));
  }
}

const score = (rows: (Grade | null)[]) => {
  const g = rows.filter(Boolean) as Grade[];
  if (!g.length) return "no graded frames";
  const ok = g.filter((x) => x.matchesBrief).length;
  const tx = g.filter((x) => x.hasText).length;
  const cl = g.reduce((t, x) => t + (x.clutter ?? 0), 0) / g.length;
  return `onBrief ${ok}/${g.length} · text ${tx}/${g.length} · clutter ${cl.toFixed(1)}`;
};

console.log(`\nauthored · ${score(authored)}`);
if (withBaseline) console.log(`template · ${score(baseline)}`);
console.log(`\nplates → ${outDir}`);
