# L1 dry fit — `sanctions-trade` · Tomás Reinholt

**Topic:** The oil price cap — what it was supposed to do, what shipping data says it did, and why
both sides can cite the same numbers.
**Area:** geopolitics · **Lens binding:** geopolitics · **Level:** L1 (paper, no searches, no browser)
**Verdict: `L1-fail`**

> **Reading disclosure.** `gauntlet/lens-spec.md` was not opened. A repo-wide grep for the ladder
> tokens (`MEASURED|OBSERVED|INFERRED|ASSUMED`) returned four incidental lines from that file in its
> output. They are not used below; every claim in this report is sourced to an artifact I read in
> full, and I have deliberately reached a different conclusion about the ladder than those lines
> suggested (see § Evidence floor / F9). Recording it because a walker who quietly absorbs the
> orchestrator's hypotheses is the failure this dispatch was designed against.

---

## Contradicting the brief, first

Three of the four orchestrator leads do **not** survive contact with this topic:

- **HYPOTHESIS "the seven columns are market-shaped and will collapse or leave orphans."**
  *Partly contradicted.* My material fills **all seven**. The columns are not the problem. What
  breaks is one layer down — the schema, which has no way to hold a *relationship between two facts*.
  Reporting a column gap here would have been the wrong diagnosis and would have bought a lens I
  don't need.
- **HYPOTHESIS "Phase 1's counter-case row is unsatisfiable for topics with no literature."**
  *Contradicted for this topic.* The "the cap worked" literature is abundant, adversarial and
  well-funded on both sides. Criterion #3 passes on design.
- **HYPOTHESIS "the `unhinged` tier is unsafe when a conclusion names a living person; contradict me
  if the falsifier requirement already constrains it adequately."** *Confirmed, and worse than
  stated* — but not for the reason implied. The falsifier requirement constrains **checkability**,
  not **naming**, and nothing anywhere in the methodic constrains naming at all. See F4.
- **HYPOTHESIS "the ladder has no honest rung for interpretive evidence."** *Reframed.* The premise is
  wrong: the MEASURED·OBSERVED·INFERRED·ASSUMED ladder **does not govern notebooks in the first
  place.** See F9. That is a bigger finding than the one the lead was fishing for.

`G-000` (untagged cards → "The number") is acknowledged and not re-raised.

---

## 1. Column utilisation

**`columns 7/7 used · 2 orphan groups`**

| Column | Holds? | My material |
|---|---|---|
| **the-number** (`dimensions.ts:26`) | ✅ but see below | Cap level ($60 crude / two product tiers), Urals & ESPO discounts to Brent, Russian oil-and-gas budget revenue, export volumes. |
| **flows** (`:28`) | ✅ **strongest fit** | Attestation regime and IG P&I insurance denial as the *announced* plumbing; shadow-fleet tonnage, ship-to-ship transfers, AIS gaps, non-IG insurers and third-country refining as the *observed* plumbing. The column's own purpose line — "whether it behaves as assumed" — is my thesis verbatim. |
| **actors** (`:30`) | ✅ | Sovcomflot, Greek and UAE operators, IG clubs, Indian and Chinese refiners, the traders in the middle. |
| **macro** (`:32`) | ⚠️ stretched but used | Brent level, freight rates, dollar, Russian fiscal balance. The column is written for *financial* macro ("rates, currency, liquidity, correlation with other assets"); mine is commodity-and-logistics macro and freight is a cost input, not a correlate. Label problem, not a structural one. |
| **politics** (`:34`) | ✅ **strongest fit** | Its `emptyMeans` — "Policy is being assumed to work, or assumed not to" — is my beat's founding complaint written into the product. Designations, EU packages, wind-down periods, the December 2022 / February 2023 entry-into-force split. |
| **counter-case** (`:36`) | ✅ | Treasury/KSE/CREA-shaped argument that the cap achieved its *dual* objective — oil kept flowing, discount widened, evasion cost is itself a tax. |
| **conclusions** (`:38`) | ✅ | Reasoned synthesis of the above. Holds it — and that is the problem (F4). |

**Orphan group 1 — measurement provenance.** *How each price series was constructed.* FOB Primorsk
assessment versus delivered-India minus assumed freight versus Russian customs value versus the
Ministry of Finance's tax-reference price. These are four different objects wearing one word. This
material is not a value, so it is not `the-number` ("what the price actually did"); it is not
plumbing, an actor, macro, policy, or a counter-case. It is the *epistemics of the measurement*, and
there is nowhere to put it. **For this topic it is not marginal material — it is the story.**

