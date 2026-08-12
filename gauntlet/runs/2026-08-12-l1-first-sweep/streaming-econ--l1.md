# L1 dry fit — `streaming-econ` (Ivo Petrič, "Removed From Platform")

**Topic:** shows are deleted from the platforms that made them, and the explanation is not cost-cutting
— it is an amortisation and tax treatment that makes an unwatched title worth more gone.
**Area:** entertainment · **Lens binding:** entertainment · **Level:** L1 · **Model:** Opus
**Verdict: `L1-conditional`**

Paper exercise. No searches, no browser, no platform named — I reasoned about the *shape* of a
content-amortisation analysis, not about any company's actual disclosures.

---

## 1. Column utilisation

```
columns 7/7 used · 2 orphan groups
```

Orphans named:

- **Orphan A — the treatment itself, and its recognition schedule.** "Capitalised content costs are
  amortised over an estimated viewing pattern; withdrawal and abandonment of the rights permits the
  unamortised balance to be recognised at once" is not a fact about the world, not a flow of money,
  not an actor, not macro, not politics, not a counter-case, and not a conclusion (it is researched
  and sourced, not reasoned). It is a **rule**, plus a **curve** — how a cost is recognised over
  time. Nearest home is `flows`, whose purpose is "Who is buying and selling, through what
  mechanism, and whether it behaves as assumed" (`dimensions.ts:28-29`) — transaction plumbing, not
  accounting policy. It fits there the way a spanner fits in a cutlery drawer.
- **Orphan B — one event, two sets of books.** A removal is a book impairment under one regime and a
  deduction under another, and the two do not agree in amount or in timing. Nothing on the board
  holds "the same event described twice by two systems"; the board is built to hold one description
  of each thing. Both descriptions land in `the-number`, which is the exact merge my scored
  criterion 2 exists to prevent.

I want to be clear that **7/7 contradicts the brief's first hypothesis**, which expected non-market
topics to collapse the column set. It did not collapse. It *stretched*:

| Column | Held? | What went in |
|---|---|---|
| `the-number` | **used, by stretch** | removal counts; content-amortisation expense; the impairment charge. Purpose reads "What the price actually did, and over what window" (`dimensions.ts:26`) — my quantities are not a price and there are three kinds of them. See finding `-04`. |
| `flows` | used, well | who pays whom for a licence, in which direction, and what obligation ceases when a title comes down. This column generalised better than its Bitcoin phrasing suggests. |
| `actors` | used | studios, platforms, the guilds that set residual regimes, auditors, the revenue authority. |
| `macro` | **used — see §2** | the cost-of-capital cycle that funded the content spend, and the rate normalisation that ended it. |
| `politics` | used, well | statutory changes and guild agreements — and "whether it was actually implemented" (`dimensions.ts:34`) is exactly the right question for a disclosure rule. |
| `counter-case` | used | "this is ordinary catalogue management." Literature exists (§5). |
| `conclusions` | used | the synthesis is the video. |

Nothing was empty. The defect is not underflow, it is that one column is doing three jobs.

`G-000` (untagged cards → `?? DEFAULT_DIMENSION` → "The number", `dimensions.ts:42-49`) is
pre-recorded and I am not re-raising it — but note it lands *on my weakest column*, so for this
topic the known fallback and finding `-04` compound.

---

## 2. Does `macro` generalise, or was it Bitcoin-specific?

The question I was asked to answer precisely. The answer is split, and the split is the evidence.

```ts
{ id: "macro", label: "Macro",
  purpose: "Rates, currency, liquidity, correlation with other assets.",
  emptyMeans: "The asset is being explained in isolation from the market it trades in." },
```
— `app/_phases/_shared/notebook/dimensions.ts:32-33`

**`purpose` generalises. Half of it, and the half that matters.** My topic has a real macro
dimension and it is not a metaphor: a decade of near-zero rates is what made a multi-year
capitalised content asset cheap to carry, and rate normalisation is what made carrying it
expensive — which is upstream of every write-off decision in the story. That is *rates*, and it is
*liquidity*. Two of the four terms land on a non-traded subject without being bent. *Currency* is
marginal but honest (foreign-produced content and FX on production spend). Only *correlation with
other assets* is dead here, and it is dead because it presumes the subject is an instrument with a
price series.

