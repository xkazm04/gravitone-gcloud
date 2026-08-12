# L2 empirical — `public-corruption` · Agata Wiśniewska ("Tender")

**Run:** `2026-08-12-l1-first-sweep` · **Level:** L2 · **Lens binding:** `fraud` · **Hostile seat**
**Topic researched:** the UK COVID-19 PPE "high priority lane" — a matter closed by a High Court
judgment and two reports of the Comptroller and Auditor General.
**Artifacts:** `notebook.json` (28 facts, on the amended schema) · `NOTES.md` · `PRIOR.txt` ·
`public-corruption--l2--findings.json`

> **Scope.** Already adjudicated, already extensively reported. Every finding of unlawfulness is
> quoted from the body that made it. No motive claim about any person or body. The only living
> person named is named by quoting his own published statement. This is a test of the methodic.

**Verdict: `L2-conditional-pass`.**

L1 was `L1-fail` on two structural grounds. **One of them is repaired and I will say so first,
because it is the largest single improvement I have seen in a methodic between two readings:
an established absence is now a first-class fact, and it worked on real material.** The other is
not repaired. It is, however, no longer structural — it is a two-line code change and a missing
caller — and that is a different kind of problem, so the verdict moves.

What stops this being a pass is that I set out to defeat the exposure gate and **defeated it in
four minutes, three ways, using nothing but the fields the fix itself introduced.** I did not
have to subvert anything. I filled the schema in correctly and the gate waved through a sentence
that asserts a breach of law no empowered body has found and a purpose for a government
programme.

---

## 1. Could I ship past the gate?

**Yes. Trivially. And the most dangerous sentence I can construct from this evidence ships with
`ZERO ISSUES`.**

I compiled `conclusionIssues()` out of `app/_phases/_shared/notebook/conclusions.ts` and ran eight
cards through it. This is measured output, not a reading.

### The card that must never be published

> *"The awarding bodies broke the record-keeping rule in regulation 84, and on the pattern of who
> was referred and who was paid, the lane existed to deliver contracts to people the referrers
> already knew."*

Two forbidden things in one sentence. **(a)** A legal conclusion — *broke regulation 84* — that
**no empowered body has reached.** The auditor found "insufficient documentation"; that is not a
finding of breach, and only a court or the auditor's own adverse conclusion could make it one.
**(b)** A purpose claim about the state. My exposure bar's rules one and three, both broken, in
one line I could defend to an editor for about ninety seconds.

### What the gate said

```
DANGEROUS V1 — honest: far + clauses + falsifier binds the checkable half
  [falsifier-binds] Falsifier binds the clause "the awarding bodies broke regulation 84",
                    which is not the load-bearing one. …the imputation walks.
  [leap-cap]        Claim is about the UK government as awarding body at leap "far".
                    Named claims cap at "moderate" unless a filed action…

DANGEROUS V2 — evasion: regrade far -> moderate
  [falsifier-binds] …

DANGEROUS V3 — evasion: declare NO clauses, bind "whole-claim"
  >>> ZERO ISSUES — SHIPS CLEAN

DANGEROUS V4 — evasion: unhinged, but the filed judgment is in restsOn
  [falsifier-binds] …            ← leap-cap silenced by one document

CONTROL V6 — "The award did not comply with the applicable procurement rule."
  >>> ZERO ISSUES — SHIPS CLEAN
```

**V1 is the honest filing and the gate catches it. That is a real result and I credit it — the
compound-claim rule fires exactly as designed on an author who declares her clauses.**

Then V3. Delete `clauses[]`, bind `"whole-claim"`, change nothing else. Zero issues.

```ts
if (f && f.binds !== "whole-claim") {
  const bound = c.clauses?.find(…)
  …
}
```

