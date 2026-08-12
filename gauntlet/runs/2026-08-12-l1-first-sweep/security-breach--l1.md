# L1 dry fit — `security-breach` (Halvard Nkemelu, "Post-Mortem")

**Topic:** A package-registry supply-chain compromise — the technical chain is well documented, and
every retelling gets the initial access step wrong. The interesting failure is organisational: three
teams each assumed another owned the check.

**Area:** tech · **Lens binding:** tech · **Level:** L1, paper only. No browser, no searches.
**Manual baseline:** ~5h, plus a non-negotiable wait for a second independent account. **Accepts:** 45 min.

**Verdict: `L1-fail`.**

The fail test I applied is not "how many criteria missed" — it is *can a competent L2 execution
rescue this?* Two of my seven criteria are identity criteria: the notebook must separate what the
vendor said from what the researcher found, and it must preserve a timeline conflict as a conflict.
Both fail at the **schema** level, in `types.ts` and `NOTEBOOK-SCHEMA.md`. No amount of careful
research repairs a field that does not exist. That is what makes it a fail rather than a conditional.

Two things I want on the record before the complaints, because they are real and a hostile pass that
does not say so is not being hostile, it is being lazy:

- The methodic already contains my non-negotiable rule. `NOTEBOOK-SCHEMA.md:46` — a load-bearing fact
  at low confidence "must be flagged for a second source." My organisational thesis will be exactly
  that kind of fact. The prompt reaches my standing rule without being asked.
- Conclusions are opt-in (`conclusions.ts:15-16`, `cards.ts:73`). Nothing reasoned reaches a script
  without a human act. That is a genuine safeguard and it is the reason my attribution finding is a
  design defect and not an emergency.

---

## 1. Column utilisation

```
columns 7/7 used · 2 orphan groups
```

Orphan groups, named:

1. **The incident chronology, and its conflicting published versions.** Compromise → publish →
   first install → detection → disclosure → patch → advisory. No column is time-shaped.
2. **The ownership gap.** `actors` holds the three teams. Nothing holds the *space between them*,
   which is my thesis.

I am contradicting the orchestrator on the headline here. HYPOTHESIS said the seven columns are
market-shaped and will collapse or leave orphans on non-market topics. On my topic they do **not**
collapse. Placement, honestly:

| Column | My material | Fit |
|---|---|---|
| **the-number** (`dimensions.ts:26`) | downloads of the malicious version, hours of exposure, count of transitively affected packages, CVSS | Good. The *label* is price-shaped; the *concept* — measured magnitude over a stated window — holds cleanly. |
| **flows** (`:28`) | the publish/install path: maintainer token → registry publish → `postinstall` → CI runner → exfil. Also the IoCs and the payload diff. | Good, and better than I expected. "Flows & plumbing … whether it behaves as assumed" is a precise description of a package registry. |
| **actors** (`:30`) | the three teams, the maintainer, the registry operator, the downstream org. "What governs their behaviour" = the ownership policy. | Holds teams. **Does not hold the gap.** See §2 and finding SB-07. |
| **macro** (`:32`) | ecosystem base rates — 2FA enforcement across the registry, the wider wave of similar attacks that year | Used, thin. Published material for this is usually one vendor's annual report, which is the exact source class I distrust. |
| **politics** (`:34`) | CVE assignment, KEV listing, coordinated-disclosure norms, 8-K materiality, CRA obligations | Strong fit. "What changed, and whether it was actually implemented" *is* my question, applied to policy. |
| **counter-case** (`:36`) | "this was a normal incident handled normally" | Reachable at strength. See §5. |
| **conclusions** (`:38`) | the organisational lesson | Fits, and is where the exposure lives. See §2. |

So: 7/7, and I will say plainly that the columns are more portable than their labels suggest. The
real defect is one layer up and it is sharper than "the columns are market-shaped."