So `purpose` is a mixed list: three macro primitives that travel anywhere capital has a cost, plus
one market-instrument term. A creator reading it will find their material in it. **It was not
Bitcoin-specific; it was written from a Bitcoin example and got lucky in three words out of four.**

**`emptyMeans` does not generalise, and it is the more interesting failure.** `env.md:13` instructs
that an `emptyMeans` is *a claim about what an empty column signifies* and is to be tested. Tested,
it fails on my topic in both directions:

- If I **fill** it — rates drove the spend cycle — the emptyMeans is warning me about a hazard
  ("explained in isolation from the market it trades in") that I could not have had, because a
  capitalised content library does not trade in a market. Harmless, but the column is describing
  itself in terms of a property my subject lacks.
- If I **leave it empty** — which is a live outcome, because the cost-of-capital story is real but
  is not where the differentiating work is — the board tells me something false about *why* that is
  a problem. It says my asset is isolated from its market. The true statement would be "the spend
  decision is being explained without the conditions that financed it." A reviewer who reads the
  emptyMeans and does not recognise their own topic in it will conclude the column does not apply to
  them, and will skip the one macro fact that actually matters.

That second case is the finding: **a false `emptyMeans` is worse than a missing one**, because the
whole stated purpose of the field is that "an empty column reads as a gap, not as 'nothing to show'"
(`dimensions.ts:21`). An emptyMeans phrased in the vocabulary of a traded instrument converts a real
gap into a legitimate-looking non-applicability, on every topic that is not a market.

This is a **one-line content fix** — rephrase to something like "the subject is being explained
without the capital conditions that financed it" — and I want that on the record, because it means
the brief's column hypothesis, on my topic, is a `content` finding and emphatically not a lens.

---

## 3. The mechanism at line-item level — can a mechanism be a *rule*?

My differentiation is naming the treatment exactly. So the question is whether `mechanisms[]` can
hold an accounting rule rather than a causal link between two dated facts.

The schema:

> `{id, name, chain[], explains, needs_analogy, note?}`
> `chain` is written as alternating BUT/THEREFORE steps — **the beat chain is authored here**
— `pipeline/NOTEBOOK-SCHEMA.md:49-53`

> "For each causal story the script will need, write it as an explicit alternating chain… **Every
> link is BUT or THEREFORE. If the only honest connector is AND THEN, you have a sequence, not a
> mechanism**"
— `pipeline/RESEARCH-PROMPT.md:54-66`

**Answer: yes, but only by instantiating the rule, and the schema never says so — so the generality
is lost on the way in.** A rule is a conditional; `chain[]` wants events. The Bitcoin exemplar's
steps are all event-shaped — "A dollar enters a spot bitcoin ETF" (`notebook.json:203`), "A treasury
company's stock trades above the bitcoin it holds" (`notebook.json:218`). Write mine the same way
and it works cleanly:

```
A title's unamortised cost sits on the balance sheet as a capitalised asset
  THEREFORE  it is written down against revenue over an estimated viewing window
  BUT        an under-viewed title's window is revised, and the remaining balance outlives its audience
  THEREFORE  withdrawing it and abandoning the rights recognises the whole remainder at once
  AND ALSO   ends the obligations that ran with continued exhibition
  THEREFORE  the title is worth more removed than carried
```

Every link is BUT or THEREFORE. The law holds. `m-treasury-flywheel` uses a bare "AND" at
`notebook.json:222` so I am in exemplar company on the fifth line, and I would fix mine before
shipping. The engine is not the problem.

**The problem is what the chain is allowed to leave out.** `mechanisms[]` has no `source`, no
`as_of`, no `confidence` — compare `facts[]`, which has all three (`NOTEBOOK-SCHEMA.md:42`), under a
rule that reads:

> **2. Every fact dated and sourced.** No exceptions, including ones that seem like common knowledge.
— `pipeline/NOTEBOOK-SCHEMA.md:94`

"No exceptions" is scoped to facts, and mechanisms are the exception. The Bitcoin notebook confirms
it in practice: three mechanisms at `notebook.json:198-242`, zero source fields, zero dates, and one
of them carrying the note "This is the video. Everything else is evidence for it."
(`notebook.json:240`). The load-bearing card class is the uncited one.

