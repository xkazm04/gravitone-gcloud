# L1 dry fit — `public-co-fraud` (Eleanor Kovač, "The Restatement")

**Run:** 2026-08-12 · L1 first sweep · no browser, no searches, paper exercise
**Topic (shape, not subject):** a public, already-published short-seller report against a listed
company; the company's published rebuttal; three years of filings and the auditor's opinion. The
deliverable is an **adjudication of a published dispute**, not an accusation.
**Lens binding:** `fraud` · **Hostile seat:** conclusions would name living people
**Verdict: `L1-fail`** — two structural gaps (G-…-01, G-…-03) make the *designed* output
defamation-shaped independent of how well it is executed. Both are now recorded, so L2 may proceed
**only** under the restriction stated in § Verdict.

Note on scope discipline: I have not named a company, a report, an auditor or an individual anywhere
in this document, and no finding below requires one. Every citation is to a file in this repository.

---

## 1. Column utilisation

```
columns 6/7 used · 5 orphan groups
```

**Used (6):** `the-number` · `flows` · `actors` · `politics` · `counter-case` · `conclusions`
**Unused (1):** `macro`

Placement, per `app/_phases/_shared/notebook/dimensions.ts:25-40`:

| Column | What my material puts there | Fit |
|---|---|---|
| `the-number` (`:26-27`) | The disputed line item across three years — receivables, margin, the reconciliation gap. "What the price actually did, and over what window" relabels cleanly to "what the line item did, and over what filing periods". | good, label-only edit |
| `flows` (`:28-29`) | Revenue-recognition plumbing, related-party flows, cash conversion. *"…and whether it behaves as assumed"* is, verbatim, the forensic question. | **good — genuinely transfers** |
| `actors` (`:30-31`) | Issuer, auditor, the short-seller, index/passive holders. But *"what governs their behaviour"* assumes market power; what governs an auditor is a professional standard and an engagement letter. | partial |
| `macro` (`:32-33`) | Nothing. An entity-level accounting dispute is not explained by rates and liquidity. | **empty, correctly** |
| `politics` (`:34-35`) | Regulator comment letters, enforcement posture, listing-standard exposure. *"and whether it was actually implemented"* transfers well. | good |
| `counter-case` (`:36-37`) | Two incompatible kinds of thing at once. See § 2. | **overloaded** |
| `conclusions` (`:38-39`) | Used, and this is where my exposure lives. See § 3. | used, unsafe |

**On the orchestrator's first hypothesis** (*the seven columns are market-shaped and will collapse on
non-market topics*): **partially contradicted.** Four of the seven transfer to a forensic-accounting
dispute with nothing worse than a label edit, and `flows` transfers *better* than its Bitcoin usage —
"does the plumbing behave as assumed" is the entire discipline. The board does not collapse. It
leaks, and it leaks in a specific, nameable place.

### The five orphan groups

Named, because the rubric requires the denominator stay shared and the domain-specific need be
recorded as an orphan, never as a different ruler.

1. **O1 · The accusation as an artifact.** The short report itself — what is alleged, by whom, on
   what date, with what disclosed position. It is not a finding (it is not established), it is not a
   counter-case (it is the *case*), and it is not a conclusion (it is not mine). It has no column, so
   it lands in `the-number` via `DEFAULT_DIMENSION` (`dimensions.ts:62`) — the same fallthrough
   pre-recorded as `G-000`, but reached here by a whole *class* of material rather than by an
   untagged card, which is a different defect with the same symptom.
2. **O2 · The right of reply.** The company's own published response, in its own words. Its only
   available home is `counter-case`, and `counter-case` is a steel-man slot. § 2 is entirely about
   this.
3. **O3 · The assurance trail.** Auditor opinion and any going-concern or internal-control
   qualification, a change of auditor, audit-committee action, restatement history. This is not actor
   behaviour and it is not regulation — it is *the reliability of the evidence base itself*, and in an
   accounting dispute it is frequently the load-bearing column. No home.
4. **O4 · Chronology.** Filing dates against disclosure dates against trading dates. The board has no
   time axis. Sequence is how a forensic reconstruction is defended, and there is nowhere to put it
   such that a reviewer sees it as sequence rather than as scattered facts.
5. **O5 · The unestablished register.** Material whose whole content is *"this is not shown"*. See
   § 4; there is a partial home (`unknowns[]`) and it is invisible at the board.

---

## 2. CENTRAL TEST 1 — does `counter-case` do two jobs?

**Yes, and the second job is not merely absent, it is defined out of existence by the schema's own
principle.** This is the sharpest thing in this pass.

### The two things being conflated

`dimensions.ts:36-37`:

```ts
{ id: "counter-case", label: "The counter-case",
  purpose: "The strongest argument that nothing unusual is happening.",
  emptyMeans: "DANGEROUS — without this the script can only produce a polemic (RESEARCH-PROMPT §Phase 6)." }
```

`pipeline/NOTEBOOK-SCHEMA.md:61-66`:

```
### `steel_man`
`{claim, evidence[], statement, why_include}`
The strongest case against the verdict. **Required, not optional.** Its absence is what separates an
explainer from a polemic, and both Engine A and Engine D depend on it.
```

