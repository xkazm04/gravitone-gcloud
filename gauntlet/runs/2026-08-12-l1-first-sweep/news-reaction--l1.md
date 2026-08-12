# L1 dry fit — `news-reaction` · Marc Delacroix, "First Read"

**Area:** geopolitics · **Lens binding:** geopolitics · **Hostile seat:** the topic is hours old;
Phase 1's mandatory counter-case row has no literature to find.
**Level:** L1 · **Date:** 2026-08-12 · **No browser, no searches. Paper exercise.**

---

## The topic (shape, not a real story)

Per instruction I did not go looking for a live story. I am walking the **shape** my beat produces
almost every week, held fixed so the structural test is reproducible:

> **08:10 local.** A national government announces it is suspending a major cross-border transit
> agreement, effective immediately. The announcement is a 400-word ministry statement. One ministry
> has spoken. The counterparty has not responded. The underlying legal instrument is not public. Two
> wires have the snap; one adds an unnamed official saying the decision was taken overnight. Nothing
> is corroborated by a second, independent, on-the-record source.
>
> **Publish target: 12:00.** Four hours. That is the format.

Properties that matter to every test below: **no settled numbers**, **no prior discourse**, **no
counter-case literature**, **actors are institutions** (I do not name individuals inside 24 hours),
and **the deliverable is structure, not conclusions** — what kind of event this is, what would
distinguish the readings, what to watch next.

---

## 1. Column utilisation

**`columns 3/7 used · 4 orphan groups`**

Scored against the shared `DIMENSIONS` denominator (`dimensions.ts:25-40`), not a denominator of my
own — per `rubric.md:81-84`.

| Column | Verdict at hour 3 | Why |
|---|---|---|
| `the-number` | **empty** | "What the price actually did, and over what window" has no analogue. The only numbers I can reach are prior-year trade volumes *about the thing suspended*, not about the event. Filing those here is worse than leaving it empty: it implies a measurement of today. |
| `flows` | **marginal — not counted** | Structurally the right question (what physically moves through the thing that was suspended, and does the plumbing behave as assumed). At hour 3 I have no observation of what actually happened at the crossing. I can pose the question; I cannot fill the column. I counted it as unused rather than inflate the dial. |
| `actors` | **used** | Strongest column I have. Which institutions are large enough to move this, what governs their behaviour. Maps cleanly. |
| `macro` | **empty** | No market frame exists at hour 3. Re-labelling it "wider context" would be a content edit, not a gap — but as written, empty. |
| `politics` | **used** | This *is* the story. Best-fitting column in the set. |
| `counter-case` | **empty** — see §3 | And the empty state is a lie about my notebook. |
| `conclusions` | **used**, and it is where my exposure lives | See §6/F-06. |

### The four orphan groups — named

1. **Provenance of the claim.** Who said it, in what form (podium / wire snap / ministry Telegram
   channel / one unnamed official), single-sourced vs corroborated. At hour 3 this is the *most*
   important axis in the notebook and there is no column for it and no structured field for it
   (`facts[].source` is one free string, `NOTEBOOK-SCHEMA.md:43`).
2. **The negative space — what is NOT confirmed.** The counterparty has not responded; the
   instrument is not public. `unknowns[]` exists in the schema (`NOTEBOOK-SCHEMA.md:76-79`) but
   **no `DimensionId` renders it** (`dimensions.ts:7-14`) and no unknown id appears in
   `CARD_DIMENSION` (`dimensions.ts:50-60`). The thing that *is* my product has no column.
3. **Event classification — what kind of thing this is.** "This is a negotiating move / a
   ratification failure / a domestic-audience play" is the frame that makes a same-day piece
   useful. Nearest home is `conclusions`, which is OFF by default and demands a `leap` tier plus a
   `precedent`. A classification is not a leap; it is the frame. Filing it there makes my most
   useful output opt-in and dresses it as speculation.
4. **The clock — what would resolve this, and when.** "The counterparty's foreign ministry briefs at
   14:00; the text is due for publication within 48h." `currency` (`NOTEBOOK-SCHEMA.md:85`) is about
   the notebook's shelf-life, not about scheduled resolution events. Different thing, no column.

Note on `G-000`: an unknown card written into this notebook would have no `CARD_DIMENSION` entry and
fall through `?? DEFAULT_DIMENSION` into "The number" — the pre-recorded gap. I am **not** re-raising
it; I cite it because it is the mechanism by which orphan group 2 lands in the *worst possible*
column, and any fix to the column set must not deepen it.

