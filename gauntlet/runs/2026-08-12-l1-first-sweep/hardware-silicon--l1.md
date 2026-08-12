# L1 dry fit — `hardware-silicon` · Wei-Lin Sørensen

**Topic:** "Everyone says the AI bottleneck is GPUs. The capacity numbers say it is high-bandwidth
memory and the packaging step nobody can name."
**Area:** tech · **Lens binding:** tech · **Level:** L1 · **Mode:** paper, no browser, no searches.

**Verdict: `L1-conditional`.**

The mechanism holds my topic better than I expected — all seven columns take material, and the one
column I was sent to attack (`flows`) turns out to be the closest structural match in the set. The
condition is my own senior bar, and it fails on a missing field, not on a missing idea: **nothing in
this methodic carries a unit or a period as structure.** They live in prose, where nothing can check
them, and I can show you the reference run getting it wrong.

---

## 1. Column utilisation

```
columns 7/7 used · 2 orphan groups
```

Orphans named: **process physics** (weak) and **lead time / the lag between commitment and
capacity** (strong).

**This contradicts the orchestrator's first lead.** The brief hypothesised that the seven columns are
market-shaped and would "collapse or leave orphans on non-market topics." They are market-*worded*.
They are not market-shaped. Every column's underlying question survives translation into a physical
supply chain; only its vocabulary doesn't. I placed my material cleanly, as invited.

| Column | My material | Fit |
|---|---|---|
| `the-number` | CoWoS-class advanced-packaging capacity, HBM bit supply, accelerator shipments — with their windows | holds, see §2 |
| `flows` | wafer starts → known-good die → stacks → packaged modules → shipped units; allocation contracts | **strongest fit in the set** |
| `actors` | TSMC, SK hynix, Samsung, Micron, Nvidia, the tool vendors; what governs their capex | clean |
| `macro` | the DRAM/NAND commodity cycle, HBM crowding out commodity bit capacity, KRW/JPY on supplier margins | holds; label misleads (§5) |
| `politics` | export controls, tool controls, CHIPS-style subsidy — and *whether the fab was actually built* | clean, and unusually apt |
| `counter-case` | "GPU supply really is the binding constraint" | clean, see §4 |
| `conclusions` | where the constraint sits and where it moves next | clean |

### 1a. The `flows` question — rename, not lens

I was asked to argue this against the column's stated `purpose`. Here it is.

`dimensions.ts:28` reads: *"Who is buying and selling, through what mechanism, and whether it behaves
as assumed."*

Three clauses. Only the first is financial. The load-bearing pair is **"through what mechanism"** and
**"whether it behaves as assumed"** — and that is not a claim about money, it is a claim about a
*conversion pipeline whose naive reading collapses its stages*. That is exactly, precisely my topic.

The proof is in the incumbent run's own use of the column. `m-etf-plumbing` is filed under `flows`,
and its content is: *an inflow is not a purchase* — authorised participants create and short shares
before buying the underlying, so the reported input is not the realised output. Structurally that is
identical to **a wafer start is not a shipped unit**. Same shape: an input to a multi-stage pipeline
being read as an output, with lag and leakage in between. If `flows` can hold "an inflow is not a
purchase", it can hold "a wafer start is not a stack", because they are the same sentence with
different nouns.

**Ruling: content.** The fix is the word "buying and selling" in one string literal, plus a domain
row in `RESEARCH-PROMPT.md:28`. Nothing about the mechanism resists a physical supply chain. I decline
to call this a lens and I would push back on any judge who tried to hand me one — the bar is *the
mechanism cannot hold it*, and this mechanism holds it better than it holds the topic it was built
for, because a physical supply chain actually has the stages the metaphor was borrowed from.

There is one real structural loss inside `flows`, and it is not a vocabulary problem. It is F-05.

### 1b. Orphan 1 — process physics *(weak)*

Why the packaging step is hard: through-silicon-via yield, warpage under stacking, thermal budget,
and the compounding of known-good-die yield across a stack — lose a little per layer and you lose a
lot per stack. I explain the physical process before the market consequence, always; it is the whole
reason my audience contains people who work at the companies I cover.

This is absorbable into `flows` under "whether it behaves as assumed" — yield loss *is* the plumbing
not behaving as assumed. I am recording it as an orphan anyway, with the honest caveat that it is a
weak one: once absorbed, `flows` is carrying the pipeline, the physics and the allocation contracts,
and it becomes the only column that matters on my topic. A column doing three jobs is a board with
one column and six labels.