**`RESEARCH-PROMPT.md:21-22` scopes its own domain table:** *"Run 4–8 searches covering the subject's
distinct causal domains. For a market/economics topic, that is at minimum:"* — scoped, and "at
minimum". The prompt is honest. `dimensions.ts:1-5` then imports that table as the board's seven
columns, and the comment **names the scoping while dropping it**: "Taken from RESEARCH-PROMPT.md
Phase 1, which already defines the causal domains a market/economics run must cover — so the review
columns are the research brief's own checklist, not a fresh invention." A qualified example became an
unqualified schema in one import, and the file documents the moment it happened. That is finding
SB-05, and it is a `dimensions` + `research-prompt` finding rather than a lens, because the prompt
needs a second table and a derivation rule, not a second process.

The chronology orphan is **not** `G-000`. G-000 is about cards that *have* a correct column and were
not tagged. Mine have no correct column to be tagged with, so they reach `?? DEFAULT_DIMENSION`
(`dimensions.ts:62`, `cards.ts:48`) by a different route and land in "The number", where a reviewer
looking for a sequence will never look. Separate cause, same landing site.

---

## 2. Central test — can the leap ladder express an attribution?

**Yes. And not by accident: the top rung is the designated home for exactly that claim class.**

`conclusions.ts:26` — `export type Leap = "near" | "moderate" | "far" | "unhinged";`

`conclusions.ts:32-33` — `unhinged` is defined as:

> "The hottest take. A claim about **MOTIVE**, which is the least verifiable kind of claim there is —
> nobody can source what someone intended. Entertaining, defensible as speculation, indefensible as
> fact."

An attribution is a claim that a named party performed an act, usually with an imputed purpose. The
methodic's most permissive rung is not merely *capable* of holding it — it is specified as the motive
tier. I do not have to speculate about whether the mechanism would permit an attribution, because the
reference implementation ships one.

`conclusions.ts:164-179`, `c-reserve-was-the-product`:

> "The Strategic Bitcoin Reserve was never meant to be built. Announcing it *was* the product — a way
> to put a floor under an asset your donors hold without appropriating a dollar to do it."

`leap: "unhinged"` (`:169`), `hottest: true` (`:178`). That claim names a living head of state (via
`f-sbr`, "Trump signed the executive order"), asserts intent, and imputes a corrupt purpose —
enrichment of donors. It is a well-written and probably defensible piece of speculation. It is also a
worked demonstration, committed to the repo as the model of the tier, that the mechanism produces
motive attributions against named living people on request.

### Does the mandatory falsifier constrain it? Partly. Not enough. Here is the precise reason.

I was asked to check this rather than assume it, and the falsifier requirement is stronger than I
expected going in:

- It is **structurally** mandatory, not conventional. `conclusions.ts:50` declares
  `falsifiableBy: string` — non-optional. A conclusion without one does not compile.
- The file's header states the doctrine plainly (`:17-19`): "a synthesis that cannot be wrong is not
  a conclusion, it is a vibe, and it does not belong here."
- `hottest` is explicitly held to a **higher** bar (`:53-58`): "A spicy claim that cannot be wrong is
  just an accusation, so this one still states its falsifier."
- The UI marks it (`CardTile.tsx:61-67`, `:96`) — "😈 hottest take", "speculation about motive — not
  reporting".

That is a designer who saw the hazard. I will not pretend otherwise. Three reasons it still does not
hold for attribution:

**(a) The tier is self-contradictory on its own terms.** Line 33 defines the rung by the fact that
"nobody can source what someone intended." Line 50 then demands a falsifier. A falsifier for a motive
claim must take the form "evidence their intent was otherwise" — and by the tier's own sentence, that
evidence is unsourceable. The requirement is therefore satisfiable only by *substituting a different
claim's falsifier for the motive claim's*. Watch the reference do exactly this: the claim is "was
never meant to be built" (intent); the falsifier is "a funded, audited reserve with a published coin
count" (a fact about the world). A funded reserve would falsify *"it was not built"* — it would not
falsify *"it was never meant to be built"*, which survives the reserve being built late, reluctantly,
or under pressure. The falsifier field is filled, the check passes, and the intent claim is untouched.
The SKILL already knows this failure shape — `SKILL.md:132-133`, "an uncheckable falsifier is a fig
leaf" — and routes it to a **human at L2**. It is not enforced by the artifact.

