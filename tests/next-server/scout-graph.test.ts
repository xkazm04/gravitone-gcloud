import { ROOT, disposeRoot } from "./scout-cli-harness.ts";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BEFORE_SEEDS, type GraphNode } from "@gt/domain/scoutGraph";
import { append } from "@gt/kernel/events";
import { enqueue } from "@gt/kernel/job";
import { openKernel } from "@gt/kernel/kernel";
import { book } from "@gt/kernel/spend/ledger";

import { effortOf, gpuMinutes } from "../../lib/foundry/scout/effort.ts";
import { branchesSection, buildGraph, graphOf, targetOf } from "../../lib/foundry/scout/graph.ts";
import type { Candidate, Night, SeedBatch, Steer } from "../../lib/foundry/scout/types.ts";

// THE DECISION GRAPH (spark scout-decision-graph WP-S2) - lib/foundry/scout/graph.ts over a scout store written
// on disk in a temp SCOUT_STORE_DIR (the harness's): two seed batches with a child seed and a third still open,
// a seedless night, a night with ideas grown from seeds and a track, a night that develops them (a scene with
// its clip kept, a direction resting on a kept cell, a visualizer of the track's clip), and an open night.
// Effort from a temp kernel store: a shared ideas job divided evenly, gpu.local minutes from job events.

afterAll(() => disposeRoot());

const SCOUT = path.join(ROOT, "scout");
const writeJson = (rel: string, v: unknown): void => {
  const file = path.join(SCOUT, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(v), "utf8");
};

const A = "2026-10-20";
const B = "2026-10-21";
const C = "2026-10-22";
const seed = (id: string, audience: "kids" | "family" | "adult", genre: string, parent?: string) => ({
  id,
  sentence: `${genre} for ${audience} ${id}`,
  genre,
  subgenre: `${genre} sub`,
  type: "animated comedy sketch",
  audience,
  format: "short" as const,
  ...(parent === undefined ? {} : { parent }),
});
const commit = (kept: string[], rejected: string[]) => ({ at: "2026-10-21T07:00:00.000Z", by: "op", kept, rejected, reasons: {}, notes: {}, dry: false });

const batches: SeedBatch[] = [
  {
    id: A,
    createdAt: "2026-10-20T20:00:00.000Z",
    dry: false,
    seeds: [seed("sd-001", "kids", "comedy"), seed("sd-002", "adult", "horror"), seed("sd-003", "family", "music"), seed("sd-004", "kids", "comedy")],
    committed: commit(["sd-001", "sd-003", "sd-004"], ["sd-002"]),
  },
  { id: B, createdAt: "2026-10-21T20:00:00.000Z", dry: false, seeds: [seed("sd-001", "kids", "comedy", `${A}/sd-001`)], committed: commit(["sd-001"], []) },
  { id: C, createdAt: "2026-10-22T20:00:00.000Z", dry: false, seeds: [seed("sd-001", "kids", "comedy"), seed("sd-002", "adult", "drama")] },
];

const night = (id: string, startedAt: string, candidates: Candidate[], over: Partial<Night> = {}): Night => ({
  id,
  startedAt,
  ceilingUsd: 15,
  target: 20,
  clipCap: 2,
  dry: false,
  state: "committed",
  sources: [{ id: "s-01", url: "https://x.example/a", kind: "image", title: "A found still", why: "w", found: "search", rights: "reference-only", status: "ingested", files: [] }],
  candidates,
  jobs: [],
  ...over,
});
const idea = (id: string, fromSeed: string | undefined, more: Partial<Candidate> = {}): Candidate => ({
  id,
  kind: "idea",
  sourceIds: [],
  status: "rendered",
  title: `idea ${id}`,
  target: "scene",
  prompt: "p",
  anchor: { kind: "free", ref: "" },
  ...(fromSeed === undefined ? {} : { fromSeed }),
  ...more,
} as Candidate);

