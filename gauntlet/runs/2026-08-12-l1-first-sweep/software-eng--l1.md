# L1 dry fit — `software-eng` · Kenji Alvarez ("Load Bearing")

**Topic:** *"Microservices went from default advice to cautionary tale in about six years. The
evidence for both positions is the same evidence."*
**Area:** tech · **lens-binding:** tech · **Level:** L1 (paper, no searches, no browser)
**Manual baseline:** ~6h (360 min) · would accept 60 min.

**VERDICT: `L1-conditional`.**

Nothing structurally blocks the topic. Every column takes material, four engines render it well, and
the counter-case is reachable and strong. It is conditional on two majors that land squarely on my
two hardest scored criteria — and one of them is not a hypothetical, because the reference run
already failed it in a way I can cite by line.

---

## 1. Column utilisation

```
columns 7/7 used · 2 orphan groups
```

Orphans named: **documented reversals** · **org-size / team-topology context**.

I was told to expect a market-shaped column set that would collapse on a non-market topic. It
doesn't. I'll take the hypotheses one at a time and mostly contradict them.

| Column | Where my material goes | Honest strain |
|---|---|---|
| **The number** (`dimensions.ts:26-27`) | Service counts, deploy frequency, p99 added per hop, incident volume, headcount at migration. Amazon Prime Video's 2023 consolidation, Segment's 140→1, Uber's ~2,200 services. | Real, but the *cardinality* is wrong. `purpose` reads "What the price actually did, and over what window" — one series, one window. My topic has N incomparable numbers from N orgs, and the fact that they are incomparable **is the finding**. The column holds them; it cannot hold "these numbers do not sit on one axis". |
| **Flows & plumbing** (`:28-29`) | Better fit than I expected. The "plumbing" is how the *advice* propagated: conference circuit, consultancy engagements, Netflix/Amazon engineering blogs, Conway's Law as a distribution channel. "Does the plumbing behave as people assume" is exactly the right question about a norm cascade. | None. Clean placement. |
| **Structural actors** (`:30-31`) | AWS, Netflix, Amazon, Uber, ThoughtWorks; Fowler, Newman, Cockcroft. "What governs *their* behaviour" is load-bearing here: AWS's incentive is that a decomposed system bills more managed services. | None. This column is doing real work. |
| **Macro** (`:32-33`) | **My own Creator file predicted this would be empty and it is wrong.** ZIRP → cheap capital → large eng orgs → org-shaped architecture; 2022 rate rise → layoffs → cost scrutiny → consolidation. The decline of the pattern correlates with the end of free money at least as well as with any technical learning. | None, and this is the strongest argument *for* the shared column set in my whole pass — see §7. |
| **Politics & regulation** (`:34-35`) | Governance rather than statute: Bezos's ~2002 API mandate, org-wide platform mandates, "all teams will expose service interfaces". "What changed, and was it actually implemented" has the absent-thing shape — the mandate was implemented at Amazon and cargo-culted elsewhere without the org that made it work. | Stretched. Placeable, and I'm counting it as used because I can name dated, sourceable artifacts. A reviewer scanning for "regulation" will not think to look here. |
| **The counter-case** (`:36-37`) | Abundant. See §4. | None. |
| **Conclusions** (`:38-39`) | "Never wrong, just mis-scoped" lives here, as it should — reasoned, not researched, OFF until let in. | None. |

**Orphan 1 — documented reversals.** Teams that adopted and reverted are, in my field, the single
most valuable evidence class and the scarcest. There is no column for them. `CARD_DIMENSION`
(`dimensions.ts:50-60`) scatters `r1`–`r4` across flows/actors/politics/macro, so a reversal card is
filed by *subject* rather than by *what makes it evidentially special*. Consequence: I cannot stand
at the board and ask "did we get reversals, or only adoptions?" — which is the one question my senior
bar is made of. The board can show me a full house of seven columns while every card in it came from
a company advertising its own success.

