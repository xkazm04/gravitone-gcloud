import { describe, expect, it } from "vitest";

import { STUDIO_ACTION_GOES, STUDIO_ACTION_KINDS, STUDIO_NODE_KINDS } from "../src/audio.studio.kinds.ts";
import { parseStudioTurn } from "../src/audio.studio.door.ts";
import { STUDIO_EVENTS, parseStudioEvent, studioEventKey } from "../src/audio.studio.events.ts";

const mix = { href: "/api/sound/takes/st_1/file" };
const stem = (id: string, role: string, extra: Record<string, unknown> = {}) => ({ id, role, label: `${id} words`, ...extra });

/** One agent turn that shows every node kind and proposes every action kind. */
const full = () => ({
  v: 1, id: "t2", seq: 2, at: "2026-10-28T20:00:00Z", from: "agent", text: "Here is a calm bed with a soft lift.",
  show: [
    { id: "track", kind: "track", mix, bpm: 84, key: "C major", lengthS: 60 },
    { id: "sec", kind: "sections", rows: [{ name: "intro", bars: 4, energy: 0.3 }, { name: "lift", bars: 8, energy: 0.8 }] },
    { id: "stems", kind: "stems", rows: [stem("drums", "drums", { enters: [false, true] }), stem("bass", "bass"), stem("pad", "pad", { source: undefined })] },
    { id: "bass-options", kind: "candidates", for: { stem: "bass" }, rows: [{ id: "upright", name: "upright bass", words: ["woody", "round"], alone: mix }] },
    { id: "heard", kind: "heard", sentence: "calm but hopeful", links: [{ words: "calm", to: "tempo 84", field: "tempo" }] },
    { id: "mood", kind: "pull", question: "calm or hopeful?", sides: [{ label: "calm", says: "slower, darker", settle: "keep it calm" }, { label: "hopeful", says: "brighter lift", settle: "lean hopeful" }] },
    { id: "ab", kind: "duel", question: "which drums?", a: { label: "brushed", audio: mix }, b: { label: "tight", audio: mix } },
    { id: "m", kind: "measures", rows: [{ label: "loudness", value: "-14.0 LUFS", tone: "ok" }] },
    {
      id: "p2", kind: "suno_prompt", promptId: "p2", parent: "p1", name: "Night drive", style: "synthwave, warm analog bass, 96 bpm",
      lyrics: "[Intro]\n[Verse]\nlights on the overpass", exclude: "trap hats", instrumental: false, model: "v6",
      settings: { weirdness: 40, styleInfluence: 70, variety: 0 },
      changes: [{ field: "style", was: "synthwave, 120 bpm", now: "synthwave, 96 bpm", why: "the verdict said too fast" }], because: "too fast, vocals buried",
    },
    { id: "taste", kind: "taste", rows: [{ id: "t1", line: "dry male vocals", lean: "like" }, { id: "t2", line: "trap hats", lean: "dislike" }] },
  ],
  actions: [
    { id: "a1", kind: "play", label: "play", node: "track" },
    { id: "a2", kind: "hear", label: "hear upright", node: "bass-options", candidate: "upright", mode: "alone" },
    { id: "a3", kind: "use_candidate", label: "use upright", node: "bass-options", candidate: "upright" },
    { id: "a4", kind: "swap_stem", label: "swap bass", stem: "bass", instrumentId: "upright" },
    { id: "a5", kind: "mute", label: "drums off", stem: "drums", on: true },
    { id: "a6", kind: "settle_pull", label: "hopeful", node: "mood", side: 1 },
    { id: "a7", kind: "pick", label: "brushed", node: "ab", side: "a" },
    { id: "a8", kind: "say", label: "darker", text: "make it darker" },
  ],
});

