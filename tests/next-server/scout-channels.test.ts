// THE CHANNELS' STORE (spark project-baseline WP-A) - lib/foundry/scout/channels.ts over a temp SCOUT_CHANNELS_DIR:
// the session's outlines and the pasted outline-triage report become channel files whose episodes land `outline-kept`;
// only `keep` lines import, a second import changes nothing, the state machine refuses a move it does not hold,
// concurrent writers queue on the directory's lock instead of losing an episode, and a damaged file throws with its
// path instead of reading as an empty channel (which the next import would fill over the operator's verdicts).

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-channels-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store", "gravitone.sqlite");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "foundry-out", "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "foundry-out", "scout-muse");
  process.env["SCOUT_CHANNELS_DIR"] = path.join(dir, "foundry-out", "scout-channels");
  return dir;
});

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { channelsDir, episodeOf, episodesDue, importEpisodes, readChannel, readChannels, setEpisodeState } from "../../lib/foundry/scout/channels.ts";

const DIR = path.join(ROOT, "foundry-out", "scout-channels");

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));
beforeEach(() => rmSync(DIR, { recursive: true, force: true }));

/** A two-channel subset of the session's outlines.json (2026-10-26), three items each, verbatim. */
const OUTLINES = [
  {
    "id": "D1",
    "group": "Data explainer",
    "name": "Came From Nowhere",
    "audience": "Curious viewers 18-45 who watch data races and 'how did that happen' Shorts",
    "promise": "Every overtake tied to the real dated event that caused it: a race you can explain, not just watch.",
    "gap": "Generic bar-chart races are crowded (r/dataisbeautiful banned them). The dated-event story behind each overtake is not done; this passes the registry's continuity, path and accelerator gates by construction.",
    "edge": "Real data only (OWID, FAO, Wikipedia tables), source line on screen.",
    "items": [
      {
        "id": "D1-01",
        "title": "The Rice Race",
        "logline": "India closes on China in rice, 1961-2023.",
        "beats": [
          "Hook: two rice bowls, one towering, one half full; 1961.",
          "The race runs year by year; the gap is wide.",
          "1966: a new high-yield seed is released; the smaller bowl starts to climb.",
          "Droughts dent the line in dated years; the climb resumes.",
          "End: the two bowls almost level today; the source line holds on screen."
        ],
        "spec": "Source: FAO rice paddy production via Our World in Data, 1961-2023. Events: 1966 high-yield variety release; drought years as they appear in the series."
      },
      {
        "id": "D1-02",
        "title": "Wine's Three-Way Final",
        "logline": "Italy, France and Spain swap first place in wine for sixty years.",
        "beats": [
          "Hook: three wine glasses filling, first place swapping.",
          "Italy, France and Spain trade the lead through the 1960s-70s.",
          "1986: a poisoning scandal empties one glass for a year.",
          "Spain's vineyard area versus its yield: the glass that never quite fills.",
          "End: the current order, and the swap count across sixty years."
        ],
        "spec": "Source: FAO wine production via OWID. Events: 1986 methanol scandal; EU vine-pull schemes as dated in the record."
      },
      {
        "id": "D1-03",
        "title": "Steel From Nowhere",
        "logline": "Who made the world's steel, 1960-2023.",
        "beats": [
          "Hook: a tiny ingot in 1960 beside two giants.",
          "Japan and the US lead; the small ingot barely moves for thirty years.",
          "1996: it passes both.",
          "December 2001: trade-body entry; the curve goes vertical.",
          "End: more than half the world's steel from one country; source line."
        ],
        "spec": "Source: World Steel Association yearly crude-steel tables. Events: 1996 overtake, 2001 trade accession."
      }
    ]
  },
  {
    "id": "F1",
    "group": "Documentary",
    "name": "While It Works",
    "audience": "Curious adults 18-45 who watch process and 'how it works' videos",
    "promise": "Photoreal, real sound, and a camera that goes where no camera can: inside the thing while it works.",
    "gap": "Incumbents are long-form stylised 3D explainers; a short, photoreal cutaway of an object in use in a real scene was not found.",
    "edge": "The impossible view is chosen fresh per episode; each view is graded (observed, reconstructed, modelled, illustrative) and labelled.",
    "items": [
      {
        "id": "F1-01",
        "title": "First Note",
        "logline": "Ride one magnetic particle on a cassette tape as the head reads the first note of a song.",
        "beats": [
          "Hook: a cassette clicks in; total darkness.",
          "We ride one magnetic particle on the tape toward the head.",
          "The head's field reaches it; the particle's orientation becomes a voltage.",
          "Frozen millisecond: the first note becomes sound.",
          "End: pull back to the tape deck in a bedroom; the song plays."
        ],
        "spec": "View: a micro-camera riding one particle. Grade: Modelled (physics accurate, scale invented). Label in frame."
      },
      {
        "id": "F1-02",
        "title": "Thirty Milliseconds",
        "logline": "An airbag deploying, as one continuous broadcast-cutaway move from sensor to bag.",
        "beats": [
          "Hook: a car approaches a wall, slow motion.",
          "One continuous move from the crash sensor to the inflator, in a broadcast-cutaway style.",
          "The igniter fires; gas fills the bag.",
          "The bag meets the driver's face at the exact frame.",
          "End: the clock reads 30 ms; shorter than a blink."
        ],
        "spec": "View: broadcast cutaway graphic over a photoreal crash. Grade: Modelled. Timings sourced."
      },
      {
        "id": "F1-03",
        "title": "Cold Start",
        "logline": "Inside a frozen diesel cylinder at a million frames a second for the first combustion.",
        "beats": [
          "Hook: frost on a diesel engine, a key turns.",
          "Inside the cylinder at a million frames a second.",
          "Glow plug heat, compression, the injector's spray.",
          "Frozen at ignition: the flame front.",
          "End: the engine shudders alive in the cold yard."
        ],
        "spec": "View: high-speed lens inside a cylinder. Grade: Reconstructed (based on combustion imaging)."
      }
    ]
  }
];