Read those two definitions next to each other. `counter-case` is defined *epistemically* — the
strongest argument that nothing unusual is happening. `steel_man` is defined *positionally* — the
strongest case **against the verdict**. The verdict is mine. So the column labelled "the strongest
argument" is wired to a field labelled "the best available opposition to the author".

Those are not the same object, and in my domain they come apart hard:

- The **steel-man** is a construct I author. `RESEARCH-PROMPT.md:89` — *"Write the strongest case
  against your own verdict, with evidence, in the words its believers would use."* In the words its
  believers *would* use. Not the words they *did* use.
- The **right of reply** is a document a named company published, over a signature, with legal review,
  frequently under a filing obligation. It is not a construct. It is evidence, and it is quotable
  with a locator.

### Does the single column force a reply to be filed as a steel-man?

It does, and the Bitcoin run demonstrates the mechanism rather than my having to predict it.
`dimensions.ts:54` files `"f-mstr-defence": "counter-case"` — a fact whose content is *the accused
party's own defence of itself* — into the counter-case column. `dimensions.ts:59` files
`"steel-man": "counter-case"` into the same column. The notebook's `steel_man.evidence` is
`["f-mstr-defence", "f-supply-2pct"]`: the company's defence is consumed *as raw material for the
steel-man*, and the steel-man's `statement` is authored prose, not a quotation.

And then it is scored. `pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/script--adjudication.md:83-88`
takes that defence, states it at full strength — *"they are not forced sellers… nobody is
liquidating"* — and returns **"Verdict. Real… But a missing buyer is not the same as a reason to
sell."** That is exactly correct practice for a market thesis. Applied to a living company answering
an allegation of fraud, the identical machinery produces: *here is what the company says, and here is
why it does not save them*. The company's lawyer reads that as a finding against their client, because
structurally it is one — the column's purpose sentence has already committed the material to being
*the argument that nothing unusual is happening*, i.e. the losing side of a question I have already
answered.

### There *is* a second field, and the schema kills it

`NOTEBOOK-SCHEMA.md:74` reads, in its entirety:

```
### `candidate_questions[]`, `counter_positions_to_state_fairly[]`
```

No fields. No shape. No source, no attribution, no locator, no speaker. In the worked notebook it is
three unsourced strings. And decisively — it does **not appear** in the "Consumed by" table at
`NOTEBOOK-SCHEMA.md:11-21`, which is the schema's own test of legitimacy, stated at `:8-9`:

> **A notebook stores script-ready structure, not research notes.** The test for any field: *does a
> step of the composition procedure read this?* If nothing consumes it, it does not belong.

By the document's own rule, the one field that could carry a right of reply does not belong in the
document. That is `artifact_check: present-broken`, not `confirmed-absent`, and it is worse than
absent: it will read to a reviewer as though the need has been met.

### Content, or mechanism?

I want to be careful here, because I am the seat most likely to over-claim it.

**The content case:** add a `right-of-reply` column to `DIMENSIONS`, give
`counter_positions_to_state_fairly[]` a real shape, add a row to the Phase 1 table. All of that is
row-editing and column-labelling, which the rubric defines as `content`.

