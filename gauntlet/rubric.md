# Rubric — how a Gauntlet run judges

## The finding schema

```jsonc
{
  "id": "G-<run>-<nn>",
  "creator": "public-co-fraud",
  "topic": "…",
  "area": "fraud",
  "lens": "fraud",                 // hypothesis lens the topic bound to
  "level": "L1" | "L2" | "L3",
  "targets": ["research-prompt"],  // REQUIRED, non-empty — see below
  "type": "missing-instruction | wrong-instruction | schema-gap | taxonomy-gap | quality-gap | unsafe | broken-flow",
  "dimension": "tension | evidence | dimensions | counter-case | conclusions | scriptability | time-saved | exposure",
  "severity": "blocker | major | minor | polish",   // DERIVED from impact, never picked free-hand
  "impact": { "frequency": "low|med|high",
              "reachability": "low|med|high",
              "trust_erosion": "low|med|high" },
  "title": "…",
  "expected": "what the methodic should have produced",
  "got": "what it produced",
  "evidence": ["pipeline/RESEARCH-PROMPT.md:31", "runs/…/notebook.json#facts[7]"],
  "artifact_check": "confirmed-absent | present-but-missed | present-broken | by-design | n-a",
  "verdict": "confirmed | refuted | uncertain",
  "resolution": "open | proposed | adopted | resolved-verified | by-design | accepted",
  "ceiling": "required on resolved-verified / by-design — what still can't be done",
  "recurrence": 1,
  "content_or_lens": "content | lens | undecided",   // the judge decides; the creator may argue
  "l2_priority": "what a live run must confirm (L1 findings only)"
}
```

### `targets[]` — the field that makes this a build tool

**A finding with an empty `targets[]` is not a finding.** Every complaint must name the file that
would have to change. If a Creator can't name one, the complaint belongs in their voice section,
where it is still valuable and where the judge will still read it — the voices routinely carry design
signal the findings table strips.

Valid targets: `research-prompt · notebook-schema · dimensions · conclusions · engines · tone ·
knowledge · ui`.

### `content_or_lens` — REVISED after run 1 proved the axis under-specified

Every finding is one of:
- **content** — the shared mechanism holds this, it was fed the wrong material. Fix by editing the
  domain table's rows, the column labels, the engine notes.
- **mechanism** — *(added after run 1)* the shared mechanism is wrong **for everyone**. Fix by
  changing a field, a type or a rule. `llm-research` named the gap in the original axis exactly:
  it *"has no value for 'the shared mechanism is wrong for everyone'"*, so 105 of 187 findings had
  to be filed `content` when they were nothing of the kind. **This is now the expected home for the
  majority of real findings.**
- **lens** — per-domain tailoring the shared mechanism cannot absorb. Requires the judge to name why
  content *and* a mechanism fix could not have done it.
- **undecided** — the Creator flagged it, the judge hasn't ruled.

Run 1 returned 172 content · 14 undecided · 1 lens, and the judge re-ruled the single lens filing to
mechanism — **187/0**. The lens concept survives as a category and has never yet been used. A run
where findings come back `lens` in quantity is either a genuine discovery or a primed cast, and the
judge must say which. Run 1's judge ruled *discovery, of the opposite result*, on three grounds
worth keeping as the test: the cast was blind to the hypotheses, the seats with the most to gain
argued against their own interest, and the failure signature was wrong for a tailoring problem.

## The eight dimensions

| Dimension | The question | Where it is measured |
|---|---|---|
| **tension** | Did the methodic find a real BUT, or a pile of facts joined by AND THEN? | L1 on paper, L2 in the script |
| **evidence** | **REWRITTEN — see below.** Can a fact carry what makes it evidence in this domain? | L1 |
| **dimensions** | Did the board's columns *sort* this topic? `orphans · max-column concentration` | L1, confirmed L2 |
| **counter-case** | Real steel-man or a manufactured one? | L2 (§ D-honest vs D-rigged) |
| **conclusions** | Useful leaps, checkable falsifiers, safe naming? | L2 |
| **scriptability** | Did an engine actually render this notebook into something watchable? | L2 |
| **time-saved** | Minutes vs the Creator's manual baseline, with a confidence | Both |
| **exposure** | What does being wrong cost, and did the methodic price that in? | L2 |