const REPORT = [
  "project-baseline outline triage · 2026-10-26",
  "accepted 3 · rejected 1 of 6",
  "",
  "D1 Came From Nowhere",
  "  D1-01 keep · The Rice Race",
  "  D1-02 reject · Wine's Three-Way Final · too close to a bar race",
  "  D1-03 keep · Steel From Nowhere · tighten the 2001 beat · and keep the ingot",
  "",
  "F1 While It Works",
  "  F1-01 no verdict · First Note",
  "  F1-02 keep · Thirty Milliseconds",
  "  F1-03 maybe · Cold Start",
  "  F9-01 keep · Not An Outline",
  "  nonsense line without a separator",
].join("\n");

describe("channels: the directory", () => {
  it("is SCOUT_CHANNELS_DIR when set", () => {
    expect(channelsDir()).toBe(DIR);
  });
});

describe("episodes import", () => {
  it("imports only the keep lines, creates each channel card with its medium, keeps the note verbatim", async () => {
    const r = await importEpisodes({ outlines: OUTLINES, report: REPORT });
    expect(r.imported).toEqual(["D1-01", "D1-03", "F1-02"]);
    const why = Object.fromEntries(r.skipped.map((s) => [s.id, s.why]));
    expect(why["D1-02"]).toBe("rejected");
    expect(why["F1-01"]).toBe("no verdict");
    expect(why["F1-03"]).toMatch(/malformed/);
    expect(why["F9-01"]).toBe("not in the outlines");
    expect(why["nonsense"]).toMatch(/malformed/);

    const all = await readChannels();
    expect(all.map((f) => f.channel.id)).toEqual(["D1", "F1"]);
    const d1 = await readChannel("D1");
    expect(d1.channel.medium).toBe("reel");
    expect((await readChannel("F1")).channel.medium).toBe("storyboard");
    expect(d1.channel.name).toBe("Came From Nowhere");
    const steel = d1.episodes.find((e) => e.id === "D1-03");
    expect(steel?.state).toBe("outline-kept");
    expect(steel?.beats).toHaveLength(5);
    expect(steel?.note).toBe("tighten the 2001 beat · and keep the ingot");
    expect(d1.episodes.find((e) => e.id === "D1-01")).not.toHaveProperty("note");
    expect(d1.episodes.some((e) => e.id === "D1-02")).toBe(false);
    const onDisk = JSON.parse(readFileSync(path.join(DIR, "D1.json"), "utf8")) as { channel: { id: string } };
    expect(onDisk.channel.id).toBe("D1");
  });

  it("is idempotent: a second import changes nothing and an episode that moved keeps its state", async () => {
    await importEpisodes({ outlines: OUTLINES, report: REPORT });
    await setEpisodeState("D1-01", "in-production", { candidate: "2026-10-27/c-01" });
    const before = readFileSync(path.join(DIR, "D1.json"), "utf8");
    const r = await importEpisodes({ outlines: OUTLINES, report: REPORT });
    expect(r.imported).toEqual([]);
    expect(r.skipped.filter((s) => s.why === "already imported").map((s) => s.id)).toEqual(["D1-01", "D1-03", "F1-02"]);
    expect(readFileSync(path.join(DIR, "D1.json"), "utf8")).toBe(before);
    expect((await episodeOf("D1-01"))?.episode.state).toBe("in-production");
  });

  it("refuses outlines that do not parse, naming where, and writes nothing", async () => {
    await expect(importEpisodes({ outlines: [{ id: "D1" }], report: REPORT })).rejects.toThrow(/outlines: 0\./);
    await expect(readChannels()).resolves.toEqual([]);
  });

  it("concurrent imports do not lose an episode", async () => {
    const ids = ["D1-01", "D1-02", "D1-03", "F1-01", "F1-02", "F1-03"];
    const rs = await Promise.all(ids.map((id) => importEpisodes({ outlines: OUTLINES, report: `  ${id} keep · x` })));
    expect(rs.flatMap((r) => r.imported).sort()).toEqual(ids);
    const all = await readChannels();
    expect(all.flatMap((f) => f.episodes.map((e) => e.id)).sort()).toEqual(ids);
  });
});

