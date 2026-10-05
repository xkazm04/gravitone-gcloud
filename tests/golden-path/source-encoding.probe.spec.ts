// LANE — SOURCE ENCODING: NO DOUBLE-ENCODED UTF-8 IN TRACKED SOURCE (static).
//
// An editor round-trip that decodes UTF-8 as cp1252 and saves again turns U+2026
// into "â€¦" (bytes c3 a2 e2 82 ac c2 a6). ShelfDialogs.tsx shipped that way
// in the context menu's first, default-focused item. The signature is
// "â€" (U+00E2 U+20AC) or a U+00C3 followed by a Latin-1 continuation
// character. The population is walked off the filesystem, not listed.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { test, expect } from "@playwright/test";

const MOJIBAKE = /\u00e2\u20ac|\u00c3[\u0080-\u00bf]/;
const EXT = /\.(tsx?|css|mjs)$/;

function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (EXT.test(e.name)) out.push(relative(process.cwd(), full).split("\\").join("/"));
    }
  };
  for (const root of ["app", "components", "lib"]) walk(join(process.cwd(), root));
  return out;
}

test("no tracked app/components/lib source carries double-encoded UTF-8", () => {
  const files = sources();
  expect(files.length, "the walk read nothing").toBeGreaterThan(50);
  const hits: string[] = [];
  for (const f of files) {
    readFileSync(f, "utf-8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (MOJIBAKE.test(line)) hits.push(`${f}:${i + 1}`);
      });
  }
  expect(hits, "mojibake sites").toEqual([]);
});
