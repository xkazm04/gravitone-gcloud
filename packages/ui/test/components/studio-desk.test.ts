// The studio desk's arithmetic (spark audio-agent-studio, variant "desk"): which pieces stand on the
// desk after each turn, the timeline's columns, the heard sentence cut at its links, the proposal a
// desk control stands for, a stem's mix in words, and the lane head drawn from a live mix.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { StudioAction, StudioNode, StudioTurn } from "@gt/domain/audio.studio";
import type { ParsedTurn } from "@gt/domain/audio.studio.door";
import { axisTemplate, deskAct, deskAxis, deskPieces, fracAt, laneState, levelWords, panWords, proposal, rowMix, sentencePieces } from "../../src/components/studio-desk/desk.ts";
import { LaneHead } from "../../src/components/studio-desk/LaneHead.tsx";

const turn = (id: string, from: "user" | "agent", show: StudioNode[] = [], actions: StudioAction[] = []): ParsedTurn => ({
  turn: { v: 1, id, seq: 0, at: "2026-10-28T18:00:00Z", from, text: id, show, actions } as StudioTurn,
  dropped: [],
});
const track = (title: string): StudioNode => ({ id: "track", kind: "track", title, mix: { href: `/a/${title}` } });
const sections: StudioNode = { id: "sections", kind: "sections", rows: [{ name: "intro", bars: 2, energy: 0.3 }, { name: "lift", bars: 4, energy: 0.8 }] };
const stems: StudioNode = { id: "stems", kind: "stems", rows: [{ id: "bass", role: "bass", label: "warm bass", audio: { href: "/a/bass" } }] };
const cands: StudioNode = { id: "opts", kind: "candidates", for: { stem: "bass" }, rows: [{ id: "c1", name: "Smooth", words: [] }] };
const measures: StudioNode = { id: "m", kind: "measures", rows: [{ label: "loud", value: "-14" }] };

describe("deskPieces", () => {
  const turns = [turn("u1", "user"), turn("a1", "agent", [track("one"), sections, stems, measures]), turn("u2", "user"), turn("a2", "agent", [cands])];

  test("the arrangement stays on the desk from the turn that last drew it, marked carried", () => {
    const d = deskPieces(turns, "a2");
    expect(d.track.map((p) => [p.node.id, p.turnId, p.carried])).toEqual([["track", "a1", true]]);
    expect(d.stems[0]?.turnId).toBe("a1");
    expect(d.sections[0]?.turnId).toBe("a1");
  });

  test("a choice and a reading belong to the visible turn only", () => {
    const d = deskPieces(turns, "a2");
    expect(d.candidates.map((p) => [p.turnId, p.carried])).toEqual([["a2", false]]);
    expect(d.measures).toEqual([]);
    expect(deskPieces(turns, "a1").measures.map((p) => p.turnId)).toEqual(["a1"]);
  });

  test("a newer turn's track replaces the older one; nothing before the first answer", () => {
    const later = [...turns, turn("u3", "user"), turn("a3", "agent", [track("two")])];
    expect(deskPieces(later, "a3").track.map((p) => [p.node.kind === "track" && p.node.title, p.carried])).toEqual([["two", false]]);
    expect(deskPieces(turns, null).track).toEqual([]);
  });
});

describe("the timeline's axis", () => {
  test("by seconds with a tail when the audio outlasts the sections", () => {
    const a = deskAxis([{ bars: 2 }, { bars: 4 }], [{ startS: 0, endS: 5 }, { startS: 5, endS: 15 }], 20);
    expect(a).toEqual({ weights: [5, 10], tail: 5, by: "seconds", audio: 1 });
    expect(axisTemplate(a)).toBe("5fr 10fr 5fr");
  });

  test("no tail for a rounding remainder; by bars when the seconds are unknown", () => {
    expect(deskAxis([{ bars: 2 }], [{ startS: 0, endS: 10 }], 10.1).tail).toBe(0);
    expect(deskAxis([{ bars: 2 }, { bars: 6 }], null, 30)).toEqual({ weights: [2, 6], tail: 0, by: "bars", audio: 1 });
    expect(axisTemplate(null)).toBe("1fr");
  });

  test("sections planned past the end of the render: the audio covers only its share of the width", () => {
    const a = deskAxis([{ bars: 4 }, { bars: 4 }], [{ startS: 0, endS: 10 }, { startS: 10, endS: 20 }], 15);
    expect([a.tail, a.audio]).toEqual([0, 0.75]);
    expect(deskAxis([{ bars: 4 }], [{ startS: 0, endS: 10 }], null).audio).toBe(1);
  });

  test("the playhead stays inside 0..1 and is 0 for an unknown length", () => {
    expect(fracAt(5, 20)).toBe(0.25);
    expect(fracAt(30, 20)).toBe(1);
    expect(fracAt(5, null)).toBe(0);
    expect(fracAt(Number.NaN, 20)).toBe(0);
  });
});

