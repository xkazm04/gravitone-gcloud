// APPROVE -> CALENDAR's codec (src/components/review/schedule.ts): the schedule a kept verdict
// carries in its note. Pinned: it round-trips with the operator's notes; a note with no calendar
// line keeps its words and schedules nothing; a calendar line that does not read is `invalid`,
// never silently "no schedule"; the proposal is the prototype's next day at 08:00 UTC; only the
// sources whose subject is publishable offer a channel.
import { describe, expect, it } from "vitest";

import { decodeSchedule, encodeSchedule, proposeAt, scheduleChannels, scheduleWords } from "../../src/components/review/schedule.ts";

describe("the schedule a kept verdict carries", () => {
  it("round-trips, notes after the calendar line", () => {
    const note = encodeSchedule({ channel: "blog", publishAt: "2026-10-20T09:30:00Z", notes: "  §2 remove: the aside \n" });
    expect(note).toBe("calendar: blog 2026-10-20T09:30:00.000Z\n§2 remove: the aside");
    expect(decodeSchedule(note)).toEqual({ kind: "schedule", schedule: { channel: "blog", publishAt: "2026-10-20T09:30:00.000Z", notes: "§2 remove: the aside" }, note: "§2 remove: the aside" });
    expect(decodeSchedule(encodeSchedule({ channel: "youtube", publishAt: "2026-10-20T09:30:00.000Z" }))).toEqual({ kind: "schedule", schedule: { channel: "youtube", publishAt: "2026-10-20T09:30:00.000Z" }, note: null });
  });

  it("a note without the line is only a note; an empty one is none", () => {
    expect(decodeSchedule("thin on numbers")).toEqual({ kind: "none", note: "thin on numbers" });
    expect(decodeSchedule(undefined)).toEqual({ kind: "none", note: null });
    expect(decodeSchedule("see calendar: blog 2026-10-20T09:30:00.000Z")).toEqual({ kind: "none", note: "see calendar: blog 2026-10-20T09:30:00.000Z" });
  });

  it("a calendar line that does not read is refused, by what is wrong", () => {
    expect(decodeSchedule("calendar: podcast 2026-10-20T09:30:00.000Z")).toEqual({ kind: "invalid", error: 'calendar: "podcast" is not a channel (youtube, tiktok, instagram, blog)' });
    expect(decodeSchedule("calendar: blog tuesday")).toEqual({ kind: "invalid", error: 'calendar: "tuesday" is not an ISO instant' });
    expect(decodeSchedule("calendar: blog 2026-10-20T09:30:00.000Z extra")).toEqual({ kind: "invalid", error: 'calendar: "2026-10-20T09:30:00.000Z" is not an ISO instant' });
  });

  it("an instant names its zone: a zone-less time would read in the host's zone, so it is refused", () => {
    // Date.parse reads "2026-10-20T09:30" as LOCAL time: 09:30Z on a UTC box, 07:30Z in Prague.
    expect(decodeSchedule("calendar: blog 2026-10-20T09:30")).toEqual({ kind: "invalid", error: 'calendar: "2026-10-20T09:30" is not an ISO instant' });
    expect(decodeSchedule("calendar: blog 2026-10-20T09:30:00.000")).toEqual({ kind: "invalid", error: 'calendar: "2026-10-20T09:30:00.000" is not an ISO instant' });
    expect(decodeSchedule("calendar: blog 2026-10-20T09:30:00+02:00")).toEqual({ kind: "schedule", schedule: { channel: "blog", publishAt: "2026-10-20T07:30:00.000Z" }, note: null });
    expect(decodeSchedule("calendar: blog 2026-10-20T09:30Z")).toEqual({ kind: "schedule", schedule: { channel: "blog", publishAt: "2026-10-20T09:30:00.000Z" }, note: null });
  });

  it("proposes the next day at 08:00 UTC, worded as the calendar reads it", () => {
    expect(proposeAt(Date.parse("2026-10-17T21:40:00.000Z"))).toBe("2026-10-18T08:00:00.000Z");
    expect(proposeAt(Date.parse("2026-12-31T07:00:00.000Z"))).toBe("2027-01-01T08:00:00.000Z");
    expect(scheduleWords({ channel: "blog", publishAt: "2026-10-18T08:00:00.000Z" })).toBe("blog · 18 Oct 08:00 UTC");
  });

  it("only a publishable source offers channels: an article, on blog", () => {
    expect(scheduleChannels("article")).toEqual(["blog"]);
    expect(scheduleChannels("mv")).toEqual([]);
    expect(scheduleChannels("forge")).toEqual([]);
  });
});
