// THE CANVAS VARIANT'S PURE MODEL (spark audio-agent-studio WP3) over the real scripted sessions:
// turns fold into one card per answer (a pending card while an ask waits), the band and the entry
// mask share one geometry, the heard sentence links each phrase once, a proposal says what it does
// from its resolved target, and the registry covers the closed vocabulary's every kind.
// (Proposed home: tests/next-server/studio-canvas.test.ts - the Director moves it; until then run it
// with an explicit include.)
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { STUDIO_NODE_KINDS } from "@gt/domain/audio.studio.kinds";
import { readFixture } from "../../app/(studio)/audio/studio/_port/fixture.ts";
import { bandCells, cardsOf, cardTitle, doesWords, entersWords, levelWords, panWords, resolverOf, runsOf, stemLabel } from "../../app/(studio)/audio/studio/_v/canvas/model.ts";
import { KIND_VIEWS } from "../../app/(studio)/audio/studio/_v/canvas/registry.tsx";

const TAKES = { calm: "st-calm", "calm-vital-bass": "st-cvb", hiphop: "st-hh", "hiphop-felt-piano": "st-hfp", synth: "st-syn" };
const sessions = readFixture({ takes: TAKES }).sessions;
const session = (id: string) => {
  const s = sessions.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no session ${id}`);
  return s;
};

describe("cards", () => {
  it("one card per answer, each with the ask that opened it", () => {
    const cards = cardsOf(session("study-bed").turns);
    expect(cards.map((c) => [c.n, c.ask?.text, c.answer?.turn.id])).toEqual([
      [1, "something calm to study to, a bit hopeful, about a minute", "s1-a1"],
      [2, "the bass is a bit too much, make it softer", "s1-a2"],
      [3, "keep the smooth bass", "s1-a3"],
    ]);
  });

  it("an ask with no answer yet is a pending card carrying the next number", () => {
    const turns = session("study-bed").turns.slice(0, 3);
    const last = cardsOf(turns).at(-1);
    expect(last?.answer).toBeNull();
    expect(last?.n).toBe(2);
    expect(last?.key).toBe("pending:s1-u2");
  });

  it("a card is named by its take, else by what its choice is about", () => {
    const [a1, a2] = session("study-bed").turns.filter((t) => t.turn.from === "agent");
    expect(a1 && cardTitle(a1.turn)).toBe("Quiet Horizon Bed");
    expect(a2 && cardTitle(a2.turn)).toBe("choices: a softer low end");
  });

  it("a stem's name is found in an earlier turn when this one has no stems", () => {
    const turns = session("study-bed").turns;
    expect(stemLabel(turns, "s1-a2", "bass")).toBe("warm finger bass");
    expect(stemLabel(turns, "s1-a3", "bass")).toBe("smooth synth bass");
    expect(stemLabel(turns, "s1-a1", "nope")).toBeNull();
  });
});

describe("geometry the band and the entry mask share", () => {
  const rows = [{ bars: 2 }, { bars: 4 }, { bars: 2 }];
  it("by seconds when spans and the length are known (a tail stays empty)", () => {
    const cells = bandCells(rows, [{ startS: 0, endS: 5 }, { startS: 5, endS: 15 }, { startS: 15, endS: 20 }], 25);
    expect(cells).toEqual([{ left: 0, width: 0.2 }, { left: 0.2, width: 0.4 }, { left: 0.6, width: 0.2 }]);
  });
  it("by bars when the length is unknown, and never wider than the band when sections overrun the take", () => {
    expect(bandCells(rows, null, null)).toEqual([{ left: 0, width: 0.25 }, { left: 0.25, width: 0.5 }, { left: 0.75, width: 0.25 }]);
    const over = bandCells(rows, [{ startS: 0, endS: 10 }, { startS: 10, endS: 30 }, { startS: 30, endS: 40 }], 20);
    expect(over.at(-1)).toEqual({ left: 0.75, width: 0.25 });
  });
  it("entries in words, null when a part plays everywhere", () => {
    const names = [{ name: "intro" }, { name: "loop A" }, { name: "loop B" }, { name: "tail" }];
    expect(entersWords({ enters: [false, true, true, false] }, names)).toBe("plays in loop A and loop B");
    expect(entersWords({ enters: [true, true, true, true] }, names)).toBeNull();
    expect(entersWords({ enters: [false, false, false, false] }, names)).toBe("silent in every part of the song");
    expect(entersWords({}, names)).toBeNull();
  });
});

describe("words", () => {
  it("each link marks its phrase once, in sentence order, any case", () => {
    const runs = runsOf("Calm music, calm and hopeful", [{ words: "hopeful" }, { words: "calm" }]);
    expect(runs).toEqual([
      { text: "Calm", link: 1 },
      { text: " music, calm and ", link: null },
      { text: "hopeful", link: 0 },
    ]);
    expect(runsOf("nothing linked", [{ words: "absent" }])).toEqual([{ text: "nothing linked", link: null }]);
  });
  it("levels and sides in plain words", () => {
    expect([levelWords(0), levelWords(2), levelWords(-8), levelWords(-60)]).toEqual(["as made", "a little louder (+2 dB)", "much quieter (-8 dB)", "off"]);
    expect([panWords(0), panWords(-0.2), panWords(0.6), panWords(1)]).toEqual(["in the middle", "a little left", "to the right", "far right"]);
  });
  it("a proposal says what it does from its resolved target, not from its label", () => {
    const turns = session("study-bed").turns;
    const a2 = turns.find((t) => t.turn.id === "s1-a2")?.turn;
    if (a2 === undefined) throw new Error("no s1-a2");
    const r = resolverOf(a2, (id) => stemLabel(turns, a2.id, id));
    const cand = (node: string, id: string) => {
      const n = a2.show.find((x) => x.id === node);
      return n?.kind === "candidates" ? (n.rows.find((c) => c.id === id)?.name ?? null) : null;
    };
    expect(a2.actions.map((a) => doesWords(a, r, cand))).toEqual([
      'plays "Smooth Synth Bass" on its own here',
      'plays "Smooth Synth Bass" inside the song here',
      'asks the agent to use "Smooth Synth Bass"',
      'tells the agent you prefer "smooth synth bass"',
    ]);
    const g = session("game-menu").turns.find((t) => t.turn.id === "s3-a1")?.turn;
    if (g === undefined) throw new Error("no s3-a1");
    const rg = resolverOf(g, (id) => stemLabel(session("game-menu").turns, g.id, id));
    expect(g.actions.map((a) => doesWords(a, rg, () => null))).toEqual([
      'plays "Neon Grid Runner" here',
      'plays only "pulsing synth bass" when the parts play',
      'moves "answering echo tune" to the right here',
      'says to the agent: "loop B is a bit much, take something out"',
    ]);
  });
});

describe("the registry", () => {
  it("realizes every kind of the closed vocabulary, each in a slot", () => {
    expect(Object.keys(KIND_VIEWS).sort()).toEqual([...STUDIO_NODE_KINDS].sort());
    for (const k of STUDIO_NODE_KINDS) expect(typeof KIND_VIEWS[k].View).toBe("function");
  });
});
