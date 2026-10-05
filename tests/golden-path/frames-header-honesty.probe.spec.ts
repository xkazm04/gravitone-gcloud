// LANE — THE FRAMES HEADER DOES NOT STATE A FALSE ZERO (static ratchet).
// A promotional cut has frames = [] by construction; the header must not print
// "0 frames derived", and engineLabel carries work facts only.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const dir = join(process.cwd(), "app/_phases/frames");
const read = (f: string) => stripComments(readFileSync(join(dir, f), "utf8"));

test("frame count is only drawn for a cut that has a frame layer", () => {
  const src = read("FramesStep.tsx");
  expect(src.length).toBeGreaterThan(0);
  expect(src).toMatch(/!promotionalCut\s*&&[\s\S]{0,200}ctl\.frames\.length/);
});

test("engineLabel strings carry no app-subject clause", () => {
  const src = read("frames.ts");
  expect(src.length).toBeGreaterThan(0);
  expect(src).not.toContain("see the shots view");
  expect(src).not.toContain("Step 2 composes");
});
