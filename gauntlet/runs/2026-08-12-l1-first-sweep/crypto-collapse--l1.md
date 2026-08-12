# L1 — dry fit · `crypto-collapse` (Bruno Ferreira, "Chain of Custody")

**Area:** fraud · **Lens binding:** fraud · **Level:** L1 (paper, no run, no searches)
**Topic (shape, not named):** a collapsed on-chain project where the ledger record and the public
explanation do not match, traced wallet by wallet. Thesis shape: *the collapse was visible on-chain
weeks before the announcement, and the story is who could see it.*

> Per the run brief, every orchestrator lead was treated as an unverified hypothesis. Two are
> contradicted below (columns; evidence-floor), one is confirmed by a mechanism the lead did not name
> (falsifiers), one is out of my reach at L1 (counter-case literature — mine exists).

**VERDICT: `L1-fail`.**

Not a fit failure. A structural one, and the contrast is the point of this report: **7/7 columns,
7/7 engines reachable, and I still cannot write the central fact of my own beat.** The methodic
accommodates my topic everywhere except the one place it has to hold — the joint between a claim
that is measured and a claim that is inferred *about the same object*. Do not spend L2 on this
topic until `G-l1s-cc-01` and `-02` are recorded.

---

## 1. Column utilisation

```
columns 7/7 used · 4 orphan groups
```

**I contradict the orchestrator's first lead.** The hypothesis was that the seven columns are
market-shaped and will collapse or orphan on non-market topics. On the topic closest to the
incumbent, they don't collapse — every one of the seven takes real material, and two of them
(`counter-case`, `conclusions`) are the best-designed things in the repo for my domain. Reporting a
column gap here would have been the easy lie.

| Column | Used | What lands there |
|---|---|---|
| `the-number` (`dimensions.ts:26-27`) | ✅ | Balance and outflow timeline of the traced addresses. The label is price-shaped; the `emptyMeans` ("No measured baseline — every claim downstream is unanchored") generalises cleanly. Content fix, not a gap. |
| `flows` (`:28-29`) | ✅✅✅ | Hop-by-hop path: contract → bridge → CEX deposit address → mixer. **This is ten of my thirteen hours in one column.** |
| `actors` (`:30-31`) | ✅ | The exchange, the market maker, the treasury multisig, the foundation. Also where my ontology dies — see §3. |
| `macro` (`:32-33`) | ✅ | Sector-wide drawdown across the collapse window. Load-bearing for me, not context: it *is* the counter-case's evidence. |
| `politics` (`:34-35`) | ⚠️ | Filings, enforcement actions, receivership, bankruptcy examiner findings fit the column *as cards*. But the column's purpose is "what changed, and whether it was actually implemented" — policy-shaped. A filing in my notebook is not a policy; it is the **authorisation to name a person** (my criterion 4). The column holds the card and loses the job it does. |
| `counter-case` (`:36-37`) | ✅ | "This was market conditions, not conduct" — abundant. See §5. |
| `conclusions` (`:38-39`) | ✅ | Off-by-default opt-in asymmetry is the single best design decision in this methodic *for my domain*. Credit where due. |

### Orphan groups (named)

**O1 — The attribution ledger.** The per-cluster evidence that makes "these 40 addresses are one
entity" a claim at all: common-input-ownership, change-address heuristics, timing/gas-price
fingerprints, a funding ancestor. This is not a fact about the number, the flow, or the actor. It is
a fact about **the method by which an actor was constructed**. There is no column for it, so it goes
into `actors`, where it becomes indistinguishable from the actor claim itself. *The board performs
the exact collapse my scored criterion 1 forbids.*

**O2 — The public-record timeline.** Announcements, AMAs, solvency assurances, "funds are SAFU"
posts — with timestamps. Not politics (no policy changed). Not actors (they are utterances, not
agents). Not the-number. The only column that will accept them is `counter-case`, and filing the
target's own PR as the steel-man is a rigging mode (§5). In the Bitcoin run this class does not
exist because nobody's *statements* are on trial, only their *positions*.

**O3 — The gap ledger.** The paired items `(on-chain event t0, public statement t1, Δ)`. Downstream
of O2 but a distinct group, because the deltas *are* the thesis and would still have no home even if
O2 got a column. See §4.

**O4 — Query provenance.** Which explorer, which labelled-address dataset and its vintage, the block
height the balance was read at, re-org depth. `sources[]` is a flat URL array
(`NOTEBOOK-SCHEMA.md:88`). **No finding opened** — "Etherscan, address 0x…, at block N" fits inside
the existing `source` string. This is content, and I am not inflating it into a schema gap.

