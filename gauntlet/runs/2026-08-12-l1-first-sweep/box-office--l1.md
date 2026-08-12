# box-office — L1 dry fit

**Creator:** Marisol Reyes, "Above The Line" · film finance
**Topic:** A film widely reported as a flop was profitable; a film widely reported as a hit was not.
Neither fact is hidden — it just requires knowing what the reported gross excludes.
**Lens binding:** entertainment · **Level:** L1 · **Level verdict: `L1-conditional`**
**Role in this run:** control case. Real numbers, a real counter-case, an abundant literature. If the
methodic struggles here, it is not struggling because my domain is exotic.

> Paper exercise. No film is named — this walks the SHAPE of a film-finance analysis through the
> methodic as written. No searches, no browser.

---

## 1. Column utilisation

```
columns 7/7 used · 2 orphan groups
```

I want this number read carefully, because it is the strongest thing I have to say and it points the
opposite way from the brief.

**HYPOTHESIS (brief): "the seven columns are market-shaped and will collapse or leave orphans on
non-market topics." CONTRADICTED for this topic.** Every column takes material, and two of them take
it better than they take Bitcoin's:

| Column | My material | Fit |
|---|---|---|
| `the-number` (`dimensions.ts:26-27`) | reported worldwide gross, domestic/international split, opening weekend, the reported production budget | **used — and overloaded, see §3** |
| `flows` (`:28-29`) | the exhibitor split; how theatrical money actually travels from a ticket to a distributor; whether the plumbing behaves as people assume. `purpose` reads *"who is buying and selling, through what mechanism, and whether it behaves as assumed"* — that is a one-line statement of my entire thesis. | **excellent** |
| `actors` (`:30-31`) | studio, exhibitor chains, co-financiers, completion parties, gross-participation talent | **good** |
| `macro` (`:32-33`) | FX on repatriated foreign gross, the contracted theatrical window, comparable-title behaviour in the same release corridor | **used, label mismatched** — "rates, currency, liquidity, correlation with other assets" is content-shaped for markets, but every one of those has a film analogue and the currency clause is literal |
| `politics` (`:34-35`) | production tax credits and rebates, and — precisely per the `purpose`'s *"whether it was actually implemented"* — whether the credit was ever monetised. Credits move net cost by tens of millions. | **excellent, and I did not expect it** |
| `counter-case` (`:36-37`) | the studio's framing, at strength — see §5 | **used** |
| `conclusions` (`:38-39`) | "unprofitable" vs "did not meet expectations" — the distinction my whole format turns on | **used** |

### The 2 orphan groups — named

**Orphan A — THE MODEL.** The standard rentals split, the P&A rule-of-thumb, the breakeven multiple.
These are *assumptions applied to facts*, and there is no column for them because there is no
**field** for them (§4). They are not facts (they were not found, they were adopted), not mechanisms
(they are arithmetic, not a BUT/THEREFORE chain), not unknowns (they are not unknown, they are
stipulated) and not conclusions (they carry no leap and no falsifier — they carry a *sensitivity*).
Filed nowhere, they end up narrated as if measured, which is the exact error my channel exists to
correct.

**Orphan B — THE REVENUE TAIL.** PVOD, the streaming licence, television, home entertainment,
ancillary. Half the P&L, arriving over three to five years. `flows` is about who is transacting *now*;
`currency` (`NOTEBOOK-SCHEMA.md:84-87`) is about the notebook's own shelf life and is **decay-only**
(`expires_first[]`, `durable[]`). My topic's evidence *accrues* — the P&L gets more knowable every
quarter. There is no `matures[]` and no column for revenue that has not happened yet.

A third candidate — back-end participation and loss allocation, i.e. "the studio didn't lose money,
the co-financier did" — I could place under `actors` with different content. I am not counting it as
an orphan. Padding the orphan count is how a Creator argues themselves a lens they didn't earn.