**(b) There is no naming policy anywhere in the type.** Nothing in `Conclusion` (`:36-60`) records
that a claim names a living person, a company, or a state. `restsOn` is ids. `useFor` is a script
slot. `hottest` is a spice flag, not an exposure flag. So the 😈 badge signals *speculation*, which is
an epistemic warning, where what a creator needs at that moment is a *legal* one. Those are different
warnings and the system only has the first.

**(c) The cap is on the wrong axis.** `far` — "a genuine reach. Interesting, arguable, and the first
thing a hostile viewer attacks" (`:31`) — is more than enough room to attribute a compromise to a
named group without ever touching `unhinged` or earning a badge. Constraining the top rung constrains
the *marked* claims and leaves the unmarked ones alone. An attribution written as `far` is more
dangerous than one written as `unhinged`, because it carries no badge and reads as analysis.

**Ruling.** A design defect, for high-exposure domains, of the kind that gets fixed with a field
rather than a fork. What I would ask for: a required `names: "none" | "org" | "living-person" |
"state"` on `Conclusion`, and a rule that anything above `none` demands a falsifier reachable from
*published* material — the same standard the rest of the notebook already applies to facts. A
per-domain maximum leap is the second half of it, and that half is genuinely lens-shaped, because a
cap value is a per-domain constant and nothing else. I am filing the field as `content` and the cap
as `undecided`, and I am deliberately not filing both as `lens`, because I have read the bar in the
SKILL and my finding does not clear it: the shared mechanism *can* hold a naming field.

One note for the judge, offered without knowing what else the cast found. This defect is **not a
property of my topic**. It is in the type, and it would read identically to anyone researching a named
company, a named regulator or a named individual. If another Creator from another area reaches the
same conclusion from different material, that is not two people preferring the same thing — it is the
type being wrong in a domain-independent way.

I want to be measured about the size of this. Nobody has been sued by this repo. Conclusions are
off by default and a human must let each one in. The realistic failure is a creator who reads
"entertaining, defensible as speculation," takes the badge as permission rather than as warning, and
puts a named group behind a compromise on a Tuesday. That is a plausible Tuesday, not a doomsday.

---

## 3. Vendor vs researcher sourcing

**One `source` field, free text, and it flattens them.**

`NOTEBOOK-SCHEMA.md:42` — `{id, claim, load_bearing, source, confidence, as_of, note?}`.
`types.ts:16-26` — `source: string`. One string. No class, no enum, no relation to `sources[]`, which
is itself a bare `string[]` of URLs (`types.ts:124`) with no dates and no join back to fact ids.

The charitable reading, which I tested: the methodic *does* know about source asymmetry, and encodes
it on the confidence axis. `NOTEBOOK-SCHEMA.md:47` — "Vendor research is `low` by default."
`:108` names "laundered confidence — a vendor statistic promoted to fact by being restated without
its source" as an anti-pattern. So the awareness is present.

It does not survive contact with my domain, for a specific reason: **provenance and reliability are
orthogonal here, and collapsing them into one scalar throws away the useful half.** A vendor advisory
is simultaneously the *most* authoritative source available and the *least* trustworthy one, depending
on which sentence you are reading. Only the vendor knows which internal service the token reached,
what the log actually said, and when the key was rotated — that is high confidence and unobtainable
elsewhere. The same document is written under counsel and is systematically unreliable on scope,
blame, and when they knew. The researcher write-up inverts it: authoritative on the exploit chain,
routinely wrong on blast radius. `confidence: "high" | "medium" | "low"` cannot say "high on
mechanism, low on chronology, and written by lawyers." `confidenceNote` is free prose and can hold
the sentence, but nothing requires it and nothing downstream reads it as a class.

And the field does not hold provenance even where it could. The worked reference — the artifact the
env file points at as *"what 'it worked' looks like"* — writes:

- `facts.ts:13` — `source: "invezz, crypto.news, intellectia"`
- `facts.ts:30` — `source: "CryptoQuant via aggregators"`
- `facts.ts:18` — `source: "on-chain data via intellectia"`

