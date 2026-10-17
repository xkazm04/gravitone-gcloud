import { describe, expect, it } from "vitest";

import { slotSchema, type Slot } from "@gt/domain/slot";
import { publicationSchema } from "@gt/domain/publication";
import type { SlotRow } from "@gt/kernel/slots/schema";

import { standingOf, type Attempt } from "../src/publish/standing.ts";
import { DRIFT_TEXT, wirePublication, wireSlot } from "../src/publish/wire.ts";

// What the publish producer lets others read: a channel's standing (folded from the ledger's
// attempts), and the CLI's v1 wire shape (plan §5.1 - the `--json` keys an agent already parses).

const T = (h: number): string => `2026-10-05T${String(h).padStart(2, "0")}:00:00.000Z`;
const fail = (h: number, error: string, notTheChannel = false): Attempt => ({ at: T(h), ok: false, error, notTheChannel });
const win = (h: number): Attempt => ({ at: T(h), ok: true, notTheChannel: false });

describe("a channel's standing", () => {
  it("counts failures since the last success, names the newest one verbatim, and says when it last worked", () => {
    const s = standingOf("youtube", [fail(9, "token request failed: invalid_grant"), fail(8, "quotaExceeded"), win(7), fail(6, "old")]);
    expect(s).toEqual({ channel: "youtube", attempts: 4, lastAttemptAt: T(9), lastSuccessAt: T(7), lastError: "token request failed: invalid_grant", failuresSinceSuccess: 2 });
  });
  it("tells 'nothing was attempted' from 'every attempt failed'", () => {
    expect(standingOf("youtube", [])).toMatchObject({ attempts: 0, lastAttemptAt: null, failuresSinceSuccess: 0, lastSuccessAt: null });
    expect(standingOf("youtube", [fail(2, "x"), fail(1, "y")])).toMatchObject({ attempts: 2, failuresSinceSuccess: 2, lastSuccessAt: null });
  });
  it("does not blame the channel for this machine's failures (a dead claimant, a stop)", () => {
    expect(standingOf("youtube", [fail(9, "interrupted before the publish finished", true), win(8)])).toMatchObject({ failuresSinceSuccess: 0, lastError: null, lastAttemptAt: T(8) });
  });
});

type Draft = Omit<Partial<Slot>, "libraryItemId"> & { libraryItemId?: string };
const slot = (over: Draft): SlotRow => ({
  slot: slotSchema.parse({ id: "sl-1", libraryItemId: "video:export:abc", channel: "youtube", at: T(10), state: "scheduled", title: "A cut", description: "d", tags: ["a"], ...over }),
  rev: 1,
  createdAt: T(1),
  updatedAt: T(2),
});

describe("the CLI's wire shape", () => {
  it("speaks v1's keys for a slot, the export id recovered from the item", () => {
    expect(wireSlot(slot({}))).toEqual({
      id: "sl-1",
      projectId: null,
      exportId: "abc",
      libraryItemId: "video:export:abc",
      channelId: "youtube",
      publishAt: T(10),
      status: "scheduled",
      title: "A cut",
      description: "d",
      tags: ["a"],
      publicationId: null,
      error: null,
      drift: null,
      missedAt: null,
      createdAt: T(1),
      partId: null,
    });
  });
  it("carries drift as v1's sentence in `error` AND as its token, and a failure's own words over it", () => {
    expect(wireSlot(slot({ drift: "export_missing" }))).toMatchObject({ error: DRIFT_TEXT.export_missing, drift: "export_missing" });
    expect(DRIFT_TEXT.export_missing).toBe("the export this slot publishes no longer exists");
    expect(wireSlot(slot({ state: "failed", error: "quotaExceeded" }))).toMatchObject({ status: "failed", error: "quotaExceeded", drift: null });
    expect(wireSlot(slot({ libraryItemId: "article:run-1", channel: "blog" }))).toMatchObject({ exportId: null, channelId: "blog" });
  });
  it("speaks v1's keys for a publication", () => {
    expect(wirePublication(publicationSchema.parse({ id: "pub-1", slotId: "sl-1", channel: "youtube", platformId: null, visibility: "private", dry: true, publishedAt: T(3) }))).toEqual({
      id: "pub-1",
      slotId: "sl-1",
      channelId: "youtube",
      platformVideoId: null,
      url: null,
      visibility: "private",
      dry: true,
      publishedAt: T(3),
    });
  });
});
