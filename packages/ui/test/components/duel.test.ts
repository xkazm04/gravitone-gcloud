// The taste duel (duel.ts): every pair differs on one axis, the next pair is the first undecided,
// a skipped axis decides nothing, and every seed word carries the pair that decided it.
import { describe, expect, test } from "vitest";

import { ATLAS } from "../../src/components/audio/atlas.ts";
import { AXES, compileDuel, idsOf, nextAxis, playableAxes, type DuelSound } from "../../src/components/audio/duel.ts";

const differs = (a: DuelSound, b: DuelSound): string[] =>
  (["ids", "levels", "bpm", "key"] as const).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

describe("the duel's pairs", () => {
  test("each pair differs on exactly one dimension of the sound", () => {
    for (const x of AXES) expect(differs(x.a.sound, x.b.sound)).toHaveLength(1);
  });
  test("every pair is played from atlas instruments", () => {
    const ids = new Set(ATLAS.map((e) => e.id));
    for (const x of AXES) for (const id of idsOf(x)) expect(ids.has(id)).toBe(true);
  });
  test("a machine missing an instrument is offered only the pairs it can play", () => {
    const all = new Set(ATLAS.map((e) => e.id));
    expect(playableAxes(all)).toHaveLength(AXES.length);
    all.delete("rhodes");
    expect(playableAxes(all).map((x) => x.id)).not.toContain("warmth");
  });
});

describe("answers into a seed", () => {
  test("the next pair is the first undecided; none when all are answered", () => {
    expect(nextAxis(AXES, {})?.id).toBe(AXES[0]?.id);
    expect(nextAxis(AXES, { pace: "a" })?.id).toBe(AXES[1]?.id);
    expect(nextAxis(AXES, Object.fromEntries(AXES.map((x) => [x.id, "skip"])))).toBeNull();
  });
  test("each word carries the pair that decided it", () => {
    const { seed, reasons } = compileDuel(AXES, { pace: "a", touch: "b", warmth: "a" });
    expect(seed.bpm).toBe(72);
    expect(seed.instruments).toEqual(["string section", "rhodes"]);
    expect(reasons.find((r) => r.term === "rhodes")?.why).toBe("warm over glassy");
    expect(reasons.find((r) => r.term === "72 bpm")?.why).toBe("slow over quick");
  });
  test("the key the colour pair was heard in is the seed's key, with its pair", () => {
    const { seed, reasons } = compileDuel(AXES, { colour: "b" });
    expect(seed.key).toBe("C minor");
    expect(reasons.find((r) => r.list === "key")?.why).toBe("shadowed over bright");
    expect(compileDuel(AXES, { pace: "a" }).seed.key).toBeNull();
  });
  test("a skipped axis decides nothing", () => {
    const { seed, reasons } = compileDuel(AXES, { pace: "skip", colour: "skip" });
    expect(seed.bpm).toBeNull();
    expect(seed.moods).toEqual([]);
    expect(reasons).toEqual([]);
  });
  test("caps hold, and no reason names a word the seed dropped", () => {
    const all = compileDuel(AXES, Object.fromEntries(AXES.map((x) => [x.id, "a"])));
    expect(all.seed.moods.length).toBeLessThanOrEqual(3);
    for (const r of all.reasons) if (r.list !== "bpm" && r.list !== "key") expect(all.seed[r.list]).toContain(r.term);
  });
});
