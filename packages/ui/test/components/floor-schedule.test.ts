// Putting something on the calendar (Phase 6, L63): where the form opens (its hour, channel and
// item), what blocks a send, what the engine or the tick will decide (warnings), and what the
// form, the channel readiness and the month draw. Pure functions over literals; markup through
// react-dom/server.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { RailSlot } from "../../src/components/floor/calendar.ts";
import { ChannelReadiness } from "../../src/components/floor/ChannelReadiness.tsx";
import { MonthCalendar } from "../../src/components/floor/MonthCalendar.tsx";
import { ScheduleForm } from "../../src/components/floor/ScheduleForm.tsx";
import { channelDefault, checkSchedule, itemDefault, scheduleWarnings, splitTags, whenDefault, type ChannelReady, type ScheduleForm as Form } from "../../src/components/floor/schedule.ts";

const NOW = Date.UTC(2026, 9, 15, 9, 12);
const slot = (id: string, publishAt: string, status: RailSlot["status"], more: Partial<RailSlot> = {}): RailSlot => ({ id, title: id, channel: "youtube", publishAt, status, ...more });
const ch = (channel: string, state: ChannelReady["state"], more: Partial<ChannelReady> = {}): ChannelReady => ({ channel, state, env: [], command: "x", ...more });
const CHANNELS = [ch("youtube", "dry"), ch("tiktok", "live"), ch("instagram", "not_wired"), ch("blog", "act")];
const form = (over: Partial<Form> = {}): Form => ({ item: "video:export:a", channel: "youtube", when: "2026-10-16T12:00", title: "A cut", description: "", tags: "", ...over });

describe("where the form opens", () => {
  test("today and no day open on the next full hour; a later day at its noon; a day gone on the next hour", () => {
    expect(whenDefault(null, NOW)).toBe("2026-10-15T10:00");
    expect(whenDefault("2026-10-15", NOW)).toBe("2026-10-15T10:00");
    expect(whenDefault("2026-10-20", NOW)).toBe("2026-10-20T12:00");
    expect(whenDefault("2026-10-01", NOW)).toBe("2026-10-15T10:00");
  });

  test("the channel last scheduled on while it can publish, else the first that can; never one that cannot", () => {
    expect(channelDefault(CHANNELS, "tiktok")).toBe("tiktok");
    expect(channelDefault(CHANNELS, "instagram")).toBe("youtube");
    expect(channelDefault(CHANNELS, null)).toBe("youtube");
    expect(channelDefault([ch("instagram", "not_wired"), ch("blog", "act")], "blog")).toBeNull();
  });

  test("the item asked for, else the first no slot holds on the channel, else the first", () => {
    const items = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
    const held = [slot("s", "2026-10-16T10:00:00.000Z", "scheduled", { item: "a" })];
    expect(itemDefault(items, held, "b", "youtube")).toBe("b");
    expect(itemDefault(items, held, "gone", "youtube")).toBe("b");
    expect(itemDefault(items, held, null, "tiktok")).toBe("a");
    expect(itemDefault(items, [], null, "youtube")).toBe("a");
    expect(itemDefault(items, [...held, slot("t", "2026-10-16T10:00:00.000Z", "published", { item: "b" })], null, "youtube")).toBe("a");
  });

  test("a slot published DRY holds nothing: its item is still the first the form offers on that channel", () => {
    const items = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
    const rehearsed = [slot("d", "2026-10-14T10:00:00.000Z", "published", { item: "a", dry: true })];
    expect(itemDefault(items, rehearsed, null, "youtube")).toBe("a");
    // The same slot published live holds its item, and the form opens on the next.
    expect(itemDefault(items, [slot("l", "2026-10-14T10:00:00.000Z", "published", { item: "a" })], null, "youtube")).toBe("b");
  });
});

describe("what blocks a send", () => {
  test("a whole form makes the engine's draft: an ISO instant, tags split, trimmed and de-duplicated", () => {
    const r = checkSchedule(form({ title: "  A cut ", tags: "heist, trailer,heist, " }), CHANNELS);
    expect(r.blocked).toEqual([]);
    expect(r.draft).toEqual({ item: "video:export:a", channel: "youtube", at: "2026-10-16T12:00:00.000Z", title: "A cut", description: "", tags: ["heist", "trailer"] });
  });

  test("no item, an unwired or by-approve channel, not a time, no title - each named, and no draft", () => {
    const words = (f: Form) => checkSchedule(f, CHANNELS).blocked.map((b) => b.words);
    expect(words(form({ item: null }))).toEqual(["no export"]);
    expect(words(form({ channel: "instagram" }))).toEqual(["instagram · not wired"]);
    expect(words(form({ channel: "blog" }))).toEqual(["blog · by approve"]);
    expect(words(form({ when: "tomorrow" }))).toEqual(["not a time"]);
    expect(words(form({ title: "   " }))).toEqual(["no title"]);
    expect(checkSchedule(form({ title: "" }), CHANNELS).draft).toBeNull();
  });
});

