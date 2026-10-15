import { describe, expect, it } from "vitest";

import { boardFor, packetIdOf, parsePacketId } from "../../app/(studio)/_shell/links.ts";

// The packet id is derived, never stored (COMMON decision 3): the Floor links a pile by it,
// the Board reads it back from the URL, and the applier opens the same packet from it.

describe("the packet id", () => {
  it("spells a pile as pkt:<source>:<runId>", () => {
    expect(packetIdOf("forge", "2026-08-26-sweep-01")).toBe("pkt:forge:2026-08-26-sweep-01");
  });

  it("round-trips, including a run id that holds colons and slashes", () => {
    for (const [source, runId] of [["forge", "2026-08-26-sweep-01"], ["articles", "a:b:c"], ["strips", "run/7"]] as const) {
      expect(parsePacketId(packetIdOf(source, runId))).toEqual({ source, runId });
    }
  });

  it("refuses what packetIdOf could not have produced", () => {
    for (const bad of ["", "pkt:", "pkt:forge", "pkt:forge:", "pkt::run", "forge:run", "PKT:forge:run"]) {
      expect(parsePacketId(bad)).toBeNull();
    }
  });

  it("links the Board through one encoded path segment that decodes back to the id", () => {
    const id = packetIdOf("strips", "run/7");
    const href = boardFor(id);
    expect(href.startsWith("/board/")).toBe(true);
    expect(href.slice("/board/".length)).not.toContain("/");
    expect(parsePacketId(decodeURIComponent(href.slice("/board/".length)))).toEqual({ source: "strips", runId: "run/7" });
  });
});