For most topics that is survivable, because the mechanism is assembled from facts that are
themselves cited. For mine it is disqualifying, and precisely because a rule is not assembled from
facts — it *is* a citation. "Amortised over the estimated viewing pattern" is a sentence from a
standard, and its authority is entirely in which standard, which paragraph, which year, and which
filer it binds. Strip the source and I have written "for tax reasons" in more words, which is the
thing I exist to replace.

There is a workaround: split it, put "the treatment is X, per [filing], as of [date]" in `facts[]`
and reference it from the chain. I would do that. But then the notebook's own structure says the
citation is a fact and the mechanism is unsourced commentary, and a reviewer reading the mechanism
card alone — which is what the board shows — sees an uncited rule. Finding `-01`.

---

## 4. Write-down vs impairment vs cash cost — three facts, or a merge?

Three genuinely distinct things, and my audience corrects the confusion publicly:

1. **Amortisation / write-down** — the scheduled recognition of a cost already spent. No money moves.
2. **Impairment** — a revision saying the remaining balance will not be earned back. No money moves,
   and it is *not* the same as (1): different trigger, different judgement, different disclosure.
3. **Cash cost** — what was actually paid to make or licence the thing, in a period that may be
   years earlier.

**The schema permits three facts.** `facts[]` is a free list; nothing forces a merge, and I can give
each its own id, source, date and confidence. Criterion 2 is satisfiable at the fact layer.

**Three things then push them back together:**

- **`scale_conversions[]` is `{raw, felt}`** (`NOTEBOOK-SCHEMA.md:67-69`) with no field for what kind
  of quantity is being converted. Phase 5 instructs "comparisons the audience owns" and offers
  "about two million dollars, from a company holding billions" as the model (`RESEARCH-PROMPT.md:79-86`);
  every conversion in the exemplar is cash-equivalent (`notebook.json:304-328`). Feed a
  non-cash impairment charge into that apparatus and it comes out sounding like money that left the
  building. That is pet peeve number three, produced *by the methodic*, in the field designed to
  make numbers land. The conversion layer is unit-blind.
- **`CARD_DIMENSION` files all three in `the-number`** — one column whose purpose is a single
  quantity over a window (`dimensions.ts:26`). On the board they sit adjacent and undifferentiated,
  which is where a reviewer merges them.
- **CRAFT-BASELINE §7** — "a number that is not compared is a number that is forgotten"
  (`CRAFT-BASELINE.md:120`) — is a general instruction to compare every figure. The one comparison I
  must never make is between these three.

So: the schema does not *encourage* the merge, but the number-handling apparatus rewards it and
nothing anywhere flags it. Findings `-02` and `-04`.

---

## 5. Evidence-floor check

Three source classes, and the third is the interesting one.

**First, a correction to the brief.** The MEASURED · OBSERVED · INFERRED · ASSUMED ladder does not
govern notebooks at all. It lives at `knowledge/README.md:32-41` and is scoped explicitly: "Every
line in a `PATTERNS.md` carries one" (`knowledge/README.md:34`) — it is the provenance contract for
*craft claims about the corpus of studied videos*, not for research facts. Research facts carry
`confidence: high | medium | low` (`NOTEBOOK-SCHEMA.md:46`). So hypothesis 2 as put to me is
mis-aimed on my topic: the ladder is not demoting my best material, because it never touches it.
(Grep for the ladder tokens incidentally surfaced two sibling reports reaching the same location; I
verified at `knowledge/README.md` directly rather than taking theirs.)

**The real gap is that `confidence` is one axis doing two jobs** — *how authoritative is the source*
and *how certain is the number*. My three classes separate cleanly on the first and not the second:

| Source | Authority | Numeric certainty | Where the schema puts it |
|---|---|---|---|
| Filings, content-amortisation footnote | primary, audited, legally consequential | exact as stated | `high` |
| Analyst notes | secondary, informed, interested | modelled | `medium` — nearest neighbour is "Vendor research is `low` by default" (`NOTEBOOK-SCHEMA.md:46`) |
| **My own removals list** | primary, but self-collected and unaudited | high for what it covers, unknown coverage | **no rung** |