**Testing the `emptyMeans` claims** (`env.md` § L1 asks for this explicitly): six of seven hold
verbatim for me. `macro`'s — *"the asset is being explained in isolation from the market it trades
in"* — is actually sharper for film than for Bitcoin: a title explained without its release corridor
and its comps is the single most common flop-discourse error after the gross one. `the-number`'s —
*"no measured baseline — every claim downstream is unanchored"* — is the one that misleads, because in
my domain a full `the-number` column is **not** a measured baseline (§3).

---

## 2. MY CENTRAL TEST — the honest range

**The bar.** The notebook must refuse to state a profit figure it cannot support while still being
useful. The true P&L is unknowable from public sources. The audience wants a number; the evidence
supports a range with an unknown in the middle; an honest video delivers the range. A notebook that
produces a confident figure has failed *even if the figure is right*.

**The mechanism under test** is `unknowns[]`, and on paper it is the best-designed thing in this
schema. `NOTEBOOK-SCHEMA.md:76-78` calls `impact` **"the important field"** and gives it a job no
other field has: *"it tells the script what it may not say."* `RESEARCH-PROMPT.md:95-102` makes it a
phase of its own. `NOTEBOOK-SCHEMA.md:98-99` makes it a rule: an unknown with no consequence for the
script is a note, not a constraint. The reference run's own `NOTES.md:29` says it *"earned its place
immediately."* I came in expecting this to be the feature that saved me.

Three tests. It fails two.

### Test 1 — can `impact` express a range with an unknown in the middle? **NO, by type contract.**

Every statement of the field is **prohibitive**:

- `app/_phases/_shared/notebook/types.ts:70` — `/** What the script may NOT say. The load-bearing field. */`
- `NOTEBOOK-SCHEMA.md:78` — *"impact: say 'roughly half its high', never a figure."*
- `RESEARCH-PROMPT.md:99-102` — all four worked examples are subtractions: *use a ratio, not a number*
  · *use the direction, not the number, or cut it* · *says "moves with", not "because of"* · *never
  pick silently*.
- The reference notebook's four live impacts (`notebook.json` → `unknowns`, and
  `app/_phases/_shared/notebook/unknowns.ts:11-41`): three are outright bans, one
  (`u-cohorts:17`, *"use both readings, make neither decisive"*) is the closest thing to a positive
  obligation in the corpus — and note it was written to *withhold* a conclusion, then deleted as a
  constraint the moment round 1 could name the seller (`unknowns.ts:18-19`).

What I need is the opposite shape. Not "never state a profit figure" — that produces a video with no
number in it, which is not honest, it is evasive, and my audience correctly reads it as a dodge. I
need: **"state the range $X to $Y; name the unknown term (back-end participation and the streaming
licence) out loud; attribute the width to it."** That is a *must-say*, and there is nowhere to put a
must-say. `impact` is a deny-list where I need an allow-list with a required shape.

The workaround — writing the obligation as prose inside `impact` — is available and I would use it.
It is also unenforceable in exactly the way §Test 3 shows a prohibition already is, and it is a
`notebook-schema` finding rather than a workaround per `env.md` § L2's instruction.

### Test 2 — does the range itself have anywhere to live? **NO.**

There is no numeric interval anywhere in the schema. `facts[]` (`:41-47`) is one dated sourced claim
with a three-valued `confidence`. `scale_conversions[]` (`:67-68`) is `{raw, felt}` — one raw number.
`Confidence = "high" | "medium" | "low"` (`types.ts:12`) cannot say "±$60m, and the width is the
answer." My central deliverable — a bounded interval whose *width is the finding* — must be smuggled
in as a prose `claim` string, at which point nothing downstream knows it is an interval and every
render is free to quote one end of it.

### Test 3 — does the mechanism reach the rendered script? **NO — and the repo already proved it.**

This is the finding. It is not my inference; the reference run wrote it down about itself.

`pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/script--reversal-chain.md:205-216`:

