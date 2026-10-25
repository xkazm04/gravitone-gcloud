// The technique axis covers the governing registry subjects: every technique file ai-registry
// holds for sound-effect-generation and music-prompt-composition is a slug the brief can carry,
// and the composer's copy (@gt/ui batch.ts) names the same set as lib/sound/types.ts.
// Skips when ../ai-registry is absent.
import { existsSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { TECHNIQUES } from "@/lib/sound/types.ts";
import { TECHNIQUES as UI_TECHNIQUES } from "../../packages/ui/src/components/audio/batch.ts";

// A worktree's node_modules is a junction into the base checkout, whose sibling is the registry.
const HERE = path.resolve(import.meta.dirname, "../..");
const BASE = path.dirname(realpathSync(path.join(HERE, "node_modules")));
const ROOT = [HERE, BASE].find((r) => existsSync(path.join(r, "../ai-registry"))) ?? HERE;
const REGISTRY = path.resolve(ROOT, "../ai-registry/knowledge/media-generation/audio-generation");
const SUBJECTS = { music: "music-prompt-composition", sfx: "sound-effect-generation" } as const;

describe("TECHNIQUES covers the registry", () => {
  for (const kind of ["music", "sfx"] as const) {
    const dir = path.join(REGISTRY, SUBJECTS[kind], "techniques");
    test.skipIf(!existsSync(dir))(`${kind} names every registry technique`, () => {
      const slugs = readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
      expect(slugs.filter((s) => !TECHNIQUES[kind].includes(s))).toEqual([]);
    });
  }
  test("the composer's rail is the lib's list", () => {
    expect([...UI_TECHNIQUES.music]).toEqual([...TECHNIQUES.music]);
    expect([...UI_TECHNIQUES.sfx]).toEqual([...TECHNIQUES.sfx]);
  });
});
