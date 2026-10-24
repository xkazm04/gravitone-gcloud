// The Floor's parts: the lane twin, the desk a pile opens, the lanes' row sizes, the calendar's
// UTC arithmetic and rail sections, the header's spend split and ledger delta, and what the
// components say aloud. Pure functions over literals; markup through react-dom/server.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { MEDIA_LANES } from "@gt/domain/lane";

import { BADGE_CHANNELS, ChannelBadge, isBadgeChannel } from "../../src/components/channel/ChannelBadge.tsx";
import { byDay, clock, dayLabel, monthCells, moveDay, nextRows, railOf, shiftMonth, type RailSlot } from "../../src/components/floor/calendar.ts";
import { FLOOR_LANES, isFloorLane, laneAt, laneRows, modeOf, progressShare } from "../../src/components/floor/floor.ts";
import { CalendarColumn } from "../../src/components/floor/CalendarColumn.tsx";
import { Lane } from "../../src/components/floor/Lane.tsx";
import { MonthCalendar, MAX_PER_DAY } from "../../src/components/floor/MonthCalendar.tsx";
import { Pile } from "../../src/components/floor/Pile.tsx";
import { RunRow } from "../../src/components/floor/RunRow.tsx";
import { SlotRow } from "../../src/components/floor/SlotRow.tsx";
import { ledgerDelta, spendParts } from "../../src/components/header/header.ts";
import { LedgerDelta, NextButton, SpendChip } from "../../src/components/header/HeaderChips.tsx";

const NOW = Date.UTC(2026, 9, 15, 9, 12);
const slot = (id: string, publishAt: string, status: RailSlot["status"], more: Partial<RailSlot> = {}): RailSlot => ({ id, title: id, channel: "youtube", publishAt, status, ...more });

describe("lanes", () => {
  test("the twin is the domain's media lanes, in the order the digits bind", () => {
    expect(FLOOR_LANES.map((l) => l.id)).toEqual([...MEDIA_LANES]);
    expect(FLOOR_LANES.map((l) => l.n)).toEqual([1, 2, 3, 4]);
    expect(laneAt(3)?.id).toBe("audio");
    expect(laneAt(5)).toBeUndefined();
    expect(isFloorLane("video")).toBe(true);
    expect(isFloorLane("gpu.local")).toBe(false);
  });

  test("a cull opens the matrix; a gate opens packet review for an article and blind pairs otherwise", () => {
    expect(modeOf("cull", "image")).toBe("matrix-cull");
    expect(modeOf("cull", "article")).toBe("matrix-cull");
    expect(modeOf("gate", "article")).toBe("packet-review");
    expect(modeOf("gate", "image")).toBe("blind-pair");
  });

  test("a focused lane takes the height and the others fold; unfocused, a lane with a shelf grows", () => {
    expect(laneRows("audio", () => false).split(" ")).toEqual(["var(--h-lane-folded)", "var(--h-lane-folded)", "minmax(0,1fr)", "var(--h-lane-folded)"]);
    expect(laneRows(null, (l) => l === "image").split(" ")).toEqual(["minmax(0,1fr)", "minmax(var(--h-lane-min),.7fr)", "minmax(var(--h-lane-min),.7fr)", "minmax(var(--h-lane-min),.7fr)"]);
  });

  test("progress is a share only when v1 counted something", () => {
    expect(progressShare(undefined)).toBeNull();
    expect(progressShare({ done: 0, total: 0 })).toBeNull();
    expect(progressShare({ done: 3, total: 20 })).toBe(0.15);
    expect(progressShare({ done: 25, total: 20 })).toBe(1);
  });
});

