# Notebook schema

The contract between research and script generation. Every field exists because a specific step of the
composition procedure consumes it.

## The principle

**A notebook stores script-ready structure, not research notes.** The test for any field: *does a step
of the composition procedure read this?* If nothing consumes it, it does not belong.

| Notebook field | Consumed by |
|---|---|
| `tension` | procedure step 1 — find the tension |
| `engine_fit` | step 2 — pick the engine |
| `engine_fit[].hazard` | step 2 — the cost of a wrong render, read at selection, not after |
| `candidate_questions` | step 3 — the question stack |
| `facts`, `mechanisms` | step 4 — beats as one-line claims |
| `facts[].sources[]`, `.evidence_class` | the quality bar's primary-precedence check; the provenance chip at card triage |
| `facts[].kind` | step 4 — an `utterance` renders as attribution and a `plan` as announced-not-built; `absence` renders on the boundary rail |
| `facts[].unit`, `.period`, `.event_date`, `.denominator` | the quality bar's arithmetic check — any two quantities compared are recomputed for magnitude, window and basis |
| `facts[].subject` | the conclusion gate's exposure check — who the claim is about |
| `facts[].contests`, `.qualifies` | the wound graph — descoping one of a contested pair raises a wound instead of silently resolving the conflict |
| `mechanisms[].chain` | step 5 — the but/therefore validation, pre-linked |
| `mechanisms[].steps[]`, `.evidence[]` | step 5 extended from form to support — a step asserting a causal or transfer claim no fact supports is flagged; and the wound graph's mechanism edges |
| `reversals` | step 6 — place the turns |
| `counter_positions_to_state_fairly` | step 6 — every position is either turned by a reversal or stated fairly and left standing; and step 1, because a surviving counter downgrades `tension.strength` |
| `analogy_candidates`, `scale_conversions` | step 7 — assign concretes |
| `scale_conversions[].for`, `.kind` | the render gate's subject-class and qualifier check, against the fact `for` points at |
| `verdict` | step 8 — the closing line |
| `currency` | step 7 — the phrasing that trades precision for shelf life (a level becomes a ratio) |
| `unknowns`, `unknowns[].impact`, `.about` | the render gate — `script/constraints.ts` scores every render against each `impact`, per fact where `about` scopes it |
| `obligations` | the render gate's must-say sweep — an unsatisfied obligation fails the render, exactly as a violated `impact` does |

**"Honesty checks throughout" is not a consumer.** That phrase was the entry for `unknowns` for two
runs, and in that time the one shipped run violated one of its own four constraints without anything
noticing — it was caught by an agent from a different step. A field whose consumer cannot be named in
this table is a field with no consumer.

## Fields

### Identity
- **`topic`** — as the user typed it.
- **`question`** — the topic rewritten as the question the video answers. If this cannot be written,
  the topic is not yet a video.
- **`verdict`** — the one-sentence answer. Written *during research*, not during scripting, because
  "answer early" means the script needs it at 0:40.
- **`template_intent`**, **`subject_domain`**.

### `tension` — the load-bearing field
`{expectation, reality, why_it_is_a_tension, strength}`

Where what people believe and what is true come apart. **A notebook without a tension is a failed
notebook**, and the correct response is to say so rather than to write a script anyway.

`strength` is a judgment: *high* when the premise is checkable, widely held, and demonstrably wrong.

### `facts[]`
`{id, claim, kind, load_bearing, sources[], confidence, confidence_note?, as_of, event_date?,
period?, unit?, denominator?, subject?, search_scope?, derived_from[]?, method?, contests[]?,
qualifies[]?, note?}`

Every field below `sources[]` is **required for new notebooks** and optional in `types.ts`, because the
run-1 fixture is the control for every adopted edit and a control rewritten to compile is not a control.