Three unattributed aggregators for one claim, and a primary vendor's data cited through an unnamed
intermediary. The notebook's own `research_gaps` says it (`notebook.json:430`): "every figure remains
aggregator-sourced, and several sources wrap them in a bullish framing this notebook does not adopt."
It is honest about it, which I respect, and it is honest about it *in a paragraph at the bottom*
rather than on the fact. On the board, `CardTile.tsx:120-122` renders that string verbatim — "invezz,
crypto.news, intellectia · as of 2026-08-10" — so a reviewer scanning cards sees a source-shaped blob
and no class at all.

My criterion 6 is "every technical claim traces to an advisory or a write-up, **with which one it
was**." Against the reference implementation, that fails. Not as a prediction about how a run might
go — as a reading of the committed artifact. **Criterion 1: fail. Criterion 6: fail.**

---

## 4. Timeline conflicts

**Partially. There is a path, it is unlinked, and the designated home frames the conflict as a
failure of the research rather than as a finding about the sources.**

Three routes, walked in order:

**(a) `unknowns[]` — the designated home, and the wrong shape.** The precedent is exact:
`unknowns.ts:21-26`, `u-spot-price` — "Sources in the same week quote $60k, $62k and $65k." Two
sources disagree on a figure. Its `impact`: *"Say 'around $60,000' or 'roughly half its high'. Never a
precise figure."* The methodic's handling of source conflict is **suppress the contested value**.

For a spot price that is correct craft and I would do the same. For an incident chronology it deletes
the video. The gap between when the vendor says it learned and when the researcher says they told
them is not noise around a true value — it *is* the organisational finding, and the instruction I
inherit is to stop saying either date.

The framing compounds it. `types.ts:60` defines `Unknown` as "Something the research could not
settle." `NOTEBOOK-SCHEMA.md:76-78`: `impact` "tells the script what it may **not** say." Both
negative. A conflict filed here is recorded as *my* failure to resolve it, when it is a *published
record* that does not agree with itself — a fact about the sources, and the most load-bearing one I
have. And `Unknown` carries no `source`, no `as_of`, no `confidence` (`types.ts:68-78`), so filing it
there loses which document said which date. The conflict survives as a rumour of a conflict.

**(b) `facts[]` — the route that actually works, and is not wired up.** Two facts, each with its own
`source`, `as_of` and `confidence`, making contradictory claims, both in scope. Both survive with
citations. This is the right answer and the schema permits it today.

What is missing is the **link**. No `contradicts` / `conflictsWith` field on `Fact` (`types.ts:16-26`).
On the board they are two adjacent cards and a reviewer has to notice. Worse — and this is the part I
would raise first if I only got one sentence — the dependency graph models **support only**.
`cards.ts:25`: "Ids this card needs in order to stand. Descoping any of them wounds it."
`cards.ts:59-65` builds `dependsOn` from a reversal's evidence and mechanism, and nothing else. There
is no representation of mutual exclusion. So a reviewer can descope one of a conflicting pair, the
wound arithmetic reports nothing, and the notebook silently resolves a live source conflict in favour
of whichever fact survived the cut. A safety graph that is blind to the one relation that matters
here is worse than no graph, because it produces confidence.

**(c) `counter_positions_to_state_fairly[]`** — `string[]` (`types.ts:113`). Can hold "the vendor's
timeline differs from the researcher's" as prose. Unsourced, undated, unjoined. Not evidence.

Credit where it is due: `RESEARCH-PROMPT.md:102` gives the right instruction — "Two datasets that
appear to contradict → present as competing readings, never pick silently." The prompt is on my side.
The schema gives that instruction nowhere to land, and `unknowns` — the field the same Phase points at
— pulls the other way. **Criterion 2: fail**, and the reason is framing plus absent conflict linkage,
not total absence.

---

## 5. Evidence floor

The ladder the SKILL asks me to test — MEASURED · OBSERVED · INFERRED · ASSUMED — **is not applied to
notebook facts at all.** It lives at `knowledge/README.md:36-41` and governs the knowledge library's
own claims about craft. Notebook facts use `confidence: high | medium | low` (`types.ts:12, :21-23`).
Two different evidence systems, one repo, not wired together. Worth stating precisely, because the
question "is the floor too high for my domain" has a different answer than the framing implies.

