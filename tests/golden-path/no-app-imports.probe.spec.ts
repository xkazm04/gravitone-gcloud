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
// There is no allowlist. Until L75 it held the four importers of the music-video
// compositor, which another session owned in app/_phases/frames/music-video/;
// the compositor moved to lib/sound/mv/compositor.ts and the list emptied. An
// empty list that is still a list is a door: the next exception is one line in
// it. So the list is gone and the test asserts ZERO hits - an exception now
// has to argue its way back into this file's structure, not into a table.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, posix } from "node:path";

import { test, expect } from "@playwright/test";

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
    // A file deleted in the working tree but not yet staged is still in the index; it imports nothing.
    .filter((p) => ROOTS.some((r) => p.startsWith(r)) && EXTS.has(extname(p)) && existsSync(p));
}

test("no file under lib/, components/ or pipeline/ imports app/ - none, no allowlist", () => {
  const files = tracked();
  expect(files.length, "git ls-files found nothing - the walk is reading the wrong tree").toBeGreaterThan(200);

  const stray = files.flatMap((f) => appImports(f, readFileSync(f, "utf8")).map((h) => `${h.file}:${h.line} -> ${h.target}`));
  expect(stray, "these files import app/; move what they need into lib/ or packages/").toEqual([]);
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
