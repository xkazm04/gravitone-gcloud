// RangePick's geometry: a handle meets the bounds its partner and the length limits leave it, the span dragged
// as one keeps its width and stops at the song's ends, a key moves a tenth or a second, and the markup speaks
// each handle's bounds and time.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { clockTenths, effective, endBounds, fitSpan, keyDelta, moveSpan, setEnd, setStart, startBounds, xToS } from "../../src/components/rangepick/rangepick.ts";
import { RangePick } from "../../src/components/rangepick/RangePick.tsx";

const lim = { lenS: 200, minS: 10, maxS: 60 };

describe("rangepick geometry", () => {
  test("the start handle stays between the longest and the shortest span the end allows", () => {
    const span = { startS: 50, endS: 100 };
    expect(startBounds(span, lim)).toEqual({ min: 40, max: 90 });
    expect(setStart(span, 10, lim)).toEqual({ startS: 40, endS: 100 });
    expect(setStart(span, 95, lim)).toEqual({ startS: 90, endS: 100 });
    expect(setStart({ startS: 5, endS: 30 }, -3, lim)).toEqual({ startS: 0, endS: 30 });
  });

  test("the end handle stays inside the song and the length limits", () => {
    const span = { startS: 50, endS: 100 };
    expect(endBounds(span, lim)).toEqual({ min: 60, max: 110 });
    expect(setEnd(span, 500, lim)).toEqual({ startS: 50, endS: 110 });
    expect(setEnd(span, 51, lim)).toEqual({ startS: 50, endS: 60 });
    expect(setEnd({ startS: 180, endS: 195 }, 260, lim)).toEqual({ startS: 180, endS: 200 });
  });

  test("the span dragged as one keeps its width and stops at either end", () => {
    const span = { startS: 50, endS: 80 };
    expect(moveSpan(span, 12.34, lim)).toEqual({ startS: 62.3, endS: 92.3 });
    expect(moveSpan(span, -999, lim)).toEqual({ startS: 0, endS: 30 });
    expect(moveSpan(span, 999, lim)).toEqual({ startS: 170, endS: 200 });
  });

  test("keys: arrows a tenth, shift a second, any other key nothing", () => {
    expect(keyDelta("ArrowRight", false)).toBe(0.1);
    expect(keyDelta("ArrowLeft", false)).toBe(-0.1);
    expect(keyDelta("ArrowUp", true)).toBe(1);
    expect(keyDelta("ArrowDown", true)).toBe(-1);
    expect(keyDelta("Enter", false)).toBeNull();
    let span = { startS: 50, endS: 60 };
    span = setEnd(span, span.endS + (keyDelta("ArrowLeft", false) ?? 0), lim);
    expect(span).toEqual({ startS: 50, endS: 60 });
    span = setStart(span, span.startS + (keyDelta("ArrowRight", true) ?? 0), lim);
    expect(span).toEqual({ startS: 50, endS: 60 });
  });

  test("a song shorter than the least length leaves only the whole song", () => {
    const short = { lenS: 6, minS: 10, maxS: 60 };
    expect(effective(short)).toEqual({ lenS: 6, minS: 6, maxS: 6 });
    expect(fitSpan({ startS: 2, endS: 3 }, short)).toEqual({ startS: 0, endS: 6 });
    expect(fitSpan({ startS: 0, endS: 300 }, lim)).toEqual({ startS: 0, endS: 60 });
    expect(fitSpan({ startS: 195, endS: 199 }, lim)).toEqual({ startS: 190, endS: 200 });
  });

  test("a pointer's x maps to seconds inside the song, and a time reads in tenths", () => {
    expect(xToS(250, 1000, 200)).toBe(50);
    expect(xToS(-20, 1000, 200)).toBe(0);
    expect(xToS(2000, 1000, 200)).toBe(200);
    expect(xToS(10, 0, 200)).toBe(0);
    expect(clockTenths(64.34)).toBe("1:04.3");
    expect(clockTenths(5)).toBe("0:05.0");
    expect(clockTenths(59.96)).toBe("1:00.0");
  });
});

describe("RangePick markup", () => {
  test("each handle is a slider with its own bounds and its time as text", () => {
    const html = renderToStaticMarkup(h(RangePick, { label: "Tears", peaks: [0.2, 0.8, 0.5], lenS: 200, minS: 10, maxS: 60, value: { startS: 50, endS: 100 }, onChange: () => undefined, playheadS: 70 }));
    expect(html).toContain('aria-label="section start of Tears"');
    expect(html).toContain('aria-valuemin="40" aria-valuemax="90" aria-valuenow="50" aria-valuetext="0:50.0"');
    expect(html).toContain('aria-label="section end of Tears"');
    expect(html).toContain('aria-valuemin="60" aria-valuemax="110" aria-valuenow="100" aria-valuetext="1:40.0"');
    expect(html).toContain("50.0 s");
  });
});