- **`claim`** — a HEADLINE, not a paragraph: one declarative clause, ≤ 90 characters, no trailing
  period. The argument, the numbers and every qualification live in the paired long field (`note`
  here, `reasoning` on conclusions, `statement` on the steel-man). The claim is what a card face and
  a sweep of the board show; run 1 shipped three-sentence claims and every reading surface has had
  to truncate them since (2026-08-30, the guided wizard's card verdict). A claim that cannot fit the
  budget is usually two claims.
- **`load_bearing`** — does the argument collapse without it? Load-bearing facts at low confidence are
  the single most dangerous thing in a notebook and must be flagged for a second source.
- **`confidence`** — `high | medium | low`, with the reason. Vendor research is `low` by default —
  where *vendor* means a third-party research shop selling the conclusion. It does **not** mean
  *interested*: a regulation's own reference price, an income disclosure and a short-seller's
  arithmetic are all interested and all authoritative. That is `evidence_class` + `interested`, not a
  confidence demotion.
- **`kind`** — `found | derived | absence | utterance | plan`. The notebook checked where every claim
  came from and never what kind of claim it was, so an announced reserve and a built one were the
  same shape. An `absence` carries `search_scope` (the register searched, the period, the request
  reference); a `derived` fact carries `derived_from[]` and `method`; an `utterance` separates *the
  ministry said it* from *it is true*; a `plan` separates announced capacity from installed.
- **`sources[]`** — `{name, evidence_class, locator?, interested?}`, **plural, always**. Run 1
  comma-joined three publications into the singular `source` string, and "invezz, crypto.news,
  intellectia" rendered as one source-shaped blob that nothing could count, class or locate. `source`
  survives as a deprecated single string so the control compiles; new notebooks do not write it.
- **`evidence_class`** — `primary | secondary | aggregator | vendor | self-published | protected`.
  `primary` is the record itself (filing, statute, chain, disclosure); `protected` is true, verified
  by the researcher, and not citable by the reader — which is a real category and was previously
  unwritable. `locator` is the page, line, article, tx hash or timestamp that makes it findable.
  **Recurrence note:** `runs/2026-08-11-why-bitcoin-price-does-not-rise/NOTES.md:79` wrote *"require
  primary sources for load-bearing quantitative claims"* after run 1 shipped an all-aggregator source
  list. It was never adopted, because there was no field for it to live in and no row in the table
  above to consume it — so run 2 shipped the same way. A rule with nowhere to live is a comment.
- **`as_of` / `event_date` / `period`** — three different dates that were one field. `as_of` is when
  the RESEARCHER last checked (staleness; it drives `currency`), `event_date` is when the thing
  described happened, `period` is the window a quantity covers. The scar: `f-midtier-distribute`
  called 77,800 BTC *"slightly more than"* 270,000 over *"the same 60-day window"* that its sibling
  fact dates at 30 days — `load_bearing: true`, feeding a `near` conclusion into three rendered
  scripts, and nothing in twelve self-checks did arithmetic.
- **`unit`** and **`denominator`** — BTC, %, wafer starts, $m; and what a percentage is a percentage
  *of*. The word "unit" appeared nowhere in the methodic before this edit.
- **`subject`** — who the claim is about, when that matters for exposure. Checkability and exposure
  are orthogonal axes and every safeguard here was calibrated to the first.
- **`contests[]` / `qualifies[]`** — fact ids. The sideways edge. The wound graph modelled support
  only, so descoping one of a contradicting pair **silently resolved a live source conflict** and
  reported nothing: a safety graph blind to the one relation that matters produces confidence.
  Where two series disagree, the disagreement is often the video; its home used to be an `unknown`,
  which is a muzzle.

### `mechanisms[]`
`{id, name, chain[], steps[], evidence[], explains, needs_analogy, note?}`

`chain` is written as alternating BUT/THEREFORE steps — **the beat chain is authored here**, so the
script step inherits a validated causal spine instead of constructing one.

- **`steps[]`** — `{text, connector: BUT | THEREFORE | TRANSFER, evidence[]}`, the typed form of the
  same sequence: the connector lifted out of the prose, and each link carrying the fact ids that
  support **it**. `chain[]` stays beside it as the rendered prose until the review surface reads the
  typed form; the two must not drift.
- **`TRANSFER`** — a typed non-causal step: a deduction, a hand-off, a recognition event. It exists
  because the one law was derived from ARGUMENTS and was being applied to LEDGERS — a five-step
  royalty chain loses the two parties whose shares are the subject, because the rule says *find the
  missing link or drop it* and there is no missing link in a deduction. Run 1 contains two bare
  `AND`s inside `mechanisms[].chain` (`notebook.json:207`, `:222`) under a bar permitting zero: the
  vocabulary ran out and the researcher wrote `AND` anyway. **`TRANSFER` is notebook vocabulary and
  not a render licence** — the script layer's bar stays at zero AND THEN, and a `TRANSFER` step that
  becomes a beat must earn a BUT or a THEREFORE there. The anti-shape it replaces is a fake
  THEREFORE extorted from a ledger to pass the link check: the wiki-timeline defect wearing the law's
  own uniform.
- **`evidence[]`** — mechanism-level support, and the field whose absence made the wound graph blind
  to the card class carrying the thesis. Run 1's `m-institutionalisation` is annotated *"This is the
  video. Everything else is evidence for it."* and cites nothing, so cutting every fact beneath it
  wounded nothing. The reasoned layer was traceable and the researched layer was not — backwards.

### `reversals[]`
`{id, obvious_reading, why_wrong, mechanism, evidence[], escalation, note?}`

Pre-computed turns. `obvious_reading` must be stated *generously* — it is what the script says before
the turn, and a strawman here produces a strawman on screen.

### `steel_man`
`{claim, evidence[], statement, why_include}`

The strongest case against the verdict. **Required, not optional.** Its absence is what separates an
explainer from a polemic, and both Engine A and Engine D depend on it.


**`provenance` — required for new notebooks.** `found | found-adjacent | constructed`.

- `found` — a real published counter-argument, located by the Phase 1 row-6 search.
- `found-adjacent` — right shape, wrong date, or an interested holder. It is opposition, and it is
  not the opposition you searched for. Say so rather than rounding it to `found`.
- `constructed` — built by you under Phase 6 because the search returned nothing. Carries
  `restsOnAbsence`: the fact id of the dated absence that licensed it.

Consumed by: the quality bar's steel-man row, and any reader deciding how much the opposition is
worth. **A constructed opposition is bounded by the author's own prior.** The run-1 reference
shipped one assembled from evidence already in hand, while its `research_gaps` admitted the search
was never run — and ticked its own D-honesty box twice. Nothing downstream could tell.

### `scale_conversions[]`
`{for, raw, felt, kind?}` — a number without a comparison is a number the script wastes.

`for` is the fact id the conversion restates. This was the only concrete-assignment field without
one — `analogy_candidates` has had `for` since run 1 — so nothing could check the felt version
against the claim it came from. `kind` is `cash | non-cash | count | ratio`, because a non-cash
impairment rendered as cash is a different claim.

**The rule:** the felt version may not **promote the claim's subject class** — an address cohort does
not become "people", and "people" does not become "people who believed in it" — and may not **drop a
qualifier the fact carries** ("in risk-on conditions", "~2% of supply"). Both failures walked the
sanctioned pipeline into a spoken script, which is what makes this a schema constraint rather than
advice: the promotion is checkable only if `for` exists.

### `analogy_candidates[]`
`{for, analogy, quality}` — `quality` is honest: a *medium* analogy that the script drops is better
than a bad one it uses. Short form gets one or zero.

### `candidate_questions[]`

### `counter_positions_to_state_fairly[]`
`{position, holder, evidence[], statement_verbatim?, locator?}`

Declared with no fields and consumed by nothing, this field failed the admission test at the top of
this document for two runs. It is kept rather than deleted because it is the only home for a **right
of reply** — when the topic has a named or accused party, their answer (or their refusal to give one)
is theirs to state, not the steel-man's to paraphrase — and because run 1's strongest counter sat
here as a bare string (`notebook.json:355`: the four-year-cycle reading, which disproves the same
notebook's `tension: high`) wired to nothing that could act on it.

- **`holder`** — who holds the position. Two independent holders collapsed into one singular
  `steel_man` is how a right of reply gets averaged away.
- **`evidence[]`** — fact ids. A counter that cannot downgrade a tension is decoration.
- **It is not the steel-man.** `steel_man` is singular and is the strongest case against the verdict;
  this array holds identified holders' positions, which may be several and each need attributing.
- **Opt-in asymmetry:** these are evidence-class objects — in by default, like facts. The
  approach/refusal card is the one card the board may **not** descope.

### `unknowns[]`
`{id, what, why, impact, about[]?, resolved_by?}` — **`impact` is the important field**: it tells the
script what it may not say. "Sources disagree on price" → *impact: say 'roughly half its high', never
a figure.*

- **`impact` keeps its prohibition force**, unchanged. What was wrong was the traffic it carried, not
  the field: two other material classes were sharing one deny-list-shaped container and had their
  polarity inverted by it.
- **`about[]`** — fact ids. The constraint was written global and the defect is per-figure: "never a
  figure" muzzles every number in the notebook when one disputed series was the problem.
- **Established absences leave this field entirely.** A record shown not to exist is a `facts[]` entry
  with `kind: "absence"` and a `search_scope`. Phase 7's framing — *what the research could not
  settle* — is the wrong polarity for *what the world has been shown not to contain*, and
  `research_gaps` (*counter-arguments you did not chase*) files an absence in the world as an
  omission by the researcher. "We asked. They did not reply." is a finding, and it now has a home
  that says so.

### `obligations[]`
`{id, must, why, about[]?, resolved_by?}` — the sibling of `unknowns[]`, and its opposite polarity:
**what the script MUST say.**

A deny-list alone produces an evasive video. *"State the range $X–$Y, name the unknown term,
attribute the width to it"* is a must-say whose only available home was the field whose entire
purpose is taking sentences away — so the strongest material a researcher had arrived phrased as a
restriction on herself. The render gate checks an obligation was discharged the way it checks an
`impact` was not violated. Anti-shape: an obligation written as a negation ("do not omit the range")
to smuggle a must-say through the deny-list.

### `engine_fit[]`
`{engine, fit, why, recommended?, hazard?}` — assessed against `knowledge/ENGINES.md` from the
*material*, not from taste. Recording poor fits matters: it stops the next session re-litigating.

`hazard` is what a **wrong render through this engine costs**. `fit` is one scalar and answers only
*does the material fit the shape*, so an engine that fits excellently and misleads is otherwise
unrepresentable: an anchor ladder whose rungs are concepts is a gift and the same ladder whose rungs
are cohorts of people lands on a joke; a mechanism engine on an attack chain renders a tutorial. Both
score `good`, honestly. Anti-shape: demoting `fit` to carry the warning — that hides the engine from
the person selecting it instead of arming them.

### `currency`
`{half_life, why, expires_first[], durable[], advice}` — `advice` should usually contain a phrasing
trick that extends shelf life.

### `sources[]`, `research_gaps[]`
`research_gaps` is what the run did **not** do. A notebook claiming no gaps did not look hard enough.

## Rules

1. **No prose.** Claims are one line. Prose is engine-specific; the notebook must survive every engine.
2. **Every fact dated and sourced.** No exceptions, including ones that seem like common knowledge.
   Dated means `as_of` **and** `event_date`; sourced means an entry in `sources[]` with an
   `evidence_class`, not a name in a sentence.
3. **Confidence is stated, never implied.** A low-confidence load-bearing fact gets flagged, not
   quietly used.
4. **Every load-bearing quantitative fact reaches a primary source, or carries a named gap.**
   Aggregators restate; they do not verify. (Recurrence: `runs/2026-08-11/NOTES.md:79`.)
5. **Every quantity carries its unit and its period.** Two quantities may only be compared when both
   do, and the comparison must be recomputable from the fields — magnitude, window, basis.
6. **A claim's kind is declared.** Said, planned, derived, absent and found are five different
   things, and only one of them is "true".
7. **The steel-man is mandatory.**
8. **Unknowns carry an `impact`.** An unknown with no consequence for the script is a note, not a
   constraint. And an unknown that implies a range carries a matching `obligation`, or the render
   will simply route around the number.
9. **A chain step that asserts a causal or transfer claim names the facts that support it.** Form
   validation without support validation is how the uncited mechanism became the thesis.
10. **The notebook does not choose the engine.** It reports fit; the human or the render step decides.
11. **A field with no consumer in the table above does not ship.** Add the row and name the step, or
    do not add the field.

## Anti-patterns

- **The research dump** — everything found, nothing decided. If the notebook has no `tension` and no
  `reversals`, no engine can rescue it.
- **The pre-written script** — prose in the fields. Locks the notebook to one engine and destroys
  its reuse value.
- **Laundered confidence** — a vendor statistic promoted to fact by being restated without its source.
- **The comma-joined source** — three publications in one singular string. It reads as provenance and
  cannot be counted, classed or located.
- **The muzzled finding** — an established absence, a required range, or a live disagreement between
  sources filed as an `unknown`, where a field designed to remove sentences inverts the polarity of
  the strongest material in the notebook.
- **The extorted THEREFORE** — a transfer or a deduction written as causation so the chain passes the
  link check. `TRANSFER` exists so a ledger can say what it is.
- **The uncited spine** — a mechanism annotated as the thesis and supported by nothing, so cutting
  every fact beneath it wounds nothing and the graph reports a healthy notebook.
- **The missing steel-man** — produces a persuasive video that is wrong, which is the exact failure the
  knowledge library's Engine D section is built to prevent.
