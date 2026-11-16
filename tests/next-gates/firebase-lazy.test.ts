// FIREBASE IS LOADED, NEVER IMPORTED: no static import path from a page a browser loads reaches
// the Firebase SDK (lib/firebase.ts `loadAuth`, 2026-11-09).
//
// Why it is a walk. The root layout mounts the auth context on every page, the (studio) shell
// renews its cookie on every studio route, and every client door builds its headers through
// lib/sessionToken.ts. One value import of `firebase/auth` in any of them - or in anything they
// import - puts Firebase's client (~33 KB gzip, measured on the build) back in the first load of
// every route, and the file that adds it does not have to say "firebase" where anyone looks. So
// this follows the bundler's edges from the roots a browser loads and names the chain.
//
// The edge rule is the bundler's: `import type` is erased (not followed); a value import,
// `import { type X }` included, is followed; a dynamic `import()` is NOT followed - that is the
// one door, and the test asserts the door is still there.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE = /\.(ts|tsx|mts)$/;

const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");

/** Specifiers a bundler keeps statically from one module. */
export function staticEdges(src: string): string[] {
  const code = strip(src);
  const out: string[] = [];
  for (const m of code.matchAll(/(?:^|[\n;])\s*(?:import|export)\s+([^;"']*?)\s+from\s+["']([^"']+)["']/g)) {
    if (/^type\s/.test(m[1] ?? "")) continue;
    if (m[2] !== undefined) out.push(m[2]);
  }
  for (const m of code.matchAll(/(?:^|[\n;])\s*import\s+["']([^"']+)["']/g)) if (m[1] !== undefined) out.push(m[1]);
  return out;
}

const isFirebase = (spec: string): boolean => spec === "firebase" || spec.startsWith("firebase/") || spec.startsWith("@firebase/");

function withExtension(base: string): string | null {
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

function workspace(spec: string): string | null {
  const m = /^@gt\/([^/]+)\/(.+)$/.exec(spec);
  if (m === null || m[1] === undefined || m[2] === undefined) return null;
  const pkgDir = path.join(ROOT, "packages", m[1]);
  const exportsMap: unknown = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")).exports;
  if (typeof exportsMap !== "object" || exportsMap === null) return null;
  const wanted = `./${m[2]}`;
  for (const key of Object.keys(exportsMap).sort((a, b) => b.length - a.length)) {
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

const rel = (f: string): string => path.relative(ROOT, f).split(path.sep).join("/");

/** Breadth-first; every firebase specifier reached, with the chain to the module that names it. */
export function firebaseReach(roots: readonly string[]): { walked: Set<string>; leaks: string[] } {
  const parent = new Map<string, string | null>(roots.map((r) => [r, null]));
  const queue = [...roots];
  const leaks: string[] = [];
  const chain = (f: string): string => {
    const out: string[] = [];
    for (let at: string | null | undefined = f; at != null; at = parent.get(at)) out.unshift(rel(at));
    return out.join(" -> ");
  };
  for (let f = queue.shift(); f !== undefined; f = queue.shift()) {
    for (const spec of staticEdges(readFileSync(f, "utf8"))) {
      if (isFirebase(spec)) {
        leaks.push(`${chain(f)} -> ${spec}`);
        continue;
      }
      let base: string | null = null;
      if (/\.(css|svg|png|json)$/.test(spec)) continue;
      if (spec.startsWith(".")) base = path.resolve(path.dirname(f), spec);
      else if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
      else if (spec.startsWith("@gt/")) base = workspace(spec);
      else continue;
      const file = base === null ? null : withExtension(base);
      if (file === null) throw new Error(`${rel(f)}: cannot resolve "${spec}" - the walk would go blind past it`);
      if (parent.has(file)) continue;
      parent.set(file, f);
      queue.push(file);
    }
  }
  return { walked: new Set([...parent.keys()].map(rel)), leaks };
}

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

/** The roots: both layouts, the landing, and every "use client" module under app/ (not app/api). */
function roots(): string[] {
  const fixed = ["app/layout.tsx", "app/(studio)/layout.tsx", "app/page.tsx"].map((f) => path.join(ROOT, f));
  const client = files(path.join(ROOT, "app"))
    .filter((f) => !rel(f).startsWith("app/api/"))
    .filter((f) => /^\s*["']use client["']/.test(strip(readFileSync(f, "utf8"))));
  return [...new Set([...fixed, ...client])];
}

describe("no page a browser loads imports firebase statically", () => {
  const r = roots();
  const walk = firebaseReach(r);

  test("the walk saw the auth seam (denominator)", () => {
    expect(r.length, "roots").toBeGreaterThanOrEqual(60);
    for (const f of ["lib/useAuth.tsx", "lib/firebase.ts", "lib/sessionToken.ts", "app/(studio)/_shell/session.ts", "app/_landing/parts.tsx"])
      expect(walk.walked.has(f), `${f} should be on the walked graph`).toBe(true);
  });

  test("no static chain ends at firebase/*", () => {
    expect(walk.leaks, "a static import reaches the Firebase SDK (chain from a root)").toEqual([]);
  });

  test("the one door is real: lib/firebase.ts loads firebase/app and firebase/auth by import()", () => {
    const src = strip(readFileSync(path.join(ROOT, "lib/firebase.ts"), "utf8"));
    expect(src).toMatch(/import\(\s*["']firebase\/auth["']\s*\)/);
    expect(src).toMatch(/import\(\s*["']firebase\/app["']\s*\)/);
  });

  test("the edge rule (liveness): a value import is followed, a type import and import() are not", () => {
    expect(staticEdges(`import { getAuth } from "firebase/auth";`)).toEqual(["firebase/auth"]);
    expect(staticEdges(`import { type Auth } from "firebase/auth";`)).toEqual(["firebase/auth"]);
    expect(staticEdges(`import "firebase/auth";`)).toEqual(["firebase/auth"]);
    expect(staticEdges(`import type { Auth } from "firebase/auth";`)).toEqual([]);
    expect(staticEdges(`const m = await import("firebase/auth");`)).toEqual([]);
  });

  test("the walk reads the seam's own imports (a comment spelling a block opener once blinded it)", () => {
    // Measured 2026-11-09: a line comment naming "firebase" followed by "/*" opened a block the
    // comment stripper ran to the next close, and every import below it vanished from the walk.
    const edges = (f: string): string[] => staticEdges(readFileSync(path.join(ROOT, f), "utf8"));
    expect(edges("lib/sessionToken.ts")).toEqual(expect.arrayContaining(["./devAuth", "./firebase", "./localMode"]));
    expect(edges("app/(studio)/_shell/session.ts")).toEqual(expect.arrayContaining(["@/lib/firebase", "@/lib/devAuth"]));
    expect(edges("lib/useAuth.tsx")).toEqual(expect.arrayContaining(["./firebase", "./sessionToken"]));
  });
});
