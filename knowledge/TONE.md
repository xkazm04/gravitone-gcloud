# The tone layer — personalisation without losing the spine

**Cross-template.** How a script sounds like *this creator* rather than like a model.

The whole design rests on one separation:

> **The engine decides what happens. The tone decides how it sounds. Tone may never change the beat
> chain.**

That is not a stylistic preference, it is the thing that keeps personalisation from destroying the
product. Beats are what make a script watchable; voice is what makes it yours. A "make it funnier"
control that is allowed to add a beat has just reintroduced the wiki-timeline failure with jokes in
it.

---

## 1. Evidence that tone and engine are genuinely independent

MEASURED across 10 sources. Two channels running the **same engine** (Reversal Chain) on contested
economic subjects, at comparable quality:

| | Economics Explained | PolyMatter |
|---|---|---|
| Rate | 206 wpm | 176 wpm |
| Second person /1k | 6.2 | 14.2 |
| Inclusive "we" /1k | 3.8 | 7.8 |
| Contractions /1k | 11.4 | 27.0 |
| Connectives /1k | 14.6 | **32.0** |
| Signature close | *"Thanks for watching, mate. Bye."* | a next-video handoff |
| Reference world | Australian consumer scale — *"less than Woolworths turns over"*, *"smaller than Vermont's"* | personified institutions — *"Ireland rolled its eyes and shook its head"*, *"Apple can wink at the IRS"* |

Same engine. Unmistakably different people. **That gap is the space the tone layer operates in.**

And the counter-case, which is why this needs rules: the same *presenter* changes tone with format.
Fireship runs 221 wpm with 23.3 inclusive-"we" per 1k in *100 Seconds* (procedural: *"we'll increment
that cell"*), and 234 wpm with 24.0 second-person and only 5.5 "we" in *Code Report* (commentary:
*"you'll learn exactly how to use it"*). **Tone is not one fixed profile per person — it is a profile
per person × format.**

---

## 2. What is a tone dial, and what only looks like one

The trap. Three of the most measurable properties of a script are **not** tone, and exposing them as
user controls produces incoherent output.

| Property | Determined by | Why it must not be a dial |
|---|---|---|
| **Hedging density** | the *subject's* knowability | MEASURED 0.0/1k (Fireship on a language spec — fully knowable) → 18.2/1k (MinutePhysics on ocean chemistry — genuinely messy, and it says so). A creator who sets "confident" on an uncertain subject is asking the tool to lie. |
| **Numeric density** | whether the *subject* is quantitative | MEASURED 0.0/1k (MinuteEarth, zero numbers, fully effective) → 28.6/1k (MinutePhysics). Setting this dial produces either fake precision or withheld evidence. |
| **Causal-opener density** | the *engine* and how tightly it argues | 15% → 40%. Raising it stylistically means inserting "therefore" between beats that have no causal relation — the exact defect the law forbids. |

**The rule:** if a property is decided by the subject or the engine, the tool computes it and shows
it. Only what remains is a dial.

### The actual dials

MEASURED ranges from the corpus, per format:

| Dial | Range observed | Notes |
|---|---|---|
| **Rate** | 156–252 wpm | Confounded with visual density — PolyMatter's 176 and *Target*'s 125 are low because images carry the load. Set per format, not per creator. |
| **Author presence** (`I`/1k) | 0.0 → 8.3 | MinutePhysics is entirely absent; Fireship is a character with stakes (*"which I'm stupidly paying $200 a month for"*). |
| **Address** (`you`/1k) | 2.0 → 24.0 | MinuteEarth barely addresses the viewer; Fireship and MinutePhysics constantly do. |
| **Inclusion** (`we`/1k) | 0.0 → 23.3 | High "we" is *procedural* — it puts the viewer's hands on the thing. Rises sharply in walkthroughs. |
| **Formality** (contractions/1k) | 11.4 → 39.1 | The single cheapest proxy for "written vs spoken". |
| **Humor frequency** | 0 → ~1 per 45s | Zero is viable: neither MinutePhysics nor MinuteEarth is funny and both work. |

### The two dials that aren't numbers

These carry more identity than everything above combined, and neither is a slider.

**The reference world** — where analogies, comparisons and jokes are drawn *from*. It is the most
recognisable thing about a voice and the most mechanical to specify:

- Fireship → memes, developer culture, self-deprecation (*"hype Jedi"*, *"closed AI"*)
- PolyMatter → physical and domestic imagery, institutions given dialogue (*"Ireland rolled its eyes"*)
- Economics Explained → supermarket-scale consumer comparisons, dry understatement
- MinuteEarth → plain natural imagery, no cultural references at all

