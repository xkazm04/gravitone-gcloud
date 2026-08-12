# L1 dry fit — `llm-research` · Aditi Fernandes

**Topic:** "Benchmark scores stopped being evidence about two years ago, and the field's own papers say so."
**Area:** tech · **Lens binding:** tech · **Level:** L1 (paper walk, no run, no searches)
**Verdict: `L1-conditional`** — the methodic completes my topic and fails two of my seven criteria
*structurally*, not by content. Both failures are single-field edits away from passing, which is why
this is conditional and not a fail.

---

## 1. Column utilisation

```
columns 5/7 used · 2 orphan groups
```

**Used cleanly (4):**

| Column | My material |
|---|---|
| `the-number` | Headline scores and their deltas: MMLU/GPQA/SWE-bench/ARC-AGI trajectories, saturation curves, the reported year-on-year jumps. |
| `actors` | The labs, and — more importantly — *who reports*: vendor self-report vs third-party (HELM, Arena, Epoch, the AISIs). `emptyMeans` "Nobody is named — the story has no agents" is exactly right for my topic. |
| `politics` | EU AI Act GPAI evaluation obligations, NIST/AISI evaluation programmes, model-card disclosure norms. `emptyMeans` "Policy is being assumed to work, or assumed not to" transfers without alteration — this is the best-generalising column in the set. |
| `counter-case` | "Gains are real; contamination is measured and small." Well populated. See §4. |

**Used, degraded (1):**

- `flows` — "Who is buying and selling, through what plumbing, and does the plumbing behave as people
  assume." Read as *evaluation plumbing* — harness, shot count, prompt template, scoring parser — the
  purpose sentence is a startlingly good structural fit, because the whole thesis is that the plumbing
  does not behave as assumed. But `emptyMeans` says "The demand story is unexamined"
  (`dimensions.ts:28-29`), which is false for my topic in both directions: an empty `flows` column
  here means *nobody checked how the score was produced*, which is the single most important gap in
  my domain and the one a reviewer would most need flagged. The column holds my material; its stated
  meaning misinforms the reviewer. That is a content fix, and a cheap one.

**Empty by purpose (1):**

- `macro` — "Rates, currency, liquidity, correlation with other assets" (`dimensions.ts:32-33`).
  I can force compute-scaling trends in here, and I would be doing it to fill a box. The genuine
  analogue — *does the score correlate with anything outside itself* — is construct validity, which
  is orphan group B below, not macro. `emptyMeans` "The asset is being explained in isolation from
  the market it trades in" would fire falsely on a correct notebook.

**Orphan groups (2), named:**

- **Orphan A — instrument validity.** Contamination studies, canary-string checks, n-gram overlap
  measurements, post-cutoff held-out reruns, LiveBench-style refreshes. This is *measurement of the
  measurement* and it is the load-bearing evidence of my entire topic. It is not `the-number` (it is
  a number *about* the number), not `flows` (it is not the harness), not `counter-case` (it argues
  *for* my thesis). It has no column. Worse: per `G-000`, an untagged card falls through
  `?? DEFAULT_DIMENSION` into `the-number` (`dimensions.ts:42-49, 62`) — so my contamination evidence
  silently files itself under the very column whose credibility it destroys. I am citing `G-000`, not
  re-raising it, but the domain-specific consequence is worth the sentence: in a market topic the
  fallback misfiles a demand fact; in mine it hides the disconfirming evidence inside the confirmed
  claim.
- **Orphan B — construct validity / downstream transfer.** Whether a score predicts anything anyone
  cares about: benchmark-to-deployment transfer, task-suite-vs-real-work studies, the gap between
  "scored higher on a code benchmark" and "closed more issues". No column. This is the material that
  separates my honest version from my polemical one.

**Contradicting the brief.** HYPOTHESIS 1 said the seven columns are market-shaped and will collapse
on non-market topics. Half right, and the half that is wrong matters: `actors`, `politics` and
`counter-case` transfer to my domain *including their `emptyMeans` sentences*, unmodified. Only
`the-number` and `flows` carry price-specific language, and only `macro` is genuinely inapplicable.
Five of seven is not a collapse. The failure is narrower and more fixable than the lead implies, and
saying "market-shaped" flatters the problem into a lens argument it has not earned.

