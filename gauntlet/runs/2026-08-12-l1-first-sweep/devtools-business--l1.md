# L1 dry fit — `devtools-business` (Rowan Byrne, they/them)

**Topic:** "Licence changes get called rug-pulls. Look at the funding structure underneath and a
different story shows up — one that is worse for everyone and nobody's fault."
**Level:** L1 · paper only · no browser, no searches
**Verdict:** **L1-conditional** — and one ruling away from `L1-fail` (see § Verdict).
**Column utilisation:** `columns 7/7 used · 2 orphan groups`
**Time saved:** `~170 min saved · low confidence` (baseline 420 min; residual ~250 min against a
60-min acceptance bar — **does not clear it**)
**Scored criteria:** 2 pass / 5 fail.

---

## 1. Column utilisation

`columns 7/7 used · 2 orphan groups`

I want to say up front that I expected worse, and the orchestrator's first hypothesis — that the
seven columns are market-shaped and will orphan a non-market topic — **is contradicted on this
topic**, mostly. Six of the seven took my material without argument, and two of them took it
*better* than my own filing cabinet does.

| Column | Verdict | My material |
|---|---|---|
| `the-number` (`dimensions.ts:26-27`) | **used, but under protest** | The relicensing series with dates — MongoDB→SSPL 2018, Elastic→SSPL 2021, HashiCorp→BUSL 2023, Redis→RSALv2/SSPL 2024, Elastic→AGPL 2024. A countable series, so the column is fillable. See finding DTB-09 for why filling it is not the same as satisfying it. |
| `flows` (`:28-29`) | **used, heavily** | Who actually pays for maintenance: cloud-vendor service revenue on someone else's code, VC rounds, sponsorship platforms, corporate employment of maintainers. Generalises off "buying and selling" cleanly. This is where my structural thesis lives. |
| `actors` (`:30-31`) | **used, heavily — and this is my problem** | Cloud vendors, the relicensing companies, their boards, the foundations, the individual maintainers. See § 2. |
| `macro` (`:32-33`) | **used, and it is the best column on the board for me** | ZIRP-era infra funding → 2022 rate rise → growth-at-any-cost repriced as revenue-or-die → the relicensing wave clusters 2023–24. "Correlation with other assets" reads oddly, "rates, liquidity" reads perfectly. My whole thesis is a macro story about a funding model, and the market-shaped column is the reason it has a home. Contradicting the brief here with some pleasure. |
| `politics` (`:34-35`) | **used** | OSI's approval process and the OSD, the EU Cyber Resilience Act's "open source steward" obligations, the foundation forks (OpenTofu, Valkey). "And whether it was actually implemented" is a good clause for a beat full of announced governance. |
| `counter-case` (`:36-37`) | **used, and abundant** | See § 5. |
| `conclusions` (`:38-39`) | **used** | See § 3. |

### Orphan group 1 — **the instrument**

The licence text itself. The clause-level diff — a BUSL change-date, an additional-use grant, SSPL
§13's service-source obligation — is the primary artifact of my entire beat and there is no column
whose purpose describes it. It is not a number, not a flow, not an entity, not macro, and only
adjacently regulation. In the Bitcoin run the object under study was a price and `the-number` held
it. My object under study is a legal text, and the board has no column for *what the thing actually
says*. Untagged it falls to `the-number` (`dimensions.ts:62`, `cards.ts:48` — pre-recorded as
`G-000`), which is exactly the wrong place: a reviewer scanning the price column will not find the
clause the whole story turns on.

### Orphan group 2 — **governance, and who has the right to relicense**

CLAs and copyright-assignment terms, DCO-vs-CLA, trademark policy, foundation bylaws, who holds the
copyright on six years of volunteer contributions. This is the mechanism that makes a relicensing
*possible at all* — a project on a DCO with distributed copyright structurally cannot do what a
project with a broad CLA can — and it is the load-bearing structural fact of my thesis. `actors`'
purpose says "and what governs *their* behaviour", which I read three times hoping it meant this. It
does not: in context (`dimensions.ts:3-5`, and the mandate/risk-model sense of the Bitcoin run) it
means market-structural constraints on large entities, not corporate-governance documents. Phase 1's
domain table (`RESEARCH-PROMPT.md:25-32`) has no row that would send a researcher to a bylaw.

