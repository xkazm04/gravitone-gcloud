// THE TAKES BOARD'S ARRANGEMENT (spark suno-advisor S1, composition c): rows newest first, a take in
// the column its clip names (or the first free one), a verdict in the column it is about (`both` in
// both), the row's keep/drop from its newest deciding verdict, and the taste strip's open proposals.
import { describe, expect, it } from "vitest";

import type { StudioTakeFacts } from "@gt/domain/audio.suno";
import { parseStudioTurn, type ParsedTurn } from "@gt/domain/audio.studio.door";

import { sunoVersions } from "../../app/(studio)/audio/studio/_host/suno.ts";
import { boardRows, changedFields, openProposals, proposedIn, styleHead } from "../../app/(studio)/audio/studio/_board/board.ts";

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
const facts = (takeId: string, clip?: "a" | "b"): StudioTakeFacts => ({ takeId, name: `${takeId}.mp3`, durationS: 120, href: `/t/${takeId}`, measured: { bpm: 112 }, ...(clip !== undefined ? { clip } : {}) });

const turns = (): ParsedTurn[] => [
  turn({ id: "u1", from: "user", text: "a night drive song" }),
  turn({ id: "a1", from: "agent", show: [prompt("p1"), { id: "sk", kind: "track", mix, answers: { promptId: "p1", as: "sketch" } }, { id: "taste", kind: "taste", rows: [{ id: "t1", line: "night synthwave", lean: "like" }, { id: "t2", line: "Heavy Autotune", lean: "dislike" }] }] }),
  turn({ id: "u2", from: "user", text: "b rushes", verdict: { promptId: "p1", clip: "b", keep: false, off: ["tempo"] }, takeId: "st_b" }),
  turn({ id: "u3", from: "user", text: "a is fine", verdict: { promptId: "p1", clip: "a" }, takeId: "st_x" }),
  turn({ id: "a2", from: "agent", show: [prompt("p2", { parent: "p1", changes: [{ field: "style", now: "96 bpm", why: "slower" }, { field: "style", now: "close vocal", why: "buried" }, { field: "exclude", now: "whisper", why: "breathy" }], because: "b rushes" }), { id: "taste", kind: "taste", rows: [{ id: "t1", line: "night  synthwave", lean: "like" }] }] }),
  turn({ id: "u4", from: "user", text: "both work", verdict: { promptId: "p2", clip: "both", keep: true } }),
];

describe("boardRows", () => {
  it("draws one row per version, newest first, with the children it led to", () => {
    const rows = boardRows(sunoVersions(turns()), {});
    expect(rows.map((r) => [r.n, r.version.promptId, r.children])).toEqual([[2, "p2", []], [1, "p1", ["p2"]]]);
  });

  it("puts a take in the column its clip names, and a verdict in the column it is about", () => {
    const [, p1] = boardRows(sunoVersions(turns()), { st_b: facts("st_b"), st_x: facts("st_x") });
    expect(p1?.slots.map((x) => [x.clip, x.take?.takeId, x.take?.facts?.name, x.verdicts.map((v) => v.turnId)])).toEqual([
      ["a", "st_x", "st_x.mp3", ["u3"]],
      ["b", "st_b", "st_b.mp3", ["u2"]],
    ]);
    // The newest verdict that decided keep/drop decides the row (u3 decided neither).
    expect(p1?.kept).toBe(false);
  });

  it("a `both` verdict shows in both columns and keeps the row", () => {
    const [p2] = boardRows(sunoVersions(turns()), {});
    expect(p2?.slots.map((x) => x.verdicts.map((v) => v.turnId))).toEqual([["u4"], ["u4"]]);
    expect(p2?.kept).toBe(true);
    expect(p2?.slots.every((x) => x.take === undefined)).toBe(true);
  });

  it("a take with no clip takes the facts' clip, else the first free column; a third is extra", () => {
    const t = [
      turn({ id: "a1", from: "agent", show: [prompt("p1")] }),
      turn({ id: "u1", from: "user", text: "one", verdict: { promptId: "p1", clip: "both" }, takeId: "k1" }),
      turn({ id: "u2", from: "user", text: "two", verdict: { promptId: "p1", clip: "both" }, takeId: "k2" }),
      turn({ id: "u3", from: "user", text: "three", verdict: { promptId: "p1", clip: "both" }, takeId: "k3" }),
    ];
    const [row] = boardRows(sunoVersions(t), { k1: facts("k1", "b") });
    expect(row?.slots.map((x) => x.take?.takeId)).toEqual(["k2", "k1"]);
    expect(row?.extra.map((x) => x.takeId)).toEqual(["k3"]);
  });
});

describe("the row head", () => {
  it("counts each changed field once, in the order first changed", () => {
    const [p2] = boardRows(sunoVersions(turns()), {});
    expect(p2 === undefined ? [] : changedFields(p2.version)).toEqual([{ field: "style", n: 2 }, { field: "exclude", n: 1 }]);
  });

  it("shows the style's first non-empty line", () => {
    expect(styleHead("\n  synthwave, 112 bpm  \nsecond")).toBe("synthwave, 112 bpm");
    expect(styleHead("")).toBe("");
  });
});

describe("openProposals", () => {
  it("is every proposed line not kept, newest proposal first, a line proposed twice once", () => {
    const p = openProposals(turns(), [{ line: "heavy autotune", lean: "dislike", since: at }]);
    expect(p.map((x) => [x.id, x.line, x.turnId])).toEqual([["a2:t1", "night  synthwave", "a2"]]);
    expect(proposedIn(p, "Night Synthwave")).toBe("a2");
    expect(proposedIn(p, "something else")).toBeUndefined();
  });
});