describe("episodes due", () => {
  it("lists outline-kept episodes per channel in import order, omitting empty channels", async () => {
    await importEpisodes({ outlines: OUTLINES, report: "  F1-02 keep · a" });
    await new Promise((r) => setTimeout(r, 5));
    await importEpisodes({ outlines: OUTLINES, report: "  F1-01 keep · b\n  D1-02 keep · c" });
    let due = await episodesDue();
    expect(due.map((d) => [d.channel.id, d.episodes.map((e) => e.id)])).toEqual([["D1", ["D1-02"]], ["F1", ["F1-02", "F1-01"]]]);
    await setEpisodeState("D1-02", "in-production", { candidate: "2026-10-27/c-03" });
    due = await episodesDue();
    expect(due.map((d) => d.channel.id)).toEqual(["F1"]);
  });
});

describe("the episode state machine", () => {
  beforeEach(async () => {
    await importEpisodes({ outlines: OUTLINES, report: "  F1-01 keep · a\n  F1-02 keep · b" });
  });

  it("walks outline-kept -> in-production -> made -> kept, recording the candidate and the time", async () => {
    const t0 = (await episodeOf("F1-01"))?.episode.at ?? "";
    await new Promise((r) => setTimeout(r, 5));
    const a = await setEpisodeState("F1-01", "in-production", { candidate: "2026-10-27/c-04" });
    expect(a.candidate).toBe("2026-10-27/c-04");
    expect(a.at > t0).toBe(true);
    expect((await setEpisodeState("F1-01", "made")).candidate).toBe("2026-10-27/c-04");
    const k = await setEpisodeState("F1-01", "kept");
    expect(k.state).toBe("kept");
    expect((await episodeOf("F1-01"))?.episode).toEqual(k);
  });

  it("made -> thrown, and in-production -> outline-kept clears the candidate", async () => {
    await setEpisodeState("F1-02", "in-production", { candidate: "2026-10-27/c-05" });
    const back = await setEpisodeState("F1-02", "outline-kept");
    expect(back).not.toHaveProperty("candidate");
    await setEpisodeState("F1-02", "in-production", { candidate: "2026-10-28/c-01" });
    await setEpisodeState("F1-02", "made");
    expect((await setEpisodeState("F1-02", "thrown")).state).toBe("thrown");
  });

  it("refuses a forbidden move by name, and in-production without a night's candidate", async () => {
    await expect(setEpisodeState("F1-01", "kept")).rejects.toThrow("F1-01 cannot move outline-kept -> kept");
    await expect(setEpisodeState("F1-01", "in-production")).rejects.toThrow(/names the night's candidate/);
    await expect(setEpisodeState("F1-01", "in-production", { candidate: "c-01" })).rejects.toThrow(/not a night's candidate/);
    await expect(setEpisodeState("F1-09", "in-production", { candidate: "2026-10-27/c-01" })).rejects.toThrow(/no episode F1-09/);
    expect((await episodeOf("F1-01"))?.episode.state).toBe("outline-kept");
  });

  it("concurrent moves on one channel each land", async () => {
    await Promise.all([
      setEpisodeState("F1-01", "in-production", { candidate: "2026-10-27/c-01" }),
      setEpisodeState("F1-02", "in-production", { candidate: "2026-10-27/c-02" }),
    ]);
    const f = await readChannel("F1");
    expect(f.episodes.map((e) => e.state)).toEqual(["in-production", "in-production"]);
  });
});

describe("a damaged file", () => {
  it("throws with its path instead of reading as empty, and an import over it writes nothing", async () => {
    await importEpisodes({ outlines: OUTLINES, report: "  F1-01 keep · a" });
    const file = path.join(DIR, "F1.json");
    writeFileSync(file, "{ \"channel\": ", "utf8");
    await expect(readChannels()).rejects.toThrow(file);
    await expect(readChannel("F1")).rejects.toThrow(/damaged/);
    await expect(importEpisodes({ outlines: OUTLINES, report: "  F1-02 keep · b" })).rejects.toThrow(file);
    expect(readFileSync(file, "utf8")).toBe("{ \"channel\": ");
    writeFileSync(file, JSON.stringify({ channel: { id: "F1" }, episodes: [] }), "utf8");
    await expect(episodeOf("F1-01")).rejects.toThrow(file);
  });
});
