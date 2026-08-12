# RECERTIFY — adoption of VERDICT.md · 2026-08-12

Written back into the **originating run's** directory; adoption has no run id of its own.

## Control verification (ADOPTION Rule 1)

Three changes were specified as expected. **Two applied. One was mis-specified by the orchestrator
and is reported as a finding rather than forced.**

### ✅ Change 1 — `f-midtier-distribute`, the false comparison · APPLIED

Two arithmetic errors in one `load_bearing: true` sentence, shipped into three scripts and feeding
`c-scarcity-not-a-floor` at `leap: near`:

> *"…about 77,800 BTC **over the same 60-day window — slightly more than the whale cohort
> absorbed**"* — while `f-whale-absorb` dates its window at **30 days**, and 77,800 is **29%** of
> 270,000, not "slightly more".

Applied to both the retyped fixture (`facts.ts`) and the run artifact (`notebook.json`). The cohort
figure is kept because it is sourced; **the comparison is gone because it was never true**, and the
window is now stated `UNRESOLVED` rather than silently picking one. The fact gains `unit: "BTC"`,
`period`, `kind: "found"`, `contests: ["f-whale-absorb"]`, and drops to `confidence: low` with a
note. `f-whale-absorb` gains its own `unit`/`period` so the two are now recomputable against each
other — which is the whole point of E4.

**This is the fact that forced `facts[].unit`/`period` and the arithmetic quality-bar row**, so
leaving it uncorrected while shipping the rule it forced would have been the worst available outcome.

### ✅ Change 3 — `c-reserve-was-the-product` · APPLIED (by Editor C)

Gains `subject: {names: "state"}`, three clauses, and a typed falsifier with
`binds: "unbuilt-status"` — **knowingly the wrong clause.** The card is deliberately left *failing*
the new `conclusionIssues` gate. A safety mechanism whose first act is to pass the exemplar that
motivated it would be theatre; the gate must be seen to fire on the real case.

### ❌ Change 2 — the two bare `AND`s · NOT APPLIED. My specification was wrong.

`ADOPTION.md` Rule 1 said the two bare `AND` links at `notebook.json:207` and `:222` *"become typed
`TRANSFER` steps if they are transfers, or gain their missing link."* Reading them, **neither is a
transfer**, and neither has a missing link:

```
BUT       authorised participants can create and short ETF shares before buying the underlying
THEREFORE the buying is lagged and partly hedged
AND       sellers at the same price level absorb what does arrive
THEREFORE inflow can be positive while price is flat
```

The `AND` is not a temporal hop. It is a **second premise**, conjoined with the first, and the two
together support the `THEREFORE`. That is valid argument structure — the thing the one law exists to
protect — being flagged by a bar that permits zero `AND`.

**The finding:** the law conflates two different `AND`s. *"AND THEN"* (temporal sequence with no
causation — the wiki-timeline defect) and *"AND ALSO"* (a co-premise) are different objects, and
`ChainConnector = BUT | THEREFORE | TRANSFER` has a slot for neither. `music-industry` found the
gap for **transfers**; the control migration finds a second gap for **conjunctions**, from the
opposite direction.

I did not force it. Merging the co-premise into the following `THEREFORE` would preserve the content
and satisfy the bar — but that is re-authoring the argument, which is a *research* act, not a
migration act, and the vocabulary decision belongs to a judge. Forcing it would be precisely the
**"extorted THEREFORE"** anti-pattern Editor A added to the schema in this same pass.

---

## New findings for the next drain

Born during adoption; the originating run's judgment already happened, so they have no other door.

### `G-CTRL-01` · The one law has no connector for a co-premise
- **targets:** `knowledge/CRAFT-BASELINE.md`, `app/_phases/_shared/notebook/types.ts`,
  `pipeline/RESEARCH-PROMPT.md`
- **type:** taxonomy-gap · **severity:** major · **content_or_lens:** mechanism
- **evidence:** `pipeline/runs/2026-08-11-.../notebook.json:207`, `:222`;
  `ChainConnector` in `types.ts`
- **expected:** a chain can state two premises supporting one conclusion.
- **got:** the only legal joins are `BUT`, `THEREFORE`, `TRANSFER`. A co-premise must masquerade as
  one of them, be merged into its neighbour, or be dropped.
- **failure scenario:** any argument with two independent causes for one effect. Both surviving
  bare `AND`s in the reference notebook are this shape, and both went unnoticed for the life of the
  artifact under a bar that permits zero.
- **verdict:** confirmed — demonstrated twice in the only run on record.
- **note:** converges with `G-L1S-MI-02` from the opposite direction. Ruth's ledger needed
  `TRANSFER`; this needs `AND-ALSO` (or the law needs to say co-premises are not adjacent beats).
  Two independent gaps in one three-value vocabulary suggests the connector set was derived from
  the beat chain and inherited by the mechanism chain without re-derivation.