> **❌ FAILED TWICE** … *(a) A constraint violation.* The notebook's `unknowns[3]` says causality
> between yields and Bitcoin is *asserted by analysts, not measured*, with the impact **"phrase as
> 'moves with', not 'because of'."** The render said *"So when Treasury yields climbed… Bitcoin was
> sold"* — a causal construction. **Found by the UI prototype agent's constraint ledger, not by any
> of the twelve checks below.**
>
> The general lesson: **the notebook's `unknowns[].impact` lines are the only machine-checkable craft
> constraints we have, and nothing was checking renders against them.**

One constraint in four was violated, on the only topic this methodic has ever run, by the people who
wrote the constraint, and it was caught by an agent that wandered in from another step. My topic has
*one* constraint that matters and violating it is the whole failure.

Trace the plumbing and it is worse than "no check". `NOTEBOOK-SCHEMA.md:21` maps every field to a
numbered step of the composition procedure — `tension` → step 1, `engine_fit` → step 2, `reversals` →
step 6 — except one row: **`currency`, `unknowns` → "honesty checks throughout."** Throughout is
nowhere. It is the only field in the contract with no consumer, in a document whose stated principle
(`:8-9`) is *"the test for any field: does a step of the composition procedure read this? If nothing
consumes it, it does not belong."* By its own test, `unknowns` does not belong — which is precisely
backwards, because it is the most valuable field in the file.

There *is* a checker: `app/_phases/script/constraints.ts`. Read its first four lines:

> *"THE CONSTRAINT LEDGER — every notebook `unknown` carries an `impact`, which is a rule about what
> the script may not say. **Nothing in the library's UI contract checks a render against them, so
> this is the step's own invention.**"*

And read `:39-58`: `CONSTRAINT_LEDGER` is a **hand-authored literal**, one row per unknown per render,
with the verdict (`"honoured"` / `"at-risk"`) and the justification typed in by a human. It is a
report card someone filled in afterwards, not a gate anything passes through. `ledgerFor()` (`:79-103`)
is careful, id-keyed, handles supersession and dangling rows — genuinely good engineering — around a
data structure that a render cannot fail to produce, because a render does not produce it at all.

**Verdict on my central test: the strongest-looking feature of the schema is a well-designed noun with
no verb.** It records the constraint, surfaces it in the UI, keys it robustly, and never once stops a
script saying the thing.

---

## 3. Four distinct money facts

Gross · rentals · budget · P&A. The question is whether the methodic can keep them apart, and whether
it can express the **split model** as distinct from the facts.

**Keeping them apart — partially, and worse than it looks.**

- `facts[]` will happily hold four rows. Nothing merges them at write time. So far so good.
- On the board, all four land in **one column**. `the-number`'s label and `purpose` are singular by
  construction — *"What the price actually did, and over what window"* (`dimensions.ts:26`). Four
  incommensurate quantities — money the public paid, money the distributor received, money spent
  making it, money spent selling it — render side by side, with only their prose claims to
  distinguish them. A reviewer scanning that column sees a pile of dollar signs.
- Compounding it: `the-number` is `DEFAULT_DIMENSION` (`dimensions.ts:62`), so every untagged card
  lands there too (G-000, `accepted-gaps.md`). The column that most needs internal structure in my
  domain is the one already designated as the junk drawer.
- The board has **no arithmetic relationship between cards**. Gross → rentals is a multiplication.
  Rentals − P&A − negative cost is a subtraction. The wound graph (`restsOn` on conclusions,
  `conclusions.ts:44-45`) models *dependency*, not *derivation*: it can say "this rests on that", it
  cannot say "this equals that times 0.5". My deliverable is a waterfall and the schema has no
  waterfall.

**Expressing the MODEL as distinct from the facts — no. This is orphan A, and it is my second-sharpest
finding.**

The standard split is not a fact about a film. It is an industry convention I am *applying* to facts,
with a known distribution around it. Walk the available homes:

| Home | Why it fails |
|---|---|
| `facts[]` | It has no `source` that is not circular and no `as_of`. Filing it here trips the schema's own **"laundered confidence"** anti-pattern (`:108`) — a convention promoted to fact by being restated. `confidence: "medium"` would understate it in the wrong dimension: I am highly confident the *convention* exists and have no idea what *this deal* was. |
| `mechanisms[]` | `chain[]` must alternate BUT/THEREFORE (`:52`). "Multiply by roughly half" is not a causal link, it is arithmetic. Forcing it produces a fake THEREFORE, which is the wiki-timeline defect wearing the law's own uniform. |
| `unknowns[]` | The split is not unknown. It is *stipulated*. Filing a stipulation as an unknown means the only thing the schema can do with it is forbid speech about it. |
| `conclusions` | Closest, and still wrong: a conclusion carries a `leap` and a `falsifiableBy`, and the model carries neither. What it carries is a **sensitivity** — "at 45% the film loses money; at 55% it clears" — and there is no field for a sensitivity. |
| `steel_man` | No. |

So the model is narrated without provenance, or it is quietly baked into a fact's `claim` string. Both
are exactly the error in my pet-peeves list — *"needed to make 2.5× repeated as a law of nature rather
than a rule of thumb."* **The schema has no way to say "rule of thumb."** That is a structural
invitation to commit my single most-corrected error.

---

## 4. Evidence-floor check

Three tiers, and none of them is what the ladder describes.

**HYPOTHESIS (brief): "the evidence ladder MEASURED · OBSERVED · INFERRED · ASSUMED has no honest rung
for interpretive or practitioner-consensus evidence." CONTRADICTED — but not the way the brief hoped.
The ladder never touches a notebook fact at all.**

`MEASURED / OBSERVED / INFERRED / ASSUMED` is defined at `knowledge/README.md:36-41` and it governs
**`PATTERNS.md` craft claims** — statements about how videos are made, evidenced against the video
corpus. Grep the repo: it appears in `ENGINES.md`, `TEMPLATE.md`, and the per-step `PATTERNS.md`
files. It appears **nowhere in `NOTEBOOK-SCHEMA.md`, nowhere in `RESEARCH-PROMPT.md`, and nowhere in
`types.ts`.** A notebook fact carries `{source: string, confidence: high|medium|low, confidenceNote?}`
(`types.ts:16-27`) — a different, weaker instrument, and no walker should score the ladder against
their topic without noticing they are scoring the wrong file. I am recording this as the run's most
useful negative result and the thing I would want retracted from the brief.

Now my actual three tiers against the instrument that *does* apply:

| My evidence | What it really is | Where the schema puts it | Verdict |
|---|---|---|---|
| **Reported grosses** | Measured — genuinely counted — but *partial*: it is the consumer transaction, not the studio's receipt, and territories report on different bases | `confidence: high`, `source: "the reporting aggregator"` | **Wrong in the dangerous direction.** The schema's confidence axis asks *how sure are you the number is right*. I am very sure. The problem is that the number is **complete but not the number people think it is** — and `high` broadcasts authority for a figure whose defect is semantic, not statistical. `note?` can carry the caveat; nothing makes it. This is my pet peeve #1 rendered as a data model. |
| **Trade-press budgets** | Approximate, single-sourced, quoted by the outlet from an interested party, and **excluding marketing by convention** | `confidence: medium`, `source: "the trade"` | **Nearly adequate, one field short.** There is no `sourceClass` — REPORTED vs PRIMARY vs FILING. My scored criterion 3 wants *"labelled as reported, with the outlet"*, and `source` is a free string that will hold `"Trade X, reported"` if I type it and hold `"$150m"` if I don't. Nothing enforces the label, and downstream nothing can filter on it. |
| **My industry sources** | True, load-bearing, and **unciteable by protection** | Nowhere honest | **The floor breaks.** `NOTEBOOK-SCHEMA.md:94`, Rule 2: *"Every fact dated and sourced. **No exceptions**, including ones that seem like common knowledge."* My best evidence has no exception to claim. The only moves are (a) write `source: "industry source, withheld"`, which satisfies the letter and is unverifiable by design with no field marking it as *deliberately* so; or (b) drop the fact, which is demoting my best material for the reason the L1 spec warns about. |