describe("sentencePieces", () => {
  test("cuts at the linked and unheard words in order, keeping the person's casing", () => {
    const { pieces, loose } = sentencePieces("Chill beat for my coffee vlog, maybe piano", [{ words: "piano", to: "a piano" }, { words: "chill beat", to: "lo-fi" }], ["coffee"]);
    expect(pieces).toEqual([{ text: "Chill beat", to: "lo-fi" }, { text: " for my " }, { text: "coffee", unheard: true }, { text: " vlog, maybe " }, { text: "piano", to: "a piano" }]);
    expect(loose).toEqual([]);
  });

  test("a link whose words are not in the sentence comes back loose, never dropped", () => {
    const { pieces, loose } = sentencePieces("calm and calm", [{ words: "calm", to: "a" }, { words: "calm", to: "b" }, { words: "loud", to: "c" }]);
    expect(pieces.filter((p) => p.to !== undefined).map((p) => p.to)).toEqual(["a", "b"]);
    expect(loose).toEqual([{ words: "loud", to: "c" }]);
  });
});

describe("a desk control's action", () => {
  const actions: StudioAction[] = [
    { id: "p1", kind: "hear", label: "x alone", node: "opts", candidate: "c1", mode: "alone" },
    { id: "p2", kind: "use_candidate", label: "keep it", node: "opts", candidate: "c1" },
  ];
  test("is the turn's own proposal when one matches, so the scripted answer still answers", () => {
    expect(proposal(actions, "use_candidate", (a) => a.candidate === "c1")?.id).toBe("p2");
    expect(proposal(actions, "hear", (a) => a.mode === "in_mix")).toBeUndefined();
  });
  test("else the desk's own, in the same vocabulary", () => {
    expect(deskAct.use("opts", "c2", "use it")).toEqual({ id: "desk.use.opts", kind: "use_candidate", label: "use it", node: "opts", candidate: "c2" });
    expect(deskAct.pick("duel", "b", "B").side).toBe("b");
  });
});

describe("a stem's mix in words", () => {
  test("level and pan", () => {
    expect([levelWords(0), levelWords(2.2), levelWords(-6), levelWords(-60)]).toEqual(["as made", "2 dB louder", "6 dB quieter", "silent"]);
    expect([panWords(0), panWords(-0.3), panWords(0.6), panWords(1)]).toEqual(["in the middle", "a little left", "right", "far right"]);
  });
  test("lane state: planned before muted, muted before solo, hushed under another's solo", () => {
    expect(laneState(false, { muted: true }, false)).toBe("planned");
    expect(laneState(true, { muted: true, solo: true }, true)).toBe("muted");
    expect(laneState(true, { solo: true }, true)).toBe("solo");
    expect(laneState(true, {}, true)).toBe("hushed");
    expect(laneState(true, {}, false)).toBe("on");
  });
  test("rowMix keeps only what the turn set", () => {
    expect(rowMix({ id: "x", role: "lead", label: "l", levelDb: -2 })).toEqual({ levelDb: -2 });
  });
});

describe("LaneHead", () => {
  const base = { role: "bass", label: "warm bass", ear: null, onMute: () => {}, onSolo: () => {}, onLevel: () => {}, onPan: () => {} } as const;
  test("draws the live mix: pressed keys, the volume and side in words", () => {
    const html = renderToStaticMarkup(h(LaneHead, { ...base, state: "muted", mix: { muted: true, levelDb: 2, pan: -0.3 } }));
    expect(html).toContain('aria-pressed="true" aria-label="mute warm bass"');
    expect(html).toContain('aria-pressed="false" aria-label="play only warm bass"');
    expect(html).toMatch(/volume <b[^>]*>2 dB louder<\/b>/);
    expect(html).toMatch(/left or right <b[^>]*>a little left<\/b>/);
  });
  test("a planned part says so and carries the provisional tag", () => {
    const html = renderToStaticMarkup(h(LaneHead, { ...base, state: "planned", mix: {}, illustrative: true }));
    expect(html).toContain("planned, not yet audible");
    expect(html).toContain("illustrative");
  });
});
