// Text controls go through the primitive. Field, Select and TextArea carry the REQUIRED accessible name, the
// keyfield wiring and the busy convention; a raw <input>, <select> or <textarea> beside them bypasses all three.
// The count only falls: draw the control with Field, then lower BUDGET to the new count.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");
/** Raw text controls outside Field.tsx, measured by this walk. */
const BUDGET = 41;
const NOT_TEXT = /\btype\s*=\s*["'{`]*\s*["']?(checkbox|radio|file|range|hidden|color)\b/;

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name.startsWith(".")) return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.tsx$/.test(e.name) ? [p] : [];
  });

const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Every `<input|select|textarea …>` opening tag, read to its closing `>` outside braces and quotes. */
function openings(src: string): string[] {
  const out: string[] = [];
  const re = /<(input|select|textarea)\b/g;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    let depth = 0;
    let quote = "";
    let i = m.index + m[0].length;
    for (; i < src.length; i++) {
      const c = src[i] ?? "";
      if (quote !== "") {
        if (c === quote) quote = "";
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

const walked = [...files(join(ROOT, "app")), ...files(join(ROOT, "packages/ui/src"))].filter((f) => !f.split(sep).join("/").endsWith("components/field/Field.tsx"));
const raw = walked.flatMap((f) => openings(stripComments(readFileSync(f, "utf8"))).filter((t) => !NOT_TEXT.test(t)).map(() => relative(ROOT, f)));

describe("raw text controls", () => {
  test("the walk read the tree", () => {
    expect(walked.length).toBeGreaterThan(200);
  });

  test("the scanner reads a tag through braces and arrows", () => {
    const t = openings('<input onChange={(e) => set(e.currentTarget.value)} type="checkbox" /><input value={a > b ? 1 : 2} />');
    expect(t.length).toBe(2);
    expect(NOT_TEXT.test(t[0] ?? "")).toBe(true);
    expect(NOT_TEXT.test(t[1] ?? "")).toBe(false);
  });

  test("the count only falls", () => {
    const by = new Map<string, number>();
    for (const f of raw) by.set(f, (by.get(f) ?? 0) + 1);
    expect(raw.length, [...by].map(([f, n]) => `${n} ${f}`).join("\n")).toBeLessThanOrEqual(BUDGET);
  });
});
