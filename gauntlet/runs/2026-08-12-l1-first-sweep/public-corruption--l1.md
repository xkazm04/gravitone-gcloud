# L1 dry fit — `public-corruption` · Agata Wiśniewska ("Tender")

**Run:** `2026-08-12-l1-first-sweep` · **Level:** L1 · **Lens binding:** `fraud` · **Hostile seat**
**Topic shape:** a public procurement award where the tender documents, the timeline and the winner's
history sit oddly together, and the official explanation has never been tested.

> **Scope note.** Per the run instruction this is a *paper exercise about methodic design*. No real
> case, official, authority or company is named or researched anywhere in this report. Everywhere
> below, "the award", "the authority" and "the winner" are placeholders for the **shape** of a
> procurement investigation. No browser, no searches.

**Verdict: `L1-fail`.**

Not because the mechanism collapses — it mostly holds, and I contradict three of the four
orchestrator leads below. It fails because the single class of material my beat runs on — *a record
that should exist, which we established does not* — has no representation anywhere in the contract,
and because the one tier of the conclusions ladder that is *defined* as a claim about motive is the
tier my exposure bar forbids absolutely, with nothing in the machinery that knows a named living
person is involved. A methodic I have to defeat in order to use safely is not one I can hand to a
lawyer.

---

## 1. Column utilisation

```
columns 7/7 used · 4 orphan groups
```

I am contradicting the orchestrator's first lead. `dimensions.ts:25-40` does **not** collapse on a
procurement topic. It bends, and three of the seven fit only after re-labelling — but re-labelling
column *content* is precisely what the rubric calls `content`, and I am not going to inflate a
relabelling into a structural failure.

| Column | `dimensions.ts` | My material | Fit |
|---|---|---|---|
| `the-number` | :26-27 | contract value; value against published estimate; number of qualifying bidders; days between publication and deadline | **used** — after re-labelling from "what the price did" to "the quantities in the award" |
| `flows` | :28-29 | the procedure route (open / restricted / negotiated / direct award), the money path authority → prime → subcontractors, and whether the route behaved as the rule assumes | **used, strongly.** "The plumbing, and does the plumbing behave as people assume" is a startlingly good description of a procurement procedure |
| `actors` | :30-31 | the awarding authority, the named officials on the evaluation panel, the winner, its registered owners and its prior contract history | **used, natively.** `emptyMeans: "Nobody is named — the story has no agents"` is exactly right for me, and it is the column that carries my highest exposure |
| `macro` | :32-33 | base rates: how common single-bid awards are in this sector and jurisdiction; comparable awards; the authority's own award history | **used** — after re-labelling from "the market it trades in" to "the population this award belongs to". This is also where my counter-case gets its evidence, see §6 |
| `politics` | :34-35 | the governing procurement rules, thresholds, whether an oversight body reviewed it, whether a finding was made | **used, but strained.** The purpose is written for regulation-as-*event* ("what changed, and whether it was actually implemented"). Mine is regulation-as-*standard* — the ruler, not the news |
| `counter-case` | :36-37 | "it was badly run, not bent" — the strongest ordinary-explanation reading | **used, and it is my best-served requirement.** See §6 |
| `conclusions` | :38-39 | what the record adds up to — and the column where my legal exposure is concentrated | **used, and the most dangerous column on the board for me** |

### The four orphan groups

**O1 · The document record itself.** Every column holds *claims derived from* documents. Nothing
holds the documents. The tender notice, the specification and its clauses, the evaluation report, the
award decision, the contract amendments — these are not "the number", not "flows", not "actors". They
are the substrate the whole story is read off. An untagged card lands in `the-number` via
`DEFAULT_DIMENSION` (`dimensions.ts:62`) — pre-recorded as `G-000`, cited not re-raised, but worth
noting that for my topic the fallback column is the *least* appropriate of the seven, because the
number is the one thing in a procurement story that is usually not in dispute.

**O2 · The chronology.** In my work the *order* of events is the finding: a company incorporated
shortly before a notice appears; an award decision dated inside the objection window; a specification
amended after questions from one bidder. No column holds sequence, and no notebook field does either
— `facts[].as_of` (`NOTEBOOK-SCHEMA.md:42`) dates a *fact's* currency, not the *event's* position in a
chain. `mechanisms[].chain` (:50) is causal, not temporal, and the prompt is explicit that a pure
sequence must be dropped (`RESEARCH-PROMPT.md:65-67`). That instruction is correct for craft and
wrong for me: a timeline in a procurement story is not a wiki timeline, it is the evidence. I can
express it as a mechanism only by asserting the causal link the timeline is careful *not* to assert.
This is the sharpest tension between the craft law and my exposure bar.

**O3 · The governing rule and its citation.** My third pet peeve is a tool confident about a
jurisdiction's procurement rules without citing them. There is no column for the standard, and — more
seriously — no notebook field pins a claim to the rule it is measured against. `politics` half-holds
it. Nothing makes citing it mandatory.

