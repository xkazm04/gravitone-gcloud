// The studio's one answer per port call (app/_server/settle.ts): an envelope
// passes through as it came, and a Server Action that rejected instead of answering is a refusal
// in its own words - so the slot level's verb, the schedule sheet's send and its exports read
// each disarm and say it, rather than staying busy for good.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { ActionResult } from "../../app/_server/actionCore.ts";
import { settle } from "../../app/_server/settle.ts";
import { settle as floorSettle } from "../../app/(studio)/floor/_floor/settle.ts";
import { settled as huntSettled } from "../../app/(studio)/audio/_hunt/settled.ts";
import { settle as librarySettle } from "../../app/(studio)/library/_library/blocks.ts";

describe("a Floor level's port call", () => {
  it("passes an answer through: the value, and a refusal with its code and detail", async () => {
    expect(await settle(Promise.resolve<ActionResult<number>>({ ok: true, value: 7 }))).toEqual({ ok: true, value: 7 });
    const refused: ActionResult<number> = { ok: false, error: { error: "move Chokepoint: it changed since it was opened - now scheduled for 2026-10-28T10:00:00.000Z", code: "conflict", detail: "stale" } };
    expect(await settle(Promise.resolve(refused))).toEqual(refused);
  });

  it("answers a rejected action as unavailable, in the rejection's words", async () => {
    expect(await settle(Promise.reject<ActionResult<number>>(new TypeError("Failed to fetch")))).toEqual({ ok: false, error: { error: "the studio did not answer: Failed to fetch", code: "unavailable" } });
  });

  it("says a rejection that is not an Error, rather than dropping it", async () => {
    expect(await settle(Promise.reject<ActionResult<number>>("socket hang up"))).toEqual({ ok: false, error: { error: "the studio did not answer: socket hang up", code: "unavailable" } });
  });
});

describe("one rejection rule", () => {
  it("the Floor, the hunt and the Library settle through the same function", () => {
    expect(floorSettle).toBe(settle);
    expect(huntSettled).toBe(settle);
    expect(librarySettle).toBe(settle);
  });

  it("none of the three routes declares a settle of its own again", () => {
    for (const f of ["app/(studio)/floor/_floor/settle.ts", "app/(studio)/audio/_hunt/settled.ts", "app/(studio)/library/_library/blocks.ts"]) {
      const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/function settled?\b/);
    }
  });
});
