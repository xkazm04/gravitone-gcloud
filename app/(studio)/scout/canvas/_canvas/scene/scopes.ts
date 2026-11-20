// ANY POINT OF THE MAP NAMES A SET OF ITEMS - pure. A scope (a basin, a province, the headwaters, a river, a town, a
// port, a lot, a ship) is what a crumb, a weir, a search hit or the gallery opens on; an anchor is where a note for the
// next scouting is pinned, and anchorPoint finds it again on the map. Port of the winner's model.js scopes and notes.

import type { ScoutNote } from "../../_port/contract.ts";
import { BLOCK_KINDS, STAGE_NAME, STAGES, type AnchorKind, type BlockKind } from "../tables.ts";
import { cut, LW } from "./geo.ts";
import { riverY } from "./geometry.ts";
import type { Hit, Item, Pt, Scene, Scope } from "./types.ts";

export function itemsUnder(s: Scene, sc: Scope | null): readonly Item[] {
  if (sc === null) return s.items;
  switch (sc.type) {
    case "all":
      return s.items;
    case "basin":
    case "prov":
    case "bundle":
      return sc.ref.rivers.flatMap((x) => x.items);
    case "river":
    case "town":
      return sc.ref.items;
    case "port":
      return sc.ref.river.items;
    case "item":
      return [sc.ref];
    case "ship":
      return sc.ref.it === null ? [] : [sc.ref.it];
  }
}

const stageName = (si: number): string => {
  const st = STAGES[si];
  return st === undefined ? "" : STAGE_NAME[st];
};

export function scopeName(sc: Scope | null): string {
  if (sc === null) return "Studio";
  switch (sc.type) {
    case "all":
      return "Studio";
    case "basin":
      return sc.ref.name;
    case "prov":
      return `${sc.ref.basin.name} › ${sc.ref.name}`;
    case "bundle":
      return `${sc.ref.prov.name} headwaters`;
    case "river":
      return sc.ref.name;
    case "town":
      return `${sc.ref.river.chan !== null ? sc.ref.river.chan.id : sc.ref.river.name} › ${stageName(sc.ref.si)}`;
    case "port":
      return sc.ref.song || sc.ref.chan === null ? "Songs" : `${sc.ref.chan.id} · ${sc.ref.chan.name}`;
    case "item":
      return cut(sc.ref.label, 48);
    case "ship":
      return sc.ref.ep.title;
  }
}

export type BlocksUnder = Record<BlockKind, Item[]>;
export function blocksUnder(s: Scene, sc: Scope | null): BlocksUnder {
  const out: BlocksUnder = { verdict: [], seeds: [], audio: [], slot: [] };
  for (const it of itemsUnder(s, sc)) if (it.block !== null) out[it.block].push(it);
  return out;
}

/** The scope a hit or a selection stands for. */
export const scopeOf = (h: Hit | null): Scope => (h === null || h.type === "block" || h.type === "station" || h.type === "note" ? { type: "all" } : h);

export type BlockPoint = { readonly kind: BlockKind; readonly n: number; readonly scope: Extract<Scope, { type: "town" }> };

/** Every blocking point, in map order: the list `W` walks (kind first, the furthest stage first, north to south). */
export function blockPoints(s: Scene): BlockPoint[] {
  const out: BlockPoint[] = [];
  for (const r of s.rivers) for (const t of r.towns) for (const k of BLOCK_KINDS) if (t.blocks[k] > 0) out.push({ kind: k, n: t.blocks[k], scope: { type: "town", ref: t } });
  return out.sort((a, b) => BLOCK_KINDS.indexOf(a.kind) - BLOCK_KINDS.indexOf(b.kind) || b.scope.ref.si - a.scope.ref.si || a.scope.ref.y - b.scope.ref.y);
}

/** The episode an item serves: its own, or the nearest ancestor's. */
export function epFor(s: Scene, it: Item): Item["ep"] {
  let cur: Item | undefined = it;
  for (let guard = 0; cur !== undefined && cur.ep === null && guard < 6; guard++) cur = s.itemBy.get(s.up.get(cur.id)?.[0] ?? "");
  return cur?.ep ?? null;
}