const parsed = (input: unknown) => {
  const r = parseStudioTurn(input);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe("parseStudioTurn", () => {
  it("passes a turn that uses every node kind, untouched", () => {
    const { turn, dropped } = parsed(full());
    expect(dropped).toEqual([]);
    expect(turn.show.map((n) => n.kind)).toEqual(["track", "sections", "stems", "candidates", "heard", "pull", "duel", "measures", "suno_prompt", "taste"]);
    expect(turn.actions).toHaveLength(8);
  });

  it("covers the whole vocabulary in the fixture above (a new kind needs a case here)", () => {
    expect(new Set(full().show.map((n) => n.kind))).toEqual(new Set(STUDIO_NODE_KINDS));
    expect(Object.keys(STUDIO_ACTION_GOES).sort()).toEqual([...STUDIO_ACTION_KINDS].sort());
  });

  it("drops an unknown kind and says so, keeping the rest", () => {
    const t = full();
    t.show.splice(1, 0, { id: "x", kind: "spectrogram" } as never);
    const { turn, dropped } = parsed(t);
    expect(dropped).toEqual([{ at: "show[1]", kind: "spectrogram", reason: 'unknown kind "spectrogram"' }]);
    expect(turn.show).toHaveLength(10);
  });

  it("drops a node with a bad field, naming its path", () => {
    const t = full();
    (t.show[0] as { bpm: number }).bpm = 9000;
    const { turn, dropped } = parsed(t);
    expect(dropped[0]?.at).toBe("show[0]");
    expect(dropped[0]?.reason).toMatch(/show\[0\].*bpm/);
    expect(turn.show.some((n) => n.kind === "track")).toBe(false);
  });

  it("refuses audio that points off this server", () => {
    const t = full();
    (t.show[0] as { mix: { href: string } }).mix = { href: "https://evil.example/a.mp3" };
    (t.show[6] as { a: { audio: { href: string } } }).a.audio = { href: "//cdn.example/a.mp3" };
    const { dropped } = parsed(t);
    expect(dropped.map((d) => d.at)).toEqual(["show[0]", "show[6]", "actions[0]", "actions[6]"]);
  });

  it("drops an action whose piece, candidate or stem is not on screen", () => {
    const t = full();
    t.actions = [
      { id: "b3", kind: "solo", label: "x", stem: "kazoo", on: true } as never,
      { id: "b1", kind: "pick", label: "x", node: "nope", side: "a" } as never,
      { id: "b2", kind: "hear", label: "x", node: "bass-options", candidate: "tuba", mode: "in_mix" } as never,
    ];
    const { turn, dropped } = parsed(t);
    expect(turn.actions).toEqual([]);
    expect(dropped.map((d) => d.reason)).toEqual([
      'names stem "kazoo", which is not on screen',
      'names piece "nope", which is not on screen',
      'names candidate "tuba", which "bass-options" does not offer',
    ]);
  });

  it("drops an action that points at the wrong kind of piece", () => {
    const t = full();
    t.actions = [{ id: "c1", kind: "pick", label: "x", node: "mood", side: "a" } as never];
    expect(parsed(t).dropped[0]?.reason).toBe("a pick cannot point at a pull piece");
  });

  it("holds a stem's section entries to the sections the turn shows", () => {
    const t = full();
    (t.show[2] as { rows: { enters?: boolean[] }[] }).rows[0]!.enters = [true, true, false];
    const { dropped } = parsed(t);
    expect(dropped[0]).toEqual({ at: "show[2]", kind: "stems", reason: 'stem "drums" enters 3 sections, the turn shows 2' });
  });

  it("drops a second piece with the same id and a repeated stem", () => {
    const t = full();
    t.show.push({ id: "track", kind: "measures", rows: [{ label: "a", value: "b" }] } as never);
    (t.show[2] as { rows: unknown[] }).rows.push(stem("bass", "bass"));
    const reasons = parsed(t).dropped.map((d) => d.reason);
    expect(reasons).toContain('stem id "bass" appears twice');
    expect(reasons).toContain('id "track" is already on screen');
  });

  it("caps the pieces and the actions, dropping the overflow", () => {
    const t = full();
    for (let i = 0; i < 4; i++) t.show.push({ id: `m${i}`, kind: "measures", rows: [{ label: "a", value: "b" }] } as never);
    const { turn, dropped } = parsed(t);
    expect(turn.show).toHaveLength(12);
    expect(dropped.filter((d) => d.reason === "past the 12-piece cap")).toHaveLength(2);
  });

  it("lets a user turn show nothing", () => {
    const { turn, dropped } = parsed({ v: 1, id: "u1", seq: 1, at: "2026-10-28T20:00:00Z", from: "user", text: "make it darker", show: [{ id: "x", kind: "track", mix }] });
    expect(turn.show).toEqual([]);
    expect(dropped).toEqual([{ at: "show[0]", kind: "track", reason: "a user turn shows nothing" }]);
  });

  it("refuses a broken envelope outright", () => {
    const r = parseStudioTurn({ ...full(), v: 2 });
    expect(r.ok).toBe(false);
    expect(parseStudioTurn({ ...full(), text: "" }).ok).toBe(false);
  });

  it("keeps a user turn's mix and drops one an agent sends", () => {
    const mixed = { muted: true, levelDb: -3 };
    const user = parsed({ v: 1, id: "u2", seq: 3, at: "2026-10-29T10:00:00Z", from: "user", text: "keep this mix", mix: { bass: mixed } });
    expect(user.turn.mix).toEqual({ bass: mixed });
    const agentTurn = parsed({ ...full(), mix: { bass: mixed } });
    expect(agentTurn.turn.mix).toBeUndefined();
    expect(agentTurn.dropped).toEqual([{ at: "mix", kind: "mix", reason: "an agent turn carries no mix" }]);
  });

  it("keeps a user turn's Suno verdict and uploaded take, and drops both from an agent turn", () => {
    const verdict = { promptId: "p2", clip: "a", keep: false, off: ["tempo", "vocals"] };
    const user = parsed({ v: 1, id: "u3", seq: 4, at: "2026-10-29T10:00:00Z", from: "user", text: "too fast", verdict, takeId: "st_9" });
    expect(user.turn.verdict).toEqual(verdict);
    expect(user.turn.takeId).toBe("st_9");
    const agentTurn = parsed({ ...full(), verdict, takeId: "st_9" });
    expect(agentTurn.turn.verdict).toBeUndefined();
    expect(agentTurn.turn.takeId).toBeUndefined();
    expect(agentTurn.dropped.map((d) => d.at)).toEqual(["verdict", "takeId"]);
  });

  it("holds a Suno prompt to its lineage and its field limits, and taste lines to unique ids", () => {
    const t = full();
    const prompt = t.show[8] as Record<string, unknown>;
    t.show.push({ ...prompt, id: "self", promptId: "p3", parent: "p3" } as never);
    t.show.push({ ...prompt, id: "orphan", promptId: "p4", parent: undefined } as never);
    t.show.push({ ...prompt, id: "long", promptId: "p5", style: "x".repeat(1001) } as never);
    const { dropped } = parsed(t);
    expect(dropped.map((d) => d.at)).toEqual(["show[10]", "show[11]", "show[12]"]);
    expect(dropped[0]?.reason).toBe('prompt "p3" names itself as its parent');
    expect(dropped[1]?.reason).toBe('prompt "p4" lists changes but no parent to change from');
    expect(dropped[2]?.reason).toMatch(/style.*1000/);
    const twice = full();
    (twice.show[9] as { rows: { id: string }[] }).rows[1]!.id = "t1";
    expect(parsed(twice).dropped).toEqual([{ at: "show[9]", kind: "taste", reason: 'taste line "t1" appears twice' }]);
  });
});

describe("studio ledger events", () => {
  const say = { v: 1, id: "u1", seq: 1, at: "2026-10-29T10:00:00Z", from: "user", text: "something calm" };

  it("reads a say and a turn through the turn door", () => {
    const s1 = parseStudioEvent(STUDIO_EVENTS.say, { session: "calm-bed", turn: say });
    expect(s1.ok && s1.value.parsed.turn.text).toBe("something calm");
    const t1 = parseStudioEvent(STUDIO_EVENTS.turn, { session: "calm-bed", turn: full() });
    expect(t1.ok && t1.value.parsed.turn.show).toHaveLength(10);
  });

  it("refuses a say that carries an agent turn, and a bad session id", () => {
    const r = parseStudioEvent(STUDIO_EVENTS.say, { session: "calm-bed", turn: full() });
    expect(r.ok ? "" : r.error.message).toBe("audio.say: carries a turn from the agent, expected one from the user");
    expect(parseStudioEvent(STUDIO_EVENTS.say, { session: "Calm Bed!", turn: say }).ok).toBe(false);
  });

  it("keys events by a dot-free kind", () => {
    expect(studioEventKey(STUDIO_EVENTS.say, "u1")).toBe("audio-say:u1");
    expect(studioEventKey(STUDIO_EVENTS.turn, "t2")).toBe("audio-turn:t2");
  });
});
