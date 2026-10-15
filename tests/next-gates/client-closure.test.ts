// THE CLIENT CLOSURE GUARD: no module a browser can load reaches `zod`.
//
// Why a walk and not a grep. `/kit` first-load JS measured 287 KB gzip on 2026-10-15, and
// ~94 KB of it was zod - reached through no file that says "zod" where anyone would look. A
// client file imports a helper, the helper imports a record module, the record module
// defines a schema; the bundler follows the chain and nothing in the diff that added the
// first hop names the last. So this follows the chain the bundler follows, from every root a
// browser can load, and names the whole path when it ends at zod.
//
// What counts as an edge is the bundler's rule, not the reader's:
//   · `import type` / `export type ... from` is ERASED - not followed. That is why the @gt/ui
//     status vocabulary may name `JobState` (types) while never loading `@gt/domain/job`.
//   · `import { type A } from "x"` is FOLLOWED. Under verbatimModuleSyntax it is rewritten to
//     `import {} from "x"`, a side-effect import, and @gt/domain declares no `sideEffects`, so
//     a bundler must keep it. Over-approximating here is the safe direction: the fix is to
//     spell it `import type`, which the strictness floor wants anyway.
//   · dynamic `import()` is NOT followed: a lazily loaded validator is not first-load JS, and
//     splitting a heavy module behind an interaction is exactly what script-cost asks for
//     (page-load-pipeline/script-cost-is-main-thread-time).
//
// Roots: EVERY module under packages/ui/src (bar the build-time ones named in BUILD_TIME), and
// every `"use client"` file under app/(studio). @gt/ui is the browser's library: a component
// that only a Server Component renders today (StatusPill, measured 2026-10-15) is one
// `"use client"` screen away from the bundle, and the guard has to hold before that screen,
// not after. The walk crosses into v1 (`@/lib/...`) because the (studio) shell still borrows
// v1's auth; what v1 drags in is in this world's bundle too.
//
// Liveness (quality-gates/gate-liveness): the walk asserts its own denominator, and a fixture
// pair under fixtures/client-closure--* runs the same walker over a seeded leak and its clean
// twin, so a walker that silently stopped following edges goes red here.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const FIXTURES = path.join(import.meta.dirname, "fixtures");
const UI_SRC = "packages/ui/src";
const CLIENT_APP = "app/(studio)";

/**
 * @gt/ui modules that never run in a browser: the token generator's schema door, read by
 * pipeline/gen-tokens.mts and by the /kit page on the server. Excluded as ROOTS only - a
 * client module that imports one still walks into it, and its zod reach is then a finding.
 */
const BUILD_TIME: Readonly<Record<string, string>> = {
  "packages/ui/src/tokenSource.ts": "the source.json door (zod) for tokens:gen and the /kit server page",
};
const SOURCE = /\.(ts|tsx|mts)$/;

/**
 * OWED, NOT ALLOWED. Each entry is a module that reaches zod today and a decision that has
 * not been taken yet. The test fails on a reach NOT listed and ALSO on a listed entry that no
 * longer reaches zod, so this list can only shrink and cannot outlive its fix.
 */
const OWED: Readonly<Record<string, string>> = {};

type Reach = { readonly pkg: string; readonly chain: readonly string[] };

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (SOURCE.test(name)) out.push(p);
  }
  return out;
}

const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");