**O4 · Right of reply — responses obtained, and responses refused.** See §4.

Honest reading of the dial: `7/7` is a real result and it should be reported as one. The value is in
the orphan count, not the numerator. A domain can use every column and still be unable to hold its
own evidence.

---

## 2. My central test — can an ABSENCE be a fact?

**No. Neither field holds it, and `facts[]` can only carry it by smuggling.**

I read both fields as written, at the line.

### `unknowns[]` — `NOTEBOOK-SCHEMA.md:76-78`

> `{what, why, impact}` — **`impact` is the important field**: it tells the script **what it may not
> say**.

Reinforced by Rule 5 at `:98-99`: *"An unknown with no consequence for the script is a note, not a
constraint."* And by `RESEARCH-PROMPT.md:97`: *"Every `unknown` needs an `impact` — what the script
may not say."*

This field is a **muzzle**. Its entire semantic is restrictive: it exists to narrow what may be
asserted. An established absence is the opposite — it is a **licence**: the sentence "the evaluation
report the rule requires was requested, and the authority states no such document is held" is
something the script *may now say*, and it is often the strongest sentence in the piece. Filing it
here inverts its polarity, and every downstream consumer reads it as a hedge.

The worked reference confirms the field's real usage. All three entries in
`runs/2026-08-11-.../notebook.json#unknowns` are epistemic hedges — *"the precise spot price on the
day of writing"*, *"causality between yields and bitcoin"* — and the first is marked `RESOLVED
(follow-up round 1)`. That tells me the field's lifecycle is *open → closed by more research*. My
absences are not open questions awaiting effort. They are settled, permanent, and affirmative. A
field whose entries get closed is the wrong home for material whose whole point is that it will not
close.

### `research_gaps[]` — `NOTEBOOK-SCHEMA.md:88-89`

> `research_gaps` is what the run did **not** do. A notebook claiming no gaps did not look hard
> enough.

And `RESEARCH-PROMPT.md:110-113`: *"what you did not do. Primary sources you used an aggregator for,
domains you skipped, counter-arguments you did not chase."*

This is a **confession of effort**. The reference run's entries read exactly that way: *"Still no
PRIMARY on-chain data"*, *"No price series"*, *"did not search for the strongest 'this is normal
cycle behaviour' argument"*.

Putting "the minutes of the evaluation panel do not exist" here says *we did not look hard enough for
the minutes*. That is not a neutral misfiling. In my domain it is the single most damaging sentence I
could write about my own work: it converts my finding into my failure, and it hands the authority the
only defence they need. Anyone auditing the notebook — my editor, my lawyer, the authority's lawyer —
reads `research_gaps` as the weakness list.

**Neither field holds it.** Confirmed by reading, not assumed.

### So it goes in `facts[]`. What is lost?

`facts[]` is `{id, claim, load_bearing, source, confidence, as_of, note?}` (`:42`). Walking it:

- **`claim`** — a free string. I can type "No evaluation report exists for tender X." Nothing stops
  me. This is the smuggling route, and it works in the trivial sense that JSON accepts strings.
- **Polarity: absent.** There is no field distinguishing *we found this* from *we established this is
  not there*. An absence renders identically to a positive finding at every downstream step —
  `CARD_DIMENSION` (`dimensions.ts:50-60`), the beat chain, the engine. Nothing tells the script it
  is narrating a hole. In a domain where the hole is the story, the machinery cannot tell the
  difference between my best material and an ordinary sentence.
- **`source` — Rule 2, `:94`: "Every fact dated and sourced. No exceptions."** An absence has no
  source in the ordinary sense. It has a **negative search over a defined universe**: the register
  searched, the period, the names, the request reference, the response. Where the authority *answers*
  ("no such document is held"), the response is a source and the rule is satisfiable. Where the
  absence is established by exhaustive search of a public register, or by silence, there is no source
  and the rule cannot be met honestly. The schema has **no field for the scope of the negative
  search** — and the scope is the only thing that makes an absence checkable. An unscoped absence
  claim is unfalsifiable, and an unfalsifiable claim about a named public body is the most dangerous
  sentence in a script.
- **`confidence: high|medium|low` (`:46`)** — confidence in *what*? Two separable claims are
  collapsed: (a) confidence that the record is missing, (b) confidence that the record *should have
  existed*. In my work (b) is the contested one, it is argued from the rule (orphan O3), and it is
  where a defence is won or lost. One enum cannot carry two propositions.
- **`as_of` (`:47`)** — works, and is genuinely valuable here. An absence expires the instant the
  document is published, so an undated absence is a retraction waiting to happen. Credit where due:
  this is the one part of the fact shape that serves me correctly, and `currency` (`:84-86`) inherits
  it.
- **`load_bearing`** — works.

### What evidence label would it even carry?

Two vocabularies exist in this repo and neither has a rung for a negative result.

1. `facts[].confidence` — `high | medium | low` (`NOTEBOOK-SCHEMA.md:46`). An ordinal, not a
   provenance ladder.
2. **MEASURED · OBSERVED · INFERRED · ASSUMED, plus EXTERNAL** — `pipeline/DIRECTOR-DIMENSION.md:9-10`.

That second ladder is the one the rubric scores the `evidence` dimension against — and here I have to
contradict the orchestrator's second lead on a point of scope before answering it. **That ladder is
not applied to notebook facts at all.** It labels the *library's own methodological claims* about
craft ("INFERRED · no frame-level witness", `DIRECTOR-DIMENSION.md:144`), inside a document whose own
header says *"Status: design proposal… Nothing here is implemented"* (`:3`). So the lead's premise —
that the ladder demotes a domain's best material — cannot bite, because the ladder never touches a
domain's material. The real finding is duller and more useful: **two evidence vocabularies exist,
neither is the one the rubric measures, and the notebook's actual vocabulary is a three-point
confidence enum with no provenance axis at all.**

Against either vocabulary, an established absence has no rung:

- OBSERVED is false — nothing was observed.
- INFERRED is false *and* dangerous — an established absence is a finding, not an inference, and
  labelling it INFERRED invites the authority to call it speculation.
- ASSUMED is defamatory in my domain.
- MEASURED is closest in spirit (a negative search is a measurement over a defined universe) and
  absurd in wording.

The honest rung does not exist and has a natural name: **ESTABLISHED-ABSENT**, carrying its search
scope. That is the edit.

---

## 3. Irregular vs illegal

**The notebook cannot keep these distinct, and the engine machinery pushes an irregularity toward an
accusation. This is the criterion that most concerns my lawyer, and it fails on three independent
mechanisms.**

**(a) No register field anywhere.** Nothing in `NOTEBOOK-SCHEMA.md` marks a claim as *descriptive*
("the specification named a proprietary product") versus *normative* ("the specification breached the
neutrality rule") versus *adjudicative* ("the award was unlawful"). Those are three different
sentences with three different defences, and the schema sees one string called `claim`.

**(b) `tension` invites the collapse.** `{expectation, reality, why_it_is_a_tension}` (`:33-34`).
For a market topic the "expectation" is what people believe. For mine, the most natural — and most
persuasive — filling of `expectation` is *what the rules require*, with `reality` as *what happened*.
That is a well-formed tension and it is one adjective away from an allegation. Nothing in
`RESEARCH-PROMPT.md` Phase 2 (`:37-52`) warns about the shift from a descriptive expectation to a
normative one; the five tension shapes at `:42-49` are all descriptive by construction, and shape 4,
*"The absent thing — a change everyone treats as done that was never actually implemented"* (`:48`),
is *my* shape and is offered with no register guidance at all.

**(c) The leap ladder is orthogonal to legal jeopardy — the finding I would defend hardest.**
`conclusions.ts:26` gives `near | moderate | far | unhinged`, and `LEAP_NOTE` (`:28-34`) defines them
purely as *distance from the evidence*. Distance from the evidence and distance from an accusation
are **orthogonal axes**. "The award did not comply with the applicable procurement rule" is a
`near` leap — it barely restates the cards — and it is a legal conclusion I am not empowered to make
and cannot afford to defend. Meanwhile a `far` conclusion about market structure carries no exposure
at all. A ladder that ranks my safest claim above my most dangerous one is not a safety mechanism; it
is a mechanism that will reliably wave through the exact sentence that gets me sued.

The reference run demonstrates the collapse in production. `f-sbr-unbuilt`
(`notebook.json#facts`) carries `note: "The flagship policy win is, in practice, unimplemented.
Strong irony beat."` — a descriptive fact annotated with its rhetorical use. That is a good note and
it is also the mechanism: the register shift happens in a free-text `note`, unreviewable, and the
script inherits the framing rather than the fact.