The self-maintained dataset is the case the methodic has no shape for. It is not vendor research —
nobody is selling anything — but it shares vendor research's defect (the collector benefits from the
conclusion) and none of its advantage (no published method, no third party who could check it). It
is simultaneously my most reliable input and my least defensible one, and `confidence: high|medium|low`
cannot say that.

Worse, it cannot be *cited*: `sources[]` is a flat array of URLs (`notebook.json:413-428`) and my
list has no URL. Under the current schema it would end up as a string in `facts[].source` reading
something like "author's own removals tracking", which is indistinguishable in the data from an
uncited assertion. The honest handling — declare the collection method, the coverage window, and
what would falsify the count — has nowhere to live except `research_gaps[]`, which is for what the
run *didn't* do (`NOTEBOOK-SCHEMA.md:88-89`), not for what it uniquely did.

**Can the methodic accept a creator's own dataset as a source?** As written, only by lying about its
shape. Finding `-07`.

---

## 6. Counter-case reachability

"This is ordinary catalogue management" — licences expire, libraries are pruned, this has always
happened, you are pattern-matching noise.

**Reachable, and the methodic asks for it correctly — three times.** Phase 1's last row
(`RESEARCH-PROMPT.md:32`) with "That last row is not optional and is the one most often skipped"
(`:34`); Phase 6 as a hard requirement (`:87-93`); and the board column whose emptyMeans is the only
one shouting — "DANGEROUS — without this the script can only produce a polemic"
(`dimensions.ts:37`). That triple redundancy is good design and I will say so.

For my topic there is real literature to find: routine licence-expiry churn predates the phenomenon
I am describing by decades, and the trade press argues the null hypothesis without any prompting.
This **contradicts the brief's fourth hypothesis on my topic** — the steel-man requirement is not
unsatisfiable here; it is satisfiable and it is load-bearing, because the counter-case is genuinely
strong and the video is only worth making if it survives.

The one thing I will flag without scoring it as a finding: my counter-case is *partly true*, and
`steel_man` is `{claim, evidence[], statement, why_include}` (`NOTEBOOK-SCHEMA.md:61-65`) — a
container for one opposing position stated at full strength, with no way to say "this is correct for
some of the removals and not for others." The honest verdict here is a proportion, not a ruling.
Engine D's structure would handle it (`ENGINES.md:68-80`); the field would flatten it. I am
recording that as voice rather than a finding because a competent researcher writes the proportion
into `statement` and gets away with it.

---

## 7. Engine availability — all seven

| Engine | Fit | Why |
|---|---|---|
| **A · Reversal Chain** | **excellent** | The obvious reading — "they are deleting shows to cut costs, out of greed" — is widely held, generous to state, and wrong in a specific way. The turn is that removal *creates* recognised value. `ENGINES.md:26-42`; this is the one I would ship. |
| **B · Effort/Payoff Gap** | **good** | "a mechanism a viewer could operate" (`ENGINES.md:46`). Walk the balance sheet: capitalise, amortise, revise, abandon. The disproportion between a year of production and a single-period line item *is* the emotional content. Best engine for making an accounting rule felt, which is my hardest craft problem. |
| **C · Parallel Case** | **good** | Establish the rule in a familiar domain — a shop writing off unsold stock — then transfer, with the twist that the shop's stock cost it money to hold and mine costs money to *keep on the books*. Meets the curse-of-knowledge defence at `CRAFT-BASELINE.md:108-112`. |
| **D · Adjudication** | **good** | Candidates: ordinary catalogue churn · licence expiry · cost cutting · the treatment. And D-honest requires the premise in the candidate set (`ENGINES.md:87-90`) — which for me *is* the counter-case, so the honesty test and my criterion 4 are the same test. Slower, and the accounting takes explaining before any candidate can be weighed. |
| **E · Briefing** | **poor** | Standing condition, no news event, and E's obligations are "it must be **dated**" and "**disclose the author's exposure**" (`ENGINES.md:129-131`). Neither fits a structural explainer. |
| **F · Anchor Ladder** | **medium, short form only** | One title as the anchor, carried up through capitalisation → amortisation → impairment → abandonment. Naturally ordered difficulty, which is the stated trigger (`ENGINES.md:141`). Genuinely attractive for a short. |
| **G · Paradox Teaser** | **medium, short form only** | "This cost a fortune to make, millions of people watched it, and it is worth more deleted." A flat contradiction that must resolve. |

