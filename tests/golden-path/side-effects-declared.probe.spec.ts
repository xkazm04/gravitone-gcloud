// LANE — A MODULE IMPORTED FOR ITS SIDE EFFECTS IS DECLARED AS HAVING THEM (static).
//
// package.json declares `"sideEffects": [...]` so the bundler may drop barrel
// re-exports nobody uses (next.config.ts has the measurement: the kit barrel was
// shipping the deck and `motion` to routes that draw neither). The price of that
// declaration is that a module imported ONLY for what it does on import —
// `import "@/lib/turns/kinds/poster"`, which registers a turn kind — is dropped
// unless the list names it, and nothing fails: the registration just never runs.
//
// So this walks every bare import under app/, components/ and lib/ and demands
// each one resolve to a path the list covers. A new self-registering module is
// a one-line edit to package.json; forgetting it is this failure, not a turn
// kind that silently stopped existing.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const ROOT = resolve(__dirname, "..", "..");

function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        walk(p);
      } else if (/\.(ts|tsx|mts)$/.test(e.name) && !/\.(spec|test)\./.test(e.name)) out.push(p);
    }
  };
  for (const top of ["app", "components", "lib"]) walk(join(ROOT, top));
  return out;
}

/** `"./lib/turns/kinds/*.ts"` → a RegExp over a repo-relative posix path. Only
 *  the two glob forms package.json uses: `*` within a segment, and a bare
 *  basename pattern (`*.css`) that matches at any depth. */
function globRe(glob: string): RegExp {
  const g = glob.replace(/^\.\//, "");
  const body = g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(g.includes("/") ? `^${body}$` : `(^|/)${body}$`);
}

function resolveSpec(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = posix.normalize(posix.join(relative(ROOT, dirname(from)).replace(/\\/g, "/"), spec));
  else return null; // a package: its own package.json speaks for it
  if (/\.(css|scss)$/.test(base)) return base;
  for (const ext of [".ts", ".tsx", ".mts", "/index.ts", "/index.tsx"]) {
    try {
      readFileSync(join(ROOT, base + ext));
      return base + ext;
    } catch {
      /* next candidate */
    }
  }
  return base;
}

test("every bare import of a repo module is covered by package.json sideEffects", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { sideEffects?: unknown };
  expect(Array.isArray(pkg.sideEffects), "package.json sideEffects is no longer a list; this probe reads nothing").toBe(true);
  const globs = (pkg.sideEffects as string[]).map(globRe);

  const bare: { file: string; target: string }[] = [];
  for (const file of sources()) {
    const src = stripComments(readFileSync(file, "utf8"));
    for (const m of src.matchAll(/^\s*import\s+["']([^"']+)["'];?\s*$/gm)) {
      const target = resolveSpec(m[1], file);
      if (target) bare.push({ file: relative(ROOT, file).replace(/\\/g, "/"), target });
    }
  }
  // The walk found the imports it exists for. Zero would pass everything below.
  expect(bare.some((b) => b.target.startsWith("lib/turns/kinds/")), "found no bare import of a turn kind").toBe(true);

  const uncovered = bare.filter((b) => !globs.some((re) => re.test(b.target)));
  expect(
    uncovered.map((b) => `${b.file} imports ${b.target} for its side effects`),
    "add each to package.json sideEffects, or the bundler drops it",
  ).toEqual([]);
});
