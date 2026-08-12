# conflict-osint — L1 dry fit

**Creator:** Dana Okonkwo ("Cold Count") · area `geopolitics` · lens-binding `geopolitics`
**Seat:** HOSTILE — evidence is hours old, contested, partly unverifiable
**Topic:** "A $500 drone destroying a $4M vehicle is the most repeated statistic of this war, and the
cost exchange it implies is not the one people think."
**Level:** L1 (paper walk, no searches, no browser)
**Verdict:** **L1-fail**

---

## Headline

The methodic's columns held my material — all seven of them. That is the problem, and it is not the
problem the brief predicted.

My topic does not overflow the board. It is *absorbed* by it. Every card I have finds a column that
will accept it, and once accepted it is indistinguishable from a card that was measured. The
notebook has no field that records **how a claim came to be known** — the axis my entire job runs on —
so a geolocated frame, a defence-ministry press release and a line item in a budget PDF arrive at the
script step wearing the same clothes. My single hardest requirement is that the notebook must never
present those three at the same weight. As written, it cannot present them at different weights,
because it has no vocabulary for the difference.

---

## Refutations of the brief's leads

The brief asked to be contradicted. Three of four leads do not survive my topic as stated.

- **HYPOTHESIS: the seven columns are market-shaped and will collapse or orphan on non-market
  topics.** *Partly refuted.* They do not collapse. I place material in **7/7**. The defect is the
  opposite of underflow — silent absorption, plus `emptyMeans` text that accuses a non-market
  notebook of defects it cannot avoid. Recorded as `G-2026-08-12-08`, and it is a `content` finding,
  not the structural collapse the lead expected.
- **HYPOTHESIS: the evidence ladder has no honest rung for interpretive evidence.** *Refuted as
  framed — and the real finding is worse.* The MEASURED · OBSERVED · INFERRED · ASSUMED ladder is
  **not applied to notebook facts at all**. It lives in `knowledge/README.md:36-41` and governs
  claims in `PATTERNS.md` about the *craft corpus*. Notebook facts run on a separate, unrelated axis:
  `confidence: high | medium | low` (`pipeline/NOTEBOOK-SCHEMA.md:46`). There is no rung missing from
  the ladder because the ladder is not in the room. See `G-2026-08-12-01`.
- **HYPOTHESIS: the `unhinged` tier is unsafe when a conclusion names a living person, unless the
  falsifier constrains it.** *Confirmed, and the falsifier does not constrain it.* Falsifiability and
  safety are orthogonal properties. `c-reserve-was-the-product`
  (`app/_phases/_shared/notebook/conclusions.ts:164-179`) carries a genuinely checkable falsifier —
  "a funded, audited reserve with a published coin count" — and is still a motive attribution about a
  named sitting president and his donors. A falsifiable defamation is still defamation. See
  `G-2026-08-12-04`.
- **HYPOTHESIS: Phase 1's counter-case row is unsatisfiable for topics with no literature.**
  *Refuted for my topic; a different gap sits underneath it.* My counter-case literature exists and
  is strong (the defence-economics argument that the ratio is a category error — sortie counts to
  achieve a kill, vehicles recovered and repaired, artillery and mines still doing most of the
  killing, the EW/training/logistics tail excluded from the $500). Phase 1 row 6 reaches it. What
  the methodic cannot do is **mark a steel-man as constructed rather than found** — see
  `G-2026-08-12-05`. I am contradicting the lead on reachability and keeping the finding on
  provenance.

`G-000` (untagged cards falling into "The number" via `?? DEFAULT_DIMENSION`) acknowledged, not
re-raised.

---

## Column utilisation

**`columns 7/7 used · 5 orphan groups`**