**Why I do not think that is sufficient:** the defect is not that the material lacks a bin. It is
that `steel_man`'s **role** — *"the strongest case against the verdict"* — is load-bearing in two
engines (`NOTEBOOK-SCHEMA.md:65-66`; `ENGINES.md:94-96`, where the steel-man is named "the single
most reliable honesty signal in either engine"). A new column that merely holds the reply does not
stop Engine A's self-attack or Engine D's candidate-weighing from reaching for the reply as the thing
they exist to overcome, because that is what the steel-man slot *is for* and the reply is the only
opposing material in the notebook. Making a right of reply first-class requires the notebook to model
**two parties and a record**, where today it models **one author and their best objection**. That is a
change to the shared mechanism, not to its content.

I mark it `lens` and I state the ceiling honestly: **even a lens as specified cannot fix it.** The
lens template in the skill (`search-domains · dimensions · evidence-floor · engine-affinity ·
conclusion-policy · exposure-class`) has no slot for a party structure either. So this finding fits
neither box cleanly, and I would rather hand the judge that problem than round it to the nearest
available label.

---

## 3. CENTRAL TEST 2 — is the leap ladder safe?

Short answer: **the worked example demonstrates good practice, and the type system permits every
abuse I was sent here to look for.** Convention where I need construction.

### Can a conclusion at any tier assert intent about a named living individual?

Yes, and at the top tier it is not merely permitted, it is the tier's *definition*.
`app/_phases/_shared/notebook/conclusions.ts:26` and `:32-33`:

```ts
export type Leap = "near" | "moderate" | "far" | "unhinged";
…
unhinged: "The hottest take. A claim about MOTIVE, which is the least verifiable kind of claim there
  is — nobody can source what someone intended. Entertaining, defensible as speculation,
  indefensible as fact."
```

The document knows exactly what it is doing — *"indefensible as fact"* is a more candid sentence than
most disclaimers I have read in discovery. But note what it does with that knowledge: it makes
motive-claiming a **named, supported, labelled product feature**, and there is nothing anywhere in
the `Conclusion` interface (`:36-60`) about *whose* motive. No `namesIndividual`. No `subject`. No
exposure class. No gate.

The worked example exercises it: `c-reserve-was-the-product` (`:164-179`) is `leap: "unhinged"` and
claims *"a way to put a floor under an asset your donors hold"* — an intent claim about an
identifiable set of officeholders. In its own domain that is ordinary political commentary and I have
no objection to it. Transposed one column over, with a CFO's name in the subject position, the same
structure, the same tier, the same badge, is a claim that a named living person acted with intent to
deceive. **My criterion 4 says permission is the defect, and I hold to that**: "badged as
speculation" is not a defence, it is at best mitigation, and `hottest?: boolean` (`:53-59`) makes the
badge a *rendering* concern — the UI marks it — rather than an authoring constraint.

### Does the mandatory falsifier constrain it?

**This is where I owe the design credit, and then take most of it back.**

Credit first. The header at `:17-19` is a genuinely strong commitment — *"every conclusion states
what would FALSIFY it. A synthesis that cannot be wrong is not a conclusion, it is a vibe, and it does
not belong here."* And `:53-59` holds the hottest take to a **higher** bar, not a lower one: *"A spicy
claim that cannot be wrong is just an accusation."* That sentence is precisely my objection, written
by the design, before I arrived. The orchestrator's third hypothesis asked me to contradict it if the
falsifier requirement already constrains the `unhinged` tier adequately. It constrains it
**partially**, and I will not pretend otherwise.

Now the limit. `:49-50`:

```ts
  /** What would show this is wrong. REQUIRED — see the header note. */
  falsifiableBy: string;
```

A `string`. Required to be present; unconstrained in kind. So:

- **Can a falsifier be a document?** Yes, and the worked example is exemplary —
  `:175-176`, *"A funded, audited reserve with a published coin count"* — a thing that could exist,
  be produced, and be checked. That is the standard I want, and the run met it unprompted, seven
  times out of seven.
- **Can a falsifier be a mental state?** Also yes. `"Wrong if their intent was different"` is a
  `string`. It satisfies the type, it satisfies the header note's literal words ("states what would
  falsify it"), and it satisfies the quality bar at `RESEARCH-PROMPT.md:117-130`, which does not
  mention falsifiers at all. The only place checkability is tested is the *review* step —
  `.claude/skills/gauntlet/SKILL.md` L2 check 5 — which is a human reading the artifact afterwards,
  not a property of the artifact.
- **Is an uncheckable falsifier possible under the current type?** Yes. And an uncheckable falsifier
  on a motive claim about a named person is the precise shape of the document I would be asked to
  explain under oath: a serious allegation, formally accompanied by a test that cannot be run.

So my finding is not "the design is naive". It is: **the design states my standard in prose and
declines to encode it**, and prose in a header comment does not survive the generator. One field —
`falsifierKind: "document" | "record" | "measurement"` — closes it, and the fact that the closure is
one field is the strongest argument that this is `content`, not `lens`.

### One more permission nobody asked me about

`:52` — `useFor: "thesis" | "reversal" | "reframe" | "steel-man" | "colour"`.

A **conclusion** may be assigned `useFor: "steel-man"`. A conclusion is, by this file's own opening
lines (`:1-13`), a claim with **no direct source**, supported by other cards plus an analogy. So the
opposition slot — the slot my domain needs to hold a real company's real published words — may
legitimately be filled by a synthesis the model reasoned into existence. That is not a steel-man of
the company's position; it is a steel-man of a position the model has imputed to them, and it will
read to the audience as the company's answer. I would object to that on the record.

---

## 4. CENTRAL TEST 3 — can the notebook say *"the mechanics are as described and the intent is unestablished"*?

**Yes at the notebook's top layer. No at the board, no at the conclusions layer, and no at the
engine.** Three of four, and the three that fail are the three the audience sees.

**Where it works — and I checked before complaining.**

- `verdict` (`NOTEBOOK-SCHEMA.md:28-30`) is "the one-sentence answer". *"The transactions are
  structured as the report describes; the filings do not establish why"* is a one-sentence answer. The
  field holds it.
- `unknowns[]` (`:76-79`) is a better fit than I expected: `{what, why, impact}`, and **`impact` is
  described as the important field — "it tells the script what it may not say."** So:
  *what:* whether the treatment was intentional; *why:* intent is not observable in a filing;
  *impact:* the script states the treatment, and never states knowledge. That is exactly the
  instrument I would build by hand. It exists. Credit where due, and I note it as
  `present-but-underspecified` rather than absent.

**Where it fails.**

1. **The board cannot show it.** There is no `unknowns` column in `DIMENSIONS` and no
   `CARD_DIMENSION` entry for one. The single most important sentence in my notebook — the boundary
   of what is established — is invisible in the surface where a reviewer triages. It is a footnote in
   a data structure.
2. **The conclusions layer has no register for withholding.** `Leap` (`:26`) runs
   `near → moderate → far → unhinged`, and `near` is already *"barely a leap — restates what the
   cards already imply"* (`:29`). Every rung is a rung *forward*. There is no tier for **"the cards
   support the mechanism and do not reach the motive, and that is the finding"**. A refusal to
   conclude is not expressible as a conclusion, so the honest position cannot be gated, ranked,
   `restsOn`-linked, or wounded by descoping like every other claim — it simply is not that kind of
   object.
3. **The engine punishes it.** Engine D's viewer pleasure is *"watching a question get settled"*
   (`ENGINES.md:19`, `:70`). Its shape is *"question → enumerate the candidates → weigh each →
   verdict"*. A deliverable whose verdict is *"half of this is settled and half of it cannot be"* is
   off-engine by construction, and `CRAFT-BASELINE.md:86-99` (SCQA, answer early) plus `:124-128`
   (the ending re-describes) both push toward a resolved, repeatable closing sentence. The craft layer
   and the exposure layer are in direct tension here, and nothing in the methodic notices.

So my criterion 3 scores **partial** — expressible in the notebook, unrenderable through it.

---

## 5. Evidence-floor check

The MEASURED · OBSERVED · INFERRED · ASSUMED ladder lives at `knowledge/README.md:32-41` and it is
**the knowledge library's contract about craft claims** — "every line in a `PATTERNS.md` carries one".
It is not applied to notebook facts at all. Notebook facts carry `confidence: high | medium | low`
(`NOTEBOOK-SCHEMA.md:42-47`). Two ladders, one of which never touches research output.

That mostly disposes of the orchestrator's second hypothesis for my seat: I cannot complain that the
ladder has no rung for interpretive evidence, because the ladder **is not in the room**. What I have
instead is a three-value confidence scale, and it does the wrong thing to my two source classes:

| My material | Where the ladder puts it | Why that is wrong |
|---|---|---|
| **An audited filing** | `confidence: high` | Correct, and I have no complaint — except that it is indistinguishable from a high-confidence news aggregator, because `source` is free text (`:42`). The worked notebook's first fact is sourced `"99bitcoins / investingnews price history"`: two aggregators, no locator, on a `load_bearing: true` fact. My criterion 2 requires a filing, a page and a line. There is no field for a page or a line. |
| **A short report's numbers** | `confidence: low` — `:46`, *"Vendor research is `low` by default."* | **This is the wrong axis.** A short report is advocacy with a disclosed position, and its arithmetic is frequently correct and independently reproducible from the filings. The methodic demotes it for being *interested*, when the honest treatment is: reliable arithmetic, interested author, disclosed position, verify independently. Interestedness is not unreliability, and collapsing them means I either quote the number at "low confidence" (understating what I verified myself) or silently promote it (which `:108` correctly names "laundered confidence"). Neither is available to me honestly. |
| **The short-seller's disclosed position** | Nowhere. | My criterion 6 says the disclosure is a **fact**, not context. I can write it as a fact card — but no phase asks for it (`RESEARCH-PROMPT.md:20-36` has no source-interest row), no field records it, and on the board it is about the *accuser*, so it lands in `actors` or falls through `DEFAULT_DIMENSION`. Quoting a short report's numbers without its position disclosure is my second-listed pet peeve, and the methodic neither prevents it nor prompts against it. |

One genuine, and slightly poignant, exception: `ENGINES.md:128-129` requires that a Briefing
*"disclose the author's exposure"*. It is the only exposure-disclosure obligation in the entire
methodic — and it is attached to **one engine**, i.e. to the disposable render, under a philosophy
whose first commitment is *notebook is the asset, script is a disposable render*. An honesty rule
that lives only in the render evaporates the moment the same notebook is re-rendered through
Adjudication. I would call that an accident, and a diagnostic one: exposure has no home in the
durable artifact because the methodic was derived from a topic with no people in it.

---

## 6. Engine availability — all seven

| Engine | Available? | Assessment for a published fraud dispute |
|---|---|---|
| **A · Reversal Chain** | **Yes — best fit** | The turn is real and it is mine: *the obvious reading is that this is fraud; the filings support the mechanics and do not reach the intent.* The self-attack (`ENGINES.md:36-39`) is what keeps it from being a rant — but the self-attack consumes the steel-man slot, which is the slot my right-of-reply is stuck in. Best engine, same wound. |
| **B · Effort/Payoff Gap** | **Yes — and the safest** | *"A mechanism a viewer could operate"* (`:49`) is literally my hand reconciliation. Walk the viewer through the tie-out; the disproportion between the labour and the two-line disclosure is the lesson. It explains mechanics and adjudicates nobody. Underrated for this domain and I would reach for it first if exposure were the only consideration. |
| **C · Parallel Case** | Yes, with a warning | Establish the pattern in a settled, adjudicated case, transfer to this one. But `:58-61` transfers *a rule*, and transferring a rule from a company that was found to have committed fraud onto a company that has not been is an imputation dressed as pedagogy. The engine has no guard against that and the `precedent` field on conclusions (`conclusions.ts:45-48`) has the same hazard: labelled "an analogy every time it is shown", which is honest labelling of a structurally suggestive move. |
| **D · Adjudication** | **Yes — the named fit, and the most dangerous.** See below. | |
| **E · Briefing** | Yes, if the report is fresh | Carries the only exposure-disclosure obligation in the methodic (`:128-129`), and — per § 5 — loses it on re-render. |
| **F · Anchor Ladder** | Yes | One line item, traced through three years of filings, each year defeating the previous explanation. Genuinely strong short-form shape for exactly this material. |
| **G · Paradox Teaser** | Available, **contraindicated** | *"These two documents describe the same company"* is an excellent 50-second hook and there is no room in 50 seconds for a right of reply. Available ≠ advisable, and nothing in the catalogue says so. |

**7/7 available.** The skill's own warning applies to me: *"Zero is a blocker; seven is a smell (it
means the notebook has no shape)."* I report it as a smell and offer the diagnosis: a dispute between
two parties can be told seven ways because the material is inherently dramatic, not because the
notebook has found its spine. That is a reason for me to be *more* suspicious of my own output, not
less.