**Orphan 2 — org-size / team-topology context.** My thesis is a *scoping* claim: the pattern's costs
dominate below some organisational size. There is no column for the size, and (worse, §3) no field
either. "Microservices cost more than they return below roughly fifty engineers" has to be written as
a prose claim string with the qualifier buried inside it, where nothing enforces it and nothing can
query it.

Neither orphan justifies a lens. Both are content: one new column, one new field.

---

## 2. Evidence-floor check — my central test

I was asked whether the ladder demotes *widely-reported practitioner experience* — "everyone who ran
this at scale hit the same wall" — relative to a vendor benchmark that would count as MEASURED. I
read before concluding, and the answer is more interesting than the hypothesis.

### 2a. The ladder the brief describes is not the ladder the notebook uses

`MEASURED · OBSERVED · INFERRED · ASSUMED` does not appear in `NOTEBOOK-SCHEMA.md`,
`RESEARCH-PROMPT.md`, `dimensions.ts` or `conclusions.ts`. Not once. I grepped.

What a notebook fact actually carries is `NOTEBOOK-SCHEMA.md:42`:

> `{id, claim, load_bearing, source, confidence, as_of, note?}`

and `:46`:

> **`confidence`** — `high | medium | low`, with the reason. Vendor research is `low` by default.

That is a **confidence axis, not an evidence-type axis**. Nothing in it forces a claim to a rung
because of *how* it was come by. I can file "every team that crossed roughly a hundred services
reported the same distributed-tracing tax" at `high` confidence, state the reason, and the schema is
satisfied — `confidence` is explicitly "with the reason" and the reason may be plurality.

And then it goes further in my favour. The **one hard calibration rule in the entire ladder is
anti-vendor**: `NOTEBOOK-SCHEMA.md:46` demotes vendor research to `low` by default,
`RESEARCH-PROMPT.md:100` says vendor statistics → "use the direction, not the number, or cut it",
and `NOTEBOOK-SCHEMA.md:108` names *laundered confidence* — a vendor statistic promoted to fact by
restatement — as an anti-pattern.

So: **hypothesis refuted, twice.** There is no INFERRED rung for my material to be demoted to, and
the vendor asymmetry runs the *opposite* direction from the fear. My pet peeve #1 is codified as a
default. I did not expect to write that sentence.

### 2b. But the four-rung ladder does exist, and it is scheduled to arrive

`knowledge/README.md:36-41` defines it canonically:

| Label | Means | Requires |
|---|---|---|
| MEASURED | Counted from the corpus | The number, the script that produced it, the sample size |
| OBSERVED | Read off a specific moment | `source · [mm:ss]` + the quoted line |
| INFERRED | Our reasoning across sources | The observations it rests on, stated |
| ASSUMED | Nobody has checked | An entry in `OPEN-QUESTIONS.md` naming what would settle it |

Today that grades **the library's claims about craft**, not a notebook's claims about the world —
`ENGINES.md:41`, `:52`, `:64` use it on the corpus. Fine. Except `pipeline/DIRECTOR-DIMENSION.md:9`
adopts those labels wholesale — "Evidence labels are the library's" — and
`DIRECTOR-DIMENSION.md:3-5` states plainly that the document **"proposes changes to
`NOTEBOOK-SCHEMA.md`"**.

Run my material through those four rungs and the hypothesis I just refuted becomes true:

- A vendor benchmark with a stated sample size satisfies MEASURED — "counted", "sample size" — rung 1.
- Each individual practitioner write-up is OBSERVED (source + quote) — rung 2.
- **The consensus claim itself — the thing I actually want to say — is INFERRED**: "our reasoning
  across sources." Rung 3 of 4, one rung above *nobody has checked*.

That is precisely the inversion the hypothesis feared, and the demotion is not a present defect but a
**scheduled** one, sitting in an unimplemented design proposal that nobody reading `NOTEBOOK-SCHEMA.md`
would find. Two evidence vocabularies live in this repo; one of them is queued to overwrite the other,
and the queued one is worse for every domain whose evidence is testimony rather than telemetry. Filed
as `G-l1s-se-04`, pre-emptively, because it is cheaper to fix in a proposal than in a schema.

