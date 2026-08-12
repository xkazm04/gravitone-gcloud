# Lens spec — the tailoring layer

> **STATUS AFTER RUN 1 (2026-08-12): every area lens below was DECLINED by the judge.** They are
> kept, unedited, as the record of what was hypothesised and refuted — a declined lens must not
> resurface as a fresh idea without new evidence, and that is only enforceable if the original
> argument stays readable. Do not treat anything under "HYPOTHESIS" as live design.
>
> **The ruling:** 187 findings, 0 lens. The tailoring layer was the wrong place to look — the
> defects are in what a `fact`, a `mechanism` and a `conclusion` can carry, and no lens slot reaches
> those. Full reasoning and per-area declines with their ceilings:
> `gauntlet/runs/2026-08-12-l1-first-sweep/LENSES.md`.
>
> **What replaces it** (judge's ruling, § "Consequence for this document"): the next revision of
> this file should not be four area packs. It should be —
>
> 1. **Content packs any topic can adopt** — derived Phase-1 domain tables, column purpose /
>    `emptyByOmission` / `notApplicable` rewordings, engine notes. These ride on VERDICT E3, which
>    makes `DIMENSIONS` per-topic data instead of one topic's answer frozen as a closed union.
>    Worth writing; never the binding constraint.
> 2. **Two per-run topic DECLARATIONS in the shared mechanism**, not packs:
>    - **evidence maturity** — `fresh | developing | settled | accruing`, gating existing mandates.
>      On `fresh`, completeness mandates become record-the-absence mandates and a notebook reporting
>      four dated absences **passes**. On `accruing`, `matures[]` activates.
>      *Ceiling: does not remove fabrication pressure at 11:40 — only E1's null path does.*
>    - **subject exposure** — the `subject` field and its keyed rules on `Conclusion` (VERDICT E6).
>      *Ceiling: does not price collateral subjects (a named source inside an unnamed story), which
>      no artifact in run 1 tested. L2 work.*
>
> Both axes were discovered by seats arguing against their own interest: `news-reaction` refuted its
> own lens-flattering 3/7 score (*"if the judge draws a lens boundary from my numbers, it should
> consider drawing it around freshness"*), and the opposite end of the same axis surfaced in a
> different area entirely (`box-office`'s evidence that **accrues**).
>
> **The one reopening clause:** per-area policy *constants* (e.g. a stricter leap cap for fraud) are
> admissible later, but only with L2 evidence of a concrete case where the subject-keyed shared rule
> is demonstrably miscalibrated for one area. Without that finding id, the fraud decline stands.

---

> **THE CAST DOES NOT READ THIS FILE BEFORE L1.** Every lens below is a HYPOTHESIS written by the
> orchestrator from a skim, and a Creator who reads it will find what it told them to find. That is
> the exact confirmation bias parallel dispatch was bought to avoid. Show it to the judge, after.

## What a Lens is

A **pack of content for the existing mechanism**, not a fork of it. The pipeline stays one pipeline:
topic → search domains → notebook → columns → scope → engine → script. A lens swaps *what goes in
each slot*.

```yaml
lens: <id>
status: hypothesis | adopted | declined
search-domains:     # the Phase-1 table rows in RESEARCH-PROMPT.md
  - { row: "…", ask: "…" }
dimensions:         # the board columns — id, label, purpose, emptyMeans
  - { id: …, label: …, purpose: …, emptyMeans: … }
evidence-floor:     # where the ladder realistically starts in this domain
engine-affinity:    # which engines render this material; which actively mislead
conclusion-policy:  # max leap, falsifier standard, naming rules
exposure-class:     # what being wrong costs
ceiling:            # what this lens still will not handle
justified-by:       # the finding id the shared mechanism COULD NOT hold (required to adopt)
```

## THE LENS BAR

A lens is justified **only** by a finding the shared mechanism *cannot* hold — never by one it holds
awkwardly, and never by a Creator's preference.

- "My domain would prefer different column names" → **content**. Edit the labels.
- "My domain has no macro column" → **content**. An empty column with an honest `emptyMeans` is
  working as designed; that is what `emptyMeans` is for.
- "My domain's best evidence never reaches MEASURED, so every rule that privileges MEASURED demotes
  my strongest material" → **lens**. The ladder is a mechanism.
- "My domain's conclusions name living people, and the `unhinged` leap tier is legally actionable"
  → **lens**. The leap ladder is a mechanism.

Honest expectation, stated up front so the run can disconfirm it: **of the four candidate lenses
below, roughly two should survive.** A run that adopts all four almost certainly primed its cast.

---

## `market` — the incumbent (status: adopted, by construction)

The methodic as it stands, derived from `why-bitcoin-price-does-not-rise`. Its seven dimensions live
in `app/_phases/_shared/notebook/dimensions.ts`; its search domains are the Phase-1 table in
`pipeline/RESEARCH-PROMPT.md`.

**It is not neutral, and every adoption must prove it stayed intact.** Re-running the Bitcoin topic
after any lens work must produce the same notebook. A lens change that moves the incumbent's output
is a regression.

Known incumbent defect, pre-recorded (`dimensions.ts:42-49`): follow-up facts with no `CARD_DIMENSION`
entry fall through `?? DEFAULT_DIMENSION` into **the-number**, where a reviewer looking for the demand
story will never find them. Three facts from follow-up round 1 did exactly this. Any lens work must
not deepen a silent fallback — an untagged card should surface as untagged.

---

## `geopolitics` — HYPOTHESIS · **DECLINED run 1** (collapse refuted 5/6 seats)

**The predicted failure: column collapse.** In a market topic, `politics` is one causal domain among
seven. In a geopolitics topic it is the *substrate* — sanctions, bills, conflicts and elections are
all politics, so the column absorbs most cards and the board stops sorting anything. The dial to
watch is column utilisation: if three geopolitics Creators land `politics ≥ 50%` of cards with 2+
columns empty, the board isn't tailored to them, it's collapsed under them.

- **`the-number` may have no referent.** "What the price did" has no analogue in "what the bill
  obliges". Candidate replacement: *The claim under dispute* — the specific contested proposition,
  stated precisely enough to be wrong.
- **`flows` → implementation & enforcement.** The geopolitical equivalent of plumbing is whether a
  declared policy was actually carried out. The Bitcoin run already found this shape (`f-sbr-unbuilt`
  — a reserve announced and never built), which is weak evidence the mechanism generalises.
- **`macro` likely empty**, and honestly so.
- **Evidence floor: OBSERVED.** Much geopolitical material is reported rather than measured, and
  primary documents are often translations or leaks.
- **Engine affinity:** Adjudication and Parallel Case; Reversal Chain risks reading as a partisan
  reveal. Anchor Ladder is dangerous — it invites a numeric frame onto material that has no numbers.
- **Exposure class: state actors and named officials.** Being wrong is a correction, occasionally a
  visa problem, rarely a lawsuit.
- **`news-reaction` breaks Phase 1's last row.** A topic 48 hours old has no counter-case literature
  to find, so "search explicitly for the strongest argument that nothing unusual is happening"
  returns nothing — and the prompt calls that row not-optional. Either the prompt needs a
  *construct-the-steel-man* fallback, or fast-turnaround topics are out of scope. That is a
  `research-prompt` finding either way and it is the sharpest thing this area will produce.

## `tech` — HYPOTHESIS · **DECLINED run 1** (premise dead: the ladder never touches notebooks)

Predicted to fit best, because tech topics are structurally close to market topics: there are
numbers, mechanisms, vendors, and a counter-case that genuinely exists.

- Rename `flows` → *how it actually works*; `the-number` → *the measured claim* (benchmark, adoption,
  latency). `macro` and `politics` mostly empty and honestly so.
- **The one real hole is the evidence ladder.** Software's dominant evidence is *widely-reported
  practitioner experience* — "everyone who ran this at scale hit the same wall". That is not
  MEASURED, it is not one person's OBSERVED, and calling it INFERRED demotes the single most
  load-bearing kind of claim in the domain. If two of the five tech Creators independently hit this,
  it becomes a ladder finding — and a ladder finding is a **mechanism** finding, which is how a
  content-shaped area can still earn a lens.
- **Engine affinity:** Effort/Payoff Gap and Reversal Chain both render well. Briefing is the trap —
  it produces competent unwatchable explainer.
- **Exposure: low**, except `security-breach`, where naming an unconfirmed attacker is a real hazard.

## `fraud` — HYPOTHESIS · **DECLINED run 1** — both claims CONFIRMED and re-ruled as shared mechanism

Two mechanism-level problems, not content problems:

1. **`counter-case` is doing two jobs and must split.** "The strongest argument that nothing unusual
   is happening" and "the accused's stated position" are *different things*, and collapsing them is
   a fairness failure with legal weight — it lets a right-of-reply be scored as a weak steel-man and
   knocked down. Candidate: keep `counter-case`, add **`right-of-reply`** as its own required column
   whose `emptyMeans` is *"nobody accused has been quoted — this is not publishable"*.
2. **The leap ladder is unsafe as written.** `app/_phases/_shared/notebook/conclusions.ts` offers `near | moderate | far |
   unhinged`, and the hottest-take tier explicitly speculates about *motive*. About a living named
   person, "speculation about motive, offered as speculation" is defamation-shaped regardless of the
   badge. The lens must **cap the leap** when a conclusion names an identifiable person, and require
   the falsifier to be a *document that could exist* (a restatement, a filing, a verdict) rather than
   a state of mind.

Both are code, not content. If L2 confirms them, this lens is justified.

- **`flows` fits better here than anywhere** — follow-the-money is literally the column.
- **Evidence floor: OBSERVED**, often a single filing or leaked document; `MEASURED` is rare and
  `ASSUMED` is where the whole domain wants to live and must not.
- **Engine affinity:** Adjudication, run *honest* — the D-rigged tells in `knowledge/ENGINES.md` are
  the difference between an investigation and a smear, and this is the area where that distinction
  stops being craft advice and becomes liability.
- **Exposure class: named living people, litigious.** Highest in the cast.

## `entertainment` — HYPOTHESIS · **DECLINED run 1** (the READ rung duplicates OBSERVED)

- Columns mostly fit for film/games (`the-number` = box office / units; `actors` = studios and
  publishers), and mostly *don't* for the creator-economy seat, whose topic has **no numbers at all**.
  That seat is the cast's purest test of whether an unanchored topic can survive a methodic whose
  first column is a number.
- **The real hole: the ladder has no interpretive rung.** The core evidence of an entertainment essay
  is *the work itself* — "the second act spends forty minutes on a subplot the ending doesn't need".
  That is not measured, observed, inferred or assumed; it is **read**, and it is checkable by anyone
  who watches the thing, which makes it stronger than INFERRED and unlike anything on the ladder.
  Candidate rung: **READ** — *verifiable by examining the work, not by a source*.
- **Engine affinity:** Effort/Payoff Gap and Parallel Case. Adjudication mostly rigged here by
  default, because the "defence" of a creative failure is rarely articulated by anyone.
- **Exposure: low**, but the `music-industry` seat inverts it — per-stream payout claims are the most
  aggressively corrected numbers in the entire cast.

---

## Declines

Written by `/gauntlet adopt`. A declined lens is recorded with the request, the evidence, and the
reason — so it cannot return next quarter as a fresh idea without new evidence. See
`gauntlet/declined.md`.