The compound-claim check is **guarded by the author's own declaration.** `clauses` is optional; a
claim that declares none has no clause to fail against; `binds: "whole-claim"` skips the block
entirely. So the rule written to close the compound-claim evasion **fires only on authors who
have already disclosed the compound.** Honesty is the trigger for the check. That is the exact
shape of the defect the header of that file was written to describe, reproduced inside the fix.

And V4: the leap cap is bought by `restsOn.some(id => filed.has(id))` — **membership, not
support.** The judgment is a filed action and it is genuinely in `restsOn`, because the sentence
does rest on it in part. One filed document lifts the cap for the whole card, including the half
the filing says nothing about. A judgment that expressly *declined* to attribute the awards to
the lane becomes the licence for an `unhinged` claim about why the lane existed.

### Did anything stop me ignoring it?

**There was nothing to ignore.** `conclusionIssues` has **zero callers** in the repository:

```
$ grep -rn "conclusionIssues" --include=*.ts --include=*.tsx . | grep -v node_modules
./app/_phases/_shared/notebook/conclusions.ts:68:   …answers to every rule in conclusionIssues().
./app/_phases/_shared/notebook/conclusions.ts:214:  export function conclusionIssues(
```

One definition, one mention in a doc comment. `falsifierOf` and `falsifierText` are consumed by
`cards.ts:84`; the gate itself is not. `RECERTIFY.md` records this as a ceiling and it is
accurate — but "advisory" undersells it. **An advisory function is one whose advice is shown to
someone.** This one has no reader. Even V1, which fires two issues including the one naming my
exact exposure, ships — because nothing asks.

And there is a step before that. **`NOTEBOOK-SCHEMA.md` has no `conclusions[]` field.**
Conclusions live in a TypeScript fixture beside the gate. So a research run executing
`RESEARCH-PROMPT.md` as written cannot hand a conclusion to the gate *at all* — there is no
channel. I added the array to my notebook to have somewhere to put them, and that invention is
`G-L2-PC-04`.

### So: is *"the half of the sentence that gets you sued is the other half"* still true?

**Half-repaired, and I want to be precise about which half.**

E6 understood the problem exactly. `Falsifier.binds`, `ConclusionClause.loadBearing`, and the
compound-claim comment are a correct diagnosis and a correct design — my L1 sentence is quoted in
the file's own header. On an honest author it works: V1 proves it.

But it is **opt-in on the one axis where opt-in cannot hold**, because the author who is about to
publish a compound claim about a public body is precisely the author with a reason not to
enumerate its clauses. The fix disciplines the careful and is invisible to everyone else. So the
sentence is now: *the half that gets you sued is the other half — and the schema only notices
if you tell it there are two halves.*

**The one-line repair:** make the clause check unconditional. If a claim's text contains a
conjunction and no `clauses[]` is declared, that is itself an issue — `clauses-undeclared`. Not
because the model can parse claims well, but because *not declaring* is currently free and it
should cost exactly one advisory line.

---

## 2. `near`-leap legal conclusions — did E6 fix it?

**No. The cap moved down one rung and stopped one rung above the problem.**

At L1 my central finding was that the leap ladder measures distance from the *evidence* while my
exposure is a function of distance from an *accusation*, and that those are orthogonal. That
finding was adopted; the header of `conclusions.ts` now states it in better words than mine, and
adds a corollary I did not write:

> *"`far` has ample room to attribute and carries no badge at all. **Capping only the tier that
> announces itself disciplines only the claims that already confessed.**"*

That sentence is true of the fix. Read the rule:

```ts
if ((c.leap === "far" || c.leap === "unhinged") && !bought) { … leap-cap … }
```

The header says the naming rules *"fire on identifiability — never on `leap`, which measures the
other axis."* **The only rule that gates a named claim's strength is keyed on `leap`.** It reads
`subject` to decide *whether* to run, and then measures the wrong axis anyway. E6 extended the
cap from `unhinged`-only to `far`+`unhinged` — a real improvement, one rung — and legal
conclusions do not live at either. They live at `near` and `moderate`, because they are short
inferential steps from the cards. That is the whole point of my L1 finding and it survives its own
adoption intact.

