# NOTES — L2 empirical, `public-corruption` · Agata Wiśniewska

What the run did, what it could not find, and what it had to invent.

---

## Scope, stated before anything else

The deliverable is **a test of the methodic**, not an investigation. The matter chosen —
the UK COVID-19 PPE "high priority lane" — was chosen *because* it is finished: a High
Court judgment, two reports of the Comptroller and Auditor General, and a parliamentary
committee. Every finding of unlawfulness in the notebook is quoted from the body that
made it. **No claim about motive is made about any person or body.** The only living
person named is named by quoting his own published statement.

I want it on the record that choosing an already-adjudicated matter makes this the
**friendliest possible instance of my beat**, and that it distorts one number badly —
see *Time-saved*, below.

---

## What the run did

**Phase 0.** Prior written before the first search, preserved verbatim at `PRIOR.txt` and
copied into the notebook. Called at Phase 6 as **mirror on the frame, discovery on the
polarity** — the frame came back exactly as predicted, and the thing I did not predict
(the most load-bearing absence in the record runs *the other way*) changed the piece.

**Phase 1.** 5–7 domains derived first and recorded in `domains[]`, with the mandatory
counter-case and baseline rows. **7 web searches** (budget 4–8), **6 fetches**, and
3 primary documents read in full from their PDFs:

| Document | Pages | Read |
|---|---|---|
| NAO, *Investigation into government procurement during the COVID-19 pandemic*, HC 959, 26 Nov 2020 | 48 | in full, text-extracted |
| *R (Good Law Project & EveryDoctor) v SSHSC* [2022] EWHC 46 (TCC), O'Farrell J, 12 Jan 2022 | 125 | in full, paras 396–403 and 509–515 verbatim |
| NAO, *Lessons learned: competition in public procurement*, HC 1664, 19 Jul 2023 | 54 | in full, text-extracted |

`WebFetch` cannot read a PDF — it returns the compressed object stream and the summarising
model correctly refuses to quote from it. All three primaries were recovered by extracting
text from the saved binary locally. **Worth recording as a tooling note: a methodic that
demands primary sources, in a domain whose primary sources are all PDFs, is one broken
fetch away from an all-aggregator notebook.**

**Phases 2–9** executed as written. 28 facts, 2 mechanisms with typed `steps[]`, 2
reversals, a found steel-man, 3 counter-positions, 4 unknowns, 5 obligations, 4 scale
conversions, 7 engine fits with hazard lines, and 8 research gaps.

**The tension was downgraded**, as Phase 2 requires and names the mechanism for: `high` →
`moderate`, because the steel-man survives Phase 6. `why_it_is_a_tension` says which
counter did it. That rule fired correctly and I would not have applied it unprompted.

---

## The gate, run for real

`conclusionIssues()` compiled out of `app/_phases/_shared/notebook/conclusions.ts` and run
against eight cards — the two I would publish, the dangerous card in four variants, and two
controls. Harness and output preserved; results reproduced in the report.

The short version: **the two cards I would publish pass, and so does the card that must
never be published.**

---

## What it could not find

**The baseline. Twice.** Two of seven searches went to the baseline row and both failed to
produce a comparable-basis prior distribution for non-competitive award rates. The nearest
published figure (NAO HC 1664: 63% of 16,000 major-department contracts competed in 2021–22)
is a different period, a different population and a different unit of count — and the same
report **expressly excludes urgent pandemic contracts** from its analysis. So the row is
recorded with its non-comparability, and `tension.normal_range` says `UNRESOLVED` rather
than picking a direction.

**This is the finding I was asked to watch for, and it nearly went the other way.** With
`kind: "absence"` newly available, the move was right there: *"no comparable baseline for
emergency direct-award rates has been published — established absence."* It would have
looked rigorous. It would have been a lie about my own effort, dressed in the new field's
authority. I did not search a third time. I did not go to Contracts Finder or Find a Tender
directly. I did not read the pre-2020 procurement literature. **That is `research_gaps[0]`,
and the new field made it harder to write honestly, not easier.**

**And the near-miss that actually frightened me.** A search summary asserted that government
*"does not measure how much of public procurement is competitively tendered"*. That is an
absence, attributed to an empowered body, exactly the shape `kind: "absence"` was built for
— and it would have been the best sentence in the piece. I grepped the primary report for
`does not measure` and `not measure`. **Nothing.** HC 1664 in fact describes the Cabinet
Office estimating competition from quarterly departmental aggregates. The aggregator's
paraphrase was wrong, and it was wrong in the direction that flattered my thesis.

Recorded as `research_gaps[1]`. The methodic did not catch this — grepping the primary did.
Nothing in the quality bar requires an absence's *source* to be read rather than restated,
which is the specific thing that would have caught it.

---

## What it had to invent

**Nothing factual.** No figure, source, quotation, paragraph number or date in
`notebook.json` was invented. Every arithmetic claim was computed, not estimated:

- `47/493 = 9.53%`, `104/14,892 = 0.698%`, ratio `13.65`. Both counts share one basis
  (suppliers *processed*), one period and one publisher, so the comparison is recomputable
  from the fields. This is the E4 rule doing exactly what it was written for.
- `100 − 55 − 25 = 20`. The two published transparency percentages do **not** partition
  the set; the missing fifth is "published, but late". A script that spoke the two figures
  as a partition would be wrong, and nothing but arithmetic catches it.
- `31 Jul 2020 → 10 Nov 2020 = 102 days`. **I first wrote "five and a half months" in a
  `scale_conversion` and the recomputation caught it.** Three and a half. My own error, in
  my own felt version, found by the rule the crypto scar forced. Recorded because a rule
  that only ever catches other people's mistakes is a rule nobody has tested.
- `18,000/8,600 = 2.09`, stated as an **upper bound** because the denominator is published
  as "over 8,600". A mean over an open-ended count is not a figure.

**Three structural things had to be invented because the schema has no home for them**, and
each is a finding:

1. **`conclusions[]` on the notebook.** `NOTEBOOK-SCHEMA.md` has no such field — conclusions
   live in a TypeScript fixture. I added the array anyway, because otherwise a research run
   cannot hand a conclusion to the exposure gate at all. (`G-L2-PC-04`)
2. **`approach_status` and `must_not_descope` on `counter_positions_to_state_fairly[]`.**
   The quality bar says the approach card "is the one card the board may not descope"; no
   field says so. (`G-L2-PC-05`)
3. **`gate_result` on each conclusion.** Nowhere to record that a card was run against the
   gate and what it said.

---

## Register discipline, since it is my seat's whole job

Every claim in the notebook was checked against a three-way register test before it was
written: **descriptive** ("due diligence was carried out at the end of June for contracts
awarded in April"), **normative** ("regulation 84 required a record"), **adjudicative**
("operation of the lane was in breach of the obligation of equal treatment"). The schema
has no field for this; it was done by hand, in `note` fields, four times.

The one adjudicative claim in the notebook is quoted from the judgment. The one normative
claim rests on a cited regulation. Everything else is descriptive. That took about an hour
and nothing in the methodic asked for it or would have noticed its absence.