---

## 2. My central test — can this methodic produce a version of my topic that is not a takedown?

**No, not by default, and the bias is in the schema rather than in the tone.** Four structural facts,
each citable.

### 2.1 Every tension shape in Phase 2 is a debunk shape

`RESEARCH-PROMPT.md:42-49` enumerates the five shapes a tension may take:

1. the prediction that came true and didn't work
2. the number that contradicts the narrative
3. the mechanism that runs backwards
4. the absent thing
5. the category error

All five are *the consensus is wrong*. There is no shape for **the consensus is right and the
sophisticated objection is wrong** — no counter-contrarian form, no "the correction over-corrected",
no "the alarm was raised and then met". My topic's honest version is precisely a mixture: the
sophisticated objection (contamination) is real *and* the sophisticated objection is over-claimed by
people who dislike the field. Shape 5 will take the first half. Nothing takes the second, and Phase 2
is where a run is instructed to *stop* if it cannot find one of these (`RESEARCH-PROMPT.md:51-53`).
A run that found "the field caught it and mostly fixed it" is instructed to report no tension —
i.e. no video — when it has in fact found the most interesting story available.

### 2.2 The `reversals[]` schema cannot express a turn against the thesis

`{obvious_reading, why_wrong, mechanism, evidence[], escalation}` — `RESEARCH-PROMPT.md:71-72`,
`NOTEBOOK-SCHEMA.md:56-57.`

The second field is named `why_wrong`. There is no `why_right`, no `what_survives`, no
`direction`. A reversal is by construction a demonstration that the obvious reading fails, and
`escalation` requires each one to land *harder* — the field's contract is that the turn compounds.
A reversal that concluded "and on this point the obvious reading holds up better than my thesis
does" has no field to be written in. It would have to be smuggled into `note`.

I looked for my own refutation in the worked reference and did not find it. `notebook.json:282-293`,
reversal `r4`: `obvious_reading` "So institutional adoption failed" → `why_wrong` "It succeeded
completely." At a glance that is a reversal against the notebook's own case. It is not. The
notebook's verdict is *adoption is what broke it* (`notebook.json:14`); `r4` reverses the reader's
momentary inference from `r1`–`r3` and lands harder on the same thesis — its own note says "This is
the final turn and the thesis." The one place I would expect to find a counter-direction reversal is
a reversal of the audience, not of the author. The reference run demonstrates the bias rather than
disproving it.

### 2.3 The counter-direction slot exists — and is built weaker than the pro-thesis slot

To be fair to the design, and this is the part I did not expect: `steel_man` is **mandatory**
(`NOTEBOOK-SCHEMA.md:61-66`, `RESEARCH-PROMPT.md:88-93`) and the schema says its absence "is what
separates an explainer from a polemic". `counter_positions_to_state_fairly[]` exists. The
`counter-case` dimension's `emptyMeans` is the only one in the file that shouts — "DANGEROUS"
(`dimensions.ts:37`). Somebody who cared about this problem designed against it, and I want that on
the record before I take it apart.

Now the asymmetry. Compare the two structures:

| | `reversals[]` | `steel_man` |
|---|---|---|
| Cardinality | array | **single object** |
| Carries a `mechanism` pointer | yes | no |
| Feeds Phase 3's BUT/THEREFORE chain | yes (`NOTEBOOK-SCHEMA.md:49-53`) | no |
| Has an `escalation` | yes | no |
| Consumed by | "step 6 — place the turns" | not listed in the consumption table at all (`NOTEBOOK-SCHEMA.md:9-21`) |

The pro-thesis material is *chain-shaped* — it becomes beats, it gets a causal spine, it escalates.
The counter-thesis material is *paragraph-shaped* — a claim, some evidence, a statement, and
`why_include`. A field literally named `why_include` asks you to justify admitting it, never whether
it might be right. So the counter-case cannot be a **turn**; it can only be an **admission**. That is
the finding, and it is more precise than "there is no counter-reversal": the methodic does permit an
argument against the thesis, and it structurally guarantees that argument will be the flattest thing
in the script.

