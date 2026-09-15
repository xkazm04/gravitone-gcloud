// THE TYPE-SCALE GUARD — nothing below the readable floor.
//
// The scale is two tokens (globals.css @theme): `text-content` (1.125rem) for
// anything the user reads, `text-label` (1rem) for secondary short
// labels. This check exists because the drift it guards against was measured,
// not imagined: on 2026-08-28 the app held 631 arbitrary sizes between 8 and
// 13px across 81 files, and every one of them had once looked reasonable in
// its own diff. A floor that is not enforced is a suggestion.
//
// THE FLOOR MOVED 14px → 16px on 2026-09-08, with the scale itself: the whole
// app read undersized, so both rungs went up 2px and this number is the label
// rung, by definition. It is derived from ONE constant below — if the scale
// moves again, move FLOOR_PX and nothing else here.
//
// Fails on, in app/**/*.tsx and components/**/*.tsx:
//   · text-xs, or any arbitrary text-[Npx] with N < 16   (className floor)
//   · an inline style fontSize below 16px / 1rem          (global-error.tsx
//     brings its own styles by design, so it is checked too, not exempted)
//
// Arbitrary sizes ≥16px pass — they are legible — but prefer the tokens:
// a named size is a decision the next reader can see.
//
// N IS PARSED, NOT PATTERN-MATCHED. The first version of this check spelled the
// class floor as `text-\[(?:[0-9]|1[0-3])px\]`, which cannot see a decimal —
// `text-[12.5px]` sat in app/_phases/script/candidates/CandidatesDuel.tsx from
// the day the floor was introduced and passed every run of this gate. A number
// compared as a number cannot have that blind spot.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith(".tsx")) yield p;
  }
}

const FLOOR_PX = 16;
const FLOOR_REM = FLOOR_PX / 16;

const CLASS_XS = /\btext-xs\b/;
const CLASS_ARBITRARY = /\btext-\[(\d+(?:\.\d+)?)px\]/g;
const INLINE_PX = /fontSize:\s*["'](\d+(?:\.\d+)?)px["']/g;
const INLINE_REM = /fontSize:\s*["'](\d+(?:\.\d+)?)rem["']/g;
const findings = [];
for (const dir of ["app", "components"]) {
  for (const file of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, file).replaceAll("\\", "/");
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const xs = line.match(CLASS_XS);
      if (xs) findings.push(`${rel}:${i + 1} — ${xs[0]} (floor is text-label, ${FLOOR_REM}rem)`);
      for (const cls of line.matchAll(CLASS_ARBITRARY)) {
        if (Number(cls[1]) < FLOOR_PX) findings.push(`${rel}:${i + 1} — ${cls[0]} (floor is text-label, ${FLOOR_PX}px)`);
      }
      for (const px of line.matchAll(INLINE_PX)) {
        if (Number(px[1]) < FLOOR_PX) findings.push(`${rel}:${i + 1} — inline fontSize ${px[1]}px (floor is ${FLOOR_PX}px)`);
      }
      for (const rem of line.matchAll(INLINE_REM)) {
        if (Number(rem[1]) < FLOOR_REM) findings.push(`${rel}:${i + 1} — inline fontSize ${rem[1]}rem (floor is ${FLOOR_REM}rem)`);
      }
    });
  }
}

if (findings.length) {
  console.error(`type-scale check FAILED — ${findings.length} size(s) below the readable floor:`);
  for (const f of findings) console.error("  " + f);
  console.error("Use text-content (readable content) or text-label (secondary short labels) — see app/globals.css.");
  process.exit(1);
}
console.log(`type scale OK — nothing below text-label (${FLOOR_REM}rem) in app/ or components/.`);
