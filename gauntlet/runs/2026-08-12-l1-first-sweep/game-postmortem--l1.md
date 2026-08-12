# L1 dry fit — `game-postmortem` (Toby Ansah, "Scope Creep")

**Run:** 2026-08-12 · L1 first sweep · no browser, no searches, paper exercise
**Area:** entertainment · **Lens binding:** entertainment
**Topic:** *A big launch underperformed, and every explanation offered — the marketing, the engine,
the audience — is downstream of a production decision made three years earlier.*
**Manual baseline:** ~8h · **would accept:** 75 min

**VERDICT: `L1-conditional`** — with an escalation clause stated in § Verdict.

> Method note, since this is a paper exercise about design shape: no real title, studio or person is
> named anywhere in this report. Every example is the *shape* of a production post-mortem — a
> greenlight, an engine decision, a platform-target change, a milestone that did not move. That is
> also the honest test, because the methodic has to hold the shape before it holds a subject.

---

## 1. Column utilisation

```
columns 6/7 used · 3 orphan groups
```

| # | Column (`dimensions.ts`) | Verdict | What of mine goes here |
|---|---|---|---|
| 1 | **The number** (`:26-27`) | **used** | Third-party unit estimates, revenue estimates, the publisher's stated expectation. |
| 2 | **Flows & plumbing** (`:28-29`) | **used — genuinely well** | Sell-in vs sell-through, pre-orders vs. activations, channel stuffing, the discount curve, refund rate, storefront placement. |
| 3 | **Structural actors** (`:30-31`) | **used** | Publisher, platform holder, parent company, outsourcing partners — and "what governs *their* behaviour" is a fiscal quarter, which is the date my whole thesis turns on. |
| 4 | **Macro** (`:32-33`) | **used by analogy** | Release-window congestion, hardware-generation transition, industry-wide contraction, engine-licence economics. Label is finance-shaped; purpose transfers cleanly. |
| 5 | **Politics & regulation** (`:34-35`) | **UNUSED** | Age ratings and platform certification exist in the genre but not in this story. See § 1.2 — the *label* excludes my best material while the *purpose sentence* describes it precisely. |
| 6 | **The counter-case** (`:36-37`) | **used** | "It launched fine and expectations were wrong." |
| 7 | **Conclusions** (`:38-39`) | **used, and it is the best thing here.** | See § 3. |

### 1.1 Orphan groups (named)

**Orphan A — the decision timeline.** The dated sequence of production decisions: greenlight scope,
the engine decision, the platform-target change, the reboot, the staffing ramp, the milestones that
slipped and the one that did not move. This is my spine, it is the eight hours of my manual baseline,
and **there is no column for it.** It is not a quantity (`the-number`), not an entity (`actors`), not
a regulation (`politics`). It is the largest orphan in the run for my domain.

**Orphan B — critical reception.** Review aggregate, critic consensus, the critic/audience split, the
post-patch re-review. No column. The only place it could be forced is `the-number`, which already
holds sales — and filing reception next to sales *is* the collapse my senior bar exists to prevent
(`creators/game-postmortem.md:30-33`). Note the compounding hazard: `DEFAULT_DIMENSION` is
`the-number` (`dimensions.ts:62`), so any untagged reception card lands there **silently** (`G-000`).
The methodic's default failure mode and my domain's standing error are the same error.

**Orphan C — shipped build state and team capability.** What was actually in the box (bug state,
performance, cut content, stub features) and what the credits say about who was still there to build
it. Both are production material, neither is a decision, and `actors` is explicitly about entities
*large enough to move this* — a diffuse loss of capability is the opposite of that.

### 1.2 The one column that is wrong in an interesting way

`politics` reads, in full: *"What changed, and whether it was actually implemented."* Strip the label
and that is a one-line summary of my entire thesis — a scope decision was announced, a feature was
promised, an engine migration was greenlit, and the question that decides the video is whether the
thing was ever actually built. `emptyMeans` even says *"Policy is being assumed to work, or assumed
not to."* Swap "policy" for "plan" and I have my column.

So the mechanism has the shape I need and the vocabulary of a different trade. **That is a `content`
finding, not a lens finding**, and I want to be loud about it because it is the cheapest fix in this
report.

### 1.3 On the orchestrator's hypothesis 1

> *HYPOTHESIS — the seven columns are market-shaped and will collapse or leave orphans on non-market
> topics.*

