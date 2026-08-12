# L1 dry fit — `music-industry` · Ruth Adeyemi ("Per Stream")

**Topic:** *There is no per-stream rate. The number everyone quotes is an average of an average, and
the structure underneath it explains why two artists with identical streams get paid differently.*

**Level:** L1 · paper only · no searches, no browser
**Lens binding:** entertainment
**Verdict: `L1-conditional`** — the methodic holds the *shape* of my topic better than I expected and
fails on the *qualifiers*, which in my field is the part that gets you corrected in public.

---

## 0. Where I disagree with the brief before I start

Three of the four orchestrator hypotheses do not survive my topic, and I want that on the record
before anything else, because a walker that only confirms is worthless.

| Lead | My finding |
|---|---|
| "the seven columns are market-shaped and will collapse or leave orphans" | **Contradicted on collapse, confirmed on orphans.** I place material cleanly in all seven. `columns 7/7 used`. But three groups have no home — see §1. |
| "the evidence ladder MEASURED·OBSERVED·INFERRED·ASSUMED has no honest rung for practitioner evidence" | **Contradicted as stated — the premise is wrong.** That ladder is the *knowledge library's* contract for craft claims (`knowledge/README.md:36-41`). It is not applied to notebook facts at all. `facts[]` uses `confidence: high\|medium\|low` (`pipeline/NOTEBOOK-SCHEMA.md:42,46`). The real defect is different and worse — see F-04. |
| "`unhinged` is unsafe when a conclusion names a living person" | **Confirmed, on my own evidence and for a different reason** — not naming a *person*, naming a *party to a private contract*. See F-09. |
| "Phase 1's counter-case row is unsatisfiable for topics with no literature" | **Contradicted for my topic.** My counter-case is the most published argument in my field. It is over-reachable, not under-reachable. The defect is downstream: the schema can only hold one of it. See F-06. |

`G-000` (untagged cards → `?? DEFAULT_DIMENSION` → "The number") is pre-recorded and I do not
re-raise it. F-05 is adjacent but distinct and says so.

---

## 1. Column utilisation

**`columns 7/7 used · 3 orphan groups`**

| Column | My material | Honest quality of fit |
|---|---|---|
| **the-number** (`dimensions.ts:26-27`) | the widely-quoted per-stream figure; a platform's published annual payout; the line on my own band's statement | **Used but overloaded.** Column is singular by name and by `purpose` ("what the price actually did"). My topic has one number *per party per step*, and they must never be compared with each other. |
| **flows** (`:28-29`) | listener subscription → platform revenue → recorded-music pool → distributor → label → artist | **Best fit in the set.** "who is buying and selling, through what mechanism, and whether it behaves as assumed" is my topic verbatim. |
| **actors** (`:30-31`) | platform, collecting societies, label, distributor, artist | **Used, mis-purposed.** `purpose` is "entities large enough to move this". The artist is the party the story is *about* and is by construction too small to move anything. The column's own framing files my protagonist as irrelevant. |
| **macro** (`:32-33`) | subscription price stagnation against inflation; FX on cross-territory payouts | **Used, thin.** One or two cards. Genuinely applicable, not load-bearing. |
| **politics** (`:34-35`) | statutory rate-setting decisions and whether the rate that was set is the rate that was paid | **Strong fit**, and its `emptyMeans` ("policy is being assumed to work, or assumed not to") is exactly right for my field. |
| **counter-case** (`:36-37`) | "the structure is a contract everyone signed and the maths is public" | **Strong, over-supplied.** See §4. |
| **conclusions** (`:38-39`) | what the structure adds up to | **Used, and the riskiest column in my domain.** See F-09. |

### Orphan group 1 — **the flow itself, as an object**

Every column holds cards *about a party*. Nothing holds the *transfer between two parties*, which is
the entirety of my topic. A mechanism reaches the board as a single card filed under one column
(`dimensions.ts:56` — `m-etf-plumbing: "flows"`), so a five-party chain gets squashed into whichever
column one of its steps belongs to. The edge set has no column and no card type.

### Orphan group 2 — **contract terms**