const N0 = "2026-10-19";
const N1 = "2026-10-21";
const N2 = "2026-10-22";
const N3 = "2026-10-23";
const nights: Night[] = [
  night(N0, "2026-10-19T20:00:00.000Z", [
    { id: "c-01", kind: "style", sourceIds: ["s-01"], status: "rendered" },
    { id: "c-02", kind: "watch", sourceIds: [], status: "failed", entry: "a channel", why: "w", error: "the page refused" },
  ], { committed: commit(["c-01/riso/replica-1"], []) }),
  night(N1, "2026-10-21T20:00:00.000Z", [
    idea("c-01", `${A}/sd-001`, { jobId: "job:ideas" }),
    { id: "c-02", kind: "style", sourceIds: ["s-01"], status: "rendered", use: "a thrown look" },
    idea("c-03", `${A}/sd-003`, { jobId: "job:ideas" }),
    { id: "c-04", kind: "track", sourceIds: [], status: "rendered", sentence: "a kids comedy song", fromSeed: `${A}/sd-004`, clips: [{ part: "a1", path: "tracks/c-04/a1.mp3", model: "v6", title: "Bounce", clipId: "sc-1" }] },
  ], { committed: commit(["c-01/idea", "c-03/idea", "c-04/a1"], ["c-02/riso/replica-1", "c-02/riso/replica-2"]) }),
  night(N2, "2026-10-22T20:00:00.000Z", [
    { id: "c-01", kind: "scene", sourceIds: ["s-01"], status: "rendered", keyframes: [], replicas: [], fromIdea: `${N1}/c-01`, fromSeed: `${A}/sd-001`, jobId: "job:scene" },
    { id: "c-02", kind: "direction", sourceIds: [], status: "rendered", title: "Kids comedy, deadpan", format: "short", genre: "comedy", style: "riso", tone: "deadpan", audience: "kids", premise: "p", basedOn: [`${N1}/c-01/idea`] },
    { id: "c-03", kind: "visualizer", sourceIds: [], status: "rendered", track: `${N1}/c-04/a1`, fromSeed: `${A}/sd-004` },
    { id: "c-04", kind: "finding", sourceIds: ["s-01"], status: "rendered", template: "t", step: "02-frames", claim: "Hold the push-in", quote: "q" },
  ], { committed: commit(["c-01/replica-1", "c-01/clip", "c-02/text", "c-03/video", "c-04/text"], []) }),
  night(N3, "2026-10-23T20:00:00.000Z", [idea("c-01", `${B}/sd-001`), idea("c-02", `${B}/sd-001`, { status: "pending" })], { state: "closed" }),
];

const steer: Steer = { split: { audience: { kids: 60, family: 20, adult: 20 }, genre: { kids: { comedy: 100 } } }, paused: [`${A}/sd-003`], history: [] };

for (const b of batches) writeJson(`seeds/${b.id}/batch.json`, b);
for (const n of nights) writeJson(`${n.id}/night.json`, n);
writeJson("steer.json", steer);

const NOW = new Date("2026-10-24T08:00:00.000Z");
const node = (nodes: readonly GraphNode[], id: string): GraphNode => {
  const n = nodes.find((x) => x.id === id);
  if (n === undefined) throw new Error(`no node ${id}`);
  return n;
};

