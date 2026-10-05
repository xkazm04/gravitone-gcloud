// LANE — THE CALENDAR'S ARITHMETIC (dynamic).
//
// app/calendar/calendarModel.ts is the one place /calendar decides which day a
// slot sits on, which group it waits in, where a drag lands, and how a missing
// number is spelled. Every schedule variant draws from it, so a wrong bucket
// here is wrong three times on screen. And app/calendar/publishClient.ts decides
// how an engine answer is told apart from a route that does not exist.
//
// All dates are built with LOCAL constructors, so the probe holds in any
// timezone: the model buckets in local time and so does every expectation.
// fetch is replaced, never called for real.

import { test, expect } from "@playwright/test";

import {
  bucketByCell,
  bucketByDay,
  canCancel,
  canMove,
  cellKey,
  dayKey,
  dropTarget,
  fmtDuration,
  fmtFigure,
  fmtNum,
  fmtSigned,
  fmtWatch,
  fromLocalInput,
  laneFraction,
  moveDefault,
  movePatch,
  slotGroups,
  speakFigure,
  splitTags,
  toLocalInput,
  weekStart,
} from "@/app/calendar/calendarModel";
import { createSlot, getSchedule } from "@/app/calendar/publishClient";
import { dailySeries, groupSums, publicationTotals, snapshotsOf } from "@/lib/publish/metrics";
import type { MetricSnapshot, Publication, ScheduleSlot, SlotStatus } from "@/lib/publish/types";

const iso = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

function slot(id: string, publishAt: string, status: SlotStatus = "scheduled"): ScheduleSlot {
  return {
    id,
    projectId: "p",
    exportId: "e",
    channelId: "youtube",
    publishAt,
    status,
    title: id,
    description: "",
    tags: [],
    publicationId: null,
    error: null,
    createdAt: iso(2026, 9, 1),
    missedAt: null,
  };
}