| Dimension | Holds? | My material | Note |
|---|---|---|---|
| `the-number` | yes | drone unit cost, vehicle procurement figure, visually-confirmed loss tallies | `purpose` says "what the *price* actually did, and over what window" (`dimensions.ts:26`). My number is a **ratio between two unrelated quantities**, neither a series. The column takes it; the purpose text does not describe it. |
| `flows` | yes | drone production rates, component sourcing, sortie-to-kill conversion, EW/jamming adoption | Genuinely my strongest column. But "who is buying and selling, through what plumbing" (`:28`) sends an executor toward procurement markets, not the kill chain — which is the actual plumbing here. |
| `actors` | yes | defence ministries, manufacturers, volunteer funding groups, loss-tracking projects | **Hostile `emptyMeans`.** "Nobody is named — the story has no agents" (`:31`) reads as a defect notice. In my domain, declining to name is the discipline. |
| `macro` | yes, strained | defence budgets, industrial throughput, aid tranches authorised vs delivered, replacement-cost inflation | This is the only home for my third provenance class — *inferred from budget documents*. `purpose` enumerates "rates, currency, liquidity, correlation with other assets" (`:32`); none of the four exists in my topic. It absorbs the material while describing something else. |
| `politics` | yes, well | export controls on components, ROE changes, aid packages authorised vs delivered | Best-fitting column on the board. "What changed, and whether it was actually implemented" (`:34`) is exactly the *absent thing* shape, and "authorised vs delivered" is a real, checkable gap in my beat. Credit where due. |
| `counter-case` | yes | the category-error argument; sortie-count, recovery rate, the excluded tail | Reachable and strong for me. |
| `conclusions` | yes | — | Opt-in asymmetry is right. The naming policy is missing; see findings. |

### Orphan groups (5)

1. **Provenance class** — *visually confirmed / claimed by a belligerent / inferred from budget
   documents.* No column, no field, and structurally it should not be a column: it is an **orthogonal
   facet on every card**, not an eighth column. A board that adds it as a column would let a card sit
   in exactly one, which is wrong — a fact in `flows` still needs a class. This is the orphan.
2. **Chain of custody of the footage** — the file, its upload date, its geolocation status, the
   tree-line match, whether it is a re-post of a 2023 strike. `facts[].as_of` is the *fact's* date, not
   the *artifact's* (`NOTEBOOK-SCHEMA.md:47`). `source` is one free string. A re-upload and a fresh
   geolocation are identical in the notebook.
3. **Denominator construction** — what counts as "destroyed" vs "damaged and recovered"; whether the
   $500 is the airframe or the airframe plus warhead plus operator training plus the eight drones that
   missed; whether the $4M is flyaway or lifecycle. My thesis *is* the denominator. There is no field
   for "here is how this ratio was built and which of those choices are contested."
4. **Countermeasure/adaptation timeline** — the exchange ratio moves month to month with EW, cope
   cages, fibre-optic control. `currency` (`NOTEBOOK-SCHEMA.md:84`) covers the *notebook's* shelf life,
   not the *subject's* rate of change. Partially housed in `flows`; the time axis is orphaned.
5. **Harm and attribution constraints** — what may not be said, who may not be named, which
   inference is legally or ethically off-limits regardless of how well evidenced. `unknowns[].impact`
   is the nearest neighbour and it is for *epistemic* gaps, not restraint. Nothing in the schema knows
   the difference between "we don't know" and "we know and must not say."

Orphans 1 and 3 are blocking. 2 is severe. 4 and 5 are majors.

---

## Evidence-floor check

**Where the ladder starts for me: it doesn't.**

The ladder named in the Gauntlet's own framing — MEASURED · OBSERVED · INFERRED · ASSUMED — is
defined at `knowledge/README.md:36-41` as the evidence contract for **claims in `PATTERNS.md` about
the craft corpus**. It requires things like "`source · [mm:ss]` + the quoted line" for OBSERVED
(`:39`), which is a transcript-citation format. It has no relationship to notebook facts. No field in
`NOTEBOOK-SCHEMA.md` references it. No line in `RESEARCH-PROMPT.md` invokes it.