describe("what the engine or the tick will decide", () => {
  test("a past hour, a same-minute slot on the channel, the item already held there", () => {
    const slots = [slot("same", "2026-10-16T12:00:30.000Z", "scheduled", { channel: "youtube" }), slot("held", "2026-10-20T08:00:00.000Z", "published", { item: "video:export:a" })];
    expect(scheduleWarnings(form(), slots, NOW).map((w) => w.kind)).toEqual(["clash", "held"]);
    expect(scheduleWarnings(form({ when: "2026-10-15T08:00" }), [], NOW)).toEqual([{ kind: "past", at: "2026-10-15T08:00:00.000Z" }]);
  });

  test("a cancelled or failed slot holds nothing and clashes with nothing; another channel neither", () => {
    const slots = [slot("c", "2026-10-16T12:00:00.000Z", "cancelled", { item: "video:export:a" }), slot("f", "2026-10-16T12:00:00.000Z", "failed", { item: "video:export:a" }), slot("tt", "2026-10-16T12:00:00.000Z", "scheduled", { channel: "tiktok", item: "video:export:a" })];
    expect(scheduleWarnings(form(), slots, NOW)).toEqual([]);
  });

  test("an item published DRY on the channel is not warned as held - the engine lets the live slot be made", () => {
    expect(scheduleWarnings(form(), [slot("d", "2026-10-14T10:00:00.000Z", "published", { item: "video:export:a", dry: true })], NOW)).toEqual([]);
  });

  test("the sheet's item list marks a live-published item as on the channel, and a dry-published one not", () => {
    const items = [{ id: "video:export:a", title: "Rehearsed", meta: "m-a" }, { id: "video:export:b", title: "Went out", meta: "m-b" }];
    const slots = [slot("d", "2026-10-14T10:00:00.000Z", "published", { item: "video:export:a", dry: true }), slot("l", "2026-10-14T11:00:00.000Z", "published", { item: "video:export:b" })];
    const html = renderToStaticMarkup(h(ScheduleForm, { items: { kind: "read", items }, channels: CHANNELS, slots, nowMs: NOW, day: null, item: null, lastChannel: "youtube", busy: false, onSchedule: () => undefined }));
    const button = (id: string): string => html.match(new RegExp(`data-item="${id}">(.*?)</button>`))?.[1] ?? "";
    expect(button("video:export:a")).not.toContain("· published");
    expect(button("video:export:b")).toContain("· published");
    // The form opens on the rehearsed item, not past it.
    expect(html).toMatch(/aria-checked="true"[^>]*data-item="video:export:a"/);
  });

  test("tags split on commas only", () => {
    expect(splitTags("a b, c,,c")).toEqual(["a b", "c"]);
  });
});