describe("buildGraph - the nodes, their stages and states", () => {
  it("draws every seed, candidate and output with its stage, its verdict and the branch it inherits", async () => {
    const g = await buildGraph({ now: NOW });
    expect(g.nights).toBe(4);
    expect(g.batches).toBe(3);
    expect(node(g.nodes, `seed:${A}/sd-001`)).toMatchObject({ stage: "seed", kind: "seed", state: "kept", packet: `pkt:seeds:${A}`, cell: "sd-001", audience: "kids", genre: "comedy" });
    expect(node(g.nodes, `seed:${B}/sd-001`)).toMatchObject({ stage: "derived", state: "kept" });
    expect(node(g.nodes, `seed:${A}/sd-002`).state).toBe("rejected");
    expect(node(g.nodes, `seed:${C}/sd-001`).state).toBe("open");
    expect(node(g.nodes, `cand:${N1}/c-01`)).toMatchObject({ stage: "idea", kind: "idea", state: "kept", label: "idea c-01", seed: `${A}/sd-001`, audience: "kids", packet: `pkt:scout:${N1}` });
    expect(node(g.nodes, `cand:${N1}/c-02`)).toMatchObject({ stage: "run", kind: "style", state: "rejected", label: "a thrown look" });
    expect(node(g.nodes, `cand:${N1}/c-02`)).not.toHaveProperty("audience");
    expect(node(g.nodes, `cand:${N0}/c-02`).state).toBe("failed");
    expect(node(g.nodes, `cand:${N3}/c-01`).state).toBe("open");
    expect(node(g.nodes, `cand:${N3}/c-02`).state).toBe("pending");
    expect(node(g.nodes, `cand:${N2}/c-03`)).toMatchObject({ stage: "output", kind: "visualizer", state: "kept", label: "Bounce" });
    // No store handed in: no node carries effort.
    expect(g.nodes.some((n) => n.effort !== undefined)).toBe(false);
  });

  it("marks what sits under a paused seed, and only that", async () => {
    const g = await buildGraph({ now: NOW });
    expect(node(g.nodes, `seed:${A}/sd-003`).paused).toBe(true);
    expect(node(g.nodes, `cand:${N1}/c-03`).paused).toBe(true);
    expect(node(g.nodes, `cand:${N1}/c-01`)).not.toHaveProperty("paused");
    expect(g.paused).toEqual([`${A}/sd-003`]);
  });

  it("leaves an output node only for a kept run that left something real", async () => {
    const g = await buildGraph({ now: NOW });
    const outs = g.nodes.filter((n) => n.id.startsWith("out:")).map((n) => [n.id, n.kind, n.cell ?? null]);
    expect(outs).toEqual([
      [`out:${N0}/c-01`, "look", null],
      [`out:${N2}/c-01`, "clip", "c-01/clip"],
      [`out:${N2}/c-04`, "knowledge", null],
    ]);
  });

  it("links parent to child seed, seed to idea, idea to run, a seeded run to its seed, a kept cell to its direction, a clip to its visualizer", async () => {
    const g = await buildGraph({ now: NOW });
    const e = g.edges.map((x) => `${x.from} > ${x.to}`);
    expect(e).toEqual(
      expect.arrayContaining([
        `seed:${A}/sd-001 > seed:${B}/sd-001`,
        `seed:${A}/sd-001 > cand:${N1}/c-01`,
        `cand:${N1}/c-01 > cand:${N2}/c-01`,
        `seed:${A}/sd-004 > cand:${N1}/c-04`,
        `cand:${N1}/c-01 > cand:${N2}/c-02`,
        `cand:${N1}/c-04 > cand:${N2}/c-03`,
        `cand:${N2}/c-01 > out:${N2}/c-01`,
        `seed:${B}/sd-001 > cand:${N3}/c-01`,
      ]),
    );
    // A run developed from an idea is not linked to the seed again; nothing links to a node that is not drawn.
    expect(e).not.toContain(`seed:${A}/sd-001 > cand:${N2}/c-01`);
    const ids = new Set(g.nodes.map((n) => n.id));
    expect(g.edges.every((x) => ids.has(x.from) && ids.has(x.to))).toBe(true);
  });
});

describe("buildGraph - the groups and the open packets", () => {
  it("groups by audience then genre, BEFORE_SEEDS last, with live, dead, depth, pause and the share", async () => {
    const g = await buildGraph({ now: NOW });
    expect(g.groups.map((x) => x.key)).toEqual(["kids", "kids/comedy", "family", "family/music", "adult", "adult/drama", "adult/horror", BEFORE_SEEDS]);
    const at = (k: string) => g.groups.find((x) => x.key === k);
    expect(at("kids")).toMatchObject({ audience: "kids", depth: "output", dead: 0, share: { target: 60, actual: 29 } });
    expect(at("kids/comedy")).toMatchObject({ genre: "comedy", share: { target: 60 } });
    expect(at("family")).toMatchObject({ live: 0, paused: true, share: { target: 20, actual: 0 } });
    expect(at("family")).not.toHaveProperty("depth");
    expect(at("adult/horror")).toMatchObject({ live: 0, dead: 1 });
    expect(at("adult/horror")).not.toHaveProperty("paused");
    // Five of the last live nights' seven runs were made before seeds (two styles, a watch line, a direction, a finding).
    expect(at(BEFORE_SEEDS)).toMatchObject({ depth: "output", dead: 2, share: { actual: 71 } });
    expect(at(BEFORE_SEEDS)?.share).not.toHaveProperty("target");
  });

  it("names the newest uncommitted seeds packet and the newest closed night, with what is undecided in each", async () => {
    const g = await buildGraph({ now: NOW });
    expect(g.open).toEqual({ seeds: { packet: `pkt:seeds:${C}`, undecided: 2 }, night: { packet: `pkt:scout:${N3}`, undecided: 1 } });
  });

  it("an empty store is the BEFORE_SEEDS group alone, and no open packet", () => {
    const g = graphOf({ nights: [], batches: [], steer: { paused: [], history: [] }, now: NOW });
    expect(g.groups).toEqual([{ key: BEFORE_SEEDS, nodes: 0, live: 0, dead: 0, effort: { runs: 0, gpuMin: 0, geminiUsd: 0, uncappedUsd: 0 }, share: { actual: 0 } }]);
    expect(g.open).toEqual({});
    expect(branchesSection(g, { paused: [], history: [] })).toEqual([]);
  });

  it("a genre's target is its audience's share times the genre's", () => {
    expect(targetOf({ split: { audience: { kids: 40, adult: 60 }, genre: { kids: { comedy: 25, music: 75 } } }, paused: [], history: [] }, "kids/music")).toBe(30);
    expect(targetOf(steer, "adult/horror")).toBeUndefined();
    expect(targetOf(steer, BEFORE_SEEDS)).toBeUndefined();
  });
});