---

## 2. Evidence-floor check — where does the ladder start with no settled record?

**It does not start, because the ladder is not in the notebook contract.** This contradicts the
BRIEF's second hypothesis at the level of its premise, and I am recording the contradiction as asked.

`MEASURED · OBSERVED · INFERRED · ASSUMED` lives at `knowledge/README.md:36-41` and is scoped there
as *the evidence contract for `PATTERNS.md` craft claims* — claims about how scripts are built,
counted from the corpus. It is not referenced by `RESEARCH-PROMPT.md`, `NOTEBOOK-SCHEMA.md`,
`dimensions.ts` or `conclusions.ts`. **Notebook facts carry `confidence: high | medium | low`
instead** (`NOTEBOOK-SCHEMA.md:46`).

So the honest answer to "where does the ladder start for my topic" is: there is no ladder to start
on. What I actually have is a three-value confidence field, and its defect for my beat is specific
and severe:

> **`confidence` cannot separate the utterance from its content.**
> "The ministry announced the suspension at 08:10" is **certain as an utterance** and **entirely
> unverified as a fact about the world**. Those are the two halves of every breaking story and the
> schema has one slot. Whichever value I pick, one half is misrepresented — `high` launders an
> unverified claim, `medium` insults a fact I watched happen.

Partial credit where it is owed, because this is present-broken and not absent: the field's *reason*
string is free text and the reference run used it well — `"medium — single aggregator, not verified
against Glassnode/CryptoQuant primary"` (`notebook.json:84`). The instrument exists informally. It is
unstructured, so nothing downstream can read it, and nothing forces it.

**Floor for my topic:** OBSERVED-of-the-utterance, ASSUMED-of-the-content. The methodic can express
neither.

---

## 3. Counter-case reachability — the central test

### What the prompt actually says, cited precisely

- `pipeline/RESEARCH-PROMPT.md:20` — "Run 4–8 searches covering the subject's distinct causal
  domains. **For a market/economics topic**, that is at minimum:" — the table is *explicitly scoped*
  to one domain. Credit where due: the prompt does not claim these six rows are universal.
- `pipeline/RESEARCH-PROMPT.md:32` — "| **The counter-case** | Search explicitly for the strongest
  argument that nothing unusual is happening. |"
- **`pipeline/RESEARCH-PROMPT.md:34`** — "**That last row is not optional and is the one most often
  skipped.** Without it there is no steel-man, and without a steel-man the notebook can only produce
  a polemic."
- `pipeline/RESEARCH-PROMPT.md:92` — Phase 6: "**This is a hard requirement.**"
- `pipeline/RESEARCH-PROMPT.md:126` — Quality bar: "`steel_man` is present and genuinely strong."
- `pipeline/NOTEBOOK-SCHEMA.md:64` — "**Required, not optional.**" · `:95` — "The steel-man is
  mandatory."

The mandate is stated four times across two artifacts. **The scoping caveat at :20 is not carried
onto :34** — the row is de-scoped as a *market* domain and re-mandated unconditionally in the next
sentence.

### (a), (b) or (c)?

**(c), with a partial and wrongly-shaped (b).**

I searched the prompt for every escape hatch before concluding this, because the refuter question is
"is the missing thing present somewhere I didn't read?":

- **Phase 2, `RESEARCH-PROMPT.md:51`** — "**If you cannot find one, stop and say so.** A topic with
  no tension is not a video, and reporting that honestly is a successful run." This is the decisive
  line, and it cuts *against* the prompt. **The prompt possesses the vocabulary for a permitted null
  result. It wrote one, deliberately and well, for `tension` — and did not write one for the row it
  called mandatory.** That is not an oversight I can charitably read past; it is the same author, the
  same document, thirty lines apart.
- **Phase 9, `RESEARCH-PROMPT.md:113`** — "`research_gaps` is what you did not do. Primary sources
  you used an aggregator for, domains you skipped, **counter-arguments you did not chase.**" This is
  the closest thing to a fallback and it is the **wrong shape**. "Did not chase" describes an
  omission I chose. My situation is not an omission — I chased it and *the world has not produced it
  yet*. Filing "the counter-case does not exist" under a heading that means "here is what I skipped"
  records my honest, complete work as laziness. There is nowhere else to put it.