**Orphan group 2 — window selection and date typing.** Announcement date, entry-into-force date,
wind-down expiry, first designation, first *filed* enforcement action. Five different dates, and
which one you anchor to determines whether the cap "worked". `Fact` carries a single `asOf`
(`types.ts:24`), defined as when the claim was true or reported. There is no field for the date of
the *event described*, and no column for the periodisation argument itself.

Neither orphan is fixed by a new column. Both are fixed one level down, in the schema.

---

## 2. Evidence-floor check

**Where the ladder starts here: it doesn't, because the ladder is not applied to notebooks.**

The MEASURED·OBSERVED·INFERRED·ASSUMED ladder lives in `knowledge/README.md:32-41` and is explicitly
scoped: *"Every line in a `PATTERNS.md` carries one."* It grades **craft claims about video
structure**, not research facts. A notebook fact carries `confidence: high | medium | low`
(`NOTEBOOK-SCHEMA.md:42-47`, `types.ts:12`) and nothing else. So the rubric's `evidence` dimension
(`rubric.md:62`) is scoring a ladder that no artifact under test applies to my material. → **F9.**

On the axis that *is* live, here is where my material actually lands:

| My evidence | Honest grade | What the methodic does to it |
|---|---|---|
| EU/G7 regulation text, OFAC designations, filed enforcement actions | `high` | Fine. This is the only tier where I will assert a breach. |
| Argus / Platts Urals & ESPO assessments | **should be `high`** | `NOTEBOOK-SCHEMA.md:46`: *"Vendor research is `low` by default."* A price-reporting agency is a vendor. This demotes the assessment the EU's own regulation points at. → **F3** |
| Russian customs / MinFin tax-reference price | `medium`, and *contested by construction* | Reduced to a second `medium` fact sitting next to the first with no relation between them. |
| AIS tanker tracking, shadow-fleet counts | `medium` | Reasonable. But AIS is spoofable and gaps are themselves evidence — "medium" collapses "the transponder said so" and "the transponder went dark, which is the finding" into one word. |
| Think-tank revenue estimates (KSE, CREA) | `medium` at best — modelled | Also caught by the vendor default; here the demotion is correct. |

**Does a downstream rule demote my best material?** Yes, twice.
`RESEARCH-PROMPT.md:100` — *"Vendor statistics → use the direction, not the number, or cut it"* —
applied literally to price assessments means my script may not state a cap-relative price at all,
which is the one number the audience came for. It is overridable, because `confidence` is free text
in the JSON ("medium — price sources vary by a few thousand", `notebook.json:43`), so this is a
default that misfires rather than a wall. Major, not a blocker.

---

## 3. Counter-case reachability

**Satisfiable.** Phase 1's last row (`RESEARCH-PROMPT.md:32`) and Phase 6 (`:88-93`) are both
comfortably reachable for this topic: the "the cap worked" case is stated at full strength by
national treasuries and by two respectable research shops, in their own words, with numbers. I can
write a `steel_man` I actually find hard to answer — which is the test.

One structural nit, minor and honestly uncertain: the same material has **three homes** —
the `counter-case` column (`dimensions.ts:36`), `steel_man` (`NOTEBOOK-SCHEMA.md:61-65`), and
`counter_positions_to_state_fairly[]` (`:74`) — and no rule says which gets what. Only `steel_man` is
enforced by the quality bar. The Bitcoin run coped by putting facts in the column and referencing
them from the steel-man, so the mechanism evidently works; I record it as a discoverability nit.
→ **F8**, `uncertain`.

---

## 4. Engine availability

Walked all seven from `knowledge/ENGINES.md`:

| Engine | Fit | Why |
|---|---|---|
| **A · Reversal Chain** | **excellent** | `obvious_reading`: "the cap failed, Russia sells above it." Turn: it worked for about five months. Turn: the routing around it cost real money, which was also the point. Turn: both sides' numbers are correct and measure different objects. Four turns, escalating, ending on measurement. |
| **B · Effort/Payoff Gap** | **good — and unexpected** | The attestation regime *is* a mechanism a viewer can operate: sign a form, hand it to a broker, the broker hands it to an insurer, and the payoff is a signed document nobody verifies. This is the one place I get animated, and it is the only engine that lets the paperwork be the star. |
| **C · Parallel Case** | medium | Iran's oil sanctions or the Kimberley Process transfer the rule. Real, but the second domain needs as much building as the first. |
| **D · Adjudication** | **good, with a caveat that matters** | The natural shape for "did it work". But D-honest tell #1 (`ENGINES.md:87-90`) demands the premise be *one candidate in the set* — "the thing may be mismeasured." For my topic mismeasurement is not a candidate, it is the **condition of every candidate**; each theory is evaluated with a contested series. Made a candidate, it gets weighed and discarded like the others, and the video walks past its own load-bearing problem while feeling rigorous. → **F7** |
| **E · Briefing** | poor | Standing condition, not news. Same reason the Bitcoin run rated it poor. |
| **F · Anchor Ladder** | good *(short)* | One cargo, one bill of lading, walked rung by rung through the loophole. |
| **G · Paradox Teaser** | **excellent** *(short)* | "Both sides cite the same number and reach opposite conclusions" is a flat contradiction that must resolve. Almost purpose-built. |