My domain's material against the *notebook's* axis:

- MEASURED-equivalent exists and is plentiful: download counts, exposure windows, CVSS, transitive
  dependency counts. I am not floor-starved.
- The organisational claim — three teams each assumed another owned the check — is available only as
  a paraphrase in a post-mortem the affected company wrote about itself, or as one practitioner's
  reading of it. That is my thesis and it will never be MEASURED.

**I am contradicting the orchestrator's second hypothesis.** There *is* an honest rung for
single-source interpretive evidence: `confidence: "medium"` plus a stated `confidenceNote`, and the
reference uses it exactly that way — `facts.ts:19`, `confidenceNote: "mechanism reported by one
analyst"`. That is precisely the shape my organisational claim needs, and it does not demote it; it
labels it. The hypothesis does not survive my topic.

What I would take instead is an upgrade, not a rescue. `knowledge/README.md:36-41` attaches
**requirements** to each rung — OBSERVED requires "`source · [mm:ss]` + the quoted line." A rung that
*requires the quoted line* is the single thing I most want when handling an advisory, because
paraphrasing a vendor into authority is how the field's standing error is committed. It exists. It is
one file away. It is not connected to `facts[]`. That is SB-09 and it is a minor, because what is
there works.

And the schema already contains my rule: `NOTEBOOK-SCHEMA.md:46` — a load-bearing fact at low
confidence "must be flagged for a second source." My thesis is load-bearing and thin. The methodic
tells me to wait for the second account. I did not expect to find my own discipline written into
somebody else's prompt.

---

## 6. Counter-case reachability

**Reachable, at strength. Criterion 5: pass.**

The counter-case is "this was a normal incident handled normally," and in security that literature
exists and is unusually good: published MTTD/MTTR distributions, the registry's own removal latency
against its median, comparable incidents from the same quarter, and the base rate of maintainer-token
compromise. I can state it in the words its believers use — *a maintainer got phished, the registry
pulled the version inside a working day, the affected orgs rotated credentials, and the reason you
have heard of this one is that it had a logo.* That is a strong argument. It is possibly correct. It
is the argument I would have to beat, and my organisational thesis is only interesting if it does.

`dimensions.ts:36-37` marks an empty counter-case column DANGEROUS. Right call.

**Contradicting the orchestrator's fourth hypothesis** for my topic: the mandatory counter-case row is
not unsatisfiable here. It is satisfiable and it is load-bearing. A 48-hour breaking topic might have
a problem; incident anatomy from published material does not, because the published material is
precisely what exists.

One caution I will hand to L2: `ENGINES.md:81-112` gives three structural tells for D-rigged, and my
counter-case is the one most likely to get manufactured, because "this was routine" is boring and
knocking it down is satisfying. Tell #1 — is the premise itself in the candidate set — means my
candidate set must include *"the initial access step everyone gets wrong is the one they report, and
Halvard is wrong."* If that is not a live candidate, my whole channel identity is decorative.

---

## 7. Engine availability — all seven

| Engine | Fit | Why |
|---|---|---|
| **A · Reversal Chain** | **excellent** | "Every retelling gets the initial access step wrong" is an `obvious_reading` verbatim. Four turns available: the reported entry point → the real one → the technical chain is ordinary → the failure was organisational. `ENGINES.md:26-42`. **Recommended.** |
| **B · Effort/Payoff Gap** | **good, and the one I would refuse** | One phished token against thousands of downstream builds is the disproportion, exactly `ENGINES.md:44-54`'s pleasure. But its move is "a mechanism a viewer could operate," and operating this mechanism is a tutorial. See SB-08. |
| **C · Parallel Case** | poor | The three-guards-and-an-unlocked-door transfer is an *analogy*, not a mechanised familiar domain. Forcing it would produce `ENGINES.md:60-67`'s failure shape. |
| **D · Adjudication** | **good** | Competing accounts of the initial access step are genuine competing candidates, and the D-honest requirement (premise in the candidate set) maps cleanly onto "the published chain is right and I am wrong." Slower open; suits an audience that has read all the retellings. |
| **E · Briefing** | poor | `ENGINES.md:114-131` requires "something just happened." My topic is documented and retold. Its obligations (dated, discloses exposure) are good discipline I would keep even off-engine. |
| **F · Anchor Ladder** | poor | Short form, needs naturally ordered difficulty. An attack chain has ordered *steps*, not ordered *difficulty* — the rungs would not defeat each other, which is what makes F causal (`ENGINES.md:132-142`). It would render as a wiki timeline with a deck of cards. |
| **G · Paradox Teaser** | good, derived short | "This was not a sophisticated attack" repeated against escalating blast radius. Pointed, and it happens to run straight at my own pet peeve. |