A creator's reference world should be captured as a short list of permitted domains plus a
**forbidden** list. It is what stops a generated script reaching for a Marvel simile in a monetary-policy
video.

**Signature bookends** — the fixed opening and closing furniture. *"It is January 21st 2025 and
you're watching the Code Report"* … *"this has been the Code Report"*. *"Hi, I'm David and this is
MinuteEarth."* *"Thanks for watching, mate. Bye."* These are template slots, never generated fresh,
and the closing one must not be confused with the **reframe**, which is composed per script (see the
per-template PATTERNS).

---

## 3. Where tone attaches to the pipeline

The composition procedure runs 1–10; **tone enters at step 9 and only at step 9.**

```
1  find the tension            ─┐
2  pick the engine              │
3  question stack               │  STRUCTURE — tone has no vote here
4  beat list                    │
5  but/therefore validation     │
6  place the turns              │
7  assign concretes            ─┘   ← except: the reference world constrains
                                      WHICH analogy is chosen, not whether one exists
8  hook + closing line          ← signature bookends slot in
9  write prose                  ← ALL other tone dials apply
10 read aloud
```

Two consequences worth enforcing in the UI:

- **Changing the tone profile re-renders prose but leaves the beat chain untouched.** A creator should
  be able to flip their own voice onto an approved structure and see only the words change. If the
  beat count moves, that is a bug.
- **The reference world is the one tone input that reaches back into step 7**, because it decides
  which analogy gets chosen. It still cannot decide *whether* the script needs one — that is the
  mechanism's call.

---

## 4. Learning a profile from produced scripts

The user's requirement — *learn from produced scripts* — is directly achievable, because everything in
§2's dial table is already extracted by `corpus/metrics.py` from plain text.

**The loop:**

1. **Seed** from 3–5 scripts the creator likes. These can be their own back catalogue or exemplars
   they nominate. Run the same measurement used throughout this library.
2. **Store a profile per creator × format** (see §1 — one profile per person is wrong).
3. **Update on acceptance, not on generation.** Only scripts the creator *approved and shipped* update
   the profile. A generated draft they rewrote is evidence about the model, not about them.
4. **Learn the delta, not the absolute.** The most valuable signal is what the creator *changed*: if
   they consistently cut hedges the tool inserted, that is a tone fact. Diffing accepted-vs-generated
   is a stronger teacher than measuring the accepted text alone.
5. **Show the profile as numbers with their sources.** "Your rate: 212 wpm, from 6 accepted scripts."
   A profile the creator cannot inspect is a black box they will stop trusting the first time it
   sounds wrong.

**Three failure modes to design against:**

- **Drift to the mean.** If the profile is re-fit on generated-then-lightly-edited scripts, it
  converges on the model's own voice. Rule 3 (accept-only) is the guard; a periodic re-anchor against
  the original seed set is the backstop.
- **Learning structure by accident.** If a creator's accepted scripts all use one engine, the profile
  must not start preferring that engine — engine choice belongs to the *idea*, not the person. Store
  engine usage as an observation to show them, never as a default to apply.
- **Over-fitting to a hit.** One viral script should not dominate. Weight by count, not performance;
  the studio has no reliable performance signal at prototype stage and pretending otherwise would
  encode noise.

---

## 5. The standard, once script generation is mastered

The user's sequencing — *master script generation, then establish a standard, then parametrise the
UI* — implies an artifact this library should eventually hold: a **house profile**, being the tone
defaults a new project starts from before any personalisation. It is not written yet, and it should
not be invented; it is the thing that falls out of the first dozen accepted scripts.

What is already decided, and should not be relitigated when it is written:

- The profile is **per creator × format**.
- It contains **dials only** — never hedging, numeric density or causal density.
- It is **inspectable, sourced, and updated on acceptance**.
- It **cannot alter a beat chain**.

---

## Open questions

- **How many accepted scripts before a profile beats the default?** Unknown. Suspect 5–10; measurable
  once the studio produces anything.
- **Is the reference world learnable, or must it be declared?** Extracting "this creator's analogies
  come from developer culture" from text is plausible but unproven. Declaring it is cheap and certain;
  start there.
- **Does a creator's tone profile transfer across templates?** §1 says a *presenter's* does not
  transfer across formats. Whether a stable core survives — the reference world probably does, the
  rate certainly does not — is untested.
- **Where does tone end and persona begin?** Fireship's *"I'm stupidly paying $200 a month"* is not a
  dial setting; it is a character with continuity across videos. A tone layer cannot produce that, and
  the studio should be honest about the boundary rather than promising a personality slider.
