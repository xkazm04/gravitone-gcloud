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

import { nextPile, pileOrder, spendOf } from "../../app/(studio)/_shell/facts.ts";
import { SLOTS } from "../../app/(studio)/floor/_calendar/fixtureData.ts";
import { applyCancel, applyMove, applyPublishNow, fixtureAct, fixtureFacts, fixtureItems, fixtureSchedule, seedRow, viewOf, type FixtureRow } from "../../app/(studio)/floor/_calendar/fixture.ts";
import { byLane, floorSearch, parseFloorUrl, scheduleHref, slotHref } from "../../app/(studio)/floor/_floor/model.ts";
import { downsample } from "../../app/(studio)/floor/_floor/shelf.ts";
import type { LiveJob, WeirItem } from "../../lib/ledger/v1/types.ts";

// The Floor's pure rules: which pile is NEXT (the header and the Floor share it), how runs and
// piles fall into lanes, what the last 24 hours cost, the page's URL, the fixture calendar (the
// domain's records and machine, and the engine's refusals for a new slot), and the bounded
// waveform a kept take carries to the page. The real side is ./floor-real.test.ts.

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

describe("the URL", () => {
  it("round-trips the focused lane, the month, its day, the hidden channels and the open slot", () => {
    const u = parseFloorUrl({ lane: "audio", cal: "1", day: "2026-10-15", off: "tiktok,blog", slot: "sl-chokepoint-quota" });
    expect(u).toEqual({ lane: "audio", cal: true, day: "2026-10-15", off: ["blog", "tiktok"], slot: "sl-chokepoint-quota", schedule: null });
    expect(floorSearch(u)).toBe("?lane=audio&cal=1&day=2026-10-15&off=blog,tiktok&slot=sl-chokepoint-quota");
    expect(parseFloorUrl(Object.fromEntries(new URLSearchParams(floorSearch(u))))).toEqual(u);
  });

  it("drops what it does not know rather than guessing, and a day or channels without the month", () => {
    expect(parseFloorUrl({ lane: "gpu.local", cal: "yes", day: "tomorrow", off: "Tik Tok", slot: "a b", new: "yes", item: "x" })).toEqual({ lane: null, cal: false, day: null, off: [], slot: null, schedule: null });
    expect(floorSearch({ lane: null, cal: false, day: "2026-10-15", off: ["tiktok"], slot: null, schedule: null })).toBe("");
  });

  it("opens a slot with or without the month beneath it", () => {
    expect(floorSearch({ lane: null, cal: false, day: null, off: [], slot: "sl-a", schedule: null })).toBe("?slot=sl-a");
    expect(slotHref("sl-a")).toBe("/floor?cal=1&slot=sl-a");
    expect(slotHref("sl-a", false)).toBe("/floor?slot=sl-a");
  });

  it("carries the schedule sheet and the item a Library act asked for; a link lands on the same sheet", () => {
    const u = parseFloorUrl(Object.fromEntries(new URL(scheduleHref("video:export:chokepoint"), "http://x").searchParams));
    expect(u.schedule).toEqual({ item: "video:export:chokepoint" });
    expect(u.cal).toBe(true);
    expect(floorSearch(u)).toBe("?cal=1&new=1&item=video%3Aexport%3Achokepoint");
    expect(parseFloorUrl({ new: "1" }).schedule).toEqual({ item: null });
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

describe("the fixture calendar's engine refusals", () => {
  const draft = { item: "video:export:river-steps", channel: "youtube", at: "2026-10-20T12:00:00.000Z", title: "Two hundred days of rain", description: "", tags: ["rain"] };

  it("schedules a free export and answers the slot as the engine would hold it", () => {
    const v = must(fixtureSchedule(draft, NOW));
    expect([v.slot.status, v.slot.item, v.rev, v.source]).toEqual(["scheduled", "video:export:river-steps", 1, "fixture"]);
    expect(fixtureItems().some((i) => i.id === "video:export:river-steps" && i.poster !== undefined)).toBe(true);
  });

  it("refuses an item already on that channel, an unwired channel, an unknown item and a blog slot - each in words", () => {
    const words = (r: { ok: boolean; error?: { message: string } }) => (r.ok ? null : (r.error?.message ?? ""));
    expect(words(fixtureSchedule({ ...draft, item: "video:export:why-bitcoin" }, NOW))).toMatch(/^video:export:why-bitcoin is already on youtube \(slot sl-bitcoin-yt, scheduled for /);
    expect(words(fixtureSchedule({ ...draft, channel: "instagram" }, NOW))).toBe("instagram is not wired");
    expect(words(fixtureSchedule({ ...draft, item: "video:export:nowhere" }, NOW))).toBe("unknown item video:export:nowhere");
    expect(words(fixtureSchedule({ ...draft, channel: "blog" }, NOW))).toMatch(/approve on the Board/);
  });

  it("refuses a Library item that is not an export on a video channel, in the adapter's words", () => {
    const r = fixtureSchedule({ ...draft, item: "article:run:art-2026-10-16-routing" }, NOW);
    expect(r.ok ? null : [r.error.code, r.error.message]).toEqual(["refused", "article:run:art-2026-10-16-routing is not an export; youtube publishes exports"]);
  });

  it("refuses a verb sent on a revision the slot has moved past, and writes nothing", () => {
    const first = must(fixtureAct("sl-tariff-yt-later", NOW, (r) => applyMove(r, "2026-10-28T10:00:00.000Z", NOW), 1));
    expect(first.rev).toBe(2);
    const stale = fixtureAct("sl-tariff-yt-later", NOW, applyCancel, 1);
    expect(stale.ok ? null : [stale.error.code, stale.error.message]).toEqual(["conflict", "The quiet tariff: it changed since it was opened - now scheduled for 2026-10-28T10:00:00.000Z"]);
    expect(must(fixtureAct("sl-tariff-yt-later", NOW, (r) => ({ ok: true, value: r }))).slot.status).toBe("scheduled");
  });

  it("says what each channel can do: YouTube dry, Instagram not wired, blog by its approve; names only", () => {
    const f = must(fixtureFacts(NOW));
    expect(f.channels.map((c) => [c.channel, c.state])).toEqual([["youtube", "dry"], ["tiktok", "dry"], ["instagram", "not_wired"], ["blog", "act"]]);
    expect(f.channels.flatMap((c) => c.env.map((e) => e.present))).not.toContain(true);
    expect(f.channels.find((c) => c.channel === "youtube")?.lastFailure?.error).toBe("upload: 403 quotaExceeded - The request cannot be completed because you have exceeded your quota.");
  });
});

describe("a kept take's waveform", () => {
  it("keeps each span's loudest peak, bounded, and leaves a short strip as it is", () => {
    expect(downsample([0.1, 0.9, 0.2, 0.3, 0.8, 0.4], 3)).toEqual([0.9, 0.3, 0.8]);
    expect(downsample([0.5, 0.6], 37)).toEqual([0.5, 0.6]);
    expect(downsample(Array.from({ length: 1000 }, (_, i) => i / 1000), 37)).toHaveLength(37);
  });
});