### `G-CTRL-02` · The board UI has not migrated to the split `emptyMeans`
- **targets:** `ui`
- **type:** broken-flow · **severity:** minor · **content_or_lens:** content
- **evidence:** `app/_phases/research/ResearchTriageBoard.tsx`, `app/_phases/research/scope.ts`
- Editor C kept `emptyMeans` as a populated deprecated alias so the board renders unchanged, and
  flagged that `ResearchTriageBoard` should move to `emptyByOmission`/`notApplicable` + `columnsFor`,
  and that `scopeSummary`'s `byDim` will not count untagged cards until it does. **The control has
  zero untagged ids today, so nothing is currently mis-rendered** — this is debt, not a live defect.

### `G-CTRL-03` · `Mechanism.chain` and `Mechanism.steps` can drift
- **targets:** `app/_phases/_shared/notebook/types.ts`, `ui`
- **type:** schema-gap · **severity:** minor · **content_or_lens:** mechanism
- The pinned `chain: string[] | ChainStep[]` union does not compile — `sections/Argument.tsx:42`
  maps `chain` into a `(step: string)` callback. Editor A kept `chain: string[]` and added a sibling
  `steps?: ChainStep[]`, documenting "`steps` wins where both are present; anti-shape is the two
  drifting apart". **Nothing yet enforces that.** Teaching `chainLink`/`Argument.tsx` the typed form
  is what would let `chain` retire.

---

## Resolutions written back into the run