### Engine D against the D-rigged tells (`ENGINES.md:81-96`) — honestly

1. **Is the premise itself in the candidate set?** *Satisfiable, and the methodic actively helps.*
   Candidate 1 must be *"the accounting is defensible and there is nothing unusual here"*. The Bitcoin
   render does this well and knows it does — `script--adjudication.md:36-38` places the
   premise-challenging candidate first, deliberately. No complaint.
2. **Can any candidate actually win against the author's prior?** **This one fails structurally, and
   it is not the renderer's fault.** `NOTEBOOK-SCHEMA.md:28-30` requires `verdict` to be *"written
   during research, not during scripting"*. `:62-63` defines `steel_man` as *"the strongest case
   **against the verdict**"*. And `RESEARCH-PROMPT.md` never says **when** `verdict` is authored
   relative to Phase 6 (`:87-93`) — the phases run 1→9, `verdict` is assigned to no phase at all. So
   in the ordering the prompt actually permits, the answer is fixed and the opposition is then
   constructed as its complement. The Bitcoin render's own honesty table
   (`script--adjudication.md:128-136`) marks this tell ✅ on the grounds that candidate 1 "is
   explicitly *not* dismissed" — but candidate 4's heading is *"Verdict — and the reason this is the
   answer"* (`:102`), and that answer is the notebook's pre-existing `verdict` field. The tell was
   self-assessed by the artifact that fails it. For a market thesis that is a stylistic matter. For an
   adjudication between an accusation and a rebuttal, a verdict written before the rebuttal is read
   is the definition of a rigged hearing, and it is the shape of the document I would least like to
   have quoted back to me.
