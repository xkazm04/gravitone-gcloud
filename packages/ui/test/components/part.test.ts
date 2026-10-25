// The part workspace (Phase 4 wave C, L38): how a verdict and a tab are drawn, how a clock reads,
// how a keyboard walk moves, what the part keymap answers, and the markup the frame speaks -
// pure functions over literal data, the components through react-dom/server.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { PartTab, PartVerdict } from "@gt/domain/partView";

import { PartTabs } from "../../src/components/part/PartTabs.tsx";
import { PartWorkspace, type PartWorkspaceProps } from "../../src/components/part/PartWorkspace.tsx";
import { RailList } from "../../src/components/part/RailList.tsx";
import { VerdictChip } from "../../src/components/part/VerdictChip.tsx";
import { clock, secs, stepTab, tabMark, verdictLook, walk } from "../../src/components/part/part.ts";
import { KEYMAP } from "../../src/keymap/bindings.ts";
import { chordsOf } from "../../src/keymap/chord.ts";
import { conflicts, keyTable, problems, resolve } from "../../src/keymap/keymap.ts";
import { NO_TARGET } from "../../src/keymap/target.ts";

const noop = (): void => undefined;
const tab = (key: string, kind: PartTab["kind"], verdict: PartTab["verdict"], editor = verdict !== null): PartTab => ({ partId: `p:${key}`, key, kind, label: key, verdict, editor });
const TABS: readonly PartTab[] = [tab("research", "research", "ready"), tab("script", "script", "working"), tab("frames", "frames", null, false), tab("gate:frames", "gate", null), tab("slot", "slot", null)];

describe("verdicts and tabs", () => {
  test("each verdict state has one look; an unknown state reads as blocked, never as ready", () => {
    expect(["empty", "working", "ready", "blocked"].map(verdictLook)).toEqual(["idle", "awaiting", "done", "failed"]);
    expect(verdictLook("done")).toBe("failed");
    expect(verdictLook("")).toBe("failed");
    // `in` reads the prototype chain: a state spelled like an Object member is still unknown.
    expect(Object.getOwnPropertyNames(Object.prototype).map(verdictLook).filter((l) => l !== "failed")).toEqual([]);
  });

  test("a tab names its state as a shape and a word: gates, the slot and editor-less parts are not editors", () => {
    expect(TABS.map((t) => tabMark(t).spoken)).toEqual(["ready", "working", "no editor yet", "gate", "slot"]);
    expect(tabMark(tab("x", "research", "blocked")).glyph).toBe("▲");
    expect(new Set(TABS.map((t) => tabMark(t).glyph)).size).toBe(TABS.length);
  });

  test("[ and ] step only between parts that have an editor, and stop at the ends", () => {
    expect(stepTab(TABS, "research", 1)?.key).toBe("script");
    expect(stepTab(TABS, "script", 1)).toBeNull();
    expect(stepTab(TABS, "research", -1)).toBeNull();
    expect(stepTab(TABS, "frames", 1)).toBeNull();
  });
});

describe("figures", () => {
  test("a clock rounds to the second: v1 drew 120.00000000000004s", () => {
    expect(clock(120.00000000000004)).toBe("2:00");
    expect(clock(299.6)).toBe("5:00");
    expect(clock(31)).toBe("0:31");
    expect(clock(null)).toBe("—");
    expect(clock(Number.NaN)).toBe("—");
    expect(secs(4.449999)).toBe("4.4s");
  });
});

describe("the keyboard walk", () => {
  const ids = ["a", "b", "c"];
  test("moves by identity and wraps", () => {
    expect(walk(ids, "a", 1)).toBe("b");
    expect(walk(ids, "c", 1)).toBe("a");
    expect(walk(ids, "a", -1)).toBe("c");
  });
  test("from nothing, or from an item that left the list, J starts at the top and K at the bottom", () => {
    expect(walk(ids, null, 1)).toBe("a");
    expect(walk(ids, "gone", -1)).toBe("c");
    expect(walk([], "a", 1)).toBeNull();
  });
});