export function chanFor(s: Scene, it: Item): string | null {
  if (it.chanId !== null) return it.chanId;
  const e = epFor(s, it);
  if (e !== null) return e.channel;
  return s.channels.find((c) => it.label.startsWith(c.name))?.id ?? null;
}

export type Anchor = { readonly kind: AnchorKind; readonly key: string; readonly name: string };

export function anchorOf(h: Hit | null): Anchor | null {
  if (h === null) return null;
  switch (h.type) {
    case "basin":
      return { kind: "basin", key: h.ref.key, name: h.ref.name };
    case "prov":
    case "bundle": {
      const p = h.type === "bundle" ? h.ref.prov : h.ref;
      return { kind: p.key === "chan" ? "channels" : "audience", key: `${p.basin.key}/${p.key}`, name: p.name + (p.basin.key === "video" ? "" : ` · ${p.basin.name}`) };
    }
    case "river": {
      const r = h.ref;
      if (r.chan !== null) return { kind: "channel", key: r.chan.id, name: r.name };
      return { kind: r.aud !== null ? "genre" : "nights", key: r.key, name: (r.aud !== null ? `${r.aud} / ` : "") + (r.dry ? "dry beds" : r.name) };
    }
    case "port":
      return h.ref.song || h.ref.chan === null ? { kind: "basin", key: "song", name: "Songs" } : { kind: "channel", key: h.ref.chan.id, name: `${h.ref.chan.id} · ${h.ref.chan.name}` };
    case "ship":
      return { kind: "channel", key: h.ref.chan.id, name: `${h.ref.chan.id} · ${h.ref.chan.name}` };
    case "town": {
      const r = h.ref.river;
      return { kind: "stage", key: `${r.key}@${h.ref.si}`, name: `${r.chan !== null ? r.chan.id : r.name} · ${stageName(h.ref.si)}` };
    }
    case "item":
      return { kind: "node", key: h.ref.id, name: cut(h.ref.label, 44) };
    default:
      return null;
  }
}

/** Where on the map a note's anchor stands (world space), or null when the anchor is gone. */
export function anchorPoint(s: Scene, a: Pick<ScoutNote, "kind" | "key">): Pt | null {
  switch (a.kind) {
    case "basin": {
      const b = s.basins.find((x) => x.key === a.key);
      return b === undefined ? null : [-150, b.y0 + 50];
    }
    case "audience":
    case "channels": {
      const [bk, pk] = a.key.split("/");
      const p = s.basins.find((x) => x.key === bk)?.provs.find((x) => x.key === pk);
      return p === undefined ? null : [-150, p.y0 + 18];
    }
    case "genre":
    case "nights": {
      const r = s.riverBy.get(a.key);
      return r === undefined ? null : [r.src + 70, riverY(r, r.src + 70)];
    }
    case "channel": {
      const port = s.chanById.get(a.key)?.port ?? null;
      return port === null ? null : [port.x - 26, port.y - 4];
    }
    case "stage": {
      const [rk, si] = a.key.split("@");
      const t = s.riverBy.get(rk ?? "")?.towns.find((x) => x.si === Number(si));
      return t === undefined ? null : [t.bx + t.bw + 4, t.by - 4];
    }
    case "node": {
      const it = s.itemBy.get(a.key);
      return it === undefined ? null : [it.x + LW - 3, it.y];
    }
  }
}

export const notesAt = (notes: readonly ScoutNote[], a: Anchor | null): ScoutNote[] => (a === null ? [] : notes.filter((n) => n.kind === a.kind && n.key === a.key));

/** A note as the next night's brief carries it. */
export const briefLine = (n: Pick<ScoutNote, "kind" | "name" | "stance" | "text">): string => `note[${n.kind} ${n.name}${n.stance !== "" ? ` · ${n.stance}` : ""}]${n.text !== "" ? `: ${n.text}` : ""}`;
