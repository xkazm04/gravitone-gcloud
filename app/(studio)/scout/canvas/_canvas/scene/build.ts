// THE MATERIAL INTO A TERRITORY - pure. Every graph node becomes a lot on a river: a node with an audience flows in its
// genre's river (music into the Suno lane, data explainers into the reel basin), a node a channel's episode came from
// flows in that channel's river (and so does what grew from it), the rest pile into the early or archive nights. An
// episode no night took yet is an outline lot on its channel's river. Port of the winner's model.js material half.

import type { GraphNode } from "@gt/domain/scoutGraph";
import type { Episode } from "@gt/domain/channel";

import type { CanvasView } from "../../_port/contract.ts";
import type { FamilyKey } from "../pipelines.ts";
import { isItemState, STAGES, STATE, zeroBlocks, type ItemState, type Stage } from "../tables.ts";
import { sx, SRC_X } from "./geo.ts";
import type { Item, ItemAudio, ProvinceKey, River, Town } from "./types.ts";

export type Chan = NonNullable<River["chan"]>;

export type Material = {
  readonly items: Item[];
  readonly itemBy: Map<string, Item>;
  readonly rivers: River[];
  readonly riverBy: Map<string, River>;
  readonly channels: Chan[];
  readonly chanById: Map<string, Chan>;
  readonly up: Map<string, string[]>;
  readonly down: Map<string, string[]>;
  readonly songRiver: River;
  readonly latest: string;
};

type RiverSeed = { basin: FamilyKey; prov: ProvinceKey; name: string; aud?: string; genre?: string; group?: string; chan?: Chan; night?: boolean; dry?: boolean; synthetic?: boolean };

function newRiver(key: string, o: RiverSeed): River {
  return {
    key, basin: o.basin, prov: o.prov, name: o.name, aud: o.aud ?? null, genre: o.genre ?? null, group: o.group ?? null, chan: o.chan ?? null,
    night: o.night === true, dry: o.dry === true, genres: [], synthetic: o.synthetic === true, items: [], towns: [], paused: false, src: SRC_X,
    live: 0, dead: 0, open: 0, pending: 0, failed: 0, kept: 0, rejected: 0, recent: 0, blocks: zeroBlocks(), reach: -1, extent: 0, decided: 0, rate: 0, score: 0, rank: 0,
    province: null, y0: 0, h: 0, cy: 0, amp: 0, ph: 0, pts: [], endX: 0, dryPts: null, canal: null, stationPts: [],
  };
}

/** A town until the river's towns are cut: every item is re-homed into its stage's town below. */
const unplaced = (r: River): Town => ({ river: r, si: -1, items: [], c: {}, n: 0, blocks: zeroBlocks(), cols: 1, bw: 0, bh: 0, nights: [], x: 0, y: 0, bx: 0, by: 0 });

const push = <K, V>(m: Map<K, V[]>, k: K, v: V): void => {
  const xs = m.get(k);
  if (xs === undefined) m.set(k, [v]);
  else xs.push(v);
};

export const isLive = (it: Pick<Item, "state">): boolean => STATE[it.state].live;
const isReelFilm = (n: GraphNode): boolean => (n.kind === "reel" && n.stage === "run") || (n.kind === "reel-cut" && n.stage === "output");
const stateOf = (s: string): ItemState => (isItemState(s) ? s : "open");
const stageIx = (s: Stage): number => STAGES.indexOf(s);

function audioOf(view: CanvasView, id: string): ItemAudio {
  const a = view.audio[id];
  const slot = view.slots.find((s) => s.node === id && s.state !== "cancelled") ?? null;
  return { step: a?.step ?? 0, brief: a?.brief ?? null, decision: a?.decision ?? null, channel: a?.channel ?? null, slot, run: null, queue: [] };
}

