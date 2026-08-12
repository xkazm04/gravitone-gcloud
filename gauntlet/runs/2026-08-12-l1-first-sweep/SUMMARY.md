# SUMMARY — L1 first sweep · 2026-08-12

20 Creators · 20 L1 dry fits · **187 findings** · 0 with empty `targets[]` · Opus throughout.

| | |
|---|---|
| Severity | 24 blocker · 117 major · 44 minor · 2 polish |
| Refuter | 168 confirmed · 19 uncertain |
| **Content vs lens** | **172 content · 14 undecided · 1 lens** |
| Verdicts | 9 `L1-fail` · 11 `L1-conditional` · **0 `L1-pass`** |
| Time-saved | **failed the Creator's acceptance bar 20/20**, typically by 2–5× |

## The headline: the lens question was aimed at the wrong file

The run was designed to answer *"which domains need their own lens?"* Twenty Creators answered
something else. Indictments by artifact:

```
105  notebook-schema      ← the answer
 59  research-prompt
 46  dimensions           ← where I looked
 29  conclusions
 24  engines
 15  knowledge
 10  ui
  2  tone
```

**One lens finding out of 187**, and the seat that filed it (`public-co-fraud`) attached its own
ceiling. Several seats argued *against their own interest* — `bill-analysis` and `devtools-business`
both had textbook lens claims and filed `undecided` with an explicit note that no lens could fix a
card-to-dimension cardinality; `music-industry` said it had "the most obvious lens case in the room"
and filed everything `content`.

**The tailoring layer is not the problem. The notebook is.** A lens supplies columns, rows and
policies — and 105 findings say the defect is that a *fact* cannot carry what these topics are made
of. Content packs remain worth writing; they were simply never the binding constraint.

## Four convergences — different areas, no contact, same defect

Ranked by convergence, per `rubric.md`. Each is the judge's evidence for a mechanism-level fix.

### 1 · Exposure is not on any axis the methodic measures — 5 seats, 3 areas
`public-corruption` states it cleanest: **the leap ladder measures distance from the *evidence*, not
distance from an *accusation*, and those are orthogonal.** "The award did not comply with the
applicable rule" is a `near` leap *and* a legal conclusion reserved to a body empowered to make it —
so the ladder waves through the domain's most dangerous sentence at the tier with the least
scrutiny. `interface Conclusion` has no field naming **who the claim is about**, so no rule can ever
fire on identifiability.