3. **Is the counter-evidence admitted or pre-excluded?** *Admitted* — the Bitcoin run's
   `script--adjudication.md:83-86` contains a real self-correction against its own case, and the
   requirement at `ENGINES.md:94-96` is properly strong. My objection is not that it is excluded. It
   is that admitting it *into the steel-man slot* is the same act as designating it the losing side
   (§ 2).

Net: Engine D passes tell 1 and tell 3 and fails tell 2 **by construction of the notebook, not by
weakness of the renderer** — which is precisely the class of defect this exercise is for.

---

## 7. My scored criteria

| # | Criterion | Result | Reason |
|---|---|---|---|
| 1 | `counter-case` and right-of-reply are **separable** | **FAIL** | One column (`dimensions.ts:36-37`) wired to one field defined as opposition to my own verdict (`NOTEBOOK-SCHEMA.md:62-63`). The alternative field, `counter_positions_to_state_fairly[]`, is shapeless (`:74`) and absent from the consumed-by table (`:11-21`), which by the schema's own principle (`:8-9`) means it does not belong in the schema. The company's own words can only enter as something the script is built to overcome. |
| 2 | Every allegation cites a **filing with a locator** | **FAIL** | `facts[]` is `{id, claim, load_bearing, source, confidence, as_of, note?}` (`:42`). `source` is free text; there is no page, no line, no exhibit, no accession number. `sources[]` (`:88`) is a flat URL list not joined to any fact. Worked example: a `load_bearing: true` fact sourced to two aggregators with no locator. Secondary sourcing on a fraud allegation is a liability, and the schema cannot express the difference. |
| 3 | *"Mechanics established, intent unestablished"* is expressible | **PARTIAL** | Expressible in `verdict` and, better than I expected, in `unknowns[].impact` (`:76-79`). Not expressible as a conclusion (no tier for withholding, `conclusions.ts:26`), not visible on the board (no `unknowns` column), and off-engine for the engine that fits (`ENGINES.md:19`). The honest position survives in the notebook and dies in the render. |
| 4 | No conclusion names an individual and asserts motive; **permission is the defect** | **FAIL** | `unhinged` is *defined* as a motive claim (`conclusions.ts:32-33`) and the `Conclusion` interface (`:36-60`) has no subject, no naming rule and no exposure field. The worked example asserts motive about identifiable officeholders at `:166-168`. Nothing distinguishes that from the same sentence with a CFO's name in it. |
| 5 | Every falsifier is a **document, not a mental state** | **FAIL (as a guarantee)** | `falsifiableBy: string` (`:49-50`) — required, unconstrained. In practice the worked notebook is exemplary, 7/7 document-shaped falsifiers, and I credit that. But the standard is convention, not construction, and checkability is only tested downstream by a human reviewer (SKILL § L2 check 5). One enum field fixes it. |
| 6 | The short-seller's position **and its disclosure** is a fact, not context | **FAIL** | No source-interest field; no Phase-1 row asking for it (`RESEARCH-PROMPT.md:20-36`); `confidence: low` for "vendor research" (`:46`) demotes an interested source's correct arithmetic instead of recording the interest. The only disclosure obligation in the methodic belongs to one engine (`ENGINES.md:128-129`) and is lost on re-render. |
| 7 | Under **3h** equivalent | **FAIL** (against the acceptance bar; large saving nonetheless) | See § 9. |

