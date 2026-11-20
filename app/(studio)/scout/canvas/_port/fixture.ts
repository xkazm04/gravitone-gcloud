import "server-only";

// THE FIXTURE SIDE - the studio's fixture universe (the /scout fixture graph) with the channels the fixture never had
// (two reel channels and one storyboard channel, their episodes pointing at the fixture's own candidates), held in
// memory for the life of the dev server: verdicts, notes, the goal, and the reel road (./reelRoad.ts) all answer as the
// real side would, without a store, a file or a vendor. The live and legibility lanes run here.

import type { Channel, Episode } from "@gt/domain/channel";
import { err, ok, type Result } from "@gt/domain/errors";
import type { GraphNode } from "@gt/domain/scoutGraph";

import { fixtureScout } from "../../_port/fixture.ts";
import type { AudioState, CanvasChannel, CanvasView, RoundGoal, ScoutNote } from "./contract.ts";
import type { ServerCanvas } from "./port.ts";
import { step, type ReelInfo } from "./reelRoad.ts";
import { fixtureProductions } from "./fixtureProduction.ts";

const DAY0 = "2026-11-19";

const channel = (id: string, name: string, medium: Channel["medium"], group: string): Channel => ({ id, name, medium, group, audience: "Curious viewers 18-45", promise: `${name}: every episode tied to one real, dated thing.`, gap: "Not done this way yet.", edge: "Real data or real places only." });

/** Five kept full reel cuts the fixture night made for D1 and D2 - silent, as every GPU reel is - so the reel road
 *  (audio -> cut -> calendar) has something to carry on the fixture side. */
const REEL_CUTS: readonly GraphNode[] = ["The Rice Race", "Wine's Three-Way Final", "Online", "The Potato Stays Home", "No Canal"].map((label, i) => ({
  id: `out:2026-10-23/c-9${i}`, stage: "output", kind: "reel-cut", label, state: "kept", at: "2026-10-23", packet: "pkt:scout:2026-10-23",
}));

/** The fixture's channels: each reel or storyboard candidate of the fixture graph becomes an episode of one of them. */
function channelsOf(nodes: readonly GraphNode[]): CanvasChannel[] {
  const pick = (kinds: readonly string[]) => nodes.filter((n) => kinds.includes(n.kind) && n.id.startsWith("cand:")).slice(0, 8);
  const ep = (c: string, n: GraphNode, i: number): Episode => ({
    id: `${c}-${String(i + 1).padStart(2, "0")}`, channel: c, title: n.label.slice(0, 48), logline: n.label,
    beats: ["Hook: the first number on screen.", "The race runs year by year.", "A dated event turns it.", "The gap closes.", "End: the source line holds."],
    spec: "Source: a named public table.", state: n.state === "kept" ? "kept" : n.state === "rejected" ? "thrown" : "made", at: `${n.at.slice(0, 10)}T20:00:00.000Z`, candidate: n.id.slice("cand:".length),
  });
  const reels = pick(["reel", "reel-cut"]);
  const cuts = nodes.filter((n) => REEL_CUTS.some((c) => c.id === n.id));
  const cut = (c: string, n: GraphNode, i: number): Episode => ({ ...ep(c, n, i + 20), candidate: n.id.slice("out:".length) });
  const boards = pick(["storyboard"]);
  return [
    { channel: channel("D1", "Came From Nowhere", "reel", "Data explainer"), episodes: [...reels.slice(0, 4).map((n, i) => ep("D1", n, i)), ...cuts.slice(0, 3).map((n, i) => cut("D1", n, i))] },
    { channel: channel("D2", "The What-If Machine", "reel", "Data explainer"), episodes: [...reels.slice(4).map((n, i) => ep("D2", n, i)), ...cuts.slice(3).map((n, i) => cut("D2", n, i))] },
    { channel: channel("F1", "While It Works", "storyboard", "Documentary"), episodes: boards.map((n, i) => ep("F1", n, i)) },
  ];
}

let notes: ScoutNote[] = [];
let goal: RoundGoal = { text: "", targets: [] };
let road: AudioState = { audio: {}, slots: [] };
const decided = new Map<string, GraphNode["state"]>();
const pending = new Map<string, Map<string, GraphNode["state"]>>();
let seq = 0;