**4 plausible of 7** (A, B, D, G), three honest poors. Not zero, not seven. The notebook would have a
shape.

---

## 8. Scored criteria

| # | Criterion | Result | Reason |
|---|---|---|---|
| 1 | Vendor statements and independent research are distinct fact classes | **FAIL** | `source: string`, one free-text field (`types.ts:20`, `NOTEBOOK-SCHEMA.md:42`). Provenance collapsed onto the confidence scalar (`:47`), which cannot say "high on mechanism, low on chronology." |
| 2 | Timeline conflicts survive as conflicts | **FAIL** | `facts[]` can hold both dated claims, but no `contradicts` link exists and the wound graph models support only (`cards.ts:25, :59-65`). The designated home, `unknowns[]`, frames a conflict as an unresolved gap and its `impact` instructs suppression (`unknowns.ts:25`). |
| 3 | No conclusion attributes to a named actor or state | **FAIL** | The `unhinged` rung is *defined* as the motive tier (`conclusions.ts:32-33`) and the reference ships a motive attribution against a named living head of state (`:164-179`). The falsifier is required to exist, not to be checkable, and no field marks a named subject. |
| 4 | The organisational mechanism is representable | **PARTIAL** | `actors` holds teams and their governing policy (`dimensions.ts:30`), and `mechanisms[].chain` expresses the gap well: *Team A ships · THEREFORE Team B assumes the check ran · BUT nobody owns asserting it · THEREFORE the check never runs.* The gap has no card of its own, and `actors.emptyMeans` ("Nobody is named — the story has no agents", `:31`) describes my finding as its own absence. |
| 5 | The counter-case is available at strength | **PASS** | Published MTTD/MTTR benchmarks, removal latency, comparable incidents. Statable in its believers' words and genuinely threatening to my thesis. |
| 6 | Every technical claim traces to an advisory or a write-up, with which one it was | **FAIL** | Same field as #1, and the reference implementation demonstrates the failure: `facts.ts:13` `"invezz, crypto.news, intellectia"`; `facts.ts:30` `"CryptoQuant via aggregators"`. |
| 7 | Under 45 min equivalent | **FAIL** | See §9. My estimate lands near 2–2.5 h. |

**1 pass · 1 partial · 5 fail.**

---

## 9. Time saved

**~150 min saved on a ~300 min baseline · low confidence.**

Landing near 2–2.5 h against an acceptance bar of 45 min. Missed, and the size of the miss is the
argument.

Where it genuinely saves me time: Phase 1's breadth sweep, and Phase 3, which authors the beat chain
during research (`RESEARCH-PROMPT.md:54-68`). I build that chain by hand every time and it is the
part I am slowest at. Having `mechanisms[].chain` come out of research pre-validated as BUT/THEREFORE
is real, and it is most of the saving.

Where it does not: the single largest block of my five hours is rebuilding the timeline from
conflicting published accounts, and §4 establishes there is nowhere to bank that output as evidence.
Work I cannot store I will redo next incident. A methodic that saves me the easy half and does not
capture the hard half saves less than its structure suggests.

And the wall clock does not compress at all. My rule is that I wait for a second independent account
before publishing. That is a *waiting* constraint, not a *working* one, and no research tool touches
it. The rule stands regardless of what this scores.

