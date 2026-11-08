// THE FIXTURE'S KNOCKOUT FOLD (spark yue2-song-lab S2): the scripted side folds its own draws so the
// desk can be driven - a vote reveals and advances - with no store. It answers in the shape
// lib/yue2/draw.ts `bracketOf` answers in (Bracket, Match), so ./build.ts draws both sides alike:
// standard seeding (1 v 16, 8 v 9, ...), a missing seed is a bye and its opponent walks over,
// `release` decides, `neither` knocks out both and the next opponent walks over, the lower seed
// winning is an upset. A pair's id hashes its draw and its two takes, so a vote follows the pair
// through a reseed that keeps both entrants.
import { createHash } from "node:crypto";

import type { AbPair, AbVote } from "@gt/domain/audio.yue2";
import type { Draw, Match } from "@gt/domain/audio.yue2.lab";

import type { Bracket } from "../../../../../lib/yue2/draw.ts";
import { roundsOf } from "./build.ts";

const ORDER: Readonly<Record<8 | 16, readonly number[]>> = {
  16: [1, 16, 8, 9, 5, 12, 4, 13, 3, 14, 6, 11, 7, 10, 2, 15],
  8: [1, 8, 4, 5, 3, 6, 2, 7],
};

const hex = (s: string, n: number): string => createHash("sha1").update(s).digest("hex").slice(0, n);

export const fixtureDrawId = (field: string): string => hex(`fixture|${field}`, 12);
export const fixturePairId = (drawId: string, a: string, b: string): string => hex(`fixture|${drawId}|${[a, b].sort().join("|")}`, 16);

/** The pair as the fixture's agent booked it; its side is drawn from its id (fixed per pair). */
export function fixturePair(drawId: string, takeA: string, takeB: string): AbPair {
  const pairId = fixturePairId(drawId, takeA, takeB);
  return { pairId, source: "knockout", takeA, takeB, windowS: [0, 25], side: Number.parseInt(pairId.slice(0, 1), 16) % 2 === 0 ? "ab" : "ba" };
}

/** Which arm a take played as in its pair. */
export const armOf = (p: AbPair, takeId: string): "a" | "b" => ((p.side === "ab") === (takeId === p.takeA) ? "a" : "b");

type Feed = { readonly kind: "take"; readonly id: string } | { readonly kind: "gone" } | { readonly kind: "unknown" };

export function foldFixture(draw: Draw, votes: ReadonlyMap<string, AbVote>): Bracket {
  const bySeed = new Map(draw.entrants.map((e) => [e.seed, e.takeId]));
  const seedOf = new Map(draw.entrants.map((e) => [e.takeId, e.seed]));
  const rounds = roundsOf(draw.size);
  const matches: Match[] = [];
  let feeds: Feed[] = ORDER[draw.size].map((s): Feed => {
    const id = bySeed.get(s);
    return id === undefined ? { kind: "gone" } : { kind: "take", id };
  });
  for (const round of rounds) {
    const out: Feed[] = [];
    for (let i = 0; i < feeds.length; i += 2) {
      const slot = i / 2 + 1;
      const fa = feeds[i] ?? { kind: "gone" };
      const fb = feeds[i + 1] ?? { kind: "gone" };
      const base = { drawId: draw.drawId, round, slot };
      if (fa.kind === "take" && fb.kind === "take") {
        const pair = fixturePair(draw.drawId, fa.id, fb.id);
        const v = votes.get(pair.pairId);
        const m: Match = { ...base, pairId: pair.pairId, takeA: fa.id, takeB: fb.id };
        if (v === undefined) {
          matches.push(m);
          out.push({ kind: "unknown" });
        } else if (v.answers.release === "neither") {
          matches.push({ ...m, outcome: "neither" });
          out.push({ kind: "gone" });
        } else {
          const winner = armOf(pair, fa.id) === v.answers.release ? fa.id : fb.id;
          const loser = winner === fa.id ? fb.id : fa.id;
          matches.push({ ...m, winner, outcome: (seedOf.get(winner) ?? 0) > (seedOf.get(loser) ?? 0) ? "upset" : "won" });
          out.push({ kind: "take", id: winner });
        }
      } else if (fa.kind === "take" && fb.kind === "gone") {
        matches.push({ ...base, takeA: fa.id, winner: fa.id, outcome: "walkover" });
        out.push(fa);
      } else if (fb.kind === "take" && fa.kind === "gone") {
        matches.push({ ...base, takeB: fb.id, winner: fb.id, outcome: "walkover" });
        out.push(fb);
      } else {
        const one = fa.kind === "take" ? fa.id : fb.kind === "take" ? fb.id : undefined;
        matches.push({ ...base, ...(one === undefined ? {} : { takeA: one }) });
        out.push(fa.kind === "gone" && fb.kind === "gone" ? { kind: "gone" } : { kind: "unknown" });
      }
    }
    feeds = out;
  }
  const current = matches.find((m) => m.pairId !== undefined && m.outcome === undefined);
  const final = matches.find((m) => m.round === "F");
  const champion = final?.outcome === "won" || final?.outcome === "upset" || final?.outcome === "walkover" ? final.winner : undefined;
  return { draw, matches, ...(current === undefined ? {} : { current }), ...(champion === undefined ? {} : { champion }) };
}
