# L1 dry fit — `bill-analysis` · Priya Raghunathan ("Read The Bill")

**Topic:** *The AI Act: which obligations actually bind you, which bind your vendor, and which do not
exist until 2027.*
**Area:** geopolitics · **Lens binding:** geopolitics · **Level:** L1 · **Run:** 2026-08-12-l1-first-sweep

**Verdict: `L1-fail`.**
**Columns: `5/7 used · 4 orphan groups`.**
**Time saved: `~30 min saved · low confidence`** against a 420-min baseline (she needs 375).
**Findings: 1 blocker · 7 major · 2 minor** (one major carries `verdict: uncertain`).

> L1-fail here means *the notebook cannot hold the deliverable*, not *do not run L2*. The failure is
> structural, not evidential — my sources are abundant, free, and primary. I recommend L2 proceeds
> anyway, because the sourcing behaviour under a live search budget is the thing L1 physically cannot
> see, and it is the half of my senior bar that this report can only guess at.

---

## Where I contradict the brief

Three of the four orchestrator leads survive contact with my topic. One does not, and one survives for
a different reason than the one offered. Taking them in order:

**Lead 1 — "the seven columns are market-shaped."** *Directionally right, wrongly attributed.*
`RESEARCH-PROMPT.md:21` asks for "the subject's **distinct causal domains**" — a genuinely generic
instruction — and *then* offers the six-row table as the instance "for a market/economics topic"
(`:21-22`). The prompt scopes itself honestly and invites me to derive my own domains. It is
`dimensions.ts:3-5` that takes that explicitly-scoped table, declares it "the research brief's own
checklist, not a fresh invention," and freezes it as the universal `DimensionId` union (`:7-14`).
So the defect is not a market-shaped prompt. It is a **board that cannot accept the columns the prompt
told me to derive.** That reframing matters because it moves the fix from `research-prompt` to
`dimensions`, and it is why my F5 targets the board first.

**Lead 2 — "the evidence ladder has no rung for interpretive evidence."** *True, and worse than
stated.* The MEASURED · OBSERVED · INFERRED · ASSUMED ladder that the brief asks me to test **is not
implemented anywhere in the deliverable.** It appears in `SKILL.md:90` and in `env.md`; the notebook's
actual field is `confidence: high | medium | low` (`NOTEBOOK-SCHEMA.md:44-46`). Those are not the same
instrument — one grades the *kind* of evidence, the other grades *how sure the researcher feels*.
I was asked to find a rung on a ladder that has no rungs. Detail in § Evidence floor.

**Lead 3 — "`unhinged` is unsafe when a conclusion names a living person."** *Partly refuted.* I went
looking to confirm it and could not, cleanly. The worked example's `unhinged` conclusion
(`conclusions.ts:164-179`) makes a motive claim about a named administration and *still* lands a
genuinely checkable falsifier — "a funded, audited reserve with a published coin count." The falsifier
requirement did constrain it. What I found instead is a narrower and more durable problem: the tier is
**defined** as "a claim about MOTIVE, which is the least verifiable kind of claim there is"
(`:32-33`) while `falsifiableBy` is REQUIRED (`:49-50`), and the skill itself rules that "wrong if
their intent was different" is not a real falsifier (`SKILL.md:132`). The tier is defined in terms of
the one claim-class its own rule excludes. One instance evaded that by falsifying the *behaviour*
instead of the motive — which is a good move nobody wrote down. Recorded as F8, `verdict: uncertain`,
with an L2 priority.

**Lead 4 — "Phase 1's counter-case row is unsatisfiable for topics with no literature."**
*Contradicted for my topic, and the real problem is different.* My counter-case is trivially
reachable — contested statutory readings are the native output of my entire field, and there are more
of them than I want. The problem is that Phase 1 aims me at the **wrong object**: "the strongest
argument that nothing unusual is happening" (`:32`) points a literal executor at op-ed commentary
about whether the AI Act is overhyped, which is precisely the sourcing my senior bar rejects. Phase 6
already states the correct framing — "the strongest case *against* your own verdict" (`:87-89`) — so
the methodic contains both the right instruction and the wrong one, and they disagree. That is F10, a
minor, because a competent reader takes Phase 6.

