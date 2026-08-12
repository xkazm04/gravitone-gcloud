# L1 dry fit — `consumer-scam` (Nadia Brooks, "Income Disclosure")

**Topic:** an MLM's income disclosure statement — a legally-required document that says the company is
not a business opportunity, read against three prior vintages and the compensation plan.
**Area:** fraud · **Level:** L1 · **Mode:** paper walk, no searches, no browser.
**Verdict: `L1-conditional`.** The methodic will produce a notebook for this topic. It will not
produce one Nadia can put her name on, because the one property her credibility rests on —
re-derivability — is the property the schema has no field for.

*(Paper exercise. No real company is named or researched anywhere below; every example figure is a
placeholder standing in for the shape of the arithmetic.)*

---

## 1. Column utilisation

```
columns 6/7 used · 3 orphan groups
```

Orphans, named: **`document-construction`**, **`documented-omissions`**, **`vintage-comparability`**.

| Column | Held? | What goes in it |
|---|---|---|
| `the-number` | ✔ (strained) | The headline figures: median annual earnings, % earning nothing, % at each rank. |
| `flows` | ✔ **strong** | The compensation plan. Who pays whom, through what plumbing, and whether it behaves as participants assume. This is the best fit on the board. |
| `actors` | ✔ (constrained) | The company, the top rank tier as a *cohort*, the regulator, the trade body. Never an individual. |
| `macro` | ✘ **empty** | Nothing. Rates, currency and liquidity have no analogue in a document read against itself. |
| `politics` | ✔ **strong** | The disclosure rule itself, what it obliges, and — `dimensions.ts:34-35`, "whether it was actually implemented" — whether anyone enforces it. |
| `counter-case` | ✔ | The company's own framing, which is printed in the same PDF as the prosecution's evidence. |
| `conclusions` | ✔ | Structural conclusions about the compensation plan. |

### Against the orchestrator's HYPOTHESIS 1 — **contradicted, and I want that on the record**

The lead says the seven columns "are market-shaped and will collapse or leave orphans on non-market
topics." Six of seven took my material without argument. Underneath the market labels the columns are
a generic causal skeleton — *the quantity · the plumbing · the agents · the environment · the rules ·
the objection · the synthesis* — and that skeleton is not market-specific at all. `flows` and
`politics` are the two strongest fits on my board and neither needed stretching. The lead is wrong
about the shape.

The lead is right about something narrower and worse, which I would rather it had said:

- `RESEARCH-PROMPT.md:21-22` is **honestly scoped**: "For a market/economics topic, that is at minimum:".
  It never claims universality.
- `dimensions.ts:1-5` then **silently universalises it**: "the review columns are the research brief's
  own checklist, not a fresh invention."
- And `dimensions.ts:7-14` makes `DimensionId` a **closed TypeScript union**. So the prompt's honest
  caveat has no way to become a different column set. There is exactly one domain table in the whole
  methodic and no instruction telling a non-market researcher what to do instead.

That is why my fit is *good by luck*. A fraud/document topic gets a table written for prices and
happens to survive. The next one won't.

### The three orphans, and why each is genuinely homeless

**1. `document-construction`.** Who counts as a "participant"? Does the denominator include people who
joined and quit in March? Are discount-only buyers in or out? Is the figure gross or net of the
starter kit? These are not facts about the world — they are facts about *the instrument that produced
every other fact*. `the-number` holds the figure and drops the footnote that decides what the figure
means. This is the load-bearing half of my job and the board has nowhere to put it.

**2. `documented-omissions`.** See §3. It is the finding, and it has no column.

**3. `vintage-comparability`.** When the 2023 disclosure counted "active" one way and the 2025
disclosure counts it another, the three-year series I built my video on is not a series. `currency`
(`NOTEBOOK-SCHEMA.md:84`) is about *our* shelf life, not the *source's* internal comparability. Different
question, no field, no column.

### The unusual bit you asked me to check

My single strongest source is published **by the subject**. The methodic is built around adversarial
multi-domain sourcing — `RESEARCH-PROMPT.md:20` opens with "breadth", the domain table is six
*different* places to look, and `research_gaps` (`:110-113`) is scored on how many domains you *didn't*
reach. There is nowhere in the methodic that can represent **"the primary evidence is the subject's own
legally-required disclosure, and reading it four times is the work."** Not a column, not a field, not a
phase. Breadth is the whole design and my topic is depth on one document. That is the single sentence
I would hand the judge.

