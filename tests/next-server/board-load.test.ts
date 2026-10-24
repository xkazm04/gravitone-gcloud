// What the Board's two entries read before they render (app/(studio)/board/_board/load.ts), over a
// stand-in port: the packet and the rail; a bare aggregate follows to the pile it resolved to; a
// packet that will not load is the page's error; and a rail that will not list leaves the desk
// drawn with an empty rail AND a server log line naming why - an empty rail otherwise reads as
// a clear Weir with no trace of the failure.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({ list: undefined as unknown, packetId: "pkt:forge:r1" }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));

vi.mock("../../app/(studio)/board/_port/port.ts", async () => {
  const { AppError } = await import("@gt/domain/errors");
  return {
    SIDE: "fixture",
    serverBoard: () => ({
      loadPacket: async ({ id }: { readonly id: string }) =>
        id === "pkt:gone:x" ? { ok: false, error: new AppError("not-found", "board: no packet pkt:gone:x") } : { ok: true, value: { view: { id: h.packetId, rev: 3 }, present: { items: {}, rows: [] } } },
      listPackets: async () => h.list,
    }),
  };
});

import { AppError } from "@gt/domain/errors";

import { loadBoard } from "../../app/(studio)/board/_board/load.ts";

afterEach(() => {
  vi.restoreAllMocks();
  h.packetId = "pkt:forge:r1";
});

describe("the Board's load", () => {
  it("reads the packet and the rail", async () => {
    h.list = { ok: true, value: { packets: [{ id: "pkt:forge:r1" }], truncated: false } };
    const r = await loadBoard(Promise.resolve({ packet: "pkt%3Aforge%3Ar1" }));
    expect(r).toMatchObject({ ok: true, id: "pkt:forge:r1", rail: [{ id: "pkt:forge:r1" }] });
  });

  it("a rail that will not list draws an empty rail and logs why", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    h.list = { ok: false, error: new AppError("unavailable", "decision: the store is locked") };
    const r = await loadBoard(Promise.resolve({ packet: "pkt:forge:r1" }));
    expect(r).toMatchObject({ ok: true, rail: [] });
    expect(said.mock.calls.map((c) => String(c[0]))).toEqual(["[board] rail: decision: the store is locked"]);
  });

  it("a packet that will not load is the page's error, in the store's words", async () => {
    expect(await loadBoard(Promise.resolve({ packet: "pkt:gone:x" }))).toEqual({ ok: false, id: "pkt:gone:x", error: { error: "board: no packet pkt:gone:x", code: "not-found" } });
  });

  it("a bare aggregate follows to the pile it resolved to", async () => {
    h.packetId = "pkt:audio:audio/triage/2026-10-20";
    await expect(loadBoard(Promise.resolve({ packet: "pkt:audio:audio/triage" }))).rejects.toThrow("redirect /board/pkt%3Aaudio%3Aaudio%2Ftriage%2F2026-10-20");
  });
});
