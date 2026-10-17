import { describe, expect, it } from "vitest";

import { CHANNELS, exportIdOf, INTERRUPTED_TEXT, slotItemId, slotSchema } from "../src/slot.ts";
import { SLOT_HOLDS, SLOT_MOVABLE, slotMachine } from "../src/slot.machine.ts";
import { accept, AT, refuse } from "./_records.ts";

// The Phase 6 rulings on the slot record: the `blog` channel (owner ruling 4) and where a
// slot's reason may live (COMMON decision 1). job.test.ts holds the Phase 1 invariants.

const scheduled = {
  id: "sl-58ca3dd6",
  libraryItemId: "video:export:0b1c2d3e-4f50-4617-8a9b-cafe0000aaaa",
  channel: "youtube",
  at: "2026-09-23T14:00:00.000Z",
  state: "scheduled",
  title: "Glass Harbor — they never break in",
  description: "A crew that never breaks in waits for the one door every city leaves unlocked.",
  tags: ["heist"],
};
const failed = { ...scheduled, state: "failed", error: "The request cannot be completed because you have exceeded your quota." };

describe("the slot record, Phase 6", () => {
  it("knows the blog channel, whose publication is the article's pull request", () => {
    expect(CHANNELS).toContain("blog");
    accept(slotSchema, { ...scheduled, channel: "blog", libraryItemId: slotItemId.article("run-7f3a") });
    refuse(slotSchema, { ...scheduled, channel: "myspace" }, "channel");
  });

  it("keeps a failed slot's error when it is cancelled, and allows it nowhere else", () => {
    accept(slotSchema, failed);
    accept(slotSchema, { ...failed, state: "cancelled" });
    accept(slotSchema, { ...scheduled, state: "cancelled" });
    refuse(slotSchema, { ...scheduled, state: "failed" }, "a failed slot says why");
    for (const state of ["scheduled", "missed", "published", "publishing"]) {
      const extra = state === "missed" ? { missedAt: AT } : state === "published" ? { publicationId: "pub-1" } : state === "publishing" ? { claim: { holder: { bootId: "b", pid: 1, host: "h" }, at: AT } } : {};
      refuse(slotSchema, { ...scheduled, ...extra, state, error: "drift text in error, v1's way" }, "only a failed slot, or one cancelled after failing");
    }
  });

  it("names the plan part it places, when a project asked for it", () => {
    expect(accept(slotSchema, { ...scheduled, partId: "slot:cut" }).partId).toBe("slot:cut");
  });

  it("joins a slot to its Library item the way the Library feeds exports", () => {
    expect(slotItemId.export("abc")).toBe("video:export:abc");
    expect(exportIdOf(slotItemId.export("abc"))).toBe("abc");
    expect(exportIdOf("video:export:")).toBeUndefined();
    expect(exportIdOf(slotItemId.article("run-1"))).toBeUndefined();
  });

  it("keeps v1's interrupted sentence and the state sets the calendar decides by", () => {
    expect(INTERRUPTED_TEXT).toBe("interrupted before the publish finished");
    expect([...SLOT_HOLDS].sort()).toEqual(["published", "publishing", "scheduled"]);
    for (const s of SLOT_MOVABLE) {
      expect(slotMachine.can(s, "scheduled")).toBe(true);
      expect(slotMachine.can(s, "cancelled")).toBe(true);
    }
    expect(slotMachine.can("publishing", "scheduled")).toBe(false);
  });
});