### What the dial did not see

`7/7 · 4 orphans` is a true number and a misleading one. It cannot see that `flows` absorbed 77% of
my labour undifferentiated, and it cannot see that all four orphans are **cross-cutting** rather than
topical — they are *kinds of claim*, not *subjects*. A domain can score 7/7 and be unwritable. The
denominator is fine; the dial has no second axis. (That is a critique of the scoring in
`gauntlet/rubric.md:74-79`, which is not a valid `targets[]` id, so it lives here and in my voice
section rather than as a finding.)

---

## 2. MY CENTRAL TEST — one object, two evidence classes

**The object:** a single on-chain transfer attributed to a cluster.
**Claim A (MEASURED):** 40,000 tokens moved from address `0xA…` to address `0xB…` in block N. This
is hash-verified, reproducible by any stranger, and about as close to incontrovertible as evidence
gets in journalism.
**Claim B (INFERRED):** `0xA…` belongs to a cluster of 40 addresses that is one entity, established
by co-spend heuristics.

Two claims. One object. My entire beat is the discipline of never letting B borrow A's certainty.

### Can `facts[]` hold both?

`facts[]` is `{id, claim, load_bearing, source, confidence, as_of, note?}` —
**`NOTEBOOK-SCHEMA.md:41-42`**.

**Option A — one fact.** `{claim: "Cluster C moved 40,000 tokens to a CEX deposit address on
2025-03-04", confidence: ?}`. `confidence` is a single scalar, `high | medium | low`
(**`NOTEBOOK-SCHEMA.md:46`**; type at `app/_phases/_shared/notebook/types.ts:12,21`), and the schema
defines its *semantics* as source reliability — *"Vendor research is `low` by default"* (`:46`). That
is an axis about **who told you**, not about **what kind of claim it is**.

So whichever value I write is false about half the fact:

- `high` → the attribution has been laundered up to the reliability of a blockchain. This is the
  single failure my beat exists to prevent, and the schema will have performed it for me.
- `medium` → a block-verified transfer has been demoted to "an analyst said". Every downstream rule
  that privileges load-bearing high-confidence material (`RESEARCH-PROMPT.md:123`; the flagged-fact
  counter at `app/_phases/_shared/notebook/notebook.ts:176-178`) now discounts the only genuinely
  incontrovertible evidence I own.

`confidenceNote` (`types.ts:22-23`) is optional free text and is not in the schema's *"Consumed by"*
table (**`NOTEBOOK-SCHEMA.md:14-22`**) — nothing downstream reads it. It cannot carry a second
evidence class; it can only apologise for the first.

**Option B — two facts.** `f-transfer` (measured) and `f-attrib` (inferred). The schema permits it,
and it is what a careful researcher does. Then the relationship is lost, because:

> **`facts[]` has no fact→fact edge.** There is no `about`, `subject`, `qualifies`, or `depends_on`.

Every relation in the entire model points *upward* from facts to a synthesis:
`reversals[].evidence[]` is an id list (**`NOTEBOOK-SCHEMA.md:56-57`**), `conclusions.restsOn` is an
id list (**`conclusions.ts:43-44`**), `currency.expires_first / durable` are id lists
(`NOTEBOOK-SCHEMA.md:85`). Nothing points sideways.

So after the split, "this attribution is *about* that transfer" exists only inside the prose of two
`claim` strings — and Rule 1 is *"No prose. Claims are one line."* (**`NOTEBOOK-SCHEMA.md:92`**).