**So: can the ladder hold a claim I know to be true and cannot source? No — and the reason is not the
ladder, which does not apply here. It is Rule 2's absolutism plus a `source` field with no class.** A
`PROTECTED` class costs one enum and buys an honest row: *the claim is load-bearing, the sourcing is
withheld by the researcher, and every downstream consumer can see that it is a different kind of
claim.* Without it, the schema's own honesty discipline pushes my strongest evidence either out of the
notebook or into a disguise.

---

## 5. Counter-case reachability

**HYPOTHESIS (brief): "Phase 1's mandatory counter-case row is unsatisfiable for topics with no
literature." CONTRADICTED, emphatically, and I am the wrong Creator to test it on.** My counter-case is
not scarce, it is *published quarterly*. As the control case, my job here is to confirm the row works
when the material exists — it does.

The studio's framing, at full strength, in its own words:

> *A theatrical release is not a profit centre; it is the marketing event that establishes an asset
> the company will monetise across a decade of windows, licensing, parks, consumer products and
> library value. Judging a title on a theatrical P&L is like judging a store on the cost of its
> opening weekend. And the number you are calling a loss is a timing artefact of when P&A is
> recognised versus when downstream revenue arrives.*

That is genuinely strong and it can beat me. It is also, note, **structurally the same shape as my own
thesis** — "you are measuring the wrong thing" — which makes it the hardest kind of steel-man to
render honestly and the easiest to rig. `ENGINES.md:81-96` § D-honest vs D-rigged has exactly the
right three tells for this, and tell #1 — *is the premise itself in the candidate set?* — is the
single most useful line in the methodic for my topic. My premise *is* "we can know the P&L," and the
honest adjudication has to admit it might not be knowable, which is my senior bar arriving from an
unexpected direction.

One phrasing complaint, minor: `RESEARCH-PROMPT.md:32` asks for *"the strongest argument that nothing
unusual is happening."* My counter-case is not "nothing unusual is happening" — it is "your instrument
is wrong." It fits, because the studio's framing does amount to *this is ordinary accounting, calm
down*, but the row's phrasing is shaped for anomaly topics and a literal reading would send a run
looking for the wrong document.

---

## 6. Engine availability — all 7

| Engine | Fit | Why |
|---|---|---|
| **A · Reversal Chain** | **excellent** | *That's the gross, not the take* is a reversal, and the format is a chain of them: the headline number → but the exhibitor keeps half → but the budget excluded marketing → but the co-financier bore the loss → but the library value is real. Four turns, native. This is my default and it is the one I am most afraid of (§7). |
| **B · Effort/Payoff Gap** | **good** | The waterfall is a mechanism a viewer can operate. Laboriously walk a billion dollars down the line and arrive at a shrug. The disproportion IS the lesson, per `ENGINES.md:49-51`. Genuinely strong and I had not considered it. |
| **C · Parallel Case** | **good** | Establish the rule in a familiar domain — a touring band's ticket sales versus the band's actual take — fully mechanised, then transfer. `ENGINES.md:61` — *"the viewer is never told they were wrong"* — which is a real advantage when correcting an error the audience holds with some pride. |
| **D · Adjudication** | **excellent, with a caveat** | "Did it lose money" with candidate answers, weighed. And critically, the honest version must put *"the P&L is not knowable from public sources"* in the candidate set — where, on my evidence, it wins. The engine whose honesty standard is written down (`:81-96`) is the engine that meets my senior bar. |
| **E · Briefing** | **poor** | Requires a subject the viewer has no position on (`:119`). Flop discourse is nothing but positions. |
| **F · Anchor Ladder** | **good (short form)** | One ticket stub, walked down five rungs. Highest information density in the corpus (`:142`) and my waterfall has naturally ordered difficulty. |
| **G · Paradox Teaser** | **good (short form)** | *"This film made a billion dollars and lost money."* A flat contradiction that must resolve — textbook `:146`. |