const isClient = (src: string): boolean => /^\s*["']use client["']/.test(stripComments(src));

/** The specifiers a bundler keeps from one module (see the header for the three rules). */
export function valueEdges(src: string): string[] {
  const code = stripComments(src);
  const out: string[] = [];
  for (const m of code.matchAll(/(?:^|[\n;])\s*(import|export)\s+([^;"']*?)\s+from\s+["']([^"']+)["']/g)) {
    const clause = m[2] ?? "";
    if (/^type\s/.test(clause)) continue;
    if (m[3] !== undefined) out.push(m[3]);
  }
  for (const m of code.matchAll(/(?:^|[\n;])\s*import\s+["']([^"']+)["']/g)) if (m[1] !== undefined) out.push(m[1]);
  return out;
}

function withExtension(base: string): string | null {
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

/** `@gt/<pkg>/<sub>` through that package's own `exports` map, longest pattern first. */
function workspace(root: string, spec: string): string | null {
  const m = /^@gt\/([^/]+)\/(.+)$/.exec(spec);
  if (m === null || m[1] === undefined || m[2] === undefined) return null;
  const pkgDir = path.join(root, "packages", m[1]);
  const manifest = path.join(pkgDir, "package.json");
  if (!existsSync(manifest)) return null;
  const exportsMap: unknown = JSON.parse(readFileSync(manifest, "utf8")).exports;
  if (typeof exportsMap !== "object" || exportsMap === null) return null;
  const wanted = `./${m[2]}`;
  const keys = Object.keys(exportsMap).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const target: unknown = Reflect.get(exportsMap, key);
    if (typeof target !== "string") continue;
    if (!key.includes("*")) {
      if (key === wanted) return path.join(pkgDir, target);
      continue;
    }
    const [pre = "", post = ""] = key.split("*");
    if (wanted.startsWith(pre) && wanted.endsWith(post) && wanted.length >= pre.length + post.length)
      return path.join(pkgDir, target.replace("*", wanted.slice(pre.length, wanted.length - post.length)));
  }
  return null;
}

type Target = { readonly file: string } | { readonly pkg: string } | { readonly skip: true };

function resolveSpec(root: string, from: string, spec: string): Target {
  if (/\.(css|svg|png|json)$/.test(spec)) return { skip: true };
  let base: string | null = null;
  if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else if (spec.startsWith("@/")) base = path.join(root, spec.slice(2));
  else if (spec.startsWith("@gt/")) base = workspace(root, spec);
  // zod keeps its subpath: `zod/mini` and `zod/v4/core` are the tree-shakable doors a client
  // may use; bare `zod` (classic) is the ~93 KB one this guard exists to keep out.
  else if (spec === "zod" || spec.startsWith("zod/")) return { pkg: spec };
  else return { pkg: spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : (spec.split("/")[0] ?? spec) };
  const file = base === null ? null : withExtension(base);
  if (file === null) throw new Error(`${path.relative(root, from)}: cannot resolve "${spec}" - the walk would go blind past it`);
  return { file };
}

/** Breadth-first from the roots; every bare package reached, with the shortest chain to it. */
export function closure(root: string, roots: readonly string[]): { walked: number; reached: Reach[] } {
  const parent = new Map<string, string | null>(roots.map((r) => [r, null]));
  const queue = [...roots];
  const reached: Reach[] = [];
  const chainOf = (f: string): string[] => {
    const out: string[] = [];
    for (let at: string | null | undefined = f; at != null; at = parent.get(at)) out.unshift(rel(root, at));
    return out;
  };
  for (let f = queue.shift(); f !== undefined; f = queue.shift()) {
    for (const spec of valueEdges(readFileSync(f, "utf8"))) {
      const t = resolveSpec(root, f, spec);
      if ("skip" in t) continue;
      if ("pkg" in t) {
        reached.push({ pkg: t.pkg, chain: chainOf(f) });
        continue;
      }
      if (parent.has(t.file)) continue;
      parent.set(t.file, f);
      queue.push(t.file);
    }
  }
  return { walked: parent.size, reached };
}

const rel = (root: string, f: string): string => path.relative(root, f).split(path.sep).join("/");

export function clientRoots(root: string): string[] {
  const ui = files(path.join(root, UI_SRC)).filter((f) => !(rel(root, f) in BUILD_TIME));
  const app = files(path.join(root, CLIENT_APP)).filter((f) => isClient(readFileSync(f, "utf8")));
  return [...ui, ...app];
}

/** Classic zod, by any spelling; the lean doors (mini, core) are not a reach. */
const LEAN_ZOD = new Set(["zod/mini", "zod/v4/mini", "zod/v4/core"]);
const isClassicZod = (pkg: string): boolean => (pkg === "zod" || pkg.startsWith("zod/")) && !LEAN_ZOD.has(pkg);
const zodReaches = (r: { reached: Reach[] }): Reach[] => r.reached.filter((x) => isClassicZod(x.pkg));
/** The module that imports zod: the last hop of the chain. */
const importer = (x: Reach): string => x.chain[x.chain.length - 1] ?? "";

describe("no client-reachable module loads zod", () => {
  const roots = clientRoots(ROOT);
  const walk = closure(ROOT, roots);

  test("the walk saw the client world (denominator)", () => {
    // A walk under these floors is a walk that stopped resolving, not a smaller app.
    expect(roots.length, "client roots").toBeGreaterThanOrEqual(60);
    expect(walk.walked, "modules walked beyond the roots").toBeGreaterThan(roots.length);
    expect(walk.reached.some((x) => x.pkg === "react"), "the walk never reached react - it is not following imports").toBe(true);
  });

  test("zod is reached only where it is owed, and every owed entry is still real", () => {
    const leaks = zodReaches(walk);
    const by = new Map<string, string>();
    for (const x of leaks) if (!by.has(importer(x))) by.set(importer(x), x.chain.join("\n      -> "));
    const fresh = [...by.entries()].filter(([f]) => !(f in OWED)).map(([, chain]) => chain);
    const stale = Object.keys(OWED).filter((f) => !by.has(f));
    expect(fresh, "a client-reachable module now loads zod (chain from a 'use client' root)").toEqual([]);
    expect(stale, "an OWED entry no longer reaches zod - delete it from OWED").toEqual([]);
  });

  test("every @gt/domain machine table is zod-free", () => {
    const tables = files(path.join(ROOT, "packages/domain/src")).filter((f) => f.endsWith(".machine.ts"));
    expect(tables.length, "machine tables").toBeGreaterThanOrEqual(7);
    for (const t of tables) expect(zodReaches(closure(ROOT, [t])).map((x) => x.chain.join(" -> ")), path.basename(t)).toEqual([]);
  });
});

describe("the walker itself (seeded fixtures)", () => {
  test("an inline-type-only import of a schema module is a reach: red", () => {
    // A.tsx is "use client", b.ts has no directive: both are roots (every ui module is), so
    // the shortest chain to zod starts at b.ts.
    const at = path.join(FIXTURES, "client-closure--leak");
    const leaks = zodReaches(closure(at, clientRoots(at)));
    expect(leaks.map((x) => x.chain.join(" -> "))).toEqual(["packages/ui/src/b.ts -> packages/domain/src/rec.ts"]);
  });
  test("the same import spelled `import type` is erased: clean", () => {
    const at = path.join(FIXTURES, "client-closure--clean");
    const walk = closure(at, clientRoots(at));
    expect(walk.walked).toBe(3);
    expect(zodReaches(walk)).toEqual([]);
  });
});
