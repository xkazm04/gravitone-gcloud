// THE DECISION ADAPTERS' SHARED SEAM (lib/decision/v1/types.ts): the one place a throw from a v1
// writer becomes the Result the apply outbox records. The outbox decides retry against stuck by
// the CODE alone (@gt/kernel apply-core PERMANENT: invalid, refused, not-found), so a status that
// lands in the wrong class is a refusal retried five times, or a busy store parked for good. Each
// adapter's own file proves its writer's sentence arrives; this file pins the classes themselves.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AppErrorCode } from "@gt/domain/errors";

import { fromV1, v1Call } from "../../lib/decision/v1/types.ts";

/** What v1's writers throw: FoundryError, SoundError, ArticleError - an Error with an HTTP status. */
const v1Error = (message: string, status?: number): Error => Object.assign(new Error(message), status === undefined ? {} : { status });

describe("fromV1: v1's status, in the one taxonomy", () => {
  const cases: readonly (readonly [number | undefined, AppErrorCode])[] = [
    [400, "invalid"],
    [401, "unauthenticated"],
    [402, "budget"],
    [403, "refused"],
    [404, "not-found"],
    [409, "conflict"],
    [500, "unavailable"],
    [502, "unavailable"],
    [503, "unavailable"],
    [418, "internal"],
    [undefined, "internal"],
  ];
  for (const [status, code] of cases) {
    it(`${status ?? "no status"} is ${code}, with v1's sentence verbatim`, () => {
      const r = fromV1(v1Error(`v1 says ${status ?? "nothing"}`, status));
      expect(r.ok ? "ok" : [r.error.code, r.error.message]).toEqual([code, `v1 says ${status ?? "nothing"}`]);
    });
  }

  it("a thrown non-Error is internal and keeps its words", () => {
    const r = fromV1("disk on fire");
    expect(r.ok ? "ok" : [r.error.code, r.error.message]).toEqual(["internal", "disk on fire"]);
  });

  it("v1Call turns a writer's throw into that Result, and its value into ok", async () => {
    const thrown = await v1Call(() => Promise.reject(v1Error("This run is already committed.", 409)));
    expect(thrown.ok ? "ok" : [thrown.error.code, thrown.error.message]).toEqual(["conflict", "This run is already committed."]);
    const fine = await v1Call(() => Promise.resolve(7));
    expect(fine).toEqual({ ok: true, value: 7 });
  });
});