test.describe("week bucketing", () => {
  test("weekStart is local Monday midnight, offset by whole weeks", () => {
    const wed = new Date(2026, 9, 7, 15, 30); // Wed 7 Oct 2026
    expect(dayKey(weekStart(wed))).toBe("2026-10-05");
    expect(weekStart(wed).getHours()).toBe(0);
    expect(dayKey(weekStart(wed, 1))).toBe("2026-10-12");
    expect(dayKey(weekStart(wed, -1))).toBe("2026-09-28");
    // Sunday belongs to the week that started six days earlier, not the next one.
    expect(dayKey(weekStart(new Date(2026, 9, 11, 23)))).toBe("2026-10-05");
  });

  test("bucketByDay: every day present, outside and unparseable slots dropped, time order with id tiebreak", () => {
    const start = new Date(2026, 9, 5);
    const b = bucketByDay(
      [
        slot("b", iso(2026, 10, 6, 9)),
        slot("a", iso(2026, 10, 6, 9)),
        slot("c", iso(2026, 10, 6, 8)),
        slot("out", iso(2026, 10, 12, 9)),
        slot("bad", "not a date"),
      ],
      start,
    );
    expect([...b.keys()]).toHaveLength(7);
    expect(b.get("2026-10-06")!.map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect([...b.values()].flat().map((s) => s.id)).not.toContain("out");
    expect([...b.values()].flat().map((s) => s.id)).not.toContain("bad");
  });

  test("bucketByCell keys by local day and hour; dropTarget keeps the slot's minutes", () => {
    const start = new Date(2026, 9, 5);
    const s = slot("x", iso(2026, 10, 6, 14, 30));
    const cells = bucketByCell([s], start);
    expect([...cells.keys()]).toEqual([cellKey(new Date(2026, 9, 6), 14)]);
    const to = dropTarget(s, new Date(2026, 9, 8), 9);
    expect(new Date(to).getDate()).toBe(8);
    expect(new Date(to).getHours()).toBe(9);
    expect(new Date(to).getMinutes()).toBe(30);
  });

  test("laneFraction: 0 at the window start, null outside it", () => {
    const start = new Date(2026, 9, 5);
    expect(laneFraction(start.toISOString(), start, 28)).toBe(0);
    expect(laneFraction(iso(2026, 10, 19, 0), start, 28)).toBeCloseTo(0.5, 2);
    expect(laneFraction(iso(2026, 11, 2, 0), start, 28)).toBeNull();
    expect(laneFraction(iso(2026, 10, 4, 23), start, 28)).toBeNull();
  });
});

test.describe("slot grouping and moves", () => {
  test("slotGroups: decide = missed|failed|drifted, upcoming soonest first, history newest first, empty groups kept", () => {
    const g = slotGroups([
      slot("up2", iso(2026, 10, 9), "scheduled"),
      slot("up1", iso(2026, 10, 8), "publishing"),
      slot("miss", iso(2026, 10, 4), "missed"),
      slot("fail", iso(2026, 10, 3), "failed"),
      slot("old", iso(2026, 10, 1), "published"),
      slot("new", iso(2026, 10, 2), "cancelled"),
      { ...slot("drift", iso(2026, 10, 10), "scheduled"), error: "the export this slot publishes no longer exists" },
    ]);
    expect(g.map((x) => x.key)).toEqual(["decide", "upcoming", "history"]);
    // a drifted slot is still `scheduled`, but it will not fire: it waits on a person
    expect(g[0].slots.map((s) => s.id)).toEqual(["fail", "miss", "drift"]);
    expect(g[1].slots.map((s) => s.id)).toEqual(["up1", "up2"]);
    expect(g[2].slots.map((s) => s.id)).toEqual(["new", "old"]);
    expect(slotGroups([]).map((x) => x.slots.length)).toEqual([0, 0, 0]);
  });

  test("movePatch resets a missed or failed slot to scheduled; a scheduled one only moves", () => {
    const at = iso(2026, 10, 9);
    expect(movePatch(slot("a", at, "scheduled"), at)).toEqual({ publishAt: at });
    expect(movePatch(slot("a", at, "missed"), at)).toEqual({ publishAt: at, status: "scheduled" });
    expect(movePatch(slot("a", at, "failed"), at)).toEqual({ publishAt: at, status: "scheduled" });
    expect(canMove(slot("a", at, "published"))).toBe(false);
    expect(canMove(slot("a", at, "cancelled"))).toBe(false);
    expect(canCancel(slot("a", at, "publishing"))).toBe(false);
    expect(canCancel(slot("a", at, "missed"))).toBe(true);
  });

  test("datetime-local round trip; a missed slot's move starts at the next full hour", () => {
    const d = new Date(2026, 9, 7, 15, 42);
    expect(toLocalInput(d)).toBe("2026-10-07T15:42");
    expect(fromLocalInput("2026-10-07T15:42")).toBe(d.toISOString());
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("tomorrow")).toBeNull();
    const now = new Date(2026, 9, 7, 15, 42);
    expect(moveDefault(slot("m", iso(2026, 10, 1, 9), "missed"), now)).toBe("2026-10-07T16:00");
    expect(moveDefault(slot("s", iso(2026, 10, 9, 9, 15), "scheduled"), now)).toBe("2026-10-09T09:15");
    expect(splitTags(" a, b,,a , c ")).toEqual(["a", "b", "c"]);
  });
});

