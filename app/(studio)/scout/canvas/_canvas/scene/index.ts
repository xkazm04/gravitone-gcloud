// THE SCENE - one CanvasView into the whole territory, pure: the material (./build.ts), counted (./tally.ts), laid out
// (./layout.ts), the water and the land (./geometry.ts). `rescene` recounts and rebuilds the rivers a change touched;
// the client store calls it after an optimistic verdict or an audio step.

import type { Production } from "@gt/domain/productionGraph";

import type { CanvasView } from "../../_port/contract.ts";
import { material } from "./build.ts";
import { buildLand, buildRiver } from "./geometry.ts";
import { layoutPorts, layoutPosts, layoutWorld, newBasins, worldOf } from "./layout.ts";
import { recount } from "./tally.ts";
import type { Item, River, Scene } from "./types.ts";

/** Work from this night on counts as recent (the particles that run on a river). */
const recentFrom = (latest: string): string => {
  const d = new Date(`${latest.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return latest;
  d.setUTCDate(d.getUTCDate() - 6);
  return d.toISOString().slice(0, 10);
};

export function buildScene(view: CanvasView, productions: readonly Production[] = []): Scene {
  const m = material(view, productions);
  const basins = newBasins(productions.length > 0);
  const ctx = { down: m.down, itemBy: m.itemBy };
  const recent = recentFrom(m.latest);
  // Counted before the layout (a province orders its rivers by reach) and again after it.
  recount(m.rivers, basins, ctx, recent);
  const bottom = layoutWorld(m, basins);
  const total = recount(m.rivers, basins, ctx, recent);
  const world = worldOf(bottom);
  const ports = layoutPorts(m);
  for (const r of m.rivers) buildRiver(r);
  const edges: (readonly [Item, Item])[] = [];
  for (const e of view.graph.edges) {
    const a = m.itemBy.get(e.from);
    const b = m.itemBy.get(e.to);
    if (a !== undefined && b !== undefined) edges.push([a, b]);
  }
  return {
    items: m.items, itemBy: m.itemBy, rivers: m.rivers, riverBy: m.riverBy, basins, channels: m.channels, chanById: m.chanById,
    ports, posts: layoutPosts(basins), reels: m.items.filter((it) => it.audio !== null), songRiver: m.songRiver,
    up: m.up, down: m.down, edges, latest: m.latest, world, land: buildLand(world, bottom), total,
  };
}

/** After a change: every tally recounted, the touched rivers' water rebuilt. */
export function rescene(s: Scene, touched: readonly River[]): void {
  s.total = recount(s.rivers, s.basins, { down: s.down, itemBy: s.itemBy }, recentFrom(s.latest));
  for (const r of new Set(touched)) buildRiver(r);
}

export type { Scene } from "./types.ts";