describe("effort - the kernel's records", () => {
  const T0 = Date.parse("2026-10-21T21:00:00.000Z");
  const MIN = 60_000;
  const actor = { kind: "agent", id: "scout-test" } as const;

  it("divides a shared ideas job evenly, reads gpu.local minutes off the job events, and sums a group whole", () => {
    let now = T0;
    const k = openKernel(":memory:", { clock: () => new Date(now) });
    if (!k.ok) throw k.error;
    const store = k.value.store;
    const ideas = enqueue(store, { id: "job:ideas", of: { kind: "run", id: "run-ideas" }, producer: "scout-ideas", lane: "cloud.google" }, actor);
    const scene = enqueue(store, { id: "job:scene", of: { kind: "run", id: "run-scene" }, producer: "scout-scene", lane: "gpu.local" }, actor);
    if (!ideas.ok || !scene.ok) throw new Error("enqueue");
    const cls = { id: "imaging-usd", unit: "usd", windowMs: 86_400_000, ceiling: null } as const;
    const w = store.tx((t) => {
      book(t, cls, { amount: 0.3, outcome: "served", basis: "vendor", axes: { model: "google/gemini-3.6-flash" } }, "test", { jobId: "job:ideas" });
      book(t, cls, { amount: 0.1, outcome: "served", basis: "vendor", axes: { model: "leonardo-studio/gpt-image-2.5-sunburst" } }, "test", { jobId: "job:ideas" });
    });
    if (!w.ok) throw w.error;
    const event = (type: string, at: number, lane = "gpu.local"): void => {
      now = at;
      const r = store.tx((t) => {
        append(t, { actor, type, subject: { kind: "job", id: "job:scene" }, lane, data: {} });
      });
      if (!r.ok) throw r.error;
    };
    event("job.claimed", T0 + MIN);
    event("job.yielded", T0 + 4 * MIN);
    event("job.claimed", T0 + 10 * MIN);
    event("job.done", T0 + 22 * MIN);
    // A claim on another lane is not the GPU's.
    event("job.claimed", T0 + 30 * MIN, "cloud.google");
    event("job.done", T0 + 90 * MIN, "cloud.google");

    const gpu = gpuMinutes(store, ["job:scene", "job:ideas"], new Date(T0 + 120 * MIN));
    expect(gpu.ok && Object.fromEntries(gpu.value)).toEqual({ "job:scene": 15 });

    const e = effortOf(store, nights, new Date(T0 + 120 * MIN));
    if (!e.ok) throw e.error;
    expect(e.value.get(`${N1}/c-01`)).toEqual({ runs: 1, gpuMin: 0, geminiUsd: 0.15, uncappedUsd: 0.05, shared: true });
    expect(e.value.get(`${N1}/c-03`)).toEqual({ runs: 1, gpuMin: 0, geminiUsd: 0.15, uncappedUsd: 0.05, shared: true });
    expect(e.value.get(`${N2}/c-01`)).toEqual({ runs: 1, gpuMin: 15, geminiUsd: 0, uncappedUsd: 0 });
    expect(e.value.get(`${N0}/c-02`)).toEqual({ runs: 1, gpuMin: 0, geminiUsd: 0, uncappedUsd: 0 });

    const g = graphOf({ nights, batches, steer, now: NOW, effort: e.value });
    expect(g.groups.find((x) => x.key === "kids")?.effort).toEqual({ runs: 6, gpuMin: 15, geminiUsd: 0.15, uncappedUsd: 0.05 });
    expect(node(g.nodes, `seed:${A}/sd-001`)).not.toHaveProperty("effort");
    k.value.close();
  });

  it("counts a claim still open to now", () => {
    let now = T0;
    const k = openKernel(":memory:", { clock: () => new Date(now) });
    if (!k.ok) throw k.error;
    const store = k.value.store;
    const j = enqueue(store, { id: "job:running", of: { kind: "run", id: "run-r" }, producer: "scout-scene", lane: "gpu.local" }, actor);
    if (!j.ok) throw j.error;
    now = T0 + 5 * MIN;
    const r = store.tx((t) => {
      append(t, { actor, type: "job.claimed", subject: { kind: "job", id: "job:running" }, lane: "gpu.local", data: {} });
    });
    if (!r.ok) throw r.error;
    const gpu = gpuMinutes(store, ["job:running"], new Date(T0 + 35 * MIN));
    expect(gpu.ok && gpu.value.get("job:running")).toBe(30);
    k.value.close();
  });
});

