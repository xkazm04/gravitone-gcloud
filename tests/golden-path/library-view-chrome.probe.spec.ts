// LANE — LIBRARY CHROME RATCHETS (source, no DOM).
//
// Small, mechanical contracts on app/library and app/_library that a gate
// could not see: one name for the filing unit, selection exposed to
// assistive tech, destructive buttons through the shared primitive, and
// failure copy that is announced. Comments are stripped before matching.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

function read(rel: string): string {
  const src = stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
  expect(src.length, `${rel} read nothing`).toBeGreaterThan(0);
  return src;
}

test("the Assets rail calls its filing unit a folder, never a category", () => {
  expect(read("app/library/AssetsBrowser.tsx")).not.toMatch(/categor/i);
});

test("the folder rail and the shelves rail expose which row is selected", () => {
  expect(read("app/library/FolderTree.tsx")).toContain("aria-current");
  expect(read("app/_library/LibraryShelves.tsx")).toContain("aria-pressed");
});

test("destructive library buttons are the shared danger Button, not hand-rolled rose", () => {
  for (const rel of ["app/library/parts.tsx", "app/library/AssetLightbox.tsx"]) {
    const src = read(rel);
    const raw = [...src.matchAll(/<button\b[^>]*>/g)].filter((m) => m[0].includes("bg-rose-400/10"));
    expect(raw.length, `${rel} hand-rolls a rose button`).toBe(0);
    expect(src).toContain('variant="danger"');
  }
});

test("a failed or refused trial render is announced", () => {
  expect(read("app/library/Playground.tsx")).toContain('role="alert"');
});

test("Playground prose is not carried in expression-bound title= (the narration gate cannot see it)", () => {
  const src = read("app/library/Playground.tsx");
  expect(src).not.toMatch(/title=\{/);
  expect(src).toMatch(/import \{[^}]*\bHint\b[^}]*\} from "@\/components\/ui\/signal"/);
});
