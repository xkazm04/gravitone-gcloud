// WHAT THE OPERATOR SAID REACHES THE CHANNEL'S WRITER (perfect verdicts-steer-channel) - over the REAL channel store
// (a temp directory: SCOUT_CHANNELS_DIR, set before any lib/ module loads) and a night held in memory: a thrown
// storyboard and a kept reel each end their episode with the words the commit holds, once, in one write, and the next
// taste brief hands both back under the channel. A file written before the field existed still parses.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-episode-verdicts-"));
  process.env["SCOUT_CHANNELS_DIR"] = path.join(dir, "scout-channels");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { episodeOf, readChannels } from "../../lib/foundry/scout/channels.ts";
import { followNight, setEpisodeDoorForTests } from "../../lib/foundry/scout/episodeMoves.ts";
import { verdictOf } from "../../lib/foundry/scout/episodeVerdict.ts";
import { VERDICT_LINES, episodesFirst, episodesSection } from "../../lib/foundry/scout/tasteEpisodes.ts";
import type { Night, ReelCandidate, StoryboardCandidate } from "../../lib/foundry/scout/types.ts";

afterAll(() => {
  setEpisodeDoorForTests(null);
  rmSync(ROOT, { recursive: true, force: true });
});

const dir = path.join(ROOT, "scout-channels");
const CH = (id: string, medium: string) => ({ id, group: "g", name: `Channel ${id}`, audience: "a", promise: "p", gap: "g", edge: "e", medium });
const EP = (id: string, extra: Record<string, unknown> = {}) => ({ id, channel: id.slice(0, 2), title: `Title ${id}`, logline: "l", beats: ["1", "2", "3", "4", "5"], spec: "s", state: "made", at: "2026-10-27T05:00:00.000Z", ...extra });
const put = (id: string, medium: string, episodes: unknown[]): void => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ channel: CH(id, medium), episodes }), "utf8");
};
const night = (candidates: unknown[], committed: Record<string, unknown>): Night =>
  ({ id: "2026-11-01", startedAt: "2026-11-01T00:00:00.000Z", ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "committed", sources: [], candidates, jobs: [], committed: { at: "2026-11-02T00:00:00.000Z", by: "op", dry: false, ...committed } }) as unknown as Night;
const board = { id: "c-01", kind: "storyboard", status: "rendered", title: "t", fromEpisode: "F1-01" } as unknown as StoryboardCandidate;
const reel = { id: "c-02", kind: "reel", status: "rendered", title: "t", cut: [], fromEpisode: "D1-01" } as unknown as ReelCandidate;

describe("an episode file from before the verdict field", () => {
  it("still parses, with no verdict", async () => {
    put("A1", "storyboard", [EP("A1-01", { state: "kept", note: "from triage" })]);
    const got = await episodeOf("A1-01");
    expect(got?.episode.state).toBe("kept");
    expect(got?.episode.verdict).toBeUndefined();
    expect((await readChannels()).some((f) => f.channel.id === "A1")).toBe(true);
  });
});

describe("a verdict ends the episode with its words", () => {
  it("reads reasons and notes from ANY cell of the candidate, merged and de-duplicated", () => {
    const n = night([board], { kept: [], rejected: ["c-01/panel-2", "c-01/words", "c-09/words"], reasons: { "c-01/panel-2": ["too dark", "drift"], "c-01/words": ["drift"], "c-09/words": ["other run"] }, notes: { "c-01/panel-4": "the sky is wrong", "c-01/words": "the sky is wrong", "c-09/words": "other" } });
    expect(verdictOf(n, board)).toEqual({ reasons: ["too dark", "drift"], notes: ["the sky is wrong"] });
    expect(verdictOf(night([board], { kept: ["c-01/words"], rejected: [], reasons: {}, notes: {} }), board)).toBeUndefined();
  });

  it("a thrown storyboard and a kept reel record in the one write, once, and the next brief carries both", async () => {
    put("F1", "storyboard", [EP("F1-01", { candidate: "2026-11-01/c-01" }), EP("F1-02", { state: "outline-kept" })]);
    put("D1", "reel", [EP("D1-01", { candidate: "2026-11-01/c-02" })]);
    setEpisodeDoorForTests(null);
    const n = night([board, reel], {
      kept: ["c-02/reel"],
      rejected: ["c-01/words", "c-01/panel-1"],
      reasons: { "c-01/panel-1": ["the camera never moves"] },
      notes: { "c-01/panel-3": "keep the rig low next time", "c-02/reel": "the number is the hook" },
    });
    await followNight(n);
    const f1 = (await episodeOf("F1-01"))?.episode;
    expect(f1?.state).toBe("thrown");
    expect(f1?.verdict).toEqual({ reasons: ["the camera never moves"], notes: ["keep the rig low next time"] });
    const d1 = (await episodeOf("D1-01"))?.episode;
    expect(d1?.state).toBe("kept");
    expect(d1?.verdict).toEqual({ reasons: [], notes: ["the number is the hook"] });

    // A redelivered commit changes nothing: the episode has ended.
    const before = (await episodeOf("F1-01"))?.episode.at;
    await followNight(n);
    expect((await episodeOf("F1-01"))?.episode.at).toBe(before);

    const brief = await episodesFirst("# Taste\n\n## Seeds to develop\n");
    expect(brief).toMatch(/^# Taste\n\n## Episodes due\n\n/);
    expect(brief).toContain("- thrown F1-01 · Title F1-01\n  reasons: the camera never moves\n  note: keep the rig low next time");
    expect(brief).toContain("- kept D1-01 · Title D1-01\n  note: the number is the hook");
    // The channel with a due episode still lists it, and ahead of the channel that only has verdicts.
    expect(brief.indexOf("- F1-02 · Title F1-02")).toBeGreaterThan(-1);
    expect(brief.indexOf("### F1 ")).toBeLessThan(brief.indexOf("### D1 "));
  });
});

describe("the section's caps", () => {
  it("lists the newest VERDICT_LINES per channel and counts the rest", () => {
    const channel = CH("Z1", "storyboard") as never;
    const eps = Array.from({ length: VERDICT_LINES + 2 }, (_, i) => EP(`Z1-${String(i + 1).padStart(2, "0")}`, { state: "thrown" })) as never[];
    const lines = episodesSection([], [{ channel, episodes: eps }]);
    expect(lines.filter((l) => l.startsWith("- thrown"))).toHaveLength(VERDICT_LINES);
    expect(lines).toContain("- +2 older");
    expect(episodesSection([], [])).toEqual(["## Episodes due", "", "- none", ""]);
  });
});
