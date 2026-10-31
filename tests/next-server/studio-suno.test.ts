import { describe, expect, it } from "vitest";

import { parseStudioTurn, type ParsedTurn } from "@gt/domain/audio.studio.door";

import { newestVersion, sunoVersions } from "../../app/(studio)/audio/studio/_host/suno.ts";

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
  turn({ id: "a1", from: "agent", show: [prompt("p1"), { id: "sk", kind: "track", mix, answers: { promptId: "p1", as: "sketch" } }] }),
  turn({ id: "u2", from: "user", text: "too fast", verdict: { promptId: "p1", clip: "a", keep: false, off: ["tempo"] }, takeId: "st_a" }),
  turn({ id: "a2", from: "agent", show: [{ id: "heard-a", kind: "track", takeId: "st_a", mix, answers: { promptId: "p1", as: "suno", clip: "a" } }, prompt("p2", { parent: "p1", changes: [{ field: "style", now: "96 bpm", why: "slower" }], because: "too fast" })] }),
  turn({ id: "u3", from: "user", text: "yes", verdict: { promptId: "p2", clip: "both", keep: true } }),
  turn({ id: "u4", from: "user", text: "about something never shown", verdict: { promptId: "p9", clip: "a" } }),
];

describe("sunoVersions", () => {
  it("lists every prompt version in first-shown order with its sketch, verdicts and takes", () => {
    const v = sunoVersions(turns());
    expect(v.map((x) => [x.promptId, x.turnId, x.node.parent ?? null])).toEqual([["p1", "a1", null], ["p2", "a2", "p1"]]);
    expect(v[0]?.sketch?.turnId).toBe("a1");
    expect(v[0]?.verdicts.map((x) => [x.turnId, x.verdict.keep, x.takeId])).toEqual([["u2", false, "st_a"]]);
    // The upload (u2) and the agent's track answering it (a2) are one take, clip a.
    expect(v[0]?.takes).toEqual([{ takeId: "st_a", turnId: "u2", clip: "a" }]);
    expect(v[1]?.verdicts.map((x) => x.verdict.clip)).toEqual(["both"]);
    expect(v[1]?.takes).toEqual([]);
  });

  it("ignores a verdict on a prompt never shown, and the newest version is the last", () => {
    const v = sunoVersions(turns());
    expect(v.flatMap((x) => x.verdicts.map((y) => y.turnId))).not.toContain("u4");
    expect(newestVersion(v)?.promptId).toBe("p2");
    expect(newestVersion([])).toBeNull();
  });

  it("a version shown again later is one version, now speaking for the later turn", () => {
    const t = [...turns(), turn({ id: "a3", from: "agent", show: [prompt("p2", { parent: "p1", name: "again" })] })];
    const v = sunoVersions(t);
    expect(v.map((x) => x.promptId)).toEqual(["p1", "p2"]);
    expect(v[1]?.turnId).toBe("a3");
    expect(v[1]?.node.name).toBe("again");
  });
});
