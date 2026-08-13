// Builds the preset swatches under public/presets/.
//
// Run:  npx tsx pipeline/build-preset-thumbs.mts
//       npx tsx pipeline/build-preset-thumbs.mts --only blueprint
//       npx tsx pipeline/build-preset-thumbs.mts --force        (redo existing)
//
// These are committed static assets, not runtime generations. Presets are
// fixed, so their swatches are fixed, and paying for eight renders on every
// page load to show the same eight pictures would be absurd.
//
// EVERY SWATCH USES THE SAME SUBJECT (presets.CANON_SUBJECT). That is the whole
// design: the rail then varies by style alone, so the user compares the only
// thing they are actually choosing. Change the subject and you must rebuild all
// eight together, or the grid starts comparing content as well as style.
//
// Skips anything already on disk unless --force, so a re-run after adding one
// preset costs one render rather than eight.

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

const { PRESETS, CANON_SUBJECT } = await import("../app/library/presets");
const { compilePrompt, NEGATIVE_PROMPT, PROMPT_CHAR_LIMIT } = await import("../lib/stylePrompt");
const { generate } = await import("../lib/imaging/router");
const { ImagingError } = await import("../lib/imaging/errors");

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const force = argv.includes("--force");

const outDir = path.join(process.cwd(), "public", "presets");
mkdirSync(outDir, { recursive: true });

let made = 0;
let skipped = 0;
let failed = 0;
let spentUsd = 0;

console.log(`\npreset swatches → ${outDir}`);
console.log(`subject · ${CANON_SUBJECT.slice(0, 78)}…\n`);

for (const preset of PRESETS) {
  if (only && preset.id !== only) continue;

  // Extension is .jpg because that is what both vendors return — Google's
  // Interactions API rejects image/png outright.
  const file = path.join(outDir, `${preset.id}.jpg`);
  if (existsSync(file) && !force) {
    console.log(`SKIP  ${preset.id} · already built (use --force to redo)`);
    skipped++;
    continue;
  }

  const prompt = compilePrompt(preset.block, CANON_SUBJECT);
  if (prompt.length > PROMPT_CHAR_LIMIT) {
    console.log(`FAIL  ${preset.id} · compiles to ${prompt.length} chars, over the ${PROMPT_CHAR_LIMIT} ceiling`);
    failed++;
    continue;
  }

  try {
    const res = await generate({ prompt, negativePrompt: NEGATIVE_PROMPT, aspect: "16:9", count: 1 });
    const img = res.images[0];
    if (!img) throw new Error("no image returned");

    writeFileSync(file, Buffer.from(img.base64, "base64"));
    spentUsd += res.provenance.costUsd ?? 0;
    made++;
    console.log(
      `OK    ${preset.id} · ${res.provenance.provider}/${res.provenance.model} · ` +
        `${Math.round((img.base64.length * 3) / 4 / 1024)}KB` +
        (res.provenance.cleanup === "failed" ? " · REMOTE CLEANUP FAILED" : ""),
    );
  } catch (e) {
    failed++;
    console.log(`FAIL  ${preset.id}\n         → ${e instanceof ImagingError ? `[${e.kind}] ${e.message}` : String(e)}`);
  }
}

console.log(
  `\n${made} built · ${skipped} skipped · ${failed} failed` +
    (spentUsd ? ` · $${spentUsd.toFixed(4)}` : "") +
    (failed ? "\n\nSome swatches are missing; the rail will show broken images for those." : ""),
);
process.exit(failed ? 1 : 0);
