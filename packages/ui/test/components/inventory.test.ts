// INVENTORY.md is the map from each @gt/ui shape to its prototype source, and CLAUDE.md sends
// every author there before writing a surface - so a component with no row is a shape the
// next author cannot find, and will hand-roll a second spelling of. The population is walked
// off the filesystem (every `export function Name` in a components/**/*.tsx), never listed.
//
// OWED was the debt this test found on its first run (2026-10-25): 24 components that shipped
// without a row, all written since. It may only shrink - a new component lands with its row, and a row that
// lands for an OWED name takes the name off this list in the same commit.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "components");

const OWED: readonly string[] = [];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tsxFiles(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : []));
}

/** Every exported component name, by its declaration at a line start (a comment line never starts with `export`). */
function exported(): string[] {
  const names = new Set<string>();
  for (const f of tsxFiles(root)) for (const m of readFileSync(f, "utf8").matchAll(/^export function ([A-Z]\w*)/gm)) if (m[1] !== undefined) names.add(m[1]);
  return [...names].sort();
}

const inventory = readFileSync(join(root, "INVENTORY.md"), "utf8");
const listed = (name: string): boolean => new RegExp(`\\b${name}\\b`).test(inventory);

describe("INVENTORY.md covers the kit", () => {
  const all = exported();
  const unlisted = all.filter((n) => !listed(n));

  test("the walk read the kit", () => {
    expect(all.length).toBeGreaterThan(100);
  });

  test("every exported component has a row, except the debt owed before this test", () => {
    expect(unlisted.filter((n) => !OWED.includes(n))).toEqual([]);
  });

  test("the debt only shrinks: an OWED name that now has a row, or no longer exists, leaves OWED", () => {
    expect(OWED.filter((n) => !unlisted.includes(n))).toEqual([]);
  });
});