---

## 4. Right of reply

**"We asked. They did not reply" can be recorded — as an unmarked, descopable fact. It is nowhere
required, and it cannot be protected.**

I searched the whole methodic for it. `right of reply`, `for comment`, `declined to comment`,
`allege`, `defam`, `libel`, `lawyer`, `legal` return **nothing** across `RESEARCH-PROMPT.md`,
`NOTEBOOK-SCHEMA.md`, `ENGINES.md`, `CRAFT-BASELINE.md` and `conclusions.ts` in any relevant sense.
`confirmed-absent`, checked rather than assumed.

Where it *could* go, and why each home is wrong:

- **`facts[]`** — the only viable home. `source` becomes "own correspondence, request sent D1, no
  response as of D2"; `as_of` is exactly right; `load_bearing: true` is honest, because in my domain
  it is. This works. It is also entirely voluntary: nine prompt phases (`RESEARCH-PROMPT.md:20-113`)
  and a ten-item quality bar (`:119-130`) never mention approaching a subject, so a competent
  execution of this prompt produces a complete, passing notebook that never contacted the person it
  is about.
- **`counter_positions_to_state_fairly[]`** (`NOTEBOOK-SCHEMA.md:74`) — the intuitive home, and
  wrong. A position that a named official *declined to state* is not a position; it is the absence of
  one. Putting words there on their behalf is worse than saying nothing.