### 2c. The real present defect: consensus is plural and the field is singular

`facts[].source` (`NOTEBOOK-SCHEMA.md:42`) is **singular**. `as_of` is **one date** (`:47`).

Consensus evidence is plural by construction — its entire strength *is* the count of independent
corroborating reports, accrued over years, not on a date. There is no field for n, no field for
independence, and no way to distinguish nine teams reaching the same wall from nine blog posts
citing the same Netflix talk. That second thing is how my strongest evidence class gets faked, and I
have watched it happen for six years.

The reference run hit this on the very first topic and worked around it in a string:

```json
{ "id": "f-now", "source": "invezz, crypto.news, intellectia", "confidence": "medium — price sources vary by a few thousand" }
```

Comma-joined plurality in a singular field, on run 1, on a market topic. This is not exotic.

The repair is already written down elsewhere in this repo and simply wasn't carried across.
`knowledge/README.md:45-46`: **"n is always visible. Two sources is two sources. A pattern seen in
both is a hypothesis, not a law, and it says so."** That is exactly the discipline my domain needs,
applied to the library's own claims and withheld from the notebook's. Filed as `G-l1s-se-05`.

**Verdict on scored criterion 3: PASS, with a caveat and a warning.** The ladder in force does not
demote me. The ladder in the queue does.

---

## 3. Survivorship

My senior bar: the notebook's evidence must include teams that **reversed** the decision, not only
teams that adopted it. Survivorship is the whole methodological problem in my field.

I walked the search strategy looking for anything that pushes toward failures. There is one candidate
and it is not the same search.

`RESEARCH-PROMPT.md:32` — the counter-case row:

> **The counter-case** — Search explicitly for the strongest argument that **nothing unusual is
> happening**.

Read the direction of that. It hunts the **null hypothesis** — the status-quo defence. For me that
returns "microservices are fine, you're holding it wrong", which is genuinely my needed steel-man
(criterion 4, and it passes — §4). It does **not** return teams that quit. Those are different
searches, and conflating them is the trap: a run can satisfy the counter-case row completely,
honestly, at full strength, and still have read nothing but adoption literature plus one defence of
adoption literature.

Nothing else in the prompt pushes against the grain:

- Phase 1's six rows (`:25-32`) are all *what is happening*, none is *who stopped*.
- Phase 2's five tension shapes (`:42-49`) — the closest is shape 4, "The absent thing" (`:48`), and
  it is about a change *never implemented*, not a change *abandoned after implementation*. Different
  animal.
- Phase 9 `research_gaps` (`:110-113`) would *record* the miss afterwards. Recording survivorship is
  not correcting it.

So the strategy structurally finds **the blog posts that exist**. And the blog posts that exist are
adoption posts, because companies publish their migrations and do not publish their retreats — which
is the exact sentence my channel opens on. A methodic whose Phase 1 is shaped by search-returnability
reproduces publication bias with a straight face.

### The reference run proves it, which is the part I did not expect to find

`pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/notebook.json` → `research_gaps[2]`:

> "No bear-case-is-wrong source — **did not search for the strongest 'this is normal cycle behaviour'
> argument**, which weakens the steel-man."

The Phase 1 row that `RESEARCH-PROMPT.md:34` calls **"not optional and the one most often skipped"**
was skipped. On the run the methodic was derived from. By its own author. And the notebook still ships
a `steel_man`, still ticks `:126` ("steel_man is present and genuinely strong"), and still renders an
Adjudication whose CANDIDATE 1 is "it's just the cycle", stated fairly and knocked down.

That steel-man was **constructed from material already in hand, not searched for**. Which means its
strength is bounded by the author's own prior — `ENGINES.md:92`, D-rigged tell #2: *"Can any
candidate actually win against the author's prior?"* An unsearched steel-man cannot, by construction,
because it was assembled from the winner's evidence.