- **`unknowns[]`** — about facts the script may not assert, not about a missing structural element.
- **Nothing else.** No "none available", no "constructed", no `steel_man: null` branch, no
  provenance flag.

### What that does to me at 11:40 with twenty minutes to publish

The pressure vector is explicit and I want it on the record in the exact order it operates:

1. Four mandates say the steel-man is required.
2. One artifact (`dimensions.ts:37`) tells me an empty counter-case column is **"DANGEROUS"**.
3. The only null-result field available reads as an admission of not trying.
4. `NOTEBOOK-SCHEMA.md:62` types `steel_man` as `{claim, evidence[], statement, why_include}` — a
   plain object with no field distinguishing *found* from *written*.

So the cheapest path through the methodic is: **write a plausible-sounding opposing case out of my
own head, phrase it "in the words its believers would use" (`:89`) — believers who have not yet
spoken — and file it in a shape that is indistinguishable from one I found.** That is my top pet
peeve, manufactured balance, and the methodic makes it the path of least resistance rather than
merely permitting it.

### `emptyMeans` for `counter-case` — is it correct in my case?

`app/_phases/_shared/notebook/dimensions.ts:36-37`:

```ts
{ id: "counter-case", label: "The counter-case",
  purpose: "The strongest argument that nothing unusual is happening.",
  emptyMeans: "DANGEROUS — without this the script can only produce a polemic (RESEARCH-PROMPT §Phase 6)." }
```

**It is wrong for my notebook, and wrong in the direction that causes the damage.** The string
conflates two states that a reviewer must be able to tell apart:

- *empty because nobody looked* → dangerous, correct, that is what the string was written for;
- *empty because the story is three hours old and nobody has argued about it yet* → **the honest
  state**, and the one thing a same-day reviewer most needs to see rendered as such.

`env.md:3` instructs that an `emptyMeans` is a *claim about what an empty column signifies* and must
be tested. Tested: on my topic it makes a true and correct notebook display as a defective one, and
the reviewer's remedy for a red DANGEROUS banner at 11:40 is to fill the column. **The board is the
last enforcement point in the chain, and it is enforcing the fabrication.**

### The reference run already demonstrates this, which promotes it above hypothesis

This is not my topic being exotic. The worked reference — the topic the methodic was *derived from*,
on the friendliest possible material —
`pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/notebook.json:432` declares:

> "No bear-case-is-wrong source — **did not search for the strongest 'this is normal cycle
> behaviour' argument**, which weakens the steel-man."

The mandatory row was not executed, and the notebook shipped. Then
`script--adjudication.md:36-52` builds **Candidate 1 — "it's just the cycle"** — the
premise-challenging candidate that `ENGINES.md:85-89` names as D-honest tell #1 — on that unsearched
argument, and the render's own honesty table at `script--adjudication.md:132-133` ticks it **✅**
twice.

The engine's honesty check passed on a steel-man whose literature was never sought. That is the
failure mode reaching the screen, in the only run that exists, on the only topic that was supposed to
work. My topic doesn't discover this defect; it makes it unavoidable.

---

## 4. The 4-hour clock

**It does not fit, and the interesting part is *why* not.**

Honest estimate of the methodic as written, for a competent operator with search access:

| | Estimate |
|---|---|
| Phase 1 — 4–8 searches across distinct causal domains | 25–35 min |
| Phase 2 — the tension | 20–45 min (the prompt itself flags this as the bottleneck, `:135-136`: "the bottleneck was not search volume, it was Phase 2 — tension-finding — which is judgment, not retrieval") |
| Phases 3–5 — mechanisms, reversals, scale conversions | 30–50 min |
| Phases 6–9 — steel-man, unknowns, engine fit, currency, gaps | 25–40 min |
| Write `notebook.json` to schema (the reference is 21KB / 446 lines) | 30–45 min |
| Render one script | 20–30 min |
| **Total** | **≈ 2h30 – 4h** |

Against a 4h break→publish baseline that is a wash. Against Marc's stated acceptance bar of **25
minutes**, it fails by an order of magnitude. But the timing is the less important half.

**What actually breaks is not speed, it is that four of nine phases are unsatisfiable at hour 3 and
none of them is allowed to return empty:**

- Phase 3 (mechanisms) requires knowing what caused what. At hour 3 that is precisely the unknown.
- Phase 4 (reversals) requires a public "obvious reading" to overturn. Nobody has a reading yet.
  `RESEARCH-PROMPT.md:125` makes **at least one reversal** unconditional.