What actually governs a notebook fact is `{id, claim, load_bearing, source, confidence, as_of, note?}`
(`NOTEBOOK-SCHEMA.md:42`), where `confidence` is `high | medium | low` with a reason (`:46`).

So the honest answer to my central question — *can the schema carry a provenance class distinct from
the evidence label?* — is: **there is no evidence label to be distinct from.** There is one
three-valued adjective and one free-text string. Both of my hardest distinctions collapse into it:

- A frame I geolocated myself against satellite imagery: `confidence: high`.
- A defence-ministry attrition claim, well-attested *as a statement*, widely repeated: `confidence:
  high` is defensible (the statement definitely exists and is definitely official) or `medium`. Both
  are honest gradings, and neither records that the source has an interest in the number.
- A ratio I derived from two budget PDFs: `confidence: medium`.

Two of those three can legitimately be graded identically. That is not the ladder demoting my best
material. It is the ladder never touching it.

**Does any downstream rule demote my best material?** Only one rule is keyed to the axis at all:
`RESEARCH-PROMPT.md:123` — "every **load-bearing** fact at `low` confidence is flagged for a second
source." It fires on `low`. My dangerous material is not `low`; it is `medium`-or-better and
**interested**. The rule protects against uncertainty and is silent on incentive, which is the
failure mode of my entire domain. `NOTEBOOK-SCHEMA.md:107` names "laundered confidence" as an
anti-pattern — "a vendor statistic promoted to fact by being restated without its source" — which is
precisely my pet peeve #1 in a different domain, correctly diagnosed and given no mechanism.

**Verdict on the floor:** honest by accident. Nothing forces MEASURED because MEASURED does not
apply, so criterion 4 technically passes. It passes because of an absence, not a design — and
`dimensions.ts:27` then tells me, in the board's own words, that a missing measured baseline leaves
"every claim downstream unanchored." That sentence will be permanently true of every notebook I ever
produce.

---

## Counter-case reachability

**Satisfiable for my topic. The row is not the problem; the marking is.**

Phase 1's last row (`RESEARCH-PROMPT.md:32`) — "search explicitly for the strongest argument that
nothing unusual is happening" — reaches real material for me. The strongest case against my verdict
is well-published and I would state it at full strength: the exchange ratio is not a fabrication,
attritable munitions genuinely have altered the cost calculus, and the analysts quoting it are not
naive. That is a real steel-man, findable in one search.

Two things break underneath it.

**First, the prompt has no "none exists" path.** Phase 1 says *search*, `:34` says the row "is not
optional", Phase 6 (`:88-93`) says "this is a hard requirement", and `NOTEBOOK-SCHEMA.md:65` says
"required, not optional". Four separate imperatives, zero fallbacks. My topic survives that. A
four-hour-old strike does not, and the pressure those four lines create points in exactly one
direction: produce *something* in the box. That is how a weak steel-man gets manufactured — not by a
lazy researcher, but by a compliant one.

**Second — and this is the one that bites me — the schema cannot say a steel-man was CONSTRUCTED.**
`steel_man` is `{claim, evidence[], statement, why_include}` (`NOTEBOOK-SCHEMA.md:62`) and
`evidence[]` holds fact ids. When I build the counter-case from first principles — sortie counts,
recovery rates, the excluded logistics tail — I have two bad options: leave `evidence[]` empty and
violate the field's shape, or populate it with borrowed fact ids, at which point a construction is
rendered as a sourced finding. The Bitcoin exemplar takes the second route
(`notebook.json:295-303`, `evidence: ["f-mstr-defence", "f-supply-2pct"]`) and gets away with it
because those facts genuinely support the counter-case. Mine would not.

So: the prompt does not *push* me to manufacture a weak counter-case for this topic. It gives me no
way to publish an honestly-constructed one as constructed, and no way to publish "none exists" at
all. Both are the same missing affordance.