**Four long-form fits, two short-form, one refusal.** Not zero, not seven — the material has a
shape. No `engines` finding: I went looking for "no engine whose pleasure is *understanding a rule*"
and B is exactly that engine, so the complaint refuted itself.

---

## 8. Scored criteria

| # | Criterion | Result | Reason |
|---|---|---|---|
| 1 | Accounting mechanism named at line-item level, sourced to a filing | **FAIL** | `mechanisms[]` has no `source`/`as_of`/`confidence` (`NOTEBOOK-SCHEMA.md:49`) while facts do (`:42`), and Phase 1 is a table of *searches* with no primary-document step (`RESEARCH-PROMPT.md:21-33`). The exemplar shipped 14 aggregator URLs and admitted "Still no PRIMARY on-chain data" in its gaps (`notebook.json:430`). A workaround exists — put the sourced treatment in `facts[]` — but then the card the board displays as the mechanism is uncited. Findings `-01`, `-06`. |
| 2 | Write-down, impairment and cash cost are distinct facts | **CONDITIONAL PASS** | `facts[]` permits three ids. `scale_conversions{raw,felt}` is unit-blind and `CARD_DIMENSION` files all three in one column, so the merge is rewarded and never flagged. Findings `-02`, `-04`. |
| 3 | `macro` has a real referent | **SPLIT — PASS on `purpose`, FAIL on `emptyMeans`** | See §2. Three of four purpose terms travel; the emptyMeans presumes a traded instrument and misdescribes an empty column on any non-market topic. Finding `-03`. |
| 4 | Counter-case present with its source | **PASS** | Asked for three times, in three files, with the only shouting emptyMeans on the board. §6. |
| 5 | No conclusion attributes a removal decision to a named executive | **FAIL** | Nothing in `conclusions.ts` constrains naming. The `unhinged` tier is *defined* as "A claim about MOTIVE, which is the least verifiable kind of claim there is" (`conclusions.ts:32-33`), and the exemplar `c-reserve-was-the-product` (`:164-179`) assigns motive to an administration and its donors. Finding `-05`. |
| 6 | Falsifiers are future filings | **PASS** | `falsifiableBy` is free text and required (`conclusions.ts:54-55`). "Wrong if the next annual report shows the content-asset balance rising while removals continue" is exactly the checkable kind. This field is well designed and I want it recorded as a guardrail, not a compliment. |
| 7 | Under 90 min equivalent | **FAIL** | §9. |

---

## 9. Time-saved

Manual baseline **~9h (540 min)** per video, with the removals list supplied rather than built.
Would accept **90 min**.

What the methodic plausibly removes: Phase 2 tension-finding is where my drafting time actually goes
and the notebook front-loads it; Phase 3 authors the beat chain so the script inherits a spine;
Phase 8 engine fit is a decision I currently make by rewriting. Call that 4–5 hours of my normal
process.

What it does not remove: reading the footnote. Getting the treatment right at line-item level is a
document task, the prompt has no step for it (`RESEARCH-PROMPT.md:21-33`), and I would not delegate
it in any case — my exposure bar says I would rather be slow than corrected on a mechanism. That is
60–90 minutes that stays mine, plus the verification pass over anything the notebook asserts about
the treatment, since the mechanism card arrives uncited.

**Estimate: ~330 min saved · low confidence.** 9h → roughly 3.5h. That is a real saving and it
misses my acceptance bar by a factor of two, and I want both halves of that sentence reported.
Confidence is low by construction: nothing was executed, and `accepted-gaps.md` §`scope-note` is
explicit that every L1 time-saved figure is an estimate of what the methodic *would* save if
executed as written. If findings `-01` and `-06` were fixed — a sourced mechanism, a
primary-document step — the number gets closer to my bar, because the hour I am reserving is
reserved for exactly the thing those two findings describe.

---

## 10. Voice — Ivo

