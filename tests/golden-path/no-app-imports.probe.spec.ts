// NOTHING OUTSIDE app/ IMPORTS app/ (Phase 0.4 exit condition).
//
// app/ is the Next.js route tree. A CLI under pipeline/, a library under lib/ or
// a shared component under components/ that reaches into it can only run inside
// the framework, and one `export *` stub at the old path is enough to turn the
// edge into an import cycle that evaluates to nothing (Lot 2b's picture-unit
// probe got `x is not a function` from exactly that). So the rule is mechanical:
// every tracked .ts/.tsx/.mts/.mjs file under lib/, components/ and pipeline/ is
// walked, its static, dynamic and type-only specifiers are resolved (`@/` and
// relative), and any that lands in app/ fails, named `file:line -> target`.
//
// The allowlist is the compositor's four importers and nothing else. It fails
// the other way too: an entry that no longer imports app/ must be removed, so
// the list cannot go stale.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, extname, posix } from "node:path";

import { test, expect } from "@playwright/test";

const COMPOSITOR = "app/_phases/frames/music-video/compositor.ts";
const WHY = `imports ${COMPOSITOR}, which is still in app/ and is being edited by another session; remove when ${COMPOSITOR} moves to lib/`;

/** file -> reason. EXACTLY the compositor's four importers. */
const ALLOWED: Record<string, string> = {
  "lib/musicVideoExport.ts": `the export path ${WHY}`,
  "lib/sound/mv/looks.ts": `the look renderer ${WHY}`,
  "lib/sound/mv/render.ts": `the video renderer ${WHY}`,
  "pipeline/mv-look-frames.mts": `the look-frame CLI ${WHY}`,
};

const ROOTS = ["lib/", "components/", "pipeline/"];
const EXTS = new Set([".ts", ".tsx", ".mts", ".mjs"]);

// `from "x"`, `import "x"`, `import("x")`, `require("x")`, `export … from "x"`.
const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(["'])([^"'\n]+)\1/g;

type Hit = { file: string; line: number; target: string };

function appImports(file: string, source: string): Hit[] {
  const hits: Hit[] = [];
  source.split(/\r?\n/).forEach((text, i) => {
    const t = text.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    for (const m of text.matchAll(SPEC)) {
      const spec = m[2];
      let target: string | null = null;
      if (spec.startsWith("@/")) target = spec.slice(2);
      else if (spec.startsWith(".")) target = posix.normalize(posix.join(dirname(file).split("\\").join("/"), spec));
      if (target !== null && (target === "app" || target.startsWith("app/"))) {
        hits.push({ file, line: i + 1, target });
      }
    }
  });
  return hits;
}

function tracked(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out
    .split("\0")
    .filter((p) => ROOTS.some((r) => p.startsWith(r)) && EXTS.has(extname(p)));
}

test("no file under lib/, components/ or pipeline/ imports app/, bar the compositor's four importers", () => {
  const files = tracked();
  expect(files.length, "git ls-files found nothing - the walk is reading the wrong tree").toBeGreaterThan(200);

  const found = new Map<string, Hit[]>();
  for (const f of files) {
    const hits = appImports(f, readFileSync(f, "utf8"));
    if (hits.length) found.set(f, hits);
  }

  const stray = [...found.entries()]
    .filter(([f]) => !ALLOWED[f])
    .flatMap(([, hits]) => hits.map((h) => `${h.file}:${h.line} -> ${h.target}`));
  expect(stray, "these files import app/; move what they need into lib/ or packages/").toEqual([]);

  const stale = Object.keys(ALLOWED).filter((f) => !found.has(f));
  expect(stale, "these allowlist entries no longer import app/ - delete them from ALLOWED").toEqual([]);
  for (const [f, why] of Object.entries(ALLOWED)) {
    expect(files, `${f} is allowlisted but is not a tracked file under the walked roots`).toContain(f);
    expect(why.length).toBeGreaterThan(40);
  }
});

test("the matcher sees static, dynamic, type-only, side-effect and relative imports, and skips comments", () => {
  const src = [
    'import { a } from "@/app/x";',
    'import type { B } from "@/app/y";',
    'export * from "../../app/z";',
    'const m = await import("@/app/w");',
    'import "@/app/side";',
    '// import { c } from "@/app/commented";',
    ' * from "@/app/doc"',
    'import { ok } from "@/lib/fine";',
  ].join("\n");
  expect(appImports("lib/q/f.ts", src).map((h) => `${h.line}:${h.target}`)).toEqual([
    "1:app/x",
    "2:app/y",
    "3:app/z",
    "4:app/w",
    "5:app/side",
  ]);
});
