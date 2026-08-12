# VERDICT — 2026-08-12 · L1 first sweep

**Judge:** Fable, three benches, serial, having read all 20 L1 reports including every first-person
voice section, all 187 findings, the BRIEF and RETRACTION 1, the SUMMARY (treated as a participant's
argument), `lens-spec.md` (after everything else), and the methodic under test end to end.

**Status: PROPOSALS ONLY.** Nothing below edits the methodic. Adoption is `/gauntlet adopt`.

**Note on the SUMMARY.** I checked the orchestrator's synthesis against the primary artifacts and
mostly could not contradict it — its headline (the notebook, not the tailoring layer, is the binding
constraint) is what the reports say, and its arithmetic re-verification of `f-midtier-distribute`
holds against `notebook.json`. Where I do contradict it: the SUMMARY still frames the exposure
cluster as convergence #1 by seat count; ranked by the rubric (recurrence first), the primary-source
recurrence item outranks it, and the SUMMARY buried its own strongest procedural admission — that the
orchestrator's leads were wrong 3 of 4 — in a methodology appendix when it is a scoring input for
every hypothesis-derived claim in this run.

**Contamination.** Two seats (`sanctions-trade`, `creator-economy`) disclosed incidental grep exposure
to `lens-spec.md` lines. Both recorded it unprompted; both reached conclusions **contradicting** the
leaked lines. Their agreement with any orchestrator hypothesis is discounted; their contradictions
stand at full weight, because the contamination ran the other way.

---

## The one number that frames all three benches

**0 of 20 seats passed L1, and 20 of 20 failed their own time-saved acceptance bar — while 17 of 20
placed material in 6 or 7 of 7 columns and not one seat asked for its own pipeline.** The mechanism
holds the material. What it loses, in the words of five different seats from four areas, is *the
thing that made the material evidence*: the provenance class, the unit and period, the party, the
absence-ness, the conflict, the derivation. That is why 105 of 187 indictments land on
`notebook-schema` and only 1 of 187 claimed `lens`. The cast was invited to find a tailoring problem
and came back, near-unanimously and against several seats' own interest, with a **fact-shape
problem**.

---

# Bench 1 — Prompt (and schema, which drew 105 of 187)

Proposed edits, not advice. Each cites the findings that force it and names what it would have
changed in a specific run. The reference run here means
`pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/`.

### E1 · Counter-case: add the null path the prompt already knows how to write

**File:** `pipeline/RESEARCH-PROMPT.md` Phase 1 (after `:34`) and Phase 6.

```diff
 **That last row is not optional and is the one most often skipped.** Without it there is no
 steel-man, and without a steel-man the notebook can only produce a polemic.
+
+If the search finds no such argument — because the story is hours old, or because nobody has yet
+argued the null — **stop and say so.** Record a dated absence: what was searched, when, and what
+would count as the argument appearing. A notebook that reports "no counter-case exists yet, as of
+<date>" is a passing notebook; a steel-man written to fill the box is a failing one. Where no
+literature exists you may CONSTRUCT the steel-man per Phase 6 — and it must be marked constructed
+(`steel_man.provenance`), because a constructed opposition is bounded by your own prior and the
+reader must be able to see that.
```

Phase 6 gains the reciprocal clause: *"search first (Phase 1 row 6); construct only where the search
returned nothing, and mark it."*

- **Forced by:** `G-L1-NR-01`, `G-L1-NR-02` (news-reaction, blockers), `G-2026-08-12-05`
  (conflict-osint, constructed-vs-found), `G-2026-08-12-CE-03` (creator-economy: Phase 1 says search,
  Phase 6 says write, nothing arbitrates), `G-l1s-se-02` (software-eng: the mandate is self-certified
  and **failed open on the reference run**).