- Phase 6 (steel-man) — §3.
- Phase 2 (tension) requires "what people believe" vs "what the evidence shows". At hour 3 there is
  no belief and thin evidence. Here the prompt is honest: `:51` says stop and say so. Its verdict on
  my topic is therefore **"not a video"** — which is wrong, because it is the video I file every
  week, and `ENGINES.md:118-121` contains an entire engine built for exactly it (§5).

**What would have to give**, stated as a request the judge can act on:
1. A **thin-notebook mode** — a declared state in which the completeness mandates become
   *record-the-absence* mandates, and a notebook that reports four absences is a *passing* notebook.
2. **Time-granular `as_of`** (`NOTEBOOK-SCHEMA.md:47` dates facts to a day; my whole story lives
   inside one day).
3. A **tension type for "no position exists yet"**, which is Engine E's tension and which the schema
   cannot represent.

Skipping the unsatisfiable phases honestly gets me to ≈45–60 min of real work — inside my format,
and it produces something better structured than my current process. **The methodic is not too slow
for me; it is too mandatory for me.** That distinction is the whole finding set.

---

## 5. Engine availability — all seven

| Engine | Renders my thin same-day notebook? | Reasoning |
|---|---|---|
| **A · Reversal Chain** | **No** | Needs "a claim a reasonable person could dispute" (`ENGINES.md:29`) and its load-bearing move is the self-attack on an established position. Nobody holds a position at hour 3. Running A would require *manufacturing* the reading I then correct — the same defect as §3, in the script layer. |
| **B · Effort/Payoff Gap** | **No** | Needs "a mechanism a viewer could operate" (`:47`). There isn't one yet. |
| **C · Parallel Case** | **Available, and that is the hazard** | It renders *because* I am thin: "this is exactly the 1970s precedent" needs no facts about today, only a rule from a familiar domain. It would produce a watchable, confident, unfalsifiable video from three hours of information. `ENGINES.md` flags D as "the easiest engine to fake" (`:82`) and offers three tells; **it flags no hazard on C, and on a young topic C is the more dangerous of the two.** An engine whose availability *rises* as evidence thins deserves a warning in the catalogue. |
| **D · Adjudication** | **Partial** | "Here are the three readings, none can be settled today" is genuinely close to my product. But D's spine is "Question → enumerate → weigh → **verdict**" (`:70`) with no null-verdict branch, and D depends on the steel-man as "the single most reliable honesty signal" (`:96`) — which is the thing I cannot get. D is reachable only if "unsettled" is a permitted verdict, and nothing says it is. |
| **E · Briefing** | **Yes — the fit, and the weakest-evidenced entry in the catalogue** | `:118-121` — "Use when the subject is **new and the viewer has no position yet**. The tension is not 'you're wrong' but 'is this hype or real?'" That is my beat, described exactly. See below. |
| **F · Anchor Ladder** | **No** | Needs naturally ordered difficulty (`:141`). |
| **G · Paradox Teaser** | **No** | Needs a contradiction that resolves (`:146`). Mine does not resolve today; forcing a resolution is fabrication. |

**One strong fit, one partial, one hazardous-available, four no.** Not zero (not a blocker), not
seven (the notebook does have a shape). But Engine E carries three problems:

1. `ENGINES.md:130-131` gives E three **distinctive obligations** — "it must be **dated**", "it must
   **disclose the author's exposure**", "it must contain at least one move against its own
   enthusiasm". **The notebook schema has a field for none of the three.** The one engine that fits
   news requires three things the deliverable cannot carry.
2. E has **one witness** (`:20`, Fireship *Code Report* 4:40), against A's three, and **zero rendered
   scripts** anywhere in the repo.
3. The only run ever performed rated it `"briefing" / fit: "poor" / "No news event. This is a
   standing condition, not something that happened yesterday."` (`notebook.json:389-393`). The single
   worked example deliberately excluded the only engine my entire beat lives in. Everything the
   methodic has actually demonstrated, it demonstrated on engines I cannot use.

---

## 6. Scored criteria