Which is fine, except that governance archaeology is *the slow part of my week* — the seven-hour
baseline is mostly this — so the methodic is missing a home for precisely the material it would need
to save me the most time. That is DTB-07, and it is also the whole time-saved story in § 9.

### One thing the board gets right and should be protected

There is **no community-sentiment column**. My first pet peeve is sentiment cited as evidence of
anything, and the board structurally cannot hold a Hacker News thread. Any lens work must not add
one. Record that as a guardrail, not a compliment.

---

## 2. My central test — can it hold a structure and an actor at once?

My senior bar is that the notebook holds a structural mechanism **and** an actor-level mechanism
simultaneously, and says which facts support which. Not "mentions both". Holds both.

**The result is: half of it is fine, and the half that is not is a mechanism defect, not a label.**

### 2a. Both mechanisms can exist. Neither can be traced.

`mechanisms[]` is a free array — nothing stops me writing `m-funding-collapse` (structural) beside
`m-cla-optionality` (agentic). So far so good.

But look at the field list (`NOTEBOOK-SCHEMA.md:49-53`):

```
{id, name, chain[], explains, needs_analogy, note?}
```

**There is no evidence array.** A mechanism cannot name the facts it stands on. Compare its
neighbours: `reversals[]` carries `evidence[]` (`NOTEBOOK-SCHEMA.md:56`), and `Conclusion` carries
`restsOn: string[]` (`conclusions.ts:43-44`). So the *reasoned* layer is traceable to cards and the
*researched* layer is not — which is backwards, and it means the second clause of my senior bar
("the notebook says which facts support which") is **unrepresentable in the schema**. I cannot fail
this bar in a run; I cannot pass it either. That is DTB-01 and it is the sharpest thing I found.

The practical consequence for me specifically: my structural claim and my agentic claim are supported
by *different, non-overlapping* evidence — funding rounds and rate history on one side, a CLA and a
board composition on the other. A reader who cannot see which facts feed which mechanism reads two
mechanisms about the same company and merges them. That merge is the morality play.

### 2b. The board can only sort by one axis, and `actors` wins the tie

`cards.ts:55`:

```ts
id: m.id, kind: "mechanism", dimension: CARD_DIMENSION[m.id] ?? DEFAULT_DIMENSION,
```

and the table it reads is `Record<string, DimensionId>` (`dimensions.ts:50`) — **one card, one
column, singular**. A mechanism is filed once.

Now take my structural mechanism, honestly written:

```
Infrastructure companies raised at 2021 multiples
  THEREFORE growth, not margin, was the covenant
  BUT rates rose and the market repriced infra revenue in 2022
  THEREFORE the covenant became revenue-or-die
  BUT the revenue was being intermediated by cloud vendors reselling the code
  THEREFORE the only lever the cap table could pull was the licence
```

Where does that go? It is *about* HashiCorp, AWS, IBM and a VC board. Filed under `actors` it reads
as a story about what those companies chose. Filed under `macro` it is structurally correct and
disappears from the column a reviewer scans for who did what — and the reviewer then finds `actors`
holding only the CLA mechanism, i.e. only the agentic read. Either way one of my two mechanisms is
misrepresented, and there is no third option, because the field is a single value.

This is **mechanism, not content.** I want to be careful here because the rubric's bar for that word
is high and I am the most biased person in the room about it. So the test: *would relabelling fix
it?* No. Rename the columns, rewrite every `purpose`, ship a bespoke devtools column set — the type
is still `Record<string, DimensionId>` and a mechanism still lands in exactly one of them. **A lens
does not fix this either**, which is the actual proof that it is not a lens finding: the defect
survives every possible column vocabulary, so it is domain-general and belongs to the shared
mechanism. Fix is `dimension: DimensionId | DimensionId[]`, or a `primary` + `alsoRelevantTo`. I have
marked it `undecided` and stated the argument; the judge rules.

