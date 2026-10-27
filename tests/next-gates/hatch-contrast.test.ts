// --hatch marks an undecided or unmeasured span; its stripes are what tell it from empty, so
// they carry state and hold the 3:1 mark floor (WCAG 1.4.11) against the track they sit on.
// tests/live/_legibility.ts does not model gradients, so the stripe is composed here from
// source.json: the stripe colour over each track the hatch is drawn on.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MARK_FLOOR, contrastRatio, hexToRgb, over, type Rgb } from "../live/_legibility.ts";

const tokens = (JSON.parse(readFileSync(new URL("../../packages/ui/tokens/source.json", import.meta.url), "utf8")) as {
  groups: { tokens: { name: string; value: string }[] }[];
}).groups.flatMap((g) => g.tokens);
const value = (name: string): string => {
  const t = tokens.find((x) => x.name === name);
  if (!t) throw new Error(`no token ${name}`);
  return t.value;
};
const rgba = (v: string): [number, number, number, number] => {
  const m = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/.exec(v);
  if (!m) throw new Error(`not rgba: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
};

/** The stripe colour and alpha of the hatch gradient (its first colour stop). */
function stripe(): { rgb: Rgb; alpha: number } {
  const m = /rgba\([^)]*\)/.exec(value("hatch"));
  if (!m) throw new Error("hatch has no rgba stripe");
  const [r, g, b, a] = rgba(m[0]);
  return { rgb: [r, g, b], alpha: a };
}

/** Every ground a hatch is drawn on: the page ink, the raised ink, the StackBar track
 *  (wash-hi over ink) and the level sheet's lighter end. */
function tracks(): Record<string, Rgb> {
  const hi = rgba(value("wash-hi"));
  const hiRgb: Rgb = [hi[0], hi[1], hi[2]];
  const ink = hexToRgb(value("ink"));
  const ink2 = hexToRgb(value("ink-2"));
  const sheet = /#[0-9a-f]{6}/gi.exec(value("sheet-ground"));
  return {
    ink,
    "ink-2": ink2,
    "wash-hi over ink": over(hiRgb, hi[3], ink),
    "wash-hi over ink-2": over(hiRgb, hi[3], ink2),
    "sheet-ground": hexToRgb(sheet![0]),
  };
}

describe("--hatch stripe contrast", () => {
  const s = stripe();
  for (const [name, track] of Object.entries(tracks())) {
    it(`reads at ${MARK_FLOOR}:1 or more on ${name}`, () => {
      expect(contrastRatio(over(s.rgb, s.alpha, track), track)).toBeGreaterThanOrEqual(MARK_FLOOR);
    });
  }
});