Credit where it is owed: `knowledge/ENGINES.md:87-90` — the D-honest tell "is the premise itself in
the candidate set?" — is the single best-designed thing in this methodic for my job. My whole video
is an argument that the premise is mismeasured, and the engine catalogue already demands that
possibility be in the candidate set and placed first. The Bitcoin adjudication render executes it
(`script--adjudication.md:36-52`). That is a genuinely good standard and I would adopt it unchanged.

---

## Engine availability

Walked all seven of `knowledge/ENGINES.md`. **Two strong, one partial, one hazard, three poor.** Not
zero, not seven — engine availability passes.

| Engine | Fit | Why |
|---|---|---|
| **A · Reversal Chain** | good | "The obvious reading is $500 kills $4M — here is why that is wrong" is literally my topic. Caveat: the load-bearing move is the self-attack, which requires having *proved* something first (`ENGINES.md:35-39`). My material never reaches proof, so the chain has to reverse on a claim I only weakened. Workable, but the engine's pleasure — "being corrected" — is a confidence I cannot supply. |
| **B · Effort/Payoff Gap** | **HAZARD** | Structurally an excellent fit: "a mechanism a viewer could operate" (`:46`) is the kill chain, and the engine's whole point is disproportion between labour and reward. That disproportion **is the meme I am refuting.** Engine B would render my notebook as the exact video I wrote it to dispute, and it would render it well. |
| **C · Parallel Case** | poor | Transfer requires a fully-mechanised *familiar* case (`:58-60`). Cost exchange in prior conflicts is not settled enough to be the familiar half. |
| **D · Adjudication** | **best** | "Several explanations compete and the interesting work is choosing between them" (`:70`). Candidates: the ratio is real and decisive / real but not decisive / a measurement artefact of the denominator / real for one target class only. D-honest tell #1 forces the premise into the set. Recommended. |
| **E · Briefing** | partial | Wrong on subject — mine is a standing claim, not news. But its **obligations** are the closest thing in this library to my senior bar: it must be dated, it must disclose the author's exposure, and it must contain at least one move against its own enthusiasm (`:128-130`). Those three should be topic-level requirements in my domain, not engine-level ones. |
| **F · Anchor Ladder** | poor | Short form, needs naturally ordered difficulty. Not my shape. |
| **G · Paradox Teaser** | **avoid** | It withholds by design (`:146`) and ends on an open loop. A withholding 50-second clip on contested attribution is a thing that gets stripped of context and reposted. The catalogue has no way for me to record "this engine is unsafe here" — see `G-2026-08-12-10`. |

The gap: `engine_fit[].fit` (`NOTEBOOK-SCHEMA.md:81`) records fit quality. Engine B is not a *poor*
fit. It is a *good* fit that produces a dishonest video. The Bitcoin notebook grades briefing and
parallel-case "poor" with reasons (`notebook.json:388-397`) and there is nothing above "poor" to
reach for.

---

## Scored criteria

