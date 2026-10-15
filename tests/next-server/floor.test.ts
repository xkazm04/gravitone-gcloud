import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Event } from "@gt/domain/event";

import { nextPile, pileOrder, spendOf } from "../../app/(studio)/_shell/facts.ts";
import { byLane, floorSearch, parseFloorUrl, publishedSlots, railSlot } from "../../app/(studio)/floor/_floor/model.ts";
import { downsample } from "../../app/(studio)/floor/_floor/shelf.ts";
import type { LiveJob, WeirItem } from "../../lib/ledger/v1/types.ts";

// The Floor's pure rules: which pile is NEXT (the header and the Floor share it), how runs and
// piles fall into lanes, what the last 24 hours cost, the calendar's published history from the
// ledger, the page's URL, and the bounded waveform a kept take carries to the page.

const pile = (source: string, id: string, media: WeirItem["media"], since: string | undefined, pending = 3, decided = 0): WeirItem => ({
  source,
  id,
  title: `${source} ${id}`,
  media,
  kind: "cull",
  ...(since === undefined ? {} : { since }),
  decided,
  pending,
  href: "/foundry",
});

const job = (id: string, media: LiveJob["media"]): LiveJob => ({ source: "forge", id, title: id, lane: "gpu.local", media, state: "running", href: "/foundry" });

const ev = (over: Partial<Event>): Event => ({
  seq: 1,
  at: "2026-10-15T10:00:00.000Z",
  atSrc: "recorded",
  actor: { kind: "machine", id: "publisher" },
  type: "publish",
  subject: { kind: "publication", id: "pub-1" },
  data: {},
  prevHash: "0".repeat(64),
  hash: "1".repeat(64),
  ...over,
});

describe("NEXT", () => {
  it("is the oldest pile with anything pending", () => {
    const weir = [pile("forge", "b", "image", "2026-10-15T08:00:00Z"), pile("articles", "a", "article", "2026-10-14T08:00:00Z"), pile("dojo", "c", "image", "2026-10-13T08:00:00Z", 0, 5)];
    expect(nextPile(weir)?.id).toBe("a");
  });

  it("draws an undated pile after every dated one: unknown age is not oldest", () => {
    expect(nextPile([pile("mv", "mv/settled", "video", undefined), pile("forge", "late", "image", "2026-10-15T09:00:00Z")])?.id).toBe("late");
  });

  it("breaks a tie by lane order, then source and id, so two renders agree", () => {
    const t = "2026-10-15T08:00:00Z";
    const sorted = [pile("suno", "x", "audio", t), pile("strips", "y", "video", t), pile("forge", "z", "image", t), pile("extract", "w", "image", t)].sort(pileOrder);
    expect(sorted.map((p) => p.id)).toEqual(["w", "z", "x", "y"]);
  });

  it("is null when the weir is clear", () => {
    expect(nextPile([])).toBeNull();
    expect(nextPile([pile("forge", "done", "image", "2026-10-15T08:00:00Z", 0, 9)])).toBeNull();
  });
});

describe("lanes", () => {
  it("files runs and pending piles by medium, each lane oldest first, finished piles dropped", () => {
    const lanes = byLane(
      [job("j1", "image"), job("j2", "audio")],
      [pile("forge", "new", "image", "2026-10-15T08:00:00Z"), pile("extract", "old", "image", "2026-10-10T08:00:00Z"), pile("forge", "judged", "image", "2026-10-01T08:00:00Z", 0, 4), pile("suno", "suno/triage", "audio", undefined)],
    );
    expect(lanes.image.piles.map((p) => p.id)).toEqual(["old", "new"]);
    expect(lanes.image.jobs.map((j) => j.id)).toEqual(["j1"]);
    expect(lanes.audio.piles.map((p) => p.id)).toEqual(["suno/triage"]);
    expect(lanes.article.piles).toEqual([]);
    expect(lanes.video).toEqual({ jobs: [], piles: [] });
  });
});

describe("spend", () => {
  it("sums priced acts by where each figure came from and leaves unpriced acts out", () => {
    const s = spendOf([{ cost: { usd: 1.5, src: "real" } }, {}, { cost: { usd: 2, src: "model" } }, { cost: { usd: 0.5, src: "real" } }], false);
    expect(s).toEqual({ total: 4, bySrc: { real: 2, model: 2 }, priced: 3, capped: false });
  });

  it("carries the cap so the chip can say the sum is a floor", () => {
    expect(spendOf([], true)).toEqual({ total: 0, bySrc: {}, priced: 0, capped: true });
  });
});

describe("published history", () => {
  it("titles a publication by its slot's own create act, and keeps the slot id when the ledger never saw one", () => {
    const pubs = [
      ev({ subject: { kind: "publication", id: "pub-1" }, occurredAt: "2026-10-12T06:00:00.000Z", data: { slotId: "slot-a", channel: "youtube" } }),
      ev({ subject: { kind: "publication", id: "pub-2" }, data: { slotId: "slot-b", channel: "tiktok" } }),
    ];
    const creates = [ev({ type: "slot.create", subject: { kind: "slot", id: "slot-a" }, data: { title: "Radar sweep" } })];
    expect(publishedSlots(pubs, creates)).toEqual([
      { id: "pub-1", title: "Radar sweep", channel: "youtube", publishAt: "2026-10-12T06:00:00.000Z", status: "published" },
      { id: "pub-2", title: "slot-b", channel: "tiktok", publishAt: "2026-10-15T10:00:00.000Z", status: "published" },
    ]);
  });

  it("keeps a live slot's error and omits an absent one", () => {
    const base = { source: "publish", id: "s", title: "t", channel: "youtube", projectId: "p", publishAt: "2026-10-15T10:00:00Z", href: "/calendar" } as const;
    expect(railSlot({ ...base, status: "failed", error: "drift: export_missing" })).toEqual({ id: "s", title: "t", channel: "youtube", publishAt: "2026-10-15T10:00:00Z", status: "failed", error: "drift: export_missing" });
    expect("error" in railSlot({ ...base, status: "scheduled" })).toBe(false);
  });
});

describe("the URL", () => {
  it("round-trips the focused lane, the month and its day", () => {
    const u = parseFloorUrl({ lane: "audio", cal: "1", day: "2026-10-15" });
    expect(u).toEqual({ lane: "audio", cal: true, day: "2026-10-15" });
    expect(floorSearch(u)).toBe("?lane=audio&cal=1&day=2026-10-15");
  });

  it("drops what it does not know rather than guessing, and a day without the month", () => {
    expect(parseFloorUrl({ lane: "gpu.local", cal: "yes", day: "tomorrow" })).toEqual({ lane: null, cal: false, day: null });
    expect(floorSearch({ lane: null, cal: false, day: "2026-10-15" })).toBe("");
  });
});

describe("a kept take's waveform", () => {
  it("keeps each span's loudest peak, bounded, and leaves a short strip as it is", () => {
    expect(downsample([0.1, 0.9, 0.2, 0.3, 0.8, 0.4], 3)).toEqual([0.9, 0.3, 0.8]);
    expect(downsample([0.5, 0.6], 37)).toEqual([0.5, 0.6]);
    expect(downsample(Array.from({ length: 1000 }, (_, i) => i / 1000), 37)).toHaveLength(37);
  });
});