describe("the part keymap", () => {
  const verb = (key: string, mode: string, facts: readonly string[] = [], target = NO_TARGET, extra: { ctrlKey?: boolean } = {}) =>
    resolve(KEYMAP, { chords: chordsOf({ key, ...extra }), repeat: false, target }, mode, new Set(facts))?.binding.verb ?? null;

  test("the whole table stays conflict-free with the part modes in it", () => {
    expect(conflicts(KEYMAP)).toEqual([]);
    expect(problems(KEYMAP)).toEqual([]);
  });

  test("J/K walk items in both editors - no transport here - and the frame's keys reach through", () => {
    expect(verb("j", "part.research")).toBe("item");
    expect(verb("k", "part.script")).toBe("item");
    expect(verb("Backspace", "part.research")).toBe("undo");
    expect(verb("z", "part.script", [], NO_TARGET, { ctrlKey: true })).toBe("undo");
    expect(verb("]", "part.script")).toBe("tab");
  });

  test("card verbs need a card; ⌫ inside a text field is the field's", () => {
    expect(verb("x", "part.research")).toBeNull();
    expect(verb("x", "part.research", ["card"])).toBe("descope");
    expect(verb("Backspace", "part.research", [], { editable: true, field: "part-field", control: true })).toBeNull();
    expect(verb("Enter", "part.research", [], { editable: true, field: "part-field", control: true })).toBe("commit-field");
  });

  test("the legend draws each editor's own rows", () => {
    expect(keyTable(KEYMAP, "part.research", { facts: new Set(["card", "item"]) }).map((r) => r.does)).toEqual(["card", "column", "descope · restore", "like", "deepen", "open · pick", "deselect"]);
    expect(keyTable(KEYMAP, "part").map((r) => r.does)).toEqual(["part", "undo"]);
  });
});

describe("markup", () => {
  test("the verdict chip speaks its state and first reason, and the rest without drawing them", () => {
    const v: PartVerdict = { state: "blocked", codes: [{ code: "a", text: "2 gate violation(s)" }, { code: "b", text: "5:00 against a 2:00 clock" }] };
    const html = renderToStaticMarkup(h(VerdictChip, { verdict: v }));
    expect(html).toContain('data-verdict="blocked"');
    expect(html).toContain("2 gate violation(s)");
    // The rest are a Tip on the +N, so a sighted operator reads them on hover or focus too, and
    // the tip stays mounted inside the status, so it is spoken with it.
    expect(html).toMatch(/<span[^>]*tabindex="0"[^>]*aria-describedby="([^"]+)"[^>]*>\+1<\/span><span role="tooltip" id="\1"[^>]*>5:00 against a 2:00 clock<\/span>/);
  });

  test("part tabs link editors, mark the current one, and leave gates, the slot and editor-less parts unlinked", () => {
    const html = renderToStaticMarkup(h(PartTabs, { tabs: TABS, current: "script", href: (k: string) => `/x/${k}` }));
    expect(html).toContain('href="/x/research"');
    expect(html).toMatch(/href="\/x\/script" aria-current="page"/);
    for (const k of ["frames", "gate:frames", "slot"]) expect(html).not.toContain(`href="/x/${k}"`);
    expect((html.match(/aria-disabled="true"/g) ?? []).length).toBe(3);
  });

  const frame = (over: Partial<PartWorkspaceProps> = {}): PartWorkspaceProps => ({
    trail: [{ label: "Projects", href: "/projects/runs" }],
    here: "script",
    verdict: { state: "empty", codes: [] },
    acts: null,
    undo: { last: null, busy: false, onUndo: noop },
    rail: { label: "candidates", children: null },
    primary: { label: "document", children: null },
    inspector: { label: "checks", children: null },
    tabs: TABS,
    current: "script",
    href: (k) => `/x/${k}`,
    upstream: [],
    mode: "part.script",
    ...over,
  });

  test("an upstream part that is not ready is named in a break; none, no break", () => {
    expect(renderToStaticMarkup(h(PartWorkspace, frame({ upstream: ["research"] })))).toContain("research not ready");
    expect(renderToStaticMarkup(h(PartWorkspace, frame()))).not.toContain("not ready");
  });

  test("undo names the op it would revert; with nothing to undo there is no control to press", () => {
    expect(renderToStaticMarkup(h(PartWorkspace, frame({ undo: { last: "descope f-ath", busy: false, onUndo: noop } })))).toContain("undo descope f-ath");
    expect(renderToStaticMarkup(h(PartWorkspace, frame()))).not.toMatch(/<button[^>]*>[^<]*undo/);
  });

  test("a rail of 500 rows holds a window of them, not 500", () => {
    const items = Array.from({ length: 500 }, (_, i) => ({ id: `c${i}` }));
    const html = renderToStaticMarkup(h(RailList<{ id: string }>, { label: "cards", items, idOf: (x) => x.id, selected: "c0", onSelect: noop, row: (x) => x.id }));
    const rows = (html.match(/role="option"/g) ?? []).length;
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThan(40);
    expect(html).toContain('aria-activedescendant="rail-cards-c0"');
  });
});