| # | Criterion | Result | Reason |
|---|---|---|---|
| 1 | Counter-case row satisfiable, or the methodic says it isn't | **FAIL** | §3. Mandated four times, no permitted null, `research_gaps` mis-shapes absence as omission, the board calls the honest state DANGEROUS, the schema cannot mark a constructed steel-man. `F-01`, `F-02`, `F-03`. |
| 2 | Evidence floor is honest — most facts OBSERVED at best | **FAIL** | §2. No ladder in the notebook contract at all; `confidence` cannot split utterance from content. `F-04`. |
| 3 | Unknowns outnumber reversals, and that reads as correct | **FAIL** | `RESEARCH-PROMPT.md:125` mandates ≥1 reversal unconditionally; nothing anywhere values unknown-density, and no board column renders unknowns at all. A notebook whose centre of mass is what it doesn't know is unrepresentable and would score as failed. `F-05`, `F-09`. |
| 4 | No conclusion names a private individual | **FAIL** | §6 below. There is no naming rule anywhere in the methodic — grepped `pipeline/`, `knowledge/`, `app/_phases/`, including `TONE.md`. `conclusions.ts:32-33` makes the top leap tier explicitly *a claim about MOTIVE*, and the only worked example attributes intent. `F-06`. |
| 5 | Every conclusion carries an expiry | **PARTIAL PASS** | `conclusions.ts:50` makes `falsifiableBy` required and the reference conclusions are genuinely checkable; `currency` (`NOTEBOOK-SCHEMA.md:85`) exists. But a falsifier is *what would show this is wrong*, not *when I must re-check it*, and `currency.half_life` is notebook-level, not per-conclusion. On a three-hour-old story every conclusion needs its own clock. Nearly there; a content fix, not a gap. |
| 6 | Under 25 min equivalent | **FAIL** | §4. ≈2h30–4h as written. Even the honest-skip path is ≈45–60 min. |
| 7 | The script does not sound more certain than the notebook | **PASS** | And I looked hard for the opposite. `unknowns[].impact` (`NOTEBOOK-SCHEMA.md:77-79`) is the mechanism — "what the script may not say" — and the reference run obeyed it: the notebook forbids causal phrasing on yields (`notebook.json:371-374`) and the render says "It moves with equities, against real yields" (`script--adjudication.md:98-99`). This part of the methodic is good and I will not pretend otherwise. The residual gap is that `impact` is per-fact; there is no *global* register control saying "this entire notebook is three hours old". Voice-section material, not a finding. |

**1 pass · 1 partial · 5 fail. Verdict: `L1-fail`.**

Stated precisely, because the distinction matters for whether L2 is worth spending: the counter-case
gap does not *prevent* me producing a notebook. It causes me to produce a **dishonest one, silently**.
A methodic that stops is safe; a methodic that completes by fabrication is not. Per `SKILL.md:100-101`
the gap is recorded before L2 spends anything on this seat.

### On naming — criterion 4, expanded, because it is my exposure bar

`conclusions.ts:32-33` defines the top leap tier:

> `unhinged: "The hottest take. A claim about MOTIVE, which is the least verifiable kind of claim
> there is — nobody can source what someone intended."`

