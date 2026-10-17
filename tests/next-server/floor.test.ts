import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Nothing here may open the operator's store: the calendar's real side imports the kernel's
// store module (it opens nothing at import, and this keeps it that way if that changes).
await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  process.env["GRAVITONE_STORE_PATH"] = join(mkdtempSync(join(tmpdir(), "floor-test-")), "store.sqlite");
});

import type { Event } from "@gt/domain/event";

import { nextPile, pileOrder, spendOf } from "../../app/(studio)/_shell/facts.ts";
import { SLOTS } from "../../app/(studio)/floor/_calendar/fixtureData.ts";
import { applyCancel, applyMove, applyPublishNow, seedRow, viewOf, type FixtureRow } from "../../app/(studio)/floor/_calendar/fixture.ts";
import { driftOf } from "../../app/(studio)/floor/_calendar/real.ts";
import { byLane, floorSearch, parseFloorUrl, publishedSlots, railSlot, slotHref } from "../../app/(studio)/floor/_floor/model.ts";
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
  it("round-trips the focused lane, the month, its day, the hidden channels and the open slot", () => {
    const u = parseFloorUrl({ lane: "audio", cal: "1", day: "2026-10-15", off: "tiktok,blog", slot: "sl-chokepoint-quota" });
    expect(u).toEqual({ lane: "audio", cal: true, day: "2026-10-15", off: ["blog", "tiktok"], slot: "sl-chokepoint-quota" });
    expect(floorSearch(u)).toBe("?lane=audio&cal=1&day=2026-10-15&off=blog,tiktok&slot=sl-chokepoint-quota");
    expect(parseFloorUrl(Object.fromEntries(new URLSearchParams(floorSearch(u))))).toEqual(u);
  });

  it("drops what it does not know rather than guessing, and a day or channels without the month", () => {
    expect(parseFloorUrl({ lane: "gpu.local", cal: "yes", day: "tomorrow", off: "Tik Tok", slot: "a b" })).toEqual({ lane: null, cal: false, day: null, off: [], slot: null });
    expect(floorSearch({ lane: null, cal: false, day: "2026-10-15", off: ["tiktok"], slot: null })).toBe("");
  });

  it("opens a slot with or without the month beneath it", () => {
    expect(floorSearch({ lane: null, cal: false, day: null, off: [], slot: "sl-a" })).toBe("?slot=sl-a");
    expect(slotHref("sl-a")).toBe("/floor?cal=1&slot=sl-a");
    expect(slotHref("sl-a", false)).toBe("/floor?slot=sl-a");
  });
});

// The fixture calendar runs the domain's own records and machine, so what it does is what the
// slot store will be held to (COMMON decision 1, owner ruling 3).
const ANCHOR = Date.UTC(2026, 9, 15, 9);
const NOW = ANCHOR + 12 * 60_000;
function row(id: string): FixtureRow {
  const f = SLOTS.find((x) => x.id === id);
  if (f === undefined) throw new Error(`no fixture ${id}`);
  return must(seedRow(f, ANCHOR));
}
function must<T>(r: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: Error }): T {
  if (!r.ok) throw r.error;
  return r.value;
}

