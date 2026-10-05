/**
 * Focus-ring floor — a source ratchet.
 *
 * app/globals.css gives every :focus-visible element the accent ring inside
 * `@layer base`. Tailwind's `outline-none` / `focus:outline-none` /
 * `focus-visible:outline-none` live in `@layer utilities`, which outranks base,
 * so each one deletes that ring. An element may remove it only if it names a
 * focus-visible replacement on the same tag (an outline width, a ring, a
 * shadow), or is a programmatic target (`tabIndex={-1}`) that is never reached
 * by Tab. A `focus:border-*` tint is not a replacement: it is a colour change
 * at 40-50% alpha on ink, which is exactly the "tint it instead" the doctrine
 * in globals.css forbids.
 *
 * Scope: .tsx under app/ and components/ (the hand-written .css files carry
 * their own replacements and are not walked). The element is the opening tag
 * that holds the utility, so a replacement on a different element does not
 * count.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { stripComments } from "./_helpers";

const ROOT = path.resolve(__dirname, "..", "..");
const REMOVES = /(?<![\w-])(?:focus(?:-visible)?:)?outline-none(?![\w-])/g;
const REPLACES = /focus-visible:-?(?:outline-\d|ring|shadow)/;
const PROGRAMMATIC = /tabIndex=\{-1\}/;

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
}

/** The opening tag around `idx`: back to the nearest `<Tag`, forward to its closing `>` at brace depth 0. */
function tagAround(src: string, idx: number): string {
  let start = idx;
  while (start > 0 && !(src[start] === "<" && /[A-Za-z]/.test(src[start + 1] ?? ""))) start--;
  let depth = 0;
  let quote = "";
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (depth === 0 && (c === '"' || c === "'")) quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0 && src[i - 1] !== "=") return src.slice(start, i + 1);
  }
  return src.slice(start);
}

function offenders(src: string): number[] {
  const clean = stripComments(src);
  const lines: number[] = [];
  for (const m of clean.matchAll(REMOVES)) {
    const tag = tagAround(clean, m.index!);
    if (PROGRAMMATIC.test(tag) || REPLACES.test(tag)) continue;
    lines.push(clean.slice(0, m.index).split("\n").length);
  }
  return lines;
}

test("every outline removal in app/ and components/ names a focus-visible replacement", () => {
  const files: string[] = [];
  for (const d of ["app", "components"]) walk(path.join(ROOT, d), files);
  expect(files.length, "the walk read nothing").toBeGreaterThan(50);

  const bad: string[] = [];
  let removals = 0;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    removals += [...stripComments(src).matchAll(REMOVES)].length;
    for (const line of offenders(src)) bad.push(`${path.relative(ROOT, f).split(path.sep).join("/")}:${line}`);
  }
  expect(removals, "no removal seen: the pattern or the walk is broken").toBeGreaterThan(0);
  expect(bad, "outline removed with no focus-visible replacement on the same element").toEqual([]);
});

test("the detector itself: tint-only and app-state-only removals are caught, replacements and tabIndex=-1 pass", () => {
  expect(offenders(`<input className="border focus:border-cyan-400/40 focus:outline-none" />`)).toHaveLength(1);
  expect(offenders(`<div className={\`a focus-visible:outline-none \${f ? "outline-2" : ""}\`} />`)).toHaveLength(1);
  expect(offenders(`<a className="[&>svg]:w-4 outline-none">x</a>`)).toHaveLength(1);
  expect(offenders(`<div className="outline-none focus-visible:outline-2" />`)).toHaveLength(0);
  expect(offenders(`<div className="outline-none focus-visible:ring-1" />`)).toHaveLength(0);
  expect(offenders(`<main tabIndex={-1} className="outline-none" />`)).toHaveLength(0);
  expect(offenders(`// outline-none\n<div className="x" />`)).toHaveLength(0);
});
