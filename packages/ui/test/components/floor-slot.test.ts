// The Calendar's slot (Phase 6, L58): what a person owes a slot, the verbs' rules and the move
// field's hour, the words drawn from fields, the publish chain an error broke, metrics where
// null is unmeasured, and what the slot's record and its rows say. Pure functions over
// literals; markup through react-dom/server.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { needsDecision, railOf, type RailSlot } from "../../src/components/floor/calendar.ts";
import { MonthCalendar } from "../../src/components/floor/MonthCalendar.tsx";
import { SlotConfirm } from "../../src/components/floor/SlotConfirm.tsx";
import { SlotDetail, type SlotView } from "../../src/components/floor/SlotDetail.tsx";
import { SlotRow } from "../../src/components/floor/SlotRow.tsx";
import { breakOf, canCancel, canMove, canPublishNow, duration, figure, fromUtcInput, missedWords, moveDefault, moveProblem, nextFullHour, signed, toUtcInput } from "../../src/components/floor/slot.ts";

const NOW = Date.UTC(2026, 9, 15, 9, 12);
const slot = (id: string, publishAt: string, status: RailSlot["status"], more: Partial<RailSlot> = {}): RailSlot => ({ id, title: id, channel: "youtube", publishAt, status, ...more });

describe("what a person owes a slot", () => {
  test("missed, failed and a drifted scheduled slot need a decision; a waiting or settled one does not", () => {
    expect(needsDecision(slot("a", "2026-10-15T10:00:00.000Z", "missed"))).toBe(true);
    expect(needsDecision(slot("a", "2026-10-15T10:00:00.000Z", "failed", { error: "x" }))).toBe(true);
    expect(needsDecision(slot("a", "2026-10-15T10:00:00.000Z", "scheduled", { drift: "export_missing" }))).toBe(true);
    expect(needsDecision(slot("a", "2026-10-15T10:00:00.000Z", "scheduled"))).toBe(false);
    expect(needsDecision(slot("a", "2026-10-15T10:00:00.000Z", "cancelled", { error: "x" }))).toBe(false);
  });

  test("a drifted slot is not Next on the rail: it sits with the failures, because it will not fire", () => {
    const rail = railOf([slot("drifted", "2026-10-16T10:00:00.000Z", "scheduled", { drift: "channel_not_wired" }), slot("next", "2026-10-16T11:00:00.000Z", "scheduled")], NOW);
    expect(rail.next.flatMap((g) => g.slots.map((x) => x.id))).toEqual(["next"]);
    expect(rail.failed.map((x) => x.id)).toEqual(["drifted"]);
  });

  test("a cancelled slot still ahead is drawn in its day, struck, and not counted as next", () => {
    const rail = railOf([slot("next", "2026-10-16T11:00:00.000Z", "scheduled"), slot("struck", "2026-10-16T10:00:00.000Z", "cancelled"), slot("gone", "2026-10-14T10:00:00.000Z", "cancelled")], NOW);
    expect(rail.next.flatMap((g) => g.slots.map((x) => x.id))).toEqual(["struck", "next"]);
    expect(rail.nextCount).toBe(1);
    expect(renderToStaticMarkup(h(SlotRow, { slot: slot("struck", "2026-10-16T10:00:00.000Z", "cancelled") }))).toContain('data-status="cancelled"');
  });
});

