// THE TYPE-SCALE GUARD — nothing below the readable floor.
//
// The scale is two tokens (globals.css @theme): `text-content` (1rem) for
// anything the user reads, `text-label` (0.875rem) for secondary short
// labels. This check exists because the drift it guards against was measured,
// not imagined: on 2026-08-28 the app held 631 arbitrary sizes between 8 and
// 13px across 81 files, and every one of them had once looked reasonable in
// its own diff. A floor that is not enforced is a suggestion.
//
// Fails on, in app/**/*.tsx and components/**/*.tsx:
//   · text-xs, or any arbitrary text-[Npx] with N < 14   (className floor)
//   · an inline style fontSize below 14px / 0.875rem      (global-error.tsx
//     brings its own styles by design, so it is checked too, not exempted)
//
// Arbitrary sizes ≥14px pass — they are legible — but prefer the tokens:
// a named size is a decision the next reader can see.

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

const CLASS_VIOLATION = /\btext-xs\b|\btext-\[(?:[0-9]|1[0-3])px\]/;
const INLINE_PX = /fontSize:\s*["'](\d+(?:\.\d+)?)px["']/g;
const INLINE_REM = /fontSize:\s*["']((?:0?\.\d+))rem["']/g;

const findings = [];
for (const dir of ["app", "components"]) {
  for (const file of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, file).replaceAll("\\", "/");
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const m = line.match(CLASS_VIOLATION);
      if (m) findings.push(`${rel}:${i + 1} — ${m[0]} (floor is text-label, 0.875rem)`);
      for (const px of line.matchAll(INLINE_PX)) {
        if (Number(px[1]) < 14) findings.push(`${rel}:${i + 1} — inline fontSize ${px[1]}px (floor is 14px)`);
      }
      for (const rem of line.matchAll(INLINE_REM)) {
        if (Number(rem[1]) < 0.875) findings.push(`${rel}:${i + 1} — inline fontSize ${rem[1]}rem (floor is 0.875rem)`);
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
console.log("type scale OK — nothing below text-label (0.875rem) in app/ or components/.");
