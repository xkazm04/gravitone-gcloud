import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// WHO ACTS ON A PART is the signed-in principal, as on every produce action
// (app/(studio)/projects/_port/actions.ts `as(who)`): the part's op log and its act's job name
// the caller, not a blanket "operator". The session and the side are stubbed; what is pinned is
// what the action core hands the side after the principal resolved.

const calls: { verb: string; who: unknown }[] = [];
const answer = { ok: true as const, value: { kind: "applied" } };

vi.mock("../../app/_server/principal.ts", () => ({
  principal: async () => ({ kind: "firebase", uid: "u-7", authTime: 0, exp: 0 }),
}));
vi.mock("../../app/(studio)/projects/[id]/_part/port.ts", () => ({
  serverPart: () =>
    new Proxy(
      {},
      {
        get:
          (_t, verb: string) =>
          (_input: unknown, who?: unknown) => {
            calls.push({ verb, who });
            return answer;
          },
      },
    ),
}));

import { act, actReceipt, loadPart, opPart, undoPart } from "../../app/(studio)/projects/[id]/_part/actions.ts";

const at = { projectId: "ad1", key: "research" };
beforeEach(() => {
  calls.length = 0;
});

describe("a part action", () => {
  it.each([
    ["opPart", () => opPart({ ...at, baseRev: 1, op: { op: "confirm-scope" } })],
    ["undoPart", () => undoPart({ ...at, baseRev: 2 })],
    ["actReceipt", () => actReceipt({ ...at, act: "run-research" })],
    ["act", () => act({ ...at, act: "run-research", token: "0123456789abcdef" })],
  ] as const)("%s hands the side the signed-in principal as who acts", async (verb, run) => {
    const r = await run();
    expect(r.ok).toBe(true);
    expect(calls).toEqual([{ verb, who: { who: "u-7" } }]);
  });

  it("a read names no one", async () => {
    await loadPart(at);
    expect(calls).toEqual([{ verb: "loadPart", who: undefined }]);
  });
});
