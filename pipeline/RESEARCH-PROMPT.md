# The research prompt — topic → notebook

The instruction set for a research run. Written to be fine-tuned in the terminal now and lifted into
the app later. Read `NOTEBOOK-SCHEMA.md` and `knowledge/CRAFT-BASELINE.md` before running it.

---

## The brief

> You are researching a topic so that a *video script* can be written from your output — not a report.
> Your deliverable is a `notebook.json` conforming to `NOTEBOOK-SCHEMA.md`.
>
> **You are not writing prose and you are not choosing an engine.** You are finding the tension,
> assembling the evidence, and pre-building the causal chains a script will need.
>
> The failure you exist to prevent: a model handed a topic writes a wiki timeline — accurate facts in
> a reasonable order, connected by "and then", unwatchable. That happens when research and writing are
> the same step. They are not.

## Phase 0 — Declare your prior

Before the first search, write down what you already think is going on (`prior`, two or three
sentences). After Phase 6, state whether the verdict is a **discovery** or a **mirror** of that
prior. A mirror is not a failed run — an unexamined mirror is.

## Phase 1 — Establish the factual spine (breadth)

Run 4–8 searches covering the subject's distinct causal domains. **Derive the subject's own 5–7
domains first and record them in the notebook (`domains[]`)** — the board's columns are built from
that list. The table below is the worked instance for a market/economics topic, not the universal
set; **the counter-case row and the baseline row are mandatory in every derived table.**

| Domain | Ask |
|---|---|
| **The number** | What is it now, what was the extreme, over what period? Get the dates. |
| **The baseline** | The distribution of prior instances, with an n. Where does this one sit inside it? An extremum is a single observation; a baseline is a spread. |
| **Flows / mechanics** | Who is buying and selling, through what plumbing, and does the plumbing behave as people assume? |
| **Structural actors** | Which entities are large enough to move this, and what governs *their* behaviour? |
| **Macro** | Rates, currency, liquidity, correlation with other assets. |
| **Politics / regulation** | What changed, and did it actually get implemented? |
| **The counter-case** | Search explicitly for the strongest argument that nothing unusual is happening. |

**That last row is not optional and is the one most often skipped.** Without it there is no steel-man,
and without a steel-man the notebook can only produce a polemic.

If you search and the argument is not there — the story is hours old, nobody has yet argued the null
— **stop and say so.** Record it as a dated absence in `facts[]` (`kind: "absence"`, with
`searchScope`): what you searched, when, and what would count as the argument appearing. *"No
counter-case exists yet, as of <date>"* is a passing notebook; a steel-man written to fill the box is
a failing one. Where no literature exists you may **construct** the opposition per Phase 6 — and it
must be marked constructed (`steel_man.provenance`), because a constructed opposition is bounded by
your own prior and the reader has to be able to see that. An unsearched counter-case is **not** a
`research_gap`; a gap is work you skipped, and this is a mandate you failed.

## Phase 2 — Find the tension

This is the point of the run. Compare **what people believe** against **what the evidence shows**, and
look for these shapes:

1. **The prediction that came true and didn't work** — the causal story ran as forecast and produced
   the opposite outcome. *(Strongest. This is what the Bitcoin run found.)*
2. **The number that contradicts the narrative** — a widely-repeated story with a figure that does not
   fit.
3. **The mechanism that runs backwards** — something everyone treats as one-directional that has a
   reverse gear.
4. **The absent thing** — a change everyone treats as done that was never actually implemented.
5. **The category error** — the subject is being measured with the wrong instrument.

Write the tension as `{expectation, reality, why_it_is_a_tension}`. **If you cannot find one, stop and
say so.** A topic with no tension is not a video, and reporting that honestly is a successful run.

**Size the tension against the baseline row before you score it.** Record `normal_range` and say
where this instance sits in it. A tension survives only if the deviation is outside normal variation.
If the baseline says this is ordinary, you have two honest outcomes and no third: stop and report the
null, or write the tension as *"why everyone needed this to be anomalous"* — a different tension,
with the baseline itself as its evidence. Both are passing runs. Scoring `strength: high` over a move
sitting in the middle of its own historical distribution is not.

`strength` stays a judgement about how **checkable** the tension is, not how large it is — but a
counter-case that survives Phase 6 **downgrades it by one step** (`high` → `moderate` → `weak`), and
you say in `why_it_is_a_tension` which counter-case did it. A counter-case that survives and leaves
the score untouched is the failure this rule exists to catch.

## Phase 3 — Build the mechanisms

For each causal story the script will need, write it as an explicit alternating chain:

```
X happens
  THEREFORE  Y
  BUT        Z complicates it
  THEREFORE  the outcome
```

**Every link is BUT or THEREFORE. If the only honest connector is AND THEN, you have a sequence, not a
mechanism** — either find the missing link or drop it. This is where the beat chain is actually
authored; the script step inherits it.

## Phase 4 — Pre-compute the turns

For each place the obvious reading is wrong, write a `reversal`:
`{obvious_reading, why_wrong, mechanism, evidence[], escalation}`

