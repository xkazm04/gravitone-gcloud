// LANE — EVERY FRAMES CONTROL NAMES WHAT IT EDITS (static ratchet).
// Layer-row buttons name their layer; assembly text/textarea controls carry an
// accessible name.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const dir = join(process.cwd(), "app/_phases/frames");
const read = (f: string) => stripComments(readFileSync(join(dir, f), "utf8"));

test("LayerPanel row controls interpolate the layer name", () => {
  const src = read("LayerPanel.tsx");
  expect(src.length).toBeGreaterThan(0);
  // Each icon button is a one-line opener: `aria-label={...} className=`.
  const row = [...src.matchAll(/aria-label=(\{.*?\})\s+className=/g)]
    .map((m) => m[1])
    .filter((l) => /layer|forward|backward|hide|show|remove/i.test(l));
  expect(row.length).toBe(4);
  for (const l of row) expect(l).toContain("${name}");
  expect(src).not.toMatch(/aria-label="(Bring forward|Send backward|Remove layer)"/);
});

test("every input/textarea/select in FramesAssembly has an accessible name", () => {
  const src = read("FramesAssembly.tsx");
  expect(src.length).toBeGreaterThan(0);
  const tags = [...src.matchAll(/<(input|textarea|select)\b[\s\S]*?(?<!=)>/g)].map((m) => m[0]);
  expect(tags.length).toBeGreaterThanOrEqual(3);
  const bare = tags.filter((t) => !/aria-label(ledby)?=/.test(t));
  expect(bare).toEqual([]);
});