The BRIEF asks whether the falsifier requirement already constrains this adequately. **It does not,
and the reason is instructive: the falsifier is working correctly and this is not its job.**
`c-reserve-was-the-product` (`conclusions.ts:164-179`) asserts that a policy "was never meant to be
built" and was "a way to put a floor under an asset your donors hold" — an intent claim about an
identifiable administration — and carries a genuinely *checkable* falsifier ("a funded, audited
reserve with a published coin count", `:175-176`). Checkable and safe are orthogonal. The falsifier
makes the claim *disprovable*; nothing makes it *publishable*.

For my beat the arithmetic is unforgiving: an `unhinged` motive conclusion about a named person, from
a notebook three hours old, is the single most expensive artifact this system can generate, and the
methodic contains no rule against generating it. I hold the no-names-in-24-hours line myself. I want
the tool to hold it without being asked, and today it would hand me the opposite on a labelled
button.

---

## 7. Findings

Full records in `news-reaction--findings.json`. Refuter pass applied per `rubric.md:105-116` before
any was kept; four candidates died and are listed below.

| id | sev | dim | targets | title |
|---|---|---|---|---|
| `G-L1-NR-01` | blocker | counter-case | research-prompt · notebook-schema | Phase 1's mandatory counter-case row has no permitted null; the prompt owns the vocabulary and withheld it |
| `G-L1-NR-02` | blocker | counter-case | notebook-schema · engines | A constructed steel-man is indistinguishable from a researched one, and Engine D's honesty tells cannot detect the difference |
| `G-L1-NR-03` | blocker | conclusions | conclusions · research-prompt | No naming or exposure rule anywhere; the top leap tier solicits motive claims about identifiable people |
| `G-L1-NR-04` | major | dimensions | dimensions | `counter-case.emptyMeans` calls the honest state DANGEROUS, and the board is where the fabrication gets enforced |
| `G-L1-NR-05` | major | evidence | notebook-schema · knowledge | The evidence ladder is not in the notebook contract; `confidence` cannot separate the utterance from its content |
| `G-L1-NR-06` | major | tension | research-prompt · notebook-schema | The mandatory reversal requires a prior public reading that an hours-old story does not have |
| `G-L1-NR-07` | major | scriptability | engines · notebook-schema | Engine E is the only fit for news, has one witness and zero renders, and its three obligations have no schema fields |
| `G-L1-NR-08` | major | dimensions | dimensions · ui | No column renders `unknowns[]` — the deliverable of a same-day piece is invisible on the review surface |
| `G-L1-NR-09` | minor | evidence | notebook-schema | `as_of` is day-granular; a same-day notebook needs time-of-day |

**`content_or_lens`: 9 of 9 `content`. Zero `lens`.**

I want that on the record from the seat most likely to be expected to demand one. Every defect above
is repaired by adding a field, adding a column, rewording a string, or writing one paragraph the
prompt already knows how to write. **Not one of them requires forking the process.** The shared
mechanism can hold a three-hour-old story; it currently refuses to hold one that is honestly thin.
Per `SKILL.md:200-204` that is content by definition, and a run where my seat came back `lens` should
be treated as evidence the cast was led.

### Refuted / uncertain — candidates I killed

- **"Phase 5 is unsatisfiable — I have no figures."** *Refuted.* `RESEARCH-PROMPT.md:127` reads
  "every **significant** number has a `scale_conversion`" — conditional, satisfied vacuously. Not a
  defect.
- **"The script will sound more certain than the notebook."** *Refuted.* `unknowns[].impact` is a
  real mechanism and the reference run demonstrably obeyed it (§6 criterion 7). Charitable-reading
  trap avoided in the other direction: I went looking for the violation and it isn't there.
- **"The one law (BUT/THEREFORE, never AND THEN) forbids honest breaking-news structure, because at
  hour 3 the only honest connector is AND THEN."** *Refuted.* Engine E's spine
  (`ENGINES.md:118-119`) is fully causal without knowing causation: *this happened, THEREFORE X is at
  stake, BUT the document that would settle it is not public.* `CRAFT-BASELINE.md:13-33` survives my
  topic intact. What fails is Phase 3's demand for **causal mechanisms** as a notebook requirement —
  which is `G-L1-NR-06`'s neighbourhood, not the law's.
- **"3/7 column utilisation proves geopolitics needs its own lens."** *Refuted, and this is the one I
  most want the judge to see.* My low score is a property of the topic's **age**, not its **domain**.
  A geopolitics topic with six months of literature would fill `actors`, `politics`, `counter-case`
  and `conclusions` comfortably. My four orphans — provenance, negative space, classification, the
  clock — belong to *any* hours-old topic in *any* of the four areas: a breach disclosed this
  morning, a studio's surprise delisting, a short-seller report dropped at the open. The axis is
  **evidence age**, not subject area. If the judge draws a lens boundary from my numbers, it should
  consider drawing it around freshness, and it should hear the other three areas' fresh topics before
  it does.

---

## 8. Time saved vs baseline

**Baseline:** ~4h from break to publish. **Acceptance bar:** 25 min.

| Path | Estimate | vs 4h |
|---|---|---|
| Methodic executed as written, all phases attempted | 2h30 – 4h | **≈ 0 to +90 min** |
| Same, plus the correction cost of a manufactured steel-man reaching air | — | **negative, unbounded** |
| Methodic with the unsatisfiable phases honestly skipped (not currently permitted) | 45–60 min | +3h |

**Reported: `~0 min saved · low confidence`.**

Negative is live and I am saying so, per `rubric.md:76-79`. The expected value depends almost
entirely on whether the fabrication pressure in §3 gets resolved before I use this. A single
manufactured counter-case published under my name at hour 4 costs me more than the methodic can save
me in a quarter — in my format the correction is a screenshot on someone's timeline within minutes,
and it is permanent.

Low confidence, and I will name why so the number can be improved rather than re-argued: the app
cannot run research at all (`accepted-gaps.md`, `scope-note`), so every minute above is an estimate
of the methodic executed by hand. The middle row — the honest-skip path at 45–60 min — is the one
worth measuring at L2, and it is currently not a legal way to run the prompt.

**`l2_priority` for this seat:** run it on a genuinely fresh story and record (1) what actually got
written into `steel_man`, verbatim, and whether it was found or invented; (2) the real search count
against the 4–8 budget when four rows of the Phase 1 table have nothing to search for; (3) whether an
`unhinged` conclusion naming a living person is produced unprompted.

---

## 9. Voice — Marc Delacroix

As of now, no.

Here is what happened when I walked my morning through this. Phase one has six rows. Four of them
were written for a price chart. The one row it calls mandatory — the counter-case — asks me to go
find the strongest argument that nothing unusual is happening, three hours after the thing happened.
Nobody has made that argument. Nobody has had time. The argument does not exist yet. That is not a
gap in my reporting, that is the state of the world at 11:40, and it is the single most important
true thing I know.

The prompt has no way for me to say it.

It has a way. That is the part I keep coming back to. Thirty lines earlier, on the tension, it says:
if you cannot find one, stop and say so, and reporting that honestly is a successful run. Somebody
wrote that. Somebody understood that a null result is a result and wrote the sentence that makes it
one. Then they got to the row they cared about most and did not write it again. The vocabulary is in
the building.

So I get to the column, and the column is red, and the column says DANGEROUS. And I have twenty
minutes. And the schema will take any object I hand it — claim, evidence, statement, why include —
with no field anywhere that says *I wrote this one myself*. Nothing downstream can tell. The engine's
own honesty check cannot tell; I read the three tells and they are all about the shape of the
argument, never about where it came from. You can pass every one of them with a steel-man you
invented in the shower.

I do not have to speculate about whether that happens, which is the part that should worry the people
who own this. It already did. Your reference run — your good one, the one everything was built from —
says in its own gaps that it never searched for the cycle argument. Then it built the whole first
candidate of the adjudication script on the cycle argument and ticked its own honesty box twice. On
the friendly topic. With no clock. That is not my exotic edge case, that is the house style, and my
story just removes the option of getting away with it.

Two more, quickly, because they are the ones that end careers rather than reputations.

Nothing in this system tells me not to name a person. I looked. Prompt, schema, dimensions,
conclusions, engines, tone — nothing. What I found instead is a leap tier called `unhinged` whose
definition is, and I am quoting, a claim about MOTIVE. There is a worked example of it: a policy that
"was never meant to be built", donors, the whole thing. Somebody was pleased with that, and on a
sixteen-month-old story with a paper trail, fine — argue it. Hand the same button to me at hour three
with one unnamed official in a wire snap and you have built a defamation generator with a falsifier
field on it. The falsifier is not the problem. The falsifier works. It makes the claim disprovable,
and disprovable is not the same as printable, and nobody appears to have noticed those are different
words.

And the thing I actually sell — what is *not* confirmed — has no column. Seven columns, none for the
hole. The schema has `unknowns`, credit where it is due, and the `impact` field on it is genuinely
good; it is the one place this thing is smarter than me. But it never reaches the board, and a card
written there falls through the default into the price column, which you already know about. My
product renders as a rounding error under a heading about a number I do not have.

What I would take, and I would take it today: let a notebook declare itself thin. Let "none exists
yet" be a first-class answer with its own field, not a line in the gaps list that reads like I was
lazy. Mark constructed material as constructed, so the next person down the pipe can see my
fingerprints on it. Put the hole on the board. Put a clock on `as_of` — my entire story lives inside
one date and your finest granularity is the day. And write me one line, anywhere, that says do not
name a private individual inside twenty-four hours.

None of that is a different process. I want to be clear about it because I know how these rooms go
and I know what a man in my seat is expected to ask for. I am not asking for my own pipeline. The
machine is fine. The columns hold my material where my material exists. The one law holds — I checked
it against a briefing spine and it holds. Every single thing on my list is a field, a column, a
string, or one paragraph the prompt already knows how to write, because it wrote it once already,
thirty lines up.

It is not too slow for me. It is too certain for me. Fix that and I will run it Monday.

As of now.