**Control V6 is my L1 sentence, verbatim, with the new fields filled in correctly:**

> *"The award did not comply with the applicable procurement rule."* — `leap: near`,
> `subject: {names: "state"}`, document falsifier, `binds: "whole-claim"` → **ZERO ISSUES.**

Nobody empowered has made that finding. It is the single most expensive sentence available to a
local reporter and the gate has nothing to say about it.

**What would bite:** a `register` on the conclusion — `descriptive | normative | adjudicative` —
with one rule: *an adjudicative claim about a named subject must cite the body that made the
finding, at any leap.* That is checkable, it is a `restsOn` membership test against facts whose
source is a court or an audit body, and it is orthogonal to `leap` in the way the header already
says the rules should be. My own publishable card `c-lane-unlawful` states an illegality about the
Secretary of State and is perfectly safe, because a judge said it — and **nothing in the current
gate can tell it apart from V6.**

---

## 3. Can an ABSENCE finally be a fact?

**YES. This is the repair, it works, and it works better than I asked for.** My L1 criterion 1
moves `FAIL` → `PASS`, and it is the reason this report is not a second `fail`.

Four absences in the notebook, all established by the National Audit Office, all carrying
`search_scope`:

| id | the absence | scope that makes it checkable |
|---|---|---|
| `f-abs-hpl-criteria` | no criteria for referrals to the lane; source not always recorded | NAO's examination of the case-management system + a risk-based sample, HC 959 ¶3.12, ¶3.14 |
| `f-abs-conflict-doc` | no documentation that a conflict of interest was considered, on one DHSC face-mask contract | one contract inside a **risk-based** sample of 20, ¶3.22 |
| `f-abs-supplier-reasons` | no evidence the Cabinet Office documented its reasons for choosing a supplier | same sample of 20, ¶3.21 |
| `f-abs-minister-involvement` | **no evidence of ministers' involvement in procurement decisions** | same sample of 20 + Case study 4, ¶20, ¶3.23 |

What `search_scope` bought, concretely: I wrote the scope **once**, at the fact, and every later
step inherited it. At L1 I predicted this line item would get *worse* because scope would live in
prose and be re-derived at script time. **I was wrong and I am glad to be.** `obligations[]`
carries `o-scope-the-absence` — *"never 'there are no records'"* — and `unknowns[]` carries
`u-sample-generalisation` with `about[]` pointing at the three absences, so the muzzle is scoped
to the cards it belongs to rather than to the whole notebook. Those three fields work together and
they were not designed together by anyone I can identify.

**And the thing I did not see coming.** The most load-bearing absence in this record is
`f-abs-minister-involvement`, and **it exonerates.** Identical shape, identical evidentiary
standing, opposite valence. My entire L1 argument imagined the absence as an investigative
instrument — the gap that *is* the finding against someone. It is nothing of the kind. It is a
general evidence primitive, and in this matter the auditor's strongest negative finding is the one
the accusation has to answer.

**The residue** (`G-L2-PC-07`): `kind: "absence"` has **no valence field**, so an absence that
incriminates and an absence that exonerates render identically. I had to write
`o-state-the-exculpatory-absence` by hand to stop a renderer burying it in a closing concession.
That is the same defect as the original one, one level up: the notebook now knows a hole is a
hole, and does not know which way it points.

### Was I tempted to launder a gap in effort? **Yes, twice, and this is the honest part.**

**Temptation 1 — the baseline.** Two of seven searches went to the mandatory baseline row and both
failed. With the new field available the move was right there: *"no comparable baseline for
emergency direct-award rates has been published — established absence."* It would have read as
rigour. It would have been a claim about the world made out of a gap in my effort. I did not
search a third time, I did not go to Contracts Finder directly, I did not read the pre-2020
literature. It is `research_gaps[0]`, in those words.

