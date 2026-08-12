# TONE-TEST — does tone really leave the beat chain alone?

**Run:** 2026-08-11 · **Subject under test:** `knowledge/TONE.md`, the claim

> **The engine decides what happens. The tone decides how it sounds. Tone may never change the beat
> chain.**

**Verdict up front:** the claim **holds as written** — and it holds *narrowly*. Two deliberately
extreme profiles produced 15/15 identical beats in identical order with identical connectors, and
nothing I tried made a beat appear or disappear. But the sentence protects less than the surrounding
document assumes. Tone moved the beat **schedule**, and it moved **two of the three properties
`TONE.md` §2 declares are not dials**. Details in §5–§7; proposed amendments in §8. No file outside
this run directory was edited.

---

## 1. Method

Both renders re-render the prose of `script--reversal-chain.md` from the same `notebook.json`. No
re-research. The beat chain, the four turns, the three movements, the promise form, the analogy
budget and the fact set were fixed by construction; only prose was rewritten.

Two profiles were declared in `tone-profiles.json` **before** writing, in the shape `TONE.md` §2
implies (rate, author presence, address, inclusion, formality, humour frequency, reference world with
a forbidden list, signature bookends). They are profiles for **hypothetical creators**, not
impersonations: the MEASURED numbers of Fireship, PolyMatter, Economics Explained, MinuteEarth,
MinutePhysics and Basic Logic were used only to choose plausible targets far apart in the observed
space.

- **Voice A — "Null Pointer".** 235 wpm, `I` ≈ 9/1k, `you` ≈ 22/1k, contractions ≈ 30/1k, a joke every
  ~45s, reference world = software practice and self-deprecation, mortgage/food/sport/franchise
  imagery forbidden.
- **Voice B — "The Long Way Round".** 172 wpm, `I` = 0.0/1k hard, `you` ≈ 12/1k, contractions ≈ 13/1k,
  zero jokes (dry understatement only), reference world = domestic objects and institutions given
  dialogue, engineering jargon and internet culture forbidden.

Spoken prose was extracted from each file (blockquoted lines only, `⟨device⟩` annotations and
emphasis markers stripped) and measured with the corpus scripts at
`knowledge/templates/mid-educational-video/steps/01-script/corpus/metrics.py`, plus two supplementary
counters this experiment needed: causal-opener density (`ENGINES.md` § Diagnostics) and a numeric
counter that recognises **spelled-out** numerals — see §3, which is a finding in its own right.

---

## 2. The measurement table

All three measured at the same nominal 300s so the rates are directly comparable.

| | **Original** | **Voice A** | **Voice B** | Profile target A / B |
|---|---|---|---|---|
| Words (spoken) | 1161 | 1328 | 1026 | 1175 / 860 |
| **wpm at 300s** | **232** | **266** | **205** | 235 / 172 |
| Duration at the profile's own rate | — | **5:39** | **5:58** | 5:00 / 5:00 |
| Sentences | 95 | 114 | 96 | — |
| Mean sentence length | 12.2 | 11.6 | 10.7 | — |
| Sentences ≤ 7 words | 35 | 48 | 37 | — |
| **`you` /1k** | 6.9 | **12.8** | **2.9** | 22 / 12 |
| **`I` /1k** | 0.9 | **11.3** | **0.0** | 9 / 0 |
| `we` /1k | 2.6 | 3.8 | 1.0 | — |
| **contractions /1k** | 6.0 | **24.8** | **2.9** | 30 / 13 |
| **hedges /1k** | **7.8** (9 tokens) | **6.8** (9 tokens) | **3.9** (4 tokens) | *not a dial* |
| **numeric expressions /1k** (spelled + digits) | **36.2** (42) | **33.9** (45) | **28.3** (29) | *not a dial* |
| numbers /1k (`metrics.py`, digits only) | 4.3 | 4.5 | 1.9 | *see §3* |
| connectives /1k | 11.2 | 10.5 | 10.7 | — |
| **causal-opener density** (strict: but/so/and/because/therefore) | **20.0%** | **19.3%** | **18.8%** | *not a dial* |
| causal-opener density (loose: + which/except) | 23.2% | 21.9% | 21.9% | — |
| Sentences opening "But" | 2 | 2 | 2 | — |
| Questions asked aloud | 1 | 1 | 1 | fixed |
| Beats | 15 | 15 | 15 | fixed |
| Turns | 4 | 4 | 4 | fixed |

