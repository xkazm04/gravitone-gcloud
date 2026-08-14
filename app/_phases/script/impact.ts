// WHAT EACH RENDER ACTUALLY SPENT ON EACH PIECE OF RESEARCH.
//
// The attribution below maps a beat to the notebook cards that beat rests on.
// Hand-authored, but not invented: each entry is a beat whose TEXT states the
// claim, read against pipeline/runs/2026-08-11-.../script--*.md. A card is only
// attributed where the render says the thing — not where it merely could have.
//
// Seconds are COMPUTED from the beat timings (next beat's mark minus this one's,
// last beat to the render's duration), never typed in. That keeps the matrix
// honest when a beat moves: the numbers follow the script rather than a table
// somebody forgot to update.
//
// Three usage states, and the difference matters when you are deciding what to
// cut: `spoken` is screen time, `cut` is a deliberate exclusion the render
// recorded with a reason, and absence is absence — which for the conclusions is
// the finding, not an oversight.

import { RENDERS, RENDER_BY_ID } from "./renders";

/** beat mark → the card ids that beat states. */
type Attribution = Record<string, string[]>;

export const ATTRIBUTION: Record<string, Attribution> = {
  "reversal-chain": {
    "0:00": ["f-ath"],
    "0:12": ["f-sbr", "f-genius"],
    "0:30": ["f-drawdown", "f-now"],
    "0:40": ["m-institutionalisation"],
    "0:55": ["r1"],
    "1:20": ["r1", "f-etf-lag", "m-etf-plumbing"],
    "1:45": ["f-lth-distribution"],
    "2:05": ["m-treasury-flywheel", "f-mnav"],
    "2:50": ["r2", "f-mnav", "f-mstr-sold"],
    "3:15": ["steel-man", "f-mstr-defence", "f-supply-2pct"],
    "3:35": ["f-sbr"],
    "4:00": ["r3", "f-sbr-unbuilt"],
    "4:15": ["r4", "f-correlation", "f-yields", "m-institutionalisation"],
  },
  adjudication: {
    "0:00": ["f-ath", "f-drawdown"],
    "0:35": ["f-supply-2pct"],
    "1:15": ["r1", "f-etf-lag", "f-etf-absorbed", "m-etf-plumbing"],
    "2:00": ["r2", "f-mnav", "m-treasury-flywheel", "f-mstr-defence", "steel-man"],
    "2:50": ["f-yields", "f-macro-cause", "f-correlation"],
    "3:30": ["r4", "m-institutionalisation"],
  },
  "derived-short": {
    "0:00": ["r2"],
    "0:12": ["m-treasury-flywheel"],
    "0:24": ["f-mnav"],
    "0:31": ["f-mstr-sold"],
    "0:40": ["f-drawdown"],
  },
};

const toS = (mark: string) => {
  const [m, s] = mark.split(":").map(Number);
  return m * 60 + s;
};

/** How long each beat is on screen, from the marks themselves. */
function beatSeconds(renderId: string): Record<string, number> {
  const r = RENDER_BY_ID[renderId];
  const out: Record<string, number> = {};
  r.beats.forEach((b, i) => {
    const next = i + 1 < r.beats.length ? toS(r.beats[i + 1].at) : r.durationS;
    out[b.at] = Math.max(0, next - toS(b.at));
  });
  return out;
}

export type UsageKind = "spoken" | "cut" | "unused";

export interface Usage {
  kind: UsageKind;
  /** Seconds of screen time. 0 for cut and unused. */
  seconds: number;
  /** Which beats state it — the receipt for `seconds`. */
  beats: string[];
  /** Why it was cut. Only on `cut`. */
  why?: string;
}

/** renderId → cardId → usage. Built once. */
export const IMPACT: Record<string, Record<string, Usage>> = {};

for (const r of RENDERS) {
  const secs = beatSeconds(r.id);
  const map: Record<string, Usage> = {};
  for (const [mark, ids] of Object.entries(ATTRIBUTION[r.id] ?? {})) {
    for (const id of ids) {
      const prev = map[id];
      map[id] = {
        kind: "spoken",
        seconds: (prev?.seconds ?? 0) + (secs[mark] ?? 0),
        beats: [...(prev?.beats ?? []), mark],
      };
    }
  }
  for (const c of r.cutFacts) {
    // A cut is a decision, and it outranks nothing: a fact cannot be both
    // spoken and cut, and if the attribution says otherwise the attribution is
    // wrong, so let the cut win loudly rather than merge the two.
    map[c.factId] = { kind: "cut", seconds: 0, beats: [], why: c.why };
  }
  IMPACT[r.id] = map;
}

export function usageOf(renderId: string, cardId: string): Usage {
  return IMPACT[renderId]?.[cardId] ?? { kind: "unused", seconds: 0, beats: [] };
}

/** Share of the render's runtime spent on this card, 0–1. */
export function shareOf(renderId: string, cardId: string): number {
  const d = RENDER_BY_ID[renderId]?.durationS ?? 0;
  return d ? usageOf(renderId, cardId).seconds / d : 0;
}

/** Cut records naming a card the notebook no longer has.
 *
 *  Both mid-length renders cut `f-liquidity`, which follow-up round 1 then
 *  deleted outright. The decision was real and is worth keeping, but the row
 *  cannot be drawn against a card that does not exist — so it is reported here
 *  rather than silently dropped, exactly like a dangling constraint row. */
export function orphanedCuts(cardIds: Set<string>) {
  const out: { renderId: string; factId: string; why: string }[] = [];
  for (const r of RENDERS)
    for (const c of r.cutFacts)
      if (!cardIds.has(c.factId)) out.push({ renderId: r.id, factId: c.factId, why: c.why });
  return out;
}

/** Per-render rollup for a matrix header. */
export function coverage(renderId: string, cardIds: string[]) {
  const spoken = cardIds.filter((id) => usageOf(renderId, id).kind === "spoken");
  const cut = cardIds.filter((id) => usageOf(renderId, id).kind === "cut");
  const seconds = spoken.reduce((n, id) => n + usageOf(renderId, id).seconds, 0);
  return {
    spoken: spoken.length,
    cut: cut.length,
    unused: cardIds.length - spoken.length - cut.length,
    seconds,
    /** Runtime not attributed to any card — hooks, promises, closes. */
    unattributedS: Math.max(0, (RENDER_BY_ID[renderId]?.durationS ?? 0) - seconds),
  };
}

/** The baseline beat→cards map for one render. The model path re-derives every
 *  weight from the beats an edit plan produces, and starts from this. */
export const ATTRIBUTION_OF = (renderId: string): Attribution => ATTRIBUTION[renderId] ?? {};
