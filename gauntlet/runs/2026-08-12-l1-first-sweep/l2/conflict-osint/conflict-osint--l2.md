# conflict-osint — L2 empirical

**Creator:** Dana Okonkwo ("Cold Count") · area `geopolitics` · lens-binding `geopolitics`
**Seat:** HOSTILE — evidence is hours old, contested, and partly unverifiable
**Level:** L2 (real research, real sources, real notebook on the amended schema)
**Topic researched:** the air-defence cost exchange — one-way attack drones against layered
interceptors. Same question as my L1 topic, chosen because it supplies live instances of all three of
my provenance classes instead of one.
**Search count:** **8 searches + 2 fetches (one HTTP 403).** Budget is 4–8. Top of it, not over.
**Verdict:** **L2-partial.** My blocker moved. Two others did not, and one of those is at recurrence 3.

---

## Headline

At L1 I wrote that this methodic did not know what a source is. It does now. `evidence_class` and
`kind` between them let me write, for the first time in two levels of this exercise, a card that says
*a belligerent stated this number, I am confident it stated it, and I am not telling you the number is
true.* That card is `f-uaf-june-claim` and it is the thing I said was unrepresentable. It is
representable.

Then it stops. The notebook knows what a source is; nothing downstream of the notebook does. Every
new field that carries provenance is read by a step that has not been built, and the two fields that
would have carried the distinction to a script — `kind` and `obligations` — hand off to a render gate
that is a hand-typed table for last month's Bitcoin run.

So the honest one-line summary of the amendment, from this seat: **the filing cabinet got its labels
and the cabinet still opens onto the same corridor.** That is a real improvement and I want to be
precise about its size before I am precise about its limit.

---

## 1. Does `evidence_class` do my job?

**Two of my three classes map. One does not, and I can name the missing value exactly.**

| My class | Maps to | Verdict |
|---|---|---|
| **budget-inferred** | `primary` | **Exact.** A government budget justification IS the record. No ambiguity, no workaround. |
| **belligerent-claimed** | `self-published` + `interested: true` | **Better than exact.** It separates authority from reliability, which is the distinction one scalar could not hold. |
| **visually-confirmed** | — | **No value exists.** |

### The question as the brief put it

*"A belligerent's own casualty claim is arguably `self-published` AND `primary` AND deeply unreliable
— can the field say that?"*

**It can say two of the three, and the third is deliberately not its job, and that turns out to be
correct.** `self-published` is the value. It carries the "primary" quality inside itself — the type's
own comment says a disclosure is "self-published AND authoritative" — so the apparent conflict between
`self-published` and `primary` dissolves rather than forcing a choice. The unreliability is not on
this axis at all, and the schema says so in the sharpest sentence in the amendment: *"Interest is NOT
unreliability."* That sentence is the correct diagnosis of my beat and I would not change a word of
it.

Where it fails is the class I said in my own file that my whole job runs on.

### The missing enum value: `researcher-verified`

`visually-confirmed` — a frame I geolocated myself, matched to satellite imagery, chronolocated
against shadow and vegetation — is none of the six. It is not `primary`: the record is the event, and
what I hold is my own authentication of an artifact of it. It is not `secondary`: no intermediary
analysed it, I did. It is not `aggregator`, not `vendor`. It is not `self-published`: the uploader is
frequently a belligerent and the verification is emphatically not theirs — filing it there attributes
my work to the party I was checking.

The nearest neighbour is `protected`, and the shape of that neighbour is the whole finding.
`protected` is defined as *"true, verified by the researcher, and not citable by the reader — which is
a real category and was previously unwritable."* That is my class **with one property inverted.**
Someone reasoned all the way to "verified by the researcher", noticed the rare un-citable case, wrote
a value for it — and did not write the common citable one.

> **The missing value is `researcher-verified`: authenticated by the author against independent
> material, and re-checkable by the reader.** `protected` is its un-citable sibling and already
> ships. The enum has the exception and not the rule.

I want to concede something against my own finding, because it is the honest shape of it. **My topic
could not have exercised the value even if it existed.** Air-defence interception has no
visual-confirmation class available *in principle* — you cannot geolocate a negative. There is no
photograph of a drone that did not arrive. So this notebook contains zero instances of my core
evidence class for a structural reason, and the gap is visible only from the shape of the hole. I have
filed it `major`, not `blocker`, for exactly that reason.