Corpus context for the dials that moved: `you` 2.0–24.0, `I` 0.0–8.3, contractions 11.4–39.1. Voice A's
`I` at **11.3/1k** is above anything measured in the corpus; voice B's contractions at **2.9/1k** are
below anything measured. The two renders are genuinely far apart — a 4.4× spread on address and an
8.6× spread on formality — which is the precondition for the test meaning anything.

### An incidental finding about the baseline

`script--reversal-chain.md` declares `actual_words: 947` and `rate_wpm: 190`. It has **1161 spoken
words**, and 1161 at 190 wpm is a **6:07** video, not the 5:00 in its own frontmatter. Both numbers in
the header are wrong and the 12-row self-check table did not catch it, because **not one of its checks
is a word count or a rate**. The script step currently validates craft and does not validate arithmetic.

---

## 3. A measurement-validity problem found on the way

`metrics.py`'s `numbers_per1k` regex is `\b\d[\d,.]*\b` — digits only. Broadcast prose spells numerals
out (*"three point six seven million"*), so the same text measures **4.3/1k** by the corpus regex and
**36.2/1k** when spelled-out numerals are counted. An 8× discrepancy.

This matters beyond this experiment: the corpus baselines that `TONE.md` §2 quotes for numeric density
(0.0/1k MinuteEarth → 28.6/1k MinutePhysics) come from **ASR captions**, where numerals appear as
digits. Generated scripts are written prose, where they do not. **The corpus numbers and any
render's numbers are not on the same scale**, and comparing them — which the tone layer will want to do
the first time it validates a render against a profile — is invalid. Both figures are reported above;
the spelled-aware one is the one the argument in §6 rests on.

---

## 4. Question 1 — did the beat chain survive?

**Yes, completely, on every dimension the claim names.**

| | Original | Voice A | Voice B |
|---|---|---|---|
| Beats | 15 | 15 | 15 |
| Order | — | identical | identical |
| Turns | 4 | 4 | 4 |
| Connector between every adjacent beat | BUT/THEREFORE, no AND-THEN | unchanged | unchanged |
| Turn 4 is the thesis | yes | yes | yes |
| Steel-man present and before movement 3 | yes | yes | yes |
| Analogy count | 2 | 2 | 2 |
| Promise form | topics | topics | topics |
| Questions aloud | 1 | 1 | 1 |

What I tried, that failed to break it:

- **Voice A had 167 spare words** relative to the original and a persona that wants to fill them. The
  obvious break was to let the surplus become a beat. It did not want to — surplus words attach
  themselves to *existing* beats as elaboration and asides very naturally, because each beat already
  has a job and the extra words just do that job louder.
- **Voice B was 135 words short** and had to cut. The obvious break was for a beat to die. The two
  candidates offered themselves immediately — the escalation at 1:45 and the steel-man at 3:15 are the
  most cuttable *beats* in the chain, because both are strictly "more of the same argument" and the
  script parses without them. Both were kept; something else broke instead (§5).
- **Voice A's forbidden list bans the original's mortgage analogy**, so step 7 had to re-choose. It
  re-chose a different analogy in the same slot for the same mechanism. It never tried to remove the
  slot, exactly as `TONE.md` §3 predicts.
- **Voice B's zero-`I` rule collides with the steel-man**, which is the most naturally first-person
  beat in the engine. It was rendered impersonally and the beat stayed in position.

The chain is *robust*, and the reason is structural rather than lucky: `notebook.json` pre-authors the
mechanisms as `chain[]` of BUT/THEREFORE steps, so the beats exist as data before any prose does. Tone
cannot delete something it never had a handle on. **That is the strongest evidence for the design that
this run produced, and it is worth saying plainly.**

### But the *schedule* is not protected

| | Original | Voice A | Voice B |
|---|---|---|---|
| Turn 1 | 1:20 | **1:35** | 1:20 |
| Turn 2 | 2:50 | 3:00 | 2:50 |
| Turn 3 / 4 | 4:00 / 4:15 | 4:05 / 4:20 | 4:00 / 4:15 |
| Hook → turn 1 gap | 80s ✅ | **95s ⚠️ outside the 60–90s band** | 80s ✅ |
| Runtime at the profile's own rate | 5:00 declared | 5:39 | 5:58 |

