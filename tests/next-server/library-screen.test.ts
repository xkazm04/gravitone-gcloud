// THE LIBRARY SCREEN'S CLIENT HALF, held to what it claims (app/(studio)/library/_library). The
// server half - the fixture index, the presentation, the address - is library-route.test.ts;
// tests/live/library.live.spec.ts drives the assembled screen. These are the claims a node run
// can decide without a DOM: pure derivations the screen draws from, and the call sites a source
// read can count.
//
//   1. Every port call the screen makes answers. A Server Action that rejects (the server gone,
//      the network dropped) never answered `.then`: the acts stayed disabled by `busy`, the
//      detail read "reading" and a block stayed empty for good. Each call goes through `settle`.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ActionResult } from "../../app/_server/actionCore.ts";
import { settle } from "../../app/(studio)/library/_library/blocks.ts";
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