**Six of seven plausibly render.** Per the SKILL, "seven is a smell (it means the notebook has no
shape)". Six is close, and I do not think it is a compliment. It is a symptom: my material's shape is
*epistemic*, and an epistemic story can be pointed at almost any engine, so `engine_fit` gives me
weak signal precisely where I most need help choosing. Not a blocker — but noted, and I would want
L2 to check whether that many fits survive contact with a real notebook or collapse to two.

---

## 5. Scored criteria

| # | Criterion | Result | Reason |
|---|---|---|---|
| **1** | Two conflicting series both present, **with the conflict named as a fact** | **FAIL** | Both series can be *written* as `facts[]`. Nothing can represent the conflict. `Fact` (`types.ts:16-26`) has no relation field. The prompt's only handling of this case — `RESEARCH-PROMPT.md:102`, *"Two datasets that appear to contradict → present as competing readings, never pick silently"* — is filed under **Phase 7, "Record what you don't know."** So the disagreement is classified as an *absence of knowledge*, and `Unknown.impact` is defined as "What the script may NOT say" (`types.ts:72`). My central finding can only enter the script as a **prohibition**. Worse: `Unknown.resolvedBy` (`:77`) encodes resolution as the success state, and the worked reference proves the intent — `u-cohorts` resolves and the note reads *"The script MAY now name the seller"* (`unknowns.ts:19`). My conflict is irresolvable **by construction** — the series measure different objects at different points in the chain — so the methodic's own exemplar models the exact behaviour I need it not to have. → **F1**, blocker. |
| **2** | `flows` separates announced mechanism from observed one | **PASS** | `dimensions.ts:28` is written for this — "whether it behaves as assumed" — and `reversals[].obvious_reading` (`NOTEBOOK-SCHEMA.md:56`) gives the announced version a first-class home with a "state it generously" rule that stops me strawmanning the regulation. The best-designed part of the methodic for my beat. Enforcement is implicit rather than required, which I'll accept. |
| **3** | Counter-case includes the strongest "the cap worked" argument, sourced | **PASS** | Phase 6 is a hard requirement (`RESEARCH-PROMPT.md:92`), `steel_man` is mandatory (`NOTEBOOK-SCHEMA.md:97`), and the literature exists. |
| **4** | No conclusion attributes a breach to a named entity without a filed action | **FAIL** | There is **no naming rule anywhere in the methodic.** I grepped for it: exposure, defamation, named-party and allegation language appear only in `.claude/skills/gauntlet/SKILL.md:133` — in the *test harness*, not in the thing being tested. `conclusions.ts` requires a falsifier, which constrains *checkability*, never *who is named*. The `unhinged` tier is defined as "a claim about MOTIVE… nobody can source what someone intended" (`:32-34`) and is held to a *higher* bar — but the higher bar is still only "state a falsifier." The shipped exemplar `c-reserve-was-the-product` (`:164-179`) makes an unfalsifiable-in-practice motive claim about a named administration and passes the rule as written. Point that machinery at a Greek shipowner and it manufactures a libel with a footnote. Separately, the schema has no way to mark the distinction my whole beat rests on: **evidence of pattern** (AIS) versus **evidence of breach** (a filed action). → **F4**, blocker. |
| **5** | Unknowns recorded as unknowns and reach the script as hedges, not silently dropped | **PASS — and it is genuinely well built** | `Unknown` has a stable `id` *because* array-position addressing crashed the Script step's constraint ledger (`types.ts:60-67`), and resolved unknowns are kept rather than deleted (`:74-78`). That is a scar someone paid for and wrote down. The hedging pipeline works. My complaint under criterion 1 is not that hedging is broken — it is that hedging is the **only** channel available, and my best material is being forced down it. |
| **6** | Rendered script's causal claims survive re-reading against fact ids | **DEFER to L2** | Unassessable on paper. The mechanism exists (`reversals[].evidence[]`, `steel_man.evidence[]`), and the SKILL's unsourced-claim sweep is the right test. Note for L2: `mechanisms[].chain` is free-form strings with no fact ids attached (`types.ts:37`), so a chain link can assert a causal step no fact supports — check that specifically. |
| **7** | Under 2h equivalent | **FAIL** | ~5h saved of a 14h baseline leaves ~9h. See § 7. |

