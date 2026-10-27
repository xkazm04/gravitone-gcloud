// THE WORKER'S PRODUCER LIST PULLS IN NO server-only MODULE (lib/producers/registry.ts). The
// registry's header promises that the one `server-only` module a step's settle needs
// (lib/parts/gates.ts) is loaded LAZILY - an `await import` inside `openGatesAfter` - so importing
// the registry never pulls it in. That promise is a property of the registry's whole STATIC import
// graph, not of registry.ts: one bound producer taking a helper from a `server-only` module breaks
// it for every importer (style.ts took `blobRootOf` from lib/parts/gates.ts and did).
//
// This lane cannot witness it by importing: playwright.config.ts resolves `server-only` to Next's
// empty entry for every probe, as pipeline/lib-hooks.mts does for the worker. So the graph is
// WALKED: every static value import (not `import type`, not a dynamic `import()`) from the
// registry, resolved through `@/` and relative paths, comments stripped first, and no file reached
// may open with `import "server-only"`. A walk that reaches too few files fails too, so a resolver
// that silently stops cannot read as a clean graph.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { stripComments } from "./_helpers";

const ROOT = process.cwd();
const isFile = (p: string): boolean => existsSync(p) && statSync(p).isFile();

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (base === null) return null; // a package or node: builtin - not this repo's lib graph
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (isFile(c)) return c;
  return null;
}

/** Static value imports and re-exports of one file: `import x from`, `import "x"`, `export ... from`. */
function importsOf(file: string): string[] {
  const src = stripComments(readFileSync(file, "utf8"));
  const out: string[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?([^;]*?\s+from\s+)?["']([^"']+)["']/gm;
  for (const m of src.matchAll(re)) {
    if (m[2] !== undefined) continue; // `import type` / `export type` is erased
    if (m[1] === "export" && m[3] === undefined) continue;
    const spec = m[4];
    if (spec !== undefined) out.push(spec);
  }
  return out;
}

test("lib/producers/registry.ts's static import graph reaches no `server-only` module", () => {
  const start = path.join(ROOT, "lib", "producers", "registry.ts");
  const seen = new Map<string, string>(); // file -> the file that imported it
  const stack: string[] = [start];
  seen.set(start, "(start)");
  const serverOnly: string[] = [];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    const specs = importsOf(file);
    if (specs.includes("server-only")) serverOnly.push(`${path.relative(ROOT, file)} (imported by ${path.relative(ROOT, seen.get(file) ?? "")})`);
    for (const spec of specs) {
      const to = resolve(file, spec);
      if (to === null || seen.has(to)) continue;
      seen.set(to, file);
      stack.push(to);
    }
  }
  // The walk read the bindings: every producer the registry imports by path, and their lib/ graph.
  expect(seen.size).toBeGreaterThan(100);
  expect(seen.has(path.join(ROOT, "lib", "producers", "style.ts"))).toBe(true);
  expect(serverOnly).toEqual([]);
});