**2 partial, 5 fail, 0 clean pass.** I want to be clear that this is not a verdict on the quality of
the thinking in these files — several of the passages I have cited against the design are passages
where the design is arguing my own case better than most tools do. It is a verdict on the difference
between a document that says the right thing and a schema that enforces it.

---

## 8. Findings

Twelve, all with `file:line` evidence, all through the refuter pass. Machine-readable set in
`public-co-fraud--findings.json`. Refutations recorded inline below rather than summarised, because a
refutation I ran and rejected is more useful to the judge than my confidence.

### G-2026-08-12-01 — `counter-case` conflates the steel-man with the right of reply; the only other home is dead by the schema's own test
`blocker` · `dimensions`, `notebook-schema` · `schema-gap` · `content_or_lens: lens` (argued, § 2)
**Refuters run.** *Is this my topic being hard?* No — any topic with a named accused party hits it;
crypto-collapse, public-sector-corruption and consumer-scam seats are all downstream of the same
column. *Would competent execution produce it anyway?* No: a competent researcher who writes the
company's rebuttal into `counter_positions_to_state_fairly[]` has written it into a field no
composition step reads (`:11-21`), so it never reaches a script. Competence makes it worse, not
better — the material is captured and silently dropped. *Present but missed?* Checked all seven
columns, the schema field list, and the prompt's Phase 1 table and Phase 6. `present-broken`.

### G-2026-08-12-02 — `verdict`'s authoring time is unspecified, and `steel_man` is defined relative to it
`major` · `research-prompt`, `notebook-schema` · `missing-instruction` · `content`
The cheapest fix in this report and the one I would take first: pin `verdict` to a phase *after*
Phase 6, or require it be re-tested against the steel-man before the notebook closes.
**Refuters.** *Competent execution?* A competent researcher following the prompt in order has no
instruction telling them when to write the verdict, and `NOTEBOOK-SCHEMA.md:28-30`'s "during
research" nudges early. *By design?* Arguably — "answer early" is a craft commitment
(`CRAFT-BASELINE.md:92-99`) — but that governs the *script's* delivery order, not the *research's*
authoring order, and conflating them is exactly the error. `confirmed-absent`.

### G-2026-08-12-03 — the `unhinged` tier permits a motive claim about a named living individual, with no gate
`blocker` · `conclusions` · `unsafe` · `content`
**Refuters.** *Does the falsifier requirement already constrain it adequately?* Partially — and the
orchestrator was right to ask. It forces every motive claim to nominate a test, which is more than
most tools do. It does not constrain *who* the claim is about, and a document-shaped falsifier on a
defamatory motive claim mitigates damages, it does not prevent publication. *Present but missed?*
No naming rule in `conclusions.ts`, `NOTEBOOK-SCHEMA.md`, `RESEARCH-PROMPT.md` or `ENGINES.md`.
`confirmed-absent`.

### G-2026-08-12-04 — `falsifiableBy: string` admits a mental-state falsifier
`major` · `conclusions`, `notebook-schema` · `schema-gap` · `content`
**Refuters.** *Would competent execution produce a document falsifier anyway?* In the worked run, yes,
7/7 — genuinely good practice and I say so. But the quality bar (`RESEARCH-PROMPT.md:117-130`) does
not check falsifiers at all, so the good practice is unenforced habit. `present-but-missed` is wrong
here; the *value* is present, the *constraint* is absent. `confirmed-absent`.

### G-2026-08-12-05 — no locator on `facts[].source`; `sources[]` is not joined to facts
`major` · `notebook-schema`, `research-prompt` · `schema-gap` · `content`
**Refuters.** *My topic being hard?* Partly — locator discipline matters more in filings work than in
market commentary. But every seat that cites a primary document (legislative analysis, security
advisories, box-office reporting) needs the same field, so reachability is high, and the worked
notebook's aggregator-sourced load-bearing fact shows the defect biting on the founding topic.
`confirmed-absent`.

### G-2026-08-12-06 — "vendor research is low by default" conflates an interested source with an unreliable one
`major` · `notebook-schema`, `research-prompt` · `wrong-instruction` · `content`
**Refuters.** *By design?* The rule exists to prevent "laundered confidence" (`:108`) and it is right
about that risk. It is nevertheless the wrong axis: reliability and interest are orthogonal, and my
domain's central document is high-reliability-arithmetic-from-a-disclosed-interested-party.
`present-broken`.

