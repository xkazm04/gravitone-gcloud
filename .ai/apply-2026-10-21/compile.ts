// Arm B: the shipped ideas prompt, compiled by the shipped assembler at two seeds.
// Run from the repo root: npx tsx .ai/apply-2026-10-21/compile.ts
// Then `node .ai/apply-2026-10-21/makeA.mjs` derives arm A (no per-slot angle).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ideasPrompt } from "../../lib/ads/concepts";

const here = path.join(process.cwd(), ".ai", "apply-2026-10-21");
// The seeded ad project's brief (app/(studio)/projects/[id]/_part/fixtureAds.ts RAINSHELL),
// inlined because that module imports "server-only".
const RAINSHELL = {
  product: "Rainshell — a packable rain jacket",
  audience: "city cyclists who commute all year",
  proposition: "This jacket keeps you dry in a downpour.",
  tone: "deadpan",
  mustInclude: ["logo on the end card"],
  cta: "Pack one today",
  platform: "vertical feed",
};
const doc = readFileSync("pipeline/ADS-IDEAS-PROMPT.md", "utf8").replace(/\r\n/g, "\n");
const req = { brief: RAINSHELL, template: "ad-social-15" as const, targetS: 15 };
for (const seed of [11, 29]) writeFileSync(path.join(here, `B-${seed}.md`), ideasPrompt(doc, req, seed));
console.log("compiled");