describe("branchesSection - the next night's brief", () => {
  it("says each group's live depth, keeps, effort and split, genres under their audience", async () => {
    const g = await buildGraph({ now: NOW });
    const lines = branchesSection(g, steer);
    console.log(lines.join("\n"));
    expect(lines.slice(0, 2)).toEqual(["## Branches", ""]);
    expect(lines).toContain("- kids · live 11 · dead 0 · reached output · kept 8 · 0 runs, 0 GPU min, $0.00 Gemini · split 60% / took 29%");
    expect(lines).toContain("  - kids/comedy · live 11 · dead 0 · reached output · kept 8 · 0 runs, 0 GPU min, $0.00 Gemini · split 60% / took 29%");
    expect(lines).toContain("  - adult/horror · live 0 · dead 1 · reached nothing live · kept 0 · 0 runs, 0 GPU min, $0.00 Gemini");
    expect(lines.find((l) => l.startsWith(`- ${BEFORE_SEEDS}`))).not.toContain("split");
    expect(lines).toContain("- family · live 0 · dead 0 · reached nothing live · kept 2 · 0 runs, 0 GPU min, $0.00 Gemini · split 20% / took 0%");
    expect(lines.at(-1)).toBe("");
  });

  it("carries the effort it was built with", () => {
    const effort = new Map([[`${N2}/c-01`, { runs: 1, gpuMin: 12.34, geminiUsd: 0.125, uncappedUsd: 0.5 }]]);
    const lines = branchesSection(graphOf({ nights, batches, steer, now: NOW, effort }), steer);
    expect(lines).toContain("- kids · live 11 · dead 0 · reached output · kept 8 · 1 runs, 12.3 GPU min, $0.13 Gemini · split 60% / took 29%");
  });
});

// THE BOARD COLUMN (spark scout-storyboards): a storyboard sits at stage `board`, between its idea and the runs,
// linked from the idea it composes (not from the seed again), labelled by its title; kept, it leaves no output
// node - nothing real exists until a full video is made from it.
describe("graphOf - storyboards", () => {
  it("places a storyboard in the board column, linked from its idea, with no output", () => {
    const board = (id: string, fromIdea: string, more: Partial<Candidate> = {}): Candidate => ({ id, kind: "storyboard", sourceIds: [], status: "rendered", fromIdea, fromSeed: `${A}/sd-001`, title: `board ${id}`, paragraph: "p", bullets: ["a", "b", "c"], panels: ["p1"], ...more }) as Candidate;
    const N4 = "2026-10-24";
    const withBoards = [...nights, night(N4, "2026-10-24T20:00:00.000Z", [board("c-01", `${N1}/c-01`), board("c-02", `${N1}/c-03`, { status: "pending" })], { committed: commit(["c-01/words", "c-01/panel-1"], []) })];
    const g = graphOf({ nights: withBoards, batches, steer, now: NOW });
    expect(node(g.nodes, `cand:${N4}/c-01`)).toMatchObject({ stage: "board", kind: "storyboard", state: "kept", label: "board c-01", seed: `${A}/sd-001` });
    expect(node(g.nodes, `cand:${N4}/c-02`)).toMatchObject({ stage: "board", state: "pending" });
    const e = g.edges.map((x) => `${x.from} > ${x.to}`);
    expect(e).toContain(`cand:${N1}/c-01 > cand:${N4}/c-01`);
    expect(e).not.toContain(`seed:${A}/sd-001 > cand:${N4}/c-01`);
    expect(g.nodes.some((n) => n.id === `out:${N4}/c-01`)).toBe(false);
    // The board column is between idea and run: a run outreaches it, and a branch whose deepest live node is a storyboard reaches `board`.
    const only = graphOf({ nights: [nights[1] as Night, withBoards[4] as Night], batches, steer: { paused: [], history: [] }, now: NOW });
    expect(only.groups.find((x) => x.key === "kids")?.depth).toBe("run");
    expect(graphOf({ nights: [withBoards[4] as Night], batches, steer: { paused: [], history: [] }, now: NOW }).groups.find((x) => x.key === "kids")?.depth).toBe("board");
  });
});
