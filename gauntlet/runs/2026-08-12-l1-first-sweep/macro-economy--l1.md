# L1 dry fit — `macro-economy` · Ines Varga, "Ledger & Border"

**Topic:** *"The dollar's share of global reserves has been falling for twenty years. Almost
everything said about why is wrong."*
**Lens binding:** geopolitics · **Level:** L1 · **Mode:** paper walk, no searches, no browser.

**Verdict: `L1-fail`.**
Not because the mechanism collapsed — it held better than I expected. Because the one thing my
topic cannot survive without, the methodic never asks for, and Phase 1's first row actively steers
away from it. One blocker (`G-L1-ME-03`), one major with recurrence already earned
(`G-L1-ME-01`), and a methodic that is otherwise the most disciplined research spec I have read.

---

## 1. Column utilisation

**`columns 7/7 used · 3 orphan groups`**

I am contradicting the brief's first hypothesis. The seven columns are market-shaped, and my topic
is a market topic wearing a geopolitics jacket — reserve composition *is* a portfolio allocation
problem. Everything I would bring places cleanly, and one column (`politics`) is better designed for
my beat than for the Bitcoin run it was derived from.

| Column | Holds? | What of mine goes in it |
|---|---|---|
| `the-number` (`dimensions.ts:26`) | **yes, and that is the problem** | COFER USD share ~71% (2001) → ~57–58% (2025); the window; the extremes. See §1.2 — a *full* column here is my failure mode, not my safety. |
| `flows` (`:28`) | yes, strongly | Reserve-manager purchases; the "nontraditional currency" bucket (AUD/CAD/KRW/SGD/SEK); RMB accumulation vs RMB *settlement*; CIPS/CLS/correspondent plumbing; swap lines. The "does the plumbing behave as people assume" clause is the single best-drafted line in the file for my beat. |
| `actors` (`:30`) | yes | PBoC, BoJ, SAMA, SNB, CBR post-2022, sovereign wealth funds; and the reporter set itself as an actor. |
| `macro` (`:32`) | yes | DXY / EUR-USD / JPY levels, real rates, the revaluation channel. This is where half of my answer lives. "Correlation with other assets" is asset-shaped and idles, but rates+currency carry it. |
| `politics` (`:34`) | yes, excellently | Sanctions on CBR reserves (2022), mBridge, BRICS unit, petro-yuan MOUs. `emptyMeans` "Policy is being assumed to work, or assumed not to" and the "was it actually implemented" clause are *exactly* the discipline that kills 80% of de-dollarisation commentary. Best row in the table. |
| `counter-case` (`:36`) | yes, but polarity-inverted — see `G-L1-ME-04` | |
| `conclusions` (`:38`) | yes | Opt-in asymmetry + mandatory falsifier. My favourite thing here; see §7. |

**Orphan 1 — series provenance / what COFER actually measures.**
Allocated vs unallocated reserves; a reporter set that changed mid-series (China's partial reporting
from 2015 mechanically moved the published share); gold excluded from FX reserves entirely, so the
largest reserve-diversification story of the last four years is *outside the denominator*. This is
not `the-number` (which is the level), not `flows`, not `macro`. It has no column and no schema
field, and it is the group my senior bar is built on.

**Orphan 2 — the valuation/flow decomposition.**
A change in a share has two additive sources: the currency moved, or somebody traded. Separating
them is arithmetic over primary series, not a found fact. No column houses a *decomposition*, and
`facts[]` (one-line claim + source + confidence, `NOTEBOOK-SCHEMA.md:41-47`) has no shape for one.

