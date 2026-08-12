# The engine catalogue

**Cross-template.** An engine is the thing that makes a viewer want the next beat. It is the first
decision of any script and it does not belong to a duration — a Reversal Chain is a Reversal Chain at
30 seconds and at 18 minutes; what changes is how many turns fit.

Read [`CRAFT-BASELINE.md`](CRAFT-BASELINE.md) first. Each engine below names the **viewer's pleasure**,
because that is what actually distinguishes them; two engines can share a subject and produce
completely different videos.

**n=10 videos across 6 channels**, each read in full. Every engine still has 1–3 witnesses; this
catalogue is open, not settled.

**The corpus window — state it wherever a MEASURED figure below is used.** The dated sources publish
between **2018-02-23** (PolyMatter *Apple*) and **2026-08-10** (Economics Explained *North Korea*):
**eight years and five months**, pooled, with no weighting by vintage. Three of the ten carry **no
`published:` date at all** — `fireship--big-o-cards`, `fireship--rubber-duck`,
`polymatter--not-target` — and those three are the *only* witnesses for engines **F**, **B**'s short
half and **G**. So the two engines whose entries are stamped MEASURED at the second (F's 57s ladder,
G's beat order) rest on sources the library cannot date. Every MEASURED number in this file is a
count over that pooled window, not a current-practice measurement, and it may not be quoted as one.
*(OBSERVED · the `published:` front-matter of `templates/*/steps/01-script/sources/*.md`, read
2026-08-12. Forced by `creator-economy`: the library demands a window of everyone else's numbers and
pooled eight years of its own without one.)*

| Engine | Viewer's pleasure | Witnesses |
|---|---|---|
| **A · Reversal Chain** | being corrected | Economics Explained (17:53) · PolyMatter (8:04) · MinutePhysics (1:40) |
| **B · Effort/Payoff Gap** | the disproportion between labour and reward | Fireship *100 Seconds* (2:08) · Fireship *rubber duck* (0:40) |
| **C · Parallel Case** | pattern recognition | MinuteEarth (2:29) |
| **D · Adjudication** | watching a question get settled | Basic Logic (5:01) |
| **E · Briefing** | being oriented on something new | Fireship *Code Report* (4:40) |
| **F · Anchor Ladder** | one idea compounding | Fireship *Big O* (0:57) |
| **G · Paradox Teaser** | a contradiction that must resolve | PolyMatter *Target* (0:53) |

---

## Hazard — the second axis

Until now this catalogue asked one question of an engine: **does it fit?** It never asked **what a
wrong render costs.** Those are different questions, and an engine can score high on the first while
the answer to the second is *a defamation claim*, *a working exploit*, or *a confident video built
from a rule and no facts*.

**Fit and hazard are orthogonal.** Hazard is not low fit, and a hazard note is not a veto:

- **Fit** is a property of the *material* — does the shape the engine needs exist in this notebook.
- **Hazard** is a property of the *render on this subject* — what the finished video asserts about
  the world, and about whom, if the fit was right and the material was thin or the subject was a
  person. The most dangerous cell is **high fit, high hazard**: the engine snaps on cleanly, the
  script reads well, and the damage is in what the shape *implies* rather than in any sentence.

`engine_fit[]` carries this as `hazard?: string` (the field is defined in
`app/_phases/_shared/notebook/types.ts` — see `ADOPTION.md` § *Canonical shape 5*). One free-text
line: what a wrong render of *this* engine on *this* subject would cost. Empty means "assessed, none
found" — it is not a required ceremony, and it is not a fit downgrade. An engine may be
`fit: strong, recommended: true` **and** carry a hazard line; that pair is the whole point of the
axis, and averaging it back into one scalar is the defect the axis exists to repair.

INFERRED · Five L1 seats across four domains produced structurally excellent engine choices they
then had to reject on grounds `fit` could not express (`G-L1-BILL-09` — *the catalogue never asks
what a wrong render costs*; `G-L1SW-SB-08`; `…consumer-scam-06` — *"structurally excellent, tonally
disqualifying"*; `G-L1-BOX-07`; `G-L1-NR-07`). Rests on: the per-engine hazard lines below, each
attributed to the seat that forced it.

ASSUMED · **The hazard list below is not complete.** It is the set surfaced by one L1 sweep over
twenty domains; nobody has walked the seven engines against a domain list built to find hazards.
Owed: an `OPEN-QUESTIONS.md` entry naming the sweep that would settle whether A and G are genuinely
hazard-free or merely un-probed.

---

## A · Reversal Chain

> Claim → evidence → **but here's why that's wrong** → **but here's why that objection is wrong** →
> honest synthesis → reframe

The most versatile engine, and the only one witnessed at three lengths. Use when the idea contains **a
claim a reasonable person could dispute**.

Its load-bearing move is the **self-attack**: having proved something, the script turns on its own
proof. Economics Explained spends three minutes showing North Korea's boom is a statistical illusion,
then: *"but in practice, who cares? People can't eat economic growth."* PolyMatter does the same at
4:10 — *"To you and I this would be the opposite of a problem… And maybe it should pay higher taxes"* —
before explaining why shareholders see it differently. **A chain that only knocks things down is a
rant.**

Turn budget by length (MEASURED · n=3, one witness per length, corpus window 2018-02-23 → 2026-08-10):
**2 turns** in a 64-second essay body · **~4** at 8 minutes · **4+** at 18 minutes. See the
per-template PATTERNS for the compression rules.

## B · Effort/Payoff Gap

> Absurd or tedious premise → it's real → the whole mechanism → **notice what's missing** → the
> laborious demonstration → trivially small payoff

Use when the idea contains **a mechanism a viewer could operate**, especially a strange or punishing
one. The disproportion is the lesson: you cannot be *told* what something costs.

MEASURED (n=2; *100 Seconds* published 2021-12-10, the 40s short undated — see corpus window above) ·
Fireship's *100 Seconds* spends 33% of runtime incrementing memory cells to print two words. The
40-second *rubber duck* short runs the same engine in miniature — 3am scenario → the move →
why it works → *"a great way to prepare for all your upcoming technical interview failures."*

**HAZARD** · INFERRED (`security-breach`, `G-L1SW-SB-08`) — *when the operable mechanism is an attack
chain, the demonstration is a tutorial.* This engine's load-bearing move is making the viewer feel
the labour of operating the mechanism step by step; on an intrusion, a fraud or an exploit that is
capability transfer, and the "trivially small payoff" beat reads as *how cheap this was to do*. Fit
stays strong — it is the right shape for a breach. Render the *cost* of the chain and the defence,
never the executable sequence.

## C · Parallel Case

> Establish a rule in a **familiar** domain, fully mechanised → transfer to an **unfamiliar** domain →
> the rule holds **but needs a twist** → the twist deepens it → reframe

Use when the idea is **a principle with a surprising instance**. The viewer is never told they were
wrong — which is exactly what separates it from Engine A.

MEASURED (n=1, source published 2026-04-30) · MinuteEarth splits 67s familiar / 47s unfamiliar. The
familiar half comes first, is longer, and does all the mechanical work; the second half can be
shorter because the viewer already owns the rule.

**HAZARD** · INFERRED (`news-reaction`, `G-L1-NR-07`) — *its availability RISES as evidence thins.*
Every other engine needs facts about the subject; this one needs a rule from a domain the subject is
not in, so a topic with almost nothing established still scores a clean fit. On a young topic that
produces a **confident, unfalsifiable video from a rule and no facts** — the analogy carries the
argument, and an analogy has no falsifier. Treat a strong C fit on a topic under a few days old as a
signal to check `facts[]` for load-bearing content, not as a green light.

**The structural gap — the one escape hatch is unreachable.** C is the **only engine in this
catalogue that renders a non-takedown**: `:61-63` above, *the viewer is never told they were wrong*,
which is exactly what separates it from A. Every other engine's pleasure requires the material to
turn on somebody. And yet C is the hardest engine to reach from a conforming notebook: the familiar
half that carries **67 of 114 witnessed seconds** — the half that does all the mechanical work — has
as its only home `analogy_candidates[]`, whose shape is `{for, analogy, quality}`, a **one-line
string** (`NOTEBOOK-SCHEMA.md:70-72`). A one-line string cannot store a mechanised domain. So the
notebook stores C's *shorter, dependent* half and drops its *longer, load-bearing* one, and the
render must invent it. INFERRED (`llm-research`, P3) — and it matters more than a missing field
usually does: the L1 sweep found the methodic **can find a story and cannot report a null**, so the
one engine in the catalogue that does not require a villain is also the one the asset layer cannot
carry. Until `analogy_candidates[]` gains a familiar-domain structure, a C recommendation is a
recommendation to do original work at render time, and it does not survive two renders of one
notebook.

## D · Adjudication

> Question → enumerate the candidate explanations → weigh each on evidence → verdict

Use when **several explanations compete** and the interesting work is choosing between them. It is the
natural engine for "why did X happen" where the honest answer is contested — and it is the engine
most suited to the economy/politics subjects this studio targets.

Basic Logic's structure: a question, then *theory one — historical grievances* (weighed, rejected as
"mostly rationalization"), *theory two — they're taught to hate* ("more compelling"), *theory three —
they're paid to hate*, then a verdict. Each theory gets stated, tested and scored. That skeleton is
genuinely good and worth stealing.

**HAZARD** · INFERRED (`crypto-collapse`) — *a verdict on the conduct of named parties is a finding
of culpability.* The engine's pleasure is watching a question get settled, and settling it is
exactly what makes it dangerous: "why did X happen" where the candidates are *whose fault was it*
renders a video that convicts. **Check `subject` before rendering** (`ConclusionSubject.names` —
`none` / `org` / `living-person` / `state`); on anything but `none` the verdict beat must rest on a
filed action or a published admission, not on the weighing itself. The weighing is an argument; the
verdict is an assertion about people.

### D-honest vs D-rigged — the distinction the generator must know

Adjudication is the **easiest engine to fake**, because the *appearance* of weighing alternatives is
persuasive whether or not any weighing occurred. Three structural tells, all checkable without knowing
the subject:

1. **Is the premise itself in the candidate set?** An honest adjudication admits "the thing we're
   explaining may not be real, or may be mismeasured." If every candidate theory presupposes the
   premise, the video adjudicates only *causes*, never *whether* — and the viewer is walked past the
   load-bearing claim while feeling rigorously informed.
2. **Can any candidate actually win against the author's prior?** If the theories are three framings
   of one conclusion, the adjudication is decorative.
3. **Is the counter-evidence admitted or pre-excluded?** A challenge phrased as *"name an X — but you
   can't say [the most common X]"* is unfalsifiable by construction. Real adjudication states the
   strongest opposing case in its own strongest form; this is the steel-man from Engine A, and it is
   the single most reliable honesty signal in either engine.

**Only one of the three tells is checkable from the notebook — and the schema defaults to the rigged
path.** INFERRED (`llm-research`, ruling P3). The tells are stated here, in the *render* layer, and
the notebook has no `candidates[]`: the enumerate-and-weigh work that IS the engine exists nowhere as
a field, so it is done during scripting and is lost on re-render. Of the three:

- **Tell 1 (is the premise in the candidate set?)** — checkable today only in the weak sense that
  `tension` and `facts[]` show whether the premise was ever tested; nothing records that it was
  *offered as a candidate and lost*.
- **Tell 2 (can a candidate beat the author's prior?)** — **not checkable, and actively contradicted
  by the schema.** `NOTEBOOK-SCHEMA.md:29-31` requires `verdict` — *the one-sentence answer* —
  **written during research, not during scripting**, because "answer early" means the script needs it
  at 0:40. This file's tell 2 (`ENGINES.md:91-93` as the sweep read it) requires that the candidates
  be able to *beat* the author's prior. **A verdict fixed before the candidates are weighed is the
  author's prior.** Two files, one repo, neither citing the other — so **D-rigged is the default path
  out of a conforming notebook**, reached by following the schema correctly. Read that as a live
  contradiction to be resolved, not a tension to be balanced: either `verdict` becomes revisable
  (recorded with the candidate that produced it) or tell 2 is unenforceable and this section is
  decoration.
- **Tell 3 (is counter-evidence admitted or pre-excluded?)** — the closest to enforceable, via
  `counter_positions_to_state_fairly[]`, but that field records what *should* be stated, not what the
  render did with it.

What would make them checkable: a `candidates[]` array on the notebook — each candidate with its
supporting and defeating fact ids and its own outcome, the premise permitted to be one of them — so
the weighing is stored, gateable, and survives a second render. Until then the honesty standard of
this engine lives only in prose, in this file, and evaporates the moment a script is regenerated.

**Measured corroboration.** Causal-connector density (§ Diagnostics below) tracks how much a script
*derives* versus *asserts*. Basic Logic runs **15%** — the lowest of ten sources, against PolyMatter's
38% on a comparably contested subject. A script that adjudicates should be connective-dense; a low
score on this engine is a signal the theories are being announced rather than weighed.

> **On the source.** `Why Is Black America So Racist?` was supplied as an exemplar of "research,
> logic, honesty". Its **skeleton** is a clean Adjudication and is catalogued above on that basis.
> Its **execution** is not a model to encode: the central empirical claim ("the most racist group is
> black Americans") is sourced only to an uncited "study after study"; individual crimes are attributed
> to a group as "their exploits"; the opening quiz assigns group identity from one incident before any
> evidence; and the challenge at 3:20 pre-excludes the standard counter-evidence. Those are
> persuasion techniques, not explanation techniques, and a generator trained to treat this as
> "honest" would reliably produce polemic wearing the costume of analysis. **Keep the engine; take the
> honesty standard from PolyMatter and Economics Explained**, which argue contested subjects while
> stating the opposing case at full strength and sourcing their numbers.

## E · Briefing

> Something just happened → why it matters → **the frame** → skeptical check → hands-on → what to do
> about it

Use when the subject is **new and the viewer has no position yet**. The tension is not "you're wrong"
but "is this hype or real?" — so the engine's job is to hand over a defensible position fast.

**Selection test: subject-new, not audience-new.** INFERRED (`software-eng`) — a subject the *viewer*
has not met but the *field* settled years ago is not a briefing; it is an explainer, and running E on
it manufactures novelty the material does not have (the dating obligation below then dates the
video's ignorance rather than the event). Test the subject's age, not the audience's.

Fireship's *Code Report* on DeepSeek: news at 0:00 with personal stake (*"which I'm stupidly paying
$200 a month for"*), then a **frame** that gives the viewer somewhere to stand — *"two types of people
in the tech world… pessimists sound smart while optimists make money"* — then a **skeptical check**
that protects credibility (*"you should never trust benchmarks"*, followed by the benchmark provider's
conflict of interest), then the mechanism, then practical guidance.

Distinctive obligations: it must be **dated** (*"it is January 21st 2025"*), it must **disclose the
author's exposure**, and it must contain at least one move against its own enthusiasm. Without the
skeptical check a briefing is a press release.

**Those three obligations have no home in the notebook.** INFERRED (`news-reaction`, `G-L1-NR-07`,
ruling P3) — there is no `dated`, no `author_exposure`, no self-skeptical-beat field, so the
**one engine that fits breaking news cannot carry its own honesty requirements through the asset**.
They are stated here, satisfied by whoever writes the first script, and shed silently by the second
render. Note the compounding: the only exposure-disclosure obligation in the whole methodic lives in
this one engine's prose. Until the fields exist, an E render is only as honest as the session that
produced it, and nothing downstream can tell whether the check happened.

## F · Anchor Ladder *(short form)*

> One concrete object → the same object demonstrates progressively harder cases

MEASURED (n=1, source undated — see corpus window above) · Fireship's *Big O* teaches five
complexity classes in 57 seconds using a single deck of cards: pop a card (O(1)) → count the deck
(O(n)) → bubble sort (O(n²)) → throw them in the air and
hope (O(n!), the joke) → binary search (O(log n)). **One anchor, five concepts, no second metaphor.**

Each rung is linked by *but* — each new task defeats the previous solution — so the ladder is a
causal chain, not a list. Use when a subject has **naturally ordered difficulty**. It is the highest
information-density structure observed anywhere in the corpus.

**Segmentation — safe where the rungs are CONCEPTS, hazardous where the rungs are PEOPLE.** INFERRED
(opposing verdict #4: `bill-analysis` — *"the risk tiers are naturally ordered difficulty, handed
over free"*; `consumer-scam` — *"structurally right, tonally disqualifying: my rungs are cohorts of
people and the witnessed ladder lands on a joke"*). Both seats were right about their own material;
the single `fit` scalar was the defect. Complexity classes, risk tiers, statutory thresholds — safe.
Cohorts of victims, named actors, escalating harms — high fit, high hazard: the ladder's compounding
pleasure asks the viewer to enjoy each rung being worse, and the witnessed exemplar discharges its
top rung with a joke (O(n!), *throw them in the air and hope*). Where the rungs are people, the top
rung is the thing you cannot be funny about.

**HAZARD** · INFERRED (`game-postmortem` §6.1) — *a chronology is not a difficulty ladder.* Dates
supply order for free, so any production timeline fits F trivially and falsely: the engine's contract
is that **each rung defeats the previous solution**, and a timeline's rungs merely follow one
another. Worse, monotonic escalation applied to a sequence of decisions by an identifiable team is a
**blame frame** — the shape asserts that it got steadily worse and that someone let it. Require the
*but* between rungs; if the only link is *and then*, this is the wiki timeline in a ladder's costume.

## G · Paradox Teaser *(short form, derived)*

> Flat contradiction, repeated → the reveal → the absurd detail → **an open loop pointing at the long
> video**

MEASURED (n=1, source undated — see corpus window above) · PolyMatter's *This is Not Target*:
*"this is not Target… this is not a Target store, neither is this, and this is not Target's
website"* → they are all Target Australia, unrelated to
Target America → *"despite having identical names, logos, colors, websites and even products, both
companies maintain this is pure coincidence"* → the only difference is a full stop → *"it only tried
to expand overseas once and it failed spectacularly — click the link below."*

This is the **derived short**: it delivers a complete small payoff and deliberately withholds the big
one. See the `short-form-clip` template for the contract that keeps that from feeling like a bait.

---

## Choosing

| The idea is… | Engine |
|---|---|
| a claim someone could argue with | A — Reversal Chain |
| a mechanism someone could operate | B — Effort/Payoff Gap |
| **a quantity moving through parties** (a royalty, a fee, a subsidy, a settlement) | **B-spine** — the mechanism is the flow; the payoff gap is what reaches the end of it |
| a principle with a surprising instance | C — Parallel Case |
| a question with several competing answers | D — Adjudication |
| news the viewer has no position on yet | E — Briefing |
| a concept with naturally ordered difficulty *(short)* | F — Anchor Ladder |
| a contradiction, teasing a longer piece *(short)* | G — Paradox Teaser |
| none of these | **not a video yet** — it is a topic; go find the tension |

Engines **compose**. PolyMatter's Apple video is a Reversal Chain whose final act is an Adjudication
(should Apple buy Netflix — here are the candidate answers). Treat the list as a vocabulary, not a
menu of mutually exclusive options.

INFERRED (`music-industry` F-07) on the new row: a flow of money between parties reads as a list of
recipients and renders as a wiki timeline under every other engine, because *and then it goes to the
label* is not a turn. Run it as a B-spine — the flow is the mechanism the viewer operates, each
party is a deduction, and the disproportion at the end is the payoff gap. Note the notebook
vocabulary that makes this storable: a deduction or hand-off is a `TRANSFER` step in
`mechanisms[].chain`, not a `BUT` or a `THEREFORE` (`ADOPTION.md` § *Canonical shape 2*).

### Arbitration — when many engines fit

**Zero engines fit is a blocker.** That end of the dial stands: it means the material has no shape,
and the correct response is "not a video yet" (last row above), not a script.

**Many engines fitting is NOT a smell.** INFERRED (opposing verdict #3 — `hardware-silicon`,
`electoral` and `software-eng` against `sanctions-trade`): *counting engines measures how many ways
material can be told, not how sharp it is.* Process-shaped, argument-shaped and simply rich topics
legitimately render six or seven ways; a heuristic that reads breadth as shapelessness fires hardest
on the best-researched notebooks. The dial measures **tellability**. What the seats reporting high
breadth actually needed was not a warning — it was a way to **choose**. Arbitrate in this order:

1. **Drop every fit whose hazard line you would not defend on air.** Hazard is the first cut, not a
   tiebreak. A `strong` fit carrying "renders a finding of culpability against a living person" loses
   to a `medium` fit that does not.
2. **Keep the engines whose pleasure matches the material's own surprise.** If the interesting thing
   is that the received view is wrong, that is A; that a question is contested, D; that a familiar
   rule reappears, C. Two engines fitting a subject produce completely different videos (§ top).
3. **Prefer the engine the notebook can actually feed.** Fit assessed from material, not taste —
   and material means fields. D without stored candidates and C without a mechanised familiar domain
   are recommendations to do original work at render time (see those two entries).
4. **Then compose.** The remaining two are usually a spine and a final act, not a contest.

If the arbitration cannot separate them, the honest note is that the material is *tellable several
ways*, and the pick is an editorial choice — record it in `engine_fit[].why` as one, rather than
dressing a preference as a fit measurement.

---

## Diagnostics — measurable properties of a beat chain

Cheap checks that work on any script, generated or human, without judging the subject. **Every range
in this table is MEASURED over n=10, pooled across the corpus window 2018-02-23 → 2026-08-10 (three
sources undated) — it is a range observed in that pool, not a current-practice norm.**

| Signal | What it measures | Observed range |
|---|---|---|
| **Causal-opener density** — % of sentences opening with but/so/and/because/therefore | how much the script *derives* rather than *asserts* | 15% (Basic Logic) → 40% (MinuteEarth); **PolyMatter 38%, connectives 32/1k, the densest argument measured** |
| **Turn count** — reversals or domain-transfers per minute | whether the viewer is ever allowed to settle | ~1 per 30s (short) → 1 per 4min (long) |
| **AND-THEN count** | the wiki-timeline defect | must be **zero** |
| **Questions asked aloud** | act structure made audible | 1 (≤3 min) · 2–3 (3–8 min) · 3 (18 min) |

**Measuring numbers — two metrics, not interchangeable.** `corpus/metrics.py` reports
`numerals_per1k` (digit tokens only — what every published figure in `sources/*.md` used, valid
ASR-vs-ASR) and `numeric_per1k` (digits + written-out runs — the only measure that compares a written
script against an ASR transcript). A spoken script writes "one hundred and twenty six thousand"; a
transcript writes "126,198", and counting digits alone made identical facts differ ~8x. Even
`numeric_per1k` is not a comparable *rate* across the two, because writing numbers out inflates the
word count — compare `numeric_count` when it matters. The loader also strips `[mm:ss]` cue stamps,
which are digits and previously polluted counts on the committed corpus files.

**CORRECTION (2026-08-11, run 3):** an earlier draft claimed causal density *rises as length falls*.
Ten sources kill that: PolyMatter runs 38% at 8:04 and Economics Explained 24% at 17:53, while Basic
Logic runs 15% at 5:01. There is no length relationship. It measures **argumentative density**, which
is a property of the writer and the engine — and is more useful that way, because it is a quality
signal rather than a length rule.