**6 of 7 plausible, 1 poor.** The skill says *"zero is a blocker; seven is a smell (it means the
notebook has no shape)."* Six is close to the smell and I have interrogated it: it is real, not
mushy. The material is *simultaneously* a mechanism (B, F), a contradiction (G), a correction (A) and
a contested question (D), because a P&L waterfall genuinely is all four objects. Different videos,
same notebook — which is the "notebook is the asset, script is a disposable render" commitment
working exactly as advertised. I will say a good word about it, once.

**The gap it exposes:** `engine_fit[]` (`NOTEBOOK-SCHEMA.md:80-82`) records *poor* fits with reasons
so the next session does not re-litigate. It has no way to record an engine that **fits well and is
hazardous**. Engine A is my best fit and its closing move is *honest synthesis → reframe*
(`ENGINES.md:28-29`) — a reframe wants a landing, a landing wants a number, and the whole architecture
of the engine pulls toward the confident figure my senior bar forbids. `fit: "excellent"` with a `why`
cannot say "and it will make me lie."

---

## 7. Scored criteria

| # | Criterion | Result | Reason |
|---|---|---|---|
| 1 | Gross, rentals, budget and P&A are four distinct facts, never merged | **PARTIAL FAIL** | `facts[]` holds four rows fine; the board collapses all four into `the-number`, which is also the default-fallback column (§3, `dimensions.ts:26,62`). No derivation link between them — a waterfall rendered as a pile. |
| 2 | The unknowable component survives into the script as a hedge, not dropped for cleanliness | **FAIL** | The field exists, is well designed, is id-keyed, is surfaced in the UI — and nothing in the methodic checks a render against it. Demonstrated violation in the only run that exists (`script--reversal-chain.md:205-216`); `NOTEBOOK-SCHEMA.md:21` gives `unknowns` no procedure step; `constraints.ts:1-4` says so in its own header. And `impact` is prohibition-shaped (`types.ts:70`), so even honoured it produces a video with no number rather than a video with a range. §2. |
| 3 | Every trade-press figure labelled as reported, with the outlet | **PARTIAL FAIL** | `source` is a free string and `confidence` is a three-valued axis measuring the wrong thing. No `sourceClass`, so REPORTED vs MEASURED vs PROTECTED is a typing convention, not a contract. §4. |
| 4 | `the-number` fits here — control case; struggling with me means it is not domain-specific | **PASS — and that is the bad news** | The columns fit me. 7/7, two orphans, both of which are *schema* gaps wearing a column costume. My failures are not "the board is market-shaped"; they are "the notebook cannot hold a model, an interval, or an unenforced constraint" — and those bite every domain that does arithmetic on facts. Read criterion 4 as designed: the problem is not domain-specific. |
| 5 | The counter-case is the studio's framing, at strength | **PASS** | Reachable, published, genuinely capable of beating me, and `ENGINES.md` § D-honest gives three checkable tells for whether I rigged it. Best-served requirement in the methodic. §5. |
| 6 | Conclusions distinguish "unprofitable" from "did not meet expectations" | **PARTIAL PASS** | The distinction is expressible as two conclusions with different `falsifiableBy`, and mine are checkable (a participation statement, a litigation exhibit). But the `leap` ladder (`conclusions.ts:26-34`) measures **distance from evidence**, not **precision of claim**: "$47m loss" and "somewhere between break-even and $90m down" both score `moderate`, both render identically, and only one of them meets my bar. The ladder cannot see the axis my format lives on. |
| 7 | Under 60 min equivalent | **FAIL** | ~2h15 estimated against a 6h baseline. Good saving, wrong side of my line. §8. |

**4 fail-or-partial, 2 pass, 1 partial-pass. Level verdict: `L1-conditional`.** Nothing structurally
blocks my topic — every piece of material has somewhere to go, six engines will render it, the
counter-case is right there. What fails is the honesty apparatus, which is the only part I actually
needed.

---

## 8. Time-saved estimate

**~225 min saved (~3h45) · MEDIUM confidence · MISSES MY BAR.**

Baseline 6h. Estimated with the methodic: **~2h15.**