---

## 2. Percentages and denominators

**The question: can a fact carry a percentage AND the base it is a percentage of, as structured data,
so nothing downstream can quote the percentage bare?**

**No.** Not close.

`facts[]` is `{id, claim, load_bearing, source, confidence, as_of, note?}` — `NOTEBOOK-SCHEMA.md:42`.
There is no `value`, no `unit`, no `base`, no `population`, no `derivation`. A percentage and its
denominator can only both live inside one free-text `claim` string, and `NOTEBOOK-SCHEMA.md:92` ("No
prose. Claims are one line.") pushes against putting the qualifier there. Nothing downstream can even
*detect* that a fact contains a number, let alone that the number lost its base.

`scale_conversions[]` is `{raw, felt}` — `NOTEBOOK-SCHEMA.md:67-68`. Two strings.

And here is the sharpest thing I found all day. Look at the field directly below it:

- `analogy_candidates[]` is `{for, analogy, quality}` — `NOTEBOOK-SCHEMA.md:70-71`. It has a **`for`**.
  An analogy is bound to the thing it explains.
- `scale_conversions[]` has no `for`. **The one structure in the notebook whose entire job is
  arithmetic is the one that lost its cross-reference.** A rhetorical device is traceable; a number is
  not.

You can watch it happen in the incumbent run. `notebook.json:304-329` — six conversions, twelve
strings, not one fact id among them. `notebook.json:330-346` — three analogies, every one carrying
`"for": "m-treasury-flywheel"`. Same file, same author, same hour.

### The loss is demonstrated, not hypothesised — and it is in the shipped artifact

I did not need a run to prove the qualifier dies at the render boundary. It already died:

| Notebook says | Script says |
|---|---|
| `notebook.json:139` — correlation "sits in the 0.70–0.80 range **in risk-on conditions**" | `script--adjudication.md:98-99` — "correlation with the Nasdaq now sits around zero point seven to zero point eight" |
| `notebook.json:163` — "~380,000 BTC (~$24.3bn, **almost 2% of supply**) over a 30-day window" | `script--adjudication.md:46-47` — "roughly three hundred and eighty thousand Bitcoin in a single month" |
| `notebook.json:168` — the note: "it was **ONE COHORT, not the market**. Mid-tier holders distributed more" | `script--adjudication.md:48-52` — the verdict on Candidate 1 does not mention it |

Three qualifiers, three drops, one render. In my domain each of those is a correction video. The
second one is the exact species: a raw count survived, the base it was 2% *of* did not, and a viewer
now cannot tell whether 380,000 is a lot.

`notebook.json:113` is worse in kind — "MSTR fell ~70%" is a percentage with no base of any sort, and
`script--adjudication.md:79` repeats it bare. **A percentage without a base is not a weak fact. It is
not a fact.**

### Where `scale_conversions[]` is genuinely right, and I will say so

Phase 5 (`RESEARCH-PROMPT.md:79-86`) is the one phase built for me. "Percentages into people" *is* a
scale conversion, and "0.3% earned above the threshold" → "three people in a thousand — in a room of
nine hundred at your convention, two" is exactly what `{raw, felt}` is for. The mechanism holds the
**output** of my arithmetic beautifully.

It cannot hold the **input**. No base, no fact id, no derivation. So the conversion is unauditable,
and an unauditable conversion is the one thing my audience is trained to distrust — because it is what
the upline does.

One more, and it is a direct collision with my senior bar. `RESEARCH-PROMPT.md:84-85` instructs
"**ratios over levels** — 'roughly half its high' survives months; '$62,000' is wrong next week", and
`notebook.json:368` hardens it into "Say 'around $60,000'... **Never a precise figure.**" That is
correct shelf-life advice for a price and it is a disaster for a filing. A disclosure figure is
*fixed for that year forever*. My whole method is: the exact number, the exact page, the exact year,
check me. The methodic's durability rule tells me to round away the only thing that makes me
checkable. It needs to know the difference between a quantity that moves and a quantity that was
published once.

---

## 3. Omissions — my second central test

**What the disclosure does not say is my evidence.** Not context, not caveat — the finding. "The
statement reports gross income and does not report expenses" is a sentence about the document that is
worth more than any number in it.

I checked both candidate homes and read them for what they *do* downstream, not what they're called.

**`unknowns[]` — `{what, why, impact}`, `NOTEBOOK-SCHEMA.md:76-78`.** This is *our* ignorance. Rule 5
(`:99`): "An unknown with no consequence for the script is a note, not a constraint" — and `impact` is
defined as "what the script **may not say**". The field's whole function is to *restrict* speech. If I
file "the disclosure omits expenses" here, I have filed the strongest claim I own in the field whose
job is to stop me making claims. The polarity is inverted. `notebook.json:359-374` confirms the
intended use — price ambiguity, causality-vs-correlation, all of it hedging.

**`research_gaps[]` — `NOTEBOOK-SCHEMA.md:88-89`, `RESEARCH-PROMPT.md:110-113`.** "What the run did
**not** do. Primary sources you used an aggregator for, domains you skipped." This is *the
researcher's* failure. Filing "the company omits expenses" here reads as "we didn't look up expenses" —
it doesn't just lose the finding, it makes the notebook's own honesty ledger tell a lie about itself.

**So: is there a home? Partially, and I'm going to be precise rather than dramatic about it.**

A negative fact is *expressible*: `facts[].claim` is free text, so "The 2025 disclosure does not report
expenses" is a legal fact. It even satisfies Rule 2 (`:94`) — it has a source (the document) and a date
(its vintage). Anyone claiming "there is no home for omissions" has not read `facts[]` carefully. I am
recording that honestly because another Creator is testing this from a different angle and a
convergence built on an overstatement is worthless.

What is **confirmed-absent** is narrower and harder to wave away:

1. **No structured marker that a fact is an absence.** Nothing downstream can tell "the document
   reports X" from "the document does not report X". They are the same shape to every consumer.
2. **No instruction to hunt for omissions.** All six Phase-1 rows (`:24-33`) ask "what is there".
   Phase 7 asks what *I* don't know. Nothing asks what the primary document declines to say.
3. **No column** — see orphan 2. And an untagged absence-fact falls through `?? DEFAULT_DIMENSION`
   (`dimensions.ts:62`) into "The number", where the omission is filed as a price. That is `G-000`;
   I am citing it, not reopening it.

**And now the part that decides it.** The methodic *already knows* absence is load-bearing — twice:

- `RESEARCH-PROMPT.md:48`, tension shape 4, "**The absent thing** — a change everyone treats as done
  that was never actually implemented." That shape produced the incumbent run's best beat
  (`notebook.json:63-70`, the unbuilt reserve). So absence-as-evidence is blessed at the *tension*
  level and unrepresentable at the *fact* level.
- `pipeline/DIRECTOR-DIMENSION.md:156-161` reasons the question through explicitly for the visual
  layer and resolves it: "`absence` rejected as a function, kept as a modifier... It is
  `function: evidence` with **`negates: true`**. The flag still earns its place, because **an absence is
  the visual most likely to be silently dropped by a downstream step that cannot render it.**"

Read that last clause again. The frames proposal invented a flag specifically because absences get
silently dropped by downstream steps — and the notebook that feeds it has no such flag. The design has
had this argument, won it, and applied the answer one layer too late. `DIRECTOR-DIMENSION.md:396-401`
even carries `"exists": "no"` and `"supports": ["f-sbr-unbuilt"]` — an existence flag *and* the
cross-reference `scale_conversions` is missing. The proposal layer solved both of my problems for
pictures.

**Ruling: schema gap, confirmed, scoped.** Not "no home" — no *marker*, no *instruction*, no *column*,
while the design's own downstream proposal already concedes the principle.

### On deliberateness — and a contradiction of HYPOTHESIS 3, from my side

"The omission is deliberate" is a claim about motive. `conclusions.ts:32-33` routes motive to
`unhinged` — "the least verifiable kind of claim there is — nobody can source what someone intended...
indefensible as fact." For my beat that is **correct and I want it kept**. I never claim intent. My
move is: the omission exists, and the structure benefits from it, and you can decide. The ladder gates
me exactly where I gate myself.

The lead worries `unhinged` is unsafe when a conclusion names a living person. From my seat the tier
is fine; the falsifier requirement (`conclusions.ts:55`) plus OFF-by-default (`:15-16`) is real
constraint, and `notebook.json`'s own unhinged conclusion (`conclusions.ts:163-179`) carries a
genuinely checkable falsifier. The danger is not the tier. The danger is *upstream of it*: if the
observed omission can only be stated as a **conclusion**, it inherits a `leap`, it inherits
OFF-by-default gating, and my strongest evidence arrives at the board switched off next to my
speculation. Fix the fact layer and the leap ladder is fine.

---

## 4. Evidence floor — where does the ladder put a company's own filing?

First, a correction to the brief's framing that I think matters more than the hypothesis it carries.

**There is no MEASURED · OBSERVED · INFERRED · ASSUMED ladder in the research methodic.** It does not
appear in `RESEARCH-PROMPT.md` or `NOTEBOOK-SCHEMA.md`. It lives in `pipeline/DIRECTOR-DIMENSION.md:9`
— a document that says of itself at `:3-5` "**Nothing here is implemented**" — and it is used there to
label *the repo's own design claims*, not research evidence. HYPOTHESIS 2 asks me to find an honest rung
on a ladder the artifact under test does not have.

What a notebook actually has is `confidence: high | medium | low` (`NOTEBOOK-SCHEMA.md:46-47`) and
`load_bearing` (`:45`). One axis, and it measures **source reliability**.

So where does my filing land? The only rule touching self-interested sources is
`NOTEBOOK-SCHEMA.md:47`: "**Vendor research is `low` by default.**" A company's own income disclosure
is, by any reading, vendor research about itself. The rule demotes to `low` the most authoritative
artifact in my topic — legally required, published by the subject, the same document the company's own
lawyers signed off. And `:45` says load-bearing facts at low confidence "are the single most dangerous
thing in a notebook", so my *entire* notebook is flagged dangerous by construction.

Meanwhile the anti-pattern list (`:109`) warns against "**Laundered confidence** — a vendor statistic
promoted to fact by being restated without its source." Correct in spirit and it points at the real
problem: `confidence` is being asked to carry two questions that have opposite answers here.

| Question | Answer for an income disclosure |
|---|---|
| Is the transcription reliable? Did they publish this number? | **High.** It is the primary source. There is no better one. |
| Is it a reliable description of the world? | **Contested.** The subject chose the population, the definitions and the denominator. |

One scalar, two answers, and it resolves to the wrong one. **Authoritative and self-serving is a real
category and the methodic has no way to say it.** That is the finding, and it is a cleaner statement of
the evidence-floor problem than "the ladder starts too high" — my problem isn't that my evidence is
weak, it's that it is simultaneously the strongest and the most interested, and there is one field.

---

## 5. Counter-case reachability

**Fully reachable — and this contradicts HYPOTHESIS 4 for my topic, emphatically.** The counter-case is
printed in the same PDF as my evidence, usually in the footnotes, and the trade body publishes a
polished version of it. I have the opposite problem to the 48-hour-news seats: my steel-man is *too*
easy to find and I have to resist making it sound easy.

The company's own best framing, stated at full strength, as they would say it:

> "These figures include every person who signed an agreement in the period, and the large majority of
> them never intended to build a business at all — they joined to buy products at a discount, for
> themselves and their families. Judging a business opportunity by the earnings of people who never
> pursued it is like judging a gym by the members who never came. Among participants who were active
> for a full year and met the plan's stated qualification requirements, average earnings are
> substantially higher — and that figure is in the same document."

That is genuinely strong. It attacks the **denominator** — which is precisely why the denominator has
to be structured data and not a phrase in a sentence. My prosecution and my steel-man are fighting over
the same field, and §2 established the notebook doesn't have that field. The two central tests of this
walk turn out to be one test.

**The schema cannot hold it the way I need it.** `steel_man` is `{claim, evidence[], statement,
why_include}` (`NOTEBOOK-SCHEMA.md:61-62`) — `statement` is free prose with no source, no date, no page,
no quotation marker. `counter_positions_to_state_fairly[]` (`:74`) is worse: a bare array of strings,
unsourced, undated (see `notebook.json:354-358`). And `sources[]` (`:88`, `notebook.json:413-427`) is a
flat list of URLs with no title, publisher or vintage.

My load-bearing move — the one I make in every video — is **"and that's their document, not mine."**
It only works if the quotation is verbatim, attributed, and dated to the edition. Nothing in the schema
distinguishes *my paraphrase of their argument* from *their words*. In a domain where the letters come
from lawyers, that distinction is not a nicety.

---

## 6. Engine availability — all seven walked

| Engine | Fit | Reasoning |
|---|---|---|
| **A · Reversal Chain** | **good** | "The disclosure proves people make money" → the median says otherwise → "but most of them never tried" → but the plan's own qualification requirements say otherwise. Four honest turns, self-attack available (`ENGINES.md:36-39`). My default. |
| **B · Effort/Payoff Gap** | **excellent — and the catalogue would never route me here** | "A mechanism a viewer could operate" (`ENGINES.md:52-54`) *is* the compensation plan, and the engine's pleasure is "the disproportion between labour and reward" — which is my thesis verbatim. Fireship spends 33% of runtime incrementing memory cells to print two words (`:56-58`); I spend 33% of runtime climbing the qualification ladder to arrive at the disclosed median. Best fit in the catalogue. |
| **C · Parallel Case** | **medium, and the safest** | Establish the rule in a familiar structure, transfer. `ENGINES.md:62-63`: "The viewer is never told they were wrong." My audience is *currently in one*, and contempt makes people defend the thing. This is the only engine that lets me be right without making a viewer defend their upline. |
| **D · Adjudication** | **poor** | There are no competing explanations. There is one document and arithmetic. Manufacturing four candidates would trip its own D-rigged tells (`ENGINES.md:83-96`). Correctly poor, and the catalogue would tell me so. |
| **E · Briefing** | **situational** | Poor for fifty-one weeks; excellent on the morning a new vintage drops. The catalogue has no notion of a *recurring* news peg (`:117-119` assumes novelty). Minor. |
| **F · Anchor Ladder** | **structurally right, tonally disqualifying** | See below. |
| **G · Paradox Teaser** | **good** | "This document says it is not a business opportunity. This person says it is. Same company. Same week." Flat contradiction, repeated, reveal, absurd detail, open loop to the long piece (`ENGINES.md:146-155`). Genuinely strong short-form for me. |

Four real fits, one situational, one poor, one disqualified. Not zero (blocker), not seven (smell).

### Is Anchor Ladder right, or does it trivialise? — **it trivialises, and precisely.**

The skeleton is a perfect match. `ENGINES.md:169`: "a concept with naturally ordered difficulty." A
rank ladder *is* naturally ordered difficulty. One anchor — a room of a thousand new recruits — and
each rung is the next rank: how many are still active at twelve months, how many reach rank one, rank
five, the top tier. `:140`: "Each rung is linked by *but* — each new task defeats the previous
solution." That is exactly what a qualification ladder does to a cohort. Structurally it is the best
description of my material in the document.

Two problems, and neither is fixable by writing better content.

**It compresses away the derivation, and the derivation is the product.** F is catalogued at
`ENGINES.md:132` as short form, MEASURED at 57 seconds, "the highest information-density structure
observed anywhere in the corpus" (`:142`). It achieves that density by *dropping the working* —
Fireship never proves bubble sort is O(n²), he shows you the cards and you accept it. My senior bar
(`creators/consumer-scam.md:32-34`) is that a viewer can check my numbers against the company's own PDF
in ten minutes. An engine whose defining virtue is compression-by-omission, handed a topic whose
defining virtue is auditability, produces a beautiful sixty seconds that nobody can check — on a
subject where being uncheckable makes me indistinguishable from one more person shouting at people
about their income.

**Its affect is comic, and my rungs are people.** The witnessed ladder lands on a joke — "throw them in
the air and hope, O(n!)" (`:137-138`). The same rhythm applied to my ladder is four cohorts of real
people failing in sequence, with a punchline at the top. That is mocking participants rather than the
structure, which is my first pet peeve and the reason my comments section still talks to me.

**And the notebook cannot record any of that.** `engine_fit[]` is `{engine, fit, why, recommended?}` —
`NOTEBOOK-SCHEMA.md:80-82`, and `fit` is a single scalar. "Structurally excellent, tonally
disqualifying, do not use with this audience" has to collapse into one word. Look at
`notebook.json:376-398`: every entry judges *material shape* only — "no second domain to transfer to",
"no news event". There is not a single note anywhere in the catalogue about **register**, or about who
is watching. `ENGINES.md:7-9` characterises engines by "the viewer's pleasure" and never once by what
the engine does to a viewer who is *inside* the subject.

For a fraud beat, engine choice is an exposure decision before it is a craft decision. The catalogue
does not know that.

---

## 7. Scored criteria

| # | Criterion | Result | Why |
|---|---|---|---|
| 1 | Every percentage carries its denominator as a separate fact | **FAIL** | No structured field exists (`NOTEBOOK-SCHEMA.md:42`); nothing enforces it; the incumbent run demonstrates the loss three times (§2). |
| 2 | Figures traceable to the company's own published document, with its year | **FAIL** | `as_of` (`:48`) dates the *fact*, not the *document vintage* — for a 2022 disclosure read in 2026 those differ, and that difference is my series. `sources[]` (`:88`) is a bare URL array with no title, publisher or edition, so a fact can point at a URL that has silently become next year's PDF. |
| 3 | Omissions recorded, with a home in the schema | **FAIL** (narrowly) | Expressible as a negative `facts[].claim`; no marker, no instruction, no column (§3). Passes "can be smuggled", fails "has a home". |
| 4 | No named individual below executive level anywhere | **PASS, unassisted** | Nothing in the methodic enforces it — and `dimensions.ts:31` pushes the other way: "Nobody is named — the story has no agents." `conclusions.ts` has no naming policy at all. It passes on my discipline, not the methodic's. |
| 5 | The counter-case is the company's own best framing, **quoted** | **FAIL** | Reachable and mandatory (good). No field holds a verbatim attributed quotation: `steel_man.statement` is free prose, `counter_positions_to_state_fairly[]` is bare strings (§5). |
| 6 | Conclusions about the structure, never participants' judgement | **PASS** | `conclusions.ts` reasons from dimensions, not from people; the falsifier requirement (`:55`) and the motive→`unhinged` routing (`:32-33`) hold me where I hold myself. The risk is Engine F's register, not the schema. |
| 7 | Under 45 min equivalent | **FAIL** | ~3h15m estimated (§8). |

**2 of 7.** Verdict `L1-conditional`: nothing here blocks the topic — I can produce a notebook — but
five majors stand between that notebook and one I would publish behind.

---

## 8. Time saved

- **Manual baseline:** ~5h. Per my own file (`creators/consumer-scam.md:26-29`): "the arithmetic is
  fast; **establishing what the document omits is slow**."
- **Where the methodic helps:** Phase 3 mechanisms — the comp-plan chain as explicit BUT/THEREFORE is
  genuinely good and saves me ~30 min of structuring. Phase 5 conversions — percentages into people,
  ~20 min of rendering (not of *doing* the arithmetic, which was already fast). Phase 6 counter-case —
  ~15 min, and it's in the PDF anyway. Phase 8 engine fit — ~15 min, minus the time I lose arguing
  with an `engine_fit` field that can't hold my objection to F.
- **Where it does not help at all:** the omissions pass. That is the majority of my five hours and it
  is the one phase the methodic has no instruction for (§3). Phase 1's breadth is actively wasted
  effort on a single-document topic, and Phase 9 will scold me for gaps that aren't gaps.

**~100 min saved · low confidence.** Against my 45-minute acceptance: **fails by ~2.5 hours.**

Reported as an estimate of the methodic *as written*, per `accepted-gaps.md:24-33` — there is no
runner, so nothing here is a product measurement.

The one-line version, which I think is the useful output: **the methodic accelerates the fast half of
my job and does not touch the slow half.** It optimises breadth-of-sourcing; my cost is depth on one
document. Until something in it knows how to interrogate a single primary source, the delta is capped
around where I put it, no matter how good the execution gets.

---

## 9. Findings

Nine. Zero blockers, seven majors, two minors. Full records in `consumer-scam--findings.json`; refuter
pass on each is in the JSON's `verdict` and `artifact_check` fields and summarised here.

| id | Title | Targets | Sev | Refuter outcome |
|---|---|---|---|---|
| `…-01` | `scale_conversions[]` has no back-reference and no base | notebook-schema | major | confirmed — `analogy_candidates` has `for`, this doesn't |
| `…-02` | `facts[]` cannot carry a quantity, unit or denominator structurally | notebook-schema | major | confirmed — loss demonstrated in shipped artifacts |
| `…-03` | No fact-level marker for an absence | notebook-schema, research-prompt | major | confirmed, scoped — expressible as prose, unmarked |
| `…-04` | One domain table, scoped to markets, silently universalised | research-prompt, dimensions | major | confirmed |
| `…-05` | `confidence` conflates reliability with self-interest; no evidence-kind axis | notebook-schema | major | confirmed |
| `…-06` | `engine_fit.fit` is one-dimensional; no register/audience axis | notebook-schema, engines | minor | confirmed |
| `…-07` | No structured home for a verbatim attributed quotation | notebook-schema | major | confirmed |
| `…-08` | `actors.emptyMeans` asserts a defect where non-naming is a safety choice | dimensions, conclusions | minor | confirmed |
| `…-09` | `sources[]` cannot identify a document edition | notebook-schema | major | confirmed |

All nine `content_or_lens: content` except `…-03`, filed `undecided` because it converges with
`public-corruption` from a different area and the ruling is the judge's, not mine.

**Refutations I ran and what survived:**

- *Is this the methodic or a genuinely hard topic?* My topic is not hard. It is one PDF and long
  division. That it fits badly is the methodic's shape, not my subject's difficulty.
- *Would a competent execution have produced this anyway?* For `…-01/02/07/09` — no. A competent
  researcher who wanted to attach a base to a percentage would have to **invent a field**, and
  `env.md:33-35` is explicit that an invented field is a `notebook-schema` finding, not a workaround.
- *Is the missing thing present somewhere I didn't read?* This one bit. Absence-as-evidence **is**
  present at `RESEARCH-PROMPT.md:48` and reasoned through at `DIRECTOR-DIMENSION.md:156-161`, so I
  narrowed `…-03` from "no home" to "no marker, no instruction, no column" and said so in §3 rather
  than banking an overstatement.
- *Content or lens?* Default content, and I held it. Eight of nine are field additions and label edits
  to a mechanism that otherwise held my material 6/7. I am a fraud creator and I am supposed to want my
  own lens; on this evidence I don't think I've earned one, and I'd rather say that than pad the case.
- `G-000` cited, not reopened.

---

## 10. Voice — Nadia

I want to start with the thing I liked, because I'm about to be unkind for a while and it would be
unfair to bury it.

Phase 5 is the best paragraph anyone has written about my job. "A number without a comparison is a
number the script wastes." Yes. That is the entire craft of what I do — I don't tell people *0.3% of
participants earned above the threshold*, because 0.3% is a shape, not a fact. I tell them: three
people in a thousand. Your convention had nine hundred people in the room. Fewer than three of them.
And then I say it again, slower, because the first time you hear it you're still doing the maths.
Somebody who has never met me wrote a phase for that, and I'd like them to know it landed.

Now. The field is called `{raw, felt}`.

Two strings. That's it. No slot for what the number is a percentage *of*, no slot for which fact it
came from, no slot for how I got from one to the other. And directly underneath it — one line down in
the same file — `analogy_candidates` gets `{for, analogy, quality}`, so a *metaphor* knows what it's
attached to and my *arithmetic* doesn't. I read that twice thinking I'd misread it. Somebody sat down,
decided a figure of speech should be traceable, and then decided a number shouldn't.

Here is why that is not a nitpick. My audience is not neutral. My audience is people who are currently
in one, who have been told a number by somebody they love, and who came to me because something isn't
adding up but they can't say what. The only thing I have — the *only* thing — is that they can pause
the video, open the company's own PDF, and find my number on page four. That's not a style choice. That
is the entire product. The moment I'm asking them to trust me instead of the document, I am doing the
same thing to them the upline did, just in the other direction, and I'd rather not make videos than do
that.

So a schema where the base of a percentage survives only as a phrase inside a sentence is a schema that
will, eventually, hand me a script with a bare percentage in it. I don't have to speculate about that.
It already happened, in the one run this whole thing was built from. The notebook said the correlation
holds "in risk-on conditions". The script said it holds. Four words, gone between one file and the
next, and nobody noticed because nothing was watching. In Bitcoin that's a comment someone leaves. In
my beat, dropping "among participants who completed a full year" is a letter from a law firm, and it's
deserved, because I'd have said something untrue.

Then the omissions. Look — I'll be straight, because there's another one of us testing this and I don't
want to help by exaggerating. You *can* write "the statement does not report expenses" into a fact. It's
a free-text field, nobody's stopping you. Anyone who tells you there's nowhere to put it hasn't read
carefully.

But nothing knows it's an absence. It reads exactly like every other fact, and the two fields that
sound like they'd take it both point the wrong way — `unknowns` is for things *I* don't know, and its
whole job is to stop me saying things, and `research_gaps` is for work *I* didn't do. If I file the
best evidence I have in either of those, I've either muzzled it or confessed to it. Meanwhile the
picture-planning document — a design proposal that says on its own second page that it isn't built —
sat down and worked out that an absence needs a flag, "because an absence is the visual most likely to
be silently dropped by a downstream step that cannot render it." They were *right*. They just wrote it
one floor too high. The thing gets dropped upstream, before any picture exists, and I'm the downstream
step that can't render it.

And I want to be careful here, because this is the bit that reads as conspiracy if I say it wrong. I
never claim they left it out on purpose. I can't know that, nobody can, and the schema is right to
shove motive up into the tier it labels indefensible-as-fact — I'd shove it there myself. What I say is
narrower and worse: the document reports gross and not net, it has reported gross and not net for four
years, and a business where the expenses are the story publishes a document with no expenses in it.
Draw your own line. I'm just reading you the page. **And that's their document, not mine.**

Two more, quickly.

The confidence rule says vendor research is low by default. Fine — except the company's own filing *is*
vendor research, and it's also the most authoritative thing in existence on this subject, because it's
the one they had to sign. Both of those are true at once and there's one box. So the most solid number
I will ever hold gets stamped `low`, and then another rule tells me a load-bearing fact at low
confidence is the most dangerous thing in a notebook, and now my whole notebook is on fire for being
correct. That's not a hard problem to fix. You need two questions instead of one: *did they publish
this*, and *does it describe the world*. High and contested. That's the honest answer and there's
nowhere to write it down.

And the engine catalogue. It walked me straight at Anchor Ladder, and structurally it's not wrong — a
rank ladder is naturally ordered difficulty, the rungs really are joined by *but*, it's genuinely the
right skeleton. But it's a fifty-seven-second form that gets its speed by throwing away the working,
and the working is what I sell. Worse: the witnessed version ends on a joke. Throw the cards in the air
and hope. Now put my rungs in it — because my rungs aren't complexity classes, they're cohorts. Rung
one is people who quit in the first year. Rung four is the handful at the top, and the punchline lands
on everyone below them. That's a video that makes my viewers feel stupid, and a person who feels stupid
defends the thing that made them feel that way. I'd lose every one of them and the company would never
have to send a letter.

I can't write any of that down. `fit` is one word. I get to say "poor" and I'd be lying, or "excellent"
and I'd be lying, and there's no third box for *the shape is perfect and the tone would cost me my
audience*. The catalogue describes every engine by the viewer's pleasure. Nobody asked what the engine
does to a viewer who is inside the subject.

Last thing, and it's the one I'd actually want acted on. Six of your seven columns took my material
without complaint, and I was expecting a fight — the compensation plan dropped into "flows and
plumbing" like it was built for it, and "what changed, and whether it was actually implemented" is
*literally* my thesis about disclosure rules. So the bones are good and I'm not asking for my own
pipeline. What I'm asking for is smaller and I think it's true for more than just me: this whole thing
is designed to go *wide* — six domains, four to eight searches, a gaps field that scores you on how much
you didn't reach. My job is one document, read four times, until the fourth read tells you what isn't
in it. There is no phase for that. Not a bad phase — no phase.

Five hours becomes three and a bit, and every minute you saved me was a minute I wasn't struggling
with. I said I'd take forty-five. It's not close, and it won't get close by executing this better,
because the part you help with was never the part that was hard.
