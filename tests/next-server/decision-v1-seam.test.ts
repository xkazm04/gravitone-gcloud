// THE DECISION ADAPTERS' SHARED SEAM (lib/decision/v1/types.ts): the one place a throw from a v1
// writer becomes the Result the apply outbox records. The outbox decides retry against stuck by
// the CODE alone (@gt/kernel apply-core PERMANENT: invalid, refused, not-found), so a status that
// lands in the wrong class is a refusal retried five times, or a busy store parked for good. Each
// adapter's own file proves its writer's sentence arrives; this file pins the classes themselves.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AppErrorCode } from "@gt/domain/errors";
import { openKernel } from "@gt/kernel/kernel";

import { APPLY_CLAIM, reconcileApplies } from "../../lib/decision/v1/applier.ts";
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

describe("the render sweep's claim (lib/decision/v1/applier.ts reconcileApplies)", () => {
  it("a sweep that outlived its claim says so; one that closed it says nothing", async () => {
    const k = openKernel(":memory:");
    if (!k.ok) throw k.error;
    const store = k.value.store;
    const said = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const closed = reconcileApplies(store, { holder: "reader-a" });
      if (!closed.ok || !closed.value.started) throw new Error("the first sweep should take the claim");
      expect((await closed.value.done).ok).toBe(true);
      expect(said).not.toHaveBeenCalled();

      // The claim reopens after the interval; this sweep's is taken by another reader before it reports.
      const owner = (o: string) => store.tx((t) => t.run("UPDATE ingest_claims SET next_at = ?, owner = ? WHERE name = ?", "1970-01-01T00:00:00.000Z", o, APPLY_CLAIM));
      owner("reader-a");
      const lost = reconcileApplies(store, { holder: "reader-a" });
      if (!lost.ok || !lost.value.started) throw new Error("the second sweep should take the claim");
      owner("reader-b");
      expect((await lost.value.done).ok).toBe(true);
      expect(said.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/the sweep outlived its claim .*another reader holds decision-apply now/)]);
    } finally {
      said.mockRestore();
      k.value.close();
    }
  });
});
