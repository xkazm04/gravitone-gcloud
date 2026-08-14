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
// A CARD OWNS A SHARE OF ITS BEAT, NOT ALL OF IT. A beat that rests on three
// cards is not three beats: its seconds are SPLIT across them (`splitAcross`
// below), so attributed time sums to the runtime it came from. Crediting the
// full duration to each card summed to a multiple of the runtime — 1.96x on the
// reversal chain, 2.80x on the adjudication — and `budgetOf` then reported both
// as hundreds of seconds "over budget" while the engine's own summary said the
// script over-ran by about ten. The baseline was inflated by the same factor as
// the candidate, so the two errors hid each other in the delta.
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

/** ONE BEAT'S SECONDS, SPLIT ACROSS THE CARDS IT RESTS ON.
 *
 *  EQUAL SHARES, and that is a decision rather than the absence of one. Nothing
 *  in this app claims the order of a beat's card list means anything: the tables
 *  above are hand-authored in reading order, `EDIT_PLAN_SCHEMA` asks the engine
 *  for card ids and never for a primary, and RECALIBRATE-PROMPT.md nowhere says
 *  the first one leads. Weighting by position would therefore be inventing a
 *  signal to spend it — the exact move that produced the number this replaces.
 *  If a primary ever gets declared, this is the one function that changes.
 *
 *  Largest remainder, so the parts sum EXACTLY to the beat. Rounding each share
 *  independently would put the arithmetic error back, smaller and harder to see;
 *  the leftover second going to the earlier ids is a deterministic tie-break and
 *  says nothing about which card matters more. */
export function splitAcross(seconds: number, cards: number): number[] {
  if (cards <= 0) return [];
  const whole = Math.max(0, Math.round(seconds));
  const base = Math.floor(whole / cards);
  let rem = whole - base * cards;
  return Array.from({ length: cards }, () => base + (rem-- > 0 ? 1 : 0));
}

export type UsageKind = "spoken" | "cut" | "unused";

export interface Usage {
  kind: UsageKind;
  /** This card's SHARE of the screen time of the beats that state it — a beat's
   *  seconds divided among the cards it rests on, never replicated per card.
   *  0 for cut and unused. */
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
    const shares = splitAcross(secs[mark] ?? 0, ids.length);
    ids.forEach((id, i) => {
      const prev = map[id];
      map[id] = {
        kind: "spoken",
        seconds: (prev?.seconds ?? 0) + shares[i],
        beats: [...(prev?.beats ?? []), mark],
      };
    });
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
