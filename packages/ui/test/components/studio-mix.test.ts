// The audio studio's host arithmetic (spark audio-agent-studio WP1): the transport's gains from mute,
// solo and level, section spans and a stem's entries, the peaks a waveform draws; the dock's
// dropped-piece words; the fader's keys. Pure, so the numbers are held without a browser.
import { describe, expect, test } from "vitest";

import { clampPan, clockOf, dbToGain, effectiveGains, entersSteps, gainAt, peaksOf, sectionSpans } from "../../src/components/audio/mix.ts";
import { droppedWords, placeWords } from "../../src/components/dock/dock.ts";
import { faderKey } from "../../src/components/fader/Fader.tsx";

describe("gains: what mute, solo and level make of a stem", () => {
  test("0 dB is unity, -6 dB about half, the floor is silence", () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(dbToGain(6)).toBeCloseTo(1.995, 3);
    expect(dbToGain(-60)).toBe(0);
    expect(dbToGain(Number.NaN)).toBe(0);
    expect(dbToGain(40)).toBeCloseTo(dbToGain(12), 9);
  });
  test("a muted stem is silent; the others keep their level", () => {
    expect(effectiveGains([{ id: "drums", muted: true }, { id: "bass", levelDb: -6 }, { id: "keys" }])).toEqual({ drums: 0, bass: dbToGain(-6), keys: 1 });
  });
  test("any solo silences every stem not soloed", () => {
    expect(effectiveGains([{ id: "drums" }, { id: "bass", solo: true }, { id: "keys", solo: false }])).toEqual({ drums: 0, bass: 1, keys: 0 });
  });
  test("a muted stem stays silent even when soloed", () => {
    expect(effectiveGains([{ id: "bass", solo: true, muted: true }, { id: "keys" }])).toEqual({ bass: 0, keys: 0 });
  });
  test("pan is held to -1..1", () => {
    expect([clampPan(-3), clampPan(0.4), clampPan(2), clampPan(Number.NaN)]).toEqual([-1, 0.4, 1, 0]);
  });
});

describe("sections: spans in seconds and a stem's entries", () => {
  const rows = [{ bars: 2 }, { bars: 4 }, { bars: 4 }, { bars: 2 }];
  test("bars laid end to end at the tempo (four beats a bar)", () => {
    expect(sectionSpans(rows, 120)).toEqual([
      { startS: 0, endS: 4 },
      { startS: 4, endS: 12 },
      { startS: 12, endS: 20 },
      { startS: 20, endS: 24 },
    ]);
  });
  test("the turn's own seconds win when every section has them; no tempo and no seconds is no spans", () => {
    expect(sectionSpans([{ bars: 2, startS: 0, endS: 5 }, { bars: 2, startS: 5, endS: 9 }], 120)).toEqual([{ startS: 0, endS: 5 }, { startS: 5, endS: 9 }]);
    expect(sectionSpans(rows)).toBeNull();
    expect(sectionSpans([], 120)).toBeNull();
  });
  test("a stem that enters in sections 2 and 3 steps in at 4 s and out at 20 s", () => {
    const spans = sectionSpans(rows, 120);
    const steps = entersSteps([false, true, true, false], spans);
    expect(steps).toEqual([{ atS: 0, gain: 0 }, { atS: 4, gain: 1 }, { atS: 20, gain: 0 }]);
    expect([gainAt(steps, 0), gainAt(steps, 3.9), gainAt(steps, 4), gainAt(steps, 19), gainAt(steps, 21)]).toEqual([0, 0, 1, 1, 0]);
  });
  test("no entries, no spans or a length mismatch plays everywhere", () => {
    const spans = sectionSpans(rows, 120);
    expect(entersSteps(undefined, spans)).toEqual([{ atS: 0, gain: 1 }]);
    expect(entersSteps([true, false], null)).toEqual([{ atS: 0, gain: 1 }]);
    expect(entersSteps([true, false], spans)).toEqual([{ atS: 0, gain: 1 }]);
  });
});

describe("peaks: the loudest sample per window, scaled to the loudest", () => {
  test("two windows over two channels", () => {
    expect(peaksOf([[0, 0.1, -0.2, 0.05], [0, 0, 0, 0.4]], 2)).toEqual([0.25, 1]);
  });
  test("silence is zeros; nothing or no windows is empty", () => {
    expect(peaksOf([[0, 0, 0, 0]], 2)).toEqual([0, 0]);
    expect(peaksOf([], 4)).toEqual([]);
    expect(peaksOf([[0.5]], 0)).toEqual([]);
  });
  test("more windows than samples still gives n peaks", () => {
    expect(peaksOf([[0.5, -1]], 4)).toHaveLength(4);
  });
  test("clock words", () => {
    expect([clockOf(0), clockOf(65.7), clockOf(-3)]).toEqual(["0:00", "1:05", "0:00"]);
  });
});

describe("the dock's dropped-piece words", () => {
  test("nothing dropped is no disclosure", () => {
    expect(droppedWords([])).toBeNull();
  });
  test("a piece and a suggestion, each with its place and the door's reason", () => {
    const w = droppedWords([
      { at: "show[4]", kind: "waterfall3d", reason: 'unknown kind "waterfall3d"' },
      { at: "actions[4]", kind: "pick", reason: 'names piece "no-such-duel", which is not on screen' },
    ]);
    expect(w?.summary).toBe("1 piece and 1 suggestion could not be shown");
    expect(w?.rows).toEqual(['piece 5 (waterfall3d): unknown kind "waterfall3d"', 'suggestion 5 (pick): names piece "no-such-duel", which is not on screen']);
  });
  test("plural, and a kindless item names no kind", () => {
    const w = droppedWords([{ at: "show[0]", kind: "?", reason: "not a node (no kind)" }, { at: "show[1]", kind: "track", reason: "x" }]);
    expect(w?.summary).toBe("2 pieces could not be shown");
    expect(w?.rows[0]).toBe("piece 1: not a node (no kind)");
    expect(placeWords("elsewhere")).toBe("elsewhere");
  });
});

describe("the fader's keys", () => {
  const p = { min: -60, max: 12, step: 1 };
  test("arrows a step, page keys ten, home and end the ends, clamped", () => {
    expect([faderKey("ArrowRight", 0, p), faderKey("ArrowDown", 0, p), faderKey("PageUp", 0, p), faderKey("PageDown", -55, p), faderKey("Home", 3, p), faderKey("End", 3, p), faderKey("ArrowUp", 12, p)]).toEqual([1, -1, 10, -60, -60, 12, 12]);
  });
  test("a key the fader does not take is null", () => {
    expect(faderKey("Enter", 0, p)).toBeNull();
  });
});
