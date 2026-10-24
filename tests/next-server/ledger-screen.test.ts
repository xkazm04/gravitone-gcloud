import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FacetCount } from "@gt/kernel/events-count";

import { Facets } from "../../app/(studio)/ledger/_ledger/Facets.tsx";
import { EMPTY, type LedgerFilter } from "../../app/(studio)/ledger/_ledger/filter.ts";
import { List } from "../../app/(studio)/ledger/_ledger/List.tsx";
import type { Facets as Counts } from "../../app/(studio)/ledger/_ledger/read.ts";
import { Toolbar } from "../../app/(studio)/ledger/_ledger/Toolbar.tsx";

// The Ledger's surfaces rendered without a browser: what each one draws for a given
// filter and answer - the states a filter can put them in, read off the markup.

const facet = (name: FacetCount["facet"], values: Record<string, number>): FacetCount => ({
  facet: name,
  values: Object.entries(values).map(([value, n]) => ({ value, n })),
  other: 0,
  truncated: false,
  none: 0,
});

const counts = (over: Partial<Counts> = {}): Counts => ({
  total: 3,
  head: 3,
  actor: { operator: 1, agent: 1, machine: 1, all: 3 },
  typeGroup: facet("typeGroup", { verdict: 2, run: 1 }),
  type: facet("type", { "verdict.keep": 2, "run.end": 1 }),
  lane: facet("lane", {}),
  source: facet("source", { forge: 3 }),
  ...over,
});

const f = (over: Partial<LedgerFilter> = {}): LedgerFilter => ({ ...EMPTY, ...over });

/** The facet rows drawn, as `label=pressed`. */
const rows = (html: string): string[] =>
  [...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => {
    const label = (m[2] ?? "").replace(/<[^>]+>/g, " ").trim().split(/\s+/)[0] ?? "";
    return `${label}=${m[1] ?? ""}`;
  });

describe("the facet rail", () => {
  it("draws a pressed full type even when its group holds no other type", () => {
    const html = renderToStaticMarkup(h(Facets, { filter: f({ type: ["verdict.keep"] }), facets: counts(), onApply: () => undefined }));
    expect(rows(html)).toContain("verdict.keep=true");
  });

  it("draws a pressed full type whose group the other filters count at zero", () => {
    const c = counts({ typeGroup: facet("typeGroup", { run: 1 }), type: facet("type", { "run.end": 1 }) });
    const html = renderToStaticMarkup(h(Facets, { filter: f({ type: ["verdict.keep"] }), facets: c, onApply: () => undefined }));
    expect(rows(html)).toContain("verdict.keep=true");
  });

  it("leaves a lone unpressed type folded into its group", () => {
    const html = renderToStaticMarkup(h(Facets, { filter: f(), facets: counts(), onApply: () => undefined }));
    expect(rows(html).filter((r) => r.startsWith("verdict"))).toEqual(["verdict=false"]);
  });
});

describe("the toolbar", () => {
  const bar = (filter: LedgerFilter) =>
    renderToStaticMarkup(
      h(Toolbar, {
        filter,
        facets: counts(),
        rows: [],
        capped: true,
        scanned: 5000,
        exhausted: false,
        ignored: [],
        live: { edge: "live", since: 0, armed: false },
        view: "table",
        facetsOpen: false,
        onFacets: () => undefined,
        onApply: () => undefined,
        onView: () => undefined,
        onRows: () => undefined,
      }),
    );

  it("names the end a stopped text search examined: the newest acts, or the oldest", () => {
    expect(bar(f({ q: "plate" }))).toContain('aria-label="text search examined the newest 5000 events"');
    expect(bar(f({ q: "plate", order: "asc" }))).toContain('aria-label="text search examined the oldest 5000 events"');
  });
});

describe("the list", () => {
  const list = (filter: LedgerFilter, answer: { capped: boolean; scanned: number; exhausted: boolean }) =>
    renderToStaticMarkup(
      h(List, {
        ref: null,
        filter,
        rows: [],
        head: 40,
        view: "table",
        sel: null,
        fresh: new Set<number>(),
        ...answer,
        loading: false,
        onOlder: () => undefined,
        onSelect: () => undefined,
        onOpen: () => undefined,
        onOrder: () => undefined,
        onReset: () => undefined,
        onCopy: () => undefined,
        onFocusChange: () => undefined,
      }),
    );
  const empty = (html: string): string => /role="status"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";

  it("an empty answer from a text search that stopped early says how far it looked, not that nothing matched", () => {
    expect(empty(list(f({ q: "plate" }), { capped: true, scanned: 5000, exhausted: false }))).toMatch(/^0 in the newest 5000 /);
    expect(empty(list(f({ q: "plate", order: "asc" }), { capped: true, scanned: 5000, exhausted: false }))).toMatch(/^0 in the oldest 5000 /);
  });

  it("an empty answer that examined everything is 0 events", () => {
    expect(empty(list(f({ q: "plate" }), { capped: false, scanned: 40, exhausted: true }))).toMatch(/^0 events /);
  });
});
