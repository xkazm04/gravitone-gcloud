// THE SHARED SEAM (lib/decision/v1/registry.ts, lib/ledger/v1/packet.ts): every
// packet source is either decided by an adapter that says it is that source, or
// named as not decidable with a reason; the packet-id rule in lib/ is the app's
// rule byte for byte; and the live read stamps each Weir pile with the packet
// it opens as.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PACKET_SOURCES } from "@gt/domain/source";

import { boardFor, packetIdOf as appPacketIdOf, parsePacketId as appParsePacketId } from "../../app/(studio)/_shell/links.ts";
import { adapterFor, DECISION_ADAPTERS } from "../../lib/decision/v1/registry.ts";
import { packetIdOf, parsePacketId, weirPacketId } from "../../lib/ledger/v1/packet.ts";
import { liveJobs } from "../../lib/ledger/v1/sync.ts";
import type { Source, WeirItem } from "../../lib/ledger/v1/types.ts";

describe("the adapter registry", () => {
  it("names every packet source, and each adapter is the source it is filed under", () => {
    expect(Object.keys(DECISION_ADAPTERS).sort()).toEqual([...PACKET_SOURCES].sort());
    for (const s of PACKET_SOURCES) {
      const e = DECISION_ADAPTERS[s];
      if (e.kind === "adapter") expect(e.adapter.source).toBe(s);
      else expect(e.why.length).toBeGreaterThan(20);
    }
  });

  it("the four image surfaces are decidable; a source with no v1 store says why not", () => {
    for (const s of ["forge", "extract", "dojo", "strips"] as const) expect(adapterFor(s).ok).toBe(true);
    const step = adapterFor("step");
    expect(step.ok ? "" : step.error.code).toBe("refused");
    expect(step.ok ? "" : step.error.message).toContain("Phase 4");
  });
});

describe("the packet id, one rule in lib/", () => {
  it("spells and parses exactly as the app's links do, colons in the run id included", () => {
    for (const [source, run] of [["forge", "2026-10-14-sweep"], ["suno", "suno/triage"], ["article", "run:with:colons"]] as const) {
      expect(packetIdOf(source, run)).toBe(appPacketIdOf(source, run));
      expect(parsePacketId(packetIdOf(source, run))).toEqual(appParsePacketId(appPacketIdOf(source, run)));
    }
    expect(boardFor(packetIdOf("forge", "a"))).toBe("/board/pkt%3Aforge%3Aa");
  });

  it("maps each Weir source to its packet source; articles project as `articles` and decide as `article`", () => {
    expect(weirPacketId({ source: "articles", id: "r1" })).toBe("pkt:article:r1");
    expect(weirPacketId({ source: "dojo", id: "c1" })).toBe("pkt:dojo:c1");
    expect(weirPacketId({ source: "mv", id: "mv/settled" })).toBe("pkt:mv:mv/settled");
    expect(weirPacketId({ source: "gpu", id: "x" })).toBeUndefined();
    expect(weirPacketId({ source: "constructor", id: "x" })).toBeUndefined();
  });

  it("the live read stamps each pile with its packet id", async () => {
    const pile = (source: string, id: string): WeirItem => ({ source, id, title: id, media: "image", kind: "cull", decided: 0, pending: 1, href: "/foundry" });
    const src: Source<null> = {
      id: "fake",
      read: async () => ({ ok: true, value: null }),
      project: () => ({ events: [], live: [], weir: [pile("forge", "r1"), pile("articles", "a1"), pile("elsewhere", "z")], tally: { records: {}, facts: {} }, skipped: [] }),
    };
    const live = await liveJobs([src], { now: new Date("2026-10-15T00:00:00.000Z"), universe: "real" });
    expect(live.weir.map((w) => w.packetId)).toEqual(["pkt:forge:r1", "pkt:article:a1", undefined]);
  });
});
