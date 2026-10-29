// The prompt sheet's arithmetic (spark suno-advisor S1, composition b): which version is pinned, which
// sketch speaks for a tweak, the lineage and verdict marks the rail draws, the take's track and
// measures the panel finds, and the taste lines proposed across a conversation.
import { describe, expect, it } from "vitest";

import { parseStudioTurn, type ParsedTurn } from "@gt/domain/audio.studio.door";

import { sunoVersions } from "../../app/(studio)/audio/studio/_host/suno.ts";
import { changedFields, lastVerdict, pinnedOf, sketchOf, takeMeasures, takeTrack, tasteRows, tasteTurn, verdictMark } from "../../app/(studio)/audio/studio/_sheet/sheet.ts";

const at = "2026-10-29T10:00:00Z";
const mix = { href: "/api/sound/takes/st_1/file" };
const prompt = (promptId: string, extra: Record<string, unknown> = {}) => ({
  id: `n-${promptId}`, kind: "suno_prompt", promptId, style: "synthwave, warm analog bass", instrumental: false, model: "v6", settings: { variety: 0 }, ...extra,
});
const turn = (raw: Record<string, unknown>): ParsedTurn => {
  const r = parseStudioTurn({ v: 1, seq: 0, at, text: "words", ...raw });
  if (!r.ok) throw new Error(r.error.message);
  expect(r.value.dropped).toEqual([]);
  return r.value;
};

const turns = (): ParsedTurn[] => [
  turn({ id: "u1", from: "user", text: "a night drive song" }),
  turn({ id: "a1", from: "agent", show: [prompt("p1"), { id: "sk", kind: "track", mix, answers: { promptId: "p1", as: "sketch" } }, { id: "taste", kind: "taste", rows: [{ id: "t1", line: "Night synthwave", lean: "like" }, { id: "t2", line: "festival drops", lean: "dislike" }] }] }),
  turn({ id: "u2", from: "user", text: "too fast", verdict: { promptId: "p1", clip: "a", keep: false, off: ["tempo", "vocals"] }, takeId: "st_a" }),
  turn({ id: "a2", from: "agent", show: [
    { id: "heard-a", kind: "track", takeId: "st_a", mix: { href: "/api/sound/takes/st_a/file" }, answers: { promptId: "p1", as: "suno", clip: "a" } },
    { id: "m", kind: "measures", takeId: "st_a", rows: [{ label: "tempo", value: "faster than asked", tone: "warn" }] },
    prompt("p2", { parent: "p1", changes: [{ field: "exclude", now: "whisper", why: "breathy" }, { field: "style", now: "96 bpm", why: "slower" }, { field: "style", was: "airy", now: "upfront", why: "buried" }], because: "too fast" }),
  ] }),
  turn({ id: "u3", from: "user", text: "yes", verdict: { promptId: "p2", clip: "both", keep: true } }),
  turn({ id: "a3", from: "agent", show: [{ id: "taste", kind: "taste", rows: [{ id: "t3", line: "night synthwave ", lean: "dislike" }, { id: "t4", line: "upfront vocal", lean: "like" }] }] }),
];

describe("pinnedOf", () => {
  const t = turns();
  const v = sunoVersions(t);
  it("pins the newest version until the person picks one, and none before a version exists", () => {
    expect(pinnedOf(v, null, t.length)?.promptId).toBe("p2");
    expect(pinnedOf([], null, 0)).toBeNull();
    expect(pinnedOf([], { promptId: "p1", seen: 0 }, 0)).toBeNull();
  });
  it("holds the pick while the conversation stands still, and follows the newest once it moves on", () => {
    expect(pinnedOf(v, { promptId: "p1", seen: t.length }, t.length)?.promptId).toBe("p1");
    expect(pinnedOf(v, { promptId: "p1", seen: t.length - 1 }, t.length)?.promptId).toBe("p2");
    expect(pinnedOf(v, { promptId: "gone", seen: t.length }, t.length)?.promptId).toBe("p2");
  });
});