### 2.4 The verdict is written before the adjudication

`NOTEBOOK-SCHEMA.md:29-31`: **"`verdict` — the one-sentence answer. Written *during research*, not
during scripting."** `engine_fit` is Phase 8 (`RESEARCH-PROMPT.md:104-107`) — after the verdict, the
tension, the reversals and the steel-man are all committed.

Now read `ENGINES.md:91-93`, D-honest tell 2: **"Can any candidate actually win against the author's
prior? If the theories are three framings of one conclusion, the adjudication is decorative."**

These two files contradict each other and nothing reconciles them. The notebook *mandates* an author
prior and dates it to research time; the engine catalogue demands that candidates be able to defeat
that prior. Structurally, D-rigged is the default path out of a conforming notebook, and a compliant
generator producing an Adjudication has already written the answer before it enumerates the
candidates. This is my sharpest finding and I do not think it is repairable by content.

I understand why the field exists — "answer early" is real craft (`CRAFT-BASELINE.md:97-99`) and the
SCQA opening needs the answer at 0:40. The defect is not that a verdict exists. It is that a verdict
written *at research time* and a candidate set enumerated *at render time* means nothing the render
discovers can move it.

### 2.5 Are the three D-honest tells enforceable from the notebook alone?

I checked each against the schema, which is the only artifact a generator must satisfy.

| Tell (`ENGINES.md`) | Enforceable from `notebook.json`? |
|---|---|
| 1 · Is the premise itself in the candidate set? (`:88-91`) | **No.** There is no `candidates[]` field anywhere in `NOTEBOOK-SCHEMA.md`. The candidate set is improvised at render time. In the reference run the requirement survives only as free prose inside an `engine_fit[].why` string — `notebook.json:386`, "Note the D-honest requirement: 'the premise is wrong — it IS rising in some frame' must be in the candidate set." A careful human wrote that sentence. Nothing would have failed had they not. |
| 2 · Can any candidate win against the author's prior? (`:91-93`) | **No**, and actively contradicted — see §2.4. |
| 3 · Is counter-evidence admitted at full strength? (`:94-96`) | **Partly yes.** `steel_man` is a required field. Its *presence* is machine-checkable. Its strength is not — the bar is "genuinely strong" (`NOTEBOOK-SCHEMA.md:65`), which is a judgement, and §2.3 shows the field is shaped so that even a sincere steel-man renders flat. |

**One of three tells has structural teeth. Two are craft advice a generator can ignore at zero cost**,
sitting in a knowledge document the schema never references.

And then the check that made me put my pen down. `script--adjudication.md:128-136` is an
"Engine-D honesty check" table with five green ticks — written by the same pass that wrote the
script. Line 136 is the tell: "target ≥30% — this render runs high by construction; **measure before
shipping**." The one row that could have been computed was not computed, and it shipped with a tick
next to the four rows that were self-assessed. A generator grading its own honesty is not a check.
It is the *appearance* of weighing, which is the exact failure `ENGINES.md:83-85` names as the thing
Adjudication is easiest to fake with. The honesty machinery reproduced the defect it was written to
catch, in the reference artifact, and nobody noticed.

---

## 3. Evidence floor

### 3.1 The ladder is not where the brief thinks it is

HYPOTHESIS 2 said the MEASURED · OBSERVED · INFERRED · ASSUMED ladder has no honest rung for
interpretive or practitioner-consensus evidence. **I contradict this twice.**

First, the rung exists and is good: `knowledge/README.md:38-41` defines **INFERRED — "Our reasoning
across sources"**, requiring "the observations it rests on, stated". That is a correct and honest
home for interpretive evidence, better specified than most style guides manage, and `ASSUMED`
requires an `OPEN-QUESTIONS.md` entry naming what would settle it. For practitioner consensus I would
use INFERRED with the practitioners named. It holds.