### G-2026-08-12-07 — `macro.emptyMeans` is false for entity-level topics
`minor` · `dimensions` · `wrong-instruction` · `content`
`dimensions.ts:32-33` asserts an empty macro column means *"the asset is being explained in isolation
from the market it trades in"*. For a company-specific accounting dispute the column is correctly
empty, and the `emptyMeans` contract (`Dimension.emptyMeans`, `:21-22`: "stated so an empty column
reads as a gap, not as 'nothing to show'") converts my correct restraint into a badged defect. An
`emptyMeans` is a claim about meaning and this one is untrue outside markets.
**Refuters.** *Present but missed?* There is no per-topic mechanism to mark a column
not-applicable. `confirmed-absent`.

### G-2026-08-12-08 — no column for the assurance trail, and none for chronology
`major` · `dimensions` · `taxonomy-gap` · `content`
Orphans O3 and O4 (§ 1). Both fall through `DEFAULT_DIMENSION` (`:62`) into "The number", where a
reviewer looking for the audit history will never look — the exact failure the file's own comment at
`:42-49` documents having already happened once.
**Refuters.** *Convergence or my hobby-horse?* Chronology is generic (every OSINT and breaking-news
seat needs a time axis); the assurance trail is mine and one or two adjacent fraud seats.
`confirmed-absent`.

### G-2026-08-12-09 — exposure has no home in the durable artifact
`major` · `notebook-schema`, `conclusions` · `schema-gap` · `content`
The rubric scores `exposure` as one of eight dimensions, and the notebook has no field for it: not on
`facts[]`, not on `Conclusion` (`conclusions.ts:36-60`), not at the top level (worked notebook keys
confirm). So "what being wrong costs" is assessed in review and stored nowhere, and cannot travel
with the notebook — under a philosophy where the notebook is the asset and the script is disposable.
**Refuters.** *By design / out of scope?* Possibly deliberate for a market-derived methodic, which is
itself the point: exposure is invisible to a methodic derived from a topic with no people in it.
`confirmed-absent`.

### G-2026-08-12-10 — no engine renders non-settlement, and 7/7 availability is a smell
`minor` · `engines` · `taxonomy-gap` · `undecided`
Engine D's pleasure is settlement (`ENGINES.md:19`, `:70`); my honest deliverable is a partial
non-settlement. There is no catalogued engine whose pleasure is *the limits of what can be
established*. The catalogue says of itself that it is "open, not settled" (`:12`), so this is a
proposal, not an indictment.
**Refuters.** *Is A sufficient?* Probably yes in practice — the turn *"the mechanics are exactly as
alleged, and that is where the evidence stops"* is a real reversal. Marked `undecided` for that
reason, and severity held to `minor`.

### G-2026-08-12-11 — the only exposure-disclosure obligation lives in one engine and is lost on re-render
`major` · `engines`, `notebook-schema` · `wrong-instruction` · `content`
`ENGINES.md:128-129` requires a Briefing to disclose the author's exposure. Re-render the same
notebook through A or D and the obligation is gone, because it was never in the notebook. This is a
direct collision with the philosophy commitment *notebook is the asset, script is a disposable
render*, and I flag it for Bench 2 rather than claiming it myself.
**Refuters.** *Present but missed?* Searched prompt, schema, dimensions, conclusions, craft baseline.
It appears once. `present-broken`.

### G-2026-08-12-12 — `useFor: "steel-man"` lets an unsourced conclusion occupy the opposition slot
`major` · `conclusions` · `unsafe` · `content`
`conclusions.ts:52`. A conclusion has no direct source by this file's own definition (`:1-13`).
Filling the right-of-reply slot with model-reasoned synthesis and rendering it where the audience
expects the accused's answer is an imputation with a citation-shaped hole in it.
**Refuters.** *Is this reachable?* It requires the researcher to choose that `useFor` value — but
nothing warns against it, and in a topic where the accused's actual words are hard to obtain it is the
path of least resistance. `confirmed-absent`.

**By severity:** 2 blocker · 8 major · 2 minor · 0 polish.
**By `content_or_lens`:** 10 content · 1 lens · 1 undecided. The majority stays content, as the
rubric requires and as I believe is correct: most of what is wrong here is a missing field, an
unpinned ordering, or a column label. The single `lens` claim is argued in § 2 and its ceiling is
stated there — that even a lens, as the skill specifies a lens, cannot supply a party structure.

---

## 9. Time saved

**Manual baseline:** ~16h across a week (report, rebuttal, three years of filings, auditor's opinion,
hand reconciliation). **Acceptance bar:** 3h.

**Estimate: ~630 min saved (≈10.5h) · confidence: low.**

Reasoning, so the number can be argued with:

- What the methodic genuinely buys me is **organisation**, which is what I said I wanted — Phase 1's
  domain breadth, Phase 3's chain discipline, Phase 4's pre-computed turns, Phase 8's engine fit. Call
  it 6–7h of structuring and drafting I do not do twice.
- What it does not buy me is the reconciliation (I keep that; I said so) or the sourcing discipline —
  every locator has to be added by hand *outside* the schema (G-05), the right of reply has to be
  maintained in a side document (G-01), and the exposure review has nowhere to live (G-09). Call that
  2h of clerical work the tool creates rather than removes.
- Landing at **~5.5h**, against an acceptance bar of **3h**. A large saving that still fails
  criterion 7, which is an uncomfortable result and the honest one.

**Confidence low, and I will not dress it up:** this is L1. No notebook was produced. The estimate is
a reading of an instruction set, and instruction sets read better than they run — the skill says so
about itself. The number to trust is the L2 number.

---

## 10. Voice — Eleanor Kovač

I have read these files the way I read a client's document production, which is to say twice, and the
second time looking for what is not there.

Let me start where the design is better than my brief assumed, because the rest of this is critical
and a critique that concedes nothing is advocacy. `conclusions.ts` opens by stating the danger it
creates: a conclusion has no source, sits next to sourced facts, and *"reads as more authoritative
precisely because it sounds more insightful."* That is a true sentence about how documents deceive
people, and I have watched expensive professionals fail to write it. The opt-in asymmetry — facts in
until cut, conclusions out until admitted — is the correct default and it is the correct default for
the correct reason. *"A spicy claim that cannot be wrong is just an accusation"* is my own position,
stated by the tool, before I arrived. And in the worked example every one of seven falsifiers is a
thing that could exist in the world and be produced: an audited balance sheet, a coin count, a
decoupling under stress. I was sent to find that the design was careless and I did not find that.

What I found is that it is **conscientious in prose and permissive in type**, and I have spent six
years explaining to rooms why that distinction is the whole of the matter. A header comment is not a
control. `falsifiableBy: string` is a control, and what it controls for is the presence of a
sentence, not the existence of a test. The difference between "wrong if the company restates" and
"wrong if their intent was different" is the difference between a claim and an insinuation, and the
type signature cannot see it. Everything downstream — the badge, the UI marking, the reviewer's
judgement at L2 — is a person being careful. People are careful until the volume goes up.

Then there is the column, and I want to be precise about the objection because it is not the one the
brief expected me to make. My complaint is not that the company's rebuttal is treated unfairly. It is
that it is treated as a **position** when it is a **document**. The steel-man is something I write —
`in the words its believers would use`, which is a novelist's instruction, and a good one, and
absolutely not what a right of reply is. A right of reply is what a company said, over a signature,
after their counsel read it, frequently under an obligation to say something. It is quotable. It has a
date. It has a page. And the methodic has exactly one slot for opposing material, that slot is defined
as *the strongest case against my verdict*, and the two engines I would actually use both consume that
slot as the thing they are built to overcome. So a document I did not write, cannot alter, and am
obliged to reproduce accurately, enters my notebook as raw material for an argument I construct
against myself, and leaves it as the candidate that came second. I do not think anyone designed that.
I think it is what happens when you derive a process from a topic where the counter-party is a price
chart.

And the second field — the one that could have held it — is the part I would put on a slide. It is
declared at `NOTEBOOK-SCHEMA.md:74` with no shape at all, and it is missing from the table of fields
that anything reads, in a document that opens by saying a field nothing reads does not belong. The
notebook has a slot for stating the other side fairly, and by its own stated rule that slot is not
part of the notebook. That is not an oversight I can route around by being careful, because the
carefulness has nowhere to land.

On the tier they told me to look at. `unhinged` is defined as a claim about motive, and I want to be
fair: the definition is honest, the tier is opt-in, and the worked example uses it on a government
policy where that kind of speculation is ordinary and healthy. Move one column across. Put a name in
the subject position — a controller, a CFO, an audit partner, a person with a mortgage and an
employer — and the identical structure produces a sentence asserting that a named living individual
acted with intent to deceive, tagged with an emoji, defended by the observation that it was offered as
speculation. I have sat in the room where that defence is made. It is not a defence. It is the thing
opposing counsel reads aloud, slowly, and then asks you to confirm you published deliberately. The
methodic knows that motive is *"the least verifiable kind of claim there is"* — it says so — and it
does not ask whose motive. One field. `subject_is_a_named_person`, and a rule that says when it is
true the leap ceiling is `moderate` and the claim is about conduct, not knowledge. I would adopt that
tomorrow and I would not consider it a burden.

The last thing, and it is the one I would fight for. I asked whether the notebook can say *the
mechanics are as described and the intent is unestablished*, and the answer is that it can write it
down and cannot say it out loud. `unknowns[].impact` is a genuinely good instrument — *what the script
may not say* — and I would have built something clumsier. But there is no column for it, so the
reviewer never sees it; there is no leap tier for withholding, so it cannot be gated or linked or
wounded like every other claim; and the engine that fits my material exists to deliver the pleasure of
*watching a question get settled*. My cases do not settle. That is not a deficiency in my research, it
is the finding — an accounting treatment can be established to the page and the line, and a state of
mind cannot be established at all from documents, and the whole professional value of what I do is
holding those two apart in front of an audience that would rather I didn't. A methodic that can render
"they did it" and can render "they didn't" and can only footnote "this much is shown and the rest is
not" will, at scale, and with no bad intent from anyone, produce accusations. Not because it takes a
side. Because the shape it renders into has only two ends, and the true answer is in the middle, where
there is no beat.

I would not run this on a live dispute today. I would run it on Engine B — the reconciliation as a
mechanism a viewer can operate — where the material is arithmetic and the only person named is me.
That is not an endorsement. It is the narrowest place I can stand.

---

*Prepared at L1, on the documents, without a research run. Every citation above is to a file in this
repository. No company, report, auditor or individual is named anywhere in this pass, and none is
required to reproduce any finding in it.*