And then it gets worse, because the split lands **across a column boundary**. `CARD_DIMENSION` is
`Record<string, DimensionId>` — one dimension per card (**`dimensions.ts:50-60`**). `f-transfer` is
`flows`. `f-attrib` is `actors`. A reviewer working the `actors` column descopes the attribution;
the transfer card sits in `flows`, untouched, still reading *"Cluster C moved…"*. The wound graph
(**`conclusions.ts:20-21`** — *"a conclusion whose supporting cards get descoped is wounded like any
other dependent"*) has no edge to propagate along, because the dependency it models is
conclusion→fact and never fact→fact.

### Answer

**Neither.** One fact loses the distinction to a scalar; two facts lose the relationship entirely,
and lose it *at the column boundary*, which is strictly worse than losing it in a list — a list you
can read; a descope you cannot.

`env.md:34-35` is explicit that this is the right way to report it: *"a field you wanted and couldn't
fill is a `notebook-schema` finding, not a workaround."* So I am not going to write it into `note`
and call the run a success.

→ **`G-l1s-cc-01`** (no evidence-class field) and **`G-l1s-cc-02`** (no fact→fact edge). Separately
fixable, separately load-bearing.

### And the ladder the rubric says exists, doesn't

`gauntlet/rubric.md:62` and `SKILL.md:90` both assert the notebook runs a
MEASURED · OBSERVED · INFERRED · ASSUMED ladder. **It does not appear anywhere in the notebook
contract.** I grepped the repo. It lives at **`knowledge/README.md:36-41`**, and its own text scopes
it: *"Every line in a `PATTERNS.md` carries one"* (`:34`). It governs claims the studio makes about
its **video corpus** — craft rules — not claims a notebook makes about the world.

The notebook's honesty vocabulary is `confidence`, and `confidence` is a different axis. So the
brief's second lead — *"the ladder has no honest rung for interpretive evidence"* — is
**contradicted in an unexpected direction**: there is no rung because there is no ladder. The
apparatus the whole run assumes is being tested is a different apparatus, one file over, for a
different artifact class.

→ **`G-l1s-cc-03`**.

---

## 3. Address / cluster / entity — three classes, or one?

**They cannot stay distinct, and there are three separate mechanisms pushing them together.**

**(a) Facts are untyped.** A fact's `claim` is a string (`NOTEBOOK-SCHEMA.md:42`). There is no
`subject_type`, no controlled vocabulary, no validation. The distinction survives only as the
researcher's writing discipline in a free-text field — which is to say, it survives *in spite of* the
notebook, not *into* it.

**(b) The `actors` column has one slot for three ontological tiers,** and its `emptyMeans` actively
pushes toward the top one: *"Nobody is named — the story has no agents"* (**`dimensions.ts:31`**).
`env.md:12-13` instructs me to test `emptyMeans` claims as claims. This one is **false in my domain**:
a story can have agents that are clusters, and the discipline of my field is precisely to keep them
that way. An address is not an agent. A cluster is not an agent. Only an entity is. The empty state
scolds the researcher for not naming people, in the field where naming people is the litigable act.

**(c) `scale_conversions[].felt` is an unpoliced promotion path — and the incumbent run walked it.**

Watch it happen in the reference, on my own kind of material, unremarked:

1. `f-lth-distribution` (**`notebook.json:80-86`**) — an *address-cohort* measurement, correctly
   written: "Long-term holders realised 3.67 million BTC in profit…"
2. `scale_conversions` (**`notebook.json:311-312`**) — `felt`: *"the **people** who held longest sold
   most."* Cohort → people. In a field whose schema entry (`NOTEBOOK-SCHEMA.md:67-68`) has exactly
   one design constraint — "a number without a comparison is a number the script wastes" — and no
   honesty constraint whatsoever.
3. `c-borrowed-prosperity` (**`conclusions.ts:150-152`**) — *"from **people who believed in it** to
   **people who are allocated to it**."*
4. `script--adjudication.md:60-62` renders it aloud.

Address → cohort → people, in three hops, none flagged, every hop inside the sanctioned pipeline.
On Bitcoin that promotion is harmless — nobody is accused of anything. Run the identical machinery on
a collapsed project and step 2 is a defamation exposure with a `raw`/`felt` pair for a source.

`scale_conversions` is where my three classes die, and it is the one structure in the notebook whose
entire job is to make a number *feel* like something. Of course it is where the laundering happens.

→ **`G-l1s-cc-04`** (`scale_conversions` promotion path), **`G-l1s-cc-08`** (`actors` emptyMeans +
one column, three tiers).

---

## 4. Timestamps as evidence — can the gap be a fact?

The gap between an on-chain event and a public statement is not colour. **It is the story.** "The
treasury address went to zero on the 4th; the solvency assurance was posted on the 23rd" is the
entire video.

**`as_of` exists and is the wrong field.** `NOTEBOOK-SCHEMA.md:47`: *"every fact is dated. This
drives `currency`."* Its declared consumer in the *"Consumed by"* table is `currency` — shelf life
(`:21`). It answers *when does this claim go stale*, not *when did the thing happen*. On the Bitcoin
run those coincide (`f-sbr`, `notebook.json:55-60`: signed 2025-03-06, `as_of` 2025-03-06). In my
domain they systematically do not: a block has a second-precision event time; my read of it has a
discovery time; a tweet has an utterance time. One date field, no time component, pointed at
staleness.

**Can the gap itself be a fact?** Structurally yes, honestly no. Write:

> `{claim: "The treasury outflow preceded the solvency assurance by 19 days", ...}`

and the quality bar (**`RESEARCH-PROMPT.md:122`**) demands *"every `fact` has a source, a date and a
confidence"*. This fact has **two** sources, **two** dates and **two** confidences, and it is derived
rather than found. There is no honest single value for any of the three fields, and — back to §2 —
no edge to the two facts it is computed from. **The prompt's own quality bar makes my thesis
unwriteable as a fact.**

So where does it go? `mechanisms[].chain[]`, as a prose step: *"the treasury emptied THEREFORE …
BUT the statement said …"*. Which surfaces the thing that genuinely surprised me on this read:

> **`mechanisms[]` has no `evidence[]` field.** `{id, name, chain[], explains, needs_analogy, note?}`
> — **`NOTEBOOK-SCHEMA.md:50`**. Compare `reversals[]` one section down (`:56`), which has one.

Phase 3 (`RESEARCH-PROMPT.md:54-68`) never asks for evidence per link, and the quality bar checks
only that *"every `mechanism.chain` link is BUT or THEREFORE"* (`:124`) — a **form** check, not a
support check. The place the causal spine is authored is the only structure in the notebook with no
citations attached, and it is the structure the script step inherits wholesale
(`NOTEBOOK-SCHEMA.md:19`).

*Refuter, applied:* a mechanism can inherit evidence transitively via a reversal that names it —
`r1` carries `evidence[]` and `mechanism: "m-etf-plumbing"` (`notebook.json:246-255`). True, and it
downgrades this from blocker to major. But `m-institutionalisation`'s chain has five links and its
referring reversal `r4` supplies three fact ids (`:285-289`) with no per-link binding, and a mechanism
no reversal points at gets nothing at all. Confirmed, downgraded.

→ **`G-l1s-cc-07`** (`as_of` is a currency field; no gap-as-fact), **`G-l1s-cc-06`** (mechanisms
carry no evidence).

---

## 5. Evidence-floor check

**My floor is the highest in the fraud area, and the methodic has no ceiling to put it under.**

The brief's hypothesis is about a missing *bottom* rung. My problem is the opposite: `confidence:
high` is the top of the scale and it is shared, in the reference notebook, by a whitehouse.gov fact
sheet (`notebook.json:59`), a price-history aggregator (`:27`) and a coindesk story (`:67`). There is
no way to say *"this is hash-verified and reproducible by a stranger at block N"* as a claim of a
different kind from *"a reputable outlet reported it"*.

**Flattening the top is exactly what lets an inferred attribution ride to the same altitude as a
block.** The floor is fine. The ceiling is the defect, and it is the same defect as §2 from the other
end.

## 6. Counter-case reachability — "this was market conditions, not conduct"

**Reachable, at strength. Phase 1's mandatory row (`RESEARCH-PROMPT.md:32`) is satisfiable for me** —
sector-wide drawdown series, contagion analyses, the project's own post-mortem, an examiner's
alternative findings, and a genuinely good version of the argument that any leveraged entity dies in
that tape. I contradict the brief's fourth lead as it applies to my seat; the unsatisfiable case is a
48-hour news topic, not mine.

Two hazards the methodic does not price:

**(a) The defendant-sourced steel-man.** In fraud, the most *available* "nothing unusual is
happening" source is the accused's own statement. It is articulate, well-resourced, and free.
`ENGINES.md:82-96` gives three structural tells for D-rigged, all about whether the counter-evidence
was *pre-excluded*. None catches the inverse: a steel-man that is present, prominent, at full
strength, and **sourced entirely to the subject of the accusation**. That is not adjudication, it is
a right-of-reply box wearing the steel-man's coat, and in my domain it is the path of least
resistance. → **`G-l1s-cc-09`**.

**(b) One card, two columns.** The sector drawdown series is simultaneously my `macro` evidence and
my `counter-case` evidence. `CARD_DIMENSION` allows one dimension per card (`dimensions.ts:50`), so
descoping it from `macro` silently descopes the counter-case's best support.
*Refuter:* a researcher can legitimately write two cards from two angles. That is a fair answer, so I
am recording this `uncertain` and `minor` rather than pretending it is structural.
→ **`G-l1s-cc-11`**.

## 7. Engine availability — all seven

| Engine | Fit | Reasoning |
|---|---|---|
| **A · Reversal Chain** | **good** | "The announcement said X; the chain said Y three weeks earlier" is a chain of turns and my material has four of them. Cost the catalogue does not name: A's load-bearing move is the self-attack (`ENGINES.md:36-39`), and my proof is an accusation — so the honest self-attack is *"maybe I clustered wrong"*, which is correct and also removes the spine. Usable, at a price. |
| **B · Effort/Payoff Gap** | **medium, and the catalogue mis-sorts it** | The "mechanism a viewer could operate" (`:45`) is the trace itself — here is the explorer, here is hop one, here is hop nine. Perfect. But the engine's shape hard-codes *"trivially small payoff"* (`:44`), and my payoff is enormous. **B is two engines fused**: the operable-mechanism engine and the disproportion joke. Mine needs the first and is disqualified by the second. |
| **C · Parallel Case** | **medium** | A prior collapse with the same on-chain signature as the familiar half. Works — and doubles my exposure surface for a structural gain, since the familiar case must also be named. The catalogue prices structure and never exposure. |
| **D · Adjudication** | **excellent, and the most dangerous thing in the repo for me** | "Was this a crash or was it conduct" is textbook D: candidates = market conditions / operational incompetence / specific conduct, with the premise itself in the set (`:87-90`). But **D's verdict, in my domain, is a finding of culpability.** The whole honesty apparatus at `:81-96` asks whether the *weighing* was rigged. Nothing anywhere asks whether a verdict is **permitted**. The Bitcoin render's verdict lands on a mechanism (`script--adjudication.md:106-114`); mine lands on people. Same engine, categorically different liability, catalogue silent. |
| **E · Briefing** | **poor** | Already collapsed; no news event. Same reason the incumbent scored it poor (`notebook.json:389-391`). |
| **F · Anchor Ladder** | **medium (short)** | One wallet, escalating hops — hop depth *is* naturally ordered difficulty. Genuinely good and the chooser table (`ENGINES.md:162-171`) would never have surfaced it: "a concept with naturally ordered difficulty" does not read as "a trace". |
| **G · Paradox Teaser** | **good (short)** | *"This wallet is empty. This wallet is empty. This statement says the funds are safe."* That is the form exactly (`:145-153`). |

**7/7 reachable, 2 excellent.** The skill warns that seven is a smell meaning the notebook has no
shape (`SKILL.md:97`). I do not think that applies — forensics is genuinely multi-form, and I would
rather say so than manufacture a blocker to look rigorous.

The real gap is that **no engine's pleasure is verification** — watching a claim get checked against
a record. D's pleasure is "watching a question get settled" *by an author*; my audience's pleasure is
"watching a receipt get pulled". Different transaction with the viewer entirely.
*Refuter:* `ENGINES.md:13` says the catalogue is "open, not settled" and `:172-175` says engines
compose, so verification may be A∘D. That is a decent answer, so this goes in `uncertain` and `minor`.
→ **`G-l1s-cc-10`**.

## 8. My scored criteria

| # | Criterion | Result | Why |
|---|---|---|---|
| 1 | Address / cluster / entity are three distinct fact classes and never merge | **FAIL** | Facts are untyped strings; one `actors` column for three tiers; `scale_conversions.felt` promoted a cohort to "people" in the reference run and nothing objected. §3 |
| 2 | The ladder holds one measured and one inferred claim about the same object | **FAIL** | One scalar `confidence` with source-reliability semantics; no evidence-class field; no fact→fact edge; the split lands in two columns. §2 |
| 3 | Timestamps of on-chain events *and* public statements both present, so the gap is a fact | **FAIL** | `as_of` is a currency field, one date, no time; the gap fact has two sources / two dates / two confidences and fails the prompt's own quality bar. §4 |
| 4 | No conclusion names an individual as controlling a cluster without a filing or admission | **FAIL** | `conclusions.ts` contains **no naming policy of any kind**. `unhinged` is defined as *"a claim about MOTIVE… nobody can source what someone intended"* (`:32-33`) and the shipped exemplar `c-reserve-was-the-product` (`:164-179`) imputes motive to a named sitting head of state — *"a way to put a floor under an asset your donors hold"*. §9 |
| 5 | The counter-case — "market conditions, not conduct" — is present at strength | **PASS, with hazard** | Literature is abundant and Phase 1 asks for it. Hazard: the cheapest steel-man is the accused's own statement, and `ENGINES.md`'s three tells do not catch it. §6 |
| 6 | Falsifiers are checkable on-chain or in a filing | **PASS** | `falsifiableBy` is required (`conclusions.ts:57`) and my domain has the cheapest falsifier substrate on earth: a public ledger anybody can query. This is the methodic's best moment for me and I will say so without hedging. |
| 7 | Under 2h equivalent | **FAIL** | ~110 min saved against a 780 min baseline. §10 |

**4 fail · 2 pass · 1 pass-with-hazard.** Criterion 2 is the one that decides the verdict, because it
is the only one no amount of researcher discipline repairs — the field does not exist.

## 9. Exposure — criterion 4, and the falsifier that isn't

The brief invited me to contradict the lead that `unhinged` is unsafe when a conclusion names a
living person, *if* the falsifier requirement already constrains it. **It does not, and I can name the
mechanism, which the lead did not.**

Take the shipped exemplar, `c-reserve-was-the-product` (`conclusions.ts:164-179`). It is a
**compound** claim:

- *Near half (checkable):* the reserve was never built. Evidenced, dated, sourced.
- *Far half (motive):* it was announced *"to put a floor under an asset your donors hold"*.

The `falsifiableBy` reads: *"A funded, audited reserve with a published coin count."* That falsifies
the **near half only**. Publish the audited reserve tomorrow and the donor-motive imputation is
untouched — it simply becomes a motive claim about a policy that was, after all, executed.

**The falsifier requirement is satisfiable by falsifying the checkable half of a compound claim, and
nothing in `conclusions.ts` requires the falsifier to bind the *load-bearing* half.** `hottest` is
held to *"a HIGHER bar"* (`:53-58`), and the higher bar is *"it still states its falsifier"* — which
this one does, decoratively.

Now port that to my beat. `c-<entity>-controlled-the-cluster`, leap `unhinged`, falsifier *"a
transaction from that cluster signed by a different party"* — checkable-sounding, structurally
unfalsifiable, and the claim it fails to bind is *a named individual controlled the wallets that took
the money*. My lawyer stops the video. The methodic does not.

`conclusions.ts` has no `namesPerson` flag, no evidence-class requirement on a naming conclusion, no
gate tying "names an individual" to "a filing or admission exists". The opt-in asymmetry
(`:15-17`) is a real safeguard and it is a **user-attention** safeguard, not a **legal** one: it asks
a human to approve, it does not tell them what they are approving.

→ **`G-l1s-cc-05`**, and the one finding I would argue is genuinely `lens` rather than `content`,
because "exposure-class" and "conclusion-policy: naming rules" are literally lens fields
(`SKILL.md:193-198`) and no rewording of a domain table adds a gate.

## 10. Time-saved

```
~110 min saved · of a 780 min (13h) baseline · MEDIUM confidence
acceptance bar: 120 min total → missed by ~550 min
```

Derivation, honestly:

- **Phases 1–2 (breadth + tension):** replace ~2.5h of orienting search and framing. Real saving. The
  tension shapes at `RESEARCH-PROMPT.md:41-50` — particularly #4, *"the absent thing"* — describe my
  topic better than anything else I have read in this repo.
- **Phases 3–9 (structure):** ~0.5h. I already work this way; the value is the format, not the thought.
- **Clustering — ten of my thirteen hours — is untouched.** Phase 1 is a web-search protocol
  (`:20-33`). There is no primary-data step, and the incumbent's own `research_gaps` confesses it:
  *"Still no PRIMARY on-chain data — every figure remains aggregator-sourced"* (`notebook.json:430`).
  The reference run researched my domain and never opened a block explorer.
- **Negative term:** my stated acceptance condition is *"provided the notebook never asserts a
  cluster he hasn't checked"*. Given §2 and §3, a notebook generated from aggregator prose **will**
  assert clusters, phrased as entities, at `confidence: high`, with no field marking them as
  inferred. Auditing those assertions back to primary data costs more than writing them myself. **If
  the notebook is trusted, this number goes negative.**

Caveat per `accepted-gaps.md:23-32` (`scope-note`): this estimates the methodic as written, not a
product's execution of it. Nothing here is a measurement.

## 11. Cognitive walkthrough

1. *Will I know what each phase wants from my topic?* — Phases 2, 4, 6, 7, 9: yes, and well.
   Phase 1: **no.** The domain table is explicitly labelled *"For a market/economics topic"*
   (`:21-22`) and offers no substitution rule for a forensic one. I would improvise, and improvisation
   at Phase 1 is where a run's evidence floor is silently set.
2. *Will I find the affordance?* — Yes at L1; everything is a documented field.
3. *Will I connect what happened to what I wanted?* — **Only if I already know what is missing.** The
   fact that `confidence` is a source-reliability axis and not an evidence-class axis is nowhere
   stated as a limitation; it reads as a complete honesty system until you try to use it on a
   two-class object.
4. *Do I know whether I am closer to a script?* — Yes. `engine_fit` plus a rendered script is the
   clearest "am I done" signal in the whole methodic, and the two-renders-one-notebook demonstration
   (`script--adjudication.md:16-18`) sells the philosophy properly.

## 12. Where the Bitcoin reference helped, and where it misled me

**Helped, genuinely:**
- It is the closest thing in the repo to my domain and it proves the pipeline *runs*: one notebook,
  three renders, and `script--adjudication.md:128-136` self-audits against the D-honesty tells
  instead of asserting compliance. That is real engineering.
- `f-whale-absorb` (`notebook.json:180-187`) is written **correctly at the address tier** — "Wallets
  holding over 1,000 BTC" — which shows the discipline is *achievable* in a free-text claim string.
- `unknowns[].impact` (`:359-374`) — *"Phrase as 'moves with', not 'because of'"* — is the single
  best mechanism in the schema for my pet peeves. It is exactly the machinery I need for *"the tokens
  moved to"* versus *"the money went to"*. It exists, it is required (`Rule 5`, `:98`), and it works.

**Misled me, and this is the important half:**
- **It is a topic with no defendants.** Every honesty mechanism in the repo was tuned against a
  subject where being wrong costs a correction. Read it as the worked example and you will conclude
  the safety apparatus is comprehensive, because on this topic it is.
- **It made the address→people promotion look free.** §3, steps 1–4. On Bitcoin it *is* free. The
  reference teaches, by demonstration, the exact move that is actionable in my field — and the
  demonstration is the officially sanctioned artifact.
- **It normalises aggregator sourcing for on-chain data.** Fourteen sources, zero explorers
  (`:413-427`), and the gap is honestly declared (`:430`) — but "declared" and "fixed" are different,
  and the notebook rendered three scripts anyway.
- **`confidence: high` on `whitehouse.gov` and `confidence: medium` on on-chain cohort data**
  (`:59` vs `:184`) is the ceiling problem made concrete: the press release outranks the ledger.

## 13. Findings summary

| id | Title | Targets | Sev | Verdict |
|---|---|---|---|---|
| `G-l1s-cc-01` | `facts[]` cannot carry a measured claim and an inferred attribution about one object | notebook-schema, dimensions | blocker | confirmed |
| `G-l1s-cc-05` | No naming policy on conclusions; a compound claim's falsifier binds only its checkable half | conclusions | blocker | confirmed |
| `G-l1s-cc-02` | No fact→fact relation; splitting a two-class claim loses the binding across a column boundary | notebook-schema, dimensions | major | confirmed |
| `G-l1s-cc-03` | The MEASURED→ASSUMED ladder is not in the notebook contract; `confidence` is a source-reliability axis | notebook-schema, knowledge | major | confirmed |
| `G-l1s-cc-04` | `scale_conversions[].felt` is an unconstrained promotion path from cohort to people | notebook-schema, research-prompt | major | confirmed |
| `G-l1s-cc-06` | `mechanisms[]` has no `evidence[]`; the causal spine is the only unsourced structure | notebook-schema, research-prompt | major | confirmed |
| `G-l1s-cc-07` | `as_of` is a currency field; an event↔statement gap cannot be a sourced fact | notebook-schema, research-prompt | major | confirmed |
| `G-l1s-cc-08` | `actors` `emptyMeans` instructs the researcher to name people; one column, three ontological tiers | dimensions | major | confirmed |
| `G-l1s-cc-09` | No D-rigged tell for a steel-man sourced entirely to the accused | engines | major | confirmed |
| `G-l1s-cc-12` | Phase 1's domain table is declared market-only with no substitution rule | research-prompt | minor | confirmed |
| `G-l1s-cc-10` | No engine whose pleasure is verification; Engine B fuses operable-mechanism with trivial-payoff | engines | minor | uncertain |
| `G-l1s-cc-11` | One dimension per card: the drawdown series is both `macro` and `counter-case` | dimensions, ui | minor | uncertain |

`G-000` (untagged cards → "The number", `dimensions.ts:42-49`) re-observed as pre-recorded; not
re-raised. It bites me harder than the incumbent, because a follow-up round in my domain writes
*attribution* facts, and those defaulting into the price column is the collapse in §3 happening
silently.

---

## 14. Bruno's voice

Right. Good news first, because there is some and I do not want to be the guy who only complains.

The opt-in asymmetry is correct. Conclusions off until you let them in, facts in until you cut them —
that is the right way round and most people get it backwards. `unknowns[].impact` telling the script
*"say 'moves with', not 'because of'"* is the best single line in this repo and it is one word away
from being my third pet peeve solved: give me *"the tokens moved to"*, never *"the money went to"*,
and I will forgive a great deal. And mandatory falsifiers on a public ledger is a genuinely lovely
pairing — my entire domain is a falsifier substrate. Anyone can go check. That is the whole appeal.

Now. The thing I actually came here to test.

I have one transaction. It is in a block. It is signed, it is hashed, it is confirmed a thousand
times over, and a stranger in another country can verify it in nine seconds without asking my
permission. That is about as measured as evidence ever gets in this business, and I get one of those
a week if I am lucky.

I also have a claim that the sending address belongs to a cluster of forty, which I built out of
co-spend heuristics and a change-address pattern and about four hours of squinting. That claim is an
inference. A decent one. Not a block.

Two claims. Same object. And the schema hands me one dropdown reading `high | medium | low`.

So I get to choose: promote the guess to the certainty of a blockchain, or demote the blockchain to
the certainty of my guess. There is no third option, because `confidenceNote` is optional free text
that nothing downstream reads, and if I split it into two facts the relationship between them
evaporates — there is no fact-to-fact edge anywhere in this model. Every arrow points up at a
conclusion. Nothing points sideways at a sibling.

And then the board files the two halves in **different columns**. Transfer to `flows`, attribution to
`actors`. Which means somebody reviewing `actors` can descope my clustering claim, walk away
satisfied, and leave a card sitting in `flows` that still says *"Cluster C moved forty thousand
tokens"* — sourced, dated, `confidence: high`, and now attached to absolutely nothing. The wound
graph cannot help because the wound graph only knows about conclusions. That is not a gap. That is a
machine for producing exactly the sentence that gets me sued, and it produces it *after* the review
step, which is the worst possible place to produce it.

And here is where it gets stupid — and yes, it is about a disclosure.

`scale_conversions`. The field whose entire documented purpose is that "a number without a comparison
is a number the script wastes". No honesty constraint. Not one. Go and read the reference notebook:
fact says *"long-term holders realised 3.67 million BTC"* — an address-cohort measurement, correctly
written, I have no complaint with the fact. Then `felt` says *"the **people** who held longest sold
most."* Then the conclusion says *"**people** who believed in it."* Then the script says it out loud.

Address, to cohort, to people, in three hops, inside the sanctioned pipeline, and the field where the
promotion happens is the one field in the schema whose job is to make a number *feel* like something.
Nobody flagged it. Nobody had to — on Bitcoin nobody is accused of anything, so the laundering is
free and invisible and it ships as the worked example. Run the identical machinery on a dead
exchange and hop two is a named human being who did not do it.

The `actors` column tells me, in writing, that an empty column means *"nobody is named — the story
has no agents."* Mate. In my field, "nobody is named" is not a gap, it is **the job**. It is what I
have instead of a legal budget. You have written the one thing that keeps me out of court into the
UI as a warning that I have done my research badly.

And criterion four is the one that actually decides this for me. `conclusions.ts` has no naming rule.
None. What it has instead is `unhinged`, defined in the file as *"a claim about MOTIVE, which is the
least verifiable kind of claim there is"* — a definition I could not improve on, immediately followed
by a shipped example that imputes motive to a named head of state about his donors' holdings, and
discharges its falsifier requirement with a test that only falsifies the *other half* of the claim.
Publish the audited reserve and the donor line survives intact. The gate is real. It is just bolted
to the wrong half of the door.

So: seven of seven columns, seven of seven engines, and I cannot write my central fact. That
combination is worth more to you than any of my complaints, because it means the fit dial you are
watching is blind to the failure mode that actually stops a domain — not "my material has nowhere to
go" but "my material goes somewhere and arrives having lost the thing that made it evidence."

Two hours? It saves me an afternoon of orientation on a job whose cost is ten hours of clustering it
does not touch, and does not know exists — the reference run researched *my domain* and never opened
a block explorer, then said so in `research_gaps` and rendered three scripts anyway. That last part
is admirable, honestly. Declaring the gap and shipping regardless is the most human thing in this
entire repository.

Fix the fact schema. Two fields and one edge: an evidence class, and a `qualifies` pointer. Everything
else on my list is a string I can argue you into changing over a beer.