describe("what is drawn", () => {
  test("the form: a locked channel says why, a refusal is verbatim, the send is blocked with its reason", () => {
    const html = renderToStaticMarkup(
      h(ScheduleForm, { items: { kind: "read", items: [{ id: "video:export:a", title: "A cut" }] }, channels: CHANNELS, slots: [], nowMs: NOW, day: null, item: null, lastChannel: "instagram", busy: false, refusal: "video:export:a is already on youtube (slot sl-1, scheduled for 2026-10-16T12:00:00.000Z)", onSchedule: () => undefined }),
    );
    expect(html).toContain('data-channel="instagram" data-state="not_wired"');
    expect(html).toMatch(/aria-disabled="true"[^>]*data-channel="instagram"/);
    expect(html).toContain("not wired");
    expect(html).toContain("is already on youtube (slot sl-1, scheduled for 2026-10-16T12:00:00.000Z)");
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*data-channel="youtube"/);
  });

  test("the form never draws 'no export' while the exports are being read, nor when the read failed", () => {
    const base = { channels: CHANNELS, slots: [], nowMs: NOW, day: null, item: null, lastChannel: null, busy: false, onSchedule: () => undefined };
    expect(renderToStaticMarkup(h(ScheduleForm, { ...base, items: { kind: "reading" } }))).toContain('aria-busy="true"');
    const failed = renderToStaticMarkup(h(ScheduleForm, { ...base, items: { kind: "failed", error: "library: the index is locked" } }));
    expect(failed).toContain("library: the index is locked");
    expect(failed).not.toContain("no export in the library");
  });

  test("readiness: names and set/unset, the last failure verbatim, the command; never a value", () => {
    const html = renderToStaticMarkup(h(ChannelReadiness, { channels: [ch("youtube", "dry", { env: [{ name: "YT_ID", present: true }, { name: "YT_TOKEN", present: false }], command: "npx tsx pipeline/publish.mts channels --json", lastFailure: { at: "2026-10-14T09:00:00.000Z", error: "auth: invalid_grant", inARow: 1 } })] }));
    expect(html).toContain("YT_ID · set");
    expect(html).toContain("YT_TOKEN · unset");
    expect(html).toContain("auth: invalid_grant");
    expect(html).toContain("npx tsx pipeline/publish.mts channels --json");
    // Every calendar instant names its zone (calendar.ts whenUtc), the readiness hours too.
    expect(html).toContain("failed · Wed 14 Oct · 09:00 UTC");
    const out = renderToStaticMarkup(h(ChannelReadiness, { channels: [ch("youtube", "live", { lastOut: "2026-10-13T18:30:00.000Z" })] }));
    expect(out).toContain("out · Tue 13 Oct · 18:30 UTC");
  });

  test("the month: a toggle on an unwired channel says so; the agenda carries the readiness; Schedule is offered", () => {
    const html = renderToStaticMarkup(
      h(MonthCalendar, {
        slots: [slot("ig", "2026-10-16T10:00:00.000Z", "scheduled", { channel: "instagram" }), slot("yt", "2026-10-16T11:00:00.000Z", "scheduled")],
        nowMs: NOW,
        month: { y: 2026, m: 9 },
        day: null,
        channelsOff: new Set<string>(),
        onMonth: () => undefined,
        onToday: () => undefined,
        onDay: () => undefined,
        onChannel: () => undefined,
        onClose: () => undefined,
        channels: CHANNELS,
        mode: "dry",
        onSchedule: () => undefined,
      }),
    );
    // The unwired toggle SAYS it (a drawn word); a wired one only speaks its state (sr-only), so
    // the two state spans must not share a class.
    const stateSpan = (state: string): string | undefined => new RegExp(`data-state="${state}">[\\s\\S]*?<span class="([^"]*)">[^<]*</span></button>`).exec(html)?.[1];
    expect(stateSpan("not_wired")).toBeDefined();
    expect(stateSpan("not_wired")).not.toBe(stateSpan("dry"));
    expect(html).toContain('data-component="ChannelReadiness"');
    expect(html).toContain("dry run");
    expect(html).toContain(">Schedule<");
  });

  test("the publish timer: its last tick while it runs; stopped or never run said in rose; a standing failure verbatim", () => {
    const base = { slots: [], nowMs: NOW, month: { y: 2026, m: 9 }, day: null, channelsOff: new Set<string>(), onMonth: () => undefined, onToday: () => undefined, onDay: () => undefined, onChannel: () => undefined, onClose: () => undefined, channels: CHANNELS };
    expect(renderToStaticMarkup(h(MonthCalendar, { ...base, tick: { running: true, lastRunAt: "2026-10-15T09:11:30.000Z", nextDueAt: "2026-10-15T09:12:00.000Z" } }))).toContain("tick · 09:11");
    expect(renderToStaticMarkup(h(MonthCalendar, { ...base, tick: { running: false, lastRunAt: null, nextDueAt: null } }))).toContain("tick · never ran");
    expect(renderToStaticMarkup(h(MonthCalendar, { ...base, tick: { running: false, lastRunAt: "2026-10-14T22:00:00.000Z", nextDueAt: null } }))).toContain("tick stopped · 22:00");
    const failing = renderToStaticMarkup(h(MonthCalendar, { ...base, tick: { running: true, lastRunAt: "2026-10-15T09:11:30.000Z", nextDueAt: null, failing: { since: "2026-10-15T08:00:00.000Z", error: "sweep: database is locked" } } }));
    expect(failing).toContain("tick failing · since 08:00");
    expect(failing).toContain("sweep: database is locked");
  });
});