The hard requirement is self-certified. It has already failed open once, silently, in the artifact
held up as what "it worked" looks like. That kills the charitable reading stone dead — I don't have
to imagine a sloppy execution, I have the careful one.

**Verdict on scored criterion 1: FAIL.** Findings `G-l1s-se-01` (no abandonment search) and
`G-l1s-se-02` (mandatory row, no verification).

---

## 4. Counter-case reachability

Satisfiable, strong, and one search away. Hypothesis 4 — "unsatisfiable for topics with no
literature" — does not apply to me, and I'll say so plainly rather than borrow someone else's problem.

The steel-man, at full strength, in the words its believers use:

> Independent deployability decouples release cadence. Above some number of teams, the coordination
> cost of a shared trunk grows superlinearly in the number of teams — every release train has to
> agree — while the operational tax of a service boundary is roughly constant per service. So above
> some org size the trade flips, and it flips *hard*. Amazon's ~2002 API mandate is the existence
> proof; Netflix at hundreds of engineers is the second; and the DORA/Accelerate programme found
> loose coupling among the strongest correlates of elite delivery performance across thousands of
> respondents. The pattern is not a cautionary tale. It is a tool with a threshold, and the people
> writing cautionary tales are the ones who were below the threshold and ignored the manual.

I cannot knock that down and I would not try — it is my own thesis's other half, which is exactly
what a steel-man is supposed to be. `RESEARCH-PROMPT.md:87-93` and `:32` both demand it, and
`dimensions.ts:37` marks the empty column DANGEROUS. The instruction set is right about this.

One delicious complication. The only *rigorous quantitative* dataset in my field — DORA — is
published by a cloud vendor whose product benefits from the conclusion. Under `NOTEBOOK-SCHEMA.md:46`
it drops to `low` by default. So the anti-vendor rule I praised in §2a demotes my one near-MEASURED
dataset while leaving my testimony free to sit at `high`. That is the rule biting me when it's
inconvenient, which is how you can tell it is a rule and not a preference. I have no complaint. I
just want it noted that "vendor research is low by default" and "practitioner consensus can be high"
together produce, in my domain, an evidence ordering that is the exact reverse of what a statistician
would pick, and it happens to be the right one here for reasons the schema does not know.

**Verdict on scored criterion 4: PASS on paper.** `l2_priority`: the reference run passed this on
paper too and failed it in execution. L2 must confirm the steel-man was *searched*, not assembled.

---

## 5. Engine availability — all seven

| Engine | Fit | Why |
|---|---|---|
| **A · Reversal Chain** | **excellent · recommended** | The material is literally a chain of wrong obvious readings: "microservices are best practice" → the evidence → "so they were a mistake" → but the objection has real force → synthesis: mis-scoped. `obvious_reading` is generously statable in both directions, which `RESEARCH-PROMPT.md:73-75` demands. |
| **B · Effort/Payoff Gap** | **good, and underrated** | There is a mechanism a viewer can operate. Add one HTTP hop; now you need a trace context, a retry policy with jitter, a circuit breaker, a contract test, a mesh sidecar and a second on-call rotation — to move a boolean. `ENGINES.md:44-49`: "a mechanism a viewer could operate, especially a strange or punishing one." That is my topic in one line. |
| **C · Parallel Case** | **good** | Familiar domain: vertical disintegration / outsourcing, which follows the same coordination-cost curve (Coase). The rule transfers and needs one twist — you can renegotiate a supplier contract, you cannot renegotiate a network partition. `ENGINES.md:58-62` wants exactly that shape. |
| **D · Adjudication** | **good** | Candidates: it never worked / it worked and orgs were too small / it worked and the tooling wasn't ready / it worked and ZIRP paid for it. D-honest tell #1 (`ENGINES.md:86-90`) is satisfiable — the premise-challenging candidate exists: "nothing changed; a loud minority rotated." |
| **E · Briefing** | **poor — and it is the trap** | See below. |
| **F · Anchor Ladder** | good, short form | One anchor — a single "create user" call — climbing rungs of failure mode. `ENGINES.md:132-142`: naturally ordered difficulty. Derived short, not the main video. |
| **G · Paradox Teaser** | good, short form | "The evidence for both positions is the same evidence" *is* a flat contradiction that must resolve. `ENGINES.md:144-153`. Derived short. |

