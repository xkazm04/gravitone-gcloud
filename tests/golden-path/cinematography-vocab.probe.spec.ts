// The cinematography vocabulary is ONE file (pipeline/vocab/cinematography.json).
// These pin the two things a refactor could silently break on the TypeScript
// side: the foundry's ENUMS are the file's style_image subset, and the gate's
// pure checks really do refuse the failures they exist for.
import { readFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ENUMS, WEIGHTS } from "@/lib/foundry/extract/vocabulary";
import { OBSERVABLE_FIELDS } from "@/lib/foundry/extract/types";
import { VOCAB_VERSION, vocabFields } from "@/lib/vocab/cinematography";

const ROOT = path.resolve(__dirname, "../..");
// Read the JSON straight off disk, not through the module under test.
const doc = JSON.parse(readFileSync(path.join(ROOT, "pipeline/vocab/cinematography.json"), "utf8"));

test("ENUMS deep-equal the vocab file's style_image enums, in order; OBSERVABLE_FIELDS is that subset", () => {
  expect(Object.keys(ENUMS)).toEqual(doc.subsets.style_image);
  for (const f of doc.subsets.style_image) expect(ENUMS[f as keyof typeof ENUMS]).toEqual(doc.fields[f].enum);
  expect([...OBSERVABLE_FIELDS]).toEqual(vocabFields("style_image"));
  expect(WEIGHTS.render_mode).toBe(2);
  expect(WEIGHTS.medium).toBe(2);
  expect(VOCAB_VERSION).toBe(doc.version);
});

test("check-vocab: an enum value with no evidence, and a re-declared enum literal, are both findings", async () => {
  const { checkVocabDoc, findLiterals } = await import("../../pipeline/check-vocab.mjs");
  expect(checkVocabDoc(doc)).toEqual([]);
  const bad = structuredClone(doc);
  bad.fields.shot_size.enum.push("tilted-wide");
  expect(checkVocabDoc(bad).join("\n")).toContain('"tilted-wide" has no evidence entry');
  expect(findLiterals("x.ts", 'const A = ["low-key", "high-key"];', doc).join("\n")).toContain('hand copy of "lighting_key"');
  expect(findLiterals("x.ts", 'const A = ["BUTTON", "A"];', doc)).toEqual([]);
});