**Half right, and the wrong half is the interesting one.** `flows` and `actors` did not collapse —
they are the two columns that took my material most cleanly, because sell-in/sell-through *is* a
plumbing question and "does the plumbing behave as people assume" is the exact confusion a
post-mortem exists to clear up. I place my material there without strain and I am contradicting you
on it.

What actually happened is not collapse, it is **absence**: three groups of material with no column at
all, and all three belong to the two tracks (reception, production) that my genre must keep separate
from the third (sales). The board is not too market-shaped. It is too **single-track**.

---

## 2. MY CENTRAL TEST — can the schema hold a *sequence of decisions*?

My causal chain is temporal. "The target platform changed in year one, therefore the renderer work
was thrown away, but the milestone dates did not move, therefore content was cut, therefore the thing
that shipped three years later was a different game." Everything the internet said about that launch
is an effect of a date. So: can the notebook hold decision A at T1 constraining option B at T2?

### 2.1 Is a fact a point-in-time claim? — **Yes, but the date field means something else.**

`NOTEBOOK-SCHEMA.md:42` — `facts[]` is `{id, claim, load_bearing, source, confidence, as_of, note?}`.
`:48` — *"`as_of` — every fact is dated. **This drives `currency`.**"* And `:22` lists `currency`
under "honesty checks throughout"; `:84` defines it as `{half_life, why, expires_first[], durable[],
advice}`.

So `as_of` is a **freshness** field. It answers *when does this claim go stale*, not *when did this
happen*. For a live market topic those two collapse into each other and nobody notices. For a
production history they are opposite ends of the story: my most load-bearing fact is about a decision
made three years before launch, and it is the *least* likely fact in my notebook to expire.

The worked reference proves the ambiguity is already live. In
`pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/notebook.json`:

- `:60` — `f-sbr`, `as_of: "2025-03-06"` — that is the **date of the event** (an order was signed).
- `:44` — `f-now`, `as_of: "2026-08-10"` — that is the **date of the observation** (a price was read).
- `:77` — `f-genius`, `as_of: "2026"` — a **year**, for a fact containing three distinct events that
  happened at three distinct times.

Three semantics in one field, in the exemplar, on the topic the schema was derived from. A timeline
sorted on `as_of` would be sorted on a mixture of "when it happened" and "when I looked", and
`f-genius` would not sort at all. **I cannot build my spine on this field.**

### 2.2 Is a mechanism a causal link *between facts*? — **No. And this is the sharpest thing I found.**

`NOTEBOOK-SCHEMA.md:49-53`:

```
mechanisms[]
  {id, name, chain[], explains, needs_analogy, note?}
```

There is **no field referencing fact ids.** `chain[]` is an array of free-text strings. Compare the
two structures either side of it:

- `reversals[]` (`:55-58`) carries `evidence[]` — fact ids — *and* `mechanism`, a mechanism id.
- `conclusions.ts:45` carries `restsOn: string[]` — card ids, and the header at `:20-21` says a
  conclusion whose supporting cards are descoped *"is wounded like any other dependent — the same
  graph, the same arithmetic."*

So reversals resolve against the graph. Conclusions resolve against the graph. **The mechanism — the
causal spine, the thing `NOTEBOOK-SCHEMA.md:21` says step 5 consumes as "the but/therefore validation,
pre-linked" — is the one structure in the notebook that is unsourced prose.**

Look at what that produces in the exemplar. `notebook.json:202-209`, `m-etf-plumbing`, restates
`f-etf-lag` and `f-etf-absorbed` in different words with no ids attached. On a market topic that is
untidy. On mine it is disqualifying, because *every link in my chain is a claim that needs its own
source at both ends*: "the platform target changed" is one document, "the renderer was rebuilt" is
another, and the arrow between them is my whole argument. The schema gives me a place for the arrow
and nowhere to nail either end of it.

And the wound graph — the descoping arithmetic the repo is proud of — cannot see mechanisms at all.
Cut the fact that establishes the platform change and the mechanism that depends on it registers no
wound, because it never declared the dependency.

### 2.3 Can "A at T1 constrained B at T2" be expressed? — **Partly, and ambiguously.**

I can write it as chain prose:

```
"In year one the target platform changed"
  THEREFORE "the renderer work was rebuilt"
  BUT       "the milestone dates did not move"
  THEREFORE "content was cut to hit them"
```

