// THE LIBRARY SCREEN'S CLIENT HALF, held to what it claims (app/(studio)/library/_library). The
// server half - the fixture index, the presentation, the address - is library-route.test.ts;
// tests/live/library.live.spec.ts drives the assembled screen. These are the claims a node run
// can decide without a DOM: pure derivations the screen draws from, and the call sites a source
// read can count.
//
//   1. Every port call the screen makes answers. A Server Action that rejects (the server gone,
//      the network dropped) never answered `.then`: the acts stayed disabled by `busy`, the
//      detail read "reading" and a block stayed empty for good. Each call goes through `settle`.
//   2. A detail's facet chips are pressed by the filter in the address now. The detail is kept by
//      id for the visit with the `pressed` the server drew under the filter it was fetched with,
//      so a chip pressed from the panel stayed drawn unpressed (and named without "in the
//      filter") while its next press removed the value.
//   3. A detail whose read failed says so in the panel. The refusal went to a toast and the panel
//      read "reading <id>" for good once the toast faded; moving away and back asks again.
//   4. A block's error leaves once that block reads. The alert under the results stood for the
//      life of the result, over rows that had since landed.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ActionResult } from "../../app/_server/actionCore.ts";
import { landed, settle } from "../../app/(studio)/library/_library/blocks.ts";
import { panelOf } from "../../app/(studio)/library/_library/Library.tsx";
import { DEFAULT_URL, pressedBy, toggled } from "../../app/(studio)/library/_library/url.ts";
import type { FacetLine } from "@gt/ui/components/library/DetailPanel.tsx";
import { stripComments } from "../golden-path/_pure.ts";

const DIR = path.join(import.meta.dirname, "../../app/(studio)/library/_library");
const code = (f: string): string => stripComments(readFileSync(path.join(DIR, f), "utf8"));

describe("1. every port call the screen makes answers", () => {
  it("passes an answer through, and answers a rejection as unavailable in its own words", async () => {
    expect(await settle(Promise.resolve<ActionResult<number>>({ ok: true, value: 7 }))).toEqual({ ok: true, value: 7 });
    const refused: ActionResult<number> = { ok: false, error: { error: "a is already pinned", code: "conflict" } };
    expect(await settle(Promise.resolve(refused))).toEqual(refused);
    expect(await settle(Promise.reject<ActionResult<number>>(new TypeError("Failed to fetch")))).toEqual({ ok: false, error: { error: "the studio did not answer: Failed to fetch", code: "unavailable" } });
  });

  it("no call of port.query, port.detail or port.act escapes settle", () => {
    const calls: string[] = [];
    const bare: string[] = [];
    for (const f of ["Library.tsx", "blocks.ts", "Toolbar.tsx", "Results.tsx", "DetailView.tsx"]) {
      const src = code(f);
      for (const m of src.matchAll(/(settle\(\s*)?\bport\.(query|detail|act)\(/g)) {
        calls.push(`${f}:${m[2]}`);
        if (m[1] === undefined) bare.push(`${f}:${m[2]}`);
      }
    }
    // The walk read the three verbs the screen calls; a silent miss would read as clean.
    expect(calls.sort()).toEqual(["Library.tsx:act", "Library.tsx:detail", "blocks.ts:query"]);
    expect(bare).toEqual([]);
  });
});

describe("2. a detail's facet chips are pressed by the filter in the address now", () => {
  // As the server drew them for a detail fetched with no filter.
  const lines: readonly FacetLine[] = [
    { group: "mood", label: "Mood", values: [{ value: "tense", label: "tense", pressed: false }, { value: "warm", label: "warm", pressed: false }] },
    { group: "type", label: "Type", values: [{ value: "sfx", label: "sfx", pressed: false }] },
  ];
  const pressed = (ls: readonly FacetLine[]): string[] => ls.flatMap((l) => l.values.filter((v) => v.pressed).map((v) => `${l.group}:${v.value}`));

  it("a value pressed into the filter is drawn pressed, and drawn unpressed once it leaves", () => {
    const on = toggled(DEFAULT_URL, "mood", "tense", true);
    expect(pressed(pressedBy(lines, on.f))).toEqual(["mood:tense"]);
    const both = toggled(on, "type", "sfx", true);
    expect(pressed(pressedBy(lines, both.f))).toEqual(["mood:tense", "type:sfx"]);
    expect(pressed(pressedBy(pressedBy(lines, both.f), toggled(both, "mood", "tense", false).f))).toEqual(["type:sfx"]);
  });

  it("the panel draws the held detail through it", () => {
    expect(code("Library.tsx")).toMatch(/lines:\s*pressedBy\(\s*held\.lines,\s*u\.f\s*\)/);
  });
});

describe("3. a detail whose read failed says so in the panel", () => {
  const failed = { id: "audio-7", text: "the studio did not answer: Failed to fetch" };

  it("the set with nothing selected, the item once held, reading only while the read is in flight", () => {
    expect(panelOf(null, false, failed)).toEqual({ is: "set" });
    expect(panelOf("audio-7", true, failed)).toEqual({ is: "item" });
    expect(panelOf("audio-8", false, failed)).toEqual({ is: "reading" });
    expect(panelOf("audio-7", false, null)).toEqual({ is: "reading" });
  });

  it("a failed read is the refusal in its own words, not reading", () => {
    expect(panelOf("audio-7", false, failed)).toEqual({ is: "failed", text: failed.text });
  });

  it("the read's refusal is what the panel is drawn from", () => {
    const src = code("Library.tsx");
    expect(src).toMatch(/else setFailed\(\{ id: sel, text: r\.error\.error \}\)/);
    expect(src).toMatch(/const panel = panelOf\(sel, current !== null, failed\)/);
  });
});

describe("4. a block's error leaves once that block reads", () => {
  const e = { identity: "q1", block: 3, text: "the studio did not answer: Failed to fetch" };

  it("the refused block landing clears it; another block or another query leaves it standing", () => {
    expect(landed(e, "q1", 3)).toBeNull();
    expect(landed(e, "q1", 4)).toBe(e);
    expect(landed(e, "q2", 3)).toBe(e);
    expect(landed(null, "q1", 3)).toBeNull();
  });

  it("a block that lands passes through it", () => {
    expect(code("blocks.ts")).toContain("setError((e) => landed(e, identity, b));");
  });
});