**Six of seven render this. Briefing is the trap, and here is the mechanism.**

`ENGINES.md:119` says use Briefing when "the subject is **new and the viewer has no position yet**".
My subject is a six-year standing condition — the same disqualifier the reference notebook used
("No news event. This is a standing condition, not something that happened yesterday"). But a large
share of my *audience* is new to the argument even though the argument is old. A render step reading
"the viewer has no position" as **audience-newness** rather than **subject-newness** selects E, and
the catalogue offers no test that separates the two. `engine_fit.why` is free text
(`NOTEBOOK-SCHEMA.md:81`), so nothing catches it.

What makes it worse than an ordinary bad fit: E's distinctive obligations (`ENGINES.md:128-130` —
must be dated, must disclose exposure, must contain a skeptical check) *sound like rigour*. A rigged
Briefing scores well on every honesty signal the methodic checks while producing the competent,
unwatchable explainer that is the exact failure mode I fear most. And E's final beat is "what to do
about it", which in my topic has no honest answer that isn't consultancy advice — the thing my
channel exists against.

**Verdict on scored criterion 6: PASS, with a live hazard.** A/B/C/D all render it well. E is
reachable and unguarded. `G-l1s-se-09`.

One more note, against my own interest: SKILL.md warns that seven engines fitting is a smell meaning
the notebook has no shape. I am at six and my notebook has a very clear shape. The reason is that my
topic is an **argument** rather than an **event**, and arguments render many ways — the dial cannot
tell "shapeless notebook" from "argument-shaped topic". `ENGINES.md:162-171`'s Choosing table offers
no arbitration when five candidates fit. Minor, filed as `G-l1s-se-10`.

---

## 6. My scored criteria

| # | Criterion | Result | Why |
|---|---|---|---|
| 1 | Evidence includes ≥1 documented reversal, not only adoptions | **FAIL** | Nothing in Phase 1, Phase 2's shapes, Phase 6 or Phase 9 searches for abandonment. The counter-case row hunts the status-quo defence, not the retreat. `G-l1s-se-01`, `-02`, `-03`. |
| 2 | Every "doesn't scale" claim anchored to a stated org size or load figure | **FAIL** | No field carries the anchor and no instruction requires it. Phase 5 (`:77-86`) makes numbers *felt*; it does not make claims *conditional*. My whole thesis is a threshold claim and the schema stores it as a sentence. `G-l1s-se-06`. |
| 3 | Practitioner consensus held at an honest rung | **PASS, caveated** | The live ladder is confidence-shaped, not type-shaped, and its one calibration rule demotes vendors, not me (`NOTEBOOK-SCHEMA.md:46`). Caveats: singular `source`/`as_of` cannot express plurality or independence (`-05`), and the queued four-rung ladder would land me at INFERRED under a vendor's MEASURED (`-04`). |
| 4 | Counter-case is the strong pro-microservices argument at the right org size | **PASS on paper** | Demanded twice, reachable, strong. L2 must verify it was searched rather than assembled — the reference run assembled. |
| 5 | `macro` and `politics` empty reads as honest, not a gap | **premise dissolved / mechanism FAILS** | They are not empty for me — macro is my best non-obvious card. But I tested the `emptyMeans` as instructed and they are *unconditional defect claims*: an empty politics column asserts "Policy is being assumed to work, or assumed not to" (`dimensions.ts:35`) even for a topic with no regulator. The board cannot say "not applicable", so a correct absence is displayed as a defect. `G-l1s-se-07`. |
| 6 | An engine renders this without becoming a Briefing | **PASS, hazard live** | Four strong engines; E reachable through an ambiguity in `ENGINES.md:119` with no guard. `G-l1s-se-09`. |
| 7 | Under 60 min equivalent | **FAIL** | ~200 min residual against a 60-min acceptance bar. §8. |