### 1c. Orphan 2 — lead time and the lag *(strong, no home)*

A greenfield fab is roughly three years. A packaging line is shorter. An HBM qualification cycle is
its own clock. **The gap between when a commitment is made and when a unit ships is my entire
thesis**, because that gap is what makes an announcement look like capacity.

There is no column for elapsed time. `the-number` is a level over a window. `politics` is
implementation-or-not, which is a binary, not a duration. `macro` is cross-market. Time-to-capacity
is none of them, and it is the axis my topic is actually about. This orphan is real and it pairs with
F-03 in the schema: the notebook cannot mark a quantity as *referring to* a future period, so the lag
has nowhere to live at either level.

### 1d. Testing an `emptyMeans` — as env.md asks

`emptyMeans` is a claim about what an empty column signifies, so it is checkable. I checked two.

- `the-number` (`dimensions.ts:27`): *"No measured baseline — every claim downstream is unanchored."*
  **True in my domain and domain-neutral.** Good field, good line. Keep.
- `macro` (`dimensions.ts:33`): *"The asset is being explained in isolation from the market it trades
  in."* **False in my domain.** My subject is not an asset and it does not trade. An empty `macro`
  column on my topic means "the capacity story is being told without the memory cycle that competes
  for the same wafers" — a different claim, and a reader shown the shipped string would conclude
  something untrue about my notebook. An honest empty state that states a domain-specific claim as
  universal is a *dishonest* empty state everywhere else. That is F-07.

---

## 2. Units discipline — my senior bar

Wafer starts, dies, stacks and shipped units are four different things. A notebook that adds two of
them together is worse than no notebook, because it launders an arithmetic error through a structure
that looks rigorous. I check the arithmetic before I read the argument. Here is the check.

### 2a. The `facts[]` shape, cited precisely

`pipeline/NOTEBOOK-SCHEMA.md:41-47`:

```
### `facts[]`
`{id, claim, load_bearing, source, confidence, as_of, note?}`
```
- `:44-45` — `load_bearing`
- `:46` — `confidence` — `high | medium | low`, with the reason. Vendor research is `low` by default.
- `:47` — `as_of` — every fact is dated. This drives `currency`.

Seven fields. **No `unit`. No `period`. No `basis`.** The quantity, its unit and the window it covers
are all inside `claim`, which `:93` requires to be "one line" of prose. The word "unit" does not
appear anywhere in `NOTEBOOK-SCHEMA.md`, `RESEARCH-PROMPT.md`, `dimensions.ts` or `conclusions.ts`. I
grepped. Zero hits.

`as_of` is not the period. `:47` says what it is for — it drives `currency`, i.e. staleness. It
records *when the fact was captured*, not *what stretch of time the quantity covers*. Those are
different numbers and on my topic they are routinely years apart: a 2026 announcement of 2028
capacity has `as_of: 2026` and describes 2028, and the schema has no way to say so.

The near-miss is worth naming, because it is where the information dies. `RESEARCH-PROMPT.md:27`
asks, for the "The number" domain row only: *"What is it now, what was the extreme, **over what
period**? Get the dates."* So the methodic **asks for the period in Phase 1 and provides nowhere to
put it in the deliverable.** It evaporates between the instruction and the schema, and it is asked
for exactly one of six domains — not for `flows`, which is where every conversion-rate quantity on my
topic lives.

### 2b. It already failed, in the one run that is held up as working

This is not a hypothetical. The reference run compares two quantities across mismatched windows and
gets the direction of the comparison wrong.

- `notebook.json` → `f-whale-absorb`: *"Wallets holding over 1,000 BTC accumulated roughly **270,000
  BTC in the 30 days** to 23 April 2026, and again over a fortnight in late June/early July…"*
  `load_bearing: true`.
- `notebook.json` → `f-midtier-distribute`: *"Holders of 100-1,000 BTC distributed about **77,800 BTC
  over the same 60-day window** — **slightly more than the whale cohort absorbed**."*
  `load_bearing: true`.

Seventy-seven thousand eight hundred is not slightly more than two hundred and seventy thousand. And
"the same 60-day window" is not the 30-day window the first fact declares. Two errors, compounding: a
period mismatch and a magnitude comparison that runs backwards.

