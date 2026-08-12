# Follow-up round 1 — 2026-08-11

Two requests, both researched for real in the terminal. Recorded here because they change the
notebook, and because they are the evidence that a follow-up must be able to make it **worse**.

---

## 1 · deepen `f-liquidity` — VERDICT: weakened, fact killed

The card the notebook itself flagged: **load-bearing at LOW confidence**, the "93% of long-run
variance / 7.6x amplification" liquidity statistic, single-sourced to Keyrock.

**Result: it does not survive.** A second search found no independent corroboration — the figure
still traces to the same vendor. Worse for the claim, independent work contradicts the relationship
in exactly the window this script covers:

- **CF Benchmarks**: month-to-month M2/BTC correlation is *weak*; it only strengthens over 6–24 month
  horizons.
- **By Q4 2025 the M2–Bitcoin relationship broke down** — over the following twelve months global M2
  grew **more than 12%** while Bitcoin fell **roughly 12%**.

**Effects**
- `kills f-liquidity` — already cut from both renders; this closes it rather than leaving it as a
  temptation for the next writer.
- `adds f-m2-divergence` — *"Global M2 grew >12% over twelve months while Bitcoin fell ~12%; the
  liquidity relationship broke down through 2026."* Medium confidence, two sources.

**The replacement is stronger than what it replaces, and it argues the same thesis**: an asset that
stopped responding to liquidity is an asset being managed as a position. This is the deepen mechanism
working exactly as intended — a low-confidence fact was not confirmed, it was *replaced by a better
one*.

Sources: [CF Benchmarks](https://www.cfbenchmarks.com/blog/the-m2-bitcoin-relationship-what-the-data-actually-shows) ·
[Onramp](https://onrampbitcoin.com/research/bitcoins-macro-liquidity-cycle)

---

## 2 · "What about onchain data, do they provide any hints regarding behavior of whales?" — VERDICT: resolved

**Yes, and it resolves the notebook's open contradiction.** `unknowns[0]` recorded that the 3.67m BTC
distribution and the 380k accumulation might not be consistent, and instructed the script to present
them as *competing readings*. They are not competing. **They are different cohorts.**

| cohort | behaviour, 60 days to ~19 July 2026 |
|---|---|
| **> 10,000 BTC** | accumulated ~46,420 BTC — highest since March |
| **1,000–10,000 BTC** | accumulated ~66,700 BTC |
| **> 1,000 BTC (combined)** | ~270,000 BTC in the 30 days to 23 April; a similar figure again late June/early July **while price fell below $58,000** |
| **100–1,000 BTC** | **distributed ~77,800 BTC — slightly MORE than the whales absorbed** |
| **0.1–1 BTC (retail)** | distributed ~9,700 BTC |

**The answer to the question:** whale accumulation is real, large, and *cancelled out*. Heavy buying
and a falling price are consistent because the buying is being met by the tier directly below it.

**Effects**
- `resolves u-onchain-contradiction` — the script can state the answer instead of hedging between two
  readings.
- `adds f-whale-absorb`, `adds f-midtier-distribute` (medium confidence).
- `confirms f-supply-2pct` — the steel-man's accumulation figure holds, but it was **one cohort, not
  the market**, which weakens how much comfort it should give.

**Impact on the script.** This sharpens Movement 1 materially: *"the ETF was an exit"* becomes a
specific, sourced mechanism — the people selling into the bid are identifiable, and they are not
retail. It also slightly weakens the steel-man, which is the honest direction.

**Caveat, and it is real:** every figure here is from crypto-analytics aggregators
(CryptoQuant via secondaries, cryptoseyes, bgeometrics, cryptopolitan), not primary API data, and
several of those sources wrap the numbers in a bullish "smart money accumulates → supply shortage →
upside" framing this notebook does not adopt. Recorded as **medium** confidence, and
`research_gaps` item 1 (no primary on-chain sources) still stands.

Sources: [CryptosEyes](https://www.cryptoseyes.com/insights/whale-accumulation-270k-btc-april-2026/) ·
[Cryptopolitan](https://www.cryptopolitan.com/this-btc-cohort-has-the-fastest-accumulation-rate-in-2026/) ·
[BGeometrics](https://bgeometrics.com/blog/2026-06-bitcoin-2026-whale-accumulation-onchain-cohorts/)

---

## What this round proves about the mechanism

1. **A deepen can kill.** One of two requests removed a fact. A follow-up surface that only knows how
   to render "here is more" would have had nowhere to put this result.
2. **The system can write the reason.** `f-liquidity` was queued with the justification already
   filled in, because the notebook's own `confidence` + `loadBearing` fields imply it. The creator
   marks the card; they do not have to articulate what the notebook already knows.
3. **A question resolves faster than a re-run.** The whale question closed an `unknown` that the
   original six-search round had left open — at the cost of one search, because it was aimed.
4. **Nothing is applied automatically.** Both results are staged. Applying them writes a new notebook
   revision; the script already written against the current scope is untouched.