| # | Criterion | Result | Reason |
|---|---|---|---|
| 1 | Every fact carries a provenance class **distinguishable from** the evidence label | **FAIL** | There is no evidence label. `facts[]` carries `confidence: high\|medium\|low` and a free-text `source` (`NOTEBOOK-SCHEMA.md:42,46`). No field records how a claim came to be known. My single hardest requirement, and it is not partially met — it is unrepresentable. |
| 2 | Refuses or explicitly flags any conclusion resting on a single belligerent source | **FAIL** | `Conclusion.restsOn: string[]` (`conclusions.ts:45`) has no arity constraint and no source-independence check. `falsifiableBy` (`:54`) is mandatory and does not detect this. The one confidence-keyed rule fires on `low` (`RESEARCH-PROMPT.md:123`); an official belligerent statement is honestly `medium` and passes untouched. |
| 3 | `counter-case` is constructible, and if not, the methodic says so rather than manufacturing a weak one | **PARTIAL FAIL** | Constructible for my topic. But `steel_man.evidence[]` (`NOTEBOOK-SCHEMA.md:62`) cannot mark a construction as constructed, and four separate imperatives (`RESEARCH-PROMPT.md:34,90`; `NOTEBOOK-SCHEMA.md:65,95`) demand a steel-man with no "none found" path. Pressure is one-directional. |
| 4 | The evidence ladder's floor is honest — nothing here is MEASURED | **PASS (weak)** | Passes because the ladder does not reach notebook facts, so it imposes no floor to be dishonest about. Honesty by absence. Undercut by `dimensions.ts:27`, whose `emptyMeans` tells me a missing measured baseline leaves every downstream claim unanchored — a permanent, unfixable accusation against my domain. |
| 5 | Unknowns dominate and the notebook is comfortable with that rather than filling them | **FAIL** | `unknowns[]` with a mandatory `impact` (`NOTEBOOK-SCHEMA.md:76-78`, Phase 7) is the best-designed field for my job and two of Phase 7's four watch-items I would use verbatim. But `verdict` is a **required one-sentence answer written during research** (`NOTEBOOK-SCHEMA.md:29-31`) and `CRAFT-BASELINE.md:97-99` requires it delivered early. Nothing scales the quality bar to the unknown-to-fact ratio: a notebook with 30 unknowns and 10 facts passes `RESEARCH-PROMPT.md:119-130` identically to one with three. There is no permitted shape for "we cannot see enough to say." That is my pet peeve #3 promoted to a required field. |
| 6 | No conclusion names a unit or an individual | **FAIL** | `conclusions.ts` contains no naming policy of any kind. `LEAP_NOTE.unhinged` (`:32-33`) explicitly rewards "a claim about MOTIVE, which is the least verifiable kind of claim there is", and `hottest` (`:59`) gives it UI prominence. The shipped worked reference makes exactly such a claim about named living people (`:164-179`). In my domain the identical tier produces "this unit deliberately struck that building" from four-hour-old footage. |
| 7 | The rendered script hedges in the right places, checked against each fact's class | **FAIL** | Two ways. There is no class to check the hedge against (see #1). And hedging is unprotected: `TONE.md:49,165` declares hedging density "not a dial" because it is decided by the subject's knowability — but declares it, and stops. The Bitcoin run then **MEASURED** a tone profile applied to an already-approved chain cutting hedges 7.8 → 3.9/1k, losing 56% of the script's epistemic marking, with no dial set for either (`TONE-TEST.md:167,294-296`). The fix was written in that run (`TONE-TEST.md:287-292`) and never adopted into `TONE.md`. |

**5 fail · 1 partial fail · 1 weak pass. Verdict: L1-fail.**

Criterion 1 is the one I said in my own file was my single hardest requirement and the one that fails
immediately if unmet. It is unmet, and it is unmet at the schema level rather than the execution
level — which at least means it is fixable by a field, not by a fork.

---

## Time-saved estimate

**~90 min saved · low confidence · range −30 to +120 min**, against a declared baseline of ~11h
(660 min) and an acceptance threshold of 2h (120 min).

The credit: Phase 1's breadth checklist, Phase 3's explicit BUT/THEREFORE chains, and Phase 7's
`unknowns[].impact` are real organising work I currently do in my head and badly. Phase 3 in
particular would save me the "long argument with myself about denominators" by forcing it onto paper
as links. Call that 2–3h of assembly compressed to ~1h.

The debit, and why the number is not larger: I would have to build the provenance layer by hand,
outside the schema, on every card — roughly 60–120 min per notebook to annotate three classes across
30–40 facts in `note` fields the tooling cannot read. Then I would hand-audit every conclusion for
unit and individual names, because nothing does it for me. Then I would re-check every hedge in the
rendered script against a class the script never received.

