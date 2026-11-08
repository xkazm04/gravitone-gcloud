// THE OUTAGE PROBE (spark outage-pauses-boards): ComfyUI goes away while a storyboard's panels are queued. On the nights
// of 2026-10-26 every queued panel failed in seconds and booked itself an empty frame (160 of 330). Now an engine that
// could not be REACHED (flux2.ts isComfyUnreachable) is not a panel's failure: the step is a retryable vendor-failure
// that books nothing, the kernel backs off and asks again, and when the engine returns the board completes with every
// frame. A refusal the engine ANSWERED stays that panel's. At the limit the job ends failed with the engine's own
// sentence and the candidate and its episode settle as an all-failed board does. No ComfyUI, no network, no sleeping.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-outage-"));
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  process.env["MESH_STORE_DIR"] = path.join(dir, "mesh");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["AI_REGISTRY_DIR"] = path.join(dir, "no-registry");
  fs.mkdirSync(path.join(dir, "catalogue"), { recursive: true });
  fs.writeFileSync(path.join(dir, "catalogue", "styles.json"), JSON.stringify({ styles: [] }), "utf8");
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Channel, Episode, EpisodeState } from "@gt/domain/channel";
import { AppError } from "@gt/domain/errors";
import { get } from "@gt/kernel/job";
import { openKernel } from "@gt/kernel/kernel";
import { runJob } from "@gt/kernel/job-run";
import { closeProcessKernel } from "@gt/kernel/process";
import { STORYBOARD_OUTAGE_LIMIT } from "@gt/producers/scout-storyboard/define";

import { runCli } from "../../pipeline/scout.mts";
import { setEpisodeDoorForTests, type EpisodeDoor } from "../../lib/foundry/scout/episodeMoves.ts";
import { mutateNight, readNight } from "../../lib/foundry/scout/store.ts";
import type { Candidate, IdeaCandidate, Night, StoryboardCandidate } from "../../lib/foundry/scout/types.ts";
import { comfyUnreachable } from "../../lib/imaging/local/fluxWait.ts";
import { effectsFor } from "../../lib/producers/extract.ts";
import { scoutStoryboardProducer } from "../../lib/producers/scoutStoryboard.ts";

const LIVE = (() => {
  const { GRAVITONE_DRY_ONLY: _pin, ...rest } = process.env;
  return rest;
})();
const LOC = path.join(ROOT, "kernel.sqlite");
const KEPT = "2026-09-20";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const CH: Channel = { id: "F1", group: "Documentary", name: "While It Works", audience: "a", promise: "p", gap: "g", edge: "e", medium: "storyboard" };

const idea = (id: string): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: `idea ${id}`, target: "scene", prompt: `prompt of ${id}`, anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png` });
const brief = (fromIdea: string) => ({
  fromIdea,
  title: "The lantern that keeps three steps ahead",
  paragraph: "A watchman climbs after a lantern he never catches, until the top landing opens on the city.",
  bullets: ["beats: the lantern moves, the chase, the window", "format: a 30 s vertical short", "audience: adults who like quiet mysteries", "look: warm amber against cold slate"],
  panels: ["frame one", "frame two", "frame three"],
});

beforeAll(() => {
  const dir = path.join(ROOT, "scout", KEPT);
  mkdirSync(dir, { recursive: true });
  const ideas: Candidate[] = ["c-01", "c-02", "c-03"].map(idea);
  const night: Night = {
    id: KEPT, startedAt: `${KEPT}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "committed", stop: "target", sources: [], candidates: ideas, jobs: [],
    committed: { at: `${KEPT}T08:00:00.000Z`, by: "operator", kept: ideas.map((c) => `${c.id}/board`), rejected: [], reasons: {}, notes: {}, dry: false },
  };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
});
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    if (String(input).endsWith("/system_stats")) return new Response(JSON.stringify({ system: { comfyui_version: "test" }, devices: [] }));
    throw new Error(`unexpected fetch ${String(input)}`);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setEpisodeDoorForTests(null);
  closeProcessKernel();
});
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

/** A detached live launch of one storyboard, its episode in production on it; the job id and the fake channel store. */
async function launch(idea: string): Promise<{ night: string; jobId: string; moves: [string, EpisodeState][] }> {
  const out: string[] = [];
  const open = await runCli(["open", "--json", "--live"], { env: LIVE, out: (s) => out.push(s), err: () => undefined });
  expect(open).toBe(0);
  const night = String((JSON.parse(out.join("\n")) as { night: string }).night);
  const f = path.join(ROOT, `boards-${idea.replace("/", "-")}.json`);
  writeFileSync(f, JSON.stringify([brief(`${KEPT}/${idea}`)]), "utf8");
  const code = await runCli(["storyboard", night, "--detach", "--json", f], { env: LIVE, out: () => undefined, err: () => undefined });
  expect(code).toBe(0);
  const jobId = `job:scout-storyboard:${night}:c-01`;
  // The board is an episode's: the channel store holds it in production on this candidate.
  await mutateNight(night, (n) => ({ ...n, candidates: n.candidates.map((c) => (c.kind === "storyboard" ? { ...c, fromEpisode: "F1-01" } : c)) }));
  const held: Episode = { id: "F1-01", channel: "F1", title: "F1-01", logline: "l", beats: ["1", "2", "3", "4", "5"], spec: "s", state: "in-production", at: "2026-10-27T05:00:00.000Z", candidate: `${night}/c-01` };
  const moves: [string, EpisodeState][] = [];
  const door: EpisodeDoor = {
    episodeOf: async () => ({ channel: CH, episode: held }),
    setEpisodeState: async (id, next) => {
      moves.push([id, next]);
      Object.assign(held, { state: next });
      return { ...held };
    },
  };
  setEpisodeDoorForTests(door);
  return { night, jobId, moves };
}