The orchestrator hypothesised the hazard was `unhinged`. Five seats found it everywhere *except*
`unhinged` — because that is the only tier anyone inspects (`security-breach`: `far` "has ample room
to attribute and carries no badge at all"). All three safeguards were credited by name — opt-in
asymmetry, mandatory falsifier, `hottest` marking — and the finding survives all three, because they
are calibrated for a claim's **truth-status** while exposure is a function of its **subject**.

Falsifier evasion was demonstrated four times independently on the shipped exemplar: the claim is
intent (*"was never meant to be built"*), the falsifier is a fact (*"a funded, audited reserve"*).
Build it late and the fact falsifies while the intent claim walks.

### 2 · The counter-case requirement fails open, and did so on our own artifact — 4 seats
Mandated four times, no null branch, and the only disclosure surface is `research_gaps`, defined as
counter-arguments *"you did not chase"* — recording **an absence in the world as an omission by the
researcher.** Proven, not predicted, on the reference run: it never searched the cycle argument
(`notebook.json:432`), built the adjudication's premise-challenging Candidate 1 on it
(`script--adjudication.md:36-52`), and **ticked its own D-honesty box twice** (`:132`).
`steel_man` has no provenance field, so nothing downstream can tell.

`software-eng`: *"A hard requirement with no check is a comment, and this one already failed open on
the artifact held up as 'what it worked looks like.'"*

`public-co-fraud` found the structural cause: `counter-case` is defined **epistemically** but wired
to `steel_man`, defined **positionally** as "the strongest case against the verdict" — so a
right-of-reply can only enter as the thing two engines exist to overcome. The escape hatch,
`counter_positions_to_state_fairly[]`, is declared with no shape and absent from the consumed-by
table — meaning, by the schema's own principle, it is not part of the notebook.

### 3 · The methodic can find a story and cannot report a null — 4 seats
- `electoral`: nothing establishes an effect is outside normal variation before explaining it. The
  reference scores `tension: high` over a ~50% drawdown while the script rendered *from that
  notebook* says the asset "falls fifty to eighty percent" every cycle. The disproving fact sat in
  `counter_positions_to_state_fairly[0]` and changed nothing — no rule connects it to
  `tension.strength`, which scores properties of the **belief**, never the magnitude of the deviation.
- `macro-economy`: *"a notebook with no decomposition passes every box and arrives looking finished."*
- `llm-research`: found the mechanism — `NOTEBOOK-SCHEMA.md:29-31` mandates the verdict be written
  **during research** while `ENGINES.md:91-93` demands candidates be able to beat the author's prior.
  Two files, one repo, contradicting each other, neither citing the other. **D-rigged is the default
  path out of a conforming notebook.** And Parallel Case — per `ENGINES.md:61-63` the only engine
  that renders a non-takedown — is unreachable, because `analogy_candidates[]` is one line while the
  exemplar it was measured from spends 67 of 114 seconds on the familiar half.
- `electoral`: the counter-case *"can speak and it cannot win"* — if it defeats the tension the run
  terminates.

### 4 · Provenance is missing exactly where the claim is strongest — 5 seats
`mechanisms[]` carries no source, no date, no confidence, **no fact ids** — while `facts[]` mandates
all three under *"Every fact dated and sourced. No exceptions"*, `reversals[]` has `evidence[]`, and
`conclusions` has `restsOn`. The wound graph cannot see mechanisms at all. The exemplar's three
mechanisms are uncited, **including the one annotated "This is the video. Everything else is
evidence for it."**

`devtools-business`: the *reasoned* layer is traceable and the *researched* layer is not — backwards.

## What a fact cannot carry (the 105)

Named independently, by seats that never met:

| Missing | Seats |
|---|---|
| unit · period (distinct from `as_of` staleness) | `hardware-silicon`, `music-industry`, `consumer-scam` |
| a denominator, structurally | `consumer-scam`, `macro-economy` |
| evidence class / provenance, separate from `confidence` | `conflict-osint`, `crypto-collapse`, `security-breach`, `public-co-fraud` |
| an established **absence** as affirmative material | `public-corruption`, `consumer-scam` |
| fact↔fact relations — `contests`, sequence, conflict | `sanctions-trade`, `game-postmortem`, `security-breach` |
| two axes per card (`CARD_DIMENSION` is `Record<string, DimensionId>`) | `bill-analysis`, `devtools-business`, `crypto-collapse` |
| source **plurality** (`source` is singular; run 1 comma-joined three) | `software-eng` |

`confidence: high|medium|low` is being asked to answer both *how reliable is this* and *what kind of
claim is it*. `conflict-osint`: **"This methodic does not know what a source is. It knows how sure
you are — and in my beat those are barely related."**

## Verified defects in the shipped reference run

Not hypotheses. Each cited to a line, one arithmetically re-verified by the orchestrator.

1. **`f-midtier-distribute` is arithmetically false.** 77,800 BTC called *"slightly more than"* the
   270,000 BTC of `f-whale-absorb`, over *"the same 60-day window"* when the other fact says 30 days.
   Both `load_bearing: true`; feeds `c-scarcity-not-a-floor` at `leap: "near"`; three scripts rendered
   off it. *(Verified directly from `notebook.json`.)* — `hardware-silicon`
2. **The counter-case was never searched, and the adjudication was built on it anyway.** — 4 seats
3. **Two bare `AND` links inside `mechanisms[].chain`** (`notebook.json:207`, `:222`) under a quality
   bar that permits zero. — `music-industry`
4. **A tone profile stripped 5 of 9 hedges** — 56% of the script's epistemic marking — from an
   already-approved chain with no dial set. Fix drafted in `TONE-TEST.md:287-297`, never adopted.
   *"Tone may never change the beat chain" is satisfied while this happens, because hedges aren't
   beats.* — `conflict-osint`
5. **Qualifiers vanish in the felt conversion**: `"in risk-on conditions"` and `"(~2% of supply)"`
   present in the notebook, absent from the rendered script. — `consumer-scam`
6. **A class-promotion path from addresses to intent**: `f-lth-distribution` (an address cohort) →
   `felt` "the **people** who held longest" → `c-borrowed-prosperity` "people who believed in it" →
   spoken aloud. Three hops, no flag, sanctioned pipeline. — `crypto-collapse`
7. **`unknowns[].impact` binds nothing** — the only row in the consumed-by table with no consumer, in
   a document whose stated principle is that a field nothing consumes does not belong. The one run on
   record violated `u-yield-causality` and was caught by an agent from another step, not by any of
   its twelve self-checks. — `box-office`

## Strengths — guardrails, not compliments

Phrase every proposed edit as preserving these:
- **Opt-in asymmetry survived unchallenged.** Not one seat proposed conclusions default in.
- **The falsifier requirement is real and was met 7/7 unprompted** by the worked run
  (`public-co-fraud`, from the most hostile seat). The defect is the *type*, not the discipline.
- **`unknowns[].impact` as prohibition is the right idea** — `box-office` wants it to *bind*, not go.
- **`emptyMeans` is a genuinely good invention** — every complaint was about a specific sentence
  being wrong, never about the field existing.
- **`politics` and `flows` transfer better than expected.** Four seats said `politics` — "was it
  actually implemented" — is better drafted for their beat than for the Bitcoin run it came from.
- **The evidence ladder is well-specified** — it simply governs `PATTERNS.md`, not notebooks.
- **`DIRECTOR-DIMENSION.md` already invented `negates: true`** for absences in the visual layer. The
  design won that argument one layer too late.

## Honest ceilings

- **L1 reads charitably** — and `software-eng` showed the defence is dead: the reference run failed
  open on a requirement L1 could only read as satisfied. Several conditional verdicts hinge on
  questions only L2 can answer.
- **No L2 was run.** Every time-saved figure is an estimate of the *methodic*, not a measurement of a
  product; no real research was performed.
- **L3 remains blocked** — no loader from a produced notebook to the board (`accepted-gaps.md`).
- **Two seats disclosed contamination**: repo-wide greps surfaced incidental lines of `lens-spec.md`
  in tool output. Neither opened it, **both reached conclusions contradicting the leaked lines**, and
  both recorded it unprompted. Discount accordingly; the direction of the error favours the run.

## Methodology lessons — against `/gauntlet` itself

1. **The orchestrator's leads were wrong 3 of 4, and the labelling contained it.** Lead #2 was
   retracted mid-run after the first walker checked instead of confirming. Every seat independently
   found the MEASURED·OBSERVED·INFERRED·ASSUMED ladder governs craft claims and never touches
   notebook facts — one recommended the retraction in writing. `gauntlet/rubric.md`'s `evidence`
   dimension is scoring a file that does not apply and must be rewritten.
2. **Column utilisation is a bad dial and must be replaced.** `crypto-collapse` reported `7/7` and
   then said the number lies: `flows` absorbed 77% of its labour undifferentiated, *"and 7/7 cannot
   see it."* Occupancy is not sorting. Replace with **orphan count + max-column concentration**.
3. **`the-number` is both a domain-specific column and `DEFAULT_DIMENSION`.** `creator-economy`:
   *"The alarm is wired to the drain — it can never be empty, therefore it can never mean anything."*
   Distinct from `G-000`, which is about cards landing in the wrong column.
4. **The hostile seats paid for themselves and then refuted their own premises.** `news-reaction`
   killed the counter-case fallback; `creator-economy` — the seat built to prove the ladder had no
   rung for interpretive evidence — found OBSERVED fits its method exactly, hunted for a downstream
   rule privileging MEASURED, and **reported finding none.**
5. **Lens attribution should be dropped or re-derived.** `news-reaction`: the axis that predicts fit
   is **evidence age**, not subject area. The four candidate lenses may be carved on the wrong
   dimension entirely — a question for the judge, not for me.