Nine hours, and about six of them are one footnote and the several ways it can be misread. I came
into this expecting the board to have no room for me, and instead I got all seven columns full,
which was mildly disorienting. The columns are fine. Broader than they read. Somebody wrote them
while looking at a chart, and it shows in the prose more than in the structure.

The macro column is the example I would give. It says "rates, currency, liquidity, correlation with
other assets", and three of those four are just what capital costs, which applies to anyone who
borrows to make something. Cheap money is why there was so much of the stuff to delete. That is my
first act. So the column works. But then it tells me that leaving it empty means my asset is being
explained in isolation from the market it trades in, and my asset does not trade — it sits on a
balance sheet being written down — so the one sentence designed to stop me skipping the column is
the sentence that would let me skip it with a clear conscience. It is a one-line fix. It is also
exactly the kind of one-line fix nobody makes, because the column technically works.

The part I mind is the mechanisms. Every fact has to carry a source and a date, no exceptions, it
says so — and then the mechanism, the thing the notebook itself calls the video, has no source
field at all. For most topics you would never notice, because the mechanism is just the facts
holding hands. Mine isn't. My mechanism *is* a citation. It is a sentence out of a standard, and
which standard, which year and who it binds is the entire content. Strip that and I have written
"for tax reasons" at greater length and with more confidence, which is the coverage I make videos
about. I can route around it — put the treatment in a fact, point the chain at it — but then the
card on the board that says "here is how this works" is the one card with nothing under it, and I
have watched what happens to people who put an uncited rule on screen in front of an audience that
reads footnotes for fun. They do not email you. They quote-post you.

And the scale conversions will get someone killed. Not me — I will strip them — but the field takes
a number and makes it *felt*, and my numbers are mostly not money that moved. An impairment is an
admission that a cost already paid will not come back. Hand that to a step whose worked example is
"about two million dollars, from a company holding billions" and it comes out as a company losing
money this quarter, which is false, which is the single most common error in coverage of my beat,
and the methodic would have produced it for me at speed. There is no field saying what kind of
quantity is being converted. There should be one word.

The counter-case handling I have no complaints about, which I did not expect to write. Asked for
three times, in three files, and the only column that raises its voice. My counter-case is half
right — some of these removals really are a licence running out — and the schema wants one strong
opposing statement where I need a proportion. I can write the proportion into the sentence. Fine.

Three and a half hours instead of nine. I said ninety minutes. It is not ninety minutes, and I am
not going to pretend the gap is small because the rest impressed me. The hour I am holding back is
the hour spent reading the filing, and I am holding it back for a reason the tool has now given me
in writing: it does not have a step for opening a document, and it does not have a place to say
where a rule came from. Fix those two and I will hand over the ninety minutes. Until then this is a
very good outline generator for a subject where the outline was never the hard part.

The falsifiers are correct, though. "Wrong if the next filing shows the balance rising while the
removals continue" — that is a real falsifier, it is checkable, and it will be checked, by me, in
about four months. Which is the whole trick: the accounting tells you what to look for next.

---

## Findings summary

| id | severity | targets | title |
|---|---|---|---|
| `G-L1S-SE-01` | major | notebook-schema, research-prompt | `mechanisms[]` is the only card class exempt from source and date |
| `G-L1S-SE-02` | major | notebook-schema, research-prompt, knowledge | `scale_conversions` is unit-blind — non-cash figures render as cash |
| `G-L1S-SE-06` | major | research-prompt | Phase 1 is a search table with no primary-document step |
| `G-L1S-SE-07` | major | notebook-schema | No provenance class; `sources[]` is URL-shaped, so a creator's own dataset cannot be cited |
| `G-L1S-SE-05` | major | conclusions | No naming or exposure policy; `unhinged` is defined as a motive claim |
| `G-L1S-SE-04` | major | dimensions | `the-number` holds three incommensurable kinds of number |
| `G-L1S-SE-03` | minor | dimensions | `macro.emptyMeans` presumes a traded instrument |

Contradicted brief hypotheses: **#1** (columns did not collapse — 7/7), **#2** (the ladder does not
govern notebooks at all), **#4** (counter-case fully reachable here). Partially confirmed: **#3**,
with the correction that the falsifier requirement *does* constrain checkability adequately and
simply has nothing to do with exposure.
