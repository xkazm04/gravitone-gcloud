// LANE — THE KIT DROPZONE NEEDS A WORLD SCOPE WHERE THE STUDIO HAS NONE (static).
//
// `.k-drop` and its glyph paint from `--al-gold`, declared only under
// `[data-world="almanac"|"obsidian"]` (components/ui/tokens.ts). The studio's
// obsidian StudioFrame sets no data-world, so on the music-video Research step
// the frame, plate and hover tint all vanished and only the constraint line
// remained. Every gate was green; only a photograph shows it.
import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

test("MusicVideoResearch mounts its Dropzone inside a data-world scope", () => {
  const src = stripComments(readFileSync("app/_phases/research/MusicVideoResearch.tsx", "utf8"));
  expect(src.length).toBeGreaterThan(0);
  const i = src.indexOf("<Dropzone");
  expect(i).toBeGreaterThan(-1);
  const before = src.slice(0, i);
  const open = before.lastIndexOf('data-world="obsidian"');
  expect(open, "Dropzone has no data-world ancestor").toBeGreaterThan(-1);
  // the scope's element is still open at the Dropzone
  const tail = before.slice(open);
  expect(tail).not.toContain("</div>");
});