Voice A's profile demands a joke every ~45s and an author with declared exposure. Both are
`PATTERNS.md` §3-legal: an 18-second digression, placed after the promise and before the mechanism,
inside the subject's world, 6% of runtime against a ~10% ceiling. It **adds no beat** — and it pushes
turn 1 fifteen seconds later, out of the checked cadence band, and the five seconds that had to come
back out of the essay came out of the steel-man.

So: a tone dial, used entirely legally, moved a structural quantity that the library checks, and
degraded the beat `ENGINES.md` calls *"the single most reliable honesty signal"*. The claim as written
did not prohibit it, because the claim protects the chain and says nothing about the clock.

---

## 5. Question 2 — did the not-a-dial properties stay put?

**One of three held. Two moved, and they moved for the same reason.**

| Property | Original | Voice A | Voice B | Verdict |
|---|---|---|---|---|
| **Causal-opener density** | 20.0% | 19.3% | 18.8% | ✅ **held.** 1.2 points of spread across an 8.6× formality difference. |
| **Hedging density** | 7.8/1k (9) | 6.8/1k (9) | **3.9/1k (4)** | ❌ **moved.** Voice B lost 5 of 9 hedges — 56% of the script's epistemic marking. |
| **Numeric density** | 36.2/1k (42) | 33.9/1k (45) | **28.3/1k (29)** | ❌ **moved.** Voice B lost 13 of 42 numeric expressions — 31%. |

**Causal density is genuinely engine-owned, and this is a real result.** I pushed it from both sides:
voice A's short punchy sentences should mechanically raise the proportion of sentences opening with a
connector (more sentences, same argument), and voice B's periodic register should lower it by burying
connectives mid-sentence. The measured spread was 1.2 percentage points against a corpus range of
15–40%. `TONE.md` §2's third row is **corroborated** — and the mechanism is clear: causal openers are
where beats *join*, and the joins are inherited from the notebook chain, not written fresh.

**Hedging and numeric density are a different story, and `TONE.md` §2 is wrong about them as stated.**
Neither profile set a target for either. Both moved anyway, in voice B, through a channel §2 does not
consider:

> `rate` is a dial. `duration` is fixed by the format. **rate × duration = word budget.** The word
> budget is not a dial — it is a hard constraint that a dial computes. And under a word constraint,
> hedges and spoken numerals are the cheapest words in the script.

Concretely, in voice B: *"about two million dollars"* → *"Two million dollars"*; *"three point eight
nine … to below one"* → *"nearly four dollars … now less than one"*; *"twelve point four billion"* →
*"twelve billion"*; *"roughly three hundred and eighty thousand Bitcoin, almost two percent of the
entire supply"* → *"almost two percent of all the Bitcoin there is"*; *"a correlation of roughly zero
point seven to zero point eight"* → *"almost step for step"*.

Every one of those is a *good* line by the tone profile's own standard. Together they make the render
**more confident than the evidence**, on facts `notebook.json` explicitly marks medium-confidence
(`f-lth-distribution`, `f-correlation`) and on a figure the notebook's `unknowns[1]` orders to be
approximated rather than stated. *"Almost step for step"* is a stronger claim than *"roughly 0.70 to
0.80"*, and it is stronger **because the profile is slow and formal**, which is a sentence that should
not be possible if §2 is right.

Voice A is the control that proves the channel: same not-a-dial properties, a *positive* word budget,
and hedges held at 9 tokens and numeric expressions rose to 45. **Compression is the attack surface,
not tone per se.** A profile that costs words is safe; a profile that buys words is safe; a profile
that *cuts* them eats epistemic marking first, because epistemic marking is grammatically optional and
narratively invisible.

---

## 6. Question 3 — which craft rules did the voices threaten?

Six, in descending order of how close each came to actually breaking.

**1. The steel-man's first person (voice B) — the most serious.** `ENGINES.md` § A calls the
self-attack the engine's load-bearing move and § D calls stating the opposing case at full strength
*"the single most reliable honesty signal in either engine"*. The original carries it on *"Now, I want
to be careful here, because the obvious next step is…"* — an author **visibly** checking themselves.
A profile with `I/1k = 0.0` cannot say that sentence. The impersonal replacement keeps the argument and
loses the audible act of self-correction, which is the part the viewer actually reads as honesty. Then
the word budget took its numbers as well. **A dial setting inside `TONE.md`'s permitted range
measurably weakened the engine's honesty apparatus in two independent ways.**