describe("the fixture calendar", () => {
  it("every fixture row passes the slot schema, and together they hold every state and channel", () => {
    for (const f of SLOTS) expect(seedRow(f, ANCHOR).ok, f.id).toBe(true);
    expect(new Set(SLOTS.map((f) => f.state))).toEqual(new Set(["scheduled", "publishing", "published", "missed", "failed", "cancelled"]));
    expect(new Set(SLOTS.map((f) => f.channel))).toEqual(new Set(["youtube", "tiktok", "instagram", "blog"]));
    expect(SLOTS.some((f) => f.error === "interrupted before the publish finished")).toBe(true);
  });

  it("move: a failure is scheduled again without its error; a missed slot loses missedAt; a drift stays", () => {
    const at = "2026-10-16T10:00:00.000Z";
    const failed = must(applyMove(row("sl-chokepoint-quota"), at, NOW)).slot;
    expect([failed.state, failed.at, failed.error]).toEqual(["scheduled", at, undefined]);
    const missed = must(applyMove(row("sl-tariff-tt-missed"), at, NOW)).slot;
    expect([missed.state, missed.missedAt]).toEqual(["scheduled", undefined]);
    expect(must(applyMove(row("sl-signal-ig-drift"), at, NOW)).slot.drift).toBe("channel_not_wired");
  });

  it("move: into the past, or a settled slot, is refused in words", () => {
    const past = applyMove(row("sl-bitcoin-yt"), "2026-10-15T08:00:00.000Z", NOW);
    expect(past.ok ? null : past.error.message).toBe("move sl-bitcoin-yt: that hour has passed");
    const settled = applyMove(row("sl-harbor-yt-out"), "2026-10-16T10:00:00.000Z", NOW);
    expect(settled.ok ? null : settled.error.code).toBe("refused");
  });

  it("cancel is soft and a cancelled failure keeps its sentence; a drift does not outlive the wait", () => {
    const f = must(applyCancel(row("sl-chokepoint-quota"))).slot;
    expect([f.state, f.error]).toEqual(["cancelled", row("sl-chokepoint-quota").slot.error]);
    const d = must(applyCancel(row("sl-chokepoint-tt-drift"))).slot;
    expect([d.state, d.drift]).toEqual(["cancelled", undefined]);
    expect(applyCancel(row("sl-harbor-yt-out")).ok).toBe(false);
  });

  it("publish now overrides the missed window, leaves no claim, and on this side is a dry run", () => {
    const p = must(applyPublishNow(row("sl-tariff-tt-missed"), NOW));
    expect([p.slot.state, p.slot.claim, p.slot.publicationId, p.extra.dry]).toEqual(["published", undefined, "pub-dry-sl-tariff-tt-missed", true]);
    expect(viewOf(p).dry).toBe(true);
  });

  it("publish now refuses a drifted slot and a blog slot", () => {
    expect(applyPublishNow(row("sl-chokepoint-tt-drift"), NOW).ok).toBe(false);
    expect(applyPublishNow(row("sl-routing-blog"), NOW).ok).toBe(false);
  });

  it("the record shows a blog post as its PR, a clip as its player, and metrics with null kept null", () => {
    expect(viewOf(row("sl-faceting-blog-out")).media).toEqual({ kind: "post", pr: "https://github.com/xkazm04/ai-registry/pull/41" });
    expect(viewOf(row("sl-chokepoint-quota")).media).toEqual({ kind: "video", src: "/clips/presets/blueprint.webm", poster: "/clips/presets/blueprint.jpg" });
    const m = viewOf(row("sl-bitcoin-tt-out")).metrics;
    expect([m?.views, m?.comments, m?.avgViewDurationS]).toEqual([{ value: 52000, floor: true }, { value: null }, null]);
  });
});

describe("v1's drift on the real side", () => {
  it("reads v1's drift sentence back into the drift field and keeps any other error verbatim", () => {
    const base = { id: "s", title: "t", channel: "youtube", publishAt: "2026-10-15T10:00:00Z", status: "scheduled" } as const;
    expect(driftOf({ ...base, error: "the export this slot publishes no longer exists" })).toEqual({ ...base, drift: "export_missing" });
    expect(driftOf({ ...base, error: "this channel is not wired" })).toEqual({ ...base, drift: "channel_not_wired" });
    expect(driftOf({ ...base, status: "failed", error: "upload: 403 quotaExceeded" })).toEqual({ ...base, status: "failed", error: "upload: 403 quotaExceeded" });
  });
});

describe("a kept take's waveform", () => {
  it("keeps each span's loudest peak, bounded, and leaves a short strip as it is", () => {
    expect(downsample([0.1, 0.9, 0.2, 0.3, 0.8, 0.4], 3)).toEqual([0.9, 0.3, 0.8]);
    expect(downsample([0.5, 0.6], 37)).toEqual([0.5, 0.6]);
    expect(downsample(Array.from({ length: 1000 }, (_, i) => i / 1000), 37)).toHaveLength(37);
  });
});