describe("the verbs", () => {
  test("move and cancel from scheduled, missed and failed only", () => {
    for (const st of ["scheduled", "missed", "failed"] as const) expect([canMove({ status: st }), canCancel({ status: st })]).toEqual([true, true]);
    for (const st of ["publishing", "published", "cancelled"] as const) expect([canMove({ status: st }), canCancel({ status: st })]).toEqual([false, false]);
  });

  test("publish now is never offered on a drifted slot or a blog slot", () => {
    expect(canPublishNow({ status: "missed", channel: "youtube" })).toBe(true);
    expect(canPublishNow({ status: "scheduled", channel: "youtube", drift: "export_missing" })).toBe(false);
    expect(canPublishNow({ status: "scheduled", channel: "blog" })).toBe(false);
    expect(canPublishNow({ status: "published", channel: "youtube" })).toBe(false);
  });

  test("the move field starts at the next full UTC hour for a missed slot or one whose hour passed, else at its own", () => {
    expect(nextFullHour(NOW)).toBe(Date.UTC(2026, 9, 15, 10));
    expect(moveDefault(slot("m", "2026-10-15T12:30:00.000Z", "missed"), NOW)).toBe("2026-10-15T10:00");
    expect(moveDefault(slot("f", "2026-10-14T08:00:00.000Z", "failed"), NOW)).toBe("2026-10-15T10:00");
    expect(moveDefault(slot("s", "2026-10-17T18:45:00.000Z", "scheduled"), NOW)).toBe("2026-10-17T18:45");
  });

  test("the field reads and writes UTC, whatever the host zone", () => {
    expect(toUtcInput(Date.UTC(2026, 0, 2, 3, 4))).toBe("2026-01-02T03:04");
    expect(fromUtcInput("2026-01-02T03:04")).toBe("2026-01-02T03:04:00.000Z");
    expect(fromUtcInput("tomorrow")).toBeNull();
  });

  test("a move into the past, or of a settled slot, is refused before it is sent", () => {
    expect(moveProblem({ status: "scheduled" }, "2026-10-15T09:00:00.000Z", NOW)).toBe("that hour has passed");
    expect(moveProblem({ status: "published" }, "2026-10-16T09:00:00.000Z", NOW)).toBe("a published slot does not move");
    expect(moveProblem({ status: "missed" }, null, NOW)).toBe("not a time");
    expect(moveProblem({ status: "failed" }, "2026-10-16T09:00:00.000Z", NOW)).toBeNull();
  });
});

describe("words from fields", () => {
  test("a missed slot says when its window closed, from missedAt", () => {
    expect(missedWords({ missedAt: "2026-10-12T18:15:00.000Z" })).toBe("missed 18:15 UTC");
    expect(missedWords({})).toBeNull();
  });

  test("the publish chain breaks where the sentence says: credentials at auth, quota and interruption at upload", () => {
    expect(breakOf("auth: access_token_invalid - The access token is invalid")).toBe(1);
    expect(breakOf("upload: 403 quotaExceeded")).toBe(2);
    expect(breakOf("interrupted before the publish finished")).toBe(2);
    expect(breakOf("the platform rejected the video after processing")).toBe(3);
  });

  test("null is unmeasured, never 0; a figure over gaps is a floor", () => {
    expect(figure(null)).toBe("—");
    expect(figure(0)).toBe("0");
    expect(figure(52000, true)).toBe("≥ 52,000");
    expect(duration(71)).toBe("1:11");
    expect(duration(null)).toBe("—");
    expect(signed(-2)).toBe("−2");
    expect(signed(null)).toBe("—");
  });
});

const view = (more: Partial<SlotView> = {}, s: Partial<RailSlot> = {}): SlotView => ({
  slot: slot("sl-x", "2026-10-14T06:00:00.000Z", "failed", { title: "Chokepoint explainer", error: "upload: 403 quotaExceeded - you have exceeded your quota.", ...s }),
  libraryItemId: "video:export:x",
  description: "Every lane has one strait.",
  tags: ["trade"],
  media: { kind: "video", src: "/clips/presets/blueprint.webm", poster: "/clips/presets/blueprint.jpg" },
  ledger: "/ledger?q=sl-x",
  source: "fixture",
  mode: "dry",
  ...more,
});
const detail = (v: SlotView): string => renderToStaticMarkup(h(SlotDetail, { view: v, nowMs: NOW, busy: null, onMove: () => undefined, onCancel: () => undefined, onPublishNow: () => undefined }));