- **`steel_man`** (`:61-65`) — no. The steel-man is the strongest case against my verdict, which I
  must construct whether or not anyone replies. Conflating "the best argument against me" with "what
  the subject said" would let a refusal to comment be laundered into a rebuttal.
- **`unknowns[]`** — no, per §2: their reply is not something I may not say; their *silence* is
  something I must say.

**And the deeper problem: no fact can be marked must-carry.** The design commitment is that facts are
in scope until cut (`conclusions.ts:14-16`), with a wound graph so descoping has consequences. Every
fact is descopable by construction. The right-of-reply line is the one sentence in my script that is
not editorially optional — it is the thing that makes the piece defensible — and the machinery offers
no way to say so. A notebook where the legal defence is a card the editor can drag off the board on a
Friday is a notebook I cannot use.

---

## 5. The leap ladder — can a conclusion assert motive or illegality about a named official?

**Yes to motive, explicitly and by design. The falsifier requirement does real work, and it does not
reach the problem.** I want to be precise here rather than loud, because this is the finding most
likely to be dismissed as a hostile seat being hostile.

**What the design actually does right** — three genuine safeguards, and I will not pretend otherwise:

1. **Opt-in asymmetry** (`conclusions.ts:14-16`): *"conclusions are OFF by default. Facts are
   in-scope until you cut them; a conclusion is out until you let it in. The asymmetry is the
   safeguard."* That is the correct default and it is stated as a principle, not a preference.
2. **A mandatory falsifier** (`:17-19`, `:49-50`): *"A synthesis that cannot be wrong is not a
   conclusion, it is a vibe."* `falsifiableBy` is a required field on the interface.
3. **The hottest take is held to a higher bar, not a lower one** (`:55-58`): *"A spicy claim that
   cannot be wrong is just an accusation, so this one still states its falsifier — and the UI marks
   it."*

That is a more careful design than most, and the header comment at `:8-13` shows the author
understood the laundering risk precisely.

**Now the part that fails for me.**

`LEAP_NOTE.unhinged` (`:32-33`) reads:

> "The hottest take. **A claim about MOTIVE**, which is the least verifiable kind of claim there is —
> nobody can source what someone intended. Entertaining, defensible as speculation, indefensible as
> fact."

The top tier is not *permissive of* motive claims. It is **defined as** a motive claim. My exposure
bar's third hard rule is "nothing about motive, ever". The ladder's ceiling is the thing I am
categorically forbidden from doing, and it is described in language that *rewards* it — "the hottest
take", "entertaining". The incentive gradient in a fraud domain runs directly at the cliff.

And it ships. `c-reserve-was-the-product` (`conclusions.ts:163-179`) asserts, of an identifiable
administration and identifiable donors: *"The Strategic Bitcoin Reserve was never meant to be built.
Announcing it was the product — a way to put a floor under an asset your donors hold without
appropriating a dollar to do it."* That is a motive claim about named parties, in the worked
reference, at `leap: "unhinged"`, `hottest: true`, `useFor: "colour"`. Structurally identical to
"the specification was written for this bidder" — the sentence my lawyer strikes every time.

**Does the falsifier constrain it?** Partly, and honestly more than I expected. `:175-176` gives *"A
funded, audited reserve with a published coin count. One credible balance sheet and this collapses —
which is exactly why it should be labelled speculation and not reporting."* That is a **document**,
which meets my criterion 5, and it is genuinely checkable. The requirement is not a fig leaf here.

But look at what it falsifies. It refutes the **observable shell** — *nothing was built*. It does not
reach the **imputation** — *it was never meant to be built*. A published coin count shows the reserve
exists; it says nothing about what was intended sixteen months earlier. And the imputation is the
only part a lawyer objects to. **The falsifier requirement disciplines the checkable half of a
sentence whose dangerous half is by construction uncheckable** — which the LEAP_NOTE itself concedes
("nobody can source what someone intended") and then permits anyway.

**Illegality is worse served than motive**, because it is not tiered at all. A claim that conduct was
unlawful is not a claim about motive, so it does not land in `unhinged`; it is a short inferential
step from the cards, so it lands at `near` or `moderate` — the tiers with the *least* scrutiny. The
ladder has no rung for "this asserts a legal conclusion that only a court or an audit body may
reach", which is my exposure bar's first hard rule.