That reads well. Three problems.

1. **No ids** (§ 2.2).
2. **No time on the steps.** Ordering is array position, and array position is *argumentative* order.
   The exemplar never once uses a chain chronologically — `m-institutionalisation`
   (`notebook.json:231-236`) is a pure logical entailment with no time in it at all. So I would be
   repurposing a logical operator as a temporal one with no way to signal which I meant, and a reader
   cannot tell "THEREFORE = caused, later" from "THEREFORE = entails, timelessly". For my genre that
   distinction is the difference between a post-mortem and a conspiracy theory.
3. **The board un-orders whatever I author.** Even if I write `facts[]` in perfect chronology,
   `CARD_DIMENSION` (`dimensions.ts:50-60`) re-buckets every card by column, and the reviewer sees
   them grouped by domain, never by date. My greenlight card lands in `actors`, my scope-change card
   in the orphan pile, my slip-to-holiday-quarter card in `macro`. **The schema can hold a sequence.
   The review surface destroys it.**

### 2.4 Does `mechanisms[]` chain, or only pair?

**It chains *within* a mechanism and only pairs *between* them.** `chain[]` is n-ary — good, that is a
real chain, and the exemplar runs seven steps (`notebook.json:216-224`). But there is no
mechanism→mechanism reference field. `explains` (`:50`) is free text. `reversals[].mechanism` (`:56`)
is a **single value, not an array** — a reversal cannot cite two mechanisms interacting.

My production story is three mechanisms composing: the greenlight mechanism sets a scope, which
drives the staffing mechanism, which drives the milestone mechanism. My options are one twenty-step
mega-mechanism (unreadable, and the `explains` field would have to summarise the entire video) or
three disconnected ones with the joins living in prose I am not allowed to write
(`NOTEBOOK-SCHEMA.md:92`, "No prose"). Neither is right.

### 2.5 Ruling on the central test

> The schema holds a **set of dated claims** and a **set of local causal chains**. It does not hold a
> **sequence of decisions**: the date field means freshness, the chain steps carry no evidence, the
> chains do not compose, and the board re-sorts by domain. A production timeline does not flatten into
> an unordered set — it flattens into *seven unordered sets*.

---

## 3. Three independent tracks — sales · reception · production

My senior bar: these must be separable, and linked only **conditionally**. A game can sell badly and
be well made. The video that assumes otherwise is the one my ex-colleagues correct.

### 3.1 Where the methodic fails it

The notebook is **single-thesis by construction**, and it is not subtle about it:

- `NOTEBOOK-SCHEMA.md:27` — `question`, singular: *"the topic rewritten as the question the video
  answers."*
- `:29` — `verdict`, *"the one-sentence answer."*
- `:33-40` — `tension` is one object: one `expectation`, one `reality`. And `:37`: *"A notebook
  without a tension is a failed notebook."*

The moment I write the tension, one track becomes the story and the other two become evidence *for*
it. There is no primitive that says "these three things are true at the same time and I have not yet
established that they are related."

The columns inherit it. Every `emptyMeans` in `dimensions.ts` presumes one story in the singular —
`:29` *"The demand story is unexamined"*, `:31` *"the story has no agents"*, `:39` *"Nothing
synthesised."* And the file's own header (`:1-5`) says the columns were taken from the research
brief's causal-domain checklist — *causal domains of one subject*. The dimension model does not
merely permit "everything on this board belongs to one story", it **asserts** it, in seven
`emptyMeans` claims, each of which reads a missing column as a gap in a single argument rather than
as an independent track I have honestly declined to link.

Concretely: if my reception track is clean — the game reviewed well — the board cannot represent
that as a *finding*. It has no column for reception, and if I force reception cards into
`the-number`, a strong review average sitting in the column labelled "what the number did" reads as
evidence about sales performance. That is the genre's standing error, produced by the board's own
filing system.

### 3.2 Where the methodic passes it — and I am contradicting the pessimists here

Two mechanisms already do the right thing and I want them protected, not redesigned.

**`unknowns[].impact` (`NOTEBOOK-SCHEMA.md:76-78`, rule 5 at `:98`).** *"`impact` is the important
field: it tells the script what it may not say."* And `RESEARCH-PROMPT.md:101`: *"Correlation
reported as causation → the script says 'moves with', not 'because of'."* That is exactly my
discipline, already written down:

