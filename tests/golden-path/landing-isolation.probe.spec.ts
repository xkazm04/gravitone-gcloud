// LANE - THE LANDING HAS NO PATH TO THE STUDIO (static).
//
// Phase 0.3 exit condition (docs/next/migration-plan.md section 6): the public
// landing, app/page.tsx and everything it imports, never reaches app/_phases,
// app/library, app/_studio or lib/studioDb. The landing is the first page a
// visitor loads; a route to the studio's IndexedDB layer from it means every
// visitor downloads the signed-in app.
//
// The walk follows value imports (type-only ones are erased), re-exports, side-effect imports and dynamic
// import(), resolving the "@/" alias, relative paths and workspace packages
// ("@gt/<pkg>/<module>" to packages/<pkg>/src/<module>.ts). One dynamic edge is
// allowed and named: useAuth loads the eviction owner on demand
// (lib/useAuth.tsx), which is a separate chunk fetched after the page is up.
// The allowance is asserted to be live, so it cannot outlive the code it excuses.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const ROOT = process.cwd();
const ENTRY = "app/page.tsx";

const FORBIDDEN = [/^app\/_phases\//, /^app\/library\//, /^app\/_studio\//, /^lib\/studioDb\.ts$/];

/** from -> to, dynamic edges only. */
const LAZY_ALLOWED = [{ from: "lib/useAuth.tsx", to: "lib/identityEviction.ts" }];

const EXTS = ["", ".ts", ".tsx", ".mts", "/index.ts", "/index.tsx"];

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith("@gt/")) {
    const [, pkg, ...rest] = spec.split("/");
    if (!pkg || rest.length === 0) return null;
    base = `packages/${pkg}/src/${rest.join("/")}`;
  } else if (spec.startsWith(".")) base = relative(ROOT, resolve(ROOT, dirname(from), spec));
  else return null;
  base = base.split("\\").join("/");
  for (const e of EXTS) {
    const p = base + e;
    if (/\.(tsx?|mts)$/.test(p) && existsSync(join(ROOT, p))) return p;
  }
  return null;
}

type Edge = { to: string; dynamic: boolean };

function importsOf(file: string): Edge[] {
  const src = stripComments(readFileSync(join(ROOT, file), "utf8"));
  const out: Edge[] = [];
  const add = (spec: string, dynamic: boolean) => {
    const to = resolveSpec(file, spec);
    if (to) out.push({ to, dynamic });
  };
  // `import type` / `export type` are erased at compile time and carry no code.
  for (const m of src.matchAll(/\b(?:import|export)\b(?!\s+type\b)[^"'`;]*?\bfrom\s*["']([^"']+)["']/g)) add(m[1]!, false);
  for (const m of src.matchAll(/\bimport\s*["']([^"']+)["']/g)) add(m[1]!, false);
  for (const m of src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) add(m[1]!, true);
  return out;
}

function walk(): { reached: Map<string, string | null>; lazyUsed: Set<string> } {
  const reached = new Map<string, string | null>([[ENTRY, null]]);
  const lazyUsed = new Set<string>();
  const queue = [ENTRY];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const e of importsOf(file)) {
      if (e.dynamic && LAZY_ALLOWED.some((a) => a.from === file && a.to === e.to)) {
        lazyUsed.add(`${file} -> ${e.to}`);
        continue;
      }
      if (reached.has(e.to)) continue;
      reached.set(e.to, file);
      queue.push(e.to);
    }
  }
  return { reached, lazyUsed };
}

function chain(reached: Map<string, string | null>, file: string): string {
  const path: string[] = [];
  for (let at: string | null | undefined = file; at; at = reached.get(at)) path.unshift(at);
  return path.join("\n    -> ");
}

test("the landing reaches nothing under app/_phases, app/library, app/_studio, or lib/studioDb", () => {
  const { reached } = walk();

  // A walk that saw only the entry reports isolation in the voice of success.
  expect(reached.size, "the import walk stopped at the entry - it is resolving nothing").toBeGreaterThan(20);
  for (const must of ["app/_landing/cosmos/data.ts", "app/_landing/parts.tsx", "lib/useAuth.tsx", "packages/catalog/src/presets.ts"])
    expect(reached.has(must), `${must} should be on the landing's graph`).toBe(true);

  const bad = [...reached.keys()].filter((f) => FORBIDDEN.some((re) => re.test(f)));
  expect(
    bad.map((f) => `${f}\n    -> ${chain(reached, f)}`),
    "the landing reaches the studio",
  ).toEqual([]);
});

test("the one lazy edge is real: useAuth still loads the eviction owner on demand", () => {
  const { lazyUsed } = walk();
  expect([...lazyUsed]).toEqual(LAZY_ALLOWED.map((a) => `${a.from} -> ${a.to}`));
});