describe("sketchOf", () => {
  const v = sunoVersions(turns());
  it("a version with its own sketch speaks for itself; a tweak borrows its parent's, naming it", () => {
    const own = sketchOf(v, "p1");
    expect(own?.sketch.node.id).toBe("sk");
    expect(own).not.toHaveProperty("from");
    const borrowed = sketchOf(v, "p2");
    expect(borrowed?.sketch.node.id).toBe("sk");
    expect(borrowed?.from).toBe("p1");
  });
  it("no sketch anywhere in the line, or an unknown version, is null; a parent cycle ends", () => {
    const bare = sunoVersions([turn({ id: "a1", from: "agent", show: [prompt("p1")] }), turn({ id: "a2", from: "agent", show: [prompt("p2", { parent: "p1" })] })]);
    expect(sketchOf(bare, "p2")).toBeNull();
    expect(sketchOf(bare, "p9")).toBeNull();
    const loop = sunoVersions([turn({ id: "a1", from: "agent", show: [prompt("p1", { parent: "p2" })] }), turn({ id: "a2", from: "agent", show: [prompt("p2", { parent: "p1" })] })]);
    expect(sketchOf(loop, "p1")).toBeNull();
  });
});

describe("the rail's marks", () => {
  const v = sunoVersions(turns());
  it("changed fields come each once, counted, in Suno's form order", () => {
    expect(changedFields(v[1]!.node)).toEqual([{ field: "style", n: 2 }, { field: "exclude", n: 1 }]);
    expect(changedFields(v[0]!.node)).toEqual([]);
  });
  it("a verdict reads as which take, keep or drop, and the off axes", () => {
    expect(verdictMark(lastVerdict(v[0]!)!)).toEqual({ take: "take a", call: "drop", off: ["tempo", "vocals"] });
    expect(verdictMark(lastVerdict(v[1]!)!)).toEqual({ take: "both takes", call: "keep", off: [] });
    const undecided = sunoVersions([turn({ id: "a1", from: "agent", show: [prompt("p1")] }), turn({ id: "u1", from: "user", text: "hm", verdict: { promptId: "p1", clip: "b" } })]);
    expect(verdictMark(lastVerdict(undecided[0]!)!)).toEqual({ take: "take b", call: null, off: [] });
    expect(lastVerdict(sunoVersions([turn({ id: "a1", from: "agent", show: [prompt("p1")] })])[0]!)).toBeNull();
  });
});

describe("a take's track and measures", () => {
  it("finds the agent's track answering the take as suno, and the measures about it", () => {
    const t = turns();
    expect(takeTrack(t, "st_a")).toMatchObject({ turnId: "a2", node: { id: "heard-a" } });
    expect(takeMeasures(t, "st_a")?.rows.map((r) => r.value)).toEqual(["faster than asked"]);
    expect(takeTrack(t, "st_b")).toBeNull();
    expect(takeMeasures(t, "st_b")).toBeNull();
  });
  it("a sketch carrying the same take id is not the take", () => {
    const t = [turn({ id: "a1", from: "agent", show: [prompt("p1"), { id: "sk", kind: "track", takeId: "st_a", mix, answers: { promptId: "p1", as: "sketch" } }] })];
    expect(takeTrack(t, "st_a")).toBeNull();
  });
});

describe("tasteRows", () => {
  it("lists every proposed line once, the newest proposal winning, in first-proposed order", () => {
    const rows = tasteRows(turns());
    expect(rows.map((r) => [r.line, r.lean, r.turnId])).toEqual([
      ["night synthwave", "dislike", "a3"],
      ["festival drops", "dislike", "a1"],
      ["upfront vocal", "like", "a3"],
    ]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
  it("a keep is filed against the turn that proposed the line, whatever its case", () => {
    const rows = tasteRows(turns());
    expect(tasteTurn(rows, "FESTIVAL DROPS")).toBe("a1");
    expect(tasteTurn(rows, "Night Synthwave")).toBe("a3");
    expect(tasteTurn(rows, "never proposed")).toBeUndefined();
  });
});