> unknown: whether the production trouble caused the sales result.
> why: the schedule evidence and the sales evidence are independent and neither dates the other.
> impact: the script says "coincided with", never "because of".

**`conclusions.ts` opt-in asymmetry — the single best thing in this methodic for my genre.**
`:15-17`: *"conclusions are OFF by default. Facts are in-scope until you cut them; a conclusion is out
until you let it in. The asymmetry is the safeguard."* Plus `restsOn` (`:45`) can span cards from any
column, and `falsifiableBy` (`:50`) is mandatory.

"The three-year-old scope decision caused the sales miss" **is a conclusion, not a fact** — and the
methodic already knew that, already turned it off by default, already made me write what would prove
it wrong, and already made me name which cards it stands on. If a run handed me that card greyed out
with a falsifier attached, I would put my name on it. That is the conditional link I asked for, built
correctly, by people who were not thinking about my domain at all.

**Ruling:** the notebook layer can hold three tracks conditionally linked, via `unknowns[].impact` and
opt-in conclusions. The **board** cannot — it has columns for one of my three tracks, no columns for
the other two, and seven `emptyMeans` sentences that describe one story. The fix is `dimensions` and
`ui`, and it is `content` — new columns and re-worded `emptyMeans`, not a forked process.

---

## 4. Evidence-floor check

First, a correction the run needs, because both the rubric and the brief are testing a ladder that is
not in the research path.

**The MEASURED · OBSERVED · INFERRED · ASSUMED ladder is not the notebook's ladder.** It is defined at
`knowledge/README.md:36-41` and it labels *claims the knowledge library makes about craft* —
`pipeline/DIRECTOR-DIMENSION.md:9` says so outright: *"Evidence labels are the library's."* Nothing in
`RESEARCH-PROMPT.md` or `NOTEBOOK-SCHEMA.md` uses it. A research fact gets
`confidence: high | medium | low` (`NOTEBOOK-SCHEMA.md:46-47`) plus a `load_bearing` boolean (`:45`).

So on the orchestrator's hypothesis 2 — *"the ladder has no honest rung for interpretive or
practitioner-consensus evidence"* — **I contradict you twice, in opposite directions.** The rung
exists: `INFERRED`, `knowledge/README.md:40`, *"Our reasoning across sources — requires: the
observations it rests on, stated."* That is precisely the honest rung for credits archaeology, and it
even demands the inferential step be shown. And it is **not wired into the notebook at all**, so a
research run cannot reach it. The gap is not a missing rung. It is a ladder built in one wing of the
house and never carried into the other.

Now my four evidence classes against the ladder that actually applies:

| My evidence | Where the notebook puts it | Where it belongs | Verdict |
|---|---|---|---|
| **Third-party sales estimates** — panel/telemetry modelling, digital often excluded, publisher never confirms | `confidence: low` — `:47` says *"Vendor research is `low` by default"*, and a sales-tracking firm is vendor research | Something like `OBSERVED, method stated`. It is a real measurement of a modelled quantity | **Permanently floored, with no exit.** `RESEARCH-PROMPT.md:123` demands *"every load-bearing fact at `low` confidence is flagged for a second source"* — in my domain there **is** no second source, structurally, ever. Publishers do not report per-title units. The methodic's remedy is unavailable, so my most-cited number carries a flag that can never be cleared. |
| **Post-launch interviews** (a studio explaining itself) | `confidence: medium`, probably | Two different confidences at once | **The conflation.** An interview is *high* confidence as to what was said and *low* as to what happened, because the speaker has an interest. `confidence` has one slot and no concept of interestedness. `RESEARCH-PROMPT.md:100` handles vendor statistics — *"use the direction, not the number"* — and has nothing for **interested testimony**, which is the harder cousin and the primary source of my genre. The Bitcoin run never hit this because a price has no motive. |
| **Credits archaeology** (turnover inferred from who is and is not listed) | Nowhere honest. `confidence: medium` would launder an inference into an observation — exactly the `:108` anti-pattern, "laundered confidence" | `INFERRED` (`knowledge/README.md:40`), which even requires the observations be stated | **No home.** A fact cannot show its work: `facts[]` has `claim` and `source`, no `derived_from`. My alternative is to file it as a *conclusion*, which is honest — but conclusions are OFF by default and, critically, **nothing can `restsOn` a conclusion**; the graph runs one way. An inferred building block therefore cannot support anything built on top of it, which is the only reason I collected it. |
| **Leaked schedules** — the best evidence in the genre | `confidence: high` (it is a primary document), `source` names a leak | Needs a provenance/handling field | **Exposure is invisible to the schema.** `source` is a free string. There is no field for *what it costs to be wrong or to publish this*, even though exposure is a first-class Gauntlet concept (`SKILL.md:63-67`) which predicts exactly this: a schema derived from a topic with no people in it prices no exposure. My bar is only low-medium and I still cannot express "verified to my satisfaction, unattributable, do not name the document." |