async function base(): Promise<Result<{ nodes: readonly GraphNode[]; view: Omit<CanvasView, "graph"> & { graph: CanvasView["graph"] } }>> {
  const v = await fixtureScout.view();
  if (!v.ok) return v;
  const graph = { ...v.value.graph, nodes: [...v.value.graph.nodes, ...REEL_CUTS].map((n) => ({ ...n, state: decided.get(n.id) ?? n.state })) };
  return ok({
    nodes: graph.nodes,
    view: {
      graph, channels: channelsOf(graph.nodes), media: {}, notes, goal, audio: road.audio, slots: road.slots, today: DAY0,
      ...(v.value.split === undefined ? {} : { split: v.value.split.audience }),
      caps: { verdicts: true, notes: true, steer: true, audio: true, dispatch: false },
      refusals: { dispatch: "a night runs as a /scout seat session; dispatching it from here is not built yet (docs/scout-canvas-port.md Phase 5)" },
    },
  });
}

async function reels(): Promise<Map<string, ReelInfo>> {
  const b = await base();
  if (!b.ok) return new Map();
  const epBy = new Map<string, { readonly e: Episode; readonly c: string }>(b.value.view.channels.flatMap((c) => c.episodes.flatMap((e): [string, { readonly e: Episode; readonly c: string }][] => [[`cand:${e.candidate ?? ""}`, { e, c: c.channel.id }], [`out:${e.candidate ?? ""}`, { e, c: c.channel.id }]])));
  return new Map<string, ReelInfo>(
    b.value.nodes
      .filter((n) => (n.kind === "reel" && n.stage === "run") || (n.kind === "reel-cut" && n.stage === "output"))
      .map((n): [string, ReelInfo] => [n.id, { node: n.id, kind: n.kind === "reel" ? "reel" : "reel-cut", label: n.label, channel: epBy.get(n.id)?.c ?? null, ep: epBy.get(n.id)?.e ?? null }]),
  );
}

export const fixtureCanvas: ServerCanvas = {
  view: async () => {
    const b = await base();
    return b.ok ? ok(b.value.view) : b;
  },
  verdicts: async (changes) => {
    const packets = new Set<string>();
    const b = await base();
    if (!b.ok) return b;
    for (const c of changes) {
      const n = b.value.nodes.find((x) => x.id === c.node);
      if (n === undefined) return err("not-found", `no node ${c.node}`);
      const p = pending.get(n.packet) ?? new Map<string, GraphNode["state"]>();
      p.set(n.id, c.verdict === "keep" ? "kept" : c.verdict === "reject" ? "rejected" : "open");
      pending.set(n.packet, p);
      packets.add(n.packet);
    }
    return ok({ packets: [...packets] });
  },
  undo: async (packet) => {
    const p = pending.get(packet);
    const last = p === undefined ? undefined : [...p.keys()].pop();
    if (p === undefined || last === undefined) return err("conflict", "nothing to undo in this packet");
    p.delete(last);
    return ok({ packet });
  },
  commit: async (packets) => {
    const done = packets.map((id) => {
      const p = pending.get(id) ?? new Map<string, GraphNode["state"]>();
      for (const [n, s] of p) decided.set(n, s);
      pending.delete(id);
      return { packet: id, kept: [...p.values()].filter((s) => s === "kept").length, rejected: [...p.values()].filter((s) => s === "rejected").length };
    });
    return ok({ packets: done });
  },
  note: async (d) => {
    if (d.text.trim() === "" && d.stance === "") return err("invalid", "a note says something: words, a stance, or both");
    notes = [...notes, { id: `n-fx-${++seq}`, kind: d.kind, key: d.key, name: d.name, text: d.text.trim(), stance: d.stance, at: new Date().toISOString() }];
    return ok({ notes });
  },
  unnote: async (id) => {
    notes = notes.filter((n) => n.id !== id);
    return ok({ notes });
  },
  goal: async (g) => {
    goal = g;
    return ok({ goal });
  },
  pause: async (group, paused) => ok({ paused: paused ? [group] : [] }),
  split: async (audience) => {
    const sum = Object.values(audience).reduce((a, b) => a + b, 0);
    return sum === 100 ? ok({ split: audience }) : err("invalid", `the split sums to ${sum}; it must sum to 100`);
  },
  audio: async (input) => {
    const r = step(road, input, await reels());
    if (!r.ok) return r;
    road = r.value;
    return ok(road);
  },
  ...fixtureProductions,
};