const board = async (night: string): Promise<StoryboardCandidate> => (await readNight(night)).candidates.find((c): c is StoryboardCandidate => c.kind === "storyboard") as StoryboardCandidate;

async function drive(jobId: string, draw: (prompt: string, seed?: number) => Promise<{ png: Uint8Array; seed: number }>) {
  const k = openKernel(LOC);
  if (!k.ok) throw k.error;
  try {
    const producer = scoutStoryboardProducer({ store: () => ({ ok: true as const, value: k.value.store }), engines: { draw: (p, o) => draw(p, o.seed) } });
    const sleeps: number[] = [];
    const r = await runJob(effectsFor(k.value.store, LOC), producer, jobId, { dryOnly: false, backoffMs: (s) => s, sleep: async (ms) => void sleeps.push(ms) });
    const j = get(k.value.store, jobId as never);
    const rows = k.value.store.read((rd) => rd.all("SELECT 1 AS x FROM spend_rows WHERE job_id = ?", jobId).length);
    return { report: r, job: j.ok ? j.value.job : undefined, sleeps, spendRows: rows.ok ? rows.value : -1 };
  } finally {
    k.value.close();
  }
}

describe("an outage while boards are queued", () => {
  it("ComfyUI unreachable for six attempts books no panel; when it returns the board completes with every frame", async () => {
    const { night, jobId } = await launch("c-01");
    let calls = 0;
    const seen: number[] = [];
    const r = await drive(jobId, async (_p, seed) => {
      calls++;
      // The first six asks (panel 1, again and again) find the engine away; the recorded board stays untouched meanwhile.
      if (calls <= 6) {
        seen.push((await board(night)).images?.filter((f) => f !== null).length ?? 0);
        throw comfyUnreachable("ComfyUI is not reachable at http://127.0.0.1:8188, so no Flux frame was drawn (fetch failed)");
      }
      return { png: PNG, seed: seed ?? 1 };
    });
    expect(r.report.ok && r.report.value.outcome).toBe("done");
    expect(r.sleeps).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seen).toEqual([0, 0, 0, 0, 0, 0]);
    const c = await board(night);
    expect(c.status).toBe("rendered");
    expect(c.images).toEqual([1, 2, 3].map((k) => `storyboards/c-01/panel-${k}.png`));
    expect(c.error).toBeUndefined();
    expect(r.job?.failStreak).toBe(0);
    expect(r.spendRows).toBe(0);
  });

  it("a refusal the engine ANSWERED is still that panel's: an empty frame with its sentence, no retry", async () => {
    const { night, jobId } = await launch("c-02");
    const r = await drive(jobId, async (p, seed) => {
      if (p === "frame two") throw new AppError("unavailable", "ComfyUI refused the Flux graph (400): invalid prompt");
      return { png: PNG, seed: seed ?? 1 };
    });
    expect(r.report.ok && r.report.value.outcome).toBe("done");
    expect(r.sleeps).toEqual([]);
    const c = await board(night);
    expect(c.images).toEqual(["storyboards/c-01/panel-1.png", null, "storyboards/c-01/panel-3.png"]);
    expect(c.error).toBe("panel 2: ComfyUI refused the Flux graph (400): invalid prompt");
  });

  it(`at the limit (${STORYBOARD_OUTAGE_LIMIT} in a row) the job ends failed with the engine's sentence; the board fails, no panel booked, the episode is freed`, async () => {
    const { night, jobId, moves } = await launch("c-03");
    const away = "ComfyUI is not reachable at http://127.0.0.1:8188, so no Flux frame was drawn (fetch failed)";
    let calls = 0;
    const r = await drive(jobId, async () => {
      calls++;
      throw comfyUnreachable(away);
    });
    expect(calls).toBe(STORYBOARD_OUTAGE_LIMIT);
    expect(r.report.ok && r.report.value.outcome).toBe("failed");
    expect(r.job?.state).toBe("failed");
    expect(r.job?.error?.message).toBe(`${STORYBOARD_OUTAGE_LIMIT} consecutive vendor failures; the last: ${away}. Fix the cause, then retry.`);
    const c = await board(night);
    expect(c.status).toBe("failed");
    expect(c.images ?? []).toEqual([]);
    expect(c.error).toBe(r.job?.error?.message);
    // The episode went back to outline-kept, free for the next night.
    expect(moves.at(-1)).toEqual(["F1-01", "outline-kept"]);
    // The kernel's own backoff is what bounds the wait: the default curve over this limit, at its slowest.
    const slowest = Array.from({ length: STORYBOARD_OUTAGE_LIMIT - 1 }, (_, i) => Math.min(30_000, 1000 * 2 ** i)).reduce((a, b) => a + b, 0);
    expect(slowest).toBeLessThan(40 * 60_000);
  });
});