describe("the slot's record", () => {
  test("a failed slot shows the channel's sentence verbatim on the chain, broken at upload, with its verbs", () => {
    const html = detail(view());
    expect(html).toContain("upload: 403 quotaExceeded - you have exceeded your quota.");
    expect(html).toMatch(/upload<span[^>]*>, broke<\/span>/);
    expect(html).toContain("Every lane has one strait.");
    expect(html).toContain('poster="/clips/presets/blueprint.jpg"');
    expect(html).toContain("Move");
    expect(html).toContain("Cancel slot");
    expect(html).toContain("Publish now");
  });

  test("a blog slot draws its post as the ai-registry pull request, with no player and no publish-now", () => {
    const html = detail(view({ media: { kind: "post", pr: "https://github.com/xkazm04/ai-registry/pull/41" }, slot: slot("sl-b", "2026-10-16T09:00:00.000Z", "scheduled", { channel: "blog" }) }));
    expect(html).toContain("post · ai-registry PR");
    expect(html).toContain('href="https://github.com/xkazm04/ai-registry/pull/41"');
    expect(html).not.toContain("<video");
    expect(html).not.toContain("Publish now");
  });

  test("a published slot shows metrics with gaps as gaps, a floor as a floor, and no verbs", () => {
    const { error: _e, ...ok } = view().slot;
    const html = detail(
      view({
        slot: { ...ok, status: "published" },
        publicationId: "pub-dry-sl-x",
        dry: true,
        metrics: { at: "2026-10-18T00:00:00.000Z", views: { value: 52000, floor: true }, likes: { value: 3100 }, comments: { value: null }, shares: { value: null }, avgViewDurationS: null, subsDelta: null },
      }),
    );
    expect(html).toContain("≥ 52,000");
    expect(html).toContain("metrics · 2026-10-18");
    expect(html).toContain("dry run");
    expect(html).not.toContain("0 comments");
    expect(html).not.toContain("Cancel slot");
  });

  test("the confirm names the object and the consequence, never just asks", () => {
    const html = renderToStaticMarkup(h(SlotConfirm, { verb: "Cancel slot", object: "Chokepoint explainer · youtube", consequences: ["final · it never publishes"], tone: "rose", busy: false, onConfirm: () => undefined, onCancel: () => undefined, specimen: true }));
    expect(html).toContain("Chokepoint explainer · youtube");
    expect(html).toContain("final · it never publishes");
  });
});

describe("rows and the month", () => {
  test("a cancelled slot keeps the error it failed with; a missed one says when; a drifted one why", () => {
    expect(renderToStaticMarkup(h(SlotRow, { slot: slot("c", "2026-10-14T06:00:00.000Z", "cancelled", { error: "upload: 400 invalid_container" }) }))).toContain("upload: 400 invalid_container");
    expect(renderToStaticMarkup(h(SlotRow, { slot: slot("m", "2026-10-12T17:15:00.000Z", "missed", { missedAt: "2026-10-12T18:15:00.000Z" }) }))).toContain("missed 18:15 UTC");
    expect(renderToStaticMarkup(h(SlotRow, { slot: slot("d", "2026-10-16T10:00:00.000Z", "scheduled", { drift: "export_missing" }) }))).toContain("export missing");
  });

  test("a row opens its own record, by id", () => {
    const html = renderToStaticMarkup(h(SlotRow, { slot: slot("sl-a", "2026-10-16T10:00:00.000Z", "scheduled"), href: "/floor?slot=sl-a", onOpen: () => undefined }));
    expect(html).toContain('href="/floor?slot=sl-a"');
    expect(html).toContain('data-slot="sl-a"');
  });

  test("the month hides a toggled-off channel and draws a cancelled slot's error", () => {
    const slots = [slot("yt", "2026-10-14T06:00:00.000Z", "cancelled", { title: "struck", error: "upload: 400 invalid_container" }), slot("tt", "2026-10-14T07:00:00.000Z", "scheduled", { channel: "tiktok", title: "vertical cut" })];
    const props = { slots, nowMs: NOW, month: { y: 2026, m: 9 }, day: null, onMonth: () => undefined, onToday: () => undefined, onDay: () => undefined, onChannel: () => undefined, onClose: () => undefined };
    const on = renderToStaticMarkup(h(MonthCalendar, { ...props, channelsOff: new Set<string>() }));
    expect(on).toContain("upload: 400 invalid_container");
    expect(on).toContain("vertical cut");
    expect(renderToStaticMarkup(h(MonthCalendar, { ...props, channelsOff: new Set(["tiktok"]) }))).not.toContain("vertical cut");
  });
});
