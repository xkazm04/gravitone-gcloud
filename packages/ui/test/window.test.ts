import { describe, expect, it } from "vitest";

import {
  columnsFor, pageStep, prefixOffsets, revealTop, rowAt, sameWindow, windowBound, windowOf, type Layout,
} from "../src/window/core.ts";

describe("a uniform list", () => {
  const layout: Layout = { kind: "list", rowHeight: 40 };
  it("holds the rows in view plus overscan each side, half-open", () => {
    const w = windowOf({ count: 1000, layout, viewport: 400, scrollTop: 4000, overscan: 2 });
    expect([w.start, w.end]).toEqual([98, 112]);
    expect(w.padTop).toBe(98 * 40);
    expect(w.padTop + w.shown * 40 + w.padBottom).toBe(w.total);
  });
  it("clamps at both ends", () => {
    expect(windowOf({ count: 5, layout, viewport: 400, scrollTop: 0, overscan: 2 })).toMatchObject({ start: 0, end: 5, padBottom: 0 });
    expect(windowOf({ count: 1000, layout, viewport: 400, scrollTop: 1e9, overscan: 2 })).toMatchObject({ end: 1000, padBottom: 0 });
  });
  it("an empty list holds nothing", () => {
    expect(windowOf({ count: 0, layout, viewport: 400, scrollTop: 0, overscan: 2 }).shown).toBe(0);
  });
});

describe("measured rows (v1 shelf.ts)", () => {
  const heights = [30, 30, 120, 30, 30, 30, 30, 30];
  const offsets = prefixOffsets(heights);
  it("prefixOffsets ends at the full height", () => {
    expect(offsets.at(-1)).toBe(330);
  });
  it("rowAt finds the row whose box holds y", () => {
    expect(rowAt(offsets, 0)).toBe(0);
    expect(rowAt(offsets, 59)).toBe(1);
    expect(rowAt(offsets, 60)).toBe(2);
    expect(rowAt(offsets, 179)).toBe(2);
    expect(rowAt(offsets, 10_000)).toBe(7);
  });
  it("the spacers add up to the full height", () => {
    const w = windowOf({ count: heights.length, layout: { kind: "measured", offsets }, viewport: 50, scrollTop: 100, overscan: 1 });
    expect([w.start, w.end]).toEqual([1, 4]);
    expect(w.padTop + heights.slice(w.start, w.end).reduce((a, b) => a + b, 0) + w.padBottom).toBe(330);
  });
});

describe("a grid follows the width (the prototype Library)", () => {
  const grid = (width: number): Layout => ({ kind: "grid", width, minTile: 206, gap: 12, rowHeight: 200, pad: 14 });
  it("columns = floor((inner + gap) / (min + gap)), never below one", () => {
    expect(columnsFor(1200, 206, 12, 14)).toBe(5);
    expect(columnsFor(100, 206, 12, 14)).toBe(1);
  });
  it("holds whole rows: start and end land on row boundaries", () => {
    const w = windowOf({ count: 1003, layout: grid(1200), viewport: 800, scrollTop: 5000, overscan: 2 });
    expect(w.columns).toBe(5);
    expect(w.start % 5).toBe(0);
    expect(w.end % 5 === 0 || w.end === 1003).toBe(true);
  });
  it("a narrower viewport re-flows to fewer columns", () => {
    expect(windowOf({ count: 100, layout: grid(500), viewport: 800, scrollTop: 0, overscan: 0 }).columns).toBe(2);
  });
});

describe("§9.5: the Library at 50,000 items never holds more than a viewport plus overscan", () => {
  const COUNT = 50_000;
  const cases: [string, Layout][] = [
    ["grid", { kind: "grid", width: 1440, minTile: 150, gap: 8, rowHeight: 134, pad: 14 }],
    ["list", { kind: "list", rowHeight: 34 }],
    ["measured", { kind: "measured", offsets: prefixOffsets(Array.from({ length: COUNT }, (_, i) => 34 + (i % 7) * 6)) }],
  ];
  it.each(cases)("%s over 1,000 scroll positions", (_name, layout) => {
    const viewport = 900;
    const overscan = 2;
    const bound = windowBound(layout, viewport, overscan, 34);
    const t0 = performance.now();
    const total = windowOf({ count: COUNT, layout, viewport, scrollTop: 0, overscan }).total;
    let worst = 0;
    for (let i = 0; i < 1000; i++) {
      const scrollTop = Math.floor((total - viewport) * (i / 999));
      const w = windowOf({ count: COUNT, layout, viewport, scrollTop, overscan });
      worst = Math.max(worst, w.shown);
      expect(w.shown).toBeLessThanOrEqual(bound);
      expect(w.shown).toBeGreaterThan(0);
    }
    const ms = performance.now() - t0;
    console.log(`window ${_name}: 50,000 items x 1,000 positions, worst held ${worst} (bound ${bound}), ${ms.toFixed(1)} ms`);
  });
});

describe("reveal and paging", () => {
  const layout: Layout = { kind: "list", rowHeight: 40 };
  it("brings an item above the view to the top, below the view to the bottom, else leaves the scroll alone", () => {
    expect(revealTop({ count: 100, layout, viewport: 400, scrollTop: 800 }, 5)).toBe(200);
    expect(revealTop({ count: 100, layout, viewport: 400, scrollTop: 800 }, 40)).toBe(1640 - 400);
    expect(revealTop({ count: 100, layout, viewport: 400, scrollTop: 800 }, 22)).toBe(800);
    expect(revealTop({ count: 100, layout, viewport: 400, scrollTop: 800 }, 500)).toBe(800);
  });
  it("PgDn moves whole visible rows times columns", () => {
    expect(pageStep({ kind: "grid", width: 1200, minTile: 206, gap: 12, rowHeight: 200, pad: 14 }, 800)).toBe(20);
    expect(pageStep(layout, 400)).toBe(10);
  });
  it("sameWindow ignores a scroll inside one row: no re-render", () => {
    const a = windowOf({ count: 1000, layout, viewport: 400, scrollTop: 4001, overscan: 2 });
    const b = windowOf({ count: 1000, layout, viewport: 400, scrollTop: 4039, overscan: 2 });
    const c = windowOf({ count: 1000, layout, viewport: 400, scrollTop: 4040, overscan: 2 });
    expect(sameWindow(a, b)).toBe(true);
    expect(sameWindow(a, c)).toBe(false);
  });
});