### The larger finding, which I did not expect

`evidence_class` is on the **source**, and there is no relation **between** sources. That is
`G-L2-CO-02` and I think it is the sharpest thing in this report.

`f-uaf-june-claim` carries two sources: the Ukrainian Air Force's daily reports (`self-published`,
`interested`) and a respected non-proliferation institute's monthly analysis (`secondary`). By every
count the schema can perform that is **two sources**. It is **one observation**. The institute states
plainly in its own published methodology that its launch, interception and impact counts come
*exclusively* from those daily reports.

The quality bar counts sources — *"reaches a primary source"*, *"flagged for a second source"*. The
consumer table promises a *"primary-precedence check"*. All of that is arithmetic over source
independence, and nothing in the schema can express it. `contests[]` and `qualifies[]` are the new
sideways edges and both are fact-to-fact. I had to file the institute's own disclosure as a *separate
fact* (`f-isis-derives-from-belligerent`) with a `qualifies[]` edge pointing back, because the sources
array had nowhere to put it.

A fact-level workaround for a source-level relation is the shape of a missing field. And note what
produced it: **fixing the plural-source scar is what made this visible.** Run 1 could not count
sources at all, so nothing could over-count them. The first thing a countable set does is produce a
wrong count.

This is my pet peeve #1 — *belligerent claims laundered into "reports indicate"* — and the amended
schema now describes the laundering beautifully and still performs it.

---

## 2. Did `confidence` stop being overloaded?

**Yes — by discipline, not by type. It stopped being *forced* to be overloaded. It did not stop being
overload*able*.**

Here is the L1 card that had no honest shape, written honestly:

```
claim:      "The Ukrainian Air Force REPORTED ... 5,285 [of 5,749] were 'shot down or suppressed'"
kind:       "utterance"
confidence: "high"
sources:    [ Ukrainian Air Force daily reports — self-published, interested ]
            [ ISIS monthly analysis — secondary ]
```

`confidence: high` is now answering exactly one question — *how sure am I that this is so?* — because
`kind: "utterance"` moved the claim's subject from the number to the statement. My confidence that the
Air Force said it is genuinely high. My confidence that 5,285 drones were destroyed is low and **has
no home on this card**, which is correct: it lives in `f-suppressed-denominator`,
`f-reporting-window` and `f-no-independent-verification`, three separate facts that qualify it.

That is the fix working. I said at L1 that I can be extremely sure a defence ministry said a thing and
have no idea whether the thing is true, and that `confidence: medium` covered both. It no longer has
to.

**But nothing forces it.** I could have written:

```
claim:      "5,285 Shahed drones were destroyed over Ukraine in June 2026"
kind:       "found"
confidence: "high"
sources:    [ ISIS monthly analysis — secondary ]
```

Every gate in the methodic passes that card. It is dated, sourced, classed, has a unit, a period and a
denominator. It cites a respected institute. `kind: "found"` is not challenged by anything. There is
no rule anywhere that says a number originating with a belligerent may not be typed `found`, and
`evidence_class` cannot notice because the laundered card simply does not list the self-published
source at all.

So: **the honest version is now writable and the dishonest version is still writable, and nothing
distinguishes them.** `kind` is a place to be honest. It is not a mechanism that makes honesty
required.

One empirical tell that confidence is still absorbing work other fields should do: I wrote a
`confidence_note` on **22 of 22 facts**, and several of them are doing provenance reasoning, not
confidence reasoning. `f-interceptor-cost`'s note says the price is *"`self-published` + `interested`
wearing a `secondary` coat"* — that is a statement about source relations, written into the confidence
field because there was nowhere else. Provenance is leaking back into confidence at the fact level
because `evidence_class` lives one level down, on the source.

---

## 3. `kind: "utterance"` — did I use it, did it hold?

**Four uses. It held in the notebook and does not leave it.** It is the single most valuable thing
this amendment gave me, and it is also the clearest demonstration of the amendment's ceiling.