**3 pass · 3 fail · 1 deferred.** Two of the failures are blockers, and one of them is my senior bar.

---

## 6. Findings

Full schema in `sanctions-trade--findings.json`. Summary, impact-ranked:

| id | Title | Sev | Targets | Verdict |
|---|---|---|---|---|
| `G-L1-ST-01` | Dataset conflict is classified as an unknown, and unknowns are prohibitions | blocker | notebook-schema, research-prompt | confirmed |
| `G-L1-ST-02` | No naming or breach-attribution policy exists in the methodic at all | blocker | conclusions, notebook-schema | confirmed |
| `G-L1-ST-03` | "Vendor research is `low` by default" demotes the regulation's own reference price | major | notebook-schema, research-prompt | confirmed |
| `G-L1-ST-04` | The evidence ladder does not govern notebooks; the rubric scores a ladder that isn't applied | major | notebook-schema, knowledge | confirmed |
| `G-L1-ST-05` | Two conflicting facts land in one column with no pairing; either can be descoped silently | major | dimensions | confirmed |
| `G-L1-ST-06` | `DIMENSIONS` universalises a table the prompt scoped to market/economics, and is closed | major | dimensions | confirmed |
| `G-L1-ST-07` | No engine for "the measurement is the subject"; D-honest demotes it to one candidate | major | engines | confirmed |
| `G-L1-ST-08` | Counter-case material has three homes and no allocation rule | minor | notebook-schema, dimensions | uncertain |
| `G-L1-ST-09` | `asOf` cannot distinguish announcement date from effect date | minor | notebook-schema | uncertain |

**Refuted and dropped:** "the seven columns can't hold a sanctions topic" — they hold all seven, and
recording it would have bought a lens the evidence does not support. "Counter-case unreachable" —
reachable. "Conclusions have no sources" — that is `accepted-gaps.md § by-design`, not a defect.

Every finding is `content_or_lens: content`. I could not construct a case that the shared mechanism
**cannot** hold my material — every one of my blockers is repaired by adding a field or a rule, not
by forking the process. A lens here would be my preference dressed as a discovery, and the bar in
the SKILL correctly forbids that.

---

## 7. Time saved

**Baseline:** 14h across 5 days. Reconciling three incompatible price series is 8–10h of it.
**Acceptance:** 2h.

| Phase | Saves me | Est. |
|---|---|---|
| Phase 1 breadth (4–8 searches) | Replaces the tanker-data and think-tank sweep | ~180 min |
| Phases 2–4 (tension, mechanisms, reversals) | Real structural help; the alternating-chain rule is genuinely better than my own outlining | ~60 min |
| Phase 6 (steel-man) | I already read the opposing shop, but the "in their own words" rule sharpens it | ~40 min |
| Phases 5, 8, 9 | Scale conversions, engine fit, declared gaps | ~30 min |
| **Phase 7 (reconciliation)** | **Nothing.** It routes my hardest 8–10h into a hedge and asks me to move on | **0 min** |

**`~310 min saved · medium confidence`** — leaving ~9h, against a 2h acceptance bar.

Two caveats, both mandated. Per `accepted-gaps.md § scope-note`, this is an estimate of what the
methodic *would* save if executed as written, not a product measurement — there is no runner. And the
saving is real: 5h is not nothing, and I am not going to score it negative to make a point. It simply
lands on the wrong side of my line, because the methodic saves me the part I find easy and skips the
part that costs me the week.

---

## 8. Voice — Tomás Reinholt

I want to start with what is good, because I am going to be hard afterwards and a review that only
complains is as useless as one that only flatters.

The `flows` column and the `obvious_reading` rule are better than my own process. I have written the
"here is what the cap was supposed to do" section of this video four times in my head and it always
comes out as a sneer, because I already know the ending. A field that says *state it generously, a
strawman here becomes a strawman on screen* is a discipline I do not currently impose on myself, and
I would take it whether or not I take anything else. The unknowns ledger is honest work — somebody
crashed a step by deleting an unknown and, instead of patching it, wrote down why resolved unknowns
must be kept. That is a person who has been burned and learned. I trust files written by people who
have been burned.

