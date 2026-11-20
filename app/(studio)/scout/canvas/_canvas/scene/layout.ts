// WHERE EVERYTHING SITS - pure. A town is one street per night with its lots along it (the night's name in the gutter);
// a river is as tall as its tallest town; provinces stack inside a basin (channels first, then audiences, then the
// night piles); basins stack north to south (Songs, Generated video, Data reels). Each channel's port sits on the coast
// at its river's height with its episodes moored beside it as ships. Port of the winner's model.js layout.

import { FAMILIES, FAMILY_ORDER, WITH_PRODUCTIONS } from "../pipelines.ts";
import { STATE } from "../tables.ts";
import { clamp, coastX, COAST_X, GUT, hash, LH, LW, PX, PY, SEA_X, sx } from "./geo.ts";
import type { Material } from "./build.ts";
import type { Basin, Night, Port, Post, Province, ProvinceKey, River, Town, World } from "./types.ts";

const PROV_NAME: Readonly<Record<ProvinceKey, string>> = { songs: "Suno lane", chan: "Channels", adult: "Adult", family: "Family", kids: "Kids", early: "Early nights", archive: "Archive", prod: "Music clips" };
const PROV_ORDER: Readonly<Record<Basin["key"], readonly ProvinceKey[]>> = { song: ["songs"], video: ["chan", "adult", "family", "kids", "early", "archive"], reel: ["chan", "adult", "family", "kids", "early"], production: ["prod"] };

export function layoutTown(t: Town): void {
  const its = t.items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : STATE[a.state].ord - STATE[b.state].ord));
  // One street per night: lots along it, the night's name in the gutter.
  const groups: Night[] = [];
  for (const it of its) {
    const g = groups[groups.length - 1];
    if (g !== undefined && g.at === it.at) g.items.push(it);
    else groups.push({ at: it.at, items: [it], ry: 0 });
  }
  const cols = clamp(Math.max(1, ...groups.map((g) => g.items.length)), 1, 14);
  let y = 0;
  for (const g of groups) {
    g.ry = y;
    g.items.forEach((it, i) => {
      it.rx = GUT + (i % cols) * PX;
      it.ry = y + Math.floor(i / cols) * PY;
    });
    y += Math.ceil(g.items.length / cols) * PY;
  }
  t.cols = cols;
  t.bw = GUT + cols * PX - (PX - LW);
  t.bh = y - (PY - LH);
  t.nights = groups;
}

export const newBasins = (productions = false): Basin[] =>
  (productions ? WITH_PRODUCTIONS : FAMILY_ORDER).map((key) => ({ key, name: FAMILIES[key].name, fam: FAMILIES[key], provs: [], rivers: [], blocks: { verdict: 0, seeds: 0, audio: 0, slot: 0, n: 0 }, live: 0, open: 0, failed: 0, pending: 0, kept: 0, outputs: 0, y0: 0, y1: 0 }));

const byOrder = (a: River, c: River): number =>
  (a.synthetic ? -1 : c.synthetic ? 1 : 0) || (a.dry ? 1 : 0) - (c.dry ? 1 : 0) || (a.chan !== null && c.chan !== null ? a.chan.id.localeCompare(c.chan.id) : 0) || c.reach - a.reach || c.live - a.live;

/** Stacks basins, provinces and rivers; places towns and lots. Answers the bottom of the land. Reaches must be counted. */
export function layoutWorld(m: Material, basins: Basin[]): number {
  for (const r of m.rivers) for (const t of r.towns) layoutTown(t);
  for (const c of m.channels) c.shipRows = Math.ceil(c.episodes.length / 3);
  let Y = 0;
  for (const b of basins) {
    b.y0 = Y;
    Y += 104;
    for (const pk of PROV_ORDER[b.key]) {
      const rs = m.rivers.filter((r) => r.basin === b.key && r.prov === pk).sort(byOrder);
      if (rs.length === 0) continue;
      const p: Province = { key: pk, basin: b, name: PROV_NAME[pk], rivers: rs, y0: Y, y1: 0, bundle: null, blocks: { verdict: 0, seeds: 0, audio: 0, slot: 0, n: 0 } };
      Y += 30;
      for (const r of rs) {
        let h = 44;
        for (const t of r.towns) h = Math.max(h, t.bh + 30);
        if (r.chan !== null) h = Math.max(h, r.chan.shipRows * PY + 34, 60);
        if (r.synthetic) h = 92;
        r.province = p;
        r.y0 = Y;
        r.h = h;
        r.cy = Y + h / 2;
        Y += h;
        r.amp = Math.min(9, h * 0.1);
        r.ph = hash(r.key) * 6.28;
        for (const t of r.towns) {
          t.x = sx(t.si);
          t.y = r.cy;
          t.bx = t.x - t.bw / 2;
          t.by = r.cy - t.bh / 2;
          for (const it of t.items) {
            it.x = t.bx + it.rx;
            it.y = t.by + it.ry;
          }
        }
      }
      // The headwaters: genres whose live work never got past the derived seeds.
      const head = rs.filter((r) => r.aud !== null && !r.dry && r.reach >= 0 && r.reach <= 1);
      const first = head[0];
      const last = head[head.length - 1];
      if (head.length >= 2 && first !== undefined && last !== undefined) p.bundle = { prov: p, rivers: head, y0: first.y0, y1: last.y0 + last.h, x: sx(Math.max(...head.map((r) => r.reach))) };
      p.y1 = Y;
      Y += 14;
      b.provs.push(p);
    }
    b.y1 = Y;
    Y += 80;
  }
  return Y;
}

export const worldOf = (bottom: number): World => ({ x0: -980, y0: -60, x1: SEA_X + 330, y1: bottom });

/** Ports on the coast with their ships, the song pipeline's port, and the song river's stations. */
export function layoutPorts(m: Material): Port[] {
  const ports: Port[] = [];
  for (const c of m.channels) {
    const r = m.riverBy.get(`chan:${c.id}`);
    if (r === undefined) continue;
    const y = r.cy;
    const x = coastX(y);
    const p: Port = { chan: c, song: false, x, y, river: r, ships: [] };
    c.episodes.forEach((e, i) => {
      const it = m.itemBy.get(`cand:${e.candidate ?? ""}`) ?? m.itemBy.get(`ep:${e.id}`) ?? null;
      p.ships.push({ ep: e, chan: c, it, x: x + 44 + (i % 3) * 32, y: y - (c.shipRows * PY) / 2 + Math.floor(i / 3) * PY, label: e.title });
    });
    c.port = p;
    ports.push(p);
  }
  const sr = m.songRiver;
  ports.push({ chan: null, song: true, x: coastX(sr.cy), y: sr.cy, river: sr, ships: [] });
  sr.stationPts = FAMILIES.song.stations.map((s) => ({ s, x: s.id === "publish" ? coastX(sr.cy) : sx(s.x), y: sr.cy, fam: "song" as const }));
  for (const r of m.rivers) if (r.prod !== null) r.stationPts = FAMILIES.production.stations.map((s) => ({ s, x: sx(s.x), y: r.cy, fam: "production" as const }));
  return ports;
}

/** Milestone posts along each basin's top edge: the family's stations. */
export const layoutPosts = (basins: readonly Basin[]): Post[] =>
  basins.flatMap((b) => b.fam.stations.map((s) => ({ s, b, x: s.id === "publish" ? COAST_X : sx(s.x), y: b.y0 + 74, fam: b.key })));