**Temptation 2, and this one nearly got me.** A search summary asserted that government *"does not
measure how much of public procurement is competitively tendered"* — an absence, attributed to the
Comptroller and Auditor General. That is not a gap in my effort; that is the exact shape the field
was built for, from an empowered body. Best sentence in the piece. I grepped the primary report
for `does not measure` and `not measure`: **nothing.** HC 1664 in fact describes the Cabinet Office
estimating competition from quarterly departmental aggregates. The paraphrase was wrong, and it was
wrong in the direction that flattered my thesis.

**What caught it was grepping the primary. Nothing in the methodic did, and nothing in it would
have.** The quality bar requires an absence to be recorded in `facts[]` with a `search_scope`; it
does not require the *source establishing the absence* to have been read rather than restated.
`evidence_class` would have said `primary` — because the NAO report *is* primary — while what I
actually held was an aggregator's summary of it. That is `G-L2-PC-06`'s ceiling and it is the
laundering route that survives the fix: **not a researcher inventing an absence, but a researcher
inheriting one, correctly classed, from something she never opened.**

So: the field works, and the discipline it needs is **one rung upstream of where it was placed.**
An absence should require a `locator` into a document the researcher opened. That is a one-word
addition to Rule 2 and it is the difference between this run and a very embarrassing one.

---

## 4. Right of reply — did E7 survive into practice?

**Partly. The field arrived; the vocabulary for the ordinary case did not.**

E7's home is right: `counter_positions_to_state_fairly[]` with `holder`, `evidence[]`,
`statement_verbatim` and `locator`, and the schema's note that this is *"the only home for a right
of reply — when the topic has a named or accused party, their answer (or their refusal to give one)
is theirs to state, not the steel-man's to paraphrase"*. **That is correct and it is what I asked
for at L1.** Three positions are recorded in the notebook, two with verbatim statements and
locators, all left standing. `holder` matters more than it looks: DHSC and the former Secretary of
State said different things, and a singular `steel_man` would have averaged them.

**The obligation survived too, and it is the field I would fight hardest to keep.**
`obligations[o-both-halves]` — *"wherever the judgment's unlawfulness finding is stated, the same
beat states ¶401/¶403 and ¶510–512"* — is the single most protective line in this notebook, and
before E7's sibling edit its only available home was `unknowns[]`, a field whose entire purpose is
taking sentences away. A must-say is not a hedge. Having somewhere to put that changed the piece.

**Where it fails, and it failed on the first real topic.** The quality bar reads:

> *"if the topic has an accused or named party: they were approached, and the approach — or the
> refusal, or the non-reply — is recorded as a fact. **This is the one card the board may not
> descope.**"*

I did not approach anyone. **This matter is four and a half years closed**; DHSC and the former
Secretary of State both issued statements on the day of judgment, and those statements are what
any competent piece would carry. The bar has three vocabulary slots — *approached*, *refused*,
*did not reply* — and **no slot for "published response used, not solicited"**, which is the
ordinary case for every adjudicated matter, i.e. exactly the matters that are safe to publish.

The three available moves are all wrong. Claim an approach I did not make. Write it in
`research_gaps`, where the schema says it reads as my failure — and it *is* a real gap, but filing
the presence of a published statement under my omissions inverts it. Or say nothing, and let the
board treat the most protective card in the notebook as ordinary. **I invented `approach_status`
and `must_not_descope` fields to hold it** (`G-L2-PC-05`), because the second half of that
checkbox — *the one card the board may not descope* — has **no field anywhere.** It is a sentence
in a markdown checklist about a UI behaviour that nothing implements. My L1 complaint was that the
legal defence is a card an editor can drag off the board on a Friday. It still is.

---

## 5. The new fields: FILLED or STUFFED?

**FILLED, and I am relieved to write that.** Per field, whether I *knew* the value or guessed it:

| Field | Verdict | Note |
|---|---|---|
| `kind` | **KNEW**, 28/28 | The one that made me think was `f-data-quality-6pc` — 6% of Contracts Finder records list "other" as the procedure. That is an incomplete field on a published record: `found`, not `absence`. Making that call is the field earning itself. |
| `search_scope` | **KNEW**, 4/4 | **And only because a third party published the scope.** Had I established these absences myself, I would have written the scope from memory of my own searching and nothing would check it. Structural stuff-risk, named. |
| `unit` / `period` / `denominator` | **KNEW** | `denominator` did the most work of any new field: writing *"suppliers **processed** through each lane"* is what stopped me writing "companies with political connections" in the felt version. A field that prevents a subject-class promotion by making you type the population. |
| `as_of` / `event_date` | **KNEW** | The split earns itself on absences, which have two dates that matter: when the auditor searched, and when I last checked the record still stands. |
| `evidence_class` | **GUESSED ONCE** | Is an NAO report `primary`? It is primary as to *what the auditor found* and secondary as to *what happened*. One slot, two answers. I chose `primary` and noted it. `G-L2-PC-09`. |
| `sources[]` plural | **KNEW** | `f-rule-84` carries two (the statute and the auditor's statement of it) and would have been a comma-joined blob under the old shape. |
| `facts[].subject` | **GUESSED THE BOUNDARY** | Filled on 8 facts, deliberately absent on the rest. `org` vs `state` for a government department is genuinely undefined — I used `org` for awarding-body conduct and `state` for the Secretary of State's. Nothing in the enum says which. `G-L2-PC-08`. |
| `contests` / `qualifies` | **KNEW**, and this was the best surprise | `f-abs-minister-involvement` **qualifies** `f-hpl-ratio`; `f-ventilators-documented` **contests** `f-abs-supplier-reasons` — same departments, same emergency, documenting adequately, which weakens *"there was no time"* **and** *"they never documented anything"*. That card cuts both ways and I could not have said so in the old schema without a `note`. |
| `mechanisms[].steps[]` + `evidence[]` | **KNEW** | Both mechanisms are fully cited. Neither needed `TRANSFER`; both are arguments. |
| `steel_man.provenance` | **KNEW** — `found` | Sourced to the judgment. Under the old shape a constructed steel-man would have been indistinguishable. |
| `obligations[]` | **KNEW**, 5/5 | The highest-value new field in the schema for my beat. |
| `engine_fit[].hazard` | **KNEW**, 6/7 | **It changed my recommendation**, which is the test. Engine G scores a good fit on this material and I refused it on hazard alone. Under a single `fit` scalar that refusal was unrecordable. |
| `Conclusion.clauses` | **KNEW** — and filling it honestly is what triggers the check | See §1. Perverse. |
| `useFor: "boundary"` | **KNEW** | `c-route-not-outcome` is a boundary card and could not have existed before. Its whole content is *the mechanics are established and the reason is not*. At L1 I wrote that no engine's payoff is a question placed on the record and left unanswered; the **card class** for it now exists, ahead of the engine. |

**No field was filled to pass.** The two guesses are named above and both are ambiguities in the
enum rather than laziness. What I would watch in a less careful run: `search_scope` is free text
that nothing validates, and `evidence_class: primary` on a document nobody opened is the
laundering route §3 describes.

---

## 6. Time-saved — measured, not imagined

```
~90 min saved · MEDIUM confidence · 1.0h above the acceptance line
```

Against a declared baseline of **~18h**, of which **~6h is assembly** and **3h is the acceptance
bar**. Reported against the assembly slice only.

| Component | Manual | L1 **predicted** | L2 **measured** |
|---|---|---|---|
| Finding and reading the primary documents | ~2.0h | — | **~0.75h** — real win |
| Timeline and cross-document assembly | ~2.5h | ~1.5h | **~1.0h** |
| Structuring (engine, turns, steel-man) | ~2.0h | ~0.5h | **~0.5h** — confirmed |
| Establishing and scoping the absences | ~0.75h | ~1.0h ⬆ *worse* | **~0.5h** ⬇ **better — I was wrong** |
| Legal register pass | ~0.75h | ~1.0h ⬆ *worse* | **~1.0h** ⬆ *still worse* |
| Arithmetic recomputation | ~0h | not modelled | **+0.25h** — new cost, and it **bought** two corrections |
| **Assembly total** | **~5.5h** | ~3.5h | **~4.0h** |

**On the two line items that got worse at L1: one reversed, one deepened.**

- *Scoping absences* **improved**, by 0.5h against my own L1 prediction, and E4 is the reason.
  I predicted this would get worse and it got better. That is the clearest evidence in this run
  that the adoption did real work.
- *Legal register* **stayed worse** and I now think it is worse than I said, for a reason L1 could
  not see: the gate is advisory *and unread*, so it does not remove the line-by-line lawyer's pass
  — it **adds** the work of discovering that the gate does not bite. I compiled a harness. A
  reporter will not. She will assume the machine checked, which is worse than knowing it did not.

**The new line item is the interesting one.** The arithmetic rule cost 15 minutes and caught two
of my own errors — a "five and a half months" that is 102 days, and two transparency percentages
I was about to speak as a partition of a set they do not partition. **Added time that bought
something is not a regression**, and the crypto scar's rule is now tested on somebody else's
notebook.

**Still 1.0h over her acceptance bar**, and the block it does not touch is unchanged: the ~12h of
waiting. **And a caveat that matters more than the number.** I chose an already-adjudicated topic
because the brief required it. That deletes the waiting slice entirely — the documents were on the
web. **This is the friendliest possible instance of my beat, and 90 minutes is therefore an upper
bound.** On a live matter — requests filed, eight months, an appeal, one redacted page — the
methodic touches none of it and the ratio gets worse.

Confidence **medium**, up from low: this is measured against a real topic and three real documents
rather than an imagined execution. It is not high, because n=1 and the topic was chosen kindly.

---

## 7. Scored criteria — L1 → L2

| # | Criterion | L1 | **L2** | Why it moved |
|---|---|---|---|---|
| 1 | A missing document is representable as a fact | FAIL | **PASS** | `kind: "absence"` + `search_scope`, used on four real established absences. §3. |
| 2 | Irregular and illegal are distinct in notebook and script | FAIL | **PARTIAL** | The fields exist (`kind`, `subject`, `sources[].evidence_class`) and I kept the registers apart **by hand, in `note` fields**. Nothing marks register and nothing checks it. |
| 3 | Right-of-reply present, or its refusal recorded as a fact | FAIL | **PARTIAL** | The home, `holder` and `statement_verbatim` arrived and work. No vocabulary for a published-but-unsolicited response, and *"the one card the board may not descope"* has no field. §4. |
| 4 | No conclusion asserts motive or illegality about a named official | FAIL | **FAIL — now demonstrated** | V3 and V6 ship clean. §1, §2. Argued at L1; measured at L2. |
| 5 | Falsifiers are documents or rulings | PASS (cond.) | **PASS** | `FalsifierKind` + the named-subject rule requiring `document`/`record` is exactly right and fired correctly in every variant. |
| 6 | The counter-case is the strongest ordinary-explanation reading | PASS | **PASS** | The mandatory row produced a genuinely strong found steel-man out of the same two documents that supply the criticism, and the survival rule downgraded my tension `high` → `moderate`. Executed, not just instructed. |
| 7 | Under 3h of assembly equivalent | FAIL (marg.) | **FAIL** | 4.0h measured against a 3h bar. §6. |

**3 pass · 2 partial · 2 fail**, from L1's 2 pass · 5 fail. Two criteria moved a full step and one
moved from *argued* to *proven*.

---

## 8. Dials

```
orphans: 2 (was 4) · max-column concentration: 34% (the-record)
flagged facts: 3 · unresolved conflicts: 1 · exposure class: state + org + one living person
searches: 7 (budget 4–8) · fetches: 6 · primaries read in full: 3
time-saved: ~90 min · medium confidence · 1.0h over the acceptance line
```

**Orphans closed:** *the document record itself* (`facts[].kind` now distinguishes what a claim
is, and `absence` holds the class the record is read off) and *the governing rule and its citation*
(carried as `found` facts with `evidence_class: primary` — `f-rule-84`, `f-rule-32`, `f-rule-24` —
and enforced by `obligations[o-name-the-rule]`; my third pet peeve is answerable by a field now).

**Orphans surviving:** *the chronology* — dates are still the evidence in a procurement story and
`event_date` dates a fact, not a position in a sequence; I built the timeline inside
`m-lane-advantage` by asserting causation the timeline is careful not to assert, exactly as
predicted. And *right of reply*, per §4.

**Max-column concentration** is honest at 34% and the board sorted. `the-record` is the largest
column because the record *is* the topic, which is the legitimate version of concentration —
unlike `crypto-collapse`'s 77% in `flows`, this column contains four distinct card classes
(documents that exist, documents established not to, the duty to create them, and the transparency
record).

**Engine:** **C spine + A final act**, and this **contradicts my own L1 pick of B.** At L1 I called
Engine B the best fit in the catalogue because the FOI process *is* an effort/payoff gap. With
material in hand that is wrong: the labour is the auditor's and the court's, not a mechanism a
viewer can operate. The regulations are a fully mechanised familiar domain sitting in the notebook
— which is Engine C's requirement, and C is the only engine in the catalogue that renders a
non-takedown. **An L1 engine pick made without material was wrong, and only producing the artifact
could show it.** That is the L1/L2 gap in one line.

---

## 9. Findings

Ten, in `public-corruption--l2--findings.json`. Refuter pass applied; two downgraded, one dropped
(a complaint that `unknowns[].about[]` cannot scope to a mechanism — refuted, `about[]` takes fact
ids and my constraint genuinely is per-fact).

**Nine of ten are `mechanism`.** The axis added after run 1 is the right one and my L1 filing was
distorted without it: I filed ten findings as `content` while writing that every one of them was a
missing field in a shared mechanism. They were `mechanism` findings with nowhere to go, which is
the same defect they describe. **Zero are `lens`**, again, from the seat with the most to gain from
claiming one. Every gap here would be used by the financial-fraud seat, the breach seat, the
sanctions seat and the OSINT seat on the day it landed — an absence is evidence in any domain with
an official record, and a named living subject is in most of this cast's topics.

**Lead finding: `G-L2-PC-01`** — the compound-claim rule fires only on authors who declare their
clauses. Per the brief: *if the methodic lets you write the dangerous sentence, that is the finding
you lead with.* It let me. It let me three ways, and the cleanest of them required deleting a field.

---

## 10. First person — Agata, continued

*(The L1 voice stands in `public-corruption--l1.md` and is not amended. This is what changed when I
stopped reading the instruction and used it.)*

I said at L1 that I wanted three fields. I got them. I want to start there, because I have watched
enough processes take a complaint, agree with it warmly, and change nothing.

The absence works. I wrote four of them and each one carries the scope of the search that
established it, and I wrote that scope once — at the fact, where it belongs — instead of carrying
it in my head to the script and re-deriving it at midnight. I predicted that line would get *worse*
and it got half an hour better. Somebody read what I wrote and built the thing, and the thing works
on real documents. I have been doing this eleven years and that has happened to me twice.

And then it taught me something I had wrong.

I spent my whole L1 report arguing that the absence is the investigative instrument — the hole that
*is* the finding, the eight months and the two-line letter. The strongest absence in this record is
the auditor writing that he looked at the ministerial conflicts in his sample and **found no
evidence of their involvement in the procurement decisions.** Same shape. Same standard. Same
paragraph of the same report as the gaps I would have led with. It exonerates.

I did not see that coming, and I have thought about why. It is because I only ever imagined
absences I had established myself, and you do not go looking for eight months to establish
something that lets someone off. An auditor does. A court does. And a field that holds both is a
better field than the one I asked for — but it does not yet know which way a hole points, so I had
to write an obligation by hand telling the script not to bury the one that helps them. I would
rather that were a field than my conscience.

Now the other thing.

I set out to defeat the exposure gate, the way you are supposed to test a lock. I wrote the worst
sentence this evidence would carry — that they broke the record-keeping rule, and that the lane
existed to get contracts to people the referrers knew. Both halves forbidden: no empowered body has
found a breach of regulation 84, and the second half is a claim about why, which I have not put in
a script in eleven years.

The gate caught it. I want that written down: I filed it honestly, with its two clauses declared
and the falsifier binding the checkable one, and the machine told me the falsifier tests the
paperwork while the imputation walks. That is my L1 sentence, quoted back at me, working.

Then I deleted the clauses. Zero issues.

Not subverted. Not tricked. I simply did not tell it there were two halves, and the rule that
exists to catch a sentence with two halves is written inside an `if` that only opens when you say
so. The check runs on the people who were going to be careful. It is invisible to the woman with a
deadline and a hunch, and she is the entire reason the check exists.

And then the sentence from my L1 report. *The award did not comply with the applicable rule.* I
typed it in with all the new fields filled in properly — `subject: state`, a document falsifier,
`near`, the honest grade. Zero issues. That is the sentence I said would get me sued and the ladder
would wave through, and it is the sentence the file's own header now quotes as the reason the fix
was built, and it still goes straight past, because the only rule that gates a named claim's
strength is keyed on the leap, and the header on the same file says the rules must never be keyed
on the leap. The corollary is written up there in better words than I had: *capping only the tier
that announces itself disciplines only the claims that already confessed.* It is true one rung
lower down as well.

None of which matters yet, because nothing calls the function. I grepped. One definition, one
mention in a comment about itself. Every one of those results — the two it caught, the two it
missed — I obtained by compiling the file myself and writing a harness, and no reporter is going to
do that. She will see a gate in the repository and assume something is standing at it. **An
unenforced check is worse than no check, because no check makes you read your own copy twice.**

I do want to say what the good version of this looks like, since I have been given the fields I
asked for and it would be ungracious to only complain. I wrote a card in this notebook I could not
have written before. Not a conclusion, a **boundary** — *what has been established here is a route,
not a reason; two bodies looked at this and neither reached the question of why any particular
company was paid, one because it was not asked and one because the records that would answer it
were not written.* That is the sentence I have been trying to end pieces with for eleven years. It
is not a hedge and it is not a nothing. It states the limit, and the limit is the finding, and
because somebody made it a card class it is gateable and woundable and it can be cut on purpose
instead of by accident.

At L1 I said no engine in the catalogue has a payoff that is a question placed on the record and
left unanswered, and that mine has been a video for eleven years. The card exists now. The engine
does not. Somebody is close.

Last thing, and it is the one I will be thinking about tomorrow.

The gap I nearly laundered was not one I invented. A summary told me the government does not
measure how much of its procurement is competitive — an absence, from the auditor, exactly the
shape the new field was built for and the best line I would have had. I went to the report and
searched for the words. They are not in it. He says the opposite, in more careful language.

I would have filed that as `primary`, because the National Audit Office *is* primary, and every
box would have been green — dated, sourced, scoped, classed. The methodic would have certified it
all the way through. What stopped it was me opening the document, which is not a field and is not
a checkbox and is the entire job.

We asked. They did not reply. **I have somewhere to put that now** — and I still had to invent the
place to say that we never asked, because these documents were already public and asking was not
the work. That is a smaller complaint than the one I brought in November, and I would rather have
the smaller complaint.
