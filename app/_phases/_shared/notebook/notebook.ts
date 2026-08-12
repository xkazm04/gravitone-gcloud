// The notebook fixture — run 1, verbatim from
// pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/notebook.json,
// revised by follow-up round 1.
//
// Real content on purpose: a prototype fed lorem cannot be evaluated. 21 facts,
// 3 mechanisms, 4 reversals — which is exactly why the surface that shows it
// must be a modal that scrolls, not a page section that overflows.

import { FACTS } from "./facts";
import { UNKNOWNS } from "./unknowns";
import type { Notebook } from "./types";

export const NOTEBOOK: Notebook = {
  id: "why-bitcoin-price-does-not-rise",
  topic: "Why Bitcoin price does not rise",
  question: "Bitcoin got everything it spent fifteen years asking for. Why is it down 50%?",
  verdict:
    "Because it got what it asked for. Institutional adoption was supposed to be the demand engine; instead it turned Bitcoin into an ordinary risk asset — correlated, liquidity-sensitive, and owned by people who sell when yields rise.",
  researched: "2026-08-11",
  researcher: "claude-opus-5 · local CLI · WebSearch",
  templateIntent: "mid-educational-video",
  subjectDomain: ["economy", "politics", "tech"],

  tension: {
    expectation:
      "Spot ETFs, a Strategic Bitcoin Reserve, friendly regulators, corporate treasuries and retirement-account access were the entire bull case. All of them happened.",
    reality:
      "Bitcoin peaked at $126,198 on 2025-10-06 and trades near $60–65k in August 2026 — down roughly 50%.",
    whyItIsATension:
      "The causal story everyone held (adoption → demand → price) ran forward exactly as predicted and produced the opposite outcome. That is not a disappointment, it is a broken model, and a broken model is the only thing worth 5 minutes.",
    strength: "high — the premise is checkable, widely believed, and demonstrably wrong",
  },

  facts: FACTS,

  mechanisms: [
    {
      id: "m-etf-plumbing",
      name: "An ETF inflow is not a purchase",
      chain: [
        "A dollar enters a spot bitcoin ETF",
        "THEREFORE the market reads it as new demand",
        "BUT authorised participants can create and short ETF shares before buying the underlying",
        "THEREFORE the buying is lagged and partly hedged",
        "AND sellers at the same price level absorb what does arrive",
        "THEREFORE inflow can be positive while price is flat",
      ],
      explains: "Why 'record inflows' headlines coexist with a flat chart",
      needsAnalogy: true,
    },
    {
      id: "m-treasury-flywheel",
      name: "The flywheel that only turns one way",
      chain: [
        "A treasury company's stock trades above the bitcoin it holds (mNAV > 1)",
        "THEREFORE it can issue equity and buy more bitcoin, accretively",
        "THEREFORE it becomes a permanent, price-insensitive buyer",
        "BUT if the stock falls below the value of its holdings (mNAV < 1), issuing equity destroys shareholder value",
        "THEREFORE the buying stops",
        "AND the company's remaining tools are buybacks, dividends — and eventually selling bitcoin",
        "THEREFORE the biggest structural buyer becomes, at the margin, a seller",
      ],
      explains: "How the demand engine reversed direction",
      needsAnalogy: true,
    },
    {
      id: "m-institutionalisation",
      name: "Adoption is correlation",
      chain: [
        "Institutions buy bitcoin",
        "THEREFORE it enters portfolios governed by risk models",
        "THEREFORE it is sized, hedged and rebalanced like any other risk asset",
        "THEREFORE when real yields rise, it is sold alongside tech stocks",
        "THEREFORE the adoption that was supposed to make it valuable is what made it ordinary",
      ],
      explains: "THE THESIS — why the bull case was self-defeating",
      needsAnalogy: false,
      note: "This is the video. Everything else is evidence for it.",
    },
  ],

  reversals: [
    { id: "r1", obviousReading: "ETF inflows are positive, so demand is real and price should rise", whyWrong: "An inflow is not a spot purchase, and what does get bought is absorbed by holders selling into it", mechanismId: "m-etf-plumbing", evidence: ["f-etf-lag", "f-etf-absorbed", "f-lth-distribution"], escalation: "The largest distribution of any cycle happened into exactly this demand" },
    { id: "r2", obviousReading: "Corporate treasuries are permanent buyers — they never sell", whyWrong: "The buying was a function of the share price, not conviction. Below mNAV 1.0 the mechanism reverses.", mechanismId: "m-treasury-flywheel", evidence: ["f-mnav", "f-mstr-drop", "f-mstr-sold"], escalation: "In June 2026 the company that made 'never sell' a brand sold 32 coins" },
    { id: "r3", obviousReading: "Washington delivered — a reserve, an act, friendly regulators. That has to be bullish.", whyWrong: "Regulatory permission is not demand, and the reserve was never actually built", mechanismId: null, evidence: ["f-sbr", "f-sbr-unbuilt", "f-genius", "f-macro-cause"], escalation: "16 months on, agencies cannot agree how much bitcoin the government owns" },
    { id: "r4", obviousReading: "So institutional adoption failed", whyWrong: "It succeeded completely. That is the problem.", mechanismId: "m-institutionalisation", evidence: ["f-correlation", "f-m2-divergence", "f-yields"], escalation: "Bitcoin now moves on the 10-year Treasury yield — the single most boring number in finance", note: "This is the final turn and the thesis. Save it." },
  ],

  steelMan: {
    claim: "The forced-seller story is weaker than it looks, and the accumulation story is real",
    evidence: ["f-mstr-defence", "f-supply-2pct"],
    statement:
      "Strategy holds 2.5+ years of debt and dividend coverage in cash and has not been forced to liquidate; 32 coins is a rounding error. And long-term holders added ~380,000 BTC in a single month this year — after the drawdown, not before. Nothing here says the asset is broken.",
    whyInclude:
      "Without it the script is a bear case wearing an explainer's clothes. The honest position is 'the model changed', not 'it is going to zero'.",
  },

  scaleConversions: [
    { raw: "$126,198 → ~$62,000", felt: "half the value, in ten months, while every piece of good news it ever wanted arrived" },
    { raw: "3.67 million BTC distributed", felt: "more coins sold into strength than in any previous cycle — the people who held longest sold most" },
    { raw: "mNAV 3.89x → below 1.0", felt: "the market went from paying $3.89 for every dollar of bitcoin the company held, to under a dollar" },
    { raw: "32 BTC sold", felt: "about $2 million — for a company holding billions. The number is meaningless; the sentence 'Strategy sold bitcoin' is not." },
    { raw: "0.70–0.80 correlation with Nasdaq", felt: "on most days, bitcoin is a tech stock with extra steps" },
    { raw: "10-year yield ~4.5%", felt: "when a government bond pays you to do nothing, an asset that yields nothing has to argue harder" },
  ],

  analogyCandidates: [
    { for: "m-treasury-flywheel", analogy: "A company that borrows against its own house to buy more houses. It works beautifully while house prices rise — and the moment the market values the company below the houses it owns, the only way to keep the lights on is to sell a house.", quality: "strong — physical, familiar, carries the reversal" },
    { for: "m-etf-plumbing", analogy: "Money going into a fund is a promise to buy, not a purchase — like a restaurant taking a booking. A full reservation book and an empty dining room can be true at the same hour.", quality: "medium — the shorting mechanism is not fully captured" },
    { for: "m-institutionalisation", analogy: "Bitcoin spent fifteen years trying to get invited to the party, and the price of admission was becoming a guest like any other.", quality: "medium — abstract; consider dropping, the thesis may be stronger unadorned" },
  ],

  candidateQuestions: [
    "If the bull case came true, why is the price down?",
    "Where did the ETF money actually go?",
    "What happened to the buyers who said they would never sell?",
    "Did Washington's approval matter at all?",
    "Is this a broken asset, or a changed one?",
  ],

  counterPositions: [
    "Four-year-cycle believers read this as an ordinary post-halving drawdown, not a structural change",
    "The accumulation data (f-supply-2pct) genuinely cuts against the distribution narrative",
    "Regulatory wins may have long lead times that a 10-month window cannot measure",
  ],

  unknowns: UNKNOWNS,

  engineFit: [
    { engine: "reversal-chain", label: "Reversal Chain", fit: "excellent", why: "The material is literally a chain of four wrong obvious readings, ending in a thesis that reframes the whole subject. r1→r2→r3→r4 is the spine.", recommended: true, renderId: "reversal-chain" },
    { engine: "adjudication", label: "Adjudication", fit: "good", why: "The candidate explanations (ETF plumbing / treasury reversal / macro / it's just the cycle) genuinely compete. D-honest requires 'the premise is wrong' in the candidate set.", renderId: "adjudication" },
    { engine: "paradox-teaser", label: "Paradox Teaser", fit: "good", why: "Reversal r2 is a complete, self-contained surprise — a company whose brand was 'never sell' selling. Derived from the mid-length render, not researched separately.", renderId: "derived-short" },
    { engine: "briefing", label: "Briefing", fit: "poor", why: "No news event. This is a standing condition, not something that happened yesterday." },
    { engine: "parallel-case", label: "Parallel Case", fit: "poor", why: "No second domain to transfer to. Gold or equities would be forced." },
  ],

  currency: {
    halfLife: "weeks",
    why: "Price levels date immediately; the structural argument (institutionalisation → correlation) has a half-life measured in years",
    expiresFirst: ["f-now", "f-drawdown"],
    durable: ["m-institutionalisation", "m-treasury-flywheel", "f-mnav"],
    advice: "Write the price as a ratio ('roughly half its high') rather than a number, and the script survives months instead of days.",
  },

  sources: [
    "invezz.com — why is bitcoin stuck near $65,000 despite stronger ETF inflows (2026-08-10)",
    "coindesk.com — over a billion flows into bitcoin ETFs yet the price isn't rising (2026-03-04)",
    "coindesk.com — bitcoin's U.S. reserve still a work in progress as federal agencies hash it out (2026-07-06)",
    "whitehouse.gov — fact sheet: Strategic Bitcoin Reserve (2025-03-06)",
    "kucoin.com — Strategy's bitcoin strategy under fire as mNAV falls below 1.0",
    "decrypt.co — what is Strategy (MSTR), the bitcoin treasury company",
    "quasa.io — why bitcoin is becoming a high-beta macro asset",
    "coindesk.com — the U.S. 30-year Treasury yield just hit 5% and bitcoin may pay the price (2026-04-30)",
    "coinpedia.org — Trump crypto regulation timeline 2025–2026 and bitcoin price reaction",
    "keyrock.com — the liquidity source that leads bitcoin",
    "cryptoslate.com — the US says it has a bitcoin reserve but nobody can agree how much it owns",
  ],

  researchGaps: [
    "No primary on-chain data — everything on-chain is via aggregators and secondary reporting. A real run should hit Glassnode/CryptoQuant directly.",
    "No price series — a chart would settle the price ambiguity and give the Frames step real material.",
    "No bear-case-is-wrong source — did not search for the strongest 'this is normal cycle behaviour' argument, which weakens the steel-man.",
    "Miner economics not researched (post-halving hashprice, capitulation) — a plausible fifth mechanism left unexplored.",
  ],
};

/** Facts by id — the renders cite them, the notebook modal resolves them. */
export const FACT_BY_ID = Object.fromEntries(NOTEBOOK.facts.map((f) => [f.id, f]));

/** Unknowns by id — what script/constraints.ts scores each render against. */
export const UNKNOWN_BY_ID = Object.fromEntries(NOTEBOOK.unknowns.map((u) => [u.id, u]));

export const NOTEBOOK_COUNTS = {
  facts: NOTEBOOK.facts.length,
  loadBearing: NOTEBOOK.facts.filter((f) => f.loadBearing).length,
  lowConfidence: NOTEBOOK.facts.filter((f) => f.confidence === "low").length,
  /** The flag that matters most: load-bearing AND low confidence. */
  flagged: NOTEBOOK.facts.filter((f) => f.loadBearing && f.confidence === "low").length,
  mechanisms: NOTEBOOK.mechanisms.length,
  reversals: NOTEBOOK.reversals.length,
  sources: NOTEBOOK.sources.length,
  unknowns: NOTEBOOK.unknowns.length,
  /** The count that actually constrains a script being written today. */
  unknownsOpen: NOTEBOOK.unknowns.filter((u) => !u.resolvedBy).length,
  gaps: NOTEBOOK.researchGaps.length,
};