It is not confined to one card. It propagates:

- `followup-round-1.md:48-49` is where it enters, as a two-row table with two different windows in
  adjacent cells.
- `:52` states the conclusion drawn from it: *"whale accumulation is real, large, and cancelled
  out."*
- `f-supply-2pct`'s `note` re-states it a third time: *"Mid-tier holders distributed more over the
  same window"* — against 380,000 BTC this time.
- `conclusions.ts:136-146` (`c-scarcity-not-a-floor`) rests on it: *"whales absorbing while the tier
  above retail distributes slightly more."*
- `c-borrowed-prosperity` (`:154`) lists both facts in `restsOn`.

So: a cross-window comparison with an inverted magnitude, on two load-bearing facts, feeding two
conclusions, one of which is graded `leap: "near"` — the *least* speculative tier, meaning it claims
to barely go past the evidence. It survived a follow-up round whose stated job was to resolve this
exact question. Every honesty mechanism in the methodic — confidence, load_bearing, the wound graph,
the falsifier — was present and none of them is an arithmetic check, because none of them looks at
the number.

That is the whole finding. **The methodic checks provenance and never checks quantity.**

### 2c. The quality bar has one number rule and it is rhetorical

`RESEARCH-PROMPT.md:119-130` is the done-check. Ten boxes. The only one that mentions numbers is
`:127` — *"every significant number has a `scale_conversion`"*. That is a requirement that each figure
be made *felt*, not that it be made *right*. There is no arithmetic box, no unit box, no period box,
no reconciliation box.

### 2d. `scale_conversions[]` — does it help?

No. It is for something else, and reading it as a units mechanism would be a mistake.

`NOTEBOOK-SCHEMA.md:67-68`: `{raw, felt}` — *"a number without a comparison is a number the script
wastes."* Both sides are free text, and `:19` says it is consumed by "step 7 — assign concretes". It
is a rhetorical field.

Worse, it pulls the opposite way from reconciliation. `RESEARCH-PROMPT.md:82-84` instructs *ratios
over levels* — *"'roughly half its high' survives months; '$62,000' is wrong next week"*. That advice
is correct for shelf life and corrosive for units: a ratio with no denominator stated is precisely the
figure I cannot check. The reference's own first entry is `"raw": "$126,198 → ~$62,000"` — the *raw*
side already rounded and already a pair. If `raw` is where a unit would live, it is not being used
that way.

`scale_conversions` is for felt-ness. It cannot carry unit discipline and it should not be asked to.

**Criterion 1: FAIL.** Not because a run would necessarily mix units, but because nothing in the
structure can tell whether it did, and the one worked example did.

---

## 3. Announced vs installed capacity

Can the schema keep an announcement and an outcome as **distinct facts**, with the **relationship**
between them expressed? Partly, and better than I assumed — I will give it that before I take it
away.

**Two distinct facts: yes.** They are two rows in `facts[]` with different ids and different `as_of`
values. Nothing merges them.

**The relationship: yes, via `reversals[]`, and there is a working precedent.**
`NOTEBOOK-SCHEMA.md:55-56` gives `{id, obvious_reading, why_wrong, mechanism, evidence[],
escalation}`. The incumbent run uses exactly this shape for exactly this problem: `f-sbr` (the
executive order was signed) and `f-sbr-unbuilt` (sixteen months later there is no stockpile), joined
by `r3`. That is announced-versus-implemented, expressed structurally, and it is the strongest thing
in that notebook. `RESEARCH-PROMPT.md:48` even names the shape — *"**The absent thing** — a change
everyone treats as done that was never actually implemented"* — as tension type 4. My topic is that
tension type with wafers instead of coins.

**So what is missing.** Three things, all of them the difference between "a good researcher can do
this" and "the structure makes it hard to do otherwise":

1. **Nothing marks a fact as a plan rather than an outcome.** An announced 2028 capacity number and a
   2026 shipment number are the same seven fields in the same shape. The reader — and the script step
   — distinguishes them by reading the prose.
2. **Nothing requires the pairing.** `RESEARCH-PROMPT.md:126` requires *at least one* reversal. A
   notebook holding four announcements and no outcomes passes every box in the quality bar.
3. **`as_of` is the wrong clock, per §2a.** An announcement's most important number is the year it
   refers to, and that year has no field.