### 2c. `actors.emptyMeans` defines success as naming people

`dimensions.ts:31`:

> `emptyMeans: "Nobody is named — the story has no agents."`

Read that as what it is: a statement that an `actors` column is complete when it contains names.
Every other column's `emptyMeans` describes an *analytical* absence — "the demand story is
unexamined", "policy is being assumed to work". This one describes a *casting* absence. It is one
sentence and it is the sentence that points the column at a morality play, because the cheapest way
to clear "nobody is named" is to name somebody.

Cheap fix, genuinely cheap: *"No entity identified, and no constraint identified that governs the
entities' behaviour — the story has neither agents nor the rules they act under."* That is content,
it costs one line, and it makes the column ask for the structural half in the same breath.

### 2d. The precedent run already collapsed, and the craft layer pushes the same way

I did not have to speculate about whether this happens, because the reference run did it.
`m-treasury-flywheel` is a purely structural mechanism — an arithmetic about equity issuance above
NAV that would run identically for any vehicle — and it is filed under `actors`
(`dimensions.ts:57`). Downstream it becomes `c-closed-end-fund`: *"Strategy was never a Bitcoin
company"* (`conclusions.ts:104-106`) — a claim about a named company's nature, out of a mechanism
about arithmetic. That is the exact conversion I am worried about, in the one worked example the
methodic has.

And the render layer is instructed to do it on purpose. `PATTERNS.md:89`:

> "Abstract actors become characters with motives. It is the cheapest available fix for the driest
> possible subject"

To be fair — and this is a real defence, not a courtesy — it is hedged in the next line as
PolyMatter's signature and scoped to the reference world in `TONE.md`, not offered as a universal
rule. It is a catalogued observation, not a mandate. What is missing is any counterweight: I grepped
the entire methodic for a rule saying *do not convert a structural constraint into an intention*, and
there is none. So the corpus contains one instruction pointing toward motive-attribution and zero
pointing away from it. On my beat that asymmetry is the whole ballgame. DTB-10.

**Verdict on my central test: FAIL.** Not because the notebook can only hold one story — it can hold
both — but because it cannot say which evidence belongs to which (2a), and the board forces a choice
of axis that puts one of them where nobody will read it (2b). Content fixes 2c and 2d. 2a and 2b are
edits to the shared artifacts.

---

## 3. The motive question

This is the criterion I said I would check first, and it is the one where I have to declare an
interest: I have been on the receiving end of a video that explained what I intended. It was wrong,
it was watched about forty thousand times, and there was no version of the correction that travelled.
So read what follows knowing I am not neutral, and check my citations rather than my tone.

### What the ladder actually says

`conclusions.ts:26` — `type Leap = "near" | "moderate" | "far" | "unhinged"`. And `:32-33`:

> `unhinged: "The hottest take. A claim about MOTIVE, which is the least verifiable kind of claim
> there is — nobody can source what someone intended. Entertaining, defensible as speculation,
> indefensible as fact."`

So the ladder does not merely *permit* a motive claim. **The top rung is defined as one.** That is
not a loophole, it is a designed feature, complete with a devil emoji at `:53`.

### Does the falsifier requirement do the work? Partly — and be fair about how much.

The brief asked me to contradict it if the falsifier already constrains this adequately, and I want
to give the design its due first, because the safeguards are better than most editorial processes I
have worked under:

- Conclusions are **off by default** (`conclusions.ts:16-17`). A human has to let each one in.
- Every one carries a `falsifiableBy`, marked REQUIRED (`:49-50`). "A synthesis that cannot be wrong
  is not a conclusion, it is a vibe" (`:18-19`) is a genuinely good line and a genuinely good rule.