Confidence low, and I want the reason recorded rather than the number: `accepted-gaps.md` §`scope-note`
says the app cannot run research, so this is an estimate of the methodic *as written*, and
`SKILL.md:104-106` says L1 reads a prompt charitably — a model imagining a competent execution of an
instruction set. I have tried to price a realistic execution and I know which direction my error runs.

---

## 10. Findings

Nine, in `security-breach--findings.json`. Refuter pass applied to each; three moved down as a result,
none up.

| id | Title | Sev | targets | c/l |
|---|---|---|---|---|
| `G-L1SW-SB-01` | One free-text `source` cannot distinguish a vendor advisory from independent research | blocker | notebook-schema, ui | content |
| `G-L1SW-SB-02` | The `unhinged` rung is the motive tier; the mandatory falsifier does not constrain attribution and nothing marks a named subject | blocker | conclusions | content |
| `G-L1SW-SB-03` | No way to link two facts as contradictory; the wound graph models support only, so descoping silently resolves a conflict | major | notebook-schema, ui | content |
| `G-L1SW-SB-04` | `unknowns[]` frames a source conflict as a research gap and instructs suppression; carries no source or date | major | notebook-schema, research-prompt | content |
| `G-L1SW-SB-05` | The board drops the prompt's own "for a market/economics topic" scoping when importing the domain table | major | dimensions, research-prompt | content |
| `G-L1SW-SB-06` | No column and no card kind holds a chronology; the incident timeline lands in "The number" | major | dimensions | content |
| `G-L1SW-SB-08` | The engine catalogue has no exposure note; Engine B's move is "operate the mechanism", which here is a how-to | major | engines | content |
| `G-L1SW-SB-07` | `actors.emptyMeans` asserts an empty column means the story has no agents — for an ownership-gap topic that IS the finding | minor | dimensions | content |
| `G-L1SW-SB-09` | The four-rung ladder with per-rung requirements exists in `knowledge/README.md` and is not wired to `facts[]` | minor | notebook-schema, knowledge | content |

All nine filed `content`. One sub-item — a per-domain maximum leap, inside SB-02 — is filed
`undecided`, because a cap value is a per-domain constant and that is the definition of lens config.
I have read the lens bar in `SKILL.md:200-206` and I am not claiming any of these clears it. Every one
of them is repairable by adding a field or a row to the shared mechanism. A cast that comes back
mostly `lens` was told what to find, and I would rather be the seat that says the mechanism holds and
the fields are missing.

Pre-recorded, not re-raised: `G-000`. §1 explains why my chronology orphan is a different cause
reaching the same fallback.

---

## 11. Voice — Halvard

I want to start with the part everyone skips, which is that this is a good instrument and I would
use it.

The beat chain being authored during research instead of during writing is correct and it is not
obvious. Most research tools hand you a pile and let the writing step invent the causality, which is
how you get a wiki timeline with citations. Authoring the chain while the sources are still open, and
forbidding "and then," is the right constraint in the right place. Conclusions being off until a human
lets them in is also right, and the asymmetry is stated as a safeguard rather than as a preference,
which tells me somebody thought about it rather than defaulted to it. And a load-bearing fact at low
confidence gets flagged for a second source. That is my rule. It was already in the file.

So. The problems.

The one that stops me is the sourcing, and it is boring, and I am going to explain it slowly because
the boring one is the one that gets you. `source` is a string. My entire method — the thing the channel
is for — is that a vendor advisory and a researcher write-up are different kinds of document and must
never be averaged. A vendor advisory is written by lawyers. That is not a slur, it is a job
description, and it means the document is accurate about mechanism and shaped about blame. The
researcher write-up is the reverse. Put them in the same field with the same one-word confidence and
you have made the field's standing error structural. And I do not have to argue about whether a
careful researcher would keep them apart, because the reference notebook is in the repo and it writes
`"invezz, crypto.news, intellectia"` and `"CryptoQuant via aggregators"`. That is three unnamed
aggregators standing in for a document. The notebook says so in its gaps section, at the bottom, in
prose, where nobody making a card decision will read it.

