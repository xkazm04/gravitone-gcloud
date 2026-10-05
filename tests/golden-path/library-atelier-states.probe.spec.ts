// LANE — LIBRARY STYLES ATELIER: STATES THE SCREEN MUST NOT FAKE (static ratchet).
//
// One describe block per finding of the 2026-10-05 sweep. Each reads the
// stripped source of the files it covers and fails if the walk read nothing.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const read = (rel: string): string => {
  const src = stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
  expect(src.length, `${rel} read nothing`).toBeGreaterThan(100);
  return src;
};

test.describe("a failed wall read is not an empty wall", () => {
  const src = read("app/library/LibraryAtelier.tsx");

  test("EmptyWall is not drawn under an error", () => {
    const from = src.indexOf("loading ?");
    const to = src.indexOf("<EmptyWall", from);
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    expect(src.slice(from, to)).toMatch(/error/);
  });

  test("the counts effect does not report 0/0 under an error", () => {
    const at = src.indexOf("onCounts?.(");
    expect(at).toBeGreaterThan(-1);
    const start = src.lastIndexOf("useEffect(", at);
    const end = src.indexOf("}, [", at);
    expect(src.slice(start, end)).toMatch(/error/);
  });

  test("the gate chip is not drawn under an error", () => {
    const at = src.indexOf("<GateChip");
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, at - 120), at)).toMatch(/error/);
  });
});

test.describe("a full proof sheet shows why render is disabled", () => {
  test("StyleSheet draws a PipRow against PROOF_CAP", () => {
    const src = read("app/library/parts.tsx");
    expect(src).toContain("<PipRow");
    expect(src).toContain("PROOF_CAP");
  });
});

test.describe("every editable style slot has an accessible name", () => {
  test("SpecEditor textareas carry aria-label", () => {
    const src = read("app/library/SpecEditor.tsx");
    const tags = src.match(/<textarea[\s\S]*?\/>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const t of tags) expect(t).toContain("aria-label");
  });
});

test.describe("locked names one concept", () => {
  test("the reference toggle does not say style-locked", () => {
    expect(read("app/library/Playground.tsx")).not.toMatch(/style-locked/);
  });
});

test.describe("single-select chips announce their state", () => {
  for (const f of ["app/library/LibraryAtelier.tsx", "app/library/Playground.tsx"]) {
    test(`${f} uses aria-pressed`, () => {
      expect(read(f)).toContain("aria-pressed");
    });
  }
});
