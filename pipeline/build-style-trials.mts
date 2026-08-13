// THE TRIAL MATRIX — every style × every trial, rendered, read back and filed.
//
// Run:  npx tsx pipeline/build-style-trials.mts
//       npx tsx pipeline/build-style-trials.mts --style blueprint
//       npx tsx pipeline/build-style-trials.mts --trial flywheel --force
//
// Six styles against five beats from the repo's own Bitcoin script — thirty
// plates. The point is not thirty pictures; it is the GRID. A style that
// renders a beautiful chart and mangles a five-icon row is not a house style,
// and you only ever learn that by holding one style still and varying the
// problem.
//
// Each plate is then read back by a vision model against the brief that made
// it, so the grid carries a judgement and not just an impression. Those
// judgements are the durable artifact: `public/trials/index.json` is what the
// next session experiments on, and it survives even if the images are
// regenerated.
//
// Resumable — anything already on disk is skipped unless --force.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

function loadEnv(file = ".env.local") {
  const p = path.join(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv();

const { PRESETS } = await import("../app/library/presets");
const { TRIALS } = await import("../app/library/trials");
const { compilePrompt, NEGATIVE_PROMPT, PROMPT_CHAR_LIMIT } = await import("../lib/stylePrompt");
const { generate, recognize } = await import("../lib/imaging/router");
const { leonardoProvider } = await import("../lib/imaging/providers/leonardo");
const { googleProvider } = await import("../lib/imaging/providers/google");
const { ImagingError } = await import("../lib/imaging/errors");

const argv = process.argv.slice(2);
const arg = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const onlyStyle = arg("--style");
const onlyTrial = arg("--trial");
const force = argv.includes("--force");
/** Re-read plates that are on disk but carry no grade. Costs recognition only. */
const regrade = argv.includes("--regrade");
/**
 * Force one vendor instead of following the router.
 *
 * The grid is a comparison instrument, so which model drew a plate has to be a
 * variable rather than an environment side effect — and the whole reason to
 * run it twice is that a failure shared by six style blocks is far more likely
 * to be the MODEL than the prompts.
 */
const provider = (arg("--provider") ?? "leonardo") as "leonardo" | "google";
if (!["leonardo", "google"].includes(provider)) {
  console.error(`unknown --provider "${provider}" (leonardo | google)`);
  process.exit(2);
}
const renderWith =
  provider === "google"
    ? (req: Parameters<typeof generate>[0]) => googleProvider().generate!(req)
    : (req: Parameters<typeof generate>[0]) => leonardoProvider().generate!(req);
/** Kept low on purpose: Leonardo's rate limits are unpublished, and the failure
 *  mode of guessing high is a half-finished grid plus a cooldown. */
const CONCURRENCY = 3;

const outDir = path.join(process.cwd(), "public", "trials");
const indexFile = path.join(outDir, "index.json");

/** What the vision model is asked about every plate. The first field is the
 *  unconditional fail — captions are our vector layer, so a plate carrying
 *  letters is unusable however handsome it is. */
const GRADE_SCHEMA = {
  type: "object",
  required: ["hasText", "drewWhatWasAsked", "dominantColors", "clutter", "description"],
  properties: {
    hasText: { type: "boolean", description: "any letters, numbers or glyph-like marks anywhere" },
    drewWhatWasAsked: { type: "boolean", description: "does the image show what the brief described" },
    dominantColors: { type: "array", items: { type: "string" }, description: "two to four plain lowercase colour names" },
    clutter: { type: "integer", description: "1 = clean and readable at thumbnail size, 5 = busy and illegible" },
    description: { type: "string", description: "one short sentence describing what is actually depicted" },
  },
} as const;

interface Entry {
  styleId: string;
  styleName: string;
  trialId: string;
  trialLabel: string;
  problem: string;
  beat: string;
  file: string;
  provider?: string;
  model?: string;
  costUsd?: number;
  grade?: unknown;
  gradedBy?: string;
  error?: string;
}

const prior: Entry[] = existsSync(indexFile)
  ? (JSON.parse(readFileSync(indexFile, "utf8")).entries ?? [])
  : [];
// Keyed by provider too: the two grids coexist in one index so they can be
// diffed cell for cell, which is the only comparison worth making.
const priorBy = new Map(prior.map((e) => [`${e.provider ?? "leonardo"}/${e.styleId}/${e.trialId}`, e]));

const jobs = PRESETS.filter((p) => !onlyStyle || p.id === onlyStyle).flatMap((preset) =>
  TRIALS.filter((t) => !onlyTrial || t.id === onlyTrial).map((trial) => ({ preset, trial })),
);

console.log(`\nstyle trials → ${outDir}`);
console.log(
  `${PRESETS.length} styles × ${TRIALS.length} trials · ${jobs.length} cells · provider ${provider} · concurrency ${CONCURRENCY}\n`,
);

let made = 0;
let skipped = 0;
let failed = 0;
let spent = 0;
const results: Entry[] = [];

/** Read one plate back against the brief that made it. Never throws — a lost
 *  judgement must not cost the plate. */
async function gradeImage(
  image: { base64: string; mime: string },
  subject: string,
): Promise<{ grade?: unknown; gradedBy?: string }> {
  try {
    const r = await recognize({
      image: image as never,
      instruction:
        `This image was generated from the following brief:\n\n"${subject}"\n\n` +
        "Grade it against that brief. Answer only about what you can actually see.",
      schema: GRADE_SCHEMA as unknown as Record<string, unknown>,
    });
    return { grade: r.json, gradedBy: r.provenance.model };
  } catch (e) {
    return { gradedBy: `ungraded: ${e instanceof ImagingError ? e.kind : "failed"}` };
  }
}

async function runCell({ preset, trial }: (typeof jobs)[number]): Promise<void> {
  const key = `${provider}/${preset.id}/${trial.id}`;
  const rel = `/trials/${provider}/${preset.id}/${trial.id}.jpg`;
  const abs = path.join(outDir, provider, preset.id, `${trial.id}.jpg`);

  const base: Entry = {
    styleId: preset.id,
    styleName: preset.name,
    trialId: trial.id,
    trialLabel: trial.label,
    problem: trial.problem,
    beat: trial.beat,
    file: rel,
    provider,
  };

  if (existsSync(abs) && !force) {
    const had = priorBy.get(key);
    // A grade can fail on its own (vision timeouts are common under
    // concurrency) while the image is perfectly good. Without this branch the
    // only way to recover a lost judgement is to re-render the plate, which
    // pays generation cost to fix a recognition problem.
    if (regrade && !had?.grade) {
      const buf = readFileSync(abs);
      const graded = await gradeImage({ base64: buf.toString("base64"), mime: "image/jpeg" }, trial.subject);
      results.push({ ...(had ?? base), ...graded });
      made++;
      console.log(`GRADE ${key} · ${graded.grade ? "ok" : graded.gradedBy}`);
      return;
    }
    // Otherwise keep the prior grade rather than re-reading an unchanged image.
    results.push(had ?? base);
    skipped++;
    console.log(`SKIP  ${key}`);
    return;
  }

  const prompt = compilePrompt(preset.block, trial.subject);
  if (prompt.length > PROMPT_CHAR_LIMIT) {
    failed++;
    results.push({ ...base, error: `prompt ${prompt.length} chars, over ${PROMPT_CHAR_LIMIT}` });
    console.log(`FAIL  ${key} · prompt too long (${prompt.length})`);
    return;
  }

  try {
    const gen = await renderWith({ prompt, negativePrompt: NEGATIVE_PROMPT, aspect: "16:9", count: 1 });
    const img = gen.images[0];
    if (!img) throw new Error("no image returned");

    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, Buffer.from(img.base64, "base64"));
    spent += gen.provenance.costUsd ?? 0;

    // Read it back against the brief that made it. Failure here must not lose
    // the image — the plate is the expensive artifact, and --regrade exists to
    // pick the judgement up later without paying to render again.
    const { grade, gradedBy } = await gradeImage(img, trial.subject);

    results.push({ ...base, model: gen.provenance.model, costUsd: gen.provenance.costUsd, grade, gradedBy });
    made++;

    const g = grade as { hasText?: boolean; clutter?: number; drewWhatWasAsked?: boolean } | undefined;
    console.log(
      `OK    ${key} · ${Math.round((img.base64.length * 3) / 4 / 1024)}KB` +
        (g ? ` · text=${g.hasText} onBrief=${g.drewWhatWasAsked} clutter=${g.clutter}` : " · ungraded") +
        (gen.provenance.cleanup === "failed" ? " · REMOTE CLEANUP FAILED" : ""),
    );
  } catch (e) {
    failed++;
    results.push({ ...base, error: e instanceof ImagingError ? `[${e.kind}] ${e.message}` : String(e) });
    console.log(`FAIL  ${key}\n         → ${e instanceof ImagingError ? `[${e.kind}] ${e.message}` : String(e)}`);
  }
}

// A small fixed pool rather than Promise.all over thirty: see CONCURRENCY.
const queue = [...jobs];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      await runCell(job);
    }
  }),
);

mkdirSync(outDir, { recursive: true });
writeFileSync(
  indexFile,
  JSON.stringify(
    {
      // No timestamp: this file is committed, and a date that changes on every
      // partial re-run would make the diff noise rather than signal.
      styles: PRESETS.map((p) => ({ id: p.id, name: p.name })),
      trials: TRIALS.map((t) => ({ id: t.id, label: t.label, problem: t.problem, beat: t.beat })),
      // Carry forward every cell this run did not touch — a google run must
      // not wipe the leonardo grid it is being compared against.
      entries: [
        ...prior.filter(
          (e) => !results.some((r) => r.provider === (e.provider ?? "leonardo") && r.styleId === e.styleId && r.trialId === e.trialId),
        ),
        ...results,
      ].sort(
        (a, b) =>
          (a.provider ?? "").localeCompare(b.provider ?? "") ||
          a.styleId.localeCompare(b.styleId) ||
          a.trialId.localeCompare(b.trialId),
      ),
    },
    null,
    2,
  ),
);

console.log(
  `\n${made} rendered · ${skipped} skipped · ${failed} failed` +
    (spent ? ` · $${spent.toFixed(4)}` : "") +
    `\nindex → ${indexFile}`,
);
process.exit(failed ? 1 : 0);