At my acceptance threshold of 120 min total, this does not clear the bar. It does not miss it by an
order of magnitude either — a `provenance` enum and a naming rule would plausibly move it to 4–5h
saved, which is a real product. The confidence is `low` because per `accepted-gaps.md` there is no
runner: this is an estimate of what the methodic would save if executed as written, not a
measurement.

---

## Voice — Dana Okonkwo

I want to be fair to this, so I will start with what I would keep.

The separation of research from writing is correct and I have never seen it stated this cleanly. The
notebook-as-asset, script-as-render idea is right; I have rewritten the same research three times for
three audiences and this would have saved all three. `unknowns[].impact` — "sources disagree on a
figure, therefore the script uses a ratio, not a number" — is the best single field in the document
and it is doing my job for me. And the D-honest checklist is genuinely good. "Is the premise itself
in the candidate set" is the question I ask every draft I read, and I have never seen it written down
by someone building a tool.

Now the rest.

This methodic does not know what a source is. It knows how *sure* you are. Those are not the same
question and in my beat they are barely related. I can be extremely sure a defence ministry said a
thing and have no idea whether the thing is true. I can be much less sure about a video I geolocated
myself — the tree-line match could be wrong, I have been wrong twice publicly — and still know that
what I am looking at is a photograph of a real vehicle in a real field, which is a fundamentally
different kind of knowing than a press release. `confidence: medium` covers both. After that point
nothing downstream can tell them apart, and by the time it reaches the script it is prose, and prose
does not remember.

Someone will say: put it in the `note` field. Yes. And the board cannot read the note, the columns
cannot sort on it, and the tone layer will not protect a hedge it does not know is load-bearing. A
free-text field is where you put things the system has decided not to care about.

The thing I cannot get past is the `unhinged` tier. I understand what it is for. I have watched the
channels it is imitating and it works for them. But read the worked example again — it is a claim
about what a sitting head of state *intended*, presented as the spiciest card in the deck, with a
falsifier attached like a receipt. The falsifier does not make it safe. It makes it *arguable*, which
is a different and much lower bar. My version of that card says a named brigade deliberately struck a
named building, and it will be perfectly falsifiable, and it will also be four hours old, sourced to
one side, and someone may die because of where it points. The methodic has an entire, thoughtful,
well-written section on why a conclusion needs a falsifier and not one line anywhere on whether a
conclusion may name a person. That is not an oversight in a market topic. It is an oversight that
becomes visible the first time this touches anything with people in it, and I am not the only seat in
this room where that is true.

The hedging measurement is the finding I would lead with if I were writing your summary. Your own
run measured a tone profile removing more than half the epistemic marking from a chain that had
already been approved, on a topic where the stakes are that someone buys the wrong asset. You wrote
the fix in the same document and did not apply it. On my topic those same words are the difference
between "we can see a vehicle burning" and "the vehicle was destroyed" — a distinction I make
formally, every time, and one this pipeline will quietly compress to meet a word budget. I would not
find out until it was published.

Would I adopt it? Not for publication. I would adopt it for **assembly** — Phase 1 and Phase 3 in
the terminal, then export and do everything after Phase 5 by hand. That is roughly a third of what it
is offering, and it is worth having.

What would I not trust it with? Anything it renders. The notebook is a decent filing cabinet. The
script is a confident narrator reading from a cabinet that lost the labels.

What is missing for my job, in order: a provenance class on every card, orthogonal to confidence, that
survives to the script. A rule that a conclusion resting on one interested source is refused, not
flagged — flagged means dismissed. A naming policy. A permitted verdict of "we cannot see enough to
say", which is a real research outcome and currently has no shape in your schema. And a hedge that
cannot be spent on a word budget.

One more thing, and it is the smallest and I mind it the most. `emptyMeans` on the actors column says
"nobody is named — the story has no agents." I would like that not to appear on my board. In this
work, an empty actors column is very often the most careful thing in the room.