test.describe("metrics display: null is unmeasured, a partial sum is a lower bound", () => {
  test("formatters never print 0 for null", () => {
    expect(fmtNum(null)).toBe("—");
    expect(fmtNum(0)).toBe("0");
    expect(fmtNum(1200)).toBe("1,200");
    expect(fmtDuration(null)).toBe("—");
    expect(fmtDuration(65)).toBe("1:05");
    expect(fmtDuration(3725)).toBe("1:02:05");
    expect(fmtWatch(null)).toBe("—");
    expect(fmtWatch(600)).toBe("10 min");
    expect(fmtSigned(null)).toBe("—");
    expect(fmtSigned(3)).toBe("+3");
    expect(fmtSigned(-2)).toBe("−2");
    expect(fmtSigned(0)).toBe("0");
    expect(fmtFigure({ value: null, lowerBound: false })).toBe("—");
    expect(fmtFigure({ value: 1200, lowerBound: true })).toBe("≥ 1,200");
    expect(fmtFigure({ value: 1200, lowerBound: false })).toBe("1,200");
    expect(speakFigure({ value: 1200, lowerBound: true })).toBe("at least 1,200");
  });

  const snap = (pub: string, at: string, views: number | null): MetricSnapshot => ({
    publicationId: pub,
    at,
    views,
    watchTimeS: null,
    avgViewDurationS: null,
    likes: null,
    comments: null,
    shares: null,
    subsDelta: null,
  });

  // The semantics are lib/publish/metrics.ts's (and its own probe's); what is
  // pinned here is that the Metrics tab's SPELLING of them keeps the honesty:
  // a lower-bound sum reads "≥", a channel with nothing measured reads "—",
  // a first day is a gap rather than a lifetime total drawn as one day.
  test("the engine's sums and series, as the Metrics tab spells them", () => {
    const pub = (id: string, ch: Publication["channelId"], dry: boolean): Publication => ({
      id,
      slotId: `s-${id}`,
      channelId: ch,
      platformVideoId: null,
      visibility: "private",
      dry,
      publishedAt: iso(2026, 10, 1),
    });
    const pubs = [pub("a", "youtube", false), pub("b", "youtube", true), pub("c", "tiktok", true)];
    const snaps = [snap("a", "2026-10-01T06:00:00.000Z", 50), snap("a", "2026-10-02T06:00:00.000Z", 1200), snap("b", "2026-10-02T06:00:00.000Z", null)];
    const groups = groupSums(pubs, snaps, (p) => p.channelId);
    const yt = groups.find((g) => g.key === "youtube")!;
    const tt = groups.find((g) => g.key === "tiktok")!;
    expect(fmtFigure({ value: yt.value, lowerBound: yt.lowerBound })).toBe("≥ 1,200");
    expect(fmtFigure({ value: tt.value, lowerBound: tt.lowerBound })).toBe("—");
    const daily = dailySeries(snapshotsOf("a", snaps), "views").map((d) => d.delta);
    expect(daily).toEqual([null, 1150]);
    const dry = publicationTotals(pubs[1], snaps);
    expect(fmtNum(dry.totals.views)).toBe("—");
    expect(fmtSigned(dry.totals.subsDelta)).toBe("—");
  });
});

test.describe("publishClient: a missing route, a refusal and a network failure are three different answers", () => {
  const realFetch = globalThis.fetch;
  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const answer = (status: number, body: string, type = "application/json") =>
    (async () => new Response(body, { status, headers: { "content-type": type } })) as typeof fetch;

  test("a route-missing 404 (HTML) is unavailable — no fixture stands in", async () => {
    globalThis.fetch = answer(404, "<!doctype html><title>404</title>", "text/html");
    expect(await getSchedule()).toMatchObject({ ok: false, kind: "unavailable", status: 404 });
  });

  test("a 404 with an { error } body is the engine answering, not a missing route", async () => {
    globalThis.fetch = answer(404, JSON.stringify({ error: "unknown slot zz" }));
    const r = await getSchedule();
    expect(r).toMatchObject({ ok: false, kind: "refused", status: 404, error: "unknown slot zz" });
  });

  test("a 409 refusal is passed through verbatim; a network failure is status 0", async () => {
    globalThis.fetch = answer(409, JSON.stringify({ error: "channel tiktok is not_wired" }));
    const body = {
      projectId: "p",
      exportId: "e",
      channelId: "tiktok" as const,
      publishAt: iso(2026, 10, 9),
      title: "t",
      description: "",
      tags: [],
    };
    expect(await createSlot(body)).toMatchObject({ ok: false, status: 409, error: "channel tiktok is not_wired" });
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await getSchedule()).toMatchObject({ ok: false, kind: "refused", status: 0 });
  });

});
