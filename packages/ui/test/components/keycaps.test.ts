// Keycaps draws exactly the keymap's rows for a mode - never hand-written caps - and a
// button's caps are the caps of the row that runs its verb.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { KEYMAP } from "../../src/keymap/bindings.ts";
import { compile, keyTable } from "../../src/keymap/keymap.ts";
import { capsFor } from "../../src/components/keycaps/caps.ts";
import { Keycap, Keycaps } from "../../src/components/keycaps/Keycaps.tsx";

/** [caps, does] per drawn row, read back from the markup. */
function rowsOf(html: string): [string[], string][] {
  const rows = html.split(/<span class="[^"]*">/).slice(1);
  return rows.map((r) => {
    const caps = [...r.matchAll(/<kbd[^>]*>([^<]*)<\/kbd>/g)].map((m) => m[1] ?? "");
    const does = r.replace(/<kbd[^>]*>[^<]*<\/kbd>/g, "").replace(/<[^>]+>/g, "").trim();
    return [caps, does];
  });
}

describe("Keycaps renders the keymap's rows for a mode", () => {
  test.each(["floor", "board.cull", "board.review", "projects", "library", "ledger"])("%s", (mode) => {
    const html = renderToStaticMarkup(createElement(Keycaps, { mode, label: "keys" }));
    expect(rowsOf(html)).toEqual(keyTable(KEYMAP, mode).map((r) => [[...r.keys], r.does]));
    expect(html).toMatch(/^<div[^>]*role="group"[^>]*aria-label="keys"/);
  });

  test("facts change the rows exactly as the keymap says (an audio packet draws play)", () => {
    const facts = new Set(["audio"]);
    const html = renderToStaticMarkup(createElement(Keycaps, { mode: "board.cull", label: "keys", facts }));
    const rows = rowsOf(html);
    expect(rows).toEqual(keyTable(KEYMAP, "board.cull", { facts }).map((r) => [[...r.keys], r.does]));
    expect(rows.some(([, does]) => does === "play")).toBe(true);
    expect(rowsOf(renderToStaticMarkup(createElement(Keycaps, { mode: "board.cull", label: "keys" }))).some(([, d]) => d === "play")).toBe(false);
  });

  test("the review legend promises a calendar slot only when the review schedules one", () => {
    const does = (facts: string[]) => rowsOf(renderToStaticMarkup(createElement(Keycaps, { mode: "board.review", label: "keys", facts: new Set(facts) }))).map(([, d]) => d);
    expect(does(["draft"])).toContain("approve");
    expect(does(["draft"])).not.toContain("approve → calendar");
    expect(does(["draft", "calendar"])).toContain("approve → calendar");
    expect(does(["draft", "calendar"])).not.toContain("approve");
  });

  test("a supplied keymap is drawn, not the app's", () => {
    const map = compile([{ mode: "t", keys: ["Q"], verb: "quit" }]);
    expect(rowsOf(renderToStaticMarkup(createElement(Keycaps, { mode: "t", label: "keys", map })))).toEqual([[["Q"], "quit"]]);
  });
});

describe("Keycap draws the caps of one verb", () => {
  test("approve in the review desk is A", () => {
    expect(capsFor("board.review", "approve")).toEqual(["A"]);
    expect(renderToStaticMarkup(createElement(Keycap, { mode: "board.review", verb: "approve" }))).toMatch(/^<kbd[^>]*>A<\/kbd>$/);
  });

  test("a verb no row runs draws nothing", () => {
    expect(capsFor("board.review", "teleport")).toEqual([]);
    expect(renderToStaticMarkup(createElement(Keycap, { mode: "board.review", verb: "teleport" }))).toBe("");
  });
});
