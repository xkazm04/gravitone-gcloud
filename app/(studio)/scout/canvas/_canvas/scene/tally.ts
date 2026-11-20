// WHAT WAITS ON THE OPERATOR, AND HOW EACH RIVER STANDS - pure, in place, recounted after every change (1,240 items:
// nothing). A node waiting on a verdict is a `verdict` weir (a seed's a `seeds` weir); a kept reel whose road to the
// calendar is not done is an `audio` weir until its cut is laid, then a `slot` weir. A reel strip whose full cut is
// already kept is superseded by it and waits on nothing. Port of the winner's model.js recount.

import { BLOCK_KINDS, CHAIN_DONE, STATE, zeroBlocks, type BlockCounts, type BlockKind } from "../tables.ts";
import { sum } from "./geo.ts";
import { isLive } from "./build.ts";
import type { Basin, Item, River } from "./types.ts";

type Ctx = { readonly down: ReadonlyMap<string, readonly string[]>; readonly itemBy: ReadonlyMap<string, Item> };

const superseded = (it: Item, c: Ctx): boolean =>
  it.node?.kind === "reel" && (c.down.get(it.id) ?? []).some((d) => {
    const x = c.itemBy.get(d);
    return x !== undefined && x.audio !== null && x.state === "kept";
  });

export function blockKind(it: Item, c: Ctx): BlockKind | null {
  if (STATE[it.state].waits) return it.node?.kind === "seed" ? "seeds" : "verdict";
  if (it.audio !== null && it.state === "kept" && !superseded(it, c)) {
    if (it.audio.step >= CHAIN_DONE) return null;
    return it.audio.step >= CHAIN_DONE - 1 ? "slot" : "audio";
  }
  return null;
}

const addInto = (a: BlockCounts, b: BlockCounts): void => {
  for (const k of BLOCK_KINDS) a[k] += b[k];
  a.n += b.n;
};

/** The river's live work and its verdict history, its towns' counts, and the blocks. `recent`: from this night on. */
function recountRiver(r: River, c: Ctx, recentFrom: string): void {
  Object.assign(r, { live: 0, dead: 0, open: 0, pending: 0, failed: 0, kept: 0, rejected: 0, recent: 0, blocks: zeroBlocks() });
  for (const t of r.towns) {
    t.c = {};
    t.n = t.items.length;
    t.blocks = zeroBlocks();
  }
  for (const it of r.items) {
    const s = it.state;
    const t = it.town;
    if (isLive(it)) r.live++;
    else r.dead++;
    if (s === "open" || s === "made") r.open++;
    else if (s === "pending") r.pending++;
    else if (s === "failed") r.failed++;
    else if (s === "kept") r.kept++;
    else if (s === "rejected" || s === "thrown") r.rejected++;
    if (it.at >= recentFrom || s === "pending") r.recent++;
    t.c[s] = (t.c[s] ?? 0) + 1;
    const k = blockKind(it, c);
    it.block = k;
    if (k !== null) {
      r.blocks[k]++;
      r.blocks.n++;
      t.blocks[k]++;
      t.blocks.n++;
    }
  }
  const liveTowns = r.towns.filter((t) => t.items.some(isLive));
  r.reach = liveTowns.length > 0 ? (liveTowns[liveTowns.length - 1]?.si ?? -1) : -1;
  r.extent = r.towns.length > 0 ? (r.towns[r.towns.length - 1]?.si ?? 0) : 0;
  if (r.synthetic) {
    r.reach = 6.5;
    r.live = 0;
  }
  // Verdict history: what share of decided work was kept. The honest signal of a river worth following.
  r.decided = r.kept + r.rejected + r.failed;
  r.rate = r.decided > 0 ? r.kept / r.decided : 0;
  r.score = r.decided >= 4 && !r.night && !r.synthetic ? r.kept * r.rate * (1 + Math.max(0, r.reach)) : 0;
}

/** Everything, in place: rivers, the five worth following, the basins and provinces, the studio total. */
export function recount(rivers: readonly River[], basins: readonly Basin[], c: Ctx, recentFrom: string): BlockCounts {
  for (const r of rivers) recountRiver(r, c, recentFrom);
  const ranked = rivers.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  for (const r of rivers) r.rank = 0;
  ranked.slice(0, 5).forEach((r, i) => {
    r.rank = i + 1;
  });
  const total = zeroBlocks();
  for (const b of basins) {
    const rs = (b.rivers = rivers.filter((r) => r.basin === b.key));
    b.blocks = zeroBlocks();
    for (const r of rs) addInto(b.blocks, r.blocks);
    b.live = sum(rs, (r) => r.live);
    b.open = sum(rs, (r) => r.open);
    b.failed = sum(rs, (r) => r.failed);
    b.pending = sum(rs, (r) => r.pending);
    b.kept = sum(rs, (r) => r.kept);
    b.outputs = sum(rs, (r) => r.items.filter((it) => it.si === 5 && it.state === "kept").length);
    for (const p of b.provs) {
      p.blocks = zeroBlocks();
      for (const r of p.rivers) addInto(p.blocks, r.blocks);
    }
    addInto(total, b.blocks);
  }
  return total;
}