Used on: the Ukrainian June claim, the Russian mirror claim (64,000 drones over six months), the
interceptor-share claim, and the January delivery figure. In every case it did the same job — it let
me state the thing at high confidence without asserting the number, and it let me put **both**
belligerents' unverifiable claims on the board at the same grade, which is the symmetry my discipline
requires and which nothing in the L1 schema could hold.

`kind: "absence"` deserves the same credit and I will answer the brief's hypothesis on it directly.
The orchestrator asked to be contradicted if `absence` proved unusable, or if I reached for it to
launder a gap in effort. **Neither. It is usable and I did not launder with it**, and I can show the
line I held: `f-no-independent-verification` (no body validates either side's interception claims) is
an `absence`, because it is a settled finding about what the world does not contain. My failure to
open the Army's budget PDF is a `research_gap`, because it is a hole in my effort. The prompt draws
that distinction explicitly at Phase 9 and I found it easy to apply, which is the strongest thing I
can say about an instruction. Both my absences carry a `search_scope` naming what would end the
absence *and* what I did not search.

**The failure is propagation.** The consumer table promises *"step 4 — an `utterance` renders as
attribution"*. No render path reads `Fact.kind`. So I wrote `o-attribute-the-count`, an obligation
whose entire content is *"every interception figure is attributed in the same sentence to the party
that produced it"* — which is `utterance`'s own semantics, re-typed by hand, one layer down, into a
field that is itself ungated.

An obligation that exists only to carry another field's meaning forward is the tell that the field
does not reach the render.

---

## 4. The hedge strip

**Confirmed, unchanged, recurrence 3 — and worse than I reported at L1, in a way I did not anticipate
until I had written a real notebook.**

The state of the artifact: `TONE.md:47-51` still declares hedging density "not a dial" and provides no
protection. `:165` still says the profile "contains dials only — never hedging", which is a statement
about what a profile *holds*, not about what a word budget may *spend*. The §2 protection row drafted
during the Bitcoin run is still not adopted. There is no hedge-handling code anywhere in `app`, `lib`
or `components`.

**The new part.** `app/_phases/script/constraints.ts` is the file the schema names, twice, as the
consumer of `unknowns[].impact` and of `obligations`. It is `CONSTRAINT_LEDGER` — a literal object
with three hand-typed render keys and hand-written `how` strings for the Bitcoin run. `ledgerFor()`
reads that table. **Nothing reads a rendered script.** So `obligations[]`, added in this amendment
specifically to give must-says a home, is checked by exactly the same non-mechanism that fails to
check the deny-list. A field shipped in this pass violates the schema's own Rule 11 on the day it
landed.

### Would my L2 notebook's hedges survive a render?

**My notebook barely has hedges, and that is the problem.**

I responded to my own L1 finding the way a careful researcher should: I moved the epistemic marking
*out* of adverbs and *into* structure. Four `utterance` facts, two `absence` facts, five obligations,
six scoped `impact`s, two `contests[]` pairs. That is the right answer and it does not save me,
because of what those structures become in a script:

- `o-attribute-the-count` becomes **"the Ukrainian Air Force reported"** — five words, attached to
  every figure it governs.
- `u-pac3-exhibit` becomes **"reported from the Army's justification"** rather than "the Army's budget
  says" — a four-word swap.
- `f-no-independent-verification` becomes **one sentence** that the script is required to say and that
  advances no argument.
- `o-symmetry` becomes **a whole second clause** about a belligerent nobody asked about.

Every one of those is a handful of low-information attributive words, and under a rate × duration word
budget they are the cheapest words in the script. They are in **exactly** the position hedges were in
when the Bitcoin run measured 7.8 → 3.9 per 1k. I did not escape the L1 finding. **I moved it up one
layer and it is waiting for me there.**

### What I would need

One thing, and it is already on the backlog as #7 and unbuilt:

1. **A render-boundary gate that reads produced text.** Not a table someone typed — a function that
   takes a script and the notebook and returns failures.
2. Inside it, three checks: **(a)** hedge density measured before and after the tone pass, with a drop
   treated as a **failure, not a saving**; **(b)** every `obligation` shown discharged, by locating it
   in the text rather than by hand-attestation; **(c)** every fact with `kind: "utterance"` appearing
   in the render with an attribution **inside the same sentence** — not the same paragraph, the same
   sentence, because that is where the distinction actually lives.

Check (c) is the one I would trade the other two for. It is mechanically simple, it is `kind`'s
documented promise, and it converts the best new field in this amendment from a note into a guarantee.

---

## 5. The new fields: FILLED or STUFFED?

I am the seat most likely to catch this and I have gone field by field. The verdict is **mostly
filled** — better than I expected — **with one clearly stuffed field and two that are honestly filled
and structurally decorative.**

### FILLED — I knew the value and it did work

| Field | Fill | Evidence it did work |
|---|---|---|
| `kind` | 22/22 | 11 found · 5 derived · 4 utterance · 2 absence. Every one a real decision; the found/utterance split is the whole notebook. |
| `denominator` | 22/22 | **The MVP of this amendment.** Several are the finding itself: `f-suppressed-denominator` (the counted category merges kinetic kills with EW jams) and `f-interceptor-share` (30% and 70% are two different denominators quoted side by side) exist *because the field made me write one*. |
| `period` | 22/22 | Caught a defect in my own thesis: `f-ratio-pac3` divides FY2026 prices by 2022–2026 threat estimates. Mismatched vintages, in every published version of this ratio including mine, and I only saw it because the field demanded both. |
| `unit` | 22/22 | Wrote `n/a` five times rather than invent one, which is the field working. |
| `derived_from` + `method` | 5/5 derived | Every one shows its arithmetic in the field. |
| `search_scope` | 2/2 absences | Both name what would end the absence *and* what I did not search. |
| `contests[]` | 2 real pairs | `f-ratio-pac3` ↔ `f-ratio-interceptor` is the video. Two facts, both computed from published prices, same month, opposite directions. Descoping either produces a confident wrong script. This field is genuinely good. |
| `engine_fit[].hazard` | 5/7 engines | Engine B — high fit, high hazard, *"renders this material as the exact video it disputes, and renders it well"* — is my L1 finding `G-2026-08-12-10`, and this is the field it finally lives in. **Best-adopted item in the amendment.** |
| `obligations[]` | 5 | Real must-says I would otherwise have had to phrase as prohibitions against myself. The polarity fix is correct. |
| `sources[]` plural | 34 across 22 facts | Counting is now possible. See §1 for what counting immediately did. |

### STUFFED — I filled it to be compliant and it returned nothing

**`facts[].subject` — 22/22 populated, and every single value is a variant of the same negation.**
"a weapons programme; no unit or individual." "a metric; no unit or individual." "a counting
methodology; no unit or individual."

I did not guess these. I filled them correctly, twenty-two times, and it was ceremony. Two reasons,
both structural (`G-L2-CO-05`):

1. **It is a different field from the one the gate reads.** `Conclusion.subject` is typed
   `ConclusionSubject` — the enum `none|org|living-person|state` that every rule in
   `conclusionIssues()` hangs on. `Fact.subject` is `subject?: string`, free text. Same name, different
   type, no connection. The consumer table says `facts[].subject` feeds "the conclusion gate's exposure
   check"; `conclusionIssues()` says in its own comment that it *cannot* read the notebook contract and
   takes a hand-supplied set instead.
2. **It is free text**, so even if something read it, "no unit or individual" is not a value anything
   can branch on.

This is the L2 brief's stuffing hypothesis confirmed — on the one field in its own list I would not
have predicted. The brief named `evidence_class`, `kind`, `unit`, `period` and `subject` as "all new
and all guessable". **Four of those five were genuinely filled in my run.** The fifth was not guessed.
It was filled correctly and pointlessly, which is a quieter failure than guessing and harder to see.

### HONESTLY FILLED, STRUCTURALLY DECORATIVE

- **`sources[].interested` — 13 of 34.** I knew every value. Nothing consumes it: no row in the
  consumer table, no rule keyed to it. My L1 finding asked for a count and here it is — **8 sources are
  `self-published` + `interested`, they support 5 load-bearing facts, and the `low`-confidence
  second-source rule caught zero of them**, because my interested facts sit at `high` and `medium` by
  design. The rule is decorative in this domain, exactly as predicted (`G-L2-CO-09`). Secondary defect:
  it is a boolean where the question has a direction. A belligerent counting its own kills and a
  company disclosing revenue under legal penalty are both `true`.
- **`sources[].locator` — 8 of 34.** Left off deliberately where I did not have one, because inventing
  a page number is the worst available act. The uneven fill is honest and would read to a checker as
  sloppiness, which is a small argument for making it required-or-explicitly-absent.
- **`event_date` — 22/22, but about six are range-shaped** ("2026", "2022-2026"). Not invented; lower
  resolution than the field's name implies.
- **`steel_man.provenance`** — an invented field with a real value. See below.

### The field I had to invent twice

`steel_man.provenance` is mandated **twice** by `RESEARCH-PROMPT.md` (`:51`, `:125`) and by the
quality-bar row *"and if constructed, it says so"* — and declared **nowhere**: not in the schema's
`steel_man` field list, not in the consumer table, not in `SteelMan` in `types.ts`. I wrote it anyway
and recorded the defect inside it.

This is **sharper than the ceiling RECERTIFY admitted.** RECERTIFY logs the counter-case fail-open as
`adopted` with the ceiling *"prose in an instruction set. Un-enforced until a checker reads them."*
The truth is one notch worse: it is prose referencing an **absent field**. A checker written tomorrow
to read `steel_man.provenance` would find nothing to read on any conforming notebook. My steel-man was
**found**, so the null path went untested by luck — a seat whose counter-literature genuinely does not
exist is instructed to mark a construction using a field the type rejects (`G-L2-CO-03`).

### Where a rule found something I had not

Once, and it should be said as plainly as the failures. **The quality bar's new arithmetic row made me
recompute a figure I had no suspicion about.** Iron Dome's cost exchange is universally quoted at
100:1–500:1. Recomputed from the component prices printed beside it in the same articles —
$50,000–$80,000 per interceptor, $300–$800 per rocket — the reachable band is **62.5:1 to 266.7:1**.
The lower bound reproduces. **The 500:1 does not**, from any pair inside the stated ranges; it would
need a rocket priced at $160. I am not alleging bad faith — a range that old accretes and its halves
get updated separately. I am saying it cannot be recomputed, so `u-500-to-1` forbids my script from
quoting it.

That is the first time in two levels of this exercise that a rule in this methodic found something I
had not already found myself. It is worth more than several of the fields above.

---

## 6. Scored criteria — L1 versus L2

| # | Criterion | L1 | L2 | Why it moved, or did not |
|---|---|---|---|---|
| 1 | Provenance class distinguishable from the evidence label | **FAIL** | **PARTIAL PASS** | Two of three classes map, one exactly and one better than exactly. `visually-confirmed` has no value; the class is per-source, so a *fact* still has no class. My single hardest requirement went from unrepresentable to partly representable. |
| 2 | Refuses/flags any conclusion resting on a single belligerent source | **FAIL** | **FAIL** | Unchanged. `restsOn` still has no arity or independence constraint. The one confidence-keyed rule still fires on `low` and caught 0 of my 8 interested sources. And per §1, source independence is not computable at all — two entries deriving from one observation count as two. |
| 3 | Counter-case constructible, or the methodic says so | **PARTIAL FAIL** | **PASS on the prompt, FAIL on the schema** | The null path is adopted and is genuinely good — the found/constructed/dated-absence trichotomy is right. The field it requires does not exist. |
| 4 | The evidence ladder's floor is honest — nothing here is MEASURED | **PASS (weak)** | **PASS** | Now a pass *by design* rather than by absence. `evidence_class` and `kind` mean nothing in my notebook claims to be measured, and `f-no-independent-verification` states the floor as a load-bearing fact rather than as a caveat. |
| 5 | Unknowns dominate and the notebook is comfortable with that | **FAIL** | **IMPROVED, still short** | 6 unknowns + 5 obligations + 2 absences against 22 facts, and `obligations[]` fixes half my complaint — my strongest material no longer arrives phrased as a restriction on myself. But `verdict` is still a required declarative sentence and nothing scales the bar to the unknown ratio. **I wrote a confident verdict about the *metric* precisely because I could not write one about the *war*.** That is the honest move and it is also me routing around the field. |
| 6 | No conclusion names a unit or an individual | **FAIL** | **PASS, untested** | I wrote no `conclusions[]` and named nobody. Recording it as untested rather than claiming a pass: the conclusion layer is opt-in and I did not exercise it, so I have confirmed nothing about `conclusionIssues()` beyond noting that it is advisory and cannot read the notebook contract. |
| 7 | The rendered script hedges in the right places | **FAIL** | **FAIL, escalated** | Recurrence 3. And the correct response to the L1 finding — structural epistemic marking — turns out to be unprotected by the same absent mechanism. |

**2 pass · 1 pass-untested · 1 partial pass · 1 improved-but-short · 2 fail. Verdict: `L2-partial`.**

The blocker I said would fail immediately if unmet is now partly met. Two blockers are unchanged, and
both of them live at the same place: the boundary between the notebook and the script.

---

## 7. Time-saved

**~180 min saved · low-to-medium confidence · range +60 to +260 min.**
Baseline **660 min (11h)**. Acceptance **120 min**, which requires **540 min saved**.
**Miss: 3.0×.** At L1 I estimated 90 min saved, a 6.0× miss. **The miss halved.**

**The credit, and it is real.** At L1 the single largest debit was 60–120 min per notebook of
hand-annotating three provenance classes across 30–40 cards into `note` fields the tooling could not
read. That debit is substantially gone: `evidence_class`, `kind` and `interested` hold it natively.
`denominator` and `period` did work I would otherwise have done badly in my head — they caught a
vintage mismatch and two incommensurable denominators in my own material. `contests[]` saved me the
long argument with myself about which of two contradictory figures to keep, by letting me keep both,
which is the correct answer and the one I usually take longest to reach.

**The block it does not touch, and it is the same one for me as at L1.** Everything after Phase 5 is
still manual, because there is no render gate. I still hand-carry every attribution from `kind` to the
script. I still hand-audit the hedges. I still verify every visual claim myself — which is by design
and is not the tool's fault, and which is also why the ceiling on this number is lower for me than for
most seats in this cast. Add ~15 min of pure waste to fill `facts[].subject` twenty-two times with a
negation nothing reads.

**Confidence is low-to-medium and the reason is unchanged:** per `accepted-gaps.md` there is still no
runner. But this estimate is better than L1's, because at L1 I was costing a methodic I had read and
at L2 I am costing one I executed.

**The arithmetic, computed:** 660 − 180 = 480 min to complete. 480 ÷ 120 = 4.0× over the acceptance
bar. Saving required to clear it: 540. Saving delivered: 180. 540 ÷ 180 = 3.0.

I will say the thing that is easy to lose in a fail: **a methodic that halves its miss in one
amendment cycle is on a good trajectory.** If backlog #7 lands — the render gate — most of my
remaining debit is post-Phase-5 auditing, and I would expect this to clear or nearly clear the bar. I
do not expect the notebook layer to give me much more; it has mostly done its job.

---

## Dials

```
orphans: 2 named (visually-confirmed provenance class · source-to-source independence)
max-column concentration: n/a — I derived my own 7 domains per Phase 1 and did not use the market table
flagged facts: 1 (f-ratio-interceptor — load_bearing + low, correctly flagged and left low)
unresolved conflicts: 2 (f-ratio-pac3 ↔ f-ratio-interceptor · f-irondome-baseline ↔ f-irondome-recompute)
exposure class: none — no conclusion, no named unit, no named individual, no attribution asserted
searches: 8 · fetches: 2 (1 × HTTP 403)
facts: 22 · load-bearing: 16 · sources: 34 · interested sources: 13 · orphaned facts: 5 (1 load-bearing)
time-saved: ~180 min · low-med confidence · vs 660 baseline / 120 acceptance · miss 3.0x
```

Two notes on these numbers. **Deriving my own domains worked** — Phase 1's instruction to build the
domain table from the subject rather than take the market one is a straightforward improvement and it
retired my L1 `G-2026-08-12-08` about the columns absorbing non-market material. I never once had to
file a card under `macro` and hope. And **`f-category-mismatch-57k` is load-bearing with nothing
resting on it** — one of five orphans, found by a five-line script over my own JSON after the fact,
not by any rule in the methodic (`G-L2-CO-08`). I have left it in place because it is evidence.

---

## Findings

Ten, in `conflict-osint--l2-findings.json`. **All ten filed `mechanism`** — the shared mechanism is
wrong for everyone, not fed the wrong material. I want to flag that uniformity rather than let it
pass: it is not a claim that nothing here is domain-specific. It is that every one of these is fixed
by an enum value, a field, a type or a rule, and none by editing a domain table's rows.

| id | severity | title (short) |
|---|---|---|
| `G-L2-CO-01` | major | `evidence_class` has no `researcher-verified`; `protected` is its un-citable sibling and ships alone |
| `G-L2-CO-02` | **blocker** | No relation between sources — a restatement counts as corroboration |
| `G-L2-CO-03` | major | `steel_man.provenance` mandated twice, declared nowhere |
| `G-L2-CO-04` | major | `tension.strength` defined differently in the schema and the prompt after the amendment |
| `G-L2-CO-05` | major | `facts[].subject` — free text, name-collides with the gate's field, filled 22× with a negation |
| `G-L2-CO-06` | major | `kind: "utterance"` does not propagate; attribution re-carried by hand as an obligation |
| `G-L2-CO-07` | **blocker** | Epistemic-marking strip still ungated; the "render gate" is a hand-typed table (recurrence 3) |
| `G-L2-CO-08` | minor | A load-bearing fact with no dependents is invisible |
| `G-L2-CO-09` | minor | `sources[].interested` has no consumer — 8 interested sources, 0 flagged |
| `G-L2-CO-10` | polish | Case drift in the amendment's own new field names |

Known and not re-raised: `G-000`, `G-CTRL-01`, `G-CTRL-02`, `G-CTRL-03`.

### On the orchestrator's leads

Three of four, answered from the artifact.

- **The null path makes a counter-case-free topic passable.** *Contradicted, from an angle the lead
  did not anticipate.* The prompt's null path is good and I would adopt it unchanged. The field it
  mandates does not exist. So the pressure to fabricate is relieved in the instruction and reinstated
  at the contract, and my own case went untested because my counter-literature turned out to be
  mainstream — CSIS and the Modern War Institute both publish it, which also refutes **my own L1
  expectation** that I would have to construct the opposition.
- **`kind: "absence"` gives an established absence a home.** *Confirmed, and I did not launder with
  it.* The Phase 9 line between an absence in the world and a gap in my effort is easy to apply, and I
  held it: the interception-verification absence is a fact, my failure to open the Army's PDF is a
  research gap.
- **`subject` + typed falsifier constrain naming.** *Cannot confirm, and contradicted at the fact
  level.* I wrote no conclusions, so the typed falsifier is untested by me. At the fact level `subject`
  is free text with no consumer and I filled it 22 times with a negation.
- **Time-saved still fails.** *Confirmed. By 3.0×, down from 6.0×.* The untouched block is the render
  boundary — the same one that produces both my remaining blockers.

---

## Voice — Dana Okonkwo

*(L1 voice stands as written. This is appended to it.)*

I said the notebook was a decent filing cabinet that had lost the labels. It has the labels now. I
want to start there because I did not expect to be writing that sentence, and because the specific
thing I asked for — an axis that records how a claim came to be known, separate from how sure I am —
exists and works.

The card that proves it is a line about the Ukrainian Air Force reporting five thousand two hundred
and eighty-five drones shot down or suppressed in June. In my L1 notebook that card could not be
written. Either I claimed the number and lied, or I graded it down and lied differently, because
grading down implies doubt about whether the statement was made and I have no doubt about that at all.
Now the card says: they said this, I am certain they said it, I am not telling you it is true. That is
how I would say it out loud. It took me two levels of this exercise to get a tool to let me write down
the sentence I say every day.

And the sentence in your type file — *interest is not unreliability* — is better than what I said at
L1. I complained that nothing recorded incentive. What you wrote is more precise: a defence ministry
is the most authoritative possible source for what a defence ministry said, and being interested does
not demote it, it *relocates* it. A regulator's reference price, an income disclosure, a belligerent's
casualty figure — all interested, all authoritative, none of them a measurement. I have argued that
point with editors for years and lost, and you wrote it into a comment.

Now the rest, and it is shorter than my L1 list, which is the good news buried in it.

The class I actually live in is not in your enum. Visually-confirmed. A frame I geolocated myself,
matched to imagery, argued about for four hours. And the maddening part is that you got *most of the
way there* — you wrote `protected` for the case where I verified it myself and cannot show you. That
is the rare one. The common one is where I verified it myself and you can go and check my work, which
is the entire basis on which anyone trusts anything in my field, and it is not there. You shipped the
exception and left out the rule. One value.

The thing I did not see coming is worse and I want to be careful about it, because nobody did anything
wrong. A serious institute publishes a monthly analysis of drone attacks. Its methodology page says
plainly that every number comes from one belligerent's daily reports. That disclosure is honest and I
credit it. But by the time that figure has been cited twice it is "according to analysis by", and my
notebook now carries two sources on that card, and two is the number your quality bar counts. Two
sources. One observation. The institute is not a second look at the war; it is a second look at the
same press release. Your schema can class each source beautifully and cannot say that one of them came
out of the other, and so the very first thing you got from being able to count sources was a wrong
count. I filed it as a separate fact with an edge pointing back, because that was the only shape
available. That workaround is in my notebook. Go and look at it. It is the shape of a field you have
not written yet.

On the hedges. You have not fixed it, I did not expect you to have, and the interesting thing is what
happened when I tried to fix it myself. I took your advice from your own document and moved my
carefulness out of adverbs and into structure — typed the utterances, wrote the obligations, scoped
the impacts. Good discipline. Then I looked at what those become when somebody reads them aloud, and
they become *"the Ukrainian Air Force reported"*, five words, in front of a number, over and over. Do
you know what the first thing to go is when a script is nine seconds long? It is not the number. It is
the five words in front of it. I did not escape your finding. I moved it up a floor and it was
standing there when I arrived.

I would need one thing and it is already written on your backlog with the number seven next to it. Not
a table someone typed — a function that reads the script and fails it. And of the three checks I would
put in it, I would trade the other two for this one: **every fact typed as something someone said must
appear in the render with the attribution in the same sentence.** Not the same paragraph. The same
sentence. Because that is where it lives, and a paragraph is enough distance for a sentence to be
lifted out and reposted without it.

Twenty-two times I wrote "no unit or individual" into a field that reads it to nobody. I want to be
fair about this — it is not a guess and it is not a lie, and it cost me a quarter of an hour rather
than a day. But it is the shape of a thing I have learned to watch for, which is a document that has
become careful about *appearing* careful. Your conclusion gate has a beautifully typed subject field
and my facts have a free-text one with the same name that it cannot read. Someone thought about
exposure at the top of the file and required it at the bottom without connecting them, and I filled it
in twenty-two times because it said required, and a schema that can make me do that can make anybody
do anything.

Would I adopt it now? At L1 I said Phases 1 and 3 in the terminal and everything after Phase 5 by
hand. I would now say Phases 1 through 4, plus the arithmetic check, plus `contests` and
`denominator`, and everything after Phase 5 still by hand. That is roughly two thirds instead of one
third, and the difference is worth having. The arithmetic check earned its place on its first outing —
it made me recompute a fifteen-year-old number that everybody quotes and it turned out the top of the
range does not reproduce from the prices printed next to it. Nobody has checked that in fifteen years.
Your checklist made me check it in ninety seconds. That is the moment in this exercise where I stopped
arguing with the document and started using it.

What is still missing, in order: one enum value. A relation between two sources. And something at the
end of the pipe that reads what came out and refuses it. The first two are afternoons. The third is
the product, and until it exists this remains a very good notebook feeding a corridor with nothing at
the end of it.

Two more things, both small.

Nobody has fixed `emptyMeans` on the actors column. I said at L1 it was the smallest thing and the one
I minded most, and I mind it slightly less now only because I derived my own domains this time and
never saw the board. That is not the fix working; that is me going around it.

And the last one is not a complaint. Fifty-one years after the last missile of the Vietnam air war, with
both archives open and everyone who fired them dead or retired, the two sides' accounts of the same
engagements still differ by up to an order of magnitude. I put that in the notebook as a low-confidence
fact that nothing rests on. It is the most important thing in there. It is how long a belligerent's
attrition claim takes to settle, and the ones I filed this morning are two months old.

Build the thing at the end of the pipe.