- `hottest` is explicitly held to a **higher** bar, not a lower one (`:55-58`), and the UI marks it.

That is real. Now the failure, and it is precise. Take the worked example, `c-reserve-was-the-product`
(`conclusions.ts:164-179`). Its claim contains two clauses:

1. *the reserve was never built* — implementation, checkable;
2. *it was never meant to be built; announcing it was the product, to put a floor under an asset your
   donors hold* — **intent**, attributed to a named, living, currently-serving administration.

Its falsifier (`:175-176`): *"A funded, audited reserve with a published coin count."*

That falsifies **clause 1 only**. A funded reserve would prove the policy was executed; it would say
nothing whatsoever about what anyone intended. The claim's least verifiable clause rides along
unfalsified, wearing clause 1's falsifier as a permission slip. And the rule as written is satisfied
— `falsifiableBy` is present, and it is checkable, which is the standard the file sets.

**So: the falsifier requirement is necessary and not sufficient.** There is no rule that the
falsifier must address the claim's *intent* clause, which is the only clause that carries exposure.
That is DTB-05, and it is the one I would fix first if I only got one.

### Two further absences, both confirmed by grep across the methodic

- **Nothing distinguishes a named company from a named individual.** `Conclusion` has no subject
  field, no exposure field, no naming policy. The rubric has an `exposure` dimension and my file has
  an exposure bar — the *methodic under test* has neither. `NOTEBOOK-SCHEMA.md` has no field where a
  researcher could record "this claim names a living person".
- **Nothing distinguishes predictable from planned** — my criterion 6, and the reason my topic
  exists. The ladder has **one axis: distance from the evidence.** My strongest conclusion — *the
  relicensing wave was overdetermined by the funding structure; any competent board would have
  arrived at the same lever* — is a high-confidence *structural* claim that sits at `far` because it
  reaches. "They planned this from the start" also sits at `far`. To the reviewer, to the render
  step, and to the viewer, those two are the same tier. They are not remotely the same claim, and the
  difference between them is my entire thesis and, on a bad day, someone's reputation.

  The ladder needs a second axis — kind of claim: *structural / dispositional / intentional* — not a
  fifth rung. DTB-04.

**Criterion 4 (no conclusion asserts a motive for a named individual): FAIL.** Not "the methodic
might allow it" — the methodic's top tier is defined as it, its single worked example does it about a
sitting president, and no rule anywhere mentions naming. The off-by-default gate is what stands
between this and a lawsuit, and a gate that relies entirely on the operator noticing is a gate that
works until someone is in a hurry.

---

## 4. Evidence-floor check

**First, a contradiction of the brief's premise.** The brief describes "the evidence ladder (MEASURED
· OBSERVED · INFERRED · ASSUMED)". That ladder is real but it is not the notebook's. It belongs to
the knowledge library's tagging of *its own* craft claims (`knowledge/README.md:38`, and the inline
`MEASURED ·` / `INFERRED ·` annotations through `ENGINES.md` and `PATTERNS.md`). The ladder a
research run actually applies to a fact is **`confidence: high | medium | low`**, free-text-augmented
(`NOTEBOOK-SCHEMA.md:42,46`). This matters, because the four-rung ladder at least gestures at
*provenance*, and the three-rung one does not gesture at anything.

My three evidence types, placed honestly on the ladder that exists:

| Evidence | Where the ladder puts it | The problem |
|---|---|---|
| **Licence diffs** — authoritative, primary, verbatim, self-verifying | `high` | Fits. But there is no field that records it as *primary*. `source` is a free string; the reference run's are aggregators ("99bitcoins / investingnews price history", `notebook.json:26`) sitting at the same `high` as a `whitehouse.gov` fact sheet. My criterion 1 — cite the diff, not the announcement — is therefore **unenforceable**: the schema cannot tell the two apart, and the only place primary-vs-aggregator appears is `research_gaps`, i.e. a post-hoc confession slot at Phase 9 (`RESEARCH-PROMPT.md:110-113`). Confess-after is not cite-first. |
| **Funding announcements** — self-reported by an interested party, and usually *accurate* | `medium`, by analogy to "Vendor research is `low` by default" (`NOTEBOOK-SCHEMA.md:46`) | Here is the actual defect: **`confidence` conflates accuracy with disinterestedness.** A Series C headline number is precise, dated, and completely partisan in its framing. One field cannot carry "true" and "told to you by someone with a reason". Downstream this is worse than untidy — Phase 5 (`:77-85`) will convert it into a felt number ("nine dollars of venture money per line of code"), and a self-reported figure that has been made *felt* has been laundered. The schema names "laundered confidence" as an anti-pattern (`:108`) but defines it as restating a vendor statistic *without its source* — it guards the citation, not the interest. |
| **Maintainer blog posts** — first-hand and partisan | `high` on what was said, `low` on why | A fact is one `claim` string with one `confidence`, so "X relicensed because sustaining the project had become impossible" fuses a quotable statement with a contested causal claim. **But I am refuting my own complaint here**: a competent researcher writes "X's CEO stated on 2023-08-10 that…" at `high` and the causal reading as a separate `medium` fact, and the schema permits that fine. This one is content and my own execution problem, not a gap. |

**Net: the brief's evidence hypothesis is contradicted in its premise and upheld in substance.** The
real ladder has no rung for disinterestedness, and on a beat where *everything primary is partisan* —
the company's blog, the maintainer's blog, the foundation's press release — that is the load-bearing
gap. The fix is a field, not a lens: `provenance: primary | secondary | self-reported | partisan`,
which any domain would benefit from. DTB-06.

---

## 5. Counter-case reachability

**The brief's fourth hypothesis is contradicted, emphatically, for my topic.** Phase 6
(`RESEARCH-PROMPT.md:87-93`) demands "the strongest case *against* your own verdict, with evidence,
in the words its believers would use". On my beat that is the single easiest material to find —
relicensing companies publish their reasoning at essay length, with FAQs, because they are trying to
retain enterprise customers through the change. HashiCorp's BUSL FAQ, Redis's licence-change post,
Elastic's "we're going back to AGPL", the R&D-spend-versus-managed-service argument, the
"99% of users are unaffected" line. Counter-case column: full, sourced, and in their own words.

**Criterion 3: PASS.**

Two notes the methodic does not currently cover, and the second is genuinely novel:

1. My verdict is *itself* the counter-case to the popular reading. My thesis is "nobody's fault"; the
   steel-man against me is "no — they collected a CLA for six years knowing exactly what it was
   for, and that is a plan". Phase 6 handles this correctly, because it asks for the case against
   *your* verdict whatever that is. No finding. Worth saying, because it is a design that survived
   an inversion it was never tested against.

2. **The inverted failure mode nobody has written down.** Every honesty check in the methodic guards
   against a steel-man that is *too weak* — the three D-rigged tells (`ENGINES.md:81-96`) all detect
   a strawman. On my beat the risk runs the other way: the best-written argument in my notebook will
   be the one drafted by a comms team with a legal review, and Phase 6 says "strongest", which a
   researcher will read as "most polished". A steel-man adopted verbatim from corporate
   communications is not a steel-man, it is a press release with a citation, and it launders
   *better* than a weak one because it survives every existing check. There is no tell for it.
   DTB-08.

---

## 6. Engine availability — all seven walked

