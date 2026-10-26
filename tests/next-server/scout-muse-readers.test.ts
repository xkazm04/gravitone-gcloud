// THE READERS SEE BOTH WINGS (spark scout-muse WP3): the decision graph is built once per wing and a muse night
// never appears in the scout graph; the ledger's scout and seeds sources read every wing's root, a muse night's
// events keyed and tagged by its run id with distinct Weir titles; the Library's scout feed stays the scout
// wing's. Two temp roots, the same day in each.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-muse-readers-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildGraphs, graphOf } from "../../lib/foundry/scout/graph.ts";
import { withWing } from "../../lib/foundry/scout/wingScope.ts";
import type { Candidate, Night } from "../../lib/foundry/scout/types.ts";
import { weirPacketId } from "../../lib/ledger/v1/packet.ts";
import { projectScout, scoutSource } from "../../lib/ledger/v1/sources/scout.ts";
import { seedsSource } from "../../lib/ledger/v1/sources/seeds.ts";
import type { ProjectCtx } from "../../lib/ledger/v1/types.ts";
import { scoutFeed } from "../../lib/library/feeds/scout.ts";

const DAY = "2026-10-24";
const ctx: ProjectCtx = { now: new Date("2026-10-25T09:00:00.000Z"), universe: "real" };

const idea = (id: string, title: string): Candidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title, target: "scene", prompt: "p", anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png` });
const night = (id: string, candidates: Candidate[], over: Partial<Night> = {}): Night => ({
  id,
  startedAt: `${id}T00:00:00.000Z`,
  ceilingUsd: 2,
  target: 3,
  clipCap: 0,
  dry: false,
  state: "closed",
  closedAt: `${id}T04:00:00.000Z`,
  sources: [],
  candidates,
  jobs: [],
  ...over,
});
const committed = { at: "2026-10-23T08:00:00.000Z", by: "operator", kept: ["c-01/board", "c-02/replica-1"], rejected: [], reasons: {}, notes: {}, dry: false };
// A kept scene in a muse root: what the scout feed WOULD shelve, were it to read that root.
const scene: Candidate = { id: "c-02", kind: "scene", sourceIds: [], status: "rendered", keyframes: [], replicas: ["scenes/c-02/replica-1.jpg"], recipe: { shot: "wide", camera: "24mm", motion: "still", composition: "a figure at a chart table", lighting: "lamp", palette: [], rhythm: "hold", durationS: 4, prompt: "p" } };

const SCOUT_NIGHTS = [night(DAY, [idea("c-01", "Lantern-lit stairwell")])];
const MUSE_NIGHTS = [night(DAY, [idea("c-01", "Mara Venn, cartographer"), idea("c-02", "A tango in an empty ballroom")]), night("2026-10-22", [idea("c-01", "Gouache harbour portrait"), scene], { state: "committed", committed })];

beforeAll(() => {
  for (const [root, nights] of [["scout", SCOUT_NIGHTS], ["scout-muse", MUSE_NIGHTS]] as const) {
    for (const n of nights) {
      mkdirSync(path.join(ROOT, root, n.id), { recursive: true });
      writeFileSync(path.join(ROOT, root, n.id, "night.json"), JSON.stringify(n));
    }
  }
});
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("the decision graph, one per wing", () => {
  it("builds each wing's graph from its own root; a muse node is tagged and decided on pkt:scout:muse:<night>", async () => {
    const g = await buildGraphs({ now: new Date("2026-10-25T00:00:00.000Z") });
    expect(g.scout.nights).toBe(1);
    expect(g.scout.nodes.map((n) => n.label)).toEqual(["Lantern-lit stairwell"]);
    expect(g.scout.nodes.every((n) => n.wing === undefined && n.packet === `pkt:scout:${DAY}`)).toBe(true);
    expect(g.scout.open.night?.packet).toBe(`pkt:scout:${DAY}`);

    expect(g.muse.nights).toBe(2);
    expect(g.muse.nodes.filter((n) => n.kind === "idea").map((n) => n.label).sort()).toEqual(["A tango in an empty ballroom", "Gouache harbour portrait", "Mara Venn, cartographer"]);
    expect(g.muse.nodes.every((n) => n.wing === "muse" && n.packet.startsWith("pkt:scout:muse:"))).toBe(true);
    expect(g.muse.open.night).toEqual({ packet: `pkt:scout:muse:${DAY}`, undecided: 2 });
    expect(g.muse.nodes.find((n) => n.label === "Gouache harbour portrait")?.state).toBe("kept");
  });

  it("the pure builder without a wing is the scout wing's, as every caller before the wings", () => {
    const g = graphOf({ nights: MUSE_NIGHTS, batches: [], steer: { paused: [], history: [] }, now: new Date() });
    expect(g.nodes.every((n) => n.wing === undefined && !n.packet.includes("muse"))).toBe(true);
  });
});

describe("the ledger, both wings", () => {
  it("reads every wing's nights; the same day in two wings is two records, two piles, two packets", async () => {
    const snap = await scoutSource.read();
    if (!snap.ok) throw snap.error;
    expect(snap.value.nights.map((n) => n.id)).toEqual([DAY]);
    expect((snap.value.muse ?? []).map((n) => n.id).sort()).toEqual(["2026-10-22", DAY]);

    const p = projectScout(snap.value, ctx);
    expect(p.weir.map((w) => [w.id, w.title, weirPacketId(w)])).toEqual([
      [DAY, `scout ${DAY}`, `pkt:scout:${DAY}`],
      [`muse:${DAY}`, `muse ${DAY}`, `pkt:scout:muse:${DAY}`],
    ]);
    expect(new Set(p.events.map((e) => e.key)).size).toBe(p.events.length);
    const muse = p.events.filter((e) => e.subject.id.startsWith("muse:"));
    expect(muse.length).toBeGreaterThan(0);
    expect(muse.every((e) => e.data?.["wing"] === "muse" && String(e.data["runId"]).startsWith("muse:"))).toBe(true);
    const scout = p.events.filter((e) => !e.subject.id.startsWith("muse:"));
    expect(scout.every((e) => e.data?.["wing"] === undefined && e.data?.["runId"] === DAY)).toBe(true);
    expect(p.tally.facts).toEqual({ "run.start": 3, "run.status": 3, "run.end": 3, commit: 1 });
  });

  it("the seeds source reads every wing's root (the muse wing holds none)", async () => {
    const snap = await seedsSource.read();
    if (!snap.ok) throw snap.error;
    expect(snap.value).toEqual({ batches: [], muse: [] });
  });
});

describe("the Library's scout feed", () => {
  it("shelves the scout wing only: a committed muse night is not Library material, whatever scope the caller runs in", async () => {
    for (const r of [await scoutFeed.read({ universe: "real" }), await withWing("muse", () => scoutFeed.read({ universe: "real" }))]) {
      expect(r.items).toEqual([]);
      expect(r.skipped).toEqual([]);
    }
  });
});