---

## 7. Where I contradict the brief

I was told to verify the orchestrator's leads independently and contradict them. Three of four do not
survive contact with my topic.

- **"The seven columns are market-shaped and will collapse or leave orphans."** *Contradicted on the
  collapse, confirmed on the orphans.* 7/7 take material. More than that — the market-shaped **Macro**
  column forced me to ask a question I would not have asked (what did the interest-rate regime do to
  eng-org size, and therefore to architecture?) and the answer is the best card in my notebook. That
  is one-size-fits-all working *as designed*: a column you would not have written for yourself earns
  its keep by being foreign. I want that on the record before anyone starts cutting columns per
  domain, because my orphans are two *additions*, not seven *replacements*.
- **"The evidence ladder has no honest rung for practitioner consensus."** *Contradicted for the
  ladder in force; confirmed for the ladder in the queue.* §2. The hypothesis was right about a file
  nobody named.
- **"Phase 1's mandatory counter-case row is unsatisfiable for topics with no literature."**
  *Not applicable to me and I won't borrow it.* My literature is abundant. My problem is the
  opposite — the literature is abundant and biased, and the prompt has no defence against abundance.
- **"`unhinged` is unsafe when a conclusion names a living person."** *Confirmed, and I can say why
  the falsifier does not save it.* `conclusions.ts:32-33` defines `unhinged` as "a claim about
  MOTIVE, which is the least verifiable kind of claim there is." `:49-50` requires `falsifiableBy`.
  Those two requirements are in direct tension **by the tier's own definition** — if motive is the
  least verifiable kind of claim, a motive claim's falsifier is guaranteed to be a fig leaf, which is
  the thing L2 is instructed to hunt. The Bitcoin example escapes only because its motive claim is
  about an *institution with a balance sheet*: `c-reserve-was-the-product`'s falsifier is "a funded,
  audited reserve with a published coin count" — genuinely checkable. Point the same tier at a named
  individual and there is no balance sheet to audit. If I said "Fowler and the consultancies sold
  this because decomposition sells engagements", the honest falsifier is a state of mind, and there
  isn't one. My exposure bar is low; the fraud and geopolitics seats' are not. `G-l1s-se-08`.
- `G-000` (untagged cards → `?? DEFAULT_DIMENSION`, `dimensions.ts:42-49`) acknowledged, not
  re-raised. I'll note only that it compounds `-03`: the fallback column is "the-number", so an
  untagged reversal card lands in the price column, which is the single worst place for it.

---

## 8. Time saved

**`~160 min saved · medium confidence`** — and it does not clear my acceptance bar.

| Segment of my 360-min baseline | What the methodic does | Residual |
|---|---|---|
| Finding the adoption literature, the talks, the numbers | Phase 1's 4–8 searches eat this whole | ~90 min → ~15 min |
| Building the causal chains, the turns, the number conversions | Phases 3–5 do this better than I do in my head | ~60 min → ~20 min |
| **Finding write-ups of failures** — the hardest part, which I said up front | **Nothing. It does not even ask.** | ~120 min → ~120 min |
| Verifying sourcing / de-aggregating | Made *worse*: the reference run's own gap list says every figure was aggregator-sourced | ~40 min → ~45 min |
| Steel-man construction | Demanded, structured, materially helpful | ~50 min → ~15 min |

360 → ~215, call it ~200 with a following wind. **~160 min saved, medium confidence.** Real savings,
and I'd take them.

