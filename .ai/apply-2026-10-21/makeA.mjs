// Arm A = arm B with the per-slot mechanism assignment removed. One variable.
import { readFileSync, writeFileSync } from "node:fs";
const sub = (s, from, to) => {
  const re = new RegExp(from.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"));
  if (!re.test(s)) throw new Error("no hit: " + from.slice(0, 60));
  return s.replace(re, () => to);
};
const cut = (s, startMark, endMark, to) => {
  const a = s.indexOf(startMark), b = s.indexOf(endMark, a + 1);
  if (a < 0 || b < 0) throw new Error("no span: " + startMark);
  return s.slice(0, a) + to + s.slice(b);
};
const STAGE2 = `## Stage 2 — six slots, no mechanism assigned

THE RUN gives each of the six slots a seed but NO creative angle. Write whatever idea the seed and the
truth lead you to; nothing tells you which mechanism to use. **After you expand an idea, classify its
actual mechanism into \`classifiedAs\`** using the closest word the schema allows, and copy the same
word into \`angle\`. The classification is a label after the fact; it never steers the idea.

`;
for (const seed of [11, 29]) {
  let s = readFileSync(new URL(`./B-${seed}.md`, import.meta.url), "utf8");
  s = sub(s, "each from a\ndifferent creative angle", "each a\ndifferent idea");
  s = cut(s, "<!-- standard: ad-concept-ideation/angle-template-seeding -->", "## Tone filters", STAGE2);
  s = cut(s, "## Tone filters angles", "## Stage 3", "## Tone is a constraint\n\nThe brief's tone filters ideas; it never chooses the idea. `exclusion` is null.\n\n");
  s = sub(s, "The spread of the set comes from the angles, the seeds and these stages.", "The spread of the set comes from the seeds and these stages.");
  s = sub(s, "For every `demo` idea, and any idea whose\npicture", "For any idea whose\npicture");
  s = sub(s, "`angle` — the slot's angle (or the reserve, if you\n  excluded one). `classifiedAs` — the mechanism you actually wrote.", "`angle` and `classifiedAs` — the mechanism you actually\n  wrote, the same word in both.");
  s = sub(s, "## THE SLOTS — angles assigned before generation", "## THE SLOTS — seeds only");
  s = s.replace(/^(\d)\. \*\*[a-z-]+\*\* — start/gm, "$1. Start");
  s = cut(s, "Reserve angle:", "## THE DELIVERABLE", "");
  if (/\*\*(analogy|twist|exaggeration|demo|emotional|absurd)\*\* —/.test(s)) throw new Error("angle left in " + seed);
  writeFileSync(new URL(`./A-${seed}.md`, import.meta.url), s);
}
console.log("A arms written");
