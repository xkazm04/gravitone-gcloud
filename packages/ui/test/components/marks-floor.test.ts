// A dashed rim is a mark, and a mark holds 3:1 (WCAG 1.4.11; CLAUDE.md "a mark holds 3:1"). The
// live lane measures it only on the screens it photographs; this measures it on every ground a
// mark can land on, from the shipped CSS modules and tokens.css, so a token or a mix percentage
// that sinks a rim fails here first. Each rim is read out of its stylesheet, not restated: a
// changed percentage changes the figure.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { TONES, type Tone } from "../../src/components/chip/tone.ts";

const MARK_FLOOR = 3;
const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const read = (rel: string): string => readFileSync(join(src, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
const tokens = read("tokens.css");

type Rgba = readonly [number, number, number, number];

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens);
  if (m?.[1] === undefined) throw new Error(`tokens.css has no --${name}`);
  return m[1].trim();
}

function literal(v: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex?.[1] !== undefined) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)).concat(1) as unknown as Rgba;
  const fn = /^rgba?\(([^)]+)\)$/.exec(v);
  if (fn?.[1] === undefined) throw new Error(`not a colour: ${v}`);
  const [r = 0, g = 0, b = 0, a = 1] = fn[1].split(",").map(Number);
  return [r, g, b, a];
}

/** A CSS colour as these modules spell one: a token, a literal, currentColor, or a mix to transparent. */
function colour(v: string, current: Rgba): Rgba {
  const s = v.trim();
  if (s === "currentColor") return current;
  const ref = /^var\(--([\w-]+)\)$/.exec(s);
  if (ref?.[1] !== undefined) return colour(token(ref[1]), current);
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*transparent\)$/.exec(s);
  if (mix?.[1] !== undefined && mix[2] !== undefined) {
    const [r, g, b, a] = colour(mix[1], current);
    return [r, g, b, a * (Number(mix[2]) / 100)];
  }
  return literal(s);
}

const lum = ([r, g, b]: Rgba): number => {
  const f = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const over = ([r, g, b, a]: Rgba, [R, G, B]: Rgba): Rgba => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
const ratio = (fg: Rgba, ground: Rgba): number => {
  const [hi, lo] = [lum(over(fg, ground)), lum(ground)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** The declarations of the rule whose selector is exactly `selector`; undefined when none is. */
function rule(css: string, selector: string): Record<string, string> | undefined {
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (m[1]?.trim() !== selector) continue;
    const out: Record<string, string> = {};
    for (const d of (m[2] ?? "").split(/;(?![^(]*\))/)) {
      const i = d.indexOf(":");
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
    return out;
  }
  return undefined;
}

function must(css: string, selector: string): Record<string, string> {
  const r = rule(css, selector);
  if (r === undefined) throw new Error(`no ${selector} rule`);
  return r;
}

/** Every surface a mark sits on: the page ink, the panels, and the raised pop/tooltip ground. */
const GROUNDS = ["ink", "ink-1", "ink-2", "ink-3", "ink-4"] as const;
const ground = (g: (typeof GROUNDS)[number]): Rgba => literal(token(g));

const chip = read("components/chip/Chip.module.css");
const textOf = (tone: Tone): string => (tone === "neutral" ? must(chip, ".chip")["color"]! : must(chip, `.${tone}`)["color"]!);

describe("a dashed rim holds the mark floor on every ground", () => {
  test("the rules this reads exist (a vacuous pass would read nothing)", () => {
    expect(must(chip, ".ghost")["border-color"]).toMatch(/color-mix/);
    expect(TONES.length).toBeGreaterThanOrEqual(6);
  });

  test("Chip ghost, at rest, in every tone", () => {
    const low: string[] = [];
    for (const tone of TONES) {
      const rim = must(chip, ".ghost")["border-color"]!;
      for (const g of GROUNDS) {
        const r = ratio(colour(rim, colour(textOf(tone), [0, 0, 0, 1])), ground(g));
        if (r < MARK_FLOOR) low.push(`${tone} on ${g}: ${r.toFixed(2)}`);
      }
    }
    expect(low).toEqual([]);
  });

  test("Chip ghost that is a door, under the pointer (the hover rule must not swap the rim for a hairline)", () => {
    const hover = must(chip, ".door:hover");
    // The rim on hover is the most specific rule that sets one for a ghost door; else the door's.
    const own = rule(chip, ".ghost.door:hover") ?? rule(chip, ".door.ghost:hover");
    const rim = own?.["border-color"] ?? hover["border-color"]!;
    const text = hover["color"] ?? textOf("neutral");
    const low = GROUNDS.map((g) => [g, ratio(colour(rim, colour(text, [0, 0, 0, 1])), ground(g))] as const).filter(([, r]) => r < MARK_FLOOR);
    expect(low).toEqual([]);
  });

  test("Ghost card outline", () => {
    const border = must(read("components/ghost/Ghost.module.css"), ".card")["border"]!;
    const rim = /dashed\s+(.+)$/.exec(border)?.[1];
    expect(rim).toBeDefined();
    const low = GROUNDS.map((g) => [g, ratio(colour(rim!, [0, 0, 0, 1]), ground(g))] as const).filter(([, r]) => r < MARK_FLOOR);
    expect(low).toEqual([]);
  });
});