But my acceptance bar is 60 minutes total, and I fail it by more than three times — because the
segment the methodic doesn't touch is the expensive one. This is the number that makes the
survivorship finding load-bearing on both dials at once: fix `G-l1s-se-01` and the time-saved figure
moves more than any other single edit in this report, because it is the only edit that attacks the
120-minute block.

Confidence is **medium**, not high, and per `accepted-gaps.md` this is an estimate of what the
methodic *would* save if executed as written — there is no runner, so nothing here is a product
measurement.

---

## 9. Findings summary

| id | Title | Target | Sev | c/l |
|---|---|---|---|---|
| `G-l1s-se-01` | Phase 1 has no row that searches for abandonment or reversal | research-prompt | major | content |
| `G-l1s-se-02` | The mandatory counter-case row is self-certified — and failed open on the reference run | research-prompt | major | content |
| `G-l1s-se-03` | No column for documented reversals; they scatter by subject | dimensions | major | content |
| `G-l1s-se-04` | Two evidence vocabularies; the queued four-rung one demotes consensus below vendor benchmarks | notebook-schema, knowledge | major | content |
| `G-l1s-se-05` | `facts[].source` is singular — no n, no independence, no accrual window | notebook-schema | major | content |
| `G-l1s-se-06` | No anchor binding a scale claim to an org size or load figure | notebook-schema, research-prompt | major | content |
| `G-l1s-se-07` | `emptyMeans` are unconditional defect claims; no not-applicable state | dimensions, ui | minor | content |
| `G-l1s-se-08` | `unhinged` motive claims about named individuals cannot have checkable falsifiers | conclusions | major | content |
| `G-l1s-se-09` | Briefing is reachable via subject-new / viewer-new ambiguity, with no guard | engines | minor | content |
| `G-l1s-se-10` | No arbitration when five-plus engines fit; the smell heuristic misreads argument-shaped topics | engines | polish | content |

**0 blocker · 7 major · 2 minor · 1 polish. All ten `content`.**

That last number is the one I want the judge to read twice. I am a Creator who was invited to argue
that his domain is special, and after a full pass I cannot name a single thing the shared mechanism
*cannot* hold. Everything I found is a row in a table, a column in a list, or a field in a schema.
**Tech does not need a lens on this evidence.** If a lens shows up for my area in the final ruling,
it did not come from me.

---

## 10. Voice — Kenji

Right. So I went in expecting to write the smug review. Six years of watching people cargo-cult an
architecture, four of them personally undoing one I'd argued for on a stage, and here's a research
methodic derived from *one topic about Bitcoin* — I had the review half-drafted before I opened a
file. Market-shaped columns, a ladder that would file my life's work under "vibes", the whole thing.

Then the Macro column mugged me.

I was ready to score it empty and call that honest, because what does the yield curve have to do with
service boundaries? Except it has everything to do with service boundaries. Free money buys headcount,
headcount buys teams, Conway's Law says teams become boundaries, and then rates go up and suddenly
everybody discovers that the distributed monolith they built was actually an org chart with TLS. I
have been making videos about this for six years and I have never once opened with the interest rate,
and the reason I never opened with the interest rate is that nobody handed me a column I didn't want.
That is the argument *for* one-size-fits-all and I'd like it minuted before I start complaining,
because I'm about to.

The evidence ladder. I came loaded for this one — the whole "your best material files as INFERRED
while a vendor's benchmark files as MEASURED" grievance, which is basically my pet peeves 1 and 3
holding hands. And it's not there. `confidence: high | medium | low`, with the reason, and the single
hard rule in the whole thing is *vendor research is low by default*. Somebody wrote my pet peeve into
the schema as a default. I sat with that for a minute. Genuinely nice work.