| Finding | Resolution | Ceiling |
|---|---|---|
| `G-L1-ME-01` + the E4 provenance cluster (backlog #1, **recurrence 2**) | `adopted` | `evidence_class` and plural `sources[]` exist and are *documented as required*; **nothing enforces them at write time**, and the control's own sources remain aggregator-class. The recurrence is discharged only when a run is rejected for missing a primary source. |
| The exposure/subject cluster (backlog #2, 12+ findings, 4 areas) | `adopted` | `conclusionIssues()` is **advisory** — it returns issues, it does not block. The exemplar deliberately still fails it. Nothing in the render path consumes it yet. |
| Counter-case fail-open (backlog #3) | `adopted` | The null path, `steel_man.provenance` and the `research_gaps` redefinition are prose in an instruction set. Un-enforced until a checker reads them. |
| Null reportability (backlog #4) | `adopted` | Baseline row + tension-downgrade rule are stated; no mechanism computes a baseline. |
| Mechanism evidence (backlog #5) | `partial` | `evidence[]` and `steps[]` exist; the wound graph does **not** yet traverse them, so descoping a fact still does not wound a mechanism. `G-CTRL-01` blocks clean typing of the control's own chains. |
| Unknowns split (backlog #8) | `adopted` | `Obligation` exists with an empty data home; no obligation has been authored, so the must-say half is untested. |
| Engine hazard axis (backlog #10) | `adopted` | Five of seven engines have hazard lines; A and G are **un-probed, not clean** — tracked as `Q1` in `knowledge/OPEN-QUESTIONS.md`. |
| Scale conversions (backlog #11) | `adopted` | The subject-class rule is stated in the schema; the address→"people" promotion that walked it is not blocked by anything executable. |
| Gauntlet's own instruments (backlog #12) | `adopted` | `rubric.md` rewritten (evidence dimension, dials, three-value axis), `lens-spec.md` marked, `declined.md` written, skill → v1.1 + `LESSONS.md`. One lesson recorded as a **redesign proposal, deliberately not applied**. |
| Board/UX (backlog #9) | `open` | Untouched. **Blocked on L3's missing notebook loader** (`accepted-gaps.md`), which remains finding #1 of every run. |

**The honest summary of this adoption: the methodic now *says* the right things and *enforces* almost
none of them.** Every ceiling above is a variant of the same sentence, and it is the panel's verdict
turned back on the fix — *conscientious in prose, permissive in type*. The gates exist as advisory
functions and unchecked checkboxes. Backlog #7 (the render-boundary gate) is the item that would
convert prose into enforcement, and it has not been built.

---

# L2 — hostile seats, executed · 2026-08-12

Four seats ran **real research** through the amended methodic. 34 findings; **33 `mechanism`, 1
`content`, 0 `lens`** — the third axis value carried almost the entire run, which is the clearest
vindication available of the `rubric.md` repair. Every L1 verdict improved.

| Seat | L1 → L2 | Time-saved miss | The edit it was built to test |
|---|---|---|---|
| `news-reaction` | fail → **conditional-pass** | negative → passes | **E1 works. Pressure did not survive the edit.** |
| `public-corruption` | fail → **conditional-pass** | 6h → 4.0h | `kind: absence` works; **the gate did not** |
| `conflict-osint` | fail → **partial** | 6.0× → **3.0×** | `evidence_class` solved 2 of 3 classes |
| `creator-economy` | conditional → **conditional** | 0.83% better | E3 works; **`the-number` never rendered** |

## What executing proved that reading could not

**E1 bought MORE searching, not less.** `news-reaction`: *"Because the null was cheap, I ran a second
counter-case search I would not have paid for before, and it found something."* The opposite of the
sceptical prediction, with the query on record.

**Three seats independently found defects CREATED by the adoption, all the same shape — two edits
that do not talk:**
- `creator-economy`: E3 gave the column two strings, E4 gave the fact a `kind`, so a column holding
  two `kind: absence` cards *renders with a count of 2 and never reaches its empty string*. **A new
  drain, dug by obedience.**
- `news-reaction`: Phase 1 orders derived domains and `columnsFor()` renders them, but
  `CARD_DIMENSION` is still typed to the incumbent seven and `facts[]` has no dimension field — *7
  correct empty columns, all 22 cards in Untagged.*
- `conflict-osint`: the prompt mandated `steel_man.provenance` twice while no type or schema section
  declared it. **A mandate pointing at an absent field is worse than no mandate: it reads as
  enforced.** *(Repaired during L2 — see below.)*

**The incentive moved rather than vanished.** `news-reaction`: `search_scope` records registers
*searched* and has no field for registers *not* searched — *"I had to invent `not_searched` to keep
my absence cards honest, and I only invented it because I knew I was being watched. The incentive
has moved from fabricating a counter-case to under-searching and calling it a finding."*
`creator-economy` caught itself having done exactly that at L1, and `public-corruption` was tempted
twice and refused twice — the second time only because it opened the primary document and found the
words were not in it. **"What caught it was opening the document, which is not a field."**

## Gate repair — applied during L2, verified by execution

`public-corruption` shipped past `conclusionIssues()` **three ways in four minutes, using only
fields the fix introduced**. All three were logic bugs against this file's own header doctrine
(*"rules hang on `subject`, never on `leap`"*), so they were repaired rather than filed:

1. **`clauses-undeclared`** — the compound-claim check sat inside `if (f.binds !== "whole-claim")`,
   so **declaring your clauses is what armed the rule**. Delete them, bind `"whole-claim"`, ship
   with zero issues. *Honesty was the trigger for the check.* Undeclared is no longer read as simple.
2. **`licence-invalid`** — `bought` was `restsOn.some(id => filed.has(id))`, a **membership** test:
   one filed document bought the whole card, and the demonstrated case used a judgment that
   *expressly declined the attribution it was purchasing*. Now requires a named `licensedBy`.
3. **`assertion-unlicensed`** — the cap gated on `far | unhinged` while the header says it must hang
   on `subject`. So `"the award did not comply with the applicable rule"` — `near`, every new field
   filled correctly — shipped clean. New `assertion` axis (`interpretation | legal-conclusion |
   motive | prediction`) gates legal conclusions and motive claims **at any leap, including `near`**.

Verified by re-running the seat's own three attack cases: all now caught; the honest filing still
caught for the right reasons.

**Ceilings that remain, unfixed and stated:** `conclusionIssues` still has **zero callers**, and
`NOTEBOOK-SCHEMA.md` has no `conclusions[]` field — *a research run cannot reach the gate at all*.
The repair makes the gate correct; it does not make it reachable. That is backlog #7 and it is now
the single highest-value item in the repo.

## New findings for the next drain — L2 additions

- **`G-L2-CO-02` (blocker)** — `evidence_class` is on the *source*; there is no relation *between*
  sources, so independence is unexpressible. An institute's analysis drawn exclusively from one
  belligerent's daily reports is *"two sources by every count the schema can perform and one
  observation."* Fixing the plural-source scar is what made this visible — **the first thing a
  countable set did was produce a wrong count.**
- **Missing enum value: `researcher-verified`** — authenticated by the author against independent
  material, re-checkable by the reader. `protected` already ships as its *un-citable* sibling:
  **the enum has the exception and not the rule.**
- **`facts[].subject` is stuffed by construction** — 22/22 populated with variants of "no unit or
  individual", consumed by nothing, and **name-colliding with the typed `Conclusion.subject` the
  gate actually reads**. *"Filled correctly and pointlessly, which is quieter than guessing."*
- **An absence has no valence.** `public-corruption`'s most load-bearing absence *exonerates* —
  identical shape, opposite meaning, and nothing records which way a hole points.
- **`kind` does not leave the notebook** — nothing reads `Fact.kind` in the render path, so
  `utterance` semantics must be re-typed by hand as an obligation.
- **Hedges: `recurrence: 3`**, and escalated — moving epistemic marking out of hedges and into
  structure just relocates the same vulnerability into the same position in the sentence.
- **E7's arithmetic row earned its keep**, twice: it caught two of `public-corruption`'s own errors,
  and made `conflict-osint` recompute a universally-quoted 500:1 cost ratio that **does not
  reproduce from the component prices printed beside it**. *"First time in two levels a rule found
  something I hadn't."*
