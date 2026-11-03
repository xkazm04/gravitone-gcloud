// /music-clip's pure parts and its in-process verbs: the two validators that
// refuse authored files (every violation, not the first), the stage machine
// (idempotent picks, a changed pick forgetting what grew from it), the pack's
// hash (moves with any input, stays without one), the comparison with 0, 1 and
// 3 stacks, and `analyze` behind an injected analyser - so nothing here reaches
// Gemini or decodes audio. Every folder is a temp dir; no store is opened.

import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateDirections, validateStory, heroSlice, lintHero } from "../../lib/music-clip/boards.ts";
import { comparePage, readResults, runCompare, finalizeStack } from "../../lib/music-clip/compare.ts";
import { fixtureTimeline } from "../../lib/music-clip/fixtures/timeline.ts";
import { clipPath, readState, runAnalyze, stableJson, writeClipJson, writeState, ClipError } from "../../lib/music-clip/folder.ts";
import { packHash, runPack } from "../../lib/music-clip/pack.ts";
import { advanceTo, applyPick, nextVerb, parsePick, resetTo, stageAfterAnalyze } from "../../lib/music-clip/state.ts";
import type { Direction, StateV1 } from "../../lib/music-clip/types.ts";

const dirs: string[] = [];
const tempDir = () => {
  const d = fs.mkdtempSync(path.join(tmpdir(), "music-clip-unit-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const dir = (id: string, over: Partial<Direction> = {}): Direction => ({
  id, name: `Name ${id}`, animation: "slow push", palette: ["#101010", "#ff3300"], type: "condensed grotesk", story: "a machine wakes", transitions: ["hard cut"], risk: "too dark", ...over,
});
const T = "2026-10-30T00:00:00.000Z";
const base: StateV1 = { v: 1, stage: "analyzed", trackSha1: "abc", picks: {}, updatedAt: T };

describe("validateDirections", () => {
  it("accepts a well-formed set", () => {
    expect(validateDirections({ v: 1, directions: [dir("rust-choir"), dir("cold-grid")] }).ok).toBe(true);
  });
  it("refuses 11 directions and a bad palette, listing every violation", () => {
    const list = Array.from({ length: 11 }, (_, i) => dir(`d-${i}`));
    list[3] = dir("d-3", { palette: ["#12345", "red"] });
    list[4] = dir("Bad_Id", { risk: " " });
    list[5] = dir("d-0");
    const r = validateDirections({ v: 1, directions: list });
    expect(r.ok).toBe(false);
    const v = r.ok ? [] : r.violations;
    expect(v).toContain("11 directions; at most 10");
    expect(v.filter((x) => x.includes("is not #rrggbb"))).toHaveLength(2);
    expect(v.some((x) => x.includes("Bad_Id") && x.includes("kebab-case"))).toBe(true);
    expect(v.some((x) => x.endsWith(".risk is empty"))).toBe(true);
    expect(v.some((x) => x.includes("duplicate"))).toBe(true);
  });
});

describe("validateStory", () => {
  const t = fixtureTimeline();
  const good = { v: 1, direction: "rust-choir", sections: [{ id: "s3", title: "Hook", beat: "the wall breaks", visual: "sparks", cutsPerBar: 2 }], hero: { sectionId: "s3", startS: 16, endS: 22 } };
  it("accepts a story inside the track", () => expect(validateStory(good, t, "rust-choir").ok).toBe(true));
  it("refuses unknown sections, a hero outside 4-8 s, and a story for another direction", () => {
    const r = validateStory({ ...good, direction: "other", sections: [{ ...good.sections[0], id: "s9" }], hero: { sectionId: "s3", startS: 16, endS: 26 } }, t, "rust-choir");
    const v = r.ok ? [] : r.violations;
    expect(v.some((x) => x.includes("not the picked direction"))).toBe(true);
    expect(v.some((x) => x.includes('"s9"'))).toBe(true);
    expect(v.some((x) => x.includes("must be 4-8 s"))).toBe(true);
  });
  it("refuses a hero past the end of the track", () => {
    const r = validateStory({ ...good, hero: { sectionId: "s4", startS: 27, endS: 32 } }, t, "rust-choir");
    expect(r.ok ? [] : r.violations).toContain("hero 27-32 s is outside the track (0-30 s)");
  });
});

describe("hero slice and lint", () => {
  it("carries sliceStartS and fps, and per-frame arrays start at round(sliceStartS*fps)", () => {
    const t = fixtureTimeline();
    const s = heroSlice(t, { sectionId: "s3", startS: 16, endS: 22 });
    expect(s.sliceStartS).toBe(15);
    expect(s.fps).toBe(30);
    expect(s.intensity[0]).toBe(t.intensity[15 * 30]);
    expect(s.beats.every((b) => b.t >= 15 && b.t <= 23)).toBe(true);
  });
  it("holds the hero to the purity rules and its own API, not the strip's", () => {
    expect(lintHero("<script>window.render=function(t){var d=window.__TIMELINE__;}</script>")).toEqual([]);
    const bad = lintHero("<script>requestAnimationFrame(f);Math.random()</script>");
    expect(bad.some((x) => x.startsWith("scheduler: requestAnimationFrame"))).toBe(true);
    expect(bad).toContain("api: window.render is not defined");
    expect(bad.some((x) => x.includes("renderFrameAt"))).toBe(false);
  });
});

describe("state machine", () => {
  it("a pick twice is the same state, updatedAt included", () => {
    const s = advanceTo(base, "board-a", T);
    const once = applyPick(s, parsePick("a:rust-choir"), ["rust-choir"], "2026-10-30T01:00:00.000Z");
    const twice = applyPick(once.state, parsePick("a:rust-choir"), ["rust-choir"], "2026-10-30T02:00:00.000Z");
    expect(once.changed).toBe(true);
    expect(twice.changed).toBe(false);
    expect(twice.state).toEqual(once.state);
  });
  it("a changed direction drops the story and stack picks", () => {
    const s: StateV1 = { ...base, stage: "bakeoff", picks: { a: "x", b: "x", stack: "kernel" } };
    const r = applyPick(s, { kind: "a", id: "y" }, ["x", "y"], T);
    expect(r.state.stage).toBe("picked-a");
    expect(r.state.picks).toEqual({ a: "y" });
  });
  it("unknown ids list the valid ones; out-of-order picks refuse", () => {
    expect(() => applyPick(advanceTo(base, "board-a", T), { kind: "a", id: "z" }, ["x", "y"], T)).toThrow(/valid: x, y/);
    expect(() => applyPick(base, { kind: "a", id: "x" }, ["x"], T)).toThrow(ClipError);
    expect(() => applyPick({ ...base, stage: "picked-a", picks: { a: "x" } }, { kind: "b", id: "x" }, ["x"], T)).toThrow(/board b/);
    expect(() => parsePick("c:x")).toThrow(/a:<direction-id>/);
  });
  it("a stack pick ends at final", () => {
    const r = applyPick({ ...base, stage: "bakeoff", picks: { a: "x", b: "x" } }, { kind: "stack", id: "kernel" }, ["kernel", "hyperframes", "remotion"], T);
    expect(r.state.stage).toBe("final");
  });
  it("advance never goes back; reset drops downstream picks; analyze resets only on a new track", () => {
    const s: StateV1 = { ...base, stage: "picked-b", picks: { a: "x", b: "x" } };
    expect(advanceTo(s, "board-a", T)).toBe(s);
    expect(resetTo(s, "board-b", T).picks).toEqual({ a: "x" });
    expect(stageAfterAnalyze(s, "abc", T)).toEqual({ state: { ...s, updatedAt: T }, reset: false });
    expect(stageAfterAnalyze(s, "def", T).state.stage).toBe("analyzed");
    expect(stageAfterAnalyze(s, "def", T).reset).toBe(true);
  });
  it("names the next verb", () => {
    expect(nextVerb(undefined, { directions: false, treatments: false, story: false, results: 0 })).toMatch(/^analyze/);
    expect(nextVerb({ ...base, stage: "board-b", picks: { a: "x", t: "y" } }, { directions: true, treatments: true, story: true, results: 0 })).toBe("pick <dir> b:x");
  });
});

/** A folder with a track, lyrics, style and a fixture timeline at stage picked-b. */
function packedFolder(): string {
  const d = tempDir();
  fs.writeFileSync(path.join(d, "song.mp3"), Buffer.from("not really audio"));
  fs.writeFileSync(path.join(d, "lyrics.txt"), "[Verse 1]\nIron wakes\n");
  fs.writeFileSync(path.join(d, "style.txt"), "industrial metal, 120 BPM");
  writeClipJson(d, "timeline.json", fixtureTimeline("f".repeat(40), "song.mp3"));
  writeClipJson(d, "directions.json", { v: 1, directions: [dir("rust-choir")] });
  writeClipJson(d, "story.json", { v: 1, direction: "rust-choir", sections: [{ id: "s3", title: "Hook", beat: "b", visual: "v", cutsPerBar: 2 }], hero: { sectionId: "s3", startS: 16, endS: 22 } });
  writeState(d, { ...base, stage: "picked-b", picks: { a: "rust-choir", b: "rust-choir" } });
  return d;
}

describe("pack", () => {
  it("packHash is order-free and name-sensitive", () => {
    expect(packHash({ a: "1", b: "2" })).toBe(packHash({ b: "2", a: "1" }));
    expect(packHash({ a: "1" })).not.toBe(packHash({ c: "1" }));
  });
  it("refuses before picked-b", () => {
    const d = packedFolder();
    writeState(d, { ...base, stage: "board-b", picks: { a: "rust-choir" } });
    expect(() => runPack(d)).toThrow(/approved story/);
  });
  it("stays when nothing changes and moves when timeline.json or the mp3 changes", () => {
    const d = packedFolder();
    const first = runPack(d).pack.packSha1;
    expect(runPack(d).pack.packSha1).toBe(first);
    expect(readState(d)?.stage).toBe("bakeoff");
    const t = fixtureTimeline("f".repeat(40), "song.mp3");
    t.tempo.bpmGlobal = 121;
    writeClipJson(d, "timeline.json", t);
    const second = runPack(d).pack.packSha1;
    expect(second).not.toBe(first);
    fs.appendFileSync(path.join(d, "song.mp3"), "x");
    expect(runPack(d).pack.packSha1).not.toBe(second);
    expect(Object.keys(JSON.parse(fs.readFileSync(clipPath(d, "bakeoff/pack/pack.json"), "utf8")).files)).toEqual(["direction.json", "lyrics.txt", "song.mp3", "story.json", "style.txt", "timeline.json"]);
  });
});

describe("compare", () => {
  const result = (stack: string, extra: object = {}) => ({ v: 1, stack, proofMp4: "proof.mp4", renderSeconds: 42.5, framesPerSecond: 12, editRound: [{ request: "slower chorus", minutes: 6, filesChanged: 1, linesChanged: 9, ok: true }], ...extra });
  it("0 stacks: three no-result cells", () => {
    const d = tempDir();
    const cells = readResults(d);
    expect(cells.map((c) => c.present)).toEqual([false, false, false]);
    expect(comparePage("x", cells).match(/no result/g)).toHaveLength(3);
  });
  it("1 stack: one video column, two no-result cells", () => {
    const d = tempDir();
    writeClipJson(d, "bakeoff/kernel/result.json", result("kernel"));
    const r = runCompare(d, "Song");
    const html = fs.readFileSync(r.html, "utf8");
    expect(r.stacks.filter((s) => s.present).map((s) => s.stack)).toEqual(["kernel"]);
    expect(html).toContain('src="bakeoff/kernel/proof.mp4"');
    expect(html.match(/no result/g)).toHaveLength(2);
    expect(html).not.toMatch(/https?:\/\//);
  });
  it("3 stacks, one invalid: every column present, the invalid one says why", () => {
    const d = tempDir();
    writeClipJson(d, "bakeoff/kernel/result.json", result("kernel"));
    writeClipJson(d, "bakeoff/hyperframes/result.json", result("hyperframes", { notes: "unverified on arm64" }));
    writeClipJson(d, "bakeoff/remotion/result.json", result("kernel"));
    const r = runCompare(d, "Song");
    expect(r.stacks.map((s) => s.present)).toEqual([true, true, true]);
    expect(r.stacks[2]?.error).toMatch(/folder is remotion/);
    expect(fs.readFileSync(r.html, "utf8")).toContain("unverified on arm64");
  });
  it("finalizeStack refuses without fullMp4 and copies it when present", () => {
    const d = tempDir();
    writeClipJson(d, "bakeoff/kernel/result.json", result("kernel"));
    expect(() => finalizeStack(d, "kernel")).toThrow(/no fullMp4/);
    writeClipJson(d, "bakeoff/kernel/result.json", result("kernel", { fullMp4: "full.mp4" }));
    fs.writeFileSync(clipPath(d, "bakeoff/kernel/full.mp4"), "video");
    expect(fs.readFileSync(finalizeStack(d, "kernel"), "utf8")).toBe("video");
  });
});

describe("analyze through an injected analyser", () => {
  const folder = (mp3 = "one") => {
    const d = tempDir();
    fs.writeFileSync(path.join(d, "track.mp3"), mp3);
    fs.writeFileSync(path.join(d, "lyrics.md"), "[Chorus]\nBreak the sequence\n");
    fs.writeFileSync(path.join(d, "prompt.txt"), "industrial");
    return d;
  };
  it("without --yes or --dry it refuses with the plan and never calls the analyser", async () => {
    let calls = 0;
    const r = await runAnalyze(folder(), {}, async () => (calls++, fixtureTimeline()));
    expect(r.status).toBe("refused");
    expect(calls).toBe(0);
    expect(r.status === "refused" ? r.plan.at(-1) : "").toBe("pass --yes to spend one Gemini call, --dry for none");
  });
  it("names every missing input at once", async () => {
    const d = tempDir();
    await expect(runAnalyze(d, { dry: true }, async () => fixtureTimeline())).rejects.toThrow(/no \*\.mp3.*no lyrics file.*no style prompt/);
  });
  it("--dry hands dry:true, writes a stable timeline and state; a new track hash resets", async () => {
    const d = folder();
    let seen: boolean | undefined;
    const r = await runAnalyze(d, { dry: true }, async (input) => ((seen = input.dry), fixtureTimeline("a".repeat(40))), () => T);
    expect(seen).toBe(true);
    expect(r.status === "ok" && r.reset).toBe(false);
    expect(fs.readFileSync(clipPath(d, "timeline.json"), "utf8")).toBe(stableJson(fixtureTimeline("a".repeat(40))));
    writeState(d, { ...(readState(d) as StateV1), stage: "board-a" });
    const same = await runAnalyze(d, { dry: true }, async () => fixtureTimeline("a".repeat(40)), () => T);
    expect(same.status === "ok" && same.state.stage).toBe("board-a");
    const changed = await runAnalyze(d, { dry: true }, async () => fixtureTimeline("b".repeat(40)), () => T);
    expect(changed.status === "ok" && changed.reset).toBe(true);
    expect(readState(d)?.stage).toBe("analyzed");
  });
});