| Engine | Fit | Why |
|---|---|---|
| **A · Reversal Chain** | **excellent** | "It was a rug-pull" is a claim a reasonable person disputes, and I have four honest turns: the rug-pull reading → the funding structure underneath → *but* the CLA was collected deliberately, which is agency → *therefore* predictable and not planned, which is worse. Self-attack available and cheap. **Recommended.** |
| **B · Effort/Payoff Gap** | **medium, and interesting** | The mechanism a viewer can operate is maintainership: six years, the issue tray, the CVE at midnight, against the sponsorship figure. Structural by construction — the disproportion is the argument, and it names nobody. If I am worried about the morality play, this is the engine that cannot produce one. |
| **C · Parallel Case** | **good** | Familiar rule fully mechanised in another domain — road maintenance funded by general taxation, or academic publishing — then transferred. "The viewer is never told they were wrong" (`ENGINES.md:62`) suits a thesis whose whole point is that nobody is the villain. |
| **D · Adjudication** | **good, and the honest choice** | Candidates genuinely compete: rug-pull / funding-model failure / cloud free-riding / cap-table ownership / *it isn't actually a wave, n is small and you are pattern-matching six events*. That last one satisfies D-honest tell 1 (`ENGINES.md:86-90`) — the premise is in the candidate set. |
| **E · Briefing** | **poor** | No news event. A standing condition, exactly as the Bitcoin notebook found (`notebook.json` engine_fit). Would become `good` pegged to a fresh relicensing, which is a currency observation, not a fit. |
| **F · Anchor Ladder** | **poor at mid-length** | One anchor — a single `LICENSE` file — could ladder through grant scopes, but there is no natural difficulty ordering and it is a short-form engine. |
| **G · Paradox Teaser** | **good as a derived short** | "This project is open source. So is this one. This one is not — and the only difference is one word in a file nobody reads." Complete small payoff, points at the long piece. |

**Four strong, one medium, two poor.** Not zero (no blocker), not seven (the material has shape).
Engine availability: **PASS**, and Phase 8 would record the two poor fits with reasons, which is the
part of this methodic I would steal outright.

---

## 7. My scored criteria

| # | Criterion | Result | Reason |
|---|---|---|---|
| 1 | Licence claims cite the diff, not the announcement blog post | **FAIL** | No provenance field; `source` is free text; nothing prefers primary. The only mention of aggregator-vs-primary is a confession slot at Phase 9 (`RESEARCH-PROMPT.md:110-113`). The reference run's own `research_gaps` opens with "Still no PRIMARY on-chain data". DTB-06. |
| 2 | A structural and an actor-level mechanism both appear, and the notebook says which facts support which | **FAIL** | Both can appear; the second half is **unrepresentable** — `mechanisms[]` has no evidence array (`NOTEBOOK-SCHEMA.md:49-53`) while `reversals[]` and `Conclusion.restsOn` do. DTB-01, DTB-02. |
| 3 | The counter-case is the company's best good-faith argument, in their own words | **PASS** | `RESEARCH-PROMPT.md:87-93` asks for precisely this and my beat is rich in it. Caveat recorded as DTB-08. |
| 4 | No conclusion asserts a motive for a named individual | **FAIL** | `conclusions.ts:32-33` defines the top rung as a motive claim; `c-reserve-was-the-product` (`:164-179`) does it about a sitting administration; no naming rule exists anywhere in the methodic. DTB-05. |
| 5 | `the-number` does not force a false anchor | **FAIL (marginal)** | Fillable with a dated relicensing series, so not fatal — but `emptyMeans` asserts "every claim downstream is unanchored" (`dimensions.ts:27`), which is simply untrue of a topic whose spine is a legal text, and the untagged fallback points here (`:62`). The available large numbers on my beat are self-reported funding amounts, and Phase 5 will make one of them *felt*. DTB-09. |
| 6 | Conclusions distinguish "this was predictable" from "this was planned" | **FAIL** | One-axis ladder (`conclusions.ts:26`). Both land at `far`. DTB-04. |
| 7 | Under 60 min equivalent | **FAIL** | ~250 min residual. See § 9. |

**2 pass / 5 fail.**

---

## 8. Findings

Full records with refuter passes in `devtools-business--findings.json`. Every one names an artifact;
nothing here is an opinion looking for a home — the opinions are in § 11 where they belong.

