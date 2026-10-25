// The Library's parts (Phase 5, L50): the tile and row arithmetic, the rail's value order and
// fold, the blocks a window asks for, what each key does to the selection, the Esc cascade - and
// what the parts expose, rendered with react-dom/server (Vitest runs without a DOM; the route is
// driven live in tests/live/library.live.spec.ts).
import { readFileSync } from "node:fs";

import { LIBRARY_STATES } from "@gt/domain/library";
import { createElement as h, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { DetailFacets, DetailPanel } from "../../src/components/library/DetailPanel.tsx";
import { backStep, blocksFor, BLOCK, foldValues, layoutFor, orderValues, SIZES, stepTo, tileBox, type FacetValue } from "../../src/components/library/library.ts";
import { LibraryRow } from "../../src/components/library/LibraryRow.tsx";
import rowCss from "../../src/components/library/LibraryRow.module.css";
import { cardName, LibraryTile, type LibraryCard } from "../../src/components/library/LibraryTile.tsx";
import { KINDS, LibraryGlyph } from "../../src/components/library/LibraryGlyph.tsx";
import { Lineage } from "../../src/components/library/Lineage.tsx";
import { LookStrip } from "../../src/components/library/LookStrip.tsx";
import { Rail, type RailGroup } from "../../src/components/library/Rail.tsx";
import { SetSummary } from "../../src/components/library/SetSummary.tsx";
import { columnsFor, windowOf } from "../../src/window/core.ts";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(el);
const noop = (): void => {};
const fv = (value: string, count: number, selected = false): FacetValue => ({ value, label: value, count, selected });

describe("geometry", () => {
  test("the sizes are the prototype's: tiles 150/206/300, captions 32/48/48, list rows 34/40/56", () => {
    expect([SIZES.s.tile, SIZES.m.tile, SIZES.l.tile]).toEqual([150, 206, 300]);
    expect([SIZES.s.caption, SIZES.m.caption, SIZES.l.caption]).toEqual([32, 48, 48]);
    expect([SIZES.s.row, SIZES.m.row, SIZES.l.row]).toEqual([34, 40, 56]);
  });

  test("a tile is (inner - gaps) / columns wide with a 16:10 thumb; the window's columns agree", () => {
    const b = tileBox(835, "m"); // the centre column at 1440: 1440 - 245 - 360
    expect(b.columns).toBe(3);
    expect(b.thumb).toBe(Math.round((b.width * 10) / 16));
    expect(b.height).toBe(b.thumb + 48);
    const lay = layoutFor("grid", "m", 835);
    if (lay.kind !== "grid") throw new Error("grid expected");
    expect(columnsFor(lay.width, lay.minTile, lay.gap, lay.pad)).toBe(b.columns);
    expect(lay.rowHeight).toBe(b.height + SIZES.m.gap);
  });

  test("50,000 rows in a grid hold one screen of tiles, not 50,000", () => {
    const w = windowOf({ count: 50_000, layout: layoutFor("grid", "s", 1200), viewport: 900, scrollTop: 2_000_000, overscan: 2 });
    expect(w.shown).toBeLessThan(120);
    expect(w.start % w.columns).toBe(0);
  });
});

describe("the rail's values", () => {
  test("by count then label; a selected value the counts no longer name is kept at 0", () => {
    const out = orderValues("mood", [fv("warm", 3), fv("tense", 9), fv("bright", 3)], ["ominous"]);
    expect(out.map((v) => [v.value, v.count, v.selected])).toEqual([
      ["tense", 9, false],
      ["bright", 3, false],
      ["warm", 3, false],
      ["ominous", 0, true],
    ]);
  });

  test("state keeps the Library's order, never the count's", () => {
    expect(orderValues("state", [fv("unjudged", 900), fv("reference", 1), fv("ratified", 50)], []).map((v) => v.value)).toEqual(["reference", "ratified", "unjudged"]);
  });

  test("seven rows then +N more - unless the rest is two or fewer; a selected value past the fold is drawn", () => {
    const nine = Array.from({ length: 9 }, (_, i) => fv(`v${i}`, 9 - i));
    expect(foldValues(nine, false)).toMatchObject({ hidden: 0, canFold: false });
    const ten = [...nine, fv("v9", 0, true)];
    const f = foldValues(ten, false);
    expect(f.shown.map((v) => v.value)).toEqual(["v0", "v1", "v2", "v3", "v4", "v5", "v6", "v9"]);
    expect(f.hidden).toBe(2);
    expect(foldValues(ten, true)).toMatchObject({ hidden: 0, canFold: true });
  });

  test("every Library state has its dot on the rail and in a tile, and its segment in the set's bar", () => {
    // One authority per vocabulary (faceting-and-filters): the states are @gt/domain/library's,
    // and each place that colours a state must carry a class for every one of them.
    const css = (f: string): string => readFileSync(new URL(`../../src/components/library/${f}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const f of ["LibraryTile.module.css", "SetSummary.module.css"]) {
      const text = css(f);
      expect(text.length).toBeGreaterThan(0);
      for (const st of LIBRARY_STATES) expect(text, `${f} .${st}`).toMatch(new RegExp(`\\.${st}\\{`));
    }
    const all: RailGroup = { key: "state", label: "state", section: "state", values: LIBRARY_STATES.map((st) => fv(st, 1)) };
    const out = html(h(Rail, { kind: "all", kindCounts: {}, groups: [all], closed: new Set<string>(), expanded: new Set<string>(), onKind: noop, onToggle: noop, onFold: noop, onMore: noop }));
    const leads = out.match(/<span class="[^"]*"><\/span>/g) ?? [];
    expect(leads.length).toBe(LIBRARY_STATES.length);
  });

  test("Attention appears only while something needs attention; the vocabulary heads its kind", () => {
    const groups: RailGroup[] = [
      { key: "genre", label: "genre", section: "vocabulary", values: [fv("ambient", 4)] },
      { key: "attention", label: "attention", section: "attention", values: [fv("missing", 0)] },
      { key: "state", label: "state", section: "state", values: [fv("ratified", 4)] },
    ];
    const props = { kind: "audio" as const, kindCounts: { all: 4, audio: 4 }, closed: new Set<string>(), expanded: new Set<string>(), onKind: noop, onToggle: noop, onFold: noop, onMore: noop };
    const quiet = html(h(Rail, { ...props, groups }));
    expect(quiet).not.toContain('aria-label="Attention"');
    expect(quiet).toContain("vocabulary · audio");
    const loud = html(h(Rail, { ...props, groups: groups.map((g) => (g.key === "attention" ? { ...g, values: [fv("missing", 2)] } : g)) }));
    expect(loud).toContain('aria-label="Attention"');
  });
});

describe("blocks and keys", () => {
  test("the blocks a window overlaps, and none for an empty window", () => {
    expect(blocksFor(0, BLOCK)).toEqual([0]);
    expect(blocksFor(BLOCK - 1, BLOCK + 1)).toEqual([0, 1]);
    expect(blocksFor(5, 5)).toEqual([]);
  });

  test("arrows walk by one and by a row of columns; a list has no left or right; prev/next are one in either", () => {
    expect(stepTo(5, "down", 100, 4, 12, "grid")).toBe(9);
    expect(stepTo(5, "right", 100, 4, 12, "grid")).toBe(6);
    expect(stepTo(5, "right", 100, 4, 12, "list")).toBe(5);
    expect(stepTo(5, "next", 100, 4, 12, "list")).toBe(6);
    expect(stepTo(5, "page-down", 100, 4, 12, "grid")).toBe(17);
    expect(stepTo(98, "page-down", 100, 4, 12, "grid")).toBe(99);
    expect(stepTo(-1, "down", 100, 4, 12, "grid")).toBe(0);
    expect(stepTo(-1, "last", 100, 4, 12, "grid")).toBe(99);
    expect(stepTo(3, "down", 0, 4, 12, "grid")).toBe(-1);
  });

  test("Esc backs out one layer per press, nearest first", () => {
    const all = { railDrawer: true, detailDrawer: true, selected: true, query: true };
    expect(backStep(all)).toBe("close-rail");
    expect(backStep({ ...all, railDrawer: false })).toBe("close-detail");
    expect(backStep({ ...all, railDrawer: false, detailDrawer: false })).toBe("deselect");
    expect(backStep({ railDrawer: false, detailDrawer: false, selected: false, query: true })).toBe("clear-query");
    expect(backStep({ railDrawer: false, detailDrawer: false, selected: false, query: false })).toBe("nothing");
  });
});

describe("what the parts expose", () => {
  const c: LibraryCard = { id: "video-0003", kind: "video", title: "Peak and Fall · ad spot 8", meta: "captions vtt", state: "rejected", source: "fixture", date: "2026-09-03", attention: "unreadable", chips: ["ad"], face: { kind: "designed", lead: "video", name: "Peak and Fall", tail: "vtt" } };

  test("a tile and a row are options named by title, kind, state and the media trouble - never a tab stop", () => {
    expect(cardName(c)).toBe("Peak and Fall · ad spot 8, video, rejected, media unreadable");
    for (const el of [h(LibraryTile, { card: c, selected: true, domId: "x", onSelect: noop, onOpen: noop }), h(LibraryRow, { card: c, selected: false, domId: "y", onSelect: noop, onOpen: noop })]) {
      const out = html(el);
      expect(out).toMatch(/role="option"/);
      expect(out).not.toMatch(/tabindex/i);
      expect(out).toContain("media unreadable");
    }
  });

  test("a locked style's option names the lock the tile draws", () => {
    const style: LibraryCard = { ...c, id: "style-0001", kind: "style", state: "ratified", locked: true, chips: [] };
    expect(cardName(style)).toBe("Peak and Fall · ad spot 8, style, ratified, locked, media unreadable");
    expect(cardName({ ...style, locked: false })).not.toContain("locked");
  });

  test("the options are memoized and hand their id to the handlers, so a selection step re-renders only the two it changes", () => {
    const memo = Symbol.for("react.memo");
    expect((LibraryTile as unknown as { $$typeof: symbol }).$$typeof).toBe(memo);
    expect((LibraryRow as unknown as { $$typeof: symbol }).$$typeof).toBe(memo);
    for (const Opt of [LibraryTile, LibraryRow]) {
      const picked: string[] = [];
      const opened: string[] = [];
      const render = (Opt as unknown as { type: (p: object) => { props: { onClick: () => void; onDoubleClick: () => void } } }).type;
      const el = render({ card: c, selected: false, domId: "o", onSelect: (id: string) => picked.push(id), onOpen: (id: string) => opened.push(id) });
      el.props.onClick();
      el.props.onDoubleClick();
      expect(picked).toEqual([c.id]);
      expect(opened).toEqual([c.id]);
    }
  });

  test("a locked style wears its lock in the list as the grid does; an unlocked one wears none", () => {
    const style: LibraryCard = { ...c, id: "style-0001", kind: "style", state: "ratified", locked: true, chips: [] };
    const row = (card: LibraryCard): string => html(h(LibraryRow, { card, selected: false, domId: "r", onSelect: noop, onOpen: noop }));
    expect(row(style)).toContain(`class="${rowCss.lock}"`);
    expect(row({ ...style, locked: false })).not.toContain(rowCss.lock);
  });

  test("a row's facet chips keep distinct keys when two groups share a label (plate: family collage, render_mode collage)", () => {
    // The fixture corpus has 382 of 5,000 rows like this; keyed by label, React drops or duplicates a chip on update.
    const keysUnder = (node: unknown, out: string[][] = []): string[][] => {
      if (Array.isArray(node)) {
        out.push(node.flatMap((n) => (isValidElement(n) && n.key !== null ? [n.key] : [])));
        for (const n of node) keysUnder(n, out);
      } else if (isValidElement<{ children?: unknown }>(node)) keysUnder(node.props.children, out);
      return out;
    };
    const plate: LibraryCard = { ...c, id: "plate-0004", kind: "plate", chips: ["collage", "collage", "forge"] };
    const lists = keysUnder((LibraryRow as unknown as { type: (p: object) => unknown }).type({ card: plate, selected: false, domId: "z", onSelect: noop, onOpen: noop }));
    const chipKeys = lists.find((l) => l.length === 3);
    expect(chipKeys).toBeDefined();
    expect(new Set(chipKeys).size).toBe(3);
  });

  test("a detail facet chip says when it is in the filter; a lineage node of the item is current", () => {
    const facets = html(h(DetailFacets, { lines: [{ group: "format", label: "format", values: [{ value: "ad", label: "ad", pressed: true }] }], onPress: noop }));
    expect(facets).toContain('aria-pressed="true"');
    expect(facets).toContain("format: ad, in the filter");
    const lin = html(h(Lineage, { nodes: [{ role: "project", refs: [{ kind: "facet", group: "project", value: "p", label: "Peak and Fall" }] }, { role: "this", self: true, refs: [{ kind: "text", label: "video" }] }], onItem: noop, onFacet: noop }));
    expect(lin).toContain('aria-current="true"');
  });
});

describe("the set and the detail head", () => {
  const sum = { total: 1204, of: 5000, newest: [], onState: noop, onKind: noop, onItem: noop };

  test("a state with no items is no door, and the bar names what it holds - or that it holds nothing", () => {
    const out = html(h(SetSummary, { ...sum, kind: "plate", states: { ratified: 1200, rejected: 4, unjudged: 0 }, kinds: { plate: 1204 } }));
    expect(out).toContain('aria-label="ratified 1200, rejected 4"');
    expect(out).toContain('aria-label="filter: ratified, 1200"');
    expect(out).not.toContain("filter: unjudged");
    expect(out).toContain("1,204");
    expect(out).not.toContain('aria-label="Kinds"');
    expect(html(h(SetSummary, { ...sum, total: 0, kind: "plate", states: {}, kinds: {} }))).toContain('aria-label="no items"');
  });

  test("the kinds' bars appear on All only, one per kind that holds something", () => {
    const out = html(h(SetSummary, { ...sum, kind: "all", states: { ratified: 1204 }, kinds: { all: 1204, plate: 1200, doc: 4, audio: 0 } }));
    expect(out).toContain('aria-label="Kinds"');
    expect(out).toContain("Plates");
    expect(out).toContain("Documents");
    expect(out).not.toContain("Audio");
  });

  test("the detail head counts from one and offers previous / next only when it can step", () => {
    const stepping = html(h(DetailPanel, { kind: "plate", position: { index: 2, total: 1204 }, onStep: noop, onClose: noop, children: null }));
    expect(stepping).toContain("3 / 1,204");
    expect(stepping).toContain('aria-label="previous item"');
    const still = html(h(DetailPanel, { kind: "set", onClose: noop, children: null }));
    expect(still).not.toContain('aria-label="next item"');
    expect(still).toContain('aria-label="close detail"');
  });
});

describe("a character's looks (spark scout-use-aim)", () => {
  const looks = [
    { key: "risograph-two-colour", image: "/a.png", label: "risograph-two-colour", sub: "risograph two-colour print" },
    { key: "35mm-anamorphic", image: "/b.png", label: "35mm-anamorphic", pressed: true },
    { key: "2026-10-23-2", image: "/c.png", label: "2026-10-23-2", inert: true },
  ];

  test("a look is a door that says when it is pressed; a night that kept no look is a figure, never a door", () => {
    const out = html(h(LookStrip, { looks, onPress: noop }));
    expect(out.match(/<button/g)).toHaveLength(2);
    expect(out.match(/<figure/g)).toHaveLength(1);
    expect(out).toContain('aria-pressed="true"');
    expect(out).toContain('aria-pressed="false"');
  });

  test("with no door at all every look is a figure, and the picture is named by its look and genre rung", () => {
    const out = html(h(LookStrip, { looks }));
    expect(out).not.toContain("<button");
    expect(out.match(/<figure/g)).toHaveLength(3);
    expect(out).toContain('alt="risograph-two-colour · risograph two-colour print"');
    expect(out).toContain('alt="35mm-anamorphic"');
  });

  test("the character kind has a mark, a rail row and a word", () => {
    expect(KINDS.at(-1)).toEqual({ id: "character", label: "Characters", short: "character" });
    const out = html(h(LibraryGlyph, { name: "character" }));
    expect(out).toContain("<svg");
    expect(out).toContain('aria-hidden="true"');
  });
});