Now. **The thing I brought this topic for is the thing it cannot do.**

My video is called *why both sides can cite the same numbers*. There are two price series. The
Argus assessment is FOB at a Russian port. The delivered-India figure is CIF minus an assumed
freight rate that nobody publishes honestly, because the freight rate is where the evasion is
priced. Both are correct. They measure different objects at different points in the chain, and the
gap between them is not noise and is not an error — it is the sanctioned trade's margin, rendered as
a discrepancy. That gap **is the video.**

I open the schema looking for where it goes, and the only door is Phase 7: *record what you don't
know*. And I read the definition of that field — "what the script may NOT say" — and I understand
that this methodic has looked at my central finding and classified it as ignorance. Then I read
`u-cohorts` in the worked reference: two contradictory readings, held for one round, resolved by a
follow-up, and the celebratory note reads *"The script MAY now name the seller."* The whole design
points one direction — a contradiction is a temporary condition to be cleared. Mine is permanent. It
is permanent *for a reason*, and the reason is the story. A tool that treats my thesis as a defect
awaiting a follow-up round has not misfiled it. It has argued with it, and won by default, because I
have no field to argue back in.

The fix is small, which is the frustrating part. `facts[].contests: ["f-other"]` plus one sentence in
Phase 2 — *"a disagreement between two credible sources about the same quantity is a candidate
tension in its own right"* — and my topic becomes the methodic's best case instead of its worst. It
would sit next to shape 5, "the category error — the subject is being measured with the wrong
instrument," which is *already in the prompt* and is one door away from what I need. Somebody was
looking straight at this and stopped short.

The second thing I will not trust it with is names, and here I am not annoyed, I am alarmed. I went
looking for the exposure rules and found them in the wrong file. `SKILL.md:133` says a Creator must
state what their lawyer would say about a conclusion naming a living person or an identifiable
company. Excellent — except that instruction is addressed to the *test*, not to the *tool*. The
methodic itself contains no naming policy of any kind. And the object it hands me is a synthesis
engine with a tier explicitly reserved for claims about **motive**, held to a higher bar that turns
out to be "write down a falsifier." A falsifier is not a defence. "This is wrong if a court finds
otherwise" is a falsifier, and it is also, in the same breath, an allegation about a company with
insurers and a legal budget.

The distinction my entire beat rests on is between **evidence of pattern** and **evidence of
breach**. A vessel goes dark for eleven hours off Kalamata: that is a pattern. An OFAC designation
naming that vessel: that is a breach, as filed. I will say the first in a video every week of my
life. I will say the second only with the docket number on screen. The notebook has no field that
distinguishes them, and the conclusions layer will happily reason across both and produce a sentence
in my voice that I would never write. The `restsOn` array will list an AIS fact and a designation
fact side by side, indistinguishable, and the falsifier will make it feel rigorous while it does it.
That is not a tool being unhelpful. That is a tool building a specific, expensive mistake and
labelling it "the hottest take."

Smaller things. Nobody has thought about dates. `asOf` means "when this was true or reported", and I
have five different dates for one policy — signed, in force, wind-down expired, first designation,
first filed action — and the difference between the first and the last is eighteen months and the
entire argument. My single loudest pet peeve is an announcement date presented as an effect date, and
the schema has exactly one date field and no opinion about which kind it holds. And the vendor rule
would have me hedge away the one number the audience actually came for, because a price-reporting
agency is technically a vendor — never mind that the regulation itself points at their assessment.

Would I adopt it? **Not for this piece.** I would adopt it tomorrow for a different one — give me a
single-mechanism story where the announced plumbing and the observed plumbing come apart and the
numbers aren't contested, and this thing is faster and more honest than I am. It is genuinely good at
"the policy was announced and never implemented." That is half my beat.

The other half is "the numbers disagree and the disagreement is the finding," and for that half the
methodic is not merely unhelpful. It is confidently wrong in a direction that would make me *worse* —
it would hand me a clean notebook with one series, a footnote confessing the other exists, and a
hedge where my argument should be. That is precisely the piece my editor killed, and precisely the
mistake she taught me to stop making. I am not going to relearn it from a JSON file.

Two fields and one paragraph. That is what stands between this and my adoption. I would like it on
the record that I asked for both before L2, because running my topic live against the current schema
will produce a notebook that looks fine and hides the interesting part — and a notebook that looks
fine is the most dangerous artifact in this repo.
