// LANE — AN UNBOUND FIGURE HAS ONE NAME, AND EVERY MARKER SAYS IT (static ratchet).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const dir = join(process.cwd(), "app/_phases/frames");
const FILES = ["parts.tsx", "LayerPanel.tsx", "FramesAssembly.tsx"];
const read = (f: string) => stripComments(readFileSync(join(dir, f), "utf8"));

test("the concept is spelled one way across the step", () => {
  for (const f of FILES) {
    const src = read(f);
    expect(src.length).toBeGreaterThan(0);
    for (const old of ["not bound to a notebook fact", "figure with no fact behind it", "cites no fact"])
      expect(src, `${f} still says "${old}"`).not.toContain(old);
  }
});

test("each unsourced dot is aria-hidden with an sr-only 'unsourced'", () => {
  for (const f of ["parts.tsx", "LayerPanel.tsx"]) {
    const src = read(f);
    const dots = [...src.matchAll(/<span\b[^>]*>\s*●\s*<\/span>/g)].map((m) => m[0]);
    expect(dots.length, f).toBeGreaterThan(0);
    for (const d of dots) {
      expect(d).toContain("aria-hidden");
      expect(d).not.toContain("title=");
    }
    expect(src).toMatch(/<span className="sr-only">unsourced<\/span>/);
  }
});