**State `obvious_reading` generously.** It is what the script says *before* the turn. A strawman here
becomes a strawman on screen, and the audience notices.

## Phase 5 — Make the numbers felt

Every significant figure gets a `scale_conversion`. Not decoration — a number without a comparison is
a number the script wastes. Prefer:

- **rates over totals** — "$1,444 of profit per second" beats "$45bn a year"
- **ratios over levels — for quantities that move.** "Roughly half its high" survives months;
  "$62,000" is wrong next week. But a **filed or published figure is quoted exactly, with its
  vintage** — "$3.2m, per the Q2 10-Q" — because its precision is what makes you checkable. Rounding
  a filed number to a ratio destroys the only handle a reader has on it.
- **comparisons the audience owns** — "smaller than Vermont's economy", "about two million dollars,
  from a company holding billions"

## Phase 6 — Find the steel-man

**Search first — Phase 1's counter-case row is where this comes from.** Write the strongest case
*against* your own verdict, with evidence, in the words its believers would use. Then say why it
should be included. Construct the case yourself **only** where the Phase 1 search returned nothing,
and mark it (`steel_man.provenance: "constructed"`) with the dated absence it rests on. Found beats
constructed every time; an unmarked construction is the failure mode this phase was written against.

Then re-test the verdict against it. If the steel-man wins, say so — that is the finding, not an
aborted run. If it survives without winning, downgrade `tension.strength` per Phase 2.

**This is a hard requirement**, discharged by a found case, a marked construction, or a dated
absence — never by silence. A notebook without one of the three produces a video that persuades and
may be wrong, and Engine D (Adjudication) cannot be run honestly from it at all.

## Phase 7 — Record what you don't know

Every `unknown` needs an `impact` — what the script may not say. Watch for:

- Sources disagreeing on a figure → *the script uses a ratio, not a number*
- Vendor statistics → *use the direction, not the number, or cut it*
- Correlation reported as causation → *the script says "moves with", not "because of"*
- Two datasets that appear to contradict → *present as competing readings, never pick silently*

## Phase 8 — Assess engine fit and currency

Against `knowledge/ENGINES.md`, judge fit **from the material**, and record poor fits with reasons so
the next session does not re-litigate. Then `currency`: what expires first, what is durable, and a
phrasing that extends shelf life.

## Phase 9 — Declare your gaps

`research_gaps` is what you did not do. Primary sources you used an aggregator for, domains you
skipped, arguments you left unchased. **A notebook claiming no gaps did not look hard enough.**

It is not a disposal route for a mandate. An unsearched counter-case belongs in Phase 1, an
unestablished absence in `facts[]`; writing either here records a hole in the world as a shrug by the
researcher, and the gate reads it as satisfied.

---

## Quality bar

A notebook is done when:

- [ ] `prior` was written before the first search, and the verdict is called a discovery or a mirror
- [ ] `tension` is written and `strength` is honestly assessed
- [ ] the effect was shown to be outside normal variation, or the tension is explicitly about the
      reaction, not the effect
- [ ] every `fact` has a source, a date and a confidence
- [ ] every **load-bearing** fact at `low` confidence is flagged for a second source
- [ ] every `mechanism.chain` link is BUT or THEREFORE
- [ ] at least one `reversal` exists, with a generous `obvious_reading`
- [ ] `steel_man` is present and genuinely strong — or the counter-case is a dated recorded absence
      — and if constructed, it says so
- [ ] every significant number has a `scale_conversion`
- [ ] every `unknown` has an `impact`
- [ ] `engine_fit` covers at least the engines that plausibly apply
- [ ] `research_gaps` is non-empty
- [ ] every quantity states its `unit` and `period`, and **any two quantities compared were
      recomputed** — magnitude, window, basis. Do the arithmetic; a comparison the checker cannot
      recompute is flagged, not shipped. ("77,800 is slightly more than 270,000 over the same 60-day
      window" passed twelve self-checks because none of them was arithmetic.)
- [ ] every falsifier is checkable in published material, and binds the claim's **load-bearing**
      clause — not its checkable half
- [ ] every load-bearing quantitative fact reaches a primary source, or carries a named gap
- [ ] if the topic has an accused or named party: they were approached, and the approach — or the
      refusal, or the non-reply — is recorded as a fact. **This is the one card the board may not
      descope.**
- [ ] render check: every factual assertion in a rendered script traces to a fact id, and every
      `unknowns[].impact` constraint was checked against the render mechanically, not hand-attested
- [ ] every `claim` (facts, conclusions, the steel-man) is a headline — one declarative clause,
      ≤ 90 characters — with the argument and qualifications in its paired long field
      (NOTEBOOK-SCHEMA § `claim`). A claim that needs three sentences is two claims and a note.

## Cost note

Run 1 used **6 web searches** and produced a notebook that rendered three scripts. The bottleneck was
not search volume, it was Phase 2 — tension-finding — which is judgment, not retrieval. Do not
optimise this prompt by adding searches; optimise it by making Phase 2 sharper.