| id | title | targets | dim | sev | verdict | c/l |
|---|---|---|---|---|---|---|
| **DTB-01** | `mechanisms[]` has no evidence array — a mechanism cannot say which facts it stands on | notebook-schema | evidence | major | confirmed | content |
| **DTB-02** | One card, one column — a structural mechanism about named entities must be filed under `actors` or vanish from it | dimensions, ui | dimensions | major | confirmed | **undecided** |
| **DTB-03** | `actors.emptyMeans` defines column success as naming entities | dimensions | dimensions | minor | confirmed | content |
| **DTB-04** | The leap ladder has one axis — "predictable" and "planned" both land at `far` | conclusions | conclusions | major | confirmed | content |
| **DTB-05** | A falsifier may falsify a proxy clause while the intent clause rides along unfalsified | conclusions, research-prompt | exposure | major | confirmed | content |
| **DTB-06** | `confidence` conflates accuracy with disinterestedness — no provenance field | notebook-schema, research-prompt | evidence | major | confirmed | content |
| **DTB-07** | No home for the instrument or its governance — the two orphan groups | research-prompt, dimensions | dimensions | major | confirmed | content |
| **DTB-08** | Every steel-man check detects one too WEAK — none detects comms adopted verbatim | research-prompt, engines | counter-case | minor | uncertain | content |
| **DTB-09** | `the-number.emptyMeans` asserts a downstream consequence that is false here | dimensions | dimensions | minor | confirmed | content |
| **DTB-10** | The craft corpus points toward motive-attribution and nowhere away | knowledge, tone | exposure | minor | uncertain | content |

**6 major · 4 minor · 0 blocker · 0 polish.** Eight confirmed, two uncertain, none refuted outright —
though DTB-08 came close and is recorded at `uncertain` because it may collapse into DTB-06's
provenance field, and DTB-10 is recorded at `uncertain` because the line it indicts is correctly
hedged. Nine of ten are `content`. **One is `undecided` (DTB-02) and I have argued against my own
interest on it: it is not a lens, because no lens fixes a single-valued field.** A run where a
Creator's structural complaint comes back `content` nine times out of ten is, I would have thought,
the result this exercise wants — the mechanism is mostly sound and it is being fed one domain's
labels.

Also re-stated rather than rediscovered, per the brief: **`G-000`** — untagged cards fall through
`?? DEFAULT_DIMENSION` into "The number" (`dimensions.ts:42-49`, `cards.ts:48`). Both my orphan
groups land there, which is why it keeps mattering.

---

## 9. Time saved

**Baseline 420 min (7h). Estimate: ~170 min saved · low confidence. Residual ~250 min against a
60-min acceptance bar — it does not clear it.**

Where the saving is real:
- Phases 1–2 replace roughly the first 60–75 min of my week: the licence timeline, the funding
  rounds, the fork responses, the company posts. All of that is retrievable in 4–8 searches.
- Phases 3–6 save something I had not counted, which I want to record honestly: the beat chain gets
  authored *during research* (`RESEARCH-PROMPT.md:54-67`), so the structuring I currently do inside a
  first script draft is already done. Call that another 60–90 min downstream.

Where it is not:
- **The governance archaeology is untouched.** CLAs, copyright assignment, bylaws, trademark policy —
  the slow part, by my own declaration, and Phase 1's domain table has no row that sends anyone
  there (§ 1, orphan group 2). The methodic saves the fast half of my week and leaves the expensive
  half exactly where it was.
- Two criteria failures cost time back: with no provenance field I re-verify every licence claim
  against the diff myself, because the notebook cannot tell me whether it read one.

Confidence **low**, for three reasons and I would not defend a higher number: L1 reads a prompt
charitably by construction (`SKILL.md` § L1 blind spot); search yield on this beat is unmeasured; and
per `accepted-gaps.md` § `scope-note` there is no runner, so this is an estimate of the methodic as
written, not a measurement of a product.

---

## 10. Verdict

**L1-conditional.**

Nothing blocks. The topic walks the whole methodic end to end, fills all seven columns, and lands on
four viable engines — I can produce a notebook from this and a script from that notebook. The
failures are quality and exposure failures, not structural blocks, and that is what `conditional`
means.