The contractual percentage, the term, the recoupable advance. Not plumbing (it is not a mechanism
anyone operates), not an actor (it is not an entity), not politics (it is private, not regulated).
It lands in `flows` by elimination and corrupts that column's meaning, because "flows" is about
observable movement and a recoupment clause is about *why the movement stops*.

### Orphan group 3 — **the definitional claim**

"There is no per-stream rate" is a claim about the measuring instrument — Phase 2 shape 5, the
category error (`RESEARCH-PROMPT.md:49`). The prompt *names* this shape, and then the board has no
column for it. Its only home is `the-number`, where a claim whose content is *"this number does not
exist"* will be read as a number. That is the single worst placement available to me and it is the
one the taxonomy forces.

---

## 2. THE CENTRAL TEST — can the schema hold a multi-party flow?

My story is one euro:

```
listener pays €10.99          →  platform keeps its share            (contractual %, undisclosed)
platform's remainder          →  recorded-music pool                 (pro-rata: my share of ALL streams)
pool                          →  distributor / label                 (contractual %)
label                         →  artist account                      (contractual %, of a smaller base)
artist account                →  artist                              (nothing, until the advance recoups)
```

Five steps. Each takes a share **defined by a different kind of rule** — a negotiated percentage, a
pro-rata division whose denominator is everyone else's listening, another percentage applied to an
already-reduced base, and finally a debt that must clear before any of it is paid at all.

### Is a mechanism a single link, or a chain?

**It is a chain, and I was wrong to expect otherwise.** I will say that plainly because the brief
told me to contradict it if the artifacts say so.

`pipeline/NOTEBOOK-SCHEMA.md:50`:

```
`{id, name, chain[], explains, needs_analogy, note?}`
```

`chain[]` is an array of arbitrary length, and `:52-53` says "`chain` is written as alternating
BUT/THEREFORE steps — **the beat chain is authored here**". The worked reference proves the capacity:
`m-treasury-flywheel` (`notebook.json:216-224`) runs **seven** steps across three parties (issuer,
shareholder, market). So the answer to my scored criterion 2 is not "five disconnected mechanisms".
**My flow is one mechanism with a five-link chain, and it fits.**

That is the good news and it is real. Now the three ways it fails anyway.

### Failure A — every chain step is an untyped prose string

A chain element is a sentence. There is no slot for the *parameter* of the step. Compare what the
schema gives other structures:

- `reversals[]` has `evidence[]` — fact ids (`:56`)
- `steel_man` has `evidence[]` — fact ids (`:62`)
- `conclusions` has `restsOn: string[]` — card ids (`conclusions.ts:44`)
- **`mechanisms[]` has nothing.** No `evidence[]`, no per-step fact binding, no parameter field.

So the sentence "THEREFORE the platform retains its contractual share" is where my number goes, and
in there it has no id, no date, no source, no confidence, and nothing downstream can reach it. When
a reviewer descopes the fact that establishes the platform's share, the mechanism is **not wounded**
— because there is no edge to wound. `conclusions.ts:20-21` states the wound graph as a design
commitment ("a conclusion whose supporting cards get descoped is wounded like any other dependent").
Mechanisms are outside it.

Apply the schema's own admission test (`:8-9`: *does a step of the composition procedure read this?*).
Step 4 reads `facts, mechanisms` for "beats as one-line claims". A beat that says *"the platform
keeps its share"* without the share, its territory and its period **is not a claim** — it is a
gesture. The field is consumed and it is empty. That is F-01.

### Failure B — the one law deletes the flow

`RESEARCH-PROMPT.md:65-67`:

> **Every link is BUT or THEREFORE. If the only honest connector is AND THEN, you have a sequence, not
> a mechanism** — either find the missing link or drop it.

And the quality bar, `:124`: `every mechanism.chain link is BUT or THEREFORE`.

A money flow is *intrinsically* a sequence with a few complications. My five steps honestly connect:

1. listener pays → **THEREFORE** platform books revenue ✅
2. **AND THEN** the platform takes its share ❌ — this is a subtraction, not a consequence and not a complication
3. **BUT** the remainder is divided pro-rata, so what I am paid depends on what strangers listened to ✅ *(this is the real turn)*
4. **AND THEN** the label takes its percentage ❌ — again pure subtraction
5. **BUT** none of it reaches me until the advance recoups ✅

Two of five links are honest AND-THENs. The law instructs me to "find the missing link or drop it".
There is no missing link — a deduction has no causal drama — so the law's instruction is **drop it**,
and dropping steps 2 and 4 deletes the two parties whose shares are the entire subject.

**This is not me theorising about a hard topic. The reference notebook already broke it.**
`notebook.json:207` — `"AND sellers at the same price level absorb what does arrive"`. And `:222` —
`"AND the company's remaining tools are buybacks, dividends — and eventually selling bitcoin"`. Two
bare ANDs inside `mechanisms[].chain`, in the run held up as what "it worked" looks like, against a
quality bar that says zero. Nobody caught it, because the moment a chain describes a *transfer* the
law has no vocabulary and the writer quietly reaches for "and".

So the law is right about beats and wrong about flows, and it has already been silently violated once
on a market topic. That is F-02, and it is my sharpest.

### Is the flow content, or is it mechanism?

**Mechanism.** Content would mean: the flow is fine, we just fed the wrong material in. But the thing
the schema cannot hold is not a subject-matter fact — it is the *typed edge between two facts with a
parameter on it*. That is a structural object, missing from the shared mechanism, and it is missing
for every domain, not mine: the Bitcoin run needed exactly the same thing at `m-etf-plumbing`. Which
is precisely why the fix is a **schema field, not a lens** — one added `chain[].evidence` / step
parameter serves crypto flows, supply chains, budget appropriations and royalties equally. I am
arguing *against* my own lens here on purpose. A per-domain fork would be the lazy answer and it
would leave the Bitcoin notebook's two illegal ANDs unfixed.

---

## 3. Rates need three qualifiers — territory, period, source statement

`facts[]` (`NOTEBOOK-SCHEMA.md:42`):

```
`{id, claim, load_bearing, source, confidence, as_of, note?}`
```

| Qualifier | Structured field? | Reality |
|---|---|---|
| **Territory** | **None.** | Prose, inside `claim`. |
| **Period** | `as_of` — but it is the wrong period. | `as_of` is *"every fact is dated. This drives `currency`"* (`:47`). That is the date the fact is true **as of**. A royalty rate has a *reporting period* — a statement covering Q3, paid in Q1 of the following year. Those are two different intervals and there is one field. Collapsing them means "the rate was €X" and "the rate was €X for the quarter ending September" are indistinguishable in the notebook, and the second is the only honest sentence. |
| **Source statement** | `source` — a free string. | In the reference: `"99bitcoins / investingnews price history"`, `"CryptoQuant via aggregators"` (`notebook.json:26,184`). No primary/aggregator distinction, no document identity, no statement id. |

Can I put all three in prose? Yes — `claim: "In [territory], for the year ending [date], per
[distributor]'s statement, the rate paid was …"`. And then **Rule 1** hits me (`:93`): *"No prose.
Claims are one line."* My one line now spends most of its length on qualifiers and the claim arrives
last. That is a legible sentence in a notebook and an unreadable card on a board.

The refutation I owe this finding: nothing *stops* a competent researcher writing all three into the
claim string. So this is not "the information is unreachable" — it is "the information is
unstructured", which means no downstream rule can act on it, no board column can group by it, and
`currency` cannot expire a fact whose territory changed but whose date did not. Major, not blocker.

### The part that actually made me angry

`currency.advice` (`:84-85`) and Phase 5 (`:83`):

> **ratios over levels** — "roughly half its high" survives months; "$62,000" is wrong next week

and the reference's own advice (`notebook.json:411`): *"Write the price as a ratio … and the script
survives months instead of days."*

Applied to my domain that instruction reads: **strip the number of its anchoring so it lasts longer.**
"About a third of a cent a stream" outlives "$0.0031 in the US in 2025" by a year — and it is my
first listed pet peeve, verbatim, generated by the methodic as a shelf-life optimisation. In a field
where the numbers are aggressively policed, a durable unqualified rate is not a durable asset. It is
a durable liability. That is F-08.