Point 1 is the one that costs me. Capacity announcements treated as capacity is my first pet peeve
and it is the single most common error in my beat, and this schema's defence against it is that the
researcher will happen to write a reversal.

**Criterion 2: CONDITIONAL PASS.** The mechanism can express it, demonstrably. Nothing makes it
express it, and the two shapes are indistinguishable at the field level.

---

## 4. Evidence-floor check

First, a correction to the brief. **The orchestrator's second lead misidentifies which ladder is in
play.** MEASURED · OBSERVED · INFERRED · ASSUMED is not the notebook's evidence ladder — it is the
*knowledge library's* evidence contract, at `knowledge/README.md:36-41`, governing claims in
`PATTERNS.md` files about video craft. It has no bearing on research facts. Notebook facts are graded
by `confidence: high | medium | low`, with the reason stated
(`NOTEBOOK-SCHEMA.md:46`). So the hypothesis that "the ladder has no honest rung for interpretive
evidence" cannot be tested against research material, because the ladder is not applied to research
material. That is worth the judge's attention on its own: two evidence systems, one repo, easy to
confuse, and I confused them for about ten minutes.

Against the actual grading axis, my three source classes:

**Earnings-call statements.** These are the backbone of my beat and the schema handles them badly —
not by refusing them, but by collapsing two questions into one field. "Did the CFO say this?" is
near-certain. "Is what the CFO said true?" is not, and for a forward capacity commitment it is
barely a claim about the world at all. `confidence` has to express both at once, and any answer is
wrong. `high` launders a company's plan into a fact; `low` misrepresents a verbatim, on-the-record,
legally-exposed statement. In practice I would write `confidence: "high — first-party statement;
treat as testimony not measurement"` and rely on a prose caveat holding, which is the same failure
mode as §2. The field wants one number and the situation has two.

**Analyst estimates.** My second pet peeve — cited without the analyst. `facts[].source` is a free
string and `sources[]` (`:88`) is a flat URL array with **no join between them**: a fact cannot point
at a source entry, so nothing detects a fact whose source is a description rather than a citation.
The reference shows exactly the degradation I would predict, on load-bearing facts: `"CryptoQuant via
search"`, `"on-chain data via intellectia"`, `"on-chain cohort analysis via aggregators"`. Those are
routing notes. None of them names who computed the number. That is F-04.

**Capacity trackers.** Here the methodic is *good* and I want that on the record, because I came in
expecting to have to argue for it. `NOTEBOOK-SCHEMA.md:46` — *"Vendor research is `low` by default"* —
is the correct default for a paid capacity tracker, and it is the correct default even though those
trackers are frequently the best number that exists. `:44-45` then requires that a low-confidence
load-bearing fact be flagged for a second source, and `RESEARCH-PROMPT.md:123` enforces it in the
quality bar, and `:108` names "laundered confidence" as an anti-pattern. That chain is exactly right
for my domain and it is the strongest honesty machinery in the methodic.

The consequence for me is unpleasant but honest: on my topic, tracker data is low-confidence and
load-bearing simultaneously, so nearly every fact I write trips the second-source rule and the
second source is another tracker reading the same fab. The methodic will correctly tell me my
notebook is thin. It will be right. That is a fact about semiconductors, not a defect in the
methodic, and I am not recording it as a finding.

---

## 5. Counter-case reachability — "GPU supply really is the binding constraint"

Reachable, at full strength, and I would not have to manufacture it.