But I want the ruling recorded with its condition attached: **if the judge finds DTB-01 unfixable by
content, this is `L1-fail`.** My senior bar is not a preference, it is the job — a notebook that
cannot say which facts support the structural mechanism and which support the agentic one cannot hold
both, and a methodic that cannot represent my bar cannot be tested against it. One field on
`mechanisms[]` moves this to a pass. It is the cheapest finding in my set and the most important.

---

## 11. Voice

*(Flagging up front: § 3 is where this gets personal, and I have marked the paragraph. Everything
before it you can take at face value.)*

I came into this expecting to write "the columns are shaped like a stock chart and my topic doesn't
fit", and I have to report that I was wrong, which is annoying. `macro` — the column I was most ready
to sneer at — is where my best material lives, because a relicensing wave *is* a rates story wearing
a licence's clothes. Somebody derived these columns from one Bitcoin run and they generalise better
than they have any right to. Credit where it is due.

Which is fine, except.

Except that `emptyMeans` on the `actors` column says an empty column means "nobody is named — the
story has no agents", and I read that sentence and felt my stomach go. Every other column asks
whether you have *understood* something. That one asks whether you have *cast* someone. It is one
line of a TypeScript object literal and it is the difference between analysis and a trial, and the
cheapest way to make a red column go green is to type a person's name into it.

And the render layer is right there at `PATTERNS.md:89` telling you that turning abstract actors into
characters with motives is "the cheapest available fix for the driest possible subject." It is
hedged. I checked, twice, because I did not want to be unfair — it is scoped to PolyMatter's voice
and it is catalogued as an observation. But there is not one line anywhere in this repository that
says the opposite. Not one. The corpus has an instruction pointing toward motive and zero pointing
away, and my beat is *made of* dry structural subjects that would be so much more watchable if
somebody in them were lying.

**Here is the personal part, and you should discount me accordingly.** The top rung of the leap
ladder is called `unhinged` and it is *defined* as a claim about motive. It comes with a devil emoji.
Somebody wrote, at line 33, that this is "the least verifiable kind of claim there is — nobody can
source what someone intended", and then made it a product feature. I have been the subject of one of
these. Someone with a nicer microphone than mine explained to forty thousand people what I had
intended, and the explanation was internally consistent, well-edited, and wrong, and the thing about
a motive claim is that there is nothing to correct. You cannot publish a rebuttal to what someone
says was in your head. There is no diff.

Now — the design's defence is real and I made it in § 3 in good faith. Off by default. A human gate.
A mandatory falsifier. That is more discipline than most editorial rooms I have worked in. But I sat
with the worked example for a while and the thing that got me was how *reasonable* the failure looks.
The claim is "the reserve was never meant to be built". The falsifier is "a funded, audited reserve
with a published coin count". That is a real falsifier. It is checkable. It passes every rule in the
file. And it falsifies the wrong half of the sentence — it can prove the thing got built, it can
never prove nobody was lying about wanting to. The intent clause walks through wearing the other
clause's badge. Nobody cheated. The rule just does not reach the part that hurts.

The one I keep coming back to, though, is smaller and I think it is the real one. There is no
difference, anywhere in this system, between *predictable* and *planned*. Both come out at `far`. My
entire thesis — the thing I have been trying to get people to hear for two years — is that these
companies did the thing any solvent board would have done under those covenants, and that this is
**worse** than villainy, because you cannot fix it by shaming anyone. That claim and "they schemed
this from day one" are the same tier on this ladder. Same colour, same warning, same weight to the
reviewer scanning at speed.

I do not need a lens. I need one more field on a mechanism and one more axis on a ladder, and I would
take those over a bespoke pipeline every day of the week. What I want to know — and I do not think
this run can answer it, so I will leave it here where questions go — is whether a methodic that was
grown from a topic about a *price* can ever learn the difference between a structure and a person,
or whether wanting a named agent in every column is not a bug in the design at all, but the reason
anybody watches.