Second, and more importantly: **that ladder is not applied to research facts at all.** It is the
evidence contract for the knowledge library's own claims about craft — "every line in a `PATTERNS.md`
carries one" (`README.md:32`). A notebook fact carries `confidence: high | medium | low`
(`NOTEBOOK-SCHEMA.md:41-47`). Two vocabularies, no mapping between them, and the four-rung one never
touches a research claim. Any lens argument built on "the ladder starts at MEASURED and demotes my
domain" is aimed at a file that does not govern notebooks.

### 3.2 The real evidence-floor problem in my domain, which is the opposite one

My problem is not that my evidence is too weak for the ladder. It is that **a benchmark number is
maximally strong and minimally meaningful at the same time.**

GPQA-Diamond 59.4% is measured. It is reproducible to a decimal. It is also, plausibly, a measurement
of an instrument the model has partially memorised, scored on a construct ("graduate-level
reasoning") that the eval's own authors hedge. `confidence: high` is *correct* and *catastrophic* —
it certifies the figure and says nothing about what the figure is evidence of.

**Can the schema express "this figure is precise and the thing it measures is disputed"? Not per
fact.** Three near-misses, and I checked each:

- `facts[].note` — free text. It would hold the sentence. Nothing consumes it, nothing requires it,
  and the schema's own test for a field is "does a step of the composition procedure read this?"
  (`NOTEBOOK-SCHEMA.md:7-9`). Nothing reads `note`. A dispute parked there is a dispute the script
  step will not see.
- `unknowns[]` — `{what, why, impact}`, and `impact` is genuinely the right idea: "it tells the
  script what it may not say" (`NOTEBOOK-SCHEMA.md:76-78`). I would write *what:* does MMLU measure
  reasoning; *impact:* the script says "scored higher on MMLU", never "is smarter". **That works.**
  It is the single best-designed field in the schema and I would use it. But an `unknown` has no
  pointer to a fact id. With twelve benchmark figures in a notebook, three of them contested
  constructs and nine of them fine, the notebook cannot say which three. The constraint is global;
  the defect is per-figure.
- `confidence` itself conflates two orthogonal things — *is the number right* and *does the number
  mean what it claims*. Every domain that cites a measured proxy hits this: benchmark scores, poll
  toplines, box-office trackers, telemetry-derived engagement. This is not a tech problem.

### 3.3 Provenance — my criterion 2, and it fails on one of three

My bar: every benchmark figure carries the **eval version**, the **date**, and the **reporting
party**.

- Date — `as_of` is mandatory on every fact (`NOTEBOOK-SCHEMA.md:47`, "every fact is dated"). Good,
  and better than most research templates. But `as_of` is the *fact's* date. I need the date the
  *evaluation was run*, which is frequently months earlier and is the number that determines whether
  a test set predates a training cutoff. One field, two meanings, and in my domain the difference
  between them *is the thesis*.
- Reporting party — fits in the free-text `source` string. The reference run writes
  `"99bitcoins / investingnews price history"` (`notebook.json:26`), so the convention is a slash-
  delimited blob. Workable; unstructured; not queryable.
- **Eval version — no home.** `lm-eval-harness` v0.4.2 5-shot MMLU and HELM's 5-shot MMLU return
  materially different numbers for the identical model. I grepped: no occurrence of `harness`, or of
  any "version of the eval" concept, in `pipeline/` or `knowledge/`. Confirmed absent. It would go in
  the `source` blob, alongside the party, in prose, where nothing can check that it is present.

One more, and it is the prompt telling me to do the wrong thing. `RESEARCH-PROMPT.md:100`:
*"Vendor statistics → use the direction, not the number, or cut it."* `NOTEBOOK-SCHEMA.md:46` makes
vendor research `low` confidence by default. The instinct is right and I respect it. But in my domain
it is **inverted**. A lab's self-reported score on its own model is usually reproducible — the
absolute number survives. What does *not* survive is the direction: the comparison baseline is
cherry-picked, the competitor is run at a different shot count, the eval is chosen after the results
are seen. The prompt instructs me to keep the biased half and discard the sound half. That is a
content fix — a domain row, not a lens — but it is the kind of content error that produces a
confidently wrong video.

---

## 4. Counter-case reachability

**Reachable, strong, and the best-served part of my walk.** Contradicting HYPOTHESIS 4 for my seat:
"gains are real, contamination is measured and small" has a real literature — decontaminated reruns,
held-out and post-cutoff evaluations, contamination-impact estimates that are frequently single-digit
points, and the straightforward argument from capability transfer to tasks that did not exist when
the model was trained. Phase 1's counter-case row (`RESEARCH-PROMPT.md:32`) points me straight at it,
the `counter-case` column holds it, and `steel_man` forces me to write it.

Three cautions, in descending order of how much they bother me.

**First, the reference run proves the mandatory field does not produce a strong steel-man.**
`notebook.json:432`, in its own `research_gaps`: *"No bear-case-is-wrong source — did not search for
the strongest 'this is normal cycle behaviour' argument, which weakens the steel-man."* The field was
mandatory. The field was filled. The run then confessed it never searched for the material the field
was for. This is exactly L1's charitable-reading trap, caught with an artifact: reading
`RESEARCH-PROMPT.md:88-93` I would have scored the steel-man requirement as working. The produced
notebook says it did not. I am recording that as a `research-prompt` finding — the requirement needs
to bind to a *search*, not to a field.

**Second, `counter_positions_to_state_fairly[]` has no specification whatsoever.** It appears in
`NOTEBOOK-SCHEMA.md:74` as half of a bare heading — "### `candidate_questions[]`,
`counter_positions_to_state_fairly[]`" — with no field list, no rules, and no entry in the consumption
table at `:9-21`. Every other field in that document gets a shape and a reason. For my topic that
array is the most important one in the file, and it is the only field the schema declines to define.

**Third**, for the sake of the cast rather than for me: a 48-hour-old topic genuinely has no
counter-case literature, and the prompt offers no fallback for that. I am not in that seat. Whoever
is, is right about it.

---

## 5. Engine availability — all seven

| Engine | Fit | Assessment |
|---|---|---|
| **A · Reversal Chain** | **excellent, and I would refuse it** | My material is four wrong obvious readings and it would render beautifully. It is also the takedown shape by definition — "having proved something, the script turns on its own proof" is the self-attack, and `ENGINES.md:38-39` already warns "a chain that only knocks things down is a rant". The engine doc knows. The schema does not enforce it. |
| **B · Effort/Payoff Gap** | **fair, and underrated for my topic** | "Here is what it costs to decontaminate a benchmark properly" — the labour of building a genuinely held-out set, run in full, against the payoff of a two-point delta. It is a mechanism a viewer can operate. Nobody would pick it from `engine_fit` because the notebook has no field for *the tedious process*. |
| **C · Parallel Case** | **excellent in principle, unreachable in practice** | See below. |
| **D · Adjudication** | **good — my likely fit** | See below. |
| **E · Briefing** | **poor for the topic, best honesty machinery in the catalogue** | No news event; a standing condition. But `ENGINES.md:128-130` requires the script be dated, **disclose the author's exposure**, and contain a move against its own enthusiasm. I am a former lab employee who is friendly with the people I criticise. Exposure disclosure is the correct move for me and there is no field for it: I grepped, and `exposure_disclosure` exists only as a boolean in a run's `tone-profiles.json:44`. Author exposure is a render-time voice dial, not a research-time fact, so a notebook cannot carry the disclosure into a render that has that dial off. |
| **F · Anchor Ladder** | **plausible, short form** | One benchmark question, carried through: the model gets it right; the question is in the training set; here is the paraphrase; here is the post-cutoff variant. Naturally ordered difficulty, one anchor. Genuinely the best 60-second version of my topic. |
| **G · Paradox Teaser** | **plausible, short form** | "This is not a measurement." Fine, derivative of F for my material. |

**Two strong, two viable-with-gaps, two short-form, one poor.** Not zero, not seven. The catalogue is
in better shape than the notebook that feeds it, and I want to say plainly that a seven-engine
vocabulary with named viewer-pleasures and measured witnesses is a serious piece of work.

### D · Adjudication, assessed honestly

The skeleton fits my topic better than anything else: the candidate set is real and genuinely
competing — *(1) the premise is false, scores are fine and the critics are recycling a 2023 problem;
(2) contamination; (3) selection and reporting choices; (4) construct drift — the score measures
something that stopped mattering; (5) instrument saturation — the eval ran out of headroom, which is
not the same as the model gaining any.* Five candidates, each with a defensible win condition, each
weighable on published evidence. That is what Engine D is for and `ENGINES.md:70-71` is right that it
suits contested "why did X happen" subjects.

And I would still not trust the render, for the reasons in §2.4 and §2.5: candidate 1 — *the premise
is false* — is the tell-1 candidate, it is the one my own criterion 1 demands can win, and there is
nothing in the notebook that lets it. The verdict was written at research time. The candidate set is
improvised at render time. The honesty check is self-graded. Give this notebook to a compliant
generator and it will produce a five-candidate hearing whose outcome was fixed before the hearing
opened, complete with a table of green ticks certifying that it was not.

### C · Parallel Case, and why it is the finding rather than a footnote

`ENGINES.md:61-63`: *"Use when the idea is a principle with a surprising instance. **The viewer is
never told they were wrong** — which is exactly what separates it from Engine A."*

That is my non-takedown. It exists. It is in the catalogue. And it is *right there* for my topic:
educational and psychometric testing has a century of literature on exactly this — item exposure,
teaching to the test, construct validity, Campbell's law, the whole apparatus, fully mechanised, in a
domain a general audience already owns. Establish the rule where it is familiar and uncontroversial,
transfer it to LLM evals, note the twist (a model's "study" is undirected and its test-taking is not
strategic), let the twist deepen it. Nobody is accused of anything. It is the version of this video I
have twice failed to write and it is the one I would actually publish.

**Now find the familiar half in the notebook schema.** `analogy_candidates[]` is
`{for, analogy, quality}` — one line per entry, and `NOTEBOOK-SCHEMA.md:72` says "Short form gets one
or zero." MinuteEarth spends **67 of 114 seconds** on the familiar domain, and `ENGINES.md:64-66`
says the familiar half "comes first, is longer, and does all the mechanical work". You cannot build
67 seconds of mechanised familiar domain out of a one-line analogy string, and there is no other
field that holds a second domain's facts, mechanisms or sources — `facts[]` and `mechanisms[]` are
about the subject.

So: the one engine in the catalogue that renders a non-takedown has no representation in the
notebook. `engine_fit` will mark Parallel Case "poor — no second domain to transfer to", exactly as
the reference run did (`notebook.json:394-397`), and it will be *correct*, because the notebook it is
assessing has no way to hold one. The methodic's escape hatch from the takedown shape is welded shut
by the schema, not by the engine catalogue.

That converts my central complaint from taste into structure, and it is the finding I would fix first
if I only got one.

---

## 6. My scored criteria

| # | Criterion | Result | Reason |
|---|---|---|---|
| 1 | At least one reversal points **against** her thesis, or the notebook states why none does | **FAIL** | `reversals[].why_wrong` + `escalation` (`NOTEBOOK-SCHEMA.md:56-57`) make a counter-direction turn unrepresentable, and there is no field in which to state why none exists. The `steel_man` is a real counter-slot but is not a reversal (§2.3). |
| 2 | Every benchmark figure carries the eval version, the date, and the reporting party | **FAIL** | 2 of 3. `as_of` gives a date but the wrong one; party fits in the free-text `source`; **eval version has no home** — grep-confirmed absent from `pipeline/` and `knowledge/`. |
| 3 | The counter-case is present at its strongest, with sources | **PASS, conditional** | Structurally the best-served requirement: Phase 1 row, mandatory `steel_man`, a `counter-case` column whose `emptyMeans` shouts DANGEROUS. Conditional because the reference run filled the field and confessed it never searched for the material (`notebook.json:432`). |
| 4 | No conclusion attributes contamination to a specific named result without a study | **FAIL** | Nothing in `conclusions.ts` restricts naming. The `unhinged` tier is explicitly defined as "a claim about MOTIVE… indefensible as fact" (`:32-33`) and the shipped example names a specific administration's specific policy (`:164-179`). A required `falsifiableBy` is not a naming policy. |
| 5 | The rendered Adjudication passes the three D-honest tells | **FAIL** | 1 of 3 enforceable from the notebook; tell 2 is contradicted by the mandatory research-time `verdict`; the reference render self-grades its own honesty table and leaves the one computable row uncomputed (`script--adjudication.md:136`). |
| 6 | Conclusions' falsifiers are actual experiments someone could run | **PASS** | And it is the best thing in the methodic. `falsifiableBy` is required (`conclusions.ts:54-55`) and the shipped examples are real experiments — "sustained net inflows through a year in which price falls" (`:83-84`), "one clean decoupling under stress" (`:99-100`). My domain's falsifiers are even cleaner: rerun on a post-cutoff held-out set. Credit where it is due. |
| 7 | Under 2h equivalent | **FAIL** | ~5.5h projected. See §7. |

**3 of 7.** Criteria 1 and 5 are the two I said in my own file I most expected the methodic to fail,
and it failed both for the reason I feared and not for the reason I guessed — the bias is in the
schema, not in the prose.

---

## 7. Time saved

- **Manual baseline:** ~12h (720 min). Would accept: 2h (120 min).
- **Projected with the methodic, L1 estimate:** ~1.5h to a conforming notebook, plus **~4h of my own
  verification before I would put my name on it**. The verification is not optional in my domain and
  I am not padding it: the reference run's own first `research_gap` is *"Still no PRIMARY data — every
  figure remains aggregator-sourced, and several sources wrap them in a bullish framing this notebook
  does not adopt"* (`notebook.json:430`). A contamination claim sourced to a blog's summary of a paper
  ends a professional relationship. Every load-bearing figure goes back to the paper, by hand.
- **Estimate: ~360 min saved · low confidence.**

Low, and I want the reason recorded rather than the number: the 12h baseline is roughly 6h of reading
and 6h of arguing with myself about whether I am being fair. The methodic compresses the reading well
and does nothing at all for the second half — it *pre-empts* it, by requiring the verdict at research
time. It saves me half a day and takes away the part of my process that stops me publishing something
I regret. That is a real saving and it does not clear my bar, and both of those are true at once.

---

## 8. Cognitive-walkthrough

1. *Will I know what each phase wants from my topic?* Mostly. Phase 1's domain table is explicitly
   "for a market/economics topic" (`RESEARCH-PROMPT.md:21-22`) and I will translate it; Phase 5's
   scale conversions are trivially natural for benchmark deltas. Phase 2 is where I will guess.
2. *Will I find the instruction that does it?* Yes — the prompt is well written, and short.
3. *Will I connect what happened to what I wanted?* **This is where it breaks.** I will get a notebook
   whose fields are all full and whose verdict I wrote in hour one, and the artifact will not tell me
   that.
4. *Do I know whether I am closer to a script?* Yes. `engine_fit` is a genuinely good closing move and
   the recording-poor-fits discipline (`NOTEBOOK-SCHEMA.md:81-83`) is the kind of thing people forget
   to design.

---

## 9. Findings — refuter pass summary

Ten findings, in `llm-research--findings.json`. Each was run against the four refutations in
`rubric.md:108-115`; the summary of what survived and what I threw away:

**Discarded before recording** (my topic being hard, not the methodic being wrong):
- "The columns are price-shaped." Five of seven transfer including their `emptyMeans`. Content at
  worst, and I refuse to inflate it.
- "Conclusions have no sources." Pre-recorded `by-design` in `accepted-gaps.md`, and correctly so.
- "Contamination evidence lands in the wrong column." That is `G-000`'s mechanism. Cited, not
  re-raised.
- "The evidence ladder demotes my material." The ladder does not govern notebooks at all
  (`knowledge/README.md:32`). I would have recorded this if I had trusted the brief's framing, and it
  would have been wrong.

**`content_or_lens`:** nine `content`, one `undecided`. I am not arguing for a tech lens. Every defect
I found is either a shared-mechanism bug that hurts all twenty seats — the counter-direction reversal,
the research-time verdict, the unreachable Parallel Case — or a domain row somebody can write in an
afternoon. A lens would let the shared mechanism keep the bugs and give me a private workaround, and
I would rather have the bugs fixed.

The one `undecided` is `G-L1-LR-01`, and it is undecided because the `content|lens` axis does not have
a value for "the shared mechanism is wrong for everyone". I am flagging that as an observation, not a
finding, because I cannot name a target file for it.

---

## 10. Voice — Aditi Fernandes

To be fair to whoever built this, and I mean it: somebody here has thought about honesty harder than
most people who ship research tools. The steel-man is mandatory. The falsifier is mandatory.
Conclusions are off by default and facts are on, and the file explaining why (`conclusions.ts:8-24`)
is the clearest statement of that asymmetry I have read in a product repo. The `unknowns[].impact`
field — *what the script may not say* — is a small, correct, hard-won idea that I have never seen
written down anywhere else, and I am going to steal it for my own process regardless of what happens
to this tool. The evidence contract in `knowledge/README.md` insists that n is always visible and that
sources are quoted rather than paraphrased into authority. That is not decoration. Somebody meant it.

Which is why the rest of this makes me so tired.

The field I object to is `verdict`, and the sentence I object to is nine words long:
*"Written during research, not during scripting."* I understand the craft reason. Answer early is
real. But what that sentence operationally means is **the conclusion is fixed before the evidence is
weighed**, and it sits four files away from a document that says an adjudication is decorative if no
candidate can beat the author's prior. Both files are in the same repository. Neither cites the other.
Nobody has read them next to each other, and that is not a subtle failure — it is the same failure I
spent two years failing to get anyone at a lab to care about, which is that the number and the meaning
of the number are maintained by different people who never meet.

Then there is the honesty table. `script--adjudication.md`, five green ticks, written by the pass that
wrote the script, and the fifth row says *measure before shipping* — and it shipped. One row in that
table was arithmetic. It is the only one that could have been wrong in a way a human would notice, and
it is the one that was left blank with a tick beside it. I have read that specific move in a hundred
model cards. It has a shape: an evaluation section, thorough-looking, self-administered, with the one
number that would have settled it marked *forthcoming*. It is not lying. It is worse than lying,
because everyone involved feels rigorous. A generator taught that a self-assessed table of ticks
constitutes an honesty check has been taught the exact skill I made this channel to argue against.

And the thing that actually stopped me. There is a version of my topic that is not a takedown. It is
Engine C. Establish how testing works where everyone already agrees — item exposure, teaching to the
test, a century of psychometrics — and then walk it across, and nobody in the audience gets told they
were fooled, and nobody at any lab has to be named. `ENGINES.md` describes that engine correctly. It
even says the distinguishing feature is that the viewer is never told they were wrong. And then the
notebook schema gives the entire familiar domain **one line**, in a field called `analogy_candidates`,
graded `quality: medium`, with a note suggesting you consider dropping it. Sixty-seven seconds of
mechanism, in a string. The good version of my video is unreachable, not because anyone forbade it,
but because nobody who wrote the schema had a topic where the generous reading was the true one.

That is the whole problem in one sentence, so let me say it plainly. This methodic was derived from a
topic where the consensus was wrong. Every field it grew — `why_wrong`, `escalation`, `obvious_reading`,
a verdict written on day one — is a field for proving somebody wrong. It works. It works beautifully.
It will work on my topic and produce a video that is defensible, well-sourced, correctly dated, and a
hatchet job, and the notebook will not contain a single field capable of telling me that is what
happened.

I have abandoned two versions of this video for being too polemical. I abandoned them because I
noticed. This would not have helped me notice. It would have helped me finish.
