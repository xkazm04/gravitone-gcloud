// A CHANNEL EPISODE'S VERDICT (spark project-baseline WP-B) - lib/decision/v1/sources/scout.ts over a night holding a
// storyboard and a reel made `fromEpisode`: the Board's cells say `episode: <id>` where an idea's say `idea`, and the
// operator's commit of pkt:scout:<night> ends each episode - a kept storyboard's is kept, a rejected reel's thrown -
// once: a redelivered claim moves nothing more, and a channel store that refuses never fails the commit. The channel
// store is a fake door (lib/foundry/scout/episodeMoves.ts setEpisodeDoorForTests); every other store a temp directory.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-scout-episodes-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store", "gravitone.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "foundry-out", "extract");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "foundry-out", "scout");
  process.env["SCOUT_CHANNELS_DIR"] = path.join(dir, "foundry-out", "scout-channels");
  process.env["MESH_STORE_DIR"] = path.join(dir, "foundry-out", "mesh");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Channel, Episode, EpisodeState } from "@gt/domain/channel";

import { closeKernel } from "../../lib/kernelStore.ts";
import { scoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import { storyboardVerdictLine } from "../../lib/decision/v1/sources/scoutEpisodeWords.ts";
import { Refusal } from "../../lib/foundry/scout/acts.ts";
import { setEpisodeDoorForTests, type EpisodeDoor } from "../../lib/foundry/scout/episodeMoves.ts";
import type { Candidate, Night } from "../../lib/foundry/scout/types.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const NIGHT = "2026-10-27";
const out = path.join(ROOT, "foundry-out");
const blobDir = path.join(ROOT, "blobs");

afterEach(() => {
  setEpisodeDoorForTests(null);
  vi.restoreAllMocks();
});
afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const CH: Channel = { id: "F1", group: "Documentary", name: "While It Works", audience: "a", promise: "p", gap: "g", edge: "e", medium: "storyboard" };
const ep = (id: string, candidate: string): Episode => ({ id, channel: id.slice(0, 2), title: id, logline: "l", beats: ["1", "2", "3", "4", "5"], spec: "s", state: "made", at: "2026-10-27T05:00:00.000Z", candidate });

function fakeStore(eps: Episode[], refuse = false): { door: EpisodeDoor; moves: [string, EpisodeState][] } {
  const held = new Map(eps.map((e) => [e.id, e]));
  const moves: [string, EpisodeState][] = [];
  return {
    moves,
    door: {
      episodeOf: async (id) => {
        const e = held.get(id);
        return e === undefined ? undefined : { channel: CH, episode: e };
      },
      setEpisodeState: async (id, next) => {
        const e = held.get(id);
        if (refuse || e === undefined) throw new Refusal(`episodes: ${id} cannot move`);
        if (e.state !== "made" || (next !== "kept" && next !== "thrown")) throw new Refusal(`episodes: ${id} cannot move ${e.state} -> ${next}`);
        const moved = { ...e, state: next };
        held.set(id, moved);
        moves.push([id, next]);
        return moved;
      },
    },
  };
}

const TABLE = { kind: "table" as const, title: "List of countries by coffee production (Wikipedia)", url: "https://en.wikipedia.org/wiki/List_of_countries_by_coffee_production" };

function seed(): void {
  closeKernel();
  for (const d of ["store", "foundry-out", "catalogue", "knowledge"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  const candidates: Candidate[] = [
    { id: "c-01", kind: "storyboard", sourceIds: [], status: "rendered", fromEpisode: "F1-01", title: "The kettle from inside", paragraph: "A bubble's ride.", bullets: ["a", "b", "c"], panels: ["one"], images: [], use: "While It Works: The kettle", aim: "p" },
    { id: "c-02", kind: "reel", sourceIds: [], status: "rendered", fromEpisode: "D1-01", title: "The coffee belt", source: TABLE, cut: ["Brazil leads", "Vietnam climbs"], files: { brief: "reels/c-02/brief.json", approach: "reels/c-02/approach.json" } },
  ];
  const dir = path.join(out, "scout", NIGHT);
  mkdirSync(dir, { recursive: true });
  const night: Night = { id: NIGHT, startedAt: `${NIGHT}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "closed", stop: "target", closedAt: `${NIGHT}T05:00:00.000Z`, sources: [], candidates, jobs: [] };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
}

const nightOf = (id: string): Night => JSON.parse(readFileSync(path.join(out, "scout", id, "night.json"), "utf8")) as Night;

describe("scout adapter - a channel episode's cells and verdict", () => {
  it("the storyboard and the reel cells name the episode", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    expect(flow.plan.packet.items.map((c) => c.id)).toEqual(["c-01/words", "c-02/reel"]);
    expect(flow.plan.present.items["c-01/words"]?.meta).toBe("episode: F1-01 · 0 of 1 frames · local · free");
    expect(flow.plan.present.items["c-02/reel"]?.meta).toBe("Source: List of countries by coffee production (Wikipedia) · episode: D1-01 · 2 beats");
  });

  it("the rows carry the channel, logline and beats of each episode; the store absent or damaged leaves them out and the row still draws", async () => {
    seed();
    const made = { ...ep("F1-01", `${NIGHT}/c-01`), logline: "A bubble that rides the whole boil.", beats: ["It forms.", "It climbs.", "It splits.", "It rises.", "It breaks."] };
    setEpisodeDoorForTests(fakeStore([made, ep("D1-01", `${NIGHT}/c-02`)]).door);
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    const rows = flow.plan.present.rows;
    expect(rows.find((r) => r.id === "c-01")).toMatchObject({ channel: "While It Works", logline: "A bubble that rides the whole boil.", beats: made.beats });
    expect(rows.find((r) => r.id === "c-02")).toMatchObject({ group: "reels", channel: "While It Works", logline: "l", beats: ["1", "2", "3", "4", "5"] });

    // An episode the store does not hold, and a store that throws: the packet builds and the fields are absent.
    setEpisodeDoorForTests({ episodeOf: async () => undefined, setEpisodeState: fakeStore([]).door.setEpisodeState });
    const none = await openFlow(scoutAdapter, NIGHT, blobDir);
    expect(none.plan.present.rows.map((r) => r.id)).toEqual(["c-01", "c-02"]);
    for (const r of none.plan.present.rows) expect(r).not.toHaveProperty("channel");
    setEpisodeDoorForTests({
      episodeOf: async () => {
        throw new Refusal("channels: F1.json is damaged");
      },
      setEpisodeState: fakeStore([]).door.setEpisodeState,
    });
    const damaged = await openFlow(scoutAdapter, NIGHT, blobDir);
    expect(damaged.plan.present.rows.map((r) => r.id)).toEqual(["c-01", "c-02"]);
    for (const r of damaged.plan.present.rows) expect(r).not.toHaveProperty("logline");
    expect(damaged.plan.present.items["c-01/words"]?.meta).toBe("episode: F1-01 · 0 of 1 frames · local · free");
  });

  it("the preview of an episode's storyboard names its real outcome, not a full video", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    flow.patch([
      { candidate: "c-01/words", verdict: "keep" },
      { candidate: "c-02/reel", verdict: "keep" },
    ]);
    const detail = (id: string) => must(flow.preview()).consequence.writes.find((w) => w.candidate === id)?.detail;
    expect(detail("c-01/words")).toBe("the episode ends kept");
    flow.patch([{ candidate: "c-01/words", verdict: "reject", reasons: ["generic"] }]);
    expect(detail("c-01/words")).toBe("refused: the episode ends thrown");
    expect(storyboardVerdictLine({ dry: true }, { fromEpisode: "F1-01" }, "keep")).toBe("kept; a dry night moves no episode");
    expect(storyboardVerdictLine({ dry: true }, { fromEpisode: "F1-01" }, "reject")).toBe("refused; a dry night moves no episode");
    // A board made from an idea keeps the shared words (an archived chain; nothing tells it apart).
    expect(storyboardVerdictLine({ dry: false }, {}, "keep")).toBe("ready for a full video");
    expect(storyboardVerdictLine({ dry: false }, {}, "reject")).toBe("refused: no full video grows from it");
  });

  it("the commit keeps the kept storyboard's episode and throws the rejected reel's - once", async () => {
    seed();
    const fake = fakeStore([ep("F1-01", `${NIGHT}/c-01`), ep("D1-01", `${NIGHT}/c-02`)]);
    setEpisodeDoorForTests(fake.door);
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    flow.patch([
      { candidate: "c-01/words", verdict: "keep" },
      { candidate: "c-02/reel", verdict: "reject", reasons: ["generic"] },
    ]);
    must(flow.commit());
    const claim = flow.claim();
    must(await scoutAdapter.apply(claim));
    expect(nightOf(NIGHT).state).toBe("committed");
    expect(fake.moves).toEqual([
      ["F1-01", "kept"],
      ["D1-01", "thrown"],
    ]);
    // Redelivered: the record is already there and the episodes already ended - nothing moves, nothing fails.
    must(await scoutAdapter.apply(claim));
    expect(fake.moves).toHaveLength(2);
  });

  it("a channel store that refuses never fails the commit", async () => {
    seed();
    setEpisodeDoorForTests(fakeStore([ep("F1-01", `${NIGHT}/c-01`), ep("D1-01", `${NIGHT}/c-02`)], true).door);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    flow.patch([
      { candidate: "c-01/words", verdict: "keep" },
      { candidate: "c-02/reel", verdict: "keep" },
    ]);
    must(flow.commit());
    must(await scoutAdapter.apply(flow.claim()));
    expect(nightOf(NIGHT).committed?.kept).toEqual(["c-01/words", "c-02/reel"]);
  });
});
