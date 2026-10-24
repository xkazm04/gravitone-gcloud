// THE /kit SHEET, HELD TO WHAT IT CLAIMS (app/(studio)/kit). The page says it is the design
// system as shipped: every token of source.json, every row of the one keymap, the motion the
// components play. tests/live/kit.live.spec.ts drives the assembled page in Chromium; these cases
// are the claims a node render or a read of the stylesheets can decide, so `npm run test:unit`
// sees them without a browser.
//
//   1. A scroller that glides (`scroll-behavior: smooth`) stops gliding under reduced motion.
//      globals.css's blanket rule reaches `html` and every animation and transition, never a
//      module's own `scroll-behavior` - the kit's body scrolled smoothly for a person who asked
//      for no motion on every nav click (WCAG 2.3.3).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CSS_ROOTS = ["app", "components", "packages/ui/src"];

function cssFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".next")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...cssFiles(full));
    else if (name.endsWith(".css")) out.push(full);
  }
  return out;
}

/** CSS has block comments only, and they do not nest: this strip is sound. */
const css = (file: string): string => readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The bodies of every `@media (prefers-reduced-motion: reduce)` block, braces balanced. */
function reducedBlocks(text: string): string[] {
  const out: string[] = [];
  const open = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/g;
  for (let m = open.exec(text); m !== null; m = open.exec(text)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
    }
    out.push(text.slice(start, i - 1));
  }
  return out;
}

describe("/kit: motion honours reduced motion", () => {
  test("every stylesheet that scrolls smoothly turns it off under prefers-reduced-motion", () => {
    const files = CSS_ROOTS.flatMap((r) => cssFiles(path.join(ROOT, r)));
    expect(files.length, "the walk read no stylesheet").toBeGreaterThan(50);
    const smooth = files.filter((f) => /scroll-behavior\s*:\s*smooth/.test(css(f)));
    expect(smooth.length, "no stylesheet scrolls smoothly: the case has nothing to hold").toBeGreaterThan(0);
    const unguarded = smooth
      .filter((f) => !reducedBlocks(css(f)).some((b) => /scroll-behavior\s*:\s*auto/.test(b)))
      .map((f) => path.relative(ROOT, f).replaceAll("\\", "/"));
    expect(unguarded).toEqual([]);
  });
});