The mandate is there in three places: `RESEARCH-PROMPT.md:32` (the Phase 1 domain row), `:34` (*"That
last row is not optional and is the one most often skipped"*), Phase 6 at `:87-93`, plus
`NOTEBOOK-SCHEMA.md:61-65` making `steel_man` a required field and `dimensions.ts:36-37` giving it a
column whose `emptyMeans` is flagged DANGEROUS. Four independent reinforcements of one requirement.
That is the best-defended part of this methodic and it is defended in the right proportion.

The steel-man itself is genuinely strong on my topic and I would state it in its believers' words:
the accelerator vendor's own allocation commentary, hyperscaler capex disclosures, and lead-time
statements all describe a queue for *chips*, and the people in that queue are not confused about what
they are waiting for. A version of my thesis that cannot survive that is not worth publishing.

Two caveats I am flagging for L2 rather than scoring as failures:

1. **My counter-case is built from the same data as my case.** Both readings are computed off the
   same tracker's capacity series; they disagree about which stage binds, not about the numbers. The
   notebook has no way to record "these two claims share an underlying dataset", which means the
   steel-man can look independent when it is not. I am not filing this as a finding — the schema
   arguably shouldn't model dataset provenance — but a judge should see it.
2. **L1 reads the prompt charitably and I am aware of it.** The requirement being well-defended on
   paper is not evidence a run satisfies it. The reference's own `research_gaps` says so out loud:
   *"No bear-case-is-wrong source — did not search for the strongest 'this is normal cycle behaviour'
   argument, which weakens the steel-man."* Four reinforcements, and the one run we have still skipped
   it and honestly said so. That is the correct thing to test at L2 and it is not a fair L1 score.

**Criterion 3: PASS on paper, flagged for L2.**

---

## 6. Engine availability — all seven

| Engine | Fit | Why |
|---|---|---|
| **A · Reversal Chain** | **excellent — recommended** | "It's a GPU shortage" → no, it's memory and packaging → **but that correction is now itself the consensus, and here is what it already gets wrong.** The self-attack `ENGINES.md:33-39` demands is available for free: my own worry about being a year late *is* the second turn. |
| **B · Effort/Payoff Gap** | **good — the surprise of this walk** | `ENGINES.md:49-51` — "a mechanism a viewer could operate". Walk one wafer to one shipped accelerator: front-end weeks, TSVs, stack, known-good-die attrition, packaging slot, test. The payoff is a shockingly small number of units. **This is my unit reconciliation converted into the viewer's pleasure**, which is the single most useful thing this catalogue told me today. |
| **C · Parallel Case** | good | The 2021 automotive shortage as the familiar domain, fully mechanised, transferred to accelerators. `ENGINES.md:64-66`'s 67s/47s split works — the rule is already owned by the audience. |
| **D · Adjudication** | good | Candidates: GPU dies · HBM bits · packaging slots · power and datacenter shell · *nothing is actually constrained, demand was pulled forward*. That fifth candidate satisfies the D-honest premise test at `ENGINES.md:87-90` — my premise is in the candidate set. |
| **E · Briefing** | **poor** | `:119` — "new and the viewer has no position yet". Everyone has a position and this is a standing condition, not news. Same failure as the reference run's. |
| **F · Anchor Ladder** | good *(short)* | One stack as the single anchor; rungs die → stack → package → board → rack, each defeating the previous mental model. `:139-142`'s naturally-ordered difficulty is literal here — it is a physical stack. |
| **G · Paradox Teaser** | good *(short)* | "This is not a GPU shortage. This is not a GPU shortage either." Then the packaging line nobody can name. |

**6 of 7 available, 1 poor, 0 blocked.**

The skill says zero is a blocker and seven is a smell. Six makes me want to argue with the heuristic
rather than accept the diagnosis, and I explain why in §9 — it is an observation with no target file,
so it stays out of the findings table.

---

## 7. Scored criteria

| # | Criterion | Result | Reason |
|---|---|---|---|
| 1 | Every quantity carries its unit and its period; mixed units are a fail | **FAIL** | `facts[]` (`NOTEBOOK-SCHEMA.md:42`) has neither field; `as_of` is staleness, not period (`:47`); the word "unit" appears nowhere in the methodic; `RESEARCH-PROMPT.md:27` asks for the period and gives it nowhere to land. Demonstrated failure in the reference: `f-whale-absorb` (30d) vs `f-midtier-distribute` ("same 60-day window", 77,800 called "slightly more" than 270,000). |
| 2 | Announced and installed capacity are distinct facts, never merged | **CONDITIONAL PASS** | Two facts plus a `reversal` express it, with a working precedent (`f-sbr` / `f-sbr-unbuilt` / `r3`). But no field marks a plan as a plan, and nothing requires the pairing. |
| 3 | The counter-case is present at full strength with its best source | **PASS (paper)** | Mandated four times over; column exists; `steel_man` required. L1 charity acknowledged — the reference still skipped the strongest version and said so in `research_gaps`. |
| 4 | At least one reversal turns on a supply-chain mechanism, not a price | **PASS** | `reversals[].mechanism` is required (`NOTEBOOK-SCHEMA.md:56`) and `mechanisms[]` are causal chains (`:49-53`). Nothing in either field is price-typed. My yield/packaging reversal drops straight in. |
| 5 | `flows` holds the physical supply chain | **PASS** | §1a. Content rename of one string. The column's own incumbent card (`m-etf-plumbing`) is structurally my topic. |
| 6 | No conclusion forecasts a price | **PASS, with a lean I don't like** | Nothing forbids it — but the mandatory `falsifiableBy` (`conclusions.ts:49-50`) quietly *rewards* forecast-shaped claims, because a dated prediction is the cheapest checkable falsifier to write. See `c-correlation-is-the-product:99-100`. F-06. |
| 7 | Under 90 minutes equivalent | **FAIL** | §8. |

---

## 8. Time-saved estimate

**`~180 min saved · medium confidence`** — against a manual baseline of ~600 min and an acceptance
threshold of 90.

The arithmetic, since it is mine to do:

- My 10 hours splits roughly ~6h of unit reconciliation and ~4h of reading, argument-building and
  deciding what the story is.
- The methodic attacks the second half well. Phase 2 tension-finding, Phase 3 mechanism chains, Phase
  4 pre-computed turns and Phase 6's steel-man are genuinely most of what my 4 hours produces, and
  the notebook-as-asset design means a second script costs nothing.
- It does not touch the first half. **There is no reconciliation step, no unit field, and no
  arithmetic check anywhere in the quality bar.** I said I would keep doing that myself, so this is
  not a complaint — it is the reason the ceiling is where it is.
- Then subtract a verification tax. Because units and periods live in prose, I cannot trust a
  quantity in this notebook without re-deriving its basis from the claim text. Call it 30 minutes,
  and call it optimistic given §2b, where re-deriving would have been the only thing that caught the
  error.

Net: roughly 3 hours saved, landing me at ~7 hours against a 90-minute bar. It does not clear it,
and it does not clear it by 5½ hours, so no amount of tuning gets there. **The gap is exactly the
work the methodic has no field for.** Add `unit` and `period` to `facts[]` and a reconciliation box
to the quality bar and a large share of my 6 hours becomes reviewable-at-a-glance rather than
rebuilt-by-hand — which is the only edit in this report that would move this number materially.

Confidence is **medium**, and capped there by `accepted-gaps.md` § `scope-note`: there is no runner,
so this is an estimate of what the methodic *would* save if executed as written, not a measurement of
a product.

---

## 9. Voice — Wei-Lin

I came in expecting to spend this pass arguing that a board built for a market cannot hold a supply
chain. I was wrong, and I would rather say so in the first line than bury it.

`flows` is fine. It is more than fine — it is the best-fitting column in the set, because the thing
it was actually built to model is a conversion pipeline whose stages get collapsed by the naive
reading, and a market only has one of those by analogy. I have one. It has five stages and a yield
loss at each. Someone wrote "who is buying and selling" at the front of a good idea and it is being
mistaken for the idea. Change eleven words in a string literal. That is the whole fix, and if a
judge tries to hand me a lens for it I will decline it in writing.

What I cannot let go is the arithmetic.

I read `facts[]` before I read anything else, because that is where I would have to live. Seven
fields. `id`, `claim`, `load_bearing`, `source`, `confidence`, `as_of`, `note`. There is a field for
how sure you are and a field for when you looked and a field for whether the argument falls over
without it, and there is no field for *what the number is a number of*. The unit is in the sentence.
The period is in the sentence, if the researcher remembered, and `RESEARCH-PROMPT.md` asks them to
remember for one domain out of six and then hands them a schema with nowhere to write it down. In my
beat, "300,000 wafers" and "300,000 stacks" and "300,000 units" are three different videos and two of
them get me a letter from an IR department. A structure that stores all three identically is not
neutral about that. It is optimistic.

Then I checked the run everyone points at.

Two hundred and seventy thousand coins absorbed over thirty days. Seventy-seven thousand eight
hundred distributed over — and the fact says this itself — "the same 60-day window." The window is
not the same. And the sentence claims the smaller number is "slightly more" than the larger one.
Both facts are marked `load_bearing: true`. Both are cited by `c-scarcity-not-a-floor`, which is
graded `leap: "near"`, the tier reserved for claims that barely go past the evidence. It went past the
evidence in the first digit. It entered through a follow-up round whose stated purpose was to *resolve*
this exact question, was written up as "the answer to the whale question", and was still there when
three scripts rendered off it.

That's a different number. That is a complete rebuttal and I am aware that it sounds like a cheap
one, so let me be precise about the target: **I am not indicting the person who wrote it.** Everyone
does this; I do it, which is why six of my ten hours are spent not doing it. I am indicting a
document that lists ten quality boxes, requires a source and a date and a confidence and a
falsifier for every claim, names "laundered confidence" as an anti-pattern — and never once asks
whether the numbers are the same kind of thing. The only box in that list that touches a figure asks
whether it has been made *felt*. It had been made felt. It was felt beautifully. It was also wrong by
a factor of three and a half and the notebook had no organ that could notice.

The honesty machinery in here is real and I want to be fair to it. Vendor research low by default,
load-bearing-and-low flagged for a second source, conclusions off until admitted, falsifiers
mandatory, the steel-man defended in four separate places. That is a serious apparatus and most of my
industry does not have one. But every part of it points at *provenance*. Not one part points at
*quantity*. You have built an excellent machine for asking where a number came from and no machine at
all for asking what it is.

Two smaller things I owe the record.

The falsifier requirement has a lean in it. Ask someone for the cheapest checkable falsifier and they
will reach for a dated prediction, because a prediction is the easiest thing in the world to check
later. Look at what the reference produced: "a risk-off episode in which Bitcoin holds while the
Nasdaq falls", "sustained net inflows through a year in which price falls." Those are good falsifiers.
They are also forecasts wearing a lab coat. Nothing in `conclusions.ts` forbids a conclusion that
forecasts a price, and the one field it does mandate gently pulls toward one. I do not forecast
prices. I would like the structure to be indifferent about that rather than mildly encouraging.

And the engine catalogue told me something I did not know, which I did not expect from a paper walk.
Engine B — the Effort/Payoff Gap, the one that spends a third of its runtime doing something tedious
so you feel what it costs. I have been treating the unit reconciliation as the boring precondition to
my video. It is the video. Walk one wafer all the way to one shipped accelerator, lose die at every
step out loud, and end on how few units come out of the far end. My audience contains people who do
this for a living and they would watch that to check my numbers, which is the best reason anyone ever
watches anything I make.

Two observations with no target file, so they stay out of the table where the rubric says they
belong.

First: six of seven engines fit my topic, and the skill says seven is a smell. I do not think the
heuristic is right. It reads breadth as shapelessness, but my material is a *process*, and a process
is engine-fertile by nature — it can be a correction, a walk-through, a ladder or a contested
question without being any less specific. Only one of my six is a coin flip (A versus D). The rest
are different lengths. Counting engines measures how many ways material can be told, not how sharp
it is, and those are different quantities. Which, I notice, is my complaint about everything else in
this report.

Second: there are two evidence ladders in this repo, MEASURED/OBSERVED/INFERRED/ASSUMED for craft
claims and high/medium/low for research facts, and they are two files apart with no cross-reference.
I spent ten minutes grading my earnings-call sources against the wrong one. Someone else will spend
longer.

Verdict, plainly. The mechanism holds my topic — seven columns, six engines, and the one column I
was sent to break turned out to be the one built for me. I will not sign a notebook produced by this
methodic, and the reason is one missing pair of fields and one missing checkbox. That is a smaller
gap than I expected to find and a harder one to shrug off, because there is a worked example of it
going wrong sitting in the repo with three scripts rendered off it.

Fix `facts[]` and ask me again. I would rather be an easy yes than a principled no.

---

## 10. Findings summary

| id | severity | target | title |
|---|---|---|---|
| `G-L1S-HS-01` | blocker | `notebook-schema` | `facts[]` carries no unit and no period |
| `G-L1S-HS-02` | major | `research-prompt` | The quality bar has no arithmetic or reconciliation check |
| `G-L1S-HS-03` | major | `notebook-schema` | No distinction between an announced quantity and a realised one |
| `G-L1S-HS-04` | major | `notebook-schema` | `facts[].source` is free text with no join to `sources[]` |
| `G-L1S-HS-05` | minor | `dimensions`, `ui` | A column is an unordered set; a supply chain's thesis is positional |
| `G-L1S-HS-06` | minor | `conclusions` | The mandatory falsifier leans toward forecast-shaped claims |
| `G-L1S-HS-07` | minor | `dimensions` | Column purposes and one `emptyMeans` state market claims as universal |

All seven `content`. No lens requested. Full records, with refuter passes, in
`hardware-silicon--findings.json`.