**2. Rate versus the chain's word floor (voice B).** 172 wpm × 300s = 860 words. The chain would not
go below **1026** without dropping a beat. The escalation and the steel-man both volunteered. I kept
them and let the duration break instead — 5:58 rather than 5:00. This is the choice the tool will face
every time a slow profile meets a fixed slot, and *nothing in the library currently tells it which way
to fail*. The right answer is obvious once stated (a chain has a word floor; a rate that violates the
floor must lengthen the video, never shorten the chain) and it is not written anywhere.

**3. The digression that is a joke wearing a hat (voice A).** The forbidden shape is "a joke that
occupies its own beat". `PATTERNS.md` §3 legalises up to ~10% of runtime that "advances no beat",
observed on a Briefing whose persona is the product. A `humour ≈ 1/45s` dial plus a declared-exposure
persona will reach for that allowance every single time. It is the one sanctioned doorway through
which a tone setting adds runtime — and §3's own evidence is n=1, on a different engine.

**4. A reference world with no adequate image (voice A).** `TONE.md` §3 permits the reference world to
reach back into step 7 and choose *which* analogy. Voice A's forbidden list rules out the original's
"borrowing against your house to buy another house" — a strong, physical, reversal-carrying image
(`notebook.json` rates it *"strong"*). The permitted world's best substitute is *"a recursive function
whose base case is your own share price"*: vivid to the profile's audience, inert to everyone else,
and a **category rather than an image**, which is exactly the abstraction `CRAFT-BASELINE.md` §6 exists
to prevent. The tone layer performed a licensed substitution and the substitution was worse. §3
guarantees an analogy will *exist*; nothing guarantees the permitted world *contains* one.

**5. Persona furniture as an engine import (voice A).** Declared exposure is an Engine E obligation.
Voice A's profile carries it as identity, so it arrives in a Reversal Chain, costs runtime, and is
paid for out of the steel-man. Profiles carry engine-shaped habits across engine boundaries.

**6. The generalise/escalation step under speed (not observed).** The brief predicted a fast profile
would want to cut the generalise step. It did not — voice A had surplus words, so speed was not
scarcity. The pressure to cut the escalation came from the **slow** profile, for the arithmetic reason
in §5. Prediction wrong, and the inversion is the interesting part: *low* rate is the dangerous
setting at fixed duration, not high.

---

## 7. Verdict

**`TONE.md`'s central claim holds as written.** Two profiles at opposite ends of every measurable dial,
one of them outside the corpus range on two dials, produced byte-for-byte identical beat chains. The
notebook-as-chain design is why, and it deserves the credit.

**The claim is also doing less work than the document around it believes**, in three specific ways:

1. It protects the beat **chain** and is silent on the beat **schedule**. Voice A stayed inside every
   rule in the library and still pushed a turn out of its cadence band; voice B stayed inside every
   rule and still produced a 5:58 video from a 5:00 chain. "If the beat count moves, that is a bug"
   (§3) is necessary and not sufficient.
2. §2's not-a-dial table is right about causal density (measured: 1.2pt spread) and **wrong about
   hedging and numeric density** (measured: −56% and −31%), because it treats them as independent of
   the dials when in fact `rate` sets a word budget and both are bought with words. The failure is
   asymmetric and predictable: compression eats epistemic marking first.
3. §3's reference-world carve-out guarantees an analogy exists but not that a permitted world contains
   a *usable* one, and a profile's forbidden list can therefore degrade a concrete image into jargon
   at step 7 — with full authorisation.

None of that falsifies the separation. All of it says the separation needs three more sentences to
mean what the rest of the document assumes it means.

---

## 8. Proposed amendments to `TONE.md` — NOT APPLIED

Recorded here only. `knowledge/**` was not touched by this run.

**8.1 — Extend the epigraph to cover the schedule.**

> The engine decides what happens. The tone decides how it sounds. **Tone may never change the beat
> chain, and may never move a turn out of its cadence band.**

**8.2 — §2, replace "not a dial" with "not a dial, and protected".** Add a row and a rule:

> | Property | Determined by | Protection |
> |---|---|---|
> | Hedging density | the subject's knowability | **word-budget exempt.** A hedge may not be removed to meet a rate. |
> | Numeric density | whether the subject is quantitative | **word-budget exempt.** A scale conversion may lose its prose, never its figure. |
>
> MEASURED (this run): a slow, formal profile applied to an approved chain cut hedges 7.8 → 3.9/1k and
> numeric expressions 36.2 → 28.3/1k **with no dial set for either**, because rate × duration is a word
> budget and hedges are the cheapest words in a script. Causal density over the same pair moved 20.0%
> → 18.8% and is confirmed engine-owned.

**8.3 — §2, demote rate.** The dial table lists rate first; `PATTERNS.md` §6 already says *"rate is a
consequence of the visual plan"* and *"never let a 'pace' dial move the beat chain"*. Reconcile them:

> **Rate is a constraint, not a preference.** rate × duration = word budget. Every chain has a **word
> floor** (the shortest prose that renders all its beats) and a **word ceiling** (past which beats
> start being padded). A profile whose rate violates the floor must **lengthen the video**. It must
> never shorten the chain, and the tool should say which of the two it is doing.

**8.4 — §3, budget the digression before placing turns.** A humour or persona dial buys runtime that
advances no beat. `PATTERNS.md` §3 permits ~10%; that allowance must be **subtracted from the essay
before turn placement**, not discovered afterwards, or turn cadence silently drifts. Add to the two
consequences in §3:

> - **A tone profile's digression and bookend allowance is deducted from the essay budget at step 4,
>   not at step 9.** Runtime spent on persona is runtime the turns do not get.

**8.5 — §2, make the forbidden list checkable against the notebook.** Add:

> A reference world's **forbidden** list must be validated against every mechanism with
> `needs_analogy: true`. If the permitted domains yield no *physical* image for a mechanism, the tool
> must surface the conflict rather than accept an abstract substitute — a category in an analogy slot
> is the `CRAFT-BASELINE.md` §6 defect, and a forbidden list is a licensed way to cause it.

**8.6 — new §2 subsection: profile × engine compatibility.** Some engine obligations require a dial
setting to be non-zero:

> | Engine obligation | Requires |
> |---|---|
> | Declared exposure (E) | `I`/1k > 0 |
> | Steel-man / self-attack (A, D) | `I`/1k > 0 **or** an approved impersonal form |
> | Procedural walkthrough (B) | `we`/1k high |
>
> A profile that cannot satisfy an engine's obligation is not a styling choice, it is an incompatibility,
> and the tool should say so at step 2 rather than produce a weakened beat at step 9.

**8.7 — outside `TONE.md`, two repairs this run needs someone to make:**

- `corpus/metrics.py` counts digits only, so it under-reports numeric density in written prose by ~8×
  (4.3/1k vs 36.2/1k on the same text). Corpus figures are from ASR captions and are **not comparable**
  to render figures. Either teach the regex spelled-out numerals or label the two scales as distinct.
  The tone layer will otherwise validate renders against a profile using incommensurable units.
- `script--reversal-chain.md`'s frontmatter (`actual_words: 947`, `rate_wpm: 190`) is wrong on both
  counts — the file has 1161 words, which is 6:07 at 190 wpm. Add word count and implied duration to
  the self-check table; the current 12 checks are all craft and none is arithmetic.

---

## 9. Limits of this experiment

- **n=1 chain, n=2 profiles, one engine, one subject.** Everything here is a single Reversal Chain on a
  quantitative economics subject. The numeric-density finding in particular may be specific to a
  subject carrying six scale conversions; a MinuteEarth-style zero-number subject has no numerals for a
  word budget to eat.
- **Same author for both renders.** One writer imitating two profiles will unconsciously preserve more
  than two different writers would. The invariance result in §4 is therefore an *upper* bound on how
  well the separation holds — a real second creator is a harder test, and the honest reading of §4 is
  "the chain survived a motivated attempt to bend it", not "the chain cannot be bent".
- **The profiles undershot two targets.** Voice A reached 12.8 `you`/1k against a 22 target and 24.8
  contractions against 30; voice B reached 2.9 `you`/1k against a 12 target. Prose written to a beat
  chain resists address density, which is itself a small piece of evidence that structure constrains
  tone as well as the reverse — untested, and worth one more render to check.
- **Durations are nominal.** Nothing was read aloud or timed. The 5:39 and 5:58 figures are
  words ÷ profile rate, not measurements.