- **What it changes in a named run:** the reference run's own `research_gaps`
  (`notebook.json:432` — *"did not search for the strongest 'this is normal cycle behaviour'
  argument"*) would have been a first-class recorded absence, and `script--adjudication.md:132-133`
  could not have ticked its own D-honesty box twice over a steel-man that was assembled, not found.
  Marc Delacroix's 11:40 scenario stops being a fabrication funnel.
- **Guardrail:** Phase 6's constructive fallback already exists (`RESEARCH-PROMPT.md:87-93`) — this
  edit points at it, it does not duplicate it (creator-economy's guardrail list).

### E2 · Phase 1 gains a baseline row; the tension gains a magnitude

**File:** `pipeline/RESEARCH-PROMPT.md` Phase 1 table + Phase 2 + quality bar;
`NOTEBOOK-SCHEMA.md` `tension`.

```diff
 | **The number** | What is it now, what was the extreme, over what period? Get the dates. |
+| **The baseline** | The distribution of prior instances, with an n. Where does this one sit inside it? An extremum is a single observation; a baseline is a spread. |
```

Phase 2 gains one sentence: *"A tension survives only if the deviation is outside the baseline. If
the baseline says this is ordinary, either stop honestly — or the video is 'why everyone needed this
to be anomalous', which is a different tension with the baseline as its evidence."* `tension` gains
`normal_range?`, and the quality bar gains: `[ ] the effect was shown to be outside normal
variation, or the tension is explicitly about the reaction, not the effect`. Rule: **a surviving
counter-case downgrades `tension.strength`** — today no rule connects them.

- **Forced by:** electoral F1 (blocker) — with the decisive demonstration: `notebook.json:19` scores
  `tension: high` over a ~50% drawdown while the script rendered from the same notebook says the
  asset "falls fifty to eighty percent" every cycle, and the disproof sat in
  `counter_positions_to_state_fairly[0]` (`notebook.json:355`) connected to nothing. Also
  `G-L1-ME-03` (macro-economy: a share is a composite and nothing asks what it is made of),
  news-reaction's clock, macro-economy's decomposition orphan.
- **What it changes:** the reference run's highest-confidence field stops being assignable to the
  middle of the historical distribution.

### E3 · The domain table becomes a derivation rule the board can consume

**File:** `pipeline/RESEARCH-PROMPT.md:21-22`; `app/_phases/_shared/notebook/dimensions.ts`.

```diff
-Run 4–8 searches covering the subject's distinct causal domains. For a market/economics topic, that
-is at minimum:
+Run 4–8 searches covering the subject's distinct causal domains. **Derive the subject's own 5–7
+domains first and record them in the notebook (`domains[]`)** — the board's columns are built from
+this list. The table below is the worked instance for a market/economics topic, not the universal
+set; the counter-case row and the baseline row are mandatory in every derived table.
```

`dimensions.ts` stops being a closed union fed by one topic: `DIMENSIONS` becomes per-topic data
(the market seven remain the incumbent default), `DEFAULT_DIMENSION` is retired in favour of an
explicit `untagged` bucket (`untaggedIds()` already computes it, `cards.ts:91-98`), and `emptyMeans`
splits into `emptyByOmission` / `notApplicable` strings.

- **Forced by:** `G-L1-BILL-05` (bill-analysis: "the prompt scopes itself honestly and the board
  cannot accept the columns the prompt told me to derive"), `G-L1SW-SB-05` (security-breach: the
  import comment names the scoping while dropping it), `…consumer-scam-04`, `G-l1s-cc-12`,
  `G-2026-08-12-CE-02` (creator-economy: "the alarm is wired to the drain"), `G-l1s-se-07`
  (software-eng: no not-applicable state).
- **What it changes:** creator-economy's `the-number` column could finally render honestly empty —
  today it structurally cannot, because it is also the fallback; and G-000 stops compounding every
  other orphan finding in the run (four seats' orphans all land in the price column today).

### E4 · `facts[]` learns what a fact is made of

**File:** `pipeline/NOTEBOOK-SCHEMA.md` `facts[]`; `types.ts`.

The 105. One consolidated shape change, every element named independently by seats that never met:

```
facts[]: {id, claim, kind, load_bearing, sources[], evidence_class, confidence, as_of,
          event_date?, period?, unit?, subject?, contests[]?, qualifies?, search_scope?, note?}
```

- `kind: found | derived | absence | utterance | plan` — an absence carries `search_scope` (the
  register searched, the period, the request reference); a derivation carries inputs and method; an
  utterance separates "the ministry said it" from "it is true"; a plan separates announced capacity
  from installed. Forced by: `G-2026-08-12-pc-01` (public-corruption, blocker: "We asked. They did
  not reply. I would like somewhere to put that."), `…consumer-scam-03`, `G-L1-ME-02`,
  `G-L1S-HS-03`, `G-L1-NR-05`. `DIRECTOR-DIMENSION.md` already invented `negates: true` one layer
  too late — carry it up.
- `evidence_class: primary | secondary | aggregator | vendor | self-published | protected` +
  `sources[]` plural with locators — **this is the recurrence item**: `NOTES.md:79` wrote *"require
  primary sources for load-bearing quantitative claims"* after the reference run shipped
  all-aggregator, and it was never adopted. Forced by: `G-L1-ME-01` (recurrence flagged),
  `G-L1-BILL-02`, `G-L1SW-SB-01` (blocker), `G-l1s-cc-01` (blocker), `G-l1s-se-05` (plurality:
  run 1 comma-joined three sources into a singular field), `G-2026-08-12-06` (interest ≠
  unreliability), `G-L1-BOX-04` (`protected` for true-but-unciteable), `G-L1S-SE-07` (a creator's
  own dataset), electoral F4.
- `unit` + `period` (distinct from `as_of`-as-staleness) + `event_date` — forced by `G-L1S-HS-01`
  (blocker) with the arithmetic demonstration (77,800 BTC over a "same 60-day window" that the
  sibling fact says is 30 days, called *"slightly more than"* 270,000 — `load_bearing: true`,
  feeding `c-scarcity-not-a-floor` at `leap: near`, three scripts rendered), `G-L1-BILL-04`
  (`applies_from`), `G-L1-ME-08` (vintage vs revision), game-postmortem §2.1 (three `as_of`
  semantics in the exemplar alone), `G-l1s-cc-07`, `G-L1-NR-09` (time-of-day).
- `contests[]` / `qualifies` — the sideways edge. Forced by: `G-L1-ST-01` (sanctions-trade,
  blocker: "the disagreement between the series IS the video, and its only home is a muzzle"),
  `G-L1SW-SB-03` (the wound graph models support only, so descoping silently resolves a live
  conflict), `G-l1s-cc-02` (the measured/inferred pair loses its binding across a column boundary).
- **What it changes in named runs:** the false `f-midtier-distribute` comparison becomes machine-
  detectable (unit+period+an arithmetic check, E7); Bruno's cluster attribution stops riding at
  blockchain confidence; Tomás's two price series stop being an "unknown"; Agata's eight-month
  two-line answer becomes her strongest card instead of a confession.

### E5 · `mechanisms[]` joins the evidence graph

**File:** `NOTEBOOK-SCHEMA.md` `mechanisms[]`; `types.ts`; quality bar.

`chain[]` steps become `{text, connector: THEREFORE | BUT | TRANSFER, evidence[]?}`; `mechanisms[]`
gains a top-level `evidence[]`. The wound graph gains mechanism nodes. `TRANSFER` (a typed
non-causal step: a deduction, a hand-off, a recognition event) exists so that the one law is not
force-fed — see Bench 2, P6. The quality-bar link check (`RESEARCH-PROMPT.md:124`) extends from
form to support: *a chain step asserting a causal or transfer claim no fact supports is flagged.*

- **Forced by:** convergence #4 — `G-L1S-DTB-01` (devtools: "the *reasoned* layer is traceable and
  the *researched* layer is not — backwards"), `G-l1s-cc-06`, `G-L1S-SE-01` (streaming: "the
  load-bearing card class is the uncited one" — the exemplar's `m-institutionalisation` is annotated
  *'This is the video'* and carries no source), game-postmortem §2.2, `G-L1S-MI-01`; plus
  `G-L1S-MI-02` (the two bare ANDs at `notebook.json:207`, `:222`, in the exemplar, under a
  zero-AND-THEN bar).
- **What it changes:** Ruth's five-step royalty chain stops deleting the two parties whose shares
  are the subject; Toby's production timeline gets an evidence-linked spine; cutting the platform-
  change fact finally wounds the mechanism built on it.

### E6 · Conclusions gain a subject; the falsifier gains a type and a binding

**File:** `app/_phases/_shared/notebook/conclusions.ts`; `NOTEBOOK-SCHEMA.md`.

```ts
subject: { names: "none" | "org" | "living-person" | "state"; who?: string };
falsifiableBy: { test: string; kind: "document" | "record" | "measurement" | "event";
                 binds: "whole-claim" | string /* clause id */ };
```

Rules keyed to it: when `names !== "none"`, the falsifier `kind` must be document/record (the
standard `facts[]` already holds itself to, one file over), the falsifier must bind the claim's
**load-bearing clause** (a compound claim may not discharge the requirement by falsifying its
checkable half), and the leap is capped at `moderate` unless a filed action / published admission is
in `restsOn`. `unhinged` is **redefined by distance, not by kind** — *"the largest leap the cards
permit"* — because a tier *defined* as motive and a rule requiring falsifiability are mutually
exclusive by the file's own two sentences (`conclusions.ts:18-19` vs `:32-33`). A new `useFor:
"boundary"` (or a `withheld: true` class) makes *"the mechanics are established and the intent is
not, and that is the finding"* a first-class, gateable, wound-able object.

- **Forced by:** the widest cluster in the run — `G-2026-08-12-pc-04` (public-corruption: **the leap
  ladder measures distance from the evidence, not distance from an accusation, and those are
  orthogonal** — "the award did not comply with the rule" is a `near` leap and a legal conclusion),
  `G-L1SW-SB-02` (blocker; and: *far* "has ample room to attribute and carries no badge at all"),
  `G-l1s-cc-05` (blocker: the compound-claim falsifier evasion, demonstrated on
  `c-reserve-was-the-product` — the falsifier disproves *unbuilt*, never *never-meant*),
  `G-2026-08-12-03`/`-04` (public-co-fraud), `G-L1-NR-03` (blocker), `G-2026-08-12-04`
  (conflict-osint), `G-L1S-DTB-04`/`-05` (predictable vs planned both land at `far`), electoral F5
  (the shy-voter slot), `G-L1S-MI-09`, `G-GP-09`, `G-L1-ME-09`, `G-2026-08-12-CE-04`,
  `G-L1S-SE-05` (streaming), `G-l1s-se-08`. Twelve-plus seats, all four areas.
- **What it changes:** the shipped exemplar's own hottest take would carry
  `subject: {names: "state"}` and a falsifier flagged as binding the wrong clause — which four
  seats demonstrated independently without seeing each other.

### E7 · The quality bar learns arithmetic, traceability, and approach

**File:** `pipeline/RESEARCH-PROMPT.md` quality bar.

```diff
+- [ ] every quantity's unit and period stated; any two quantities compared were recomputed —
+      magnitude, window, and basis (a comparison the checker cannot recompute is flagged)
+- [ ] every falsifier is checkable in published material, and binds the claim's load-bearing clause
+- [ ] every load-bearing quantitative fact reaches a primary source, or carries a named gap
+      (recurrence: runs/2026-08-11/NOTES.md:79)
+- [ ] if the topic has an accused or named party: they were approached, and the approach (or the
+      refusal) is recorded as a fact — the one card the board may not descope
+- [ ] render check: every factual assertion in a rendered script traces to a fact id, and every
+      unknowns[].impact constraint was machine-checked against the render, not hand-attested
```

- **Forced by:** `G-L1S-HS-02` (none of twelve self-checks was arithmetic; the frontmatter scar
  5:00/947w over a 6:07/1161w body), `G-L1-ME-06` (no render-time traceability rule),
  `G-L1-BOX-01` (blocker: `unknowns` is the only field in the consumption table with no consumer —
  *"honesty checks throughout"* — and the only run violated one of its four constraints, caught by
  an agent from another step; `constraints.ts` is a hand-authored report card, "a noun with no
  verb"), `G-2026-08-12-pc-03` (right of reply absent from all nine phases and ten checkboxes),
  `G-2026-08-12-04` (pcf, falsifier kind).
- **What it changes:** the reference run's constraint violation ("So when Treasury yields climbed…
  Bitcoin was sold" against *impact: "moves with", not "because of"*) fails a gate instead of
  shipping; the false whale comparison fails a gate; Nadia's dropped "in risk-on conditions" fails
  a gate.

### E8 · Unknowns split into constraints and obligations; absences leave the field

**File:** `NOTEBOOK-SCHEMA.md` `unknowns[]`; Phase 7.

`unknowns[]` keeps its prohibition semantics (guardrail — box-office wants `impact` to *bind*, not
go) and gains: `about[]` (fact ids — llm-research: the constraint is global, the defect is
per-figure), and a sibling `obligations[]` — *what the script MUST say*: "state the range $X–$Y;
name the unknown term; attribute the width to it." Established absences move out entirely (they are
`facts[]` with `kind: absence` per E4): Phase 7's framing — *what the research could not settle* —
is the wrong polarity for *what the world has been shown not to contain*, and `research_gaps`
(*"counter-arguments you did not chase"*) records an absence in the world as an omission by the
researcher.

- **Forced by:** `G-L1-BOX-03` (a range with an unknown middle is a must-say; a deny-list produces
  an evasive video), `G-L1-ST-01`, `G-2026-08-12-pc-01` (voice escalation: the field for the thing
  she fought hardest to say is the field whose purpose is to take sentences away), `G-L1SW-SB-04`,
  `…consumer-scam-03`, `G-L1-NR-01` (the mis-shaped fallback).

### E9 · Engine catalogue gains a hazard axis; two selection bugs get one line each

**File:** `knowledge/ENGINES.md`; `NOTEBOOK-SCHEMA.md` `engine_fit[]`.

`engine_fit[]` gains `hazard?: string` — an engine that **fits well and misleads or endangers** is
today unrepresentable (`fit` is one scalar). Catalogue edits, one line each: (a) Engine C's hazard
note — *its availability rises as evidence thins; on a young topic it produces a confident,
unfalsifiable video from a rule and no facts* (news-reaction); (b) Engine E's selection test —
*subject-new, not audience-new* (software-eng); (c) Engine F — *a chronology is not a difficulty
ladder; monotonic escalation on a production timeline is a blame frame* (game-postmortem §6.1);
(d) Engine B's note — *when the operable mechanism is an attack chain, the demonstration is a
tutorial* (security-breach `G-L1SW-SB-08`); (e) the Choosing table gains a row for *"a quantity
moving through parties"* → B-spine (music-industry F-07); (f) D gains: *a verdict on conduct of
named parties is a finding of culpability — check `subject` before rendering* (crypto-collapse).

- **Forced by:** `G-L1-BILL-09` ("the catalogue never asks what a wrong render *costs*" — the
  widest-blast-radius engine finding in the run), `G-L1SW-SB-08`, `…consumer-scam-06` (structurally
  excellent, tonally disqualifying — one `fit` word cannot say it), `G-L1-BOX-07`, `G-L1-NR-07`
  (E: one witness, zero renders, three obligations with no schema fields — see also P3).

### E10 · Scale conversions get a `for` and an honesty constraint; ratio advice gets scoped

**File:** `NOTEBOOK-SCHEMA.md` `scale_conversions[]`; Phase 5.

`{raw, felt}` → `{for: factId, raw, felt, kind?: cash | non-cash | count | ratio}` with one rule:
*the felt version may not promote the claim's subject class (an address cohort does not become
"people") and may not drop a qualifier the fact carries.* Phase 5's "ratios over levels" is scoped:
*for quantities that move; a filed or published figure is quoted exactly, with its vintage — its
precision is what makes the researcher checkable.*

- **Forced by:** `G-l1s-cc-04` (the address→cohort→"people who believed in it" promotion walked the
  sanctioned pipeline in the exemplar and was spoken aloud), `…consumer-scam-01`/`-02`
  (`analogy_candidates` has `for`, the arithmetic field doesn't; three qualifier drops demonstrated
  notebook→script), `G-L1S-SE-02` (non-cash impairment rendered as cash), `G-L1S-MI-08` (the
  durable unqualified rate as a shelf-life optimisation), `G-L1S-HS-06` (falsifier lean toward
  forecasts is adjacent; noted).

### E11 · Two smaller prompt edits

- **Phase 0, a declared prior.** *"Write down what you already think. After Phase 6, state whether
  the verdict is a discovery or a mirror."* Fifteen words; forced by `G-L1-ME-05` and macro-economy's
  voice ("the difference between a research tool and an expensive confirmation service"), reinforced
  by llm-research §2.4 (the only place the author's prior is treated as a hazard is inside one
  engine's honesty check).
- **`counter_positions_to_state_fairly[]` gets a shape or gets deleted.** It is declared with no
  fields and is absent from the consumed-by table — by the schema's own admission test (`:8-9`) it
  does not belong. Give it `{position, holder, evidence[], statement_verbatim?, locator?}` and a
  consumer, or remove it. Forced by `G-2026-08-12-01` (public-co-fraud), `G-L1S-MI-06` (two
  independent holders, one singular `steel_man`), game-postmortem §5(a) (three containers, no
  routing rule; the exemplar's strongest counter sat in the weaker container and only the engine
  rescued it).

---

# Bench 2 — Philosophy

The bar, restated: **two Creators from different areas breaking the same commitment on different
topics, or one breaking it in a way content cannot repair.** Most candidates failed it; they are
listed after the ones that cleared.

## P1 · CLEARED — The methodic can find a story and cannot report a null

**Commitments indicted:** *research and writing are different steps* (as implemented: the verdict is
research-step output, written before the opposition is weighed) and the tension contract.

Four seats, three areas, no contact: **electoral** (geopolitics — no baseline gate; *"the
counter-case can speak and it cannot win"*: if it defeats the tension, the run terminates, so the
outcome space is {anomaly, abort} and "this was ordinary, and the story is why everyone needed it
not to be" is unreachable); **macro-economy** (geopolitics — *"a notebook with no decomposition
passes every box and arrives looking finished"*; a null-verdict topic inverts the counter-case
polarity, `G-L1-ME-04`); **llm-research** (tech — the mechanism: `NOTEBOOK-SCHEMA.md:29-31` mandates
the verdict during research while `ENGINES.md:91-93` demands candidates able to beat the author's
prior; two files, one repo, contradicting, neither citing the other — **D-rigged is the default
path out of a conforming notebook**; all five Phase-2 shapes are debunk shapes; `reversals[]`
cannot express a turn against the thesis); **public-co-fraud** (fraud — no register for
withholding: *"the shape it renders into has only two ends, and the true answer is in the middle,
where there is no beat"*); with **game-postmortem** (entertainment — single-thesis by construction:
one tension, one verdict, seven `emptyMeans` in the singular) as a fifth witness.

Content cannot repair it: the tension object, the verdict's timing, the all-forward `Leap` ladder
and the terminate-on-no-tension rule are the mechanism. **Ruling:** the commitment "answer early"
is a *script* law (`CRAFT-BASELINE.md:97`) that was allowed to schedule the *research*. Repairs are
E2, E6 (`boundary`/withholding), E7, and pinning verdict re-test after Phase 6 (E1/E11). The null,
the ordinary, and the unsettled must each be a representable, passing outcome.

## P2 · CLEARED (split verdict) — The mandatory falsifier: the discipline is real, and it is being asked to do a job it structurally cannot

**Commitment indicted:** *every conclusion carries a falsifier* — as a **safety** mechanism.

Upheld half: the discipline held 7/7 unprompted on the worked run, certified by the most hostile
seat (public-co-fraud), and no seat proposed weakening it. Guardrail.

Broken half, demonstrated four times independently on the shipped exemplar
(`c-reserve-was-the-product`): the claim is intent, the falsifier is a fact, and building the
reserve late falsifies the shell while the imputation walks — devtools (tech), crypto-collapse
(fraud), public-corruption (fraud), news-reaction (geopolitics), security-breach (tech),
conflict-osint (geopolitics). Plus electoral's structural version: `unhinged` is *defined* as the
one claim-class (`motive`) that the falsifier rule *defines* as inadmissible — the two sentences are
forty lines apart in one file and cannot both be satisfied; the worked instance escaped only by
falsifying the behaviour instead of the motive, "a good move nobody wrote down" (bill-analysis F8).
And the deepest form, public-corruption's: **checkability and exposure are orthogonal axes, and
every safeguard in the file is calibrated to the first while the harm is a function of the second —
`interface Conclusion` has no field naming who the claim is about, so no rule can ever fire on
identifiability.** A falsifiable defamation is still defamation (conflict-osint). Disprovable is
not printable (news-reaction).

Content cannot repair it: there is no axis to hang a naming rule on. **Ruling:** E6 — subject
field, falsifier kind + clause binding, tier redefinition by distance. The falsifier requirement
returns to the job it does well (epistemics) and stops being the only thing standing between the
tool and a lawsuit.

## P3 · CLEARED — "Notebook is the asset, script is a disposable render" is currently false for exactly the material that most needs to be durable

Four seats, three areas: **electoral** (the adjudication render weighs four candidates with four
verdicts and *not one exists as a field in the notebook* — for the engine `ENGINES.md` calls the
best fit for this studio's subjects, the script step does original structural work the notebook
cannot store, review, or hand to a second render); **public-co-fraud** `G-2026-08-12-11` (the only
exposure-disclosure obligation in the methodic lives in one engine and evaporates on re-render);
**llm-research** (Parallel Case — the only non-takedown engine — is unreachable because the
familiar half that carries 67 of 114 witnessed seconds has a one-line string for a home; one of
three D-honest tells is enforceable from the notebook); **news-reaction** `G-L1-NR-07` (Engine E's
three obligations — dated, exposure-disclosed, self-skeptical — have no schema fields, so the one
engine that fits news cannot carry its own honesty requirements through the asset).

**Ruling:** the commitment is right and unenforced; the repair direction is to move render-layer
obligations *into* the notebook — `candidates[]` for D, a familiar-domain structure for C, `dated` /
`author_exposure` fields for E, the subject/exposure fields of E6 — so that a re-render cannot shed
an honesty obligation. Any edit claiming to serve this commitment must survive the two-renders-one-
notebook test the exemplar already demonstrates.

## P4 · CLEARED — "Tone may never change the beat chain" protects too small an object

Three areas, three different demonstrations, all in shipped artifacts: **conflict-osint**
(geopolitics — a tone profile stripped 5 of 9 hedges, 56% of the script's epistemic marking, from an
already-approved chain with no dial set; the fix was drafted in `TONE-TEST.md:287-297` and never
adopted — *the commitment is satisfied while this happens, because hedges aren't beats*);
**consumer-scam** (fraud — three qualifiers demonstrably dropped between notebook and script: "in
risk-on conditions", "(~2% of supply)", the one-cohort note); **box-office** (entertainment —
`unknowns[].impact` is the only field with no consumer, the one run violated a constraint, and the
checker is a hand-authored scorecard).

**Ruling:** the protected object at the render boundary must be **the beat chain plus the epistemic
layer** — hedges, qualifiers, subject-class wording, and `impact` constraints — and the check must
be mechanical (E7's render gate), because TONE.md itself already rules hedging "not a dial"
(`TONE.md:49`) and then stops. Content cannot repair a boundary that has no gate.

## P5 · CLEARED — The wound graph covers a third of the graph

**Commitment indicted:** *descoping has consequences.* True today only for conclusions.
Five-seat convergence (#4) plus two structural witnesses: mechanisms carry no evidence, so cutting
their supporting facts wounds nothing (devtools, crypto-collapse, streaming-econ, game-postmortem,
music-industry — tech, fraud, entertainment); there is no fact→fact edge, so descoping one of a
contradicting pair *silently resolves a live source conflict* and the graph reports no wound
(security-breach: "a safety graph blind to the one relation that matters here is worse than no
graph, because it produces confidence"; crypto-collapse: the measured/inferred pair severed across
a column boundary). **Ruling:** E4 (`contests`/`qualifies`) + E5 (mechanism evidence). The
commitment survives; its coverage was the fiction.

## P6 · CLEARED (narrowed) — The one law is a script law being enforced as a notebook admission test

`music-industry`'s claim, examined as instructed. Ruth's evidence: two of her five honest links are
AND-THENs (deductions), the law's instruction is "find the missing link or drop it", there is no
missing link, and dropping deletes the two parties whose shares are the subject — and the reference
run itself contains **two bare ANDs inside `mechanisms[].chain`** (`notebook.json:207`, `:222`)
under a bar that permits zero, unnoticed, "because the moment a chain describes a transfer the
vocabulary runs out." Second-area corroboration: public-corruption's O2 (a chronology can be
expressed as a mechanism only by asserting the causal link the timeline is careful *not* to assert
— she filed it by-design and her voice kept it as "the sharpest tension between the craft law and
my exposure bar"; voice outranks the row) and game-postmortem §2.3 (THEREFORE-as-entailment vs
THEREFORE-as-caused-later is unmarked, "the difference between a post-mortem and a conspiracy
theory").

Held against it, at full weight: **news-reaction explicitly refuted** "the law forbids honest
breaking-news structure" (Engine E's spine is fully causal without knowing causation), and
**creator-economy demonstrated** three clean BUT/THEREFORE reversals from timestamps alone. The law
is right about *beats*.

**Ruling:** the law stands, unmodified, at the script layer — zero AND-THEN in a rendered beat
chain remains the bar. At the *notebook* layer it is over-scoped: honest research material includes
transfers, deductions and sequences that are not beat-shaped, and the current rule either deletes
them or extorts a fake THEREFORE ("the wiki-timeline defect wearing the law's own uniform" —
box-office, on being forced to write the split model as a causal chain). Repair is E5's typed
`TRANSFER` step: the law was derived from arguments and is being applied to ledgers, and the fix is
to let a ledger say so — then hold the *render* to the law when it turns those steps into beats.

## Failed the bar — and why

- **Opt-in asymmetry** (facts in until cut, conclusions out until admitted): **survived unchallenged
  by twenty hostile witnesses.** Multiple seats called it the best decision in the repo. It becomes
  Guardrail #1. One boundary note from public-corruption survives as an edit, not a philosophy
  finding: *one card class must be un-descopable* (the right-of-reply/approach fact) — an exception
  to universal descoping, not a reversal of the asymmetry.
- **Research-and-writing-are-different-steps, as a separation:** no seat wanted them merged; several
  (security-breach, sanctions-trade, streaming-econ) named chain-authored-during-research as the
  methodic's main genuine saving. The breach candidates all route to P1 (the verdict's *timing
  inside* research), not to the separation. Survives.
- **The wound graph as an idea:** indicted for coverage (P5), never for existence. Survives.
- **`emptyMeans` as an invention:** every complaint was that a specific sentence is wrong or
  unconditional, never that the field should not exist (nine seats attacked strings; zero attacked
  the mechanism). Content — E3's split. Survives, and is a guardrail: new columns must ship both
  strings.
- **"The seven columns are market-shaped" (the orchestrator's lead #1):** refuted 17/20 by
  placement. The real defects were one layer down (schema) or one layer up (the closed union and
  the fallback). This lead should not resurface as philosophy; it was a hypothesis and it lost.
- **"The evidence ladder demotes domain material" (lead #2):** retracted mid-run and confirmed dead
  by every seat — the ladder governs `PATTERNS.md`, not notebooks. The surviving finding is
  stronger and is E4's: *a notebook fact has no evidence label at all.* The rubric's `evidence`
  dimension must be rewritten to score the axis that exists (`confidence`) and the one that is
  missing (evidence class) — a `gauntlet/rubric.md` edit, filed under methodology, not philosophy.
- **The `unhinged` tier as a product feature:** does not clear as a philosophy break on its own —
  consumer-scam *defended* the tier (motive correctly routed to a gated, marked slot) while
  electoral demolished its definition. Both keep a gated top tier; the conflict resolves inside E6
  (redefine by distance; gate by subject). See Opposing Verdicts below.

---

## Opposing verdicts — findings, never averages

Each pair is a segmentation ruling about who or what the mechanism is for.

1. **"Vendor research is `low` by default."** software-eng and hardware-silicon praise it as their
   pet peeve codified; sanctions-trade shows it demotes the regulation's own reference price
   (`G-L1-ST-03`); llm-research shows the *inverse* rule holds for lab self-reports (the number
   reproduces, the direction is cherry-picked); public-co-fraud and consumer-scam show it conflates
   *interested* with *unreliable* — an income disclosure and a short-seller's arithmetic are both
   authoritative-and-interested, and one field cannot say it. **Ruling:** the rule is correct where
   "vendor" means a third-party research shop and wrong wherever the interested party is the
   primary source. Resolution is not a compromise value — it is E4's second axis
   (`evidence_class` + interest), which both sides independently requested. The default survives
   for the class it was written about.
2. **`unknowns[].impact`.** Best field in the schema (conflict-osint, llm-research,
   game-postmortem, public-co-fraud) *and* a muzzle that inverts the polarity of a domain's
   strongest material (public-corruption, sanctions-trade, consumer-scam, box-office). **Ruling:**
   both are right about different objects. The field is the correct instrument for epistemic
   constraints and the wrong container for established absences and required ranges — two material
   classes were sharing one prohibition-shaped field. Resolution: E8 split. The prohibition
   semantics are a guardrail; the absence class moves to `facts[]`.
3. **Engine-breadth smell ("seven is a smell").** sanctions-trade reports 6/7 as a symptom of an
   epistemic story fitting anything; hardware-silicon, electoral and software-eng argue the
   heuristic misreads process-, argument- and rich-topic shapes ("counting engines measures how many
   ways material can be told, not how sharp it is"). **Ruling:** the dial measures *tellability*,
   not shapelessness. Replace the smell line with what four seats actually needed: arbitration when
   many engines fit, plus the hazard axis (E9). The blocker end (zero engines) stands.
4. **Anchor Ladder.** bill-analysis: "excellent — the risk tiers are naturally ordered difficulty,
   handed over free." consumer-scam: "structurally right, tonally disqualifying — my rungs are
   cohorts of people and the witnessed ladder lands on a joke." **Ruling:** both correct;
   `engine_fit`'s single scalar is the defect (E9's hazard/register axis). Segmentation: F is safe
   where rungs are concepts, hazardous where rungs are people.
5. **`the-number`, full vs empty.** macro-economy: a *full* column is her failure mode (it
   certifies an artefactual baseline); creator-economy: an *empty* one is his signal, and the
   fallback guarantees it can never be empty. Convergent, not opposing, once seen from the
   mechanism: `emptyMeans` fires on column occupancy when the honest condition is *baseline
   adequacy*. E2 + E3.
6. **The `unhinged` tier.** consumer-scam: keep — it gates her exactly where she gates herself.
   electoral/devtools/public-corruption: the definition is the defect. **Ruling:** keep the gated
   top tier and its higher bar; redefine by distance; add the subject gate (E6). Nadia's protection
   survives intact; Sam's shy-voter slot and Rowan's predictable-vs-planned collapse are closed by
   the second axis, not by deleting the tier.

## Voice escalations I ranked above their rows

Per the rubric, the gap between a voice and its finding row is signal. Rankings above reflect:
devtools `DTB-03` (row: minor; voice: the `actors.emptyMeans` sentence is "the difference between
analysis and a trial") — treated as major input to E3/E6. public-corruption `pc-01` (voice: "We
asked. They did not reply. I would like somewhere to put that") — the approach/refusal fact and its
must-carry status are in E4/E7 at blocker weight. conflict-osint's hedge-stripping (voice: "the
finding I would lead with") — promoted into P4. macro-economy's Phase-0 prior (voice essay; row
major) — E11. music-industry's "a law derived from arguments applied to ledgers" (rows major) —
promoted to P6. box-office's "a well-designed noun with no verb" — promoted into P4/E7.

## Strengths as guardrails — constraints on every proposed edit

1. **Opt-in asymmetry is untouchable.** No edit may admit a conclusion by default; any new card
   class must declare which side of the asymmetry it lives on. (20/20 silence, several endorsements.)
2. **The falsifier stays mandatory.** E6 constrains its type and binding; nothing may make it
   optional or soften "a synthesis that cannot be wrong is a vibe."
3. **`emptyMeans` survives every column change** — both strings (omission / not-applicable) required
   on every column, incumbent or derived.
4. **Preserve the two best-drafted purpose clauses verbatim** through any relabeling: `politics`'
   "and whether it was actually implemented" and `flows`' "whether it behaves as assumed" — praised
   independently by 8+ seats across all four areas.
5. **`unknowns[].impact` keeps its prohibition force.** E8 adds the obligation half beside it; it
   does not dilute the deny-list. And it finally gets a consumer — box-office's condition.
6. **Tension `strength` stays keyed to "checkable", not "measured"** (creator-economy).
7. **Phase 6's constructive steel-man is not duplicated** — E1 routes to it.
8. **No community-sentiment column, ever** (devtools). The board must remain structurally unable to
   hold a Hacker News thread as evidence.
9. **The one law's script-layer bar stays at zero AND-THEN** (news-reaction's refutation; the
   `TRANSFER` step is notebook vocabulary, not a render licence).
10. **The Bitcoin control:** any adopted edit re-runs the reference topic; output must be identical
    *except* where a finding names the original false (the `f-midtier-distribute` comparison and the
    two bare ANDs are expected to change — they were bugs, and a control that preserves bugs is
    measuring the wrong thing).

---

# Bench 3 — UX

Cited to the 10 `ui`-targeted findings and voices. Precondition, restated from `accepted-gaps.md`:
**L3 is blocked — `ResearchStep` reads a hardcoded fixture and there is no loader from a produced
`notebook.json` to the board.** Every item below assumes that loader; it is finding #1 of every run
until it lands, and holding twenty topics is impossible while the board can hold exactly one.

**The board.**
- **An explicit `untagged` rail, never a silent fallback.** `DEFAULT_DIMENSION` retires; untagged
  cards render as untagged (`G-2026-08-12-CE-02` — "the alarm is wired to the drain"; G-000's
  landing site). This single change defuses the compounding term in four seats' orphan findings.
- **Per-topic column sets** (E3) with a **not-applicable state** distinct from empty
  (`G-l1s-se-07`, `G-L1-BOX-06`, `G-L1S-HS-07`, `G-L1S-SE-03`): a correctly-empty column shows its
  `notApplicable` string, not an accusation.
- **Multi-membership:** `primary` + `alsoRelevantTo` chips (`G-L1S-DTB-02` — a single-valued
  `Record` is why a structural mechanism about named entities must be filed as a morality play or
  vanish; `G-l1s-cc-11`; `G-L1-BILL-01`'s cross-tab is the extreme case and needs the matrix view
  below).
- **Conflict edges drawn, and descope-warned:** two cards linked `contests` render the link, and
  descoping one of a contradicting pair triggers a wound warning (`G-L1SW-SB-03` — today the graph
  "produces confidence" while silently resolving a live source conflict).
- **A sequence view beside the column view.** The board re-buckets by domain and destroys authored
  chronology (`G-L1S-HS-05`; game-postmortem's escalation clause: "the schema can hold a sequence;
  the review surface destroys it"; `G-L1SW-SB-06`; public-corruption O2). One toggle: sort by
  `event_date` with cards keeping their column colour.
- **Provenance chips on cards.** `evidence_class` visible at triage (`G-L1SW-SB-01` — today
  `CardTile` renders "invezz, crypto.news, intellectia" as a source-shaped blob).

**The boundary rail (new).** `unknowns[]`, absences, obligations, and the right-of-reply/approach
fact get a rendered home — today "no `DimensionId` renders `unknowns[]`" (`G-L1-NR-08`), so a
same-day piece's entire deliverable and a fraud piece's legal defence are invisible at review. The
right-of-reply card carries a **must-carry lock**: it cannot be dragged off the board
(public-corruption, voice-escalated).

**Conclusions section.**
- **Subject chips and a legal badge distinct from the epistemic badge.** 😈 warns "speculation";
  the moment of need is "a company with a legal department will read this sentence" — different
  warnings, and the system has only the first (`G-L1SW-SB-02`, `G-2026-08-12-pc-04`). A
  `names: living-person` chip, a falsifier-kind indicator, and the leap cap enforced in the gate UI.
- **A withholding class rendered as such** — "established to here, and no further" displays as a
  boundary card, not a failed conclusion (public-co-fraud `G-2026-08-12-10`).
- **The gate shows what is being approved:** subject, falsifier binding, and which facts it rests on
  — "opt-in is a user-attention safeguard, not a legal one: it asks a human to approve, it does not
  tell them what they are approving" (crypto-collapse §9).

**The queue, at twenty topics.** Per-topic dial strip: orphan count + max-column concentration
(replacing raw column utilisation — `crypto-collapse` reported 7/7 and then proved the number lies:
`flows` absorbed 77% of its labour undifferentiated, "and 7/7 cannot see it"), flagged-fact count,
unresolved-conflict count, and exposure summary (highest `names` class among gated-in conclusions).
Those five numbers are what a reviewer triages twenty notebooks by.

**The notebook modal.** Renders the new fact anatomy (kind / class / unit / period / subject),
mechanism evidence per chain step, and the constraint ledger as a **generated, machine-checked**
table — never a hand-typed scorecard (`G-L1-BOX-01`; `constraints.ts`'s own header admits it is
"the step's own invention").

---

# Impact-ranked backlog

Order per rubric: recurrence, then convergence, then voice escalation, then impact arithmetic.

| # | Item | Why it ranks here | Edits |
|---|---|---|---|
| 1 | **Fact provenance: `evidence_class` + plural sources + locators, with the primary-precedence quality-bar row** | **Recurrence** — `NOTES.md:79` wrote the rule after run 1 and it was never adopted; it has now cost trust twice (`G-L1-ME-01` flags recurrence). Also inside the largest convergence table (the 105). | E4, E7 |
| 2 | **Exposure/subject axis on conclusions: `subject`, falsifier kind + clause binding, tier redefinition, leap cap, withholding class** | Convergence: 12+ findings, all four areas; heaviest voice escalation in the run (Agata, Dana, Eleanor, Marc, Halvard). The safeguards are calibrated for truth-status; exposure is a function of subject. | E6, P2 |
| 3 | **Counter-case fail-open: null path, `steel_man.provenance`, right-of-reply structure, must-carry approach fact** | Convergence: 4 seats + demonstrated failure on the shipped exemplar (searched-never, adjudicated-anyway, self-ticked twice). "A hard requirement with no check is a comment." | E1, E11, E4 |
| 4 | **Null reportability: baseline row, tension downgrade rule, verdict re-test after Phase 6, counter-contrarian shape** | Convergence: 4 seats, 3 areas (P1). The instrument measures surprise and was never once asked to report that something was normal. | E2, E11, P1 |
| 5 | **Mechanism evidence: `evidence[]` + typed `TRANSFER` step + wound-graph coverage** | Convergence: 5 seats (#4) + the exemplar's uncited "This is the video" mechanism + its two bare ANDs. Provenance is missing exactly where the claim is strongest. | E5, P5, P6 |
| 6 | **Fact kind + unit/period/event-date + `contests` edges + arithmetic gate** | Convergence (the rest of the 105) + a verified-false load-bearing comparison in the shipped reference feeding a `near` conclusion into three scripts. | E4, E7 |
| 7 | **Render-boundary gate: traceability sweep + machine-checked constraint ledger + protected epistemic layer** | P4: three areas, three shipped demonstrations (hedge strip, qualifier drops, constraint violation caught by a wandering agent). | E7, P4 |
| 8 | **Unknowns split (constraint/obligation) and absences into `facts[]`** | Opposing-verdict resolution #2; blocker-rated at two seats; polarity inversion demonstrated on the exemplar's own `u-cohorts` lifecycle. | E8 |
| 9 | **Board: untagged rail, N/A state, multi-tag, conflict edges, sequence view, boundary rail, per-topic columns** | All 10 `ui` findings; precondition for L3 and for holding 20 topics. | Bench 3, E3 |
| 10 | **Engine hazard axis + five one-line catalogue warnings + choosing-table row** | Convergence: 5 seats, 4 areas; "the catalogue never asks what a wrong render costs" has the widest blast radius outside the schema. | E9 |
| 11 | **Scale-conversion `for` + subject-class/qualifier preservation; ratio advice scoped** | 4 seats; the address→people promotion and three qualifier drops are demonstrated, sanctioned-pipeline failures. | E10 |
| 12 | **Gauntlet's own instruments: rewrite `rubric.md`'s `evidence` dimension (scores a ladder that never touches notebooks); replace column-utilisation dial with orphan count + max-column concentration; drop or re-derive lens attribution per LENSES.md** | Retraction 1's consequence + methodology lessons 2 and 5; a dial that cannot see a 77%-concentration column is not a dial. | rubric.md |

---

# Panel verdict

Twenty voices, four areas, one sentiment, and it is not "this is broken" — it is the more expensive
verdict: **"This is the most disciplined research instrument I have seen, it is conscientious in
prose and permissive in type, and it saves me the half of my job that was already easy — because it
checks where every claim came from and never what kind of claim it is, it hands me back a
finished-looking notebook I must audit line by line before it goes anywhere near my name, and the
audit is the job."** Every seat offered a version of the same trade: fix the fact's anatomy — what
it is a claim *of*, who it is *about*, how it is *known* — and eighteen of twenty said, in their own
words, ask me again.