export function material(view: CanvasView): Material {
  const g = view.graph;
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  for (const e of g.edges) {
    push(down, e.from, e.to);
    push(up, e.to, e.from);
  }
  const channels: Chan[] = view.channels.map((c) => ({ ...c.channel, episodes: c.episodes, port: null, shipRows: 0 }));
  const chanById = new Map(channels.map((c) => [c.id, c]));
  const epByCand = new Map<string, Episode>();
  const chanOf = new Map<string, string>();
  for (const c of channels) for (const e of c.episodes) if (e.candidate !== undefined) {
    epByCand.set(`cand:${e.candidate}`, e);
    chanOf.set(`cand:${e.candidate}`, c.id);
  }
  // What grew from a channel's candidate without a seed of its own flows in the channel's river too.
  const q = [...chanOf.keys()];
  while (q.length > 0) {
    const id = q.pop() as string;
    for (const d of down.get(id) ?? []) {
      const dn = byId.get(d);
      if (!chanOf.has(d) && dn !== undefined && dn.audience === undefined) {
        chanOf.set(d, chanOf.get(id) as string);
        q.push(d);
      }
    }
  }
  const nights = [...new Set(g.nodes.map((n) => n.at))].sort();
  const latest = g.open.night !== undefined ? g.open.night.packet.replace("pkt:scout:", "") : (nights[nights.length - 1] ?? "");

  const rivers: River[] = [];
  const riverBy = new Map<string, River>();
  const river = (key: string, o: RiverSeed): River => {
    const had = riverBy.get(key);
    if (had !== undefined) return had;
    const r = newRiver(key, o);
    rivers.push(r);
    riverBy.set(key, r);
    return r;
  };
  const items: Item[] = [];
  const itemBy = new Map<string, Item>();
  const add = (r: River, it: Omit<Item, "river" | "town" | "block" | "rx" | "ry" | "x" | "y">): void => {
    const full: Item = { ...it, river: r, town: unplaced(r), block: null, rx: 0, ry: 0, x: 0, y: 0 };
    r.items.push(full);
    items.push(full);
    itemBy.set(full.id, full);
  };
  const chanRiver = (c: Chan): River => river(`chan:${c.id}`, { basin: c.medium === "reel" ? "reel" : "video", prov: "chan", name: `${c.id} · ${c.name}`, chan: c });

  for (const n of g.nodes) {
    let r: River;
    const cid = chanOf.get(n.id);
    if (n.audience !== undefined) {
      const a = n.audience;
      if (n.genre === "music") r = river(`song:${a}/music`, { basin: "song", prov: "songs", name: `${a} · music`, aud: a, genre: "music", group: `${a}/music` });
      else if (n.genre === "data explainer") r = river(`reel:${a}`, { basin: "reel", prov: a as ProvinceKey, name: "data explainer", aud: a, genre: n.genre, group: `${a}/data explainer` });
      else r = river(`video:${a}/${n.genre ?? ""}`, { basin: "video", prov: a as ProvinceKey, name: n.genre ?? a, aud: a, ...(n.genre === undefined ? {} : { genre: n.genre }), group: `${a}/${n.genre ?? ""}` });
    } else if (cid !== undefined && chanById.has(cid)) {
      r = chanRiver(chanById.get(cid) as Chan);
    } else {
      const f: FamilyKey = n.kind === "reel" || n.kind === "reel-cut" ? "reel" : "video";
      const archive = n.archive === true || n.wing === "muse";
      const prov: ProvinceKey = archive ? "archive" : "early";
      r = river(`${f}:${prov}`, { basin: f, prov, name: archive ? "archive nights" : "early nights", night: true });
    }
    const chanId = cid ?? null;
    const cn = chanId === null ? null : `${chanById.get(chanId)?.name ?? ""}: `;
    add(r, {
      id: n.id, node: n, label: n.label, short: cn !== null && n.label.startsWith(cn) ? n.label.slice(cn.length) : null,
      state: n.paused === true ? "paused" : stateOf(n.state), at: n.at, si: stageIx(n.stage), ep: epByCand.get(n.id) ?? null,
      media: view.media[n.id] ?? null, chanId, outline: false, audio: isReelFilm(n) ? audioOf(view, n.id) : null,
    });
  }
  for (const c of channels) {
    chanRiver(c);
    for (const e of c.episodes) if (e.candidate === undefined) {
      add(chanRiver(c), { id: `ep:${e.id}`, node: null, label: `${e.title} — ${e.logline}`, short: null, state: stateOf(e.state), at: e.at.slice(0, 10), si: 2, ep: e, media: null, chanId: c.id, outline: true, audio: null });
    }
  }
  // Rivers that never held a live node merge into one dry bed per audience.
  for (const r of rivers.slice()) {
    if (r.basin === "video" && r.aud !== null && !r.items.some(isLive)) {
      const d = river(`video:${r.aud}/dry`, { basin: "video", prov: r.aud as ProvinceKey, name: "dry beds", aud: r.aud, dry: true });
      d.genres.push(r.name);
      for (const it of r.items) {
        it.river = d;
        d.items.push(it);
      }
      rivers.splice(rivers.indexOf(r), 1);
      riverBy.delete(r.key);
    }
  }
  const songRiver = river("song:pipeline", { basin: "song", prov: "songs", name: "Suno v6 → film", synthetic: true });
  for (const r of rivers) {
    if (r.group !== null) {
      const grp = g.groups.find((x) => x.key === r.group);
      if (grp !== undefined) r.paused = grp.paused === true;
    }
    if (r.dry) r.name = `dry beds · ${r.genres.join(", ")}`;
    const bySi = new Map<number, Item[]>();
    for (const it of r.items) push(bySi, it.si, it);
    r.towns = [...bySi.keys()].sort((a, b) => a - b).map((si) => ({ river: r, si, items: bySi.get(si) as Item[], c: {}, n: 0, blocks: zeroBlocks(), cols: 1, bw: 0, bh: 0, nights: [], x: 0, y: 0, bx: 0, by: 0 }));
    for (const t of r.towns) for (const it of t.items) it.town = t;
    // Channels and early nights did not grow from seeds: their spring rises mid-country.
    const first = r.towns[0];
    r.src = r.aud === null && !r.synthetic ? (first !== undefined ? sx(first.si) - 230 : sx(2) - 230) : SRC_X;
  }
  return { items, itemBy, rivers, riverBy, channels, chanById, up, down, songRiver, latest };
}