| Phase | Mine today | With the methodic | Δ |
|---|---|---|---|
| Retrieval — grosses, trade budgets, comps | ~90 min | ~25 min (Phase 1's 4–8 searches, well-scoped) | **−65** |
| Finding the tension | ~0 (I arrive with it) | ~0 | 0 |
| Building the waterfall + applying the model | ~90 min | ~75 min — the arithmetic is mine either way, and now I also have to decide where to file a model the schema has no field for | **−15** |
| Scale conversions / making it felt | ~45 min | ~10 min (Phase 5 is the best-specified phase in the prompt, `:77-86`) | **−35** |
| The two calls to industry sources | ~60 min | ~60 min, and then a fight with Rule 2 about how to file what they told me | 0 |
| Steel-manning the studio | ~45 min | ~15 min (Phase 6 is a hard requirement and well-phrased) | **−30** |
| Honesty pass — making sure no render states a number I can't defend | ~30 min | ~30 min, **unchanged**, because §2 means I am still the checker | 0 |
| Structuring for script | ~60 min | ~20 min | **−40** |

**Confidence is MEDIUM, not high**, and per `accepted-gaps.md` § `scope-note` this is an estimate of
what the methodic *would* save if executed as written — there is no runner, so nothing here is a
product measurement. It is also generous: I assumed a competent execution of every phase, which
`SKILL.md` § L1 names as this level's blind spot, and the one time this methodic was actually run it
violated one of its own four constraints.

**A negative-shaped result inside a positive number:** 3h45 saved is real and I would take it any
other week. My accept-bar was 60 min **conditional on** the notebook being honest that the true P&L is
unknowable. It misses on both terms, and the second one is not a matter of degree.

---

## 9. Findings

Eight, all refuter-passed. See `box-office--findings.json`. Impact-ranked:

| id | Title | Sev | c/l |
|---|---|---|---|
| `G-L1-BOX-01` | `unknowns[].impact` binds nothing — the schema's own consumption table gives it no procedure step, and the only run violated one | blocker | content |
| `G-L1-BOX-02` | No node for a MODEL — an assumption applied to facts has no honest home | major | content |
| `G-L1-BOX-03` | `impact` is prohibition-only by type contract; cannot express a required range | major | content |
| `G-L1-BOX-04` | Facts carry no `sourceClass`; Rule 2 has no slot for a true-but-unciteable claim | major | content |
| `G-L1-BOX-05` | The `leap` ladder measures distance from evidence, never precision of claim | major | content |
| `G-L1-BOX-06` | `the-number` is singular by construction and must hold four incommensurate money facts | minor | content |
| `G-L1-BOX-07` | `engine_fit` cannot record an engine that fits well and is hazardous | minor | content |
| `G-L1-BOX-08` | `currency` is decay-only; a topic whose evidence accrues has no `matures[]` | minor | content |

All eight `content`. I want that on the record from the control case: I was handed the seat most
likely to say "my domain needs its own lens" and I am not saying it. Every one of these is a field the
shared mechanism should grow, and every one of them helps the Bitcoin topic too.

---

## 10. Voice — Marisol

Right. Let me do the thing I do.

The headline number is not the number. That's the gross, not the take. Roughly half of a domestic
ticket never reaches the distributor, the reported budget is the negative cost and excludes the
marketing spend that is frequently the same size again, and the trades print all of it as though it
were a receipt. It is not a receipt. It is a press release with a decimal point, sourced to somebody
whose bonus depends on the shape of the sentence, and the outlet knows that, and prints it anyway,
because "sources say the budget was" is four words cheaper than reporting.

So I came to this thing looking for one specific affordance: somewhere to put *I don't know, and here
is how much I don't know, and the width of that gap is the video*. And I found it! `unknowns[].impact`
— **"the important field"**, says the schema, and it is right, it is the best idea in the document.
Then I pulled the thread. `NOTEBOOK-SCHEMA.md:21` is a table where every field names the procedure
step that consumes it. Step 1, step 2, step 4, step 6, step 8. And in the last row, where `unknowns`
should have a number: *"honesty checks throughout."* Throughout. Mate. Throughout is what you write
when there isn't one. Every other field in this contract has a named consumer and the honesty field
has a vibe.

And I would have let that go as a documentation shrug, except the repo already caught itself. One
topic has ever been run through this. Four constraints. One got broken — a causal "because" where the
notebook had explicitly written *"moves with", not "because of"* — and it was caught by a **UI
prototype agent that happened to be building something else**, against twelve self-checks of which
zero were looking. Then they wrote the lesson down, in bold, in the artifact: *nothing was checking
renders against them.* And then they built a constraint ledger whose own header says it is "the step's
own invention," and whose rows are **typed in by hand, after the render, one per engine.** That is a
scorecard. I can fill in a scorecard. I have been filling in scorecards for seven years; the entire
industry runs on somebody filling in a scorecard afterwards and the number at the bottom being
whatever was needed. What I wanted was a gate.

Then the second thing, which is quieter and worse. `impact` is a **ban**. Read the type comment — "what
the script may NOT say." Read all four worked examples in the prompt: don't, never, not, cut. Fine for
a spot price that wobbles three grand in a week. Useless for me, because a video that refuses to give
a number is not honest, it is **cowardly**, and my audience can smell the difference from the thumbnail.
The honest deliverable is *between roughly break-even and roughly ninety million down, and the reason
it's that wide is the back end, and nobody outside the participation statements knows the back end.*
That is a must-say. The schema has a deny-list and no allow-list, and there is no interval type
anywhere in it — `{raw, felt}` takes one number, confidence is three words, a range has to be smuggled
in as a string. So the field that was going to save me can only make me quiet.

And then the one that made me laugh. Nowhere to put the **split**. Not a fact — nobody measured it, I
adopted it. Not a mechanism — it's multiplication, and if I force it into a BUT/THEREFORE chain to
make it fit, I've written a fake causal link into the one document that exists to prevent fake causal
links. Not an unknown — I know it perfectly well. Not a conclusion — it has no falsifier, it has a
*sensitivity*, and at forty-five percent the film loses money and at fifty-five it clears, and that
swing is bigger than most of the facts in the notebook. So it goes in as prose and gets narrated with
the same voice as the grosses, and I have just done, structurally, at the level of the data model, the
exact thing I have spent seven years correcting: **"needed to make two and a half times" delivered as a
law of nature instead of a rule of thumb.** The schema cannot say "rule of thumb." It has no words for
the difference between a measurement and a convention, which — I'd gently point out — is the difference
this entire trade is built on not mentioning.

Credit where it's owed, because I'm not here to be difficult for its own sake. The columns fit. I
expected to be told my domain was a bad fit for a board built for a crypto video and instead `flows`
reads *"who is buying and selling, through what mechanism, and whether it behaves as assumed,"* which
is my thesis with the serial numbers filed off, and `politics` asks whether a policy was *actually
implemented*, which is the tax-credit question exactly. Seven of seven. And the counter-case row is
the best-served requirement in here — the studio's framing is strong, published, and could genuinely
beat me, and § D-honest's first tell, *is the premise itself in the candidate set*, is the sharpest
sentence in the whole methodic for my topic, because my premise is "we can know this" and the honest
answer is that we can't. Somebody thought hard about that page.

Which is why the verdict lands where it does. I'm the control. Real numbers, a real opposition, a
literature you can drown in, and the board held all of it. If I were sitting here saying *film needs
its own lens*, you could reasonably tell me to go away and file better cards. I'm not saying that. All
eight of my findings are content — fields the thing should grow, and every one of them would make the
Bitcoin notebook better too. The problem isn't that the mechanism is shaped for markets. The problem
is that the mechanism can hold facts, and it can hold vibes, and it has nothing in between for the
place where most real analysis actually happens: **arithmetic performed on facts under a stated
assumption, producing a range whose width is the finding.**

Three and three-quarter hours saved and I'd still have to run the honesty pass myself, by hand, the
same as always, because the field that was supposed to do it is a noun with no verb. Sixty minutes was
the bar. Not close, and not really about the minutes.

That's the gross, not the take.
