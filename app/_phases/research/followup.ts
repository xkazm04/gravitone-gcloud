// Follow-up research: what comes back when a card is deepened or a question asked.
//
// These two results are REAL — run in the terminal on 2026-08-11 against the same
// notebook, not invented for the prototype. They are here because they demonstrate
// the two outcomes that matter and are easy to forget when designing this surface:
//
//   · a deepen can KILL a fact rather than confirm it (f-liquidity)
//   · a question can RESOLVE an open unknown and add evidence (the whale question)
//
// A follow-up UI that only knows how to render "here is more" is wrong.

export type FollowUpKind = "deepen-card" | "question";

/** What a returned result does to the notebook. */
export type Effect =
  | { kind: "confirms"; targetId: string; note: string }
  | { kind: "downgrades"; targetId: string; note: string }
  | { kind: "kills"; targetId: string; note: string }
  | { kind: "resolves-unknown"; targetId: string; note: string }
  | { kind: "adds-fact"; factId: string; claim: string; confidence: "high" | "medium" | "low"; source: string; note?: string };

export interface FollowUpRequest {
  id: string;
  kind: FollowUpKind;
  /** For deepen-card. */
  cardId?: string;
  /** The question, or the auto-written reason a card was queued. */
  prompt: string;
  /** Where the system itself suggested the reason. */
  systemReason?: string;
  status: "queued" | "running" | "returned";
  result?: FollowUpResult;
}

export interface FollowUpResult {
  summary: string;
  effects: Effect[];
  sources: string[];
  /** Stated because a follow-up that only confirms is the suspicious kind. */
  verdict: "strengthened" | "weakened" | "resolved" | "inconclusive";
}

/* ------------------------------------------------------------------ the two real results */

export const CANNED: Record<string, FollowUpResult> = {
  /** Deepen on f-liquidity — load-bearing at LOW confidence, the notebook's own danger flag. */
  "f-liquidity": {
    verdict: "weakened",
    summary:
      "The 93% / 7.6x figure still traces to a single vendor (Keyrock) and is not independently corroborated. Worse for the claim: the relationship it describes has broken down in exactly the window this script covers — by Q4 2025, global M2 grew more than 12% while Bitcoin fell roughly 12%. Independent work (CF Benchmarks) finds month-to-month M2/BTC correlation is weak and only strengthens over 6-24 month horizons.",
    effects: [
      { kind: "kills", targetId: "f-liquidity",
        note: "Still single-sourced after a second search. It was already cut from both renders; this closes it rather than leaving it as a temptation." },
      { kind: "adds-fact", factId: "f-m2-divergence",
        claim: "Global M2 grew more than 12% over the last twelve months while Bitcoin fell roughly 12% — the liquidity relationship broke down through 2026",
        confidence: "medium", source: "CF Benchmarks; Onramp research",
        note: "STRONGER than the fact it replaces, and it argues the same thesis: an asset that stopped responding to liquidity is an asset being managed as a position." },
    ],
    sources: [
      "https://www.cfbenchmarks.com/blog/the-m2-bitcoin-relationship-what-the-data-actually-shows",
      "https://onrampbitcoin.com/research/bitcoins-macro-liquidity-cycle",
    ],
  },

  /** The typed question about on-chain whale behaviour. */
  "q-whales": {
    verdict: "resolved",
    summary:
      "Yes — and it resolves the notebook's open contradiction. The accumulation and the distribution are DIFFERENT COHORTS. Wallets over 1,000 BTC absorbed roughly 270,000 BTC in 30 days to 23 April, and CryptoQuant tracked a similar figure again in late June/early July while price fell below $58,000. But mid-sized holders of 100-1,000 BTC distributed about 77,800 BTC over the same 60-day window — slightly MORE than the whales absorbed — and retail wallets distributed too. Heavy whale buying and a falling price are consistent because the buying is being met.",
    effects: [
      { kind: "resolves-unknown", targetId: "u-oncchain-contradiction",
        note: "The 380k accumulation and the 3.67m distribution are not in conflict: they describe different cohorts on different clocks. The notebook's instruction to present them as 'competing readings' can be replaced with the actual answer." },
      { kind: "adds-fact", factId: "f-whale-absorb",
        claim: "Wallets holding over 1,000 BTC accumulated roughly 270,000 BTC in the 30 days to 23 April 2026, and again over a fortnight in late June/early July while price fell below $58,000",
        confidence: "medium", source: "CryptoQuant via aggregators" },
      { kind: "adds-fact", factId: "f-midtier-distribute",
        claim: "Holders of 100-1,000 BTC distributed about 77,800 BTC over the same 60-day window — slightly more than the whale cohort absorbed",
        confidence: "medium", source: "on-chain cohort analysis via aggregators",
        note: "THE answer to the question. Whale accumulation is real AND cancelled out." },
      { kind: "confirms", targetId: "f-supply-2pct",
        note: "The accumulation in the steel-man is corroborated — but it is now clear it was one cohort, not the market." },
    ],
    sources: [
      "https://www.cryptoseyes.com/insights/whale-accumulation-270k-btc-april-2026/",
      "https://www.cryptopolitan.com/this-btc-cohort-has-the-fastest-accumulation-rate-in-2026/",
      "https://bgeometrics.com/blog/2026-06-bitcoin-2026-whale-accumulation-onchain-cohorts/",
    ],
  },
};

/** The system writes the reason where it can infer one, so a creator queueing a
 *  card does not have to articulate what the notebook already knows. */
export function suggestedReason(card: {
  loadBearing?: boolean;
  confidence?: string;
  kind: string;
}): string | undefined {
  if (card.loadBearing && card.confidence === "low")
    return "Load-bearing at low confidence — the notebook already flags this as needing a second source before any script may state it.";
  if (card.confidence === "low") return "Low confidence — a second source would decide whether it can be used at all.";
  if (card.kind === "reversal") return "A turn is only as strong as its weakest evidence.";
  return undefined;
}

/** Matches a typed question to a canned result. Prototype only — a real run
 *  dispatches the question to the research process. */
export function matchQuestion(q: string): string | null {
  const s = q.toLowerCase();
  if (/whale|on.?chain|cohort|holder/.test(s)) return "q-whales";
  return null;
}
