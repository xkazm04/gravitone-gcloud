// THE BOARD'S PAGEHIDE FLUSH (app/(studio)/board/_port/keepalive.ts, behind the keepalive route)
// over a stand-in board that records what it was told. What the flush owes the record:
//   · the verdicts land as the principal the route's guard resolved, exactly as the patch
//     Server Action records them (decision-records: who decided is part of the decision);
//   · they land on the packet's CURRENT revision, not the one the closing tab last saw;
//   · the packet id arrives as one encoded path segment and is decoded once.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { err, ok } from "@gt/domain/errors";
import type { BoardPacket } from "@gt/ui/board/port";

import { flushKeepalive } from "../../app/(studio)/board/_port/keepalive.ts";
import type { ServerBoard } from "../../app/(studio)/board/_port/port.ts";
import type { Principal } from "../../lib/principal.ts";

type Call = { readonly verb: string; readonly input: unknown; readonly who: unknown };

function standIn(rev: number, loaded = true): { readonly board: ServerBoard; readonly calls: Call[] } {
  const calls: Call[] = [];
  const no = async () => err("refused", "not on this stand-in");
  const board = {
    loadPacket: async (input: unknown, who?: unknown) => {
      calls.push({ verb: "load", input, who });
      return loaded ? ok({ view: { rev } } as unknown as BoardPacket) : err("not-found", "board: no packet");
    },
    patch: async (input: unknown, who?: unknown) => {
      calls.push({ verb: "patch", input, who });
      return ok({ rev: rev + 1 });
    },
    listPackets: no,
    undo: no,
    pick: no,
    preview: no,
    commit: no,
    returnPacket: no,
  } as unknown as ServerBoard;
  return { board, calls };
}

const bob: Principal = { kind: "firebase", uid: "uid-bob", authTime: 1, exp: 2 };
const changes = [{ candidate: "c1", verdict: "keep" as const, reasons: [] }];
const params = Promise.resolve({ packet: "pkt%3Aforge%3Ar1" });

describe("the keepalive flush", () => {
  it("records the verdicts as the principal who sent the beacon, on the load and the patch", async () => {
    const { board, calls } = standIn(7);
    const r = await flushKeepalive(board, { who: bob, input: { changes }, params });
    expect(r).toEqual(ok({ rev: 8 }));
    expect(calls.map((c) => [c.verb, c.who])).toEqual([
      ["load", { who: "uid-bob" }],
      ["patch", { who: "uid-bob" }],
    ]);
  });

  it("applies on the packet's current revision under its decoded id", async () => {
    const { board, calls } = standIn(42);
    await flushKeepalive(board, { who: bob, input: { changes }, params });
    expect(calls[1]?.input).toEqual({ id: "pkt:forge:r1", baseRev: 42, changes });
  });

  it("a principal with no uid (the shared secret) names nobody, as the action's does", async () => {
    const { board, calls } = standIn(1);
    await flushKeepalive(board, { who: { kind: "shared-secret", legacy: true }, input: { changes }, params });
    expect(calls.map((c) => c.who)).toEqual([{}, {}]);
  });

  it("a packet that will not load is refused and nothing is patched", async () => {
    const { board, calls } = standIn(1, false);
    const r = await flushKeepalive(board, { who: bob, input: { changes }, params });
    expect(r.ok).toBe(false);
    expect(calls.map((c) => c.verb)).toEqual(["load"]);
  });
});