describe("calendar arithmetic (UTC)", () => {
  test("clock and day labels are UTC whatever the reader's zone", () => {
    expect(clock(NOW)).toBe("09:12");
    expect(dayLabel("2026-10-15")).toBe("Thu 15 Oct");
  });

  test("a month is whole weeks, Monday first, with the days outside it marked", () => {
    const { weeks, cells } = monthCells({ y: 2026, m: 9 });
    expect(weeks).toBe(5);
    expect(cells).toHaveLength(35);
    expect(cells[0]).toEqual({ key: "2026-09-28", date: 28, out: true });
    expect(cells[3]).toEqual({ key: "2026-10-01", date: 1, out: false });
    expect(cells.at(-1)).toEqual({ key: "2026-11-01", date: 1, out: true });
  });

  test("months and days walk across year edges", () => {
    expect(shiftMonth({ y: 2026, m: 11 }, 1)).toEqual({ y: 2027, m: 0 });
    expect(shiftMonth({ y: 2026, m: 0 }, -1)).toEqual({ y: 2025, m: 11 });
    expect(moveDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(moveDay("2026-10-15", -7)).toBe("2026-10-08");
  });

  test("byDay groups by UTC day, each day earliest first", () => {
    const d = byDay([slot("b", "2026-10-15T23:30:00.000Z", "scheduled"), slot("a", "2026-10-15T08:00:00.000Z", "scheduled"), slot("c", "2026-10-16T00:10:00.000Z", "scheduled")]);
    expect([...d.keys()]).toEqual(["2026-10-15", "2026-10-16"]);
    expect(d.get("2026-10-15")?.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("the rail", () => {
  const slots = [
    slot("later", "2026-10-16T10:00:00.000Z", "scheduled"),
    slot("soon", "2026-10-15T12:00:00.000Z", "publishing"),
    slot("overdue", "2026-10-15T06:00:00.000Z", "scheduled"),
    slot("lost", "2026-10-14T06:00:00.000Z", "failed", { error: "upload: 403 quotaExceeded" }),
    slot("gone", "2026-10-13T06:00:00.000Z", "missed"),
    slot("out", "2026-10-12T06:00:00.000Z", "published"),
    slot("dropped", "2026-10-12T07:00:00.000Z", "cancelled"),
  ];
  const rail = railOf(slots, NOW);

  test("Next holds scheduled and publishing slots by day, failures newest first, published apart", () => {
    expect(rail.next.map((g) => [g.day, g.slots.map((x) => x.id)])).toEqual([
      ["2026-10-15", ["overdue", "soon"]],
      ["2026-10-16", ["later"]],
    ]);
    expect(rail.nextCount).toBe(3);
    expect(rail.failed.map((x) => x.id)).toEqual(["lost", "gone"]);
    expect(rail.published.map((x) => x.id)).toEqual(["out"]);
  });

  test("a scheduled slot past its hour stays in Next, before the NOW line", () => {
    expect(rail.overdue).toBe(1);
    const rows = nextRows(rail).map((r) => (r.kind === "now" ? "NOW" : r.kind === "day" ? r.day : r.slot.id));
    expect(rows).toEqual(["2026-10-15", "overdue", "NOW", "soon", "2026-10-16", "later"]);
    expect(nextRows(railOf([slot("a", "2026-10-16T10:00:00.000Z", "scheduled")], NOW))[0]).toEqual({ kind: "now" });
  });

  test("the column draws Next with NOW after the overdue, and Published counted in full though six are drawn", () => {
    const many = Array.from({ length: 8 }, (_, i) => slot(`pub${i}`, new Date(Date.UTC(2026, 9, 10 + i % 4, 6 + i)).toISOString(), "published"));
    const html = renderToStaticMarkup(h(CalendarColumn, { rail: railOf([...slots, ...many], NOW), nowMs: NOW, open: false, onOpen: () => undefined, slotHref: (id: string) => `/floor?slot=${id}` }));
    const order = [...html.matchAll(/data-slot="([^"]+)"|data-now=""/g)].map((m) => m[1] ?? "NOW");
    expect(order.slice(0, 4)).toEqual(["overdue", "NOW", "soon", "later"]);
    expect(html).toContain("NOW 09:12 UTC");
    expect(order.filter((id) => id === "out" || id.startsWith("pub"))).toHaveLength(6);
    expect(html).toMatch(/Published <span[^>]*><span aria-hidden="true">9</);
  });
});

describe("header numbers", () => {
  test("spend parts: nothing beside an all-real total, every source when any is not real", () => {
    expect(spendParts({ bySrc: { real: 4 } })).toEqual([]);
    expect(spendParts({ bySrc: { model: 3.2, real: 1 } })).toEqual([
      { src: "real", usd: 1 },
      { src: "model", usd: 3.2 },
    ]);
    expect(spendParts({ bySrc: {} })).toEqual([]);
    expect(spendParts({ bySrc: { model: 3 } })).toEqual([{ src: "model", usd: 3 }]);
  });

  test("the ledger delta counts after the mark; no mark counts nothing; a mark past the head is another ledger", () => {
    expect(ledgerDelta(120, 100)).toBe(20);
    expect(ledgerDelta(120, undefined)).toBe(0);
    expect(ledgerDelta(120, 120)).toBe(0);
    expect(ledgerDelta(30, 500)).toBe(30);
  });

  test("a modelled figure is never drawn as spent: its source travels with it, spoken too", () => {
    const html = renderToStaticMarkup(h(SpendChip, { spend: { total: 4.2, bySrc: { real: 1, model: 3.2 }, priced: 3, capped: true } }));
    expect(html).toContain("$4.20+");
    expect(html).toContain("model $3.20");
    expect(html).toContain('aria-label="spend in the last 24 hours $4.20+, real $1.00, model $3.20, more acts than were read"');
  });

  test("NEXT names its pile and its key; a clear weir says so", () => {
    const html = renderToStaticMarkup(h(NextButton, { next: { title: "forge sweep-01", count: 12, href: "/board/pkt%3Aforge%3Asweep-01" } }));
    expect(html).toContain('href="/board/pkt%3Aforge%3Asweep-01"');
    expect(html).toContain("Open next decision: forge sweep-01, 12 items");
    expect(html).toContain("⏎");
    expect(renderToStaticMarkup(h(NextButton, { next: null }))).toContain("weir clear");
    expect(renderToStaticMarkup(h(LedgerDelta, { delta: 7 }))).toContain("+7");
  });
});

describe("components", () => {
  test("a lane draws the keymap's own key for its position and names its focus control", () => {
    const lane = FLOOR_LANES[2];
    const html = renderToStaticMarkup(h(Lane, { lane, state: "open", onFocus: () => undefined, foundry: null, weir: null, shelf: null }));
    expect(html).toContain('aria-label="Audio lane"');
    expect(html).toContain(">3</kbd>");
    expect(html).toContain('aria-label="focus Audio lane"');
    const focused = renderToStaticMarkup(h(Lane, { lane, state: "focused", onFocus: () => undefined, foundry: null, weir: null, shelf: null }));
    expect(focused).toContain('aria-label="show all lanes"');
    expect(focused).toContain('aria-pressed="true"');
  });

  test("a pile links its packet, says its size and desk, and the NEXT one says so", () => {
    const html = renderToStaticMarkup(h(Pile, { title: "forge sweep-01", media: "image", mode: "matrix-cull", source: "forge", runId: "sweep-01", decided: 4, pending: 16, href: "/board/x", next: true }));
    expect(html).toContain('href="/board/x"');
    expect(html).toContain('aria-label="next: forge sweep-01, 20 items, 16 pending, matrix cull"');
    expect(html).toContain("4/20");
    expect(html).toContain("sweep-01");
  });

  test("an article pile is paper with its title; an audio pile is waveforms", () => {
    expect(renderToStaticMarkup(h(Pile, { title: "Agent budgets", media: "article", mode: "packet-review", source: "articles", runId: "r1", decided: 0, pending: 1, href: "/b" }))).toContain("Agent budgets");
    expect(renderToStaticMarkup(h(Pile, { title: "suno", media: "audio", mode: "matrix-cull", source: "suno", runId: "suno/triage", decided: 0, pending: 3, href: "/b" })).match(/<svg/g)?.length).toBe(4);
  });

  test("a run row draws its state in the job vocabulary and v1's error verbatim", () => {
    const html = renderToStaticMarkup(h(RunRow, { title: "extract ghibli", media: "image", state: "interrupted", progress: { done: 3, total: 20, stage: "replicate" }, error: "lease lost: holder pid 4410 gone" }));
    expect(html).toContain("interrupted");
    expect(html).toContain("3/20");
    expect(html).toContain("replicate");
    expect(html).toContain("lease lost: holder pid 4410 gone");
  });

  test("a failed slot shows its error verbatim; an unknown channel speaks its id", () => {
    const html = renderToStaticMarkup(h(SlotRow, { slot: slot("s", "2026-10-15T08:00:00.000Z", "failed", { error: "upload: 403 quotaExceeded", channel: "mastodon" }) }));
    expect(html).toContain("upload: 403 quotaExceeded");
    expect(html).toContain("mastodon");
    expect(html).toContain("08:00");
  });

  test("the blog channel has a badge of its own", () => {
    expect(BADGE_CHANNELS).toContain("blog");
    expect(isBadgeChannel("blog")).toBe(true);
    expect(isBadgeChannel("mastodon")).toBe(false);
    expect(renderToStaticMarkup(h(ChannelBadge, { channel: "blog" }))).toContain("PR");
  });

  test("a busy day shows what fits and counts the rest", () => {
    const busy = [0, 1, 2, 3, 4].map((i) => slot(`b${i}`, `2026-10-20T0${i}:00:00.000Z`, "scheduled"));
    const html = renderToStaticMarkup(
      h(MonthCalendar, { slots: busy, nowMs: NOW, month: { y: 2026, m: 9 }, day: null, channelsOff: new Set<string>(), onMonth: () => undefined, onToday: () => undefined, onDay: () => undefined, onChannel: () => undefined, onClose: () => undefined }),
    );
    expect(html).toContain(`+${busy.length - MAX_PER_DAY}`);
    expect(html).toContain('aria-label="Calendar, October 2026"');
    expect(html).toContain("Tue 20 Oct, 5 slots");
  });
});