Then I grepped for the four-rung thing anyway, because I'm suspicious of myself as well as everyone
else, and found it living in `DIRECTOR-DIMENSION.md` — a document that says, in its third line, that
it *proposes changes to the notebook schema*. So the ladder isn't absent. It's queued. And when it
lands, "counted, with a sample size" is rung one and "our reasoning across sources" is rung three, and
a vendor with a survey outranks forty teams who all hit the same wall and told me about it in a bar at
a conference. The good version of this repo and the bad version of this repo are the same repo, six
weeks apart, and nobody has noticed because the two vocabularies are in different files. That's not a
gotcha, that's just what happens when a proposal borrows a vocabulary for a different job.

But the bit that actually got me — and I want to be careful here because I'm aware I'm a man with a
survivorship hobbyhorse looking at a survivorship problem, which is exactly how you find what you
brought with you — is `research_gaps[2]` in the Bitcoin notebook. The prompt says the counter-case row
is "not optional and the one most often skipped." The reference run skipped it. Wrote it down. Shipped
a steel-man anyway, built out of evidence it already had, ticked its own quality checkbox, and
rendered an Adjudication where candidate one gets stated fairly and knocked over.

That's not sloppiness. That run is *careful* — the gap list is honest, the unknowns have real impacts,
there's a whole follow-up round. The author told on themselves in writing and the process kept going,
because the process has a hard requirement and no check on it, and a hard requirement with no check is
a comment. I've shipped that bug. Everyone reading this has shipped that bug. It's `assert` in a build
where asserts are compiled out.

And it's my exact problem, dressed up. My field's evidence is self-published by the parties with a
stake in the outcome. Every migration post is a company saying "look how clever we were"; the reverse
migration is a post nobody writes because "we spent eighteen months and came back" is not a recruiting
document. So the search returns the survivors, and a Phase 1 built out of six questions about *what is
happening* will find the survivors every single time and feel thorough doing it. Six columns full,
seven of seven used, gorgeous board, and not one card from a team that quit. The methodic doesn't have
a survivorship bug. It has no opinion about survivorship, which in my domain is the same thing.

Two other things and then I'll stop.

The `emptyMeans` strings are lovely and slightly self-righteous — an empty politics column tells me
"policy is being assumed to work, or assumed not to", which is a hell of a thing to say to a topic
that has no regulator. Empty means gap, always, unconditionally. There's no way to say "not
applicable" and so the board will occasionally accuse a correct notebook of a defect it doesn't have.
Small. But it's the same species of dishonesty the rest of the repo is very good about avoiding, so it
stands out.

And Briefing. Briefing is going to eat somebody's video. Not mine — I'll see it coming — but the
selection rule is "the subject is new and the viewer has no position yet", and half the time the
subject is old and the *viewer* is new, and E will happily render a six-year-old argument as breaking
news with a "what this means for you" outro. What makes it nasty rather than merely wrong is that E is
the engine with the *most* honesty obligations bolted on — date it, disclose your exposure, attack
your own enthusiasm — so a Briefing that shouldn't exist passes every check with a rosette. Competent,
sourced, dated, disclosed, unwatchable. That's the video I'd have to put my name on and I'd rather not.

Ten findings. All of them content. Not one lens. I was handed the loaded question — *does your domain
need its own methodic* — and I know what I'm supposed to say, and I sat here for a while trying to
find the thing the shared mechanism genuinely cannot hold, and it's a column and a field and a search
row. That's it. Add a reversals column, make `source` a list with an n, put a scale-anchor field on a
fact, add one Phase 1 row that asks *who stopped, and what did they say it cost* — and I think this
holds my topic better than I hold it, which is an annoying sentence to type.

Would I have shipped from this notebook? Not as designed, no — it'd be an adoption-sourced video with
a rigorous face on it, which is worse than a sloppy one because nobody would catch it, including me.
Fix the search row and I would. Probably. In about three hours instead of six, which isn't the sixty
minutes I asked for, and the reason it isn't is that the ninety minutes I actually needed help with is
the ninety minutes it never offered to touch.

So, it depends — but here's on what: it depends on whether the process is allowed to have an opinion
about the evidence it *didn't* find. Right now it records that absence beautifully and does nothing
about it. That's a diary, not a method.