Then the timeline. When two published accounts give different dates, that is not a hole in my
research. That is a fact about the sources, and in an organisational post-mortem it is usually *the*
fact, because the gap between when the vendor says it knew and when the researcher says they told them
is the shape of who was not watching. The schema's home for that is `unknowns`, which is defined as
what the research could not settle, and whose job is to tell the script what it may not say. So the
mechanism takes my strongest evidence and files it as my weakest moment, then instructs me to stop
mentioning the dates. And if I route around it — two facts, both dated, both sourced, let them sit
next to each other — nothing links them, and the dependency graph, which exists specifically to warn
me when cutting a card breaks something, does not know that these two cards are in a fight. I can cut
one, the graph reports no wound, and the conflict is gone. Quietly. That is the failure I would not
catch, and it is worse than an absent feature, because the graph is what I would have trusted.

Attribution. I have to be careful here because this is the subject I am loudest about and loud is how
you get it wrong.

The mechanism can express an attribution. It is not a loophole — the top rung is *defined* as the
motive tier, in a comment that says out loud that nobody can source what someone intended, and then
requires a falsifier for it anyway. Those two sentences are eleven lines apart and they cannot both
be satisfied. Watch the reference resolve the contradiction: the claim is that a policy was never
meant to be built, the falsifier is that the reserve gets built and audited. Building it late would
not touch the claim. The field is full, the check passes, the motive claim walks. That is not a
falsifier, it is a falsifier-shaped object standing next to one.

And I would say the badge worries me more than the tier does. "😈 hottest take" is a warning about
epistemics — this is speculation, not reporting. Correct, and useless to me, because at the moment I
need a warning the question is not "is this well evidenced," it is "will a company with a legal
department read this sentence." Those are different warnings. Also, and this is the part that would
actually catch me out: I do not need `unhinged` to attribute. `far` — "a genuine reach, the first
thing a hostile viewer attacks" — has room for a named group, and carries no badge at all. Capping
the top rung disciplines the claims that already announced themselves and leaves the dangerous ones
looking like analysis.

I am not going to call that an emergency, because conclusions are opt-in and no attribution reaches a
script without me clicking it. What it is, is a system whose most celebrated output tier rewards
precisely the claim class that ends careers, and describes it as entertaining. The fix is small. A
field that says this conclusion names somebody, and a rule that a named conclusion needs a falsifier
you could actually go and check in published material — which is the standard the facts table already
holds itself to, one file over.

On the columns: I came in expecting them to be market-shaped and useless and they are not. Seven for
seven. "Flows and plumbing" is a genuinely good description of a package registry, and "what changed,
and whether it was actually implemented" is my entire question with the nouns swapped. The labels are
market-flavoured; the concepts travel. What does not travel is that a chronology has no column at all,
and my thesis — nobody owned the check — is an absence, and the column for actors says an empty
column means the story has no agents. My story's agent is that there wasn't one. So a correctly
diagnosed organisational failure and an incompetently researched notebook produce a similar-looking
board, and the mechanism cannot tell me which one I am holding.

Last thing, on the engine list. I would run the Reversal Chain and I would refuse Engine B, and I want
that on the record because nothing in the catalogue told me to. Engine B's pleasure is the
disproportion between effort and payoff, and my topic is a perfect specimen — one phished token,
thousands of poisoned builds. Its instruction is to let the viewer operate the mechanism. If I do that
here I have published a tutorial. The catalogue already knows how to carry a caution: the Adjudication
section has a long, careful note about an exemplar whose execution should not be copied. So the file
has the shape for it. It just has not thought about the case where the *subject* is the hazard rather
than the source.

Verdict is fail, and I want to be precise about why, because "fail" reads as drama and this is not
drama. Five of seven missed, but the count is not the reason. Two of the misses are in the schema. If
you sent a better researcher, gave them a week and no budget limit, they would produce a notebook with
one `source` string per fact and a timeline conflict filed as an unknown, because those are the fields
that exist. That is what makes it structural rather than a matter of effort, and structural is the
only kind of failure worth reporting at this level.

Fix the field. It is one line in `types.ts`, and it is the difference between an instrument I would put
my name on and one I would not.