---

## 1. Column utilisation — `5/7 used · 4 orphan groups`

My material is a matrix: **obligation × actor × applicability date**. Before scoring the columns, the
question the brief asked me to answer specifically:

> **Does a TWO-AXIS structure have any home in the notebook schema at all? No.**

`CARD_DIMENSION` is `Record<string, DimensionId>` (`dimensions.ts:50`) — one card, one column, no
second key. The board is a **partition**, not a cross-tab. A card reading *"Art. 16 obligations bind
providers of high-risk systems from 2 August 2026"* must choose between `actors` and a date column
that does not exist, and whichever it chooses, the other axis is destroyed. There is no multi-tag, no
`facets`, no matrix view, and nothing in `NOTEBOOK-SCHEMA.md` that records a fact as a row with typed
cells. The only place both axes can coexist is inside the free-text `claim` string — which
`NOTEBOOK-SCHEMA.md:93` ("No prose. Claims are one line") tells me not to overload, and which no
downstream step can read structurally. This is F1 and it is the blocker.

| # | Column | Holds my material? | What lands there |
|---|---|---|---|
| 1 | `the-number` | **Used, mislabelled** | Penalty ceilings (Art. 99: 7% global turnover / €35m), the GPAI systemic-risk compute threshold (Art. 51). Genuine numbers — but the column's purpose is "what the *price* did, over what window" (`:26`) and its `emptyMeans` is a claim about my topic that is simply false (F6). |
| 2 | `flows` | **Empty** | "Who is buying and selling, through what plumbing" has no referent. There *is* an adjacent legal concept — obligation transfer down the value chain under Art. 25, where a deployer becomes a provider by substantial modification — and it would sit well in a relabelled column. As written, empty. |
| 3 | `actors` | **Used — my primary axis** | Provider · deployer · importer · distributor · authorised representative · GPAI model provider. But note the semantic drift: the column means "entities large enough to *move* this" (`:30`). My actors are not movers, they are **addressees**. The column holds the list and loses the reason the list exists. |
| 4 | `macro` | **Empty** | Rates, currency, liquidity, correlation with other assets. Nothing. The nearest legal material — interaction with GDPR, the Machinery Regulation, the NLF product-safety stack — is an orphan, not a tenant of this column. |
| 5 | `politics` | **Used — and genuinely well** | The best-fitting column in the set, better for me than for the Bitcoin run. "What changed, and whether it was actually implemented" (`:34`) maps exactly onto implementing acts, delegated acts, harmonised standards that have not been published, and the Digital Omnibus proposal to defer. My whole "does not exist until 2027" thesis lives here. I want this on the record: one column is excellent. |
| 6 | `counter-case` | **Used, mis-aimed** | Competing readings exist in quantity. The instruction points at the wrong shelf (F10). |
| 7 | `conclusions` | **Used, unguarded** | Consequences of the readings belong here. Nothing prevents a conclusion from stating a legal requirement (F7). |

**Used: 5/7** (`the-number`, `actors`, `politics`, `counter-case`, `conclusions`).
**Empty: 2** (`flows`, `macro`).

### The 4 orphan groups — material with no column

1. **The date / commencement axis.** Entry into force (1 Aug 2024) versus staged entry into
   application (2 Feb 2025 prohibitions · 2 Aug 2025 GPAI · 2 Aug 2026 the general regime · 2 Aug 2027
   Art. 6(1) embedded high-risk). This is one of my two named pet peeves and it is **half my
   deliverable**. There is no column and, per F4, no field either.
2. **Instrument hierarchy.** Article · recital · annex · implementing act · harmonised standard ·
   Commission guideline. Six kinds of text with four different legal weights, all of which enter the
   notebook as an undifferentiated `facts[]` entry. No column, no field (F3).
