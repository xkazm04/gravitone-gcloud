import { describe, expect, it } from "vitest";

import { MAX_ACTIONABLE_AGE_MS, formatAge, nextChange, observe, open, view, type EdgeEvent, type FreshState } from "../src/freshness/core.ts";
import { IN_FLIGHT_CAP_MS, mayTick, pollSilenceMs } from "../src/freshness/poll.ts";

const SILENCE = 10_000;
const feed = (s: FreshState<string>, ...es: EdgeEvent<string>[]): FreshState<string> => es.reduce(observe, s);
const start = (): FreshState<string> => open<string>(0, { silenceMs: SILENCE });

describe("value + age + edge health", () => {
  it("before anything arrives, nothing is held and the edge is down since opening", () => {
    expect(view(start(), 5_000)).toEqual({ edge: "down", since: 0 });
  });
  it("a fresh value is live, with its age", () => {
    const s = feed(start(), { kind: "value", value: "running", at: 1_000 });
    expect(view(s, 3_000)).toEqual({ value: "running", ageMs: 2_000, edge: "live", since: 1_000 });
  });
  it("a failure KEEPS the value but stops calling it current (v1: a failure must not blank the run)", () => {
    const s = feed(start(), { kind: "value", value: "running", at: 1_000 }, { kind: "fail", at: 5_000 });
    expect(view(s, 6_000)).toEqual({ value: "running", ageMs: 5_000, edge: "stale", since: 5_000 });
  });
  it("past the actionable age the held value is no longer evidence: down", () => {
    const s = feed(start(), { kind: "value", value: "running", at: 1_000 }, { kind: "fail", at: 5_000 });
    const v = view(s, 1_000 + MAX_ACTIONABLE_AGE_MS + 1);
    expect(v.edge).toBe("down");
    expect(v.value).toBe("running");
    expect(v.since).toBe(1_000 + MAX_ACTIONABLE_AGE_MS);
  });
  it("only a success newer than the failure restores health", () => {
    const failed = feed(start(), { kind: "value", value: "a", at: 1_000 }, { kind: "fail", at: 5_000 });
    expect(view(feed(failed, { kind: "fail", at: 6_000 }), 6_500).edge).toBe("stale");
    const back = feed(failed, { kind: "heartbeat", at: 7_000 });
    expect(view(back, 7_500)).toMatchObject({ edge: "live", since: 7_000, ageMs: 500 });
  });
  it("SILENCE is a signal: a stream that stops sending heartbeats is not live although nothing failed", () => {
    const s = feed(start(), { kind: "value", value: "a", at: 1_000 });
    expect(view(s, 1_000 + SILENCE).edge).toBe("live");
    expect(view(s, 1_000 + SILENCE + 1)).toMatchObject({ edge: "stale", since: 1_000 + SILENCE });
  });
  it("a heartbeat confirms the held value, so its age resets without a new value", () => {
    const s = feed(start(), { kind: "value", value: "a", at: 1_000 }, { kind: "heartbeat", at: 9_000 });
    expect(view(s, 9_500)).toMatchObject({ value: "a", ageMs: 500, edge: "live", since: 1_000 });
  });
  it("a late value never rolls the held one back (an SSE replay, a slow poll after a fast one)", () => {
    const s = feed(start(), { kind: "value", value: "new", at: 5_000 }, { kind: "value", value: "old", at: 3_000 });
    expect(view(s, 5_500).value).toBe("new");
  });
  it("a failure before any contact is down from the failure, with nothing to show", () => {
    expect(view(feed(start(), { kind: "fail", at: 2_000 }), 3_000)).toEqual({ edge: "down", since: 2_000 });
  });
});

describe("no per-tick churn: one timer for the next edge change", () => {
  it("names the instant silence turns live into stale, then the one where stale turns down", () => {
    const s = feed(start(), { kind: "value", value: "a", at: 1_000 });
    expect(nextChange(s, 2_000)).toBe(1_000 + SILENCE + 1);
    expect(nextChange(s, 1_000 + SILENCE + 1)).toBe(1_000 + MAX_ACTIONABLE_AGE_MS + 1);
    expect(view(s, 1_000 + MAX_ACTIONABLE_AGE_MS + 1).edge).toBe("down");
    expect(nextChange(s, 1_000 + MAX_ACTIONABLE_AGE_MS + 1)).toBeNull();
  });
  it("nothing heard means nothing can change without an event", () => {
    expect(nextChange(start(), 0)).toBeNull();
  });
});

describe("the polling backstop (v1 usePolling)", () => {
  it("skips a tick while the last call is in flight, until the cap abandons it", () => {
    expect(mayTick(null, 0)).toBe(true);
    expect(mayTick(1_000, 1_000 + IN_FLIGHT_CAP_MS - 1)).toBe(false);
    expect(mayTick(1_000, 1_000 + IN_FLIGHT_CAP_MS)).toBe(true);
  });
  it("a poll earns two missed answers plus the in-flight cap of silence", () => {
    expect(pollSilenceMs(4_000)).toBe(8_000 + IN_FLIGHT_CAP_MS);
  });
});

describe("formatAge is coarse on purpose", () => {
  it.each([[42_000, "42 s"], [89_000, "89 s"], [180_000, "3 min"]])("%i ms -> %s", (ms, text) => {
    expect(formatAge(ms)).toBe(text);
  });
});
