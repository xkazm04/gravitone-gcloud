// The kit's client-routed links share ONE plain-click rule (components/link/plain.ts); Pile,
// SlotRow and the header's NextButton each used to spell it themselves.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { plainClick } from "../../src/components/link/plain.ts";

const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

describe("plainClick", () => {
  test("a primary click with no modifier is plain; a button or any one modifier is not", () => {
    expect(plainClick(click)).toBe(true);
    expect(plainClick({ ...click, button: 1 })).toBe(false);
    expect(plainClick({ ...click, button: 2 })).toBe(false);
    for (const m of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) expect(plainClick({ ...click, [m]: true })).toBe(false);
  });
});

const SRC = join(import.meta.dirname, "../../src");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : n.endsWith(".tsx") || n.endsWith(".ts") ? [join(dir, n)] : []));

describe("one spelling", () => {
  test("no file in @gt/ui spells the predicate but the helper; the three links import it", () => {
    const spelled = walk(SRC).filter((f) => /!\w+\.metaKey\s*&&\s*!\w+\.ctrlKey/.test(readFileSync(f, "utf8")) && !f.replaceAll("\\", "/").endsWith("components/link/plain.ts"));
    expect(spelled).toEqual([]);
    for (const f of ["floor/Pile.tsx", "floor/SlotRow.tsx", "header/HeaderChips.tsx"]) expect(readFileSync(join(SRC, "components", f), "utf8")).toMatch(/from "\.\.\/link\/plain\.ts"/);
  });
});
