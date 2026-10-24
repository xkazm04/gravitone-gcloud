// The Floor levels' one answer per port call (app/(studio)/floor/_floor/settle.ts): an envelope
// passes through as it came, and a Server Action that rejected instead of answering is a refusal
// in its own words - so the slot level's verb, the schedule sheet's send and its exports read
// each disarm and say it, rather than staying busy for good.

import { describe, expect, it } from "vitest";

import type { ActionResult } from "../../app/_server/actionCore.ts";
import { settle } from "../../app/(studio)/floor/_floor/settle.ts";

describe("a Floor level's port call", () => {
  it("passes an answer through: the value, and a refusal with its code and detail", async () => {
    expect(await settle(Promise.resolve<ActionResult<number>>({ ok: true, value: 7 }))).toEqual({ ok: true, value: 7 });
    const refused: ActionResult<number> = { ok: false, error: { error: "move Chokepoint: it changed since it was opened - now scheduled for 2026-10-28T10:00:00.000Z", code: "conflict", detail: "stale" } };
    expect(await settle(Promise.resolve(refused))).toEqual(refused);
  });

  it("answers a rejected action as unavailable, in the rejection's words", async () => {
    expect(await settle(Promise.reject<ActionResult<number>>(new TypeError("Failed to fetch")))).toEqual({ ok: false, error: { error: "Failed to fetch", code: "unavailable" } });
  });

  it("says a rejection that is not an Error, rather than dropping it", async () => {
    expect(await settle(Promise.reject<ActionResult<number>>("socket hang up"))).toEqual({ ok: false, error: { error: "socket hang up", code: "unavailable" } });
  });
});