## The `evidence` dimension — rewritten after RETRACTION 1

**The original was scoring a file that does not apply.** It asked whether the
MEASURED·OBSERVED·INFERRED·ASSUMED ladder demotes a domain's best material. That ladder is defined
in `knowledge/README.md:32-40` as the evidence contract for claims in a `PATTERNS.md` — the *craft*
library. Grep all four tokens across `RESEARCH-PROMPT.md`, `NOTEBOOK-SCHEMA.md` and
`CRAFT-BASELINE.md`: nothing. **It never governs notebook facts.** Every one of 20 seats found this
independently; one recommended the retraction in writing.

Score these instead:

1. **What the live axis can say.** `confidence: high|medium|low` is the only instrument a notebook
   fact has, and its documented semantics are *source reliability*. Ask whether it is being made to
   answer two questions at once — *how reliable is this* and *what kind of claim is it*.
   (`conflict-osint`: *"This methodic does not know what a source is. It knows how sure you are —
   and in my beat those are barely related."*)
2. **What the fact cannot carry.** Unit, period, denominator, evidence class, subject, an
   established absence, a relation to another fact. Name what your topic needed and could not state.
3. **Whether the honest label has a field to live in.** `creator-economy`'s residue: the right rung
   existed in the craft library and had nowhere to travel to.

## Scoring the dials

Numbers, reported every run per Creator, because a dial you can watch across runs beats a verdict
you re-argue.

- **Sorting, not occupancy** — `orphans: N · max-column concentration: X%`. **Column utilisation is
  retired.** `crypto-collapse` reported `7/7 used` and then showed the number lies: `flows` had
  absorbed **77% of its labour undifferentiated**, *"and 7/7 cannot see it."* Seventeen of twenty
  seats filled 6–7 of 7, which made the dial look reassuring while 105 findings landed on the
  schema. A board's job is to **sort**, and a column holding most of the topic has not sorted it.
- **Flagged facts · unresolved conflicts · exposure class** — added after run 1. The three numbers a
  reviewer needs to triage twenty notebooks, per Bench 3.
- **Time-saved** — `~<N> min saved · low|med|high confidence` against the declared manual baseline.
  **Negative is a finding**, and its size is the argument. Run 1: 20/20 failed the acceptance bar,
  typically by 2–5×, and every seat named a *different* untouched block — which is why the aggregate
  matters more than any single figure.

Denominators stay **shared, not per-Creator** — a Creator's domain-specific needs are recorded as
*named orphans*, never as a different denominator. (Inherited scar: three uat walkers scored one
surface 8/10, 15/16 and 5/8 — three rulers, no trend, no dial.)

## Impact over severity

Rank by `frequency × reachability × trust_erosion`, not the severity word. A blocker that only bites
one exotic topic ranks below a papercut every run hits. `reachability` here means: how many of the 20
Creators' topics actually pass through this part of the methodic.

Ranking order above the arithmetic:
1. **`recurrence`** — a gap returning unchanged from a prior judge cycle
2. **convergence** — Creators from *different areas* hitting it independently
3. **voice escalation** — the first-person section indicting harder than the row scored

## Cognitive-walkthrough questions (asked at both levels)

Per topic, per phase of the methodic:
1. Will this Creator know what this phase wants from *their* topic?
2. Will they find the affordance/instruction that does it?
3. Will they connect what happened to what they wanted?
4. After it happens, do they know whether they're closer to a script?

## Refuter pass

Every finding is challenged before it reaches a headline. Default to `refuted` or `uncertain` unless
the artifact evidence holds. The specific refutations to try, in order:
- *Is this the methodic, or is it this Creator's topic being genuinely hard?*
- *Would a competent execution of the existing prompt have produced this anyway?* (L1's charitable
  reading is the failure mode — see the skill.)
- *Is the missing thing actually present somewhere the Creator didn't read?* → `present-but-missed`,
  which is a **discoverability** finding against `knowledge` or `ui`, not a gap.
- *Is this `lens` because the mechanism can't hold it, or because the content is wrong?* Default to
  `content`. The bar for `lens` is in the skill and it is deliberately high.
