// LANE — THE EXTRACT WELL NAMES WHAT IT REFUSES. It silently dropped anything that
// was not PNG/JPEG/WebP and everything past the 60th image, and re-choosing a file
// just removed from the preview fired no change event (the input kept its value).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { acceptGallery } from "@/app/foundry/ExtractView";

import { stripComments } from "./_helpers";

const f = (name: string, type: string) => new File([""], name, { type });

test("extract upload: a wrong-type file is refused by name", () => {
  const r = acceptGallery([], [f("a.png", "image/png"), f("b.gif", "image/gif")]);
  expect(r.files.map((x) => x.name)).toEqual(["a.png"]);
  expect(r.refused).toEqual(["b.gif"]);
});

test("extract upload: everything past the cap is refused by name", () => {
  const prev = Array.from({ length: 59 }, (_, i) => f(`p${i}.png`, "image/png"));
  const r = acceptGallery(prev, [f("x.png", "image/png"), f("y.png", "image/png"), f("z.png", "image/png")]);
  expect(r.files).toHaveLength(60);
  expect(r.refused).toEqual(["y.png", "z.png"]);
});

test("extract upload: the input is cleared after a pick and the refusals are drawn", () => {
  const src = stripComments(readFileSync(resolve(__dirname, "../../app/foundry/ExtractView.tsx"), "utf8"));
  expect(src).toMatch(/e\.target\.value\s*=\s*""/);
  expect(src).toContain("refused.join(");
});