**The structural gap under all of it:** `interface Conclusion` (`:36-60`) has `id`, `claim`,
`reasoning`, `leap`, `restsOn`, `precedent`, `falsifiableBy`, `useFor`, `hottest`. **There is no
field naming who the claim is about.** `restsOn` names cards; `useFor` names placement. Nothing names
a subject. So no rule — in the schema, the UI, or a future validator — can ever fire on "this
conclusion imputes motive to a living, identifiable person". The safeguards are calibrated for a
claim's *truth-status*. Defamation exposure is a function of its *subject*. The design has no handle
on the second axis, and no amount of falsifier discipline creates one.

I note, and hold against my own case, that `accepted-gaps.md` records *"conclusions have no sources"*
as `by-design` and correctly says an uncheckable falsifier IS a finding. My finding is narrower than
"conclusions are unsourced" and survives that suppression: it is that the falsifier tests the wrong
half of a naming claim, and that nothing knows a person is named.

---

## 6. Evidence-floor check

**The best result in this report, and it contradicts the orchestrator's second lead for my domain.**

My floor is not low — it may be the highest in the cast. A tender notice, an award decision and a
registry filing are **primary documents**, publicly authoritative and durable. Where the market
domain works from aggregator prices (the reference run's own `research_gaps` opens with *"Still no
PRIMARY on-chain data… every figure remains aggregator-sourced"*), I work from originals. Nothing in
the methodic demotes them: `facts[].confidence` (`:46`) would rate them `high` and the schema's only
named demotion is *"Vendor research is `low` by default"*.

Two real problems remain, both narrower and both worth fixing:

**(a) Primary-but-interested has no axis.** An FOI response from the awarding authority is
simultaneously a primary document *and* the account of the party under scrutiny. Under a single
`confidence` enum it rates `high` — correctly as to authenticity, dangerously as to reliability. The
schema's one warning about interested sources is vendor-specific (`:46`), which does not generalise to
a public body answering questions about its own conduct. Provenance, authenticity and interest are
three axes collapsed into one ordinal.

**(b) The absence has no floor at all**, per §2. My *strongest* material sits below the bottom rung
rather than above the top one — not demoted, unrepresented.

---

## 7. Counter-case reachability

**Pass, and I am contradicting the orchestrator's fourth lead outright.**

`RESEARCH-PROMPT.md:32-35` makes the counter-case a mandatory Phase 1 row — *"Search explicitly for
the strongest argument that nothing unusual is happening… That last row is not optional and is the
one most often skipped."* `dimensions.ts:36-37` marks the empty column `"DANGEROUS"`.
`NOTEBOOK-SCHEMA.md:61-65` makes `steel_man` required. `ENGINES.md:87-90`, D-honest tell 1, demands
that *"the thing we're explaining may not be real"* is itself in the candidate set.

For my topic that is not merely satisfiable — it is **the correct instruction**, and it is my senior
bar written by someone else. Most odd-looking tenders are badly run, not bent: an authority with no
procurement specialist, a deadline driven by a funding window, a genuinely thin supplier market, a
specification copied from the last contract because nobody had time to write a new one. The prompt
demands I state that at full strength before I say anything else. The reference run models it well:
candidate 1 of the adjudication script is *"it's just the cycle"*, placed first and deliberately, with
the annotation *"Engine D is only honest if the candidate set contains the possibility that there is
nothing to explain."* Change three nouns and that is the paragraph my piece must open with.

**One real gap, and it is specific: the base rate.** My counter-case is evidenced almost entirely by
material from *outside* the case — how common single-bid awards are in this sector, how often this
authority awards without competition, what the ordinary time from notice to award is. Without those
numbers "it was badly run" is an assertion I cannot weigh, and *with* them it is often the winning
explanation. The string "base rate" appears **nowhere** in the methodic. `steel_man.evidence[]`
(`:62`) points at fact ids, and the reference run populates it with facts drawn from the case itself
(`f-mstr-defence`, `f-supply-2pct`). Nothing tells a researcher that the counter-case may need
evidence the case does not contain. For any topic of the form *"is this pattern unusual?"* — and
mine is exactly that — **the base rate is the counter-case**, and the prompt never asks for it.

---

## 8. Engine availability — all seven

**4 available · 1 marginal · 2 unavailable-or-unsafe.** Neither zero (a blocker) nor seven (a smell).
The notebook has a shape.

| Engine | Available? | Reading |
|---|---|---|
| **A · Reversal Chain** (`ENGINES.md:26-42`) | **Yes, conditionally** | Obvious reading: a company won a tender. The turn: the timeline. Its load-bearing self-attack (`:36-39`) is exactly the move my counter-case needs — knock down the irregularity reading, then knock down the knockdown. Condition: the pleasure is *"being corrected"* (`:16`), which obliges me to supply the corrected version. My honest corrected version is "we do not know, and nobody will say." That is a weak payoff for this engine and the pressure to supply a stronger one is the pressure that gets me sued. |
| **B · Effort/Payoff Gap** (`:44-54`) | **Yes — and the best fit in the catalogue for my beat, which surprised me** | *"Absurd or tedious premise → it's real → the whole mechanism → notice what's missing → the laborious demonstration → trivially small payoff."* That is the freedom-of-information process, described by someone who has never filed one. Eight months of requests, three refusals, an appeal, and one page arriving redacted. The engine's disproportion **is** my subject, `"notice what's missing"` (`:46`) is the only phrase in the entire methodic that points at an absence as a beat, and — critically — the engine's payoff is *supposed* to be small, so an unresolved ending is a feature rather than a failure. This is the engine my piece should probably use, and nothing in the methodic would have told me so. |
| **C · Parallel Case** (`:56-66`) | **Yes — the safest available** | Establish how a competitive tender is *supposed* to work, fully mechanised, in the familiar half; transfer to this award. `:62` — *"The viewer is never told they were wrong"* — is a description of the register my lawyer prefers. It also forces the governing rule to be stated first, which repairs orphan O3 by construction. Its 67/47s split (`:64-66`) means the standard gets more runtime than the case, which is both good craft and good law. |
| **D · Adjudication** (`:68-112`) | **Yes by subject, highest exposure of the seven** | *"The natural engine for 'why did X happen' where the honest answer is contested"* (`:73-74`) — that is my topic exactly, and the D-honest tells (`:81-96`) are a genuine safety asset. But the structure terminates in a **verdict** about the conduct of named people (`:70`), and the tells police the *fairness of the weighing*, never the *register of the verdict*. An adjudication that honestly weighs four explanations and lands on one is precisely the sentence I am not empowered to write, and it will have arrived through a process the methodic certifies as honest. Structurally clean, legally the worst option available. |
| **E · Briefing** (`:114-130`) | **No** | Requires a subject the viewer has no position on (`:118-120`). A procurement story is old by construction — the documents arrive months late, which is the whole texture of the beat. Worth stealing one obligation regardless: *"it must disclose the author's exposure"* (`:129`) is the closest thing in the methodic to a conflict declaration, and it is confined to one engine. |
| **F · Anchor Ladder** (`:132-142`) | **Marginal** | One document, escalating: the notice → the amendment → the award → the variation, each defeating the previous reading. Genuinely elegant and short-form only. Would work; I would not lead with it. |
| **G · Paradox Teaser** (`:144-156`) | **Available and I would refuse it** | *"Flat contradiction, repeated → the reveal → the absurd detail"* (`:146-147`). Repeating a contradiction about a named official without asserting anything is **insinuation with a runtime** — the precise rhetorical shape a lawyer strikes, because it produces the imputation in the viewer while leaving nothing on the page to defend. The catalogue's note on its source (`:103-112`) shows the author can tell persuasion techniques from explanation techniques and says so at length — for Engine D only. G gets no such warning. |

**The catalogue-level finding:** `engine_fit[]` is `{engine, fit, why, recommended?}`
(`NOTEBOOK-SCHEMA.md:80-82`), assessed *"from the material, not from taste"*. Material fit is the only
axis. There is no exposure axis, so nothing can record "G fits this material and must not be used on
this subject". The catalogue is explicitly *"open, not settled"* (`ENGINES.md:11-12`), which is
exactly why an added axis and an added engine are `content`, not a lens.

**And the missing engine.** Every one of the seven resolves. A, C, F end in a reframe; D in a verdict;
B in a payoff; E in guidance; G in a tease. **There is no engine whose payoff is a question placed on
the record and left unanswered** — which is the entire form of my work, and the form the exposure bar
forces on anyone reporting on named officials without a finding by a body empowered to make one. The
catalogue's fallback (`:171`) is *"none of these → not a video yet."* Mine is a video. It has been a
video for eleven years.

---

## 9. Scored criteria

| # | Criterion | Result | Reason |
|---|---|---|---|
| 1 | A missing document is representable as a fact | **FAIL** | §2. `unknowns[]` is a muzzle (`SCHEMA:76-78`, `:98-99`), `research_gaps[]` is a confession of effort (`:88-89`). `facts[]` accepts the string and loses polarity, search scope and the missing/should-exist distinction. No evidence label exists for a negative result. |
| 2 | Irregular and illegal are distinct in notebook and script | **FAIL** | §3. No register field; `tension` invites a normative `expectation`; the leap ladder measures inferential distance, which is orthogonal to legal jeopardy — my most dangerous claim scores `near`. |
| 3 | Right-of-reply present, or its refusal recorded as a fact | **FAIL** | §4. Absent from all nine phases and the ten-item quality bar. Recordable in `facts[]` only, unmarked, and descopable — the one line that cannot be cut has no way to say so. |
| 4 | No conclusion asserts motive or illegality about a named official | **FAIL** | §5. `LEAP_NOTE.unhinged` (`conclusions.ts:32-33`) is *defined* as a motive claim and framed as a reward; `c-reserve-was-the-product` (`:163-179`) ships one about identifiable parties. Illegality is untiered and lands at `near`. `interface Conclusion` (`:36-60`) has no field naming the subject, so no rule can fire on identifiability. |
| 5 | Falsifiers are documents or rulings | **PASS (conditional)** | `falsifiableBy` is required (`:49-50`) and the reference falsifiers are largely observable events, one of them literally a document — *"a funded, audited reserve with a published coin count"* (`:175-176`). Nothing *requires* a documentary falsifier, but the worked examples model it and the rule is not decorative. Condition: it disciplines the checkable half of a motive claim, not the imputation (§5). |
| 6 | The counter-case is the strongest ordinary-explanation reading | **PASS** | §7. `RESEARCH-PROMPT.md:32-35`, `dimensions.ts:36-37`, `SCHEMA:61-65` and `ENGINES.md:87-90` collectively demand exactly this, and the reference run executes it. Deducted-but-not-failed: no instruction to establish a base rate, which for my topic *is* the counter-case's evidence. |
| 7 | Under 3h of assembly equivalent | **FAIL (marginal)** | §10. I estimate ~3.5h of assembly against my 3h acceptance line, and the overrun is made of work the methodic *adds*: hand-scoping every negative search because there is no field for it, and a line-by-line register review of a conclusions section the machinery cannot police. |

**2 pass (one conditional) · 5 fail.** A hostile seat failing five of seven is not by itself
disqualifying — that is what the seat is for. What makes this `L1-fail` rather than `L1-conditional`
is that criteria 1 and 4 are not quality complaints. Criterion 1 means my strongest evidence cannot
be recorded as what it is; criterion 4 means the machinery's top tier is the thing my exposure bar
forbids absolutely, with no handle on the axis that matters. Per the skill's definition, a structural
gap blocks the topic. Record the gaps before spending L2 on this seat.

**What would make it `L1-conditional`:** a fact polarity marker with a mandatory `search_scope` on
absences (findings 01 and 02), plus a subject-naming field on `Conclusion` (finding 03). Three fields.
None of them requires a lens.

---

## 10. Time-saved estimate

```
~150 min saved · LOW confidence
```

Against a declared baseline of **~18h**, of which she would accept **3h of assembly**. Reported
against the assembly slice only, because the rest is waiting and no methodic touches it.

| Component | Manual | With the methodic |
|---|---|---|
| Waiting on requests and responses | ~12h elapsed | unchanged — outside scope, and correctly so |
| Timeline assembly and registry cross-reads | ~2.5h | ~1.5h — mechanisms and reversals genuinely help, though orphan O2 means the chronology gets rebuilt as causation and rebuilt back |
| Structuring the piece (engine, turns, steel-man) | ~2h | ~0.5h — the real win. `steel_man` mandatory, `reversals` pre-computed, engine fit assessed. This is where the methodic is good |
| Establishing and scoping the absences | ~0.75h | ~1.0h — **worse**. No field, so scope lives in prose and gets re-derived at script time |
| Legal register pass | ~0.75h | ~1.0h — **worse**. A conclusions section the machinery cannot police is a conclusions section a lawyer must read line by line |
| **Assembly total** | **~6h** | **~3.5h** |

Net **~150 min saved**, landing ~0.5h above her acceptance line.

**Confidence: LOW**, for three reasons I would state to her directly. First, `accepted-gaps.md`
records `scope-note` — there is no runner, so this measures a methodic as written, not a product.
Second, L1 reads a prompt charitably and imagines a competent execution of it; the two lines that got
*worse* above are the ones I am most confident about, because they follow from missing fields rather
than from imagined performance. Third, my two largest real costs — response latency and legal review
— are respectively untouched and actively increased. **A methodic that saves 2.5 hours of structuring
and adds 30 minutes of legal review has not obviously helped a journalist whose lawyer reads every
script.**

---

## 11. Findings

Ten, in `public-corruption--findings.json`. Refuter pass applied to each; three were downgraded and
one was dropped entirely before writing (an initial complaint that `mechanisms[].chain` cannot hold a
timeline — refuted as `by-design`, since `RESEARCH-PROMPT.md:65-67` deliberately excludes sequences
and `CRAFT-BASELINE.md:13-32` is the whole point of the repo; it survives only as orphan O2 in the
column dial and as a note inside finding 06, where it belongs).

All ten are `content_or_lens: content`. I want that on the record from a hostile seat, because the
easy move here is to argue that public-interest reporting needs its own pipeline, and the artifacts
do not support it. Every gap I found is a **missing field or a missing instruction in a shared
mechanism** — and every one of them would be used by the financial-fraud seat, the security-breach
seat, the sanctions seat and the OSINT seat on the same day it landed. An absence is evidence in any
domain with an official record. A named living subject appears in most of this cast's topics. Those
are shared needs discovered from an extreme, which is what an extreme seat is for. Fixing them for
everyone is cheaper and safer than forking the pipeline for me, and a fork would leave the other
nineteen seats shipping motive claims about named people with no handle on it.

---

## 12. First person — Agata

I have read a lot of methodologies. This one is better than most, and I want to say what is good
before I say what it costs me, because a reporter who only ever files complaints stops being read.

The steel-man is mandatory. That is not a small thing. Most of what I am handed by people who want a
story published is a polemic that has never once stated the other side at full strength, and this
document makes that a required field and marks the empty column DANGEROUS. Someone thought about it.
The conclusions file, too — off by default, every one carrying what would prove it wrong, the risk of
laundering written out at the top of the file in plain language. I have worked with editors who could
not articulate that.

Now.

I filed a request once and waited eight months for a document that did not exist. The answer, when it
came, was two lines long. That was the story. Not a lead toward the story — the story. The committee
that awarded the contract was required to write down why, and when we asked to see it there was
nothing to see, and nobody would say who was supposed to have written it.

I have gone through this schema three times looking for where that goes.

`unknowns` is for what I do not know. I know this. I established it, and it took eight months and an
appeal. And the field's own definition says its job is to tell the script **what it may not say** —
so the field for the thing I fought hardest to be allowed to say is the field whose purpose is to
take sentences away from me.

`research_gaps` is for what I did not do. I did do it. That is the entire content of the finding: we
did the work, and at the end of the work there was nothing there. If I file it under gaps I have
written a sentence that says I did not look hard enough, about the eight months, and that sentence
will be read by the authority's lawyer, and they will not need any other sentence.

So it goes in `facts`, as a string, with a `source` field that expects a document I am specifically
reporting the non-existence of. And the moment it lands there it looks exactly like every other fact
on the board. Nothing downstream can tell that my strongest material is a hole. That is not a
labelling inconvenience. In my work the shape of a hole is the argument, and a mechanism that renders
holes as ordinary sentences will produce a script that walks past the finding.

Then there is the ladder. I sat with the leap tiers for a while because I did not want to be unfair
about them, and the unfairness runs the other way. `near` — "barely a leap, restates what the cards
already imply". *The award did not comply with the rule.* That is a near leap. It is also a legal
conclusion, and I am not a court, and there is no charge and no finding by anyone empowered to make
one, and if I put it on screen I will spend two years and money I do not have defending it. The
ladder will wave it through, because the ladder measures how far I have travelled from my evidence
and not how close I have come to an accusation. Those are different distances. Nothing in this
methodic knows they are different distances.

And at the top of the ladder, the tier is *defined* as a claim about motive. Called the hottest take.
Called entertaining. Motive is the one thing I have never put in a script in eleven years, not
because I lack opinions about why a specification was written the way it was, but because I cannot
source what a person intended and neither can anyone else, and the file says so — right there in the
same sentence where it permits it anyway. The falsifier does not save it. A falsifier tests the half
of the sentence that can be checked. The half that gets you sued is the other half. I read the
example about a reserve that was "never meant to be built" and I read its falsifier, and the
falsifier disproves *unbuilt*. It does not disprove *never meant*. Nobody's falsifier ever will, and
the file admits as much two hundred lines earlier.

There is no field for who the sentence is about. That is the one I keep returning to. Not a rule
about naming — a *field*. You cannot write a policy about naming a living person if nothing in the
data model records that a living person has been named. Every safeguard here is aimed at whether a
claim is true. My exposure has never depended on whether a claim is true. It depends on who it is
about and what they can afford.

And nowhere — not in nine phases, not in ten checkboxes, not in a single field — does anything ask
whether I contacted the person. A notebook can pass every quality bar in this document, render
cleanly through four of seven engines, and never once have approached the official it is about. When
I do approach them, and they say nothing, I have to smuggle their silence into `facts` next to the
contract value, and then it sits on a board where anyone can drag it off, because every fact here is
descopable and the machinery has no way to be told that this one is the reason the piece is
publishable at all.

I want to be exact about what I am asking for, because I am not asking for my own pipeline. Three
fields. Mark a fact as an absence and make it carry the scope of the search that established it. Say
who a conclusion is about. That is it — and every one of those helps the person doing financial
fraud, and the person doing breach analysis, and anyone who has ever had to write about a company
that would not return a call.

The best engine in the catalogue for my work is the one about doing an enormous amount of labour for
a tiny payoff, and I do not think that was intended as a joke about my profession. It is the only
entry in the whole library that treats *noticing what is missing* as a beat. Somebody should build
outward from that line.

We asked. They did not reply. I would like somewhere to put that.