And against my scored criterion 2 — *every sales figure labelled estimate or reported, with the
source's method* — the schema offers `source` (free string) and `confidence` (three words). The
method goes in `note?` or nowhere. `gauntlet/env.md:33` is explicit that this counts: *"a field you
wanted and couldn't fill is a `notebook-schema` finding, not a workaround."*

---

## 5. Counter-case reachability — "it launched fine and expectations were wrong"

**Reachable, abundantly — and I am contradicting hypothesis 4 for my topic.** My counter-case has a
literature the day the game launches: defenders comparing units against comparable titles, analysts
arguing the forecast was the error, and the fact that "underperformed" is a statement about an
expectation, not about a game. Better still, it is *structurally* available — it is an accounting
argument that can be stated from figures I already have, without a single extra search. `Phase 1`'s
counter-case row (`RESEARCH-PROMPT.md:32`) is cheap for me. Some seat in this cast has the unsatisfiable
version of that row; it is not this one.

Two real problems, though, and the second is the one that matters.

**(a) Three containers, no routing rule.** The counter-case has a Phase 1 search row (`:32`), a
Phase 6 mandate (`:87-93`), a `steel_man` field (`NOTEBOOK-SCHEMA.md:61-65`), a
`counter_positions_to_state_fairly[]` field (`:74`), *and* a board column (`dimensions.ts:36-37`).
Nothing says which goes where. The exemplar demonstrates the cost: `notebook.json:355` files *"Four-year-cycle
believers read this as an ordinary post-halving drawdown, not a structural change"* under
`counter_positions_to_state_fairly` — while the Adjudication render promotes that identical argument
to **Candidate 1, placed first, explicitly not dismissed** (`script--adjudication.md:36-52`). The
notebook's strongest counter was sitting in its weaker container and only the engine rescued it.

**(b) The one that matters: `steel_man` is defined against the *verdict*, not the *premise*.**
`NOTEBOOK-SCHEMA.md:62` — *"The strongest case against the verdict."* `RESEARCH-PROMPT.md:89` —
*"the strongest case against your own verdict."* My counter-case is not against my verdict. It says
**there is nothing to explain**: the game sold what a game like that sells, and the miss is in the
forecast. That is an attack on the premise of the entire video, and it is a different object.

