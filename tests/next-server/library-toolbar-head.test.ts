// THE LIBRARY HEAD SAYS WHAT THE WORK HOLDS (app/(studio)/library/_library/Toolbar.tsx): the total is the
// Tally, and how many rows the DOM holds is the live lane's figure on a data attribute, not a chip.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { Toolbar } = await import("../../app/(studio)/library/_library/Toolbar.tsx");

const noop = (): void => undefined;
const html = (): string =>
  renderToStaticMarkup(
    createElement(Toolbar, {
      u: { kind: "all", f: {}, q: "", sort: "new", sel: null } as never,
      groups: [],
      parsed: { words: [], tokens: [] } as never,
      total: 5000,
      shown: 42,
      view: "grid",
      density: "m",
      detailOn: false,
      railOn: false,
      onSearch: noop,
      onToResults: noop,
      onRemove: noop,
      onClear: noop,
      onRoot: noop,
      onKindOnly: noop,
      onSort: noop,
      onView: noop,
      onDensity: noop,
      onDetail: noop,
      onRail: noop,
    }),
  );

describe("the results head", () => {
  it("draws no 'rendered N of M' chip", () => {
    expect(html()).not.toMatch(/rendered\s+[\d,]+\s+of/i);
  });

  it("holds the DOM row count on the head for the live lane", () => {
    expect(html()).toMatch(/data-rendered="42"/);
  });

  it("still draws the work's total", () => {
    expect(html()).toContain("5,000");
  });
});