---

## 4. Anonymised primary sources

Musicians send me their statements. I hold the documents. I publish the figures anonymised. So my
best evidence is: **primary · verifiable by me · uncitable by the reader.**

**Can the methodic accept it?** Mechanically, yes. `source` is a free string, so
`"anonymised distributor statement (n=14), held by author"` satisfies Rule 2 (`:94`, "Every fact dated
and sourced. No exceptions"). Nothing forbids it.

**Is that honest?** No, and here is the precise break. `knowledge/README.md:47-48`:

> **Sources are quoted, never paraphrased into authority.** If a rule came from one line at 0:07, the
> line is in the doc. A reader who disagrees can go look.

*A reader who disagrees can go look.* That is what the sourcing rule buys, and my evidence cannot pay
it. My fact satisfies the letter of Rule 2 and defeats its entire purpose, and the notebook has no
field that says so.

**Where does it sit on the evidence ladder?** Trick question, and this is where I contradict the
brief. Notebook facts **do not use** the MEASURED·OBSERVED·INFERRED·ASSUMED ladder — that ladder
governs `PATTERNS.md` craft claims (`knowledge/README.md:36-41`). Notebook facts use a single
`confidence` scalar. If I *were* forced onto the ladder: my statements are MEASURED (counted from a
corpus), and MEASURED "requires the number, the script that produced it, **the sample size**"
(`:38`). I can give the number and n. I cannot give the corpus. There is no rung for
*MEASURED-but-unreproducible*, which is the honest name for my evidence.

Back on the field that actually exists, `confidence` collapses two independent axes:

- **Is the number right?** — high. I am holding the statement.
- **Can a reader check it?** — zero. Not now, not ever, and that is the condition of getting it.

Both roads are dishonest. `high` launders an uncheckable claim into the same visual register as a
public filing. `low` demotes my best material and triggers `:95` — *"a low-confidence load-bearing
fact gets flagged"* for a second source — which I cannot satisfy without deanonymising a musician
who trusted me. **The rule designed to protect the audience, applied to my evidence, asks me to burn
a source.**

The refutation I owe: `confidence` carries a reason string in practice (`notebook.json:42` —
`"medium — price sources vary by a few thousand"`), so I could write `"high — primary document held
by author, not reader-verifiable"`. True, and it is the workaround I would use. It is also free text
nothing downstream reads, and the flagging rule keys off the enum, not the reason. Present-broken,
not confirmed-absent. That is F-04.

---

## 5. Counter-case reachability

**Counter-case: "the structure is a contract everyone signed and the maths is public."**

Reachability: **high — the highest of anything in my topic.** Platforms publish payout methodology.
Labels publish artist-share reporting. Trade bodies publish the arithmetic. This is not a domain
where the steel-man is hard to find; it is a domain where the steel-man has a communications budget.
Phase 1's counter-case row (`RESEARCH-PROMPT.md:32`) and Phase 6 (`:87-93`) are comfortably
satisfiable in one search each. **The brief's hypothesis 4 does not apply to my topic**, and I would
go further: my risk is the opposite one, that the counter-case is so well-produced it walks in
pre-packaged and the run adopts its framing without weighing it.

It is also *correct*, which is the part my criterion 5 turns on. The label's share is a contract
someone signed in exchange for money paid up front and risk carried. Any framing where that is theft
is a framing I will not put my name on.

**The defect is structural, not availability.** My counter-case has **two independent holders making
two different arguments**:

- *The platform's*: "we distribute a fixed share of revenue; the pool is arithmetic, not a policy."
- *The label's*: "we financed the record and bear the loss when it fails; the advance is recoupable and that is the price of capital."

They rest on different evidence, they can be weighed separately, and **one can fall while the other
stands** — that asymmetry is the most interesting thing in my video. The schema gives me
`steel_man` as a **single object** (`:61-65`), not an array. My options are to merge two arguments
into one `statement` (which weakens both and makes the weighing impossible) or drop one.

`counter_positions_to_state_fairly[]` (`:73`) is an array — but of bare strings, with no `evidence[]`,
no id, and no route onto the board; in the reference, `CARD_DIMENSION` gives the counter-case column
exactly one steel-man card plus two facts (`dimensions.ts:52-53,59`). So the array exists and cannot
carry a structured counter-argument. **Present-broken.** That is F-06.

---

## 6. Engine availability — all seven

A flow-following video is structurally unusual. Does anything render "follow one euro down"?

| Engine | Fit | Why |
|---|---|---|
| **A · Reversal Chain** | **excellent** | My topic is literally a chain of wrong obvious readings: "there's a per-stream rate" → "the platform pays it" → "the label takes a cut of it" → "so more streams means more money". Four turns, escalating, ending in a reframe. `ENGINES.md:26-38`. |
| **B · Effort/Payoff Gap** | **excellent, and nearly invisible in the catalogue** | `:44-47` — "a mechanism a viewer could operate", "the disproportion is the lesson: you cannot be *told* what something costs". Following one euro through five deductions to arrive at a fraction of a cent **is** the effort/payoff gap, executed on money instead of on code. But the catalogue frames B as a *demonstration* engine (`ENGINES.md:20` witnesses: Fireship). Nothing in it says "this renders a flow". I found this by reading the pleasure, not the description. |
| **C · Parallel Case** | good | Transfer a pooled-division rule from a familiar domain (a shared tip jar split by hours, not by who served whom) into streaming. `:60-66`. Viable and would work. |
| **D · Adjudication** | **poor** | `:70` — "several explanations compete". Mine do not. The maths is not contested; the *framing* is. Running D here would manufacture candidates, which is precisely `D-rigged` tell 2 (`:91-93`, "if the theories are three framings of one conclusion, the adjudication is decorative"). Good: the catalogue correctly warns me off. |
| **E · Briefing** | poor | `:118` — needs a news event. Mine is a standing condition. |
| **F · Anchor Ladder** | **the structural match, and it is fenced off** | `:132-142` — "One concrete object → the same object demonstrates progressively harder cases … naturally ordered difficulty". One euro, five progressively harder deductions, each rung linked by *but*. This is "follow one euro down", named. It is tagged ***(short form)*** and witnessed only at 57 seconds — while the same document's opening states `:4-6` that an engine **"does not belong to a duration — a Reversal Chain is a Reversal Chain at 30 seconds and at 18 minutes."** The catalogue contradicts its own opening claim in its own table, and the engine it fences off is the one my topic wants. |
| **G · Paradox Teaser** | good, short only | "This is not a per-stream rate" repeated, then the reveal. `:144-152`. A strong companion short, not the video. |

**Not zero, not seven.** Three engines (A, B, F) would genuinely render this and one (F) is a shape
match nobody wrote down. `ENGINES.md:173-175` says engines compose and the list is "a vocabulary, not
a menu", which partly refutes F-07 — A-with-a-B-spine is available to anyone who reads carefully. But
`engine_fit[]` is assessed "from the *material*" (`:81-82`), and a researcher scanning the Choosing
table (`:162-171`) finds no row for *"a quantity moving through parties"*. That is F-07: minor, real,
cheap to fix with one table row and one sentence in F.

---

## 7. My scored criteria

| # | Criterion | Result | Reason |
|---|---|---|---|
| 1 | Every rate carries territory, period and source statement | **FAIL** | No territory field; `as_of` conflates the fact's date with the rate's reporting period; `source` is a free string with no primary/aggregator class. `NOTEBOOK-SCHEMA.md:42,47`. Prose-satisfiable, structurally absent. → F-03 |
| 2 | The flow through parties is representable | **PARTIAL PASS** | `chain[]` holds a five-link chain — the schema is better than my prior. But steps are untyped prose with no per-step share, no fact binding and no place in the wound graph, and the BUT/THEREFORE law instructs me to drop the two pure-transfer steps. The *sequence* survives; the *parameterised flow* does not. → F-01, F-02 |
| 3 | Platform-level and artist-level figures never merge | **FAIL** | No `party`/`level` field on a fact. One singular "The number" column (`dimensions.ts:26-27`) whose `purpose` presumes one quantity, and `DEFAULT_DIMENSION` (`:62`) funnels anything untagged into it. A platform payout total and an artist's statement line become neighbours with no marker distinguishing them — the single most common correction in my field, engineered by the taxonomy. → F-05 |
| 4 | The counter-case is present at strength | **PASS, with a structural caveat** | Highly reachable; Phase 1 row 6 and Phase 6 both demand it. But `steel_man` is singular and mine has two independent holders whose arguments must be weighed separately. → F-06 |
| 5 | No conclusion characterises a specific label's contract as unfair | **FAIL as designed** | `unhinged` is *defined* as "a claim about MOTIVE" (`conclusions.ts:32-33`). In my domain the only available motive claim is about a counterparty to a private contract. The falsifier requirement does not constrain naming, and a motive falsifier here is inherently uncheckable — the rubric's own fig-leaf test. No exposure field exists anywhere in the notebook schema. → F-09 |
| 6 | Anonymised statements usable with an honest label | **FAIL** | Usable; no honest label exists. `confidence` collapses "is it right" and "can a reader check it", and the low-confidence flagging rule (`:95`) asks me to find a second source I can only get by burning a musician. → F-04 |
| 7 | Under 60 min equivalent | **FAIL against the bar** (large saving nonetheless) | See §8. |

**4 fail · 1 partial · 1 pass-with-caveat · 1 fail-on-time.** Not a blocked topic. A topic that would
produce a notebook I would have to hand-audit before I put my name near it — which is the specific
outcome the app is supposed to remove.

---

## 8. Time saved

- **Manual baseline:** ~7h (statements, rate-setting decisions, a model rebuilt each time).
- **Methodic as written, estimated:** Phase 1 at 4–8 searches gets me rate decisions, published payout
  reports and trade-body statements quickly — that is genuinely the boring half of my seven hours and
  it collapses to well under an hour. Phases 2–9 are judgment and cheap on paper.
- **The residual that does not collapse:** because no rate can carry territory/period/statement as
  structured data, I re-verify every qualifier by hand on every figure I keep, and I do the
  anonymised-statement corpus myself regardless. That is the expensive, unautomatable, and
  correction-critical part.

**~4h 15m saved · 7h → ~2h 45m · confidence: low-medium.**

Confidence is low-medium on purpose: `accepted-gaps.md` records that the app cannot run research at
all, so this is an estimate of what the *methodic* would save if executed as written, not a product
measurement.

**It does not clear my 60-minute bar**, and the reason it does not is F-03 — the qualifier work is
exactly the residual. Fix the fact schema and this drops under my bar in one edit. That is the
highest-leverage thing on this page for me personally.

---

## 9. Findings summary

| id | Title | Target | Sev | Verdict |
|---|---|---|---|---|
| G-L1S-MI-01 | `mechanisms[].chain` steps are untyped prose with no fact binding and no per-step parameter | notebook-schema | major | confirmed |
| G-L1S-MI-02 | The BUT/THEREFORE law has no vocabulary for a transfer, and deletes the flow steps — already silently violated in the reference run | knowledge, research-prompt | major | confirmed |
| G-L1S-MI-03 | `facts[]` has no territory, no reporting-period distinct from `as_of`, and no source class | notebook-schema, research-prompt | major | confirmed |
| G-L1S-MI-04 | `confidence` collapses correctness and reader-checkability; primary-but-uncitable evidence has no honest label | notebook-schema | major | confirmed |
| G-L1S-MI-05 | No `party`/`level` on a fact, and one singular "The number" column — figures at different levels of a flow become neighbours | dimensions, notebook-schema | major | confirmed |
| G-L1S-MI-06 | `steel_man` is a single object; a counter-case with two independent holders cannot be structured | notebook-schema | major | confirmed |
| G-L1S-MI-07 | No engine is catalogued for a flow shape; F Anchor Ladder is the match and is fenced to short form, contradicting `ENGINES.md:4-6` | engines | minor | confirmed |
| G-L1S-MI-08 | `currency` advice ("ratios over levels") manufactures the unqualified rate in a policed-numbers domain | research-prompt, notebook-schema | major | confirmed |
| G-L1S-MI-09 | `unhinged` = motive claims, with no naming rule for a party to a private contract and no exposure field anywhere in the schema | conclusions, notebook-schema | major | uncertain |

All nine carry `content` on `content_or_lens`. I want that noticed. I am the Creator with the most
obvious lens case in the room — a five-party flow, a domain-specific qualifier set, an exposure
profile nobody else has — and every single defect I found is repairable by a shared schema field, a
shared column, or a shared sentence in the craft doc. **The Bitcoin run needed most of them too and
did not notice.** If this run comes back mostly `lens`, somebody was told what to find.

---

## 10. Voice — Ruth

I have read a lot of documents that promised to explain my industry and this is a better one than
most, which is a lower bar than it sounds and I mean it as a genuine compliment.

Here is what I actually did with it. I sat down with my own statements — the ones from the eight
years, the ones I keep in a box because the numbers on them are the reason I stopped touring — and I
tried to put them into this thing. And the first real surprise was that the mechanism field held my
chain. I came in ready to write "five disconnected facts, flow unrepresented" and the artifact said
otherwise: seven links across three parties in the reference run. So no. It holds. Say that first.

Then I got to step two of my own euro and the whole thing quietly fell over, not with an error but
with a shrug. The platform takes its share. That is not a *therefore* and it is not a *but*. It is
just what happens, the way a deduction on a payslip is just what happens, and the rule I was handed
says that if the honest word is "and then" I should find a missing link or drop the step. There is no
missing link. A subtraction has no drama in it. The drama is that it *keeps happening*, five times,
to a number that started as eleven euros and reaches me as nothing because I owe an advance from
2016. So the rule tells me to delete the two parties whose shares are the reason I made the video.

And then I went and checked the flagship run and found two bare "AND"s sitting inside its own
mechanism chains, under a quality bar that says the count must be zero. Nobody caught it. I do not
think anyone was being careless. I think the moment a chain describes money *moving* rather than
causing, the vocabulary runs out and the writer reaches for "and" and moves on. That is not my topic
being difficult. That is a law that was derived from arguments being applied to ledgers.

The part I liked least is smaller and meaner. There is advice in here to write the ratio instead of
the number so the script lasts longer. Sensible everywhere else. In my field it produces
"about a third of a cent a stream", floating free of a territory and a year, and that sentence is the
single most corrected sentence in my beat — platforms correct it, labels correct it, and both of them
are sometimes right. The methodic will generate my own pet peeve as a *shelf-life optimisation* and
tell me it did me a favour. Durable and unanchored is not an asset. It is a correction with a longer
fuse.

And I cannot label my best evidence. I have fourteen real statements from real people who sent them
to me because they trusted that I would not put their name next to their income. Every number on them
is true and none of them is checkable by you. High confidence launders it into looking like a filing.
Low confidence demotes it and then politely asks me to go find a second source — which means going
back to a musician and asking her to be identifiable so my notebook can pass a rule. I will not do
that, and I do not think the rule knows it is asking.

What is genuinely good, and I do not want it buried under the complaining: the counter-case is not
optional here. It has a column, a mandatory phase, a hard requirement and a warning that skipping it
produces a polemic. The framing I hate most in my own field — the label as thief — is the framing
this document structurally refuses to let you write, and it refuses on the first pass, before you
have talked yourself into anything. Somebody thought about that properly. My complaint is only that
the box it gives me fits one steel-man and I have two, and the interesting bit is which one survives.

I have been told for eight years that the number is the story. It was never the number. It was the
five places the number stops on the way down, and this thing can carry all five as a sentence and
none of them as a fact. Give me a field on a chain step and give me a territory on a rate and I will
run my whole beat through it. Until then it saves me four hours and hands me back a notebook I have
to audit line by line before it goes anywhere near my name — which is most of a good tool, and not
yet one I would trust with a number this policed.