**Orphan 3 — the counterfactual / null model.**
"What the share would be today at constant 2001 exchange rates" is the single most useful number in
this video and I would compute it myself. It has no source, so `NOTEBOOK-SCHEMA.md:94` ("Every fact
dated and sourced. **No exceptions**") pushes it out of `facts[]` and into `conclusions` — which
`conclusions.ts:11-24` defines as sourceless *reasoning*, OFF by default. My most rigorous,
most reproducible material is filed as my most speculative. That is `G-L1-ME-02`.

### 1.2 The `emptyMeans` claim I tested, and it failed

`emptyMeans` is a claim about what an *empty* column signifies. `the-number`'s reads: *"No measured
baseline — every claim downstream is unanchored."* The unstated converse is what bites me: a **full**
`the-number` column is treated as sufficient anchoring. For a ratio whose numerator and denominator
both float, a full column is *actively* misleading — it certifies a baseline that is an artefact.
No dimension carries a "what a full column does not guarantee" note.

---

## 2. Evidence-floor check

**Where my ladder starts: MEASURED, and higher than the worked reference's.** I contradict the
brief's second hypothesis for my topic. IMF COFER is a published quarterly official series; BIS
triennial and locational banking statistics likewise. My floor is not the problem.

Two things are:

**(a) The ladder under test is not in the artifacts under test.** MEASURED · OBSERVED · INFERRED ·
ASSUMED is the *knowledge library's* evidence contract (`knowledge/README.md:36-41`), governing
claims about the video corpus. Notebook facts get a different, weaker instrument:
`confidence: high|medium|low` with free-text reasons (`NOTEBOOK-SCHEMA.md:45-46`), and one rule —
"vendor research is `low` by default". There is no rung for *primacy*. `high` confidence in a
secondary article restating a series and `high` confidence in the series itself are the same token.
That is `G-L1-ME-01`, and the Bitcoin run **already found it and wrote the fix**
(`NOTES.md:79`: *"Require primary sources for load-bearing quantitative claims"* → `RESEARCH-PROMPT.md`
quality bar). It was not adopted. Per `rubric.md`'s ranking order, that is recurrence, and recurrence
outranks impact.

The demonstration is in the reference notebook's own admission (`notebook.json:430`): *"Still no
PRIMARY on-chain data — every figure remains aggregator-sourced."* My scored criterion 2 —
"at least one primary series is cited, not only commentary about it" — is failed by the exemplar.

**(b) The downstream demotion is real and it is inverted.** My best material is a computation over
primary series. The schema offers exactly two homes and both are wrong: `facts[]` demands a source
it does not have and the "No prose" rule (`:92`) forbids the two lines of method that make it
auditable; `conclusions` is explicitly the sourceless tier, gated OFF, rendered as "what the model
reasoned". So the ladder does not demote *interpretive* material for me — it demotes **derived**
material, which is the opposite direction from the brief's hypothesis and worse, because derived
material is the most checkable thing in the notebook.

---

## 3. Counter-case reachability

**Satisfiable. Comfortably.** I contradict the brief's fourth hypothesis for my topic — I am the
wrong witness for it. The literature on both sides is a decade deep and institutional (IMF working
papers on the erosion of dollar dominance; BIS on FX turnover vs reserve composition; every
central-bank reserve-management speech ever given). Phase 1 row 6 is four searches from done.

But the *shape* is wrong for me, which is a different and more interesting failure.

Phase 1 row 6 asks for "the strongest argument that **nothing unusual is happening**"
(`RESEARCH-PROMPT.md:32`). Phase 6 asks for "the strongest case **against your own verdict**"
(`:88-90`). For the Bitcoin run those coincide, because its verdict was "something unusual is
happening". **My verdict is the null.** My thesis *is* "nothing unusual is happening — it is
valuation and small-sleeve diversification". So Phase 1 row 6 points at my own conclusion, and
Phase 6 points at de-dollarisation. Two opposite card groups, one column
(`dimensions.ts:36-37`, whose `emptyMeans` cites Phase 6 while the label matches Phase 1), one
label, one `emptyMeans`. A reviewer looking at that column cannot tell which polarity they are
reading. `G-L1-ME-04`.

This is not exotic. "The panic is wrong" is a whole genre.

---

## 4. Engine availability

Seven walked. **Five plausible, two poor.** Not zero, not seven — the shape test passes.

| Engine | Fit | Why |
|---|---|---|
| **A · Reversal Chain** | **excellent** | Four generous obvious readings in sequence: the share fell → the dollar is dying; BRICS is building an alternative; sanctions caused it; central banks are buying gold instead. Each turns on a different orphan. r1→r4 writes itself. |
| **B · Effort/Payoff Gap** | **good** — and I did not expect this | "Move a billion dollars out of dollars." Walk the actual plumbing: find the counterparty, price the swap, find the correspondent bank, discover the settlement leg is dollar-denominated, arrive back where you started. `ENGINES.md:46-47` — "a mechanism a viewer could operate, especially a punishing one." That is a better video than my outline. |
| **C · Parallel Case** | **good** | Sterling 1914→1970s as the familiar rule, transferred with a twist: sterling's share fell *with* British financial power; the dollar's fell *while* US financial dominance rose. `ENGINES.md:60-66`'s "the rule holds but needs a twist" is the exact structure. |
| **D · Adjudication** | **excellent** | Candidate explanations genuinely compete. And D-honest tell #1 (`:86-90`) — *"is the premise itself in the candidate set… the thing we're explaining may not be real, or may be mismeasured"* — is, by itself, the closest anything in this repo comes to my senior bar. It is in the wrong file. |
| **E · Briefing** | poor | Twenty-year trend. No news event, no author exposure to disclose. |
| **F · Anchor Ladder** | poor | Short-form; one anchor cannot carry a decomposition. |
| **G · Paradox Teaser** | **good (derived short)** | "The dollar's share of reserves is falling. Dollar dominance is rising. Both of those are true." A 50-second version exists. |

No `engines` finding. `ENGINES.md:12-13` already declares n=10, 1–3 witnesses per engine, "open, not
settled" — it prices its own confidence, which is more than most of the methodic does.

---

## 5. My scored criteria — pass/fail against the methodic AS DESIGNED

| # | Criterion | Verdict | Why |
|---|---|---|---|
| 1 | `the-number` distinguishes valuation from flow, or flags that it can't | **FAIL** | `RESEARCH-PROMPT.md:24-25` asks level, extreme and window. `dimensions.ts:26-27` says "what the price actually did, and over what window". Answered exactly as written, it produces "71% → 58%", which is the first-year mistake I said I would stop reading at. Nothing anywhere obliges the decomposition, and nothing obliges the *flag*. `G-L1-ME-03`. |
| 2 | At least one primary series cited, not only commentary about it | **FAIL** | No primacy field, no quality-bar row. `RESEARCH-PROMPT.md:112` asks me to *declare* in `research_gaps` that I used an aggregator. Declaring is not requiring. The reference notebook declares it and ships. `G-L1-ME-01`. |
| 3 | Counter-case is the *strong* version, not "some say it's fine" | **PASS** | Phase 6 ("in the words its believers would use", `:90`) + generous `obvious_reading` (`:74-76`) + the three D-honest structural tells (`ENGINES.md:84-96`) are the best-designed part of this methodic and better than my own process. Qualified by `G-L1-ME-04` on polarity. |
| 4 | Every reversal names the fact ids it turns on | **PASS** | `reversals[].evidence[]` (`NOTEBOOK-SCHEMA.md:56`), demonstrated at `notebook.json:249-253`. Exactly what I want. Papercut only: `mechanism` is nullable in practice (`notebook.json:272`) and not marked optional — `G-L1-ME-07`. |
| 5 | At least one conclusion contradicts my prior, or the notebook says the evidence supports it | **FAIL** | `tension.expectation` is "what people believe" with no owner (`RESEARCH-PROMPT.md:37-38`). Nothing records the researcher's prior; nothing tests the verdict against it. The only place an author's prior appears in the entire methodic is `ENGINES.md:91-92`, as an execution check on one engine. A run on my topic returns my own contrarian take with citations attached and passes every quality-bar row. `G-L1-ME-05`. |
| 6 | Time-to-scriptable-notebook under 90 min of equivalent work | **FAIL** | ~370 min residual — §6. |
| 7 | No claim in the rendered script is unsourced to a notebook fact | **FAIL** | The methodic has no render-time traceability rule. The reference render's self-check has twelve rows (`script--reversal-chain.md:190-203`) and none is traceability — and that same file records that its checks missed both an arithmetic error and a stated notebook constraint (`:205-226`). The unsourced-claim sweep exists only in the Gauntlet's own SKILL, which is the test, not the methodic. `G-L1-ME-06`. |

**2 pass / 5 fail.**

---

## 6. Time-saved

Manual baseline: **540 min** (9h/3 days), of which ~300 min is finding a counter-argument worth
taking seriously. Accepted: 90 min.

| Stage | Manual | With the methodic as designed | Saved |
|---|---|---|---|
| Breadth pass over the causal domains | ~120 | ~30 (Phase 1, 4–8 searches, six named rows) | **+90** |
| Finding the strong counter-case | ~300 | ~180 (Phase 6 + D-honest tells sharpen the target; the *search* is still mine) | **+120** |
| Articulating the tension | ~30 | ~15 (five named shapes) | **+15** |
| Valuation/flow decomposition (the spreadsheet) | ~180 | ~180 — **untouched**; nothing in the methodic computes anything | 0 |
| Notebook authoring overhead | 0 | ~55 (facts, chains, scale conversions, currency, gaps) | **−55** |

**`~170 min saved · low confidence`.**

Confidence is low for a stated reason, not a hedge: `accepted-gaps.md` § `scope-note` records that
no runner exists, so this is an estimate of the methodic executed as written, not a measurement.

Criterion 6 fails anyway: **370 min residual against a 90-minute acceptance.** The saving is real and
lands entirely in the half of my process that is already cheap. The 3 hours that gate my senior bar
are exactly the 3 hours the methodic does not touch — and worse, a notebook that skips them is
*complete* by every checkbox in the quality bar (`RESEARCH-PROMPT.md:119-130`). A fast route to a
notebook I cannot put my name on is not 170 minutes saved. It is 170 minutes saved and a new way to
be wrong quickly.

---

## 7. Findings

See `macro-economy--findings.json`. Nine recorded — eight `confirmed`, one `uncertain`. All survived
the refuter pass in `rubric.md`; three were reshaped by it and one was cut entirely (my pet peeve
"a conclusion that would be equally true if the number had moved the other way" is already handled
by `conclusions.ts:56` — `falsifiableBy` is precisely that test, and it is mandatory. Credit where
it is due; it is not a finding).

| id | sev | dim | targets | title |
|---|---|---|---|---|
| `G-L1-ME-03` | **blocker** | dimensions | dimensions, research-prompt | "The number" asks for a level; a share is a composite and nothing asks what it is made of |
| `G-L1-ME-01` | major | evidence | research-prompt, notebook-schema | No source-primacy field; the quality bar accepts an all-aggregator notebook (recurrence: NOTES.md:79) |
| `G-L1-ME-02` | major | evidence | notebook-schema, conclusions | A researcher-computed quantity has no home — demoted to `conclusions` or forced to invent a source |
| `G-L1-ME-04` | major | counter-case | research-prompt, dimensions | Counter-case polarity is fixed to "nothing unusual is happening"; inverts for null-verdict topics |
| `G-L1-ME-05` | major | tension | research-prompt, notebook-schema | The researcher's own prior is never recorded and never tested against the verdict |
| `G-L1-ME-06` | major | scriptability | research-prompt, knowledge | No render-time rule that every script claim traces to a fact id |
| `G-L1-ME-08` | major | evidence | notebook-schema | `currency` models staleness but not *revision*; `as_of` cannot express a data vintage |
| `G-L1-ME-07` | polish | conclusions | notebook-schema | `reversals[].mechanism` is nullable in practice, not in the schema |
| `G-L1-ME-09` | *uncertain* | exposure | conclusions | `unhinged` motive tier has no naming policy — flagged for convergence, I am a weak witness |

`G-000` (untagged cards → "The number") applies to my topic and is cited, not re-raised.

---

## 8. Voice — Ines Varga

I want to be fair about this before I am hard on it, because the parts that are good are unusually
good and I do not want that lost in a fail.

The falsifier requirement is the best idea in here. Every conclusion states what would show it is
wrong, and it is mandatory, and it is enforced by a type. That single rule kills my third pet peeve
outright — a conclusion that would be equally true if the number had moved the other way cannot
produce a falsifier, and it gets caught at write time instead of in my comments. Opt-in asymmetry —
facts in until cut, syntheses out until let in — is the right way round and almost nobody does it
that way. Phase 4's insistence on a *generous* obvious reading is a discipline I try to hold and
frequently don't. The `politics` column's "and whether it was actually implemented" clause would, on
its own, have prevented most of the de-dollarisation commentary published since 2022. And Engine D's
honesty tells — particularly "is the premise itself in the candidate set" — is a better articulation
of my own standard than I have ever written down.

Now. Would I adopt it? **Not for this video.**

Phase 1, row 1, asks me what the number is now, what the extreme was, and over what period. I answer
it honestly and I get "seventy-one percent to fifty-eight percent, 2001 to 2025." That sentence is a
lie by construction and every desk analyst knows it. Roughly half of that move is the euro and the
yen being worth different dollars than they were, and the notebook has no place to say so, no
obligation to check, and — this is the part I find genuinely unnerving — a `emptyMeans` that reassures
me the column being *full* means my downstream claims are anchored. It is not that the tool fails to
do the decomposition. Tools don't do arithmetic for me and I don't expect them to. It is that a
notebook with no decomposition in it passes every one of the ten boxes in the quality bar and arrives
looking finished. That is not a gap. That is a mechanism for producing confident, complete-looking,
wrong research faster than I could produce it by hand. That's not what that measures.

What would I not trust it with? Anything where the metric is a ratio, an index, a per-capita, a
share, a real-terms series, or a seasonal adjustment — which in my beat is essentially everything.
The methodic was derived from a price. A price is the one economic number that means what it says.
Every other number in my job is a construction, and this thing has no concept of a construction.

The second thing I won't trust it with is my own opinion. My topic is a contrarian take that has
become its niche's consensus, and I said in my file that a notebook that hands me back my own prior
with citations has failed. Having read the whole spec: it will do exactly that, cleanly, and every
checkbox will be green. `tension.expectation` records what "people" believe, and there is no field
anywhere for *whose* belief, or for mine. The one place in this entire library where an author's
prior is treated as a hazard is four lines inside Engine D's honesty section. It should be Phase 0.
Write down what you already think, then research, then check whether the verdict is a discovery or a
mirror. That is a fifteen-word instruction and its absence is the difference between a research tool
and an expensive confirmation service.

Third — and this one I say with some sympathy, because the reference run caught itself doing it — the
provenance discipline is aspirational. `NOTES.md` line 79 already says "require primary sources for
load-bearing quantitative claims." Someone wrote that down, correctly, after doing a whole run
without any, and then the quality bar was not changed. Meanwhile `confidence: high` is available to a
newspaper's paraphrase of a series that anybody could have downloaded. I reject research docs where
the sources are all secondary. The methodic does not, and it knows it doesn't.

What is missing for my job, concretely, in the order I'd want it:

1. **A `derivations[]` class** — inputs, method, result, reproducibility. Facts I computed, ranked as
   evidence rather than as speculation. Right now my best work is filed next to the model's vibes.
2. **A source-primacy tier on `facts[]`** — `primary | secondary | aggregator | vendor` — and a
   quality-bar row that load-bearing quantitative facts reach `primary` or carry a named gap.
3. **A `metric_construction` obligation in Phase 1** — what is the numerator, what is the
   denominator, what is in scope, has the population changed, and can the observed movement come from
   somewhere other than the behaviour being explained.
4. **A declared `prior`, and a Phase that checks the verdict against it.**
5. **Data vintage separate from observation date.** COFER is revised. Quoting a superseded vintage is
   precisely the error my audience quotes back at me for years, and `as_of` cannot express it.

None of those are a lens. Every one of them is content in the same mechanism, and I'd want the judge
to notice that a hostile witness on the most market-shaped non-market beat in the cast placed 7 of 7
columns and is still asking only for rows, fields and one extra Phase-1 question. The machinery is
right. It has been taught one number, and that number was a price.

One last thing, on being unsurprising, since that is the risk I actually price. `verdict` is written
during research, before the steel-man is found (`NOTEBOOK-SCHEMA.md:29-31` vs Phase 6 at `:88`). I
understand why — the script needs the answer at 0:40. But it means the strongest opposing case is
assembled by someone who has already committed to the conclusion it is supposed to threaten, and the
only guard against that is the researcher's own good faith. On the Bitcoin run that guard held. It
held because a careful operator was running it. That is not a property of the file.