`ENGINES.md:87-90` knows the difference and states it as the first D-honest tell: *"Is the premise
itself in the candidate set? An honest adjudication admits 'the thing we're explaining may not be
real, or may be mismeasured.'"* But that lives inside **one engine's** honesty check, at render time
— and `NOTEBOOK-SCHEMA.md:91` insists the notebook must be engine-independent (*"the notebook must
survive every engine"*). So the premise challenge is a notebook-level obligation currently enforced
only if you happen to pick Engine D. Pick Engine A and nothing asks whether the game underperformed
at all.

**Criterion 5: PARTIAL.** Present, mandatory, reachable — and mis-shaped for a topic whose strongest
counter attacks the premise.

---

## 6. Engine availability — all seven walked

| Engine | Fit | Reasoning |
|---|---|---|
| **A · Reversal Chain** (`ENGINES.md:26-43`) | **excellent · recommended** | *"a claim a reasonable person could dispute"* — and my material is literally a ladder of wrong obvious readings. "It was the marketing" → the marketing was fine. "It was the engine" → the engine shipped four other titles that year. "The audience moved on" → the audience bought the competitor six weeks later. → the date. Four turns escalating to a scope decision, and `reversals[]` is the one part of the schema built to carry exactly this. |
| **B · Effort/Payoff Gap** (`:45-55`) | **good, and underrated for my genre** | *"a mechanism a viewer could operate"* — the milestone and greenlight process is one, and a punishing one. Three years of labour, and what shipped is the residue. The disproportion **is** the emotional payload of a post-mortem, and `:47` has it exactly: *"you cannot be told what something costs."* Nothing in the schema holds process, so I would carry it in a chain — see § 2.2. |
| **C · Parallel Case** (`:57-67`) | **medium** | Transfer from any familiar build where the deadline was fixed before the design. It works, and `analogy_candidates[].quality` (`NOTEBOOK-SCHEMA.md:70-72`) is honest enough to let me mark it *medium* and drop it. Risk: a construction analogy quietly implies somebody was careless, which is my pet peeve at `creators/game-postmortem.md:43`. |
| **D · Adjudication** (`:69-112`) | **good** | *"why did X happen where the honest answer is contested"* — marketing / engine / audience / the date, weighed. And D-honest tell #1 **forces criterion 5 to pass**: candidate one must be "there is nothing to explain." This engine repairs the premise-vs-verdict gap in § 5(b) — for anyone who picks it. |
| **E · Briefing** (`:114-131`) | **poor** | *"Something just happened"* (`:116`) and a mandatory date stamp (`:129`). A post-mortem is retrospective by definition; the thing happened, then two years of interviews happened. Viable only in launch week, which is when nobody knows anything yet. |
| **F · Anchor Ladder** (`:132-142`) | **poor — and see below** | |
| **G · Paradox Teaser** (`:144-156`) | **good, for the derived short** | "This game spent seven years in development and was built in eighteen months." A flat contradiction, repeated, then the reveal — and an open loop pointing at the long piece. My genre's short form is already this shape. |

**4 usable (A excellent, D/B/G good) · 2 weak · 1 poor.** Not zero, not seven — the notebook would
have a shape. **This is the methodic's strongest layer for my domain and I will say so plainly.**

### 6.1 Would Anchor Ladder force a numeric frame onto a production story?

My scored criterion 6 assumes it would, and having walked the file I think **my own criterion is
slightly wrong, and the real hazard is worse.**

F is *"one concrete object → the same object demonstrates progressively harder cases"* (`:134`). The
witnessed case (`:136-138`) is a deck of cards teaching five complexity classes. The **anchor is an
object, not a number**; the ladder is ordered by *difficulty*, not by *magnitude*. So F does not
inherently impose arithmetic. Criterion 6 passes trivially anyway, because A is excellent.

The real hazard is `:141`: *"Each rung is linked by *but* — each new task defeats the previous
solution."* A production timeline has a natural *chronological* order that sits seductively close to
`:141`'s "naturally ordered difficulty", so a model choosing an engine from my notebook's shape could
easily mistake one for the other. And then F would impose **monotonic escalation** — each decision
worse than the last, each rung defeating the previous fix. That is a narrative of accumulating
culpability, and it is precisely the story shape my third pet peeve forbids: *any narrative that
requires a developer to have been lazy* (`creators/game-postmortem.md:43`). A production history is
not monotonic. Most of the bad decisions were locally correct.

So: **not a numeric frame — a blame frame.** `ENGINES.md:169` should say that a chronology is not a
difficulty ladder. That is a one-line `engines` finding and it is worth more than my original
criterion was.

---

## 7. Scored criteria

| # | Criterion | Result | Reason |
|---|---|---|---|
| 1 | Sales, reception and production are three separable tracks | **FAIL** | One `tension`, one `verdict`, one `question` (`NOTEBOOK-SCHEMA.md:27-40`); seven `emptyMeans` written in the singular "the story"; no column for reception or production; `DEFAULT_DIMENSION = "the-number"` silently files stragglers next to sales (`dimensions.ts:62`). **Partial credit** at the conclusions layer, which holds the conditional link correctly (§ 3.2) — but a mechanism I have to reach past the board to use is not a passing grade. |
| 2 | Every sales figure labelled estimate/reported, with the source's method | **FAIL** | `source` is a free string, `confidence` is three words, there is no method field. `note?` is a workaround and `env.md:33` says a workaround is a finding. |
| 3 | A production timeline is representable — **a sequence of decisions, not a set of facts** | **FAIL** | The central test, § 2. `as_of` is a currency field with three semantics in the exemplar alone; `mechanisms[].chain[]` is unsourced prose with no fact ids and no time; mechanisms do not compose; the board re-buckets by column and destroys authored order. |
| 4 | No decision attributed to a named individual | **PASS, with an unpriced hazard** | Nothing in the methodic requires naming a person. The `unhinged` tier (`conclusions.ts:32-33`) is explicitly *"a claim about MOTIVE"* and is where an individual attribution would enter — but it is OFF by default (`:15-17`), carries a mandatory falsifier (`:50`), and is marked in the UI (`:56-59`). **On the orchestrator's hypothesis 3, I contradict you at my exposure level:** for a low-medium seat, that is adequate. What is missing is not a safety rail but a **policy** — nothing says *attribute motive to institutions, never to individuals*. The exemplar's own `unhinged` card (`c-reserve-was-the-product`, `conclusions.ts:164-179`) attributes motive to an administration and is fine precisely because an administration is not a person. That was luck, not design. |
| 5 | The counter-case is present at strength | **PARTIAL** | Reachable and mandatory (§ 5), and I contradict hypothesis 4 for my topic. But `steel_man` is defined against the *verdict* while my counter-case attacks the *premise*, and the premise challenge exists only inside Engine D's honesty check. |
| 6 | An engine renders this without an Anchor Ladder | **PASS** | Engine A is an excellent fit and D is good. F is a poor fit and would not be selected on merit — though for a different reason than I assumed (§ 6.1). |
| 7 | Under 75 min equivalent | **FAIL** | ~120 min saved of 480. See § 8. |

**4 fail (one partial) · 3 pass.**

---

## 8. Time-saved estimate

**~120 min saved of a 480 min baseline · low confidence · does NOT clear the 75 min bar (misses by
~285 min).**

The arithmetic of where my eight hours go, and what the methodic touches:

| My manual work | ~min | What the methodic does |
|---|---|---|
| Sales estimates, and reading their methodology | 60 | Phase 1 `the-number` row gets the figures fast. The methodology note has nowhere to live, so I re-do that part by hand. **~40 saved** |
| Three post-launch interviews, read for what is being avoided | 90 | Phase 1 finds them. Reading them adversarially is judgement, and `confidence` cannot record interestedness, so the *output* of that reading is not storable. **~30 saved** |
| Credits archaeology | 60 | Untouched. No `INFERRED` rung reachable from the notebook, no `derived_from` field. **0 saved** |
| Leaked schedules, verification, handling decision | 60 | Retrieval helped; no provenance field, so the handling decision is unrecorded. **~20 saved** |
| **Assembling the production timeline nobody published** | **180** | **This is the expensive half and the methodic has no apparatus for it** — no column, no ordering primitive, no evidence-linked chain, and a board that re-sorts my chronology into seven domain buckets. **0 saved, and plausibly negative** once I am fighting the filing system. |
| Tension, structure, counter-case, script spine | 30 | Genuinely accelerated — `reversals[]`, engine fit and opt-in conclusions are good work. **~30 saved** |

The shape of it: **the methodic accelerates the cheap half of my job and does nothing for the
expensive half.** That is not a rounding error, it is the reason the number misses by four-fold.

Confidence is **low**, deliberately, on two stated grounds: `accepted-gaps.md` § `scope-note` — there
is no runner, so every number here estimates the methodic *as written*; and `SKILL.md:104-106` —
L1 reads a prompt charitably, and I have assumed competent execution throughout.

---

## 9. Verdict

**`L1-conditional`.**

Not `L1-fail`, because the topic survives: I can write a tension, Engine A renders it excellently, the
counter-case is reachable, `flows` and `actors` take my material cleanly, and the opt-in conclusion
layer holds the conditional link between my three tracks better than I expected anyone to.

Not `L1-pass`, because the causal spine of my genre — a sourced, ordered sequence of decisions — is
the one structure the schema leaves unlinked and the one the board actively un-orders, and because
my time-saved misses the bar by 285 minutes for exactly that reason.

**Escalation clause for the judge:** if L2 confirms § 2.3(3) — that a chronologically authored
`facts[]` renders on the board grouped by column with no date affordance — this seat should be
re-scored `L1-fail` for the entertainment/production shape. The finding is `GP-02` and its
`l2_priority` says so.

---

## 10. Voice — Toby Ansah

Right. So. I want to start somewhere odd, which is that I *liked* reading this. That's not a
compliment I hand out. Most research frameworks that land in my inbox are a spreadsheet with a
philosophy bolted on, and this one has actual opinions — the bit in `conclusions.ts` where somebody
sat down and wrote *"a synthesis that cannot be wrong is not a conclusion, it is a vibe, and it does
not belong here"* — mate, that's the whole job. Facts on by default, opinions off until a human lets
them in. I've been trying to explain that discipline to people for four years and this file does it in
a code comment. Somebody there has been burned before, and I mean that warmly.

And look, this is the bit nobody outside a studio believes: the hardest part of my job is not finding
out what went wrong. Everybody knows what went wrong. Six people will tell you on the record within a
year, and three of them will be right. The hard part — the six of my eight hours — is working out
*when* it went wrong, because a studio's history is not published anywhere. It exists as a shape you
reconstruct from a job posting in the spring, an engine licence renewal, the month the art director's
LinkedIn changed, and a milestone build that leaked with a date on it. I am doing archaeology. I am
dating strata. And what I need from a research tool, more than anything else on earth, is somewhere to
put a date and a decision next to each other and draw an arrow.

Which brings me to the thing that genuinely annoyed me. `mechanisms[]` — the *causal chain*, the
spine, the bit that is the actual argument — is the only structure in this entire notebook that
doesn't reference its own evidence. The reversals cite fact ids. The conclusions cite fact ids and get
*wounded* when you cut one, which is a lovely bit of engineering. And then the mechanism, the place
where you say **this caused that**, is a list of sentences. Free text. Vibes with a THEREFORE in front
of them. It's the one place in the file where you're making the strongest possible claim and the one
place you're not asked to show your working. I read that three times because I assumed I'd missed a
field.

And I know exactly how it happened, because it's the same way every game ships broken. It fit the one
topic they had. On a price chart the mechanism is obvious and the facts are all sitting right there in
the same paragraph, so nobody noticed the wire wasn't connected — the demo ran fine. That is
*precisely* the shape of the decision I make videos about. Somebody built the thing that worked for the
case in front of them, three years pass, and the case in front of them is now everybody's case. I'm not
being snide. I'm saying I recognise it, and that the fix is cheap **now** and expensive after twenty
domains are depending on it. That is my entire beat, delivered back to the people who wrote the tool.

The other one — and this is smaller but it made me put my tea down — is `as_of`. Sounds like an event
date. It's a *staleness* date. It's there so the notebook knows what expires first. On a crypto video
those are the same field, because everything that matters happened at the price you're quoting. On
mine they're opposites: my most important fact is the oldest one, the greenlight, the thing that will
still be true in ten years, and the schema's date field is measuring how soon my facts rot. I'd have
built my entire timeline on a field that means "when I looked", and I'd have found out in the edit.

Then there's the board, and honestly the board is where I'd stop and go back to a spreadsheet. Not
because the columns are wrong — two of them are great, `flows` is exactly right, the sell-in versus
sell-through thing is *the* misunderstanding in my genre and there's a column for it. But: seven
columns, one of which is "the number", and if a card isn't tagged it falls into "the number" without
telling you. Do you understand what that means for me? My entire professional discipline is keeping
sales, reviews and production apart, and this board's default behaviour is *filing things next to
sales*. My worst error, automated. A review score parked in the column marked "what the number did"
and no reception column to rescue it to. Every correction my ex-colleagues have ever DM'd me is
downstream of exactly that filing decision, and here it is as a `??` fallback.

Now the fair bit, because I don't want to be the guy who only knocks things down — that's a rant,
their own engine catalogue says so, and it's right. The counter-case handling is better than mine. It
is *mandatory*, and I have absolutely published videos where I gestured at "of course, some people
say" for eight seconds and moved on. And Engine D's first honesty test — is the premise itself in the
candidate set, could this thing you're explaining just not be real — is the exact discipline that
separates a post-mortem from a hit piece, and I would have been better at my job five years earlier if
somebody had handed me that sentence. My counter-case is "it launched fine and the forecast was
stupid," and that one is a *premise* attack, not a verdict attack, and their steel-man field is aimed
at the wrong target. Small fix. Real fix. Worth doing.

Where I'd leave it: this is a research tool for topics where the story is a *state*. What is the price,
what is the flow, what is the position now. Mine is a story where the story is a *sequence*, and the
tool can hold every one of my facts and none of my order. Which — and I promise this is the last time —
is what a post-mortem always finds. Not that anybody was stupid. That a decision made early, for good
reasons, in a room where the future case wasn't in the room, quietly determined what could be built
three years later.

They made a schema for one topic. They should go and add the date field before it's load-bearing.
