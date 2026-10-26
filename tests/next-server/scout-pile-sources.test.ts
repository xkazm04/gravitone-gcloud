// WHICH PILE SOURCES ARE THE SCOUT'S IS ONE SET (_shell/facts.ts SCOUT_PILE_SOURCES). The nav's
// current mark and the Scout's Board packets read it (the header's NEXT is facts.ts itself); a source added to
// the set is the scout's in all three. The set is widened here, before the modules load, so a
// reader holding its own spelling of the sources disagrees.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../app/(studio)/_shell/facts.ts", async (orig) => ({
  ...(await orig<typeof import("../../app/(studio)/_shell/facts.ts")>()),
  SCOUT_PILE_SOURCES: new Set(["scout", "seeds", "scout-reels"]),
}));

import type { PacketSummary } from "@gt/domain/board";
import { SCOUT_PILE_SOURCES } from "../../app/(studio)/_shell/facts.ts";
import { sectionOf } from "../../app/(studio)/_shell/nav.ts";
import { isScoutPacket } from "../../app/(studio)/scout/_scout/ScoutHead.tsx";

const SOURCES = ["scout", "seeds", "scout-reels", "forge", "strips", "dojo", "article", "audio", "scoutx"];

describe("the scout's pile sources", () => {
  it.each(SOURCES)("%s: the nav and the Board's packets agree with the set", (source) => {
    const want = SCOUT_PILE_SOURCES.has(source);
    expect(sectionOf(`/board/pkt:${source}:r1`) === "scout", "nav").toBe(want);
    expect(sectionOf(`/board/pkt%3A${source}%3Ar1`) === "scout", "nav, encoded").toBe(want);
    expect(isScoutPacket({ source: source as PacketSummary["source"] }), "Board packets").toBe(want);
  });
});