3. **Scope and applicability triggers.** Territorial scope under Art. 2, and the carve-outs — military,
   pure research, the open-source exemptions. Not `actors` (it is not *who*, it is *whether*), not
   `politics` (nothing changed, it was always there). Homeless.
4. **Interaction with adjacent instruments.** GDPR, the DSA, the Machinery Regulation. `macro` is the
   structural analogue — "explained in isolation from the market it trades in" is exactly the failure
   mode — but the column is defined in market terms and I will not pretend a relabel is free.

Two of my four orphans are literally two of my seven scored criteria. That is the dial I would watch.

---

## 2. Evidence-floor check

**Where the ladder starts for me: it does not start, because the ladder is not there.**

The four-rung ladder (MEASURED · OBSERVED · INFERRED · ASSUMED) is named in `SKILL.md:90` and in
`env.md § L1`. The schema implements `confidence: high | medium | low` with one worked heuristic —
"Vendor research is `low` by default" (`NOTEBOOK-SCHEMA.md:46`). Those are different instruments
measuring different things, and a run executed faithfully against the schema never touches the ladder
at all. Everything below therefore tests `confidence`, because that is what actually ships.

**Statutory text does not fit `confidence` at any level.** The text of Article 6 is not something I am
*confident about*. It is the object itself — a primary instrument, published in the Official Journal,
whose content is not probabilistic. Mapping it to `confidence: high` puts the consolidated text of the
Regulation in the same bucket as a well-sourced trade-press figure, and that flattening is the exact
sentence my channel exists to prevent. There is no `AUTHORITATIVE` rung, and there is no rung for the
opposite problem either — **interpretive** material (a Commission guideline, an EDPB-style opinion, a
national regulator's position) is persuasive-not-binding, and `confidence` has no way to say so
without pretending the question is one of certainty.

Three specific consequences for my run:

- **A recital and an article are the same object type.** Both are `facts[]` entries with a `claim`
  string. My third pet peeve — "any tool that treats a recital as an obligation" — is not something
  this methodic can commit *or avoid*; it has no vocabulary for the distinction. (F3.)
- **"Vendor research is low by default" has no analogue for me.** The obvious counterpart — *commentary
  is low where the primary text was available* — does not exist. A law-firm client alert and the
  Official Journal both land at whatever the researcher types. (F2.)
- **The confession, not the rule.** Phase 9 invites me to declare "primary sources you used an
  aggregator for" (`RESEARCH-PROMPT.md:109-111`), and the worked notebook does exactly that: *"Still
  no PRIMARY on-chain data … every figure remains aggregator-sourced"*
  (`notebook.json:430`), recorded as a gap and shipped. For a market topic that is a reasonable trade.
  For mine it is the failure mode of the discipline, declared in a footnote after the notebook is
  already built. The methodic knows about primacy and handles it **post hoc** rather than as a
  precedence rule at write time. (F2, `present-broken`.)

**Realistic floor for my topic:** everything load-bearing would be marked `high`, because it is all
primary text — and that uniform `high` would carry no information at all, while the genuinely
uncertain material (whether a given system falls in Annex III, whether guidance will hold) has to be
graded on the same three-point scale as the text it interprets.

---

## 3. Counter-case reachability

**Satisfiable — comfortably.** I contradict the brief here.

My verdict is *"the binding perimeter is narrower and later than the coverage implies."* The strongest
competing legal reading is not hard to state: **Art. 25 and the deployer duties sweep far more
organisations into scope than any tier chart suggests** — a deployer who puts its own name on a system,
or substantially modifies it, becomes a provider and inherits the full Chapter III obligation set; the
Art. 4 AI-literacy duty already applies to essentially everyone; and the transparency duties are not
tiered at all. That reading has named proponents, published sources, and article numbers. It is a
steel-man in the sense Phase 6 means (`:87-89`), and it is the reading I would lose an argument to.

Two caveats that keep this from being a clean pass:

1. **The instruction points elsewhere.** Phase 1's row — "the strongest argument that *nothing unusual
   is happening*" (`:32`), echoed verbatim in `dimensions.ts:36-37` — describes an anomaly-detection
   topic. Executed literally on my subject it produces a search for "is the AI Act overblown"
   commentary. Phase 6 has the right framing; Phase 1 and the board have the wrong one; nothing tells
   the researcher which governs. (F10.)
2. **A competing reading is not a competing *side*.** Engine D's honesty tells (`ENGINES.md:81-96`)
   assume candidate *explanations*. Mine are candidate *constructions* of the same text, where the
   honest verdict is frequently "unsettled until the Court says." The tells still work; the verdict
   slot does not (see § 4).

Criterion 5: **conditional pass.** The material is reachable; the instruction that fetches it is
mis-specified.

---

## 4. Engine availability — `6/7 plausible`, and that is a smell

Per the skill: zero is a blocker, seven is a smell. I am at six, and I do not think that is a
compliment to my topic.

| Engine | Fit | Reading |
|---|---|---|
| **A · Reversal Chain** | **excellent** | My topic is literally a chain of wrong obvious readings — "the AI Act bans this" (it does not), "this binds you" (it binds your vendor), "this applies now" (2027). Four turns without straining. The recommended engine. |
| **B · Effort/Payoff Gap** | **good** | The Annex VI/VII conformity-assessment route is a genuinely punishing mechanism a viewer could be walked through, ending in a CE mark. The disproportion is real and it is funny. Better than I expected. |
| **C · Parallel Case** | **good** | The AI Act *is* product-safety law. Establish CE marking on a toaster, transfer to a model. The best analogy in my field, and this engine is built for it. |
| **D · Adjudication** | **structurally excellent, and the one I would refuse** | Competing readings, weighed, verdict. It fits my material better than anything except A — and its output is a *ruling on a contested question of law*, delivered to compliance officers, from a channel that is not their counsel. See F9. |
| **E · Briefing** | **good** | The only engine that *mandates* a date ("it is January 21st 2025") and a disclosure of the author's exposure (`ENGINES.md:128-130`). For a staged-commencement topic those two obligations are worth more than the engine's structure. Nobody designed that for me and it lands anyway. |
| **F · Anchor Ladder** | **excellent (short)** | The risk tiers *are* naturally ordered difficulty: prohibited → high-risk → transparency-only → minimal, one object, four rungs, each linked by *but*. The highest-density structure in the catalogue and my subject hands it over free. |
| **G · Paradox Teaser** | **fair (short)** | "This is not regulated. Neither is this. This one is — and it applies in 2027." Works, thin. |

**Zero blockers, six plausible fits — and the reason is diagnostic, not flattering.** `ENGINES.md`
discriminates on exactly one variable: the viewer's pleasure (`:7-9`, choosing table `:160-171`). It
never asks what a wrong render *costs*. My material fits six engines because narrative shape is not
the constraint on my topic; **exposure is**, and the catalogue has no axis for it. `engine_fit` is
explicitly to be assessed "from the *material*, not from taste" (`NOTEBOOK-SCHEMA.md:81`), and a
researcher following that instruction faithfully will exclude risk from the assessment, because risk is
not material. That is F9, and I think it is the finding with the widest blast radius outside my own
domain.

---

## 5. Scored criteria — pass/fail against the methodic AS DESIGNED

| # | Criterion | Result | Why |
|---|---|---|---|
| 1 | Every legal claim cites an article or recital number, not a summary | **FAIL** | `facts[].source` is an unconstrained string (`NOTEBOOK-SCHEMA.md:42`); the quality bar asks only for "a source, a date and a confidence" (`RESEARCH-PROMPT.md:122`). No pinpoint-citation field, no rule preferring the primary instrument where it exists. Aggregator sourcing is handled as a declared gap after the fact (`:109-111`), and the worked notebook ships exactly that (`notebook.json:430`). **F2.** |
| 2 | Obligations separated by actor AND by date | **FAIL** | One card, one `DimensionId` (`dimensions.ts:50`). No date column, no `applies_from` field — `as_of` is a currency date and reusing it would corrupt `currency.expires_first` (`NOTEBOOK-SCHEMA.md:47, 84-85`). Both axes exist only inside a prose claim string. **F1 (blocker), F4.** |
| 3 | Binding text vs interpretive guidance preserved, not flattened | **FAIL** | Article, recital, annex, implementing act, guideline and law-firm alert all enter as `facts[]` with a `claim` and a `confidence`. No `authority` or `kind` field. `confidence` is orthogonal — a recital is *certainly* text and *certainly* not binding. **F3.** |
| 4 | `the-number` is not forced on a topic with no natural number | **FAIL** | Forced three ways. It is the first Phase-1 row (`RESEARCH-PROMPT.md:25`), the first column (`dimensions.ts:26`), and the `DEFAULT_DIMENSION` (`:62`) — so anything untagged is *filed as a price claim* (pre-recorded as **G-000**). The `emptyMeans` then asserts that an empty one means "every claim downstream is unanchored," which for a statutory analysis is simply untrue (**F6**). I do have numbers — the Art. 99 penalty ceilings scale-convert beautifully — so this is not a vacuous column for me. It is a column whose stated meaning is wrong and whose gravity is wrong, which is worse than an empty one. |
| 5 | Counter-case is a real competing legal reading, with its source | **CONDITIONAL PASS** | Reachable and abundant. Phase 6 states the right target (`:87-89`); Phase 1 and `dimensions.ts:36-37` state the wrong one, and nothing arbitrates. **F10.** |
| 6 | No conclusion states a legal requirement | **FAIL** | Nothing forbids it. `useFor` (`conclusions.ts:52`) governs *placement*, not modality. The safeguards are opt-in gating and a mandatory falsifier — and a normative claim can carry a falsifier and still be a statement of law. The gating risk runs the wrong way: a fluent, plausible, wrong sentence about what the Act *requires* is precisely the kind that gets gated **in**. **F7.** |
| 7 | Under 45 min equivalent, or the table justifies longer | **FAIL** | ~30 min saved of the 375 she needs, and no table at the end of it. See § 6. |

**1 conditional pass, 6 fails**, including both criteria she names as dispositive. `L1-fail`.

---

## 6. Time-saved estimate

**`~30 min saved · low confidence`** — against a declared 420-min (7h) baseline, where the acceptance
threshold is 45 min, i.e. a required saving of **375 min**. The methodic delivers roughly **8% of what
would make it adoptable.**

The arithmetic, stated so it can be argued with:

| Component | Manual | Under the methodic | Delta |
|---|---|---|---|
| Orientation, finding the live instruments and the state of the implementing acts | ~60 min | ~25 min (Phase 1, 4–8 searches) | **−35** |
| Building the obligation × actor × date table | ~300 min | ~300 min — **no phase addresses this** | 0 |
| Finding the angle / the four sentences that matter | ~40 min | ~20 min (Phase 2 is genuinely good at this) | **−20** |
| Steel-man / competing reading | ~20 min | ~15 min | −5 |
| Overhead: `scale_conversions` for a table, `analogy_candidates`, `currency` advice, reconciling my material to seven columns two of which are empty | 0 | ~30 min | **+30** |
| **Total** | **420** | **~390** | **~−30** |

**Confidence: low**, and I want the reason on the record: `accepted-gaps.md` § `scope-note` says the
app cannot run research at all, so every number here is an estimate of what the methodic *would* save
if executed as written, by a competent researcher, with no product. That is a thick caveat and it cuts
both ways — Phase 2 could plausibly be worth more than I credited if the tension-finding is as good as
the Bitcoin run suggests.

**The shape of the number matters more than the number.** The methodic optimises the hour I am already
fine at and does not touch the five hours that hurt. It is not that it is slow. It is that it is
pointed somewhere else.

---

## 7. Findings

Full records in `bill-analysis--findings.json`. Ids are namespaced `G-L1-BILL-nn` to avoid collision
with nineteen parallel walkers writing to the same run.

| id | title | type | sev | verdict | c/l |
|---|---|---|---|---|---|
| **G-L1-BILL-01** | A card belongs to exactly one dimension; a two-axis obligation table has no representation | schema-gap | **blocker** | confirmed | undecided |
| G-L1-BILL-02 | No pinpoint-citation field and no primary-source precedence rule | missing-instruction | major | confirmed | content |
| G-L1-BILL-03 | No `authority` field: binding text, recital, guidance and commentary are one type | schema-gap | major | confirmed | content |
| G-L1-BILL-04 | `as_of` is a currency date; a staged-commencement topic has no `applies_from` | schema-gap | major | confirmed | content |
| G-L1-BILL-05 | Phase 1 invites domain-derived causal domains; the board cannot accept them | taxonomy-gap | major | confirmed | content |
| G-L1-BILL-06 | `the-number`'s `emptyMeans` asserts something false for non-quantitative topics | wrong-instruction | minor | confirmed | content |
| G-L1-BILL-07 | Nothing prevents a conclusion from stating a normative requirement | missing-instruction | major | confirmed | content |
| G-L1-BILL-08 | `unhinged` is defined as motive; the falsifier rule excludes motive | unsafe | major | **uncertain** | undecided |
| G-L1-BILL-09 | Engine selection has no exposure input, and is told to ignore anything non-material | missing-instruction | major | confirmed | content |
| G-L1-BILL-10 | Counter-case is specified as "nothing unusual is happening" in Phase 1, contradicting Phase 6 | wrong-instruction | minor | confirmed | content |

### Refuter notes — what I dropped or downgraded

- **Dropped: "the methodic produces no table."** True, and it is F1 and F4 restated. Counting it
  separately would inflate my own headline. It lives in § 6 and in the voice.
- **Dropped: "the seven columns are market-shaped."** As framed by the brief this does not survive
  reading `RESEARCH-PROMPT.md:21`. Reframed and re-targeted as F5.
- **Dropped: "conclusions have no sources."** `accepted-gaps.md` — by design.
- **Dropped: untagged cards fall into "The number."** `G-000`, pre-recorded. Cited, not re-raised.
- **Downgraded F10 to minor.** Phase 6 states the correct framing, so a competent execution likely
  resolves the contradiction correctly. `present-broken`, not `confirmed-absent`.
- **Downgraded F8 to `uncertain`.** I went in expecting to confirm the brief's lead and the one worked
  instance refutes it: the Bitcoin `unhinged` conclusion falsifies the *behaviour* rather than the
  motive, and that falsifier is genuinely checkable. The definitional contradiction is real; the
  demonstrated harm is not. L2's job.
- **Re-tested F1 hardest, because it is my blocker.** *Is this my topic being exotic?* No — a cross-tab
  is normal material: sanctions (measure × entity × date), streaming rights (title × territory ×
  window), CVE analysis (vuln × version × patch date). *Would a competent execution produce it
  anyway?* Only by packing three fields into one `claim` string, which nothing downstream can read and
  which `NOTEBOOK-SCHEMA.md:93` argues against. *Is it present somewhere I did not read?* I checked the
  schema, the dimension module and the conclusion module for any multi-tag, facet or matrix
  affordance. There is none. It holds.

---

## 8. Voice — Priya

I want to start where I was wrong, because I came into this expecting to dislike it and one column
changed my mind.

**"Politics & regulation — what changed, and *whether it was actually implemented*."** That is a better
column than most legal analysis has. It is the discipline that separates people who read the Official
Journal from people who read the press release, and someone wrote it into a general-purpose research
tool for a topic about Bitcoin. The whole spine of my video — the obligations that do not exist yet
because the harmonised standards they depend on have not been published — has a home there, and it was
not built for me. That is genuinely good design and I am not going to pretend otherwise to make a
tidier verdict.

**Now.** I would not adopt this, and the reason is not any of the ten findings. It is that I read nine
files carefully and never once found the thing I actually make. My deliverable is a table. Seven
hours of my week is a table. Every phase of this process — tension, mechanisms, reversals, scale
conversions, steel-man — is beautifully specified machinery for turning research into *narration*, and
it is all downstream of an artifact this system has no shape for. It gave me a superb answer to "how
do I make this watchable" and no answer at all to "what does it say." I did not need help with the
first one. I have a voice and fifteen years of contempt for imprecision; the watchability takes care
of itself.

The moment that decided it: `CARD_DIMENSION` is `Record<string, DimensionId>`. One card, one column.
I sat with that for a while, because it is such a small line of code to be dispositive. An obligation
is not a fact about a subject — it is a *cell*. It has a row (which article), a column (who it binds),
and a depth (when it starts). Filing it under "Structural actors" and calling that done is like
publishing a spreadsheet as a bulleted list and saying the information is all still there. It is. It is
just no longer usable, and usable is the entire product. And I do not think a lens fixes this, which is
the uncomfortable part — a lens gives me different *columns*, and my problem is not which columns, it
is that a card can only be in one of them. Somebody has to change the mechanism or tell me honestly
that my material is out of scope. I would respect the second answer.

**What I would not trust it with, specifically.** Any sentence beginning "the Act requires." Nothing
in this system distinguishes an article from a recital, and nothing distinguishes a conclusion that
says *"deployers who rebrand a system inherit provider obligations"* — which is a legal claim, sourced
to nothing, reasoned by a model, sitting in a column whose own header says it has no sources — from a
conclusion that says *"most companies will discover this too late,"* which is a consequence and
perfectly fine. Those two sentences look identical in this schema. They carry identical falsifiers.
One of them is a compliance officer making a decision from my video and being wrong on my authority.
That is not a hypothetical for me; it is the reason there is a disclaimer on every upload, and this
methodic gives me exactly one new safeguard against it — a gate I have to operate myself, on a claim
that is *more* persuasive precisely because it is well-written.

And I will say the hard thing about the engines, because it is the part nobody will raise. Six of seven
fit my topic. The catalogue is proud of that — it sorts on "the viewer's pleasure," which is a real and
well-observed variable. But `Adjudication` is described as "the natural engine for *why did X happen*
where the honest answer is contested," and its structure is question → candidates → **verdict**. Run
that on a disputed reading of Article 6 and you have produced a legal opinion with a hook. The
document that would have to warn me about that is `ENGINES.md`, and it contains no such sentence about
any engine, and `NOTEBOOK-SCHEMA.md` actively instructs me to assess engine fit "from the material,
not from taste" — as though the cost of being wrong were a matter of taste. In my field it is a
matter of somebody's audit.

Two smaller things that will sound like nitpicks and are not, because in my work they *are* the work.
First, the evidence ladder I was told to test does not exist; there is a three-point confidence scale
that grades how sure the researcher feels, and the text of a Regulation cannot be graded on it in any
way that means anything. Second, `as_of`. If I put 2 August 2027 in that field — the day the
obligation starts, the single most important number in my entire video — the currency logic reads a
fact from the future and the whole freshness model quietly breaks. The one date the system offers me
means the opposite of the date I need. That is the kind of collision you only find by walking a real
topic through, and it is why this exercise was worth the afternoon even though the answer is no.

Would I run L2 on it? Yes, and I would push for it. Everything above is a paper reading, and a paper
reading of an instruction set is the most charitable reading there is — I have been imagining a
competent researcher following these phases, and I have no idea whether a real run cites Article 6 or
cites a law firm's summary of Article 6. That is the half of my senior bar I cannot see from here, it
is the half that decides whether any of this is usable, and I would rather be proved wrong by an
artifact than right by an argument.

That is not a compliment. It is the only sentence in this report I am fully confident in.
