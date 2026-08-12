# Script patterns — beat composition for educational video

The craft rules for **idea → script**. Read [`knowledge/CRAFT-BASELINE.md`](../../../../CRAFT-BASELINE.md)
first — this document assumes it.

**Sources:** n=4, each read in full, not sampled —
[Economics Explained, *North Korea*](sources/economics-explained--north-korea.md) (17:53) ·
[Fireship, *Brainf\*\*k in 100 Seconds*](sources/fireship--brainfk-100-seconds.md) (2:08) ·
[MinutePhysics, *Does Pressure Keep the Deep Ocean From Freezing?*](sources/minutephysics--deep-ocean-freezing.md)
(1:40, 64s of essay) · [MinuteEarth, *Why Don't Blue Whales Eat Fish?*](sources/minuteearth--blue-whales-krill.md)
(2:29). Labels: MEASURED · OBSERVED · INFERRED · ASSUMED.

> **Length is not the subject.** The 18-minute video is here because its beat composition is the
> clearest available example of the thing we need, and composition zooms. The two short sources were
> added specifically to test whether it *does* zoom — see §5, where it corrected a wrong inference.
> Duration is a budget, applied last.

---

## 0. The failure this prevents

Ask a model for "explain Bitcoin in 200 seconds" and it returns a **wiki timeline**: correct facts in
a reasonable order, each connected to the last by *and then*. It is accurate and unwatchable, and no
amount of pacing, delivery or visuals rescues it, because the defect is structural — nothing in it
makes a viewer want the next sentence.

All four studied videos avoid this the same way: **the facts are hung on a question chain, not laid
on a timeline.** Everything below is how that chain is built.

---

## 1. The engine: a chain of turns

MEASURED · sentence-initial causal/additive connectives: Economics Explained **24%** of 168
sentences (`so` 14, `and` 14, `but` 9…), rising to **38%** (MinutePhysics) and **40%** (MinuteEarth)
in short form — see Appendix A. But the sentence count understates it — the *act boundaries* are all turns, and
several are mid-sentence. Every one, with the tape:

| Time | The turn | Type |
|---|---|---|
| 0:49 | *"But what's really going on here?"* | opens the central gap |
| 7:20 | *"But, this is where things get economically interesting. Because, on paper, most of this trade arguably shouldn't count as growth at all."* | **reversal 1** — the boom may not be a boom |
| 9:23 | *"And it actually gets weirder than that because this is two-way trade."* | escalation of reversal 1 |
| 10:11 | *"So, that is the theory. A boom that on paper might not be a boom at all, but in practice, who cares?"* | **reversal 2** — attacks its own reversal |
| 11:24 | *"So, the honest reading sits somewhere in the middle."* | synthesis |
| 12:33 | *"the sanctions still technically exist, but the neutral referees who documented breaches of them are gone"* | mechanism turn |
| 14:53 | *"But whether any of that actually happens depends entirely on our third question."* | navigation into act 3 |
| 15:00 | *"Nobody can predict the future, least of all economists, but the honest answer here is probably not."* | **reversal 3** — the optimism is withdrawn |
| 15:10 | *"illumination rose by an average of about 26%… but the gains were overwhelmingly concentrated in the capital"* | evidence turn |
| 16:06 | *"There is also a much darker possibility, which is that this arrangement doesn't loosen the system of control at all, but cements it."* | **reversal 4** — the darkest one, saved for last |
| 16:37 | *"Then there is the awkward fact that this entire boom is built on a single customer fighting a single war three time zones away."* | final complication |

OBSERVED · **there is no point in this video where the next beat is predictable from the last.** That
is the entire craft. The viewer is repeatedly given a conclusion and then shown why it is wrong or
incomplete, and each correction is more interesting than what it replaced.

**INFERRED — the composition rule:** a script is finished when you can read your beat list aloud with
*but* or *therefore* between every pair, and none of them is a lie. This is the acceptance test for
the whole step.

---

## 2. Three engines, all valid

The four sources use three structurally different engines. This is the choice that must be made
before a word is written, because everything else follows from it — act shape, pacing, hedging,
whether numbers appear at all.

### Engine A — the Reversal Chain (Economics Explained)

> Claim → evidence → **but here's why that's wrong** → **but here's why that objection is wrong** →
> honest synthesis → **but can it last?** → reframe

The viewer's pleasure is *being corrected*. Each act hands them a stable conclusion and then destabilises
it. Use when the subject has a **claim a reasonable person could dispute**.

The load-bearing detail, OBSERVED: **it steel-mans against itself.** At 10:11, having spent three
minutes proving the boom is a statistical illusion, the script turns on its own argument — *"but in
practice, who cares? People can't eat economic growth."* A script that only knocks things down is a
rant. The self-correction is what makes it feel like thinking rather than arguing.

### Engine B — the Effort/Payoff Gap (Fireship)

> Absurd premise → it's real and it works → here is the whole mechanism → **notice what's missing** →
> now let's actually use it → deliberately painful labour → trivially small payoff

The viewer's pleasure is *the disproportion*. OBSERVED · the video spends 42 of its 128 seconds — a
third of the runtime — walking through incrementing cells one at a time to print two words, names the
experience (*"manipulating memory like cavemen"*), and lands on *"congratulations, you just said hi to
your mom."* The joke and the lesson are the same thing: **you now feel what the language costs.**

Use when the subject has a **mechanism a viewer could operate**, and especially when that mechanism
is strange, tedious or extreme — the engine converts tedium into comedy instead of hiding it.

INFERRED · **Engine B is not "a tutorial".** A tutorial optimises for the viewer completing the task.
This optimises for the viewer *understanding the character of the thing* — which is why the payoff is
allowed to be worthless.

### Engine C — the Parallel Case (MinuteEarth)

> Establish a rule in a **familiar** domain, fully mechanised → transfer it to an **unfamiliar**
> domain → the rule holds **but needs a twist** → the twist deepens the rule → reframe

The viewer's pleasure is *pattern recognition* — watching a rule they just learned survive a harder
test. Critically, **the viewer is never told they were wrong**, which is what separates this from
Engine A. MEASURED · *Why Don't Blue Whales Eat Fish?* splits 67s on the land case, 47s on the ocean
case: the familiar half comes first, is longer, and does all the mechanical work; the unfamiliar half
can then be 30% shorter because the viewer already owns the rule.

Use when the idea is **a principle with a surprising instance** — where the interesting thing is not
"you're wrong" but "this holds even here, for a reason you wouldn't guess."

### Choosing

| The idea is… | Engine | Because |
|---|---|---|
| a claim someone could argue with | A — Reversal Chain | there is something to overturn |
| a mechanism someone could operate | B — Effort/Payoff | there is something to feel |
| a principle with a surprising instance | C — Parallel Case | there is a pattern to recognise |
| none of these | **not a video yet** | it is a topic; go find the tension |

**The engine catalogue has moved.** Engines are cross-template — a Reversal Chain is a Reversal
Chain at 30 seconds and at 18 minutes — so they now live in
[`knowledge/ENGINES.md`](../../../../ENGINES.md), which at n=10 holds **seven**: the three above plus
**Adjudication**, **Briefing**, **Anchor Ladder** and **Paradox Teaser**. Read it rather than this
section for engine choice; what stays here is how the engines behave *at 1–3 minutes*.

---

## 3. The promise architecture

OBSERVED · EE states its structure out loud at **1:43–1:57**, immediately after the hook, as three
questions:

1. *"So, how are we actually measuring the supposed economic miracle?"*
2. *"Does it actually have the potential to benefit the people of North Korea long term?"*
3. *"And finally, what happens to this relationship of convenience if the war comes to an end?"*

MEASURED · those three questions are then answered **in order**: Q1 across 3:30–11:35, Q2 across
11:35–14:53, Q3 across 14:57–17:40 — and the transition into the third is explicitly announced:
*"But whether any of that actually happens depends entirely on our third question."*

This is the nested-loop architecture from the baseline, made visible. **The question stack is the
skeleton.** It does three jobs at once: it opens three gaps the viewer now wants closed, it tells them
the video has a shape, and it lets them locate themselves at any moment.

**INFERRED — this is the highest-transfer technique in the entire study, and the one a generator most
needs.** A model asked for "a script about X" produces a timeline. A model asked to *first produce the
three questions the video will answer, then chain beats under each* produces something with a spine.
The question stack should be a **generated, editable artifact of its own**, approved before any prose
exists.

**At 1–3 minutes it is ONE question, not two.** MEASURED · both short sources ask exactly one, and
place it in the first 12 seconds:

- MinutePhysics asks it *as the title* and answers it in the second word — *"Does Pressure Keep The
  Deep Ocean From Freezing? **No.**"* — then immediately reopens the gap: *"But you were probably
  hoping for a more in-depth answer."* That single line is what buys the remaining sixty seconds, and
  it states the real principle out loud: **answering the question does not close the gap, because the
  gap was never *what*, it was *why*.**
- MinuteEarth asks *"Why do such big things eat such small things?"* at 0:10, after eight seconds of
  paired observation, and never asks another.

INFERRED · the act count scales with runtime roughly one question per 60–90 seconds of essay body:
1 question ≤3 min, 3 questions at 18 min. Untested in the 4–8 minute middle.

---

## 4. The hook is a gap, not a fact

OBSERVED · both openings, and neither wastes a word on housekeeping — no greeting, no "in this video".

**EE (0:00–0:50)** is textbook SCQA:

| | |
|---|---|
| **Situation** | *"Never let a good crisis go to waste."* — an aphorism everyone accepts, 2 seconds |
| **Complication** | the most isolated country on earth *"is home to one of the fastest-growing economies in the world"* |
| **Evidence** | satellite brightness ×3 · more new homes than Chicago or LA · *"a problem it has never had before — traffic jams"* |
| **Question** | *"But what's really going on here?"* ← 0:49 |
| **Answer** | the triangle, stated immediately: NK sends munitions and men to Russia, Russia sends resources to China, China sends development goods to NK |

OBSERVED · **the answer is given at 1:00 of a 17:53 video.** Nothing is withheld. The remaining 94% is
spent on *why it's stranger than it sounds* — proof that in explanatory work the tension is never
"what happens", it is "how can that be true".

**Fireship (0:00–0:09)** compresses the same shape into nine seconds: *"a minimal esoteric programming
language designed to make your brain hurt — it's Turing complete **but** not designed to build actual
software. It's more like a work of art that challenges the status quo."* Situation, complication and
thesis, with the "but" doing the work.

INFERRED · the hook's job is to make one specific question unbearable. Test: *after the first 15
seconds, can the viewer state the question the video will answer?* If not, the hook failed regardless
of how striking the facts were.

---

## 5. The reversal, anatomically

OBSERVED · EE's reversals share a shape, and it is reproducible:

1. **Let the viewer settle.** The obvious reading is stated plainly and generously, with evidence.
   *"More exports means more output, which means more growth, which means brighter lights."*
2. **Signal the turn.** *"But, this is where things get economically interesting."* — a two-second
   warning that lets the viewer brace instead of getting lost.
3. **Give the mechanism, not the verdict.** The reversal is earned with GDP accounting: production is
   counted where it *ends up*; those shells were counted as inventory investment decades ago; exports
   rise, inventories fall, **net effect roughly zero.**
4. **Make it concrete.** The fridge factory: *"If it builds a fridge in December that doesn't sell
   until the following year, that fridge still counts towards this year's GDP."*
5. **Generalise so it doesn't feel like a trick.** *"This is not some special rule invented to be mean
   to North Korea. If the United States decided to export its entire strategic petroleum reserve
   tomorrow…"* — pre-empting the objection that the argument was rigged.
6. **Escalate once.** *"And it actually gets weirder than that because this is two-way trade"* — the
   imports get subtracted, so the boom could show up as *shrinkage*.

### The compression — CORRECTED 2026-08-11

The first pass inferred a **60–90 second floor** per reversal from the long-form source, and concluded
short videos could hold at most one. **That was wrong by a factor of three to four.**

MEASURED · MinutePhysics runs **two full reversals in a 64-second essay body — about 18 seconds
each**:

> [0:16] *"pressure CAN melt ice"* — 500× atm melts to −4°C, 1000× to −9°C ⟨the case FOR, built generously⟩
> [0:27] **"But that's for fresh water."** ⟨reversal 1⟩ → salt shifts everything colder, quantified
> [0:45] **"But for various reasons… deep ocean water is often 0–4°C"** ⟨reversal 2⟩
> [0:57] → *"…temperatures at which the water would stay liquid from salt alone, even without the pressure"*

The six-step anatomy does not need 90 seconds. It **sheds two specific steps**:

| Step | Long form | Short form | |
|---|---|---|---|
| 1. Let the viewer settle | ~40s | **~11s**, with data | survives |
| 2. Signal the turn | a full sentence | **four words** | survives, compressed |
| 3. Mechanism, not verdict | ✓ | ✓ | survives |
| 4. Concrete analogy | the fridge factory | **cut** | expensive |
| 5. Generalise so it isn't a trick | the petroleum reserve | **cut** | expensive |
| 6. Escalate once | ✓ | ✓ | survives |

**INFERRED — the real rule: steps 4 and 5 are what a short script cannot afford.** That is far more
useful than a duration floor, because it says *what to drop* rather than *don't try*. A short reversal
is settle → turn → mechanism → escalate, in roughly 18–25 seconds.

**The cost is real, and worth naming:** without step 5, a short reversal can feel like a trick. Both
short sources compensate by staying rigorously quantitative through the turn — the numbers do the work
the generalisation would have done.

---

## 6. Making numbers felt

OBSERVED · every significant figure in EE is immediately converted to a scale the viewer already owns:

| Raw | Converted |
|---|---|
| NK economy, 26M people | *"an economy smaller than Vermont's"* |
| GNI ≈ $32bn/yr | *"less than what Woolworths turns over in the same period"* |
| $10bn export windfall | *"proportionally similar to the United States suddenly finding an extra 9 trillion dollars of foreign demand"* |
| 1.7M won/yr income | *"barely 3% of what the average South Korean earns"* |
| shipment volume | *"as much as half of all the artillery ammunition being fired by Russian forces in Ukraine"* |

INFERRED · the conversion is what turns a statistic into an argument. **A number without a comparison
is a number the script wasted.** Note also the *choice* of comparator carries editorial meaning —
"smaller than Vermont" and "less than Woolworths turns over" are both jokes about scale as well as
measurements.

**But numbers are not required at all.** MEASURED · MinuteEarth's *Blue Whales* contains **zero
numeric tokens** across 488 words and is a completely effective explainer, while MinutePhysics runs
**28.6 per 1k** on a comparable subject at comparable length. Numeric density is **entirely
subject-dependent** and must not be a parameter the UI asks a writer to set.

Where MinuteEarth gets concreteness instead: **physical imagery** — "hundreds of kilograms",
"lumbering leaf-eating vegetarians", "huge, slow-moving, easy-to-find swarms", "lunges back and
forth". Concreteness is the requirement; numbers are one way to buy it.

**The number ladder** (OBSERVED · MinutePhysics) is a third way: run the *same* measurement across
several conditions so the viewer learns the shape of a relationship rather than a fact — ice melts at
−4°C at 500× atm, −9°C at 1000×; then the whole ladder again for salt water. No analogy needed.

---

## 7. Analogy discipline

OBSERVED · EE uses exactly **three** analogies in 18 minutes, each spent on a step the viewer would
otherwise refuse to accept, each physical, each abandoned immediately after use:

- **Australia→Japan iron ore / "nobody ships pallets of cash across the Pacific"** (5:40) — why
  sanctioned states must barter.
- **The fridge factory** (8:30) — why inventory drawdown isn't production.
- **The US strategic petroleum reserve** (9:00) — that the rule is general, not anti-NK.

INFERRED · one analogy per hard mechanism; no extended metaphors; **at 1–3 minutes you get one — or
zero.** MEASURED · MinutePhysics uses **none at all** in 64 seconds and substitutes the number ladder
(§6); MinuteEarth uses exactly one, and places it at the *close*.

### The reverse analogy (OBSERVED · MinuteEarth, 2:01)

A standard analogy explains the unfamiliar with the familiar. MinuteEarth's runs **backwards**: having
explained krill swarms, it carries the new mechanism *back* into the domain the viewer already owns —
*"the equivalent on land would be if there were huge slow-moving swarms of grasshoppers that elephants
could munch on… the pachyderms could pack in even more calories and likely get even bigger."*

It **confirms** the rule instead of explaining it, by making a prediction. INFERRED · this only works
as a closing device, because it needs the viewer to hold both domains at once — which is only true at
the end.

---

## 8. The reframe close

OBSERVED · 17:00 — the ending does not summarise. It re-describes the whole video in one line the
viewer can repeat:

> *"We spend a lot of time on this channel talking about economies that borrow prosperity from the
> future by running up debts that their children will eventually have to pay back. North Korea has
> done the opposite. **It has borrowed prosperity from the past** … Either way, borrowed prosperity
> runs out."*

Then an open question — *"whether the lights dim again just as quickly as they came on"* — and out.

OBSERVED · Fireship's equivalent is the payoff-by-doing: the ending IS the demo completing, plus the
title callback (*"this has been brainf\*\*k in 100 seconds"*).

INFERRED · **write the closing line early, ideally alongside the hook.** Both are the same artifact:
the hook opens a gap, the close names what filling it taught you. A script whose ending is decided
last tends to end with a recap, which is the one ending both sources refuse.

---

## 9. Composing a script — the procedure

The order the studio's Script step should actually run. Note prose is written **last**.

1. **Find the tension.** What about this idea is counterintuitive, contested, or absurd? No tension →
   no video. ("Explain Bitcoin" has no tension. "Why does a currency nobody controls have any value?"
   does.)
2. **Pick the engine** (§2) from the shape of that tension.
3. **Write the question stack** (§3) — 2 questions for a short, 3 for a long. These are the acts.
4. **Draft the beat list, as one-line claims**, under each question. No prose yet.
5. **Run the but/therefore test** (baseline §1) on adjacent beats. Any "and then" pair is a defect:
   merge them, reorder them, or find the missing beat that makes one cause the other.
6. **Place the reversals** (§5) and check each has room to breathe (~60–90s).
7. **Assign the concretes** — one analogy per hard mechanism (§7), one scale-conversion per major
   number (§6), one sensory image per act.
8. **Write the hook and the closing line together** (§4, §8).
9. **Now write prose**, and only now apply the duration budget (Appendix A).
10. **Read it aloud.** Both sources are unmistakably *spoken* English.

**What must never happen: a single "generate script" button over a topic string.** Steps 1–8 are where
the quality is; a model handed only step 9 will produce the wiki timeline every time.

---

## 10. Anti-patterns

Detectable defects, drawn from what both sources conspicuously never do:

- **The wiki timeline** — beats joined by "and then". The primary failure. Test it mechanically.
- **The withheld answer.** Explanatory content is not a mystery. EE gives away its thesis at 1:00.
- **Facts with no owner question.** Every fact should be answering something already asked.
- **The unearned reversal** — "but actually, it's not that simple!" with no mechanism behind it.
- **Uncompared numbers** (§6).
- **The recap ending** (§8).
- **Two theses.** Both sources hold exactly one. EE explicitly refuses an adjacent one: *"we didn't
  want to repeat too much of that here."*
- **Explaining without implying.** A long stretch of mechanism with no reflection on what it means
  (baseline §4).
- **Housekeeping *before the hook*.** REFINED at n=4: MinuteEarth does say *"Hi, I'm David and this is
  MinuteEarth"* — but at **0:12, after the question is asked.** The rule is not "never introduce
  yourself", it is **nothing before the gap is open.** Three seconds of identity is affordable once
  the viewer wants something. Zero of the four sources open with housekeeping.

---

## 11. Humor is structural, not decorative

OBSERVED · both use humor and neither is comedy, and in both cases the joke **is carrying the
information**:

- Fireship: *"to get started, delete your operating system and install an Amiga OS"* — the absurdity
  IS the setup step. Removing the joke removes the instruction.
- EE: *"luxury residential precincts that share their name with intercontinental ballistic missiles"*,
  *"twin missile-shaped towers painted red, which is a level of on-the-nose symbolism you don't often
  get in urban planning"* — the joke IS the evidence of the regime's character.

INFERRED · **the humor rule: a joke may not occupy a beat of its own.** If deleting it deletes
information, it earned its place. This is why neither video feels like it is stopping to be funny.

---

## 12. What this means for the Script step's UI

The design payoff. This replaces the earlier draft's "tone dials" — those were measuring the paint.

1. **The step is a composition tool, not a text editor.** Its primary object is the **beat list**, and
   its primary affordance is *rearranging and re-linking beats*.
2. **Engine picker first** (§2). It determines the act template, the reversal count, the payoff shape.
3. **The question stack is an editable artifact** (§3), generated and approved *before* prose exists.
   This is the single highest-value surface in the step.
4. **Every beat displays its connector to the previous beat** — a literal `BUT` / `THEREFORE` /
   `AND THEN` chip. `AND THEN` renders as a **defect**, in the same visual language as an error, with
   the fix offered inline. This makes the one law of §1 into a UI invariant, and it is the feature
   that most distinguishes this product from a text box with an LLM behind it.
5. **Reversals are first-class beats**, marked, with a duration floor (§5) that warns when a reversal
   is being given 20 seconds.
6. **Concretes are slots, not prose** — analogy slots (§7), scale-conversion slots on every number
   (§6). Empty slots are visible.
7. **Hook and closing line are one paired surface** (§8).
8. **Duration arrives last**, as a budget spread across beats — see Appendix A. It constrains; it does
   not compose.
9. **Show where the viewer is.** If the tool can't render the act structure as a shape, neither the
   writer nor the viewer will know it.

---

## Appendix A — Delivery mechanics

Real, and genuinely secondary. Apply after composition, at step 9.

MEASURED, n=4 · MinuteEarth **197** · EE **206** · Fireship **221** · MinutePhysics **252** (essay
body; 230 across the full runtime). The previously ASSUMED ~230 ceiling is **exceeded** — the range is
**197–252 wpm**, and the top of it belongs to a dense, numerate, no-analogy script. Word budget
≈ `duration_s × wpm / 60`, so a 130-second video is **425–525 words** depending on engine. The editor
should count **seconds**, because the viewer does.

**Budget net of sponsor.** MEASURED · MinutePhysics is a "100-second video" whose essay is **64
seconds** — 35% is sponsor read. Any duration budget must be stated as essay time, not runtime.

**MEASURED — causal-opener density.** Sentences opening with a causal or additive connector: EE
(17:53) **24%** · MinutePhysics (1:40) **38%** · MinuteEarth (2:29) **40%**.

> **CORRECTED at n=10 (run 3):** this was first read as "density rises as length falls". Six more
> sources kill that — PolyMatter runs **38% at 8:04** and Basic Logic **15% at 5:01**. There is no
> length relationship. It measures **argumentative density** — how much a script derives rather than
> asserts — which is more useful, because it is a quality signal rather than a length rule. See
> [`ENGINES.md`](../../../../ENGINES.md) § Diagnostics.

MEASURED · EE sentence length: mean 22.0, median 21, max 62; 12% under 8 words, 38% over 25 — long
argumentative sentences punctuated by short ones that land the point (*"Neither is what you would call
a risk-free counterparty."*). Fireship's captions are ASR without punctuation, so its sentence rhythm
is **unmeasurable** from this corpus and is recorded as unknown.

MEASURED, and reinterpreted from the first draft — these are **consequences of the engine and the
subject**, never dials to set independently:

| | EE | Fireship | MinutePhysics | MinuteEarth |
|---|---|---|---|---|
| hedges /1k | 6.5 | **0.0** | **18.2** | 6.1 |
| connectives /1k | 14.6 | 2.1 | 13.0 | 14.3 |
| second person /1k | 6.2 | 16.9 | 23.4 | 2.0 |
| numbers /1k | 13.3 | 19.1 | 28.6 | **0.0** |

The spread is the point. Hedging tracks **how knowable the subject is** — Fireship's language spec is
fully knowable (0.0); MinutePhysics' ocean chemistry genuinely is not, and the script says so out loud
rather than faking a mechanism (*"for various reasons… for complicated reasons"*, 18.2). Numbers track
**whether the subject is quantitative**, not whether the format wants them. Setting any of these
independently of engine and subject produces incoherence.

---

## 13. Confidence and limits

- **n=4, one witness per engine.** Every engine claim still rests on a single video.
- **Three engines named; the taxonomy is still open.** §2 is INFERRED and probably incomplete.
- **Short-form Engine A is now MEASURED, not inferred** — two reversals in 64 seconds. The correction
  in §5 is the main result of the second research pass, and it is a warning about the method: a rule
  inferred by proportional compression from a long source was wrong by 3–4×. **Do not scale timings
  from long sources again; go measure a short one.**
- **Engine C has one witness and one length.** Whether a Parallel Case works at 18 minutes is unknown.
- **Both short sources are single-presenter science explainers** from adjacent channels (MinutePhysics
  and MinuteEarth share a lineage). They may share house habits that look like format rules.
- **Fireship's captions are ASR**; no sentence-level measurement is possible.
- **Retention figures** in the baseline's sources are vendor claims, not research.
- **We have not seen a single real production document** — no outline, no draft, no writers' room
  notes. Everything here is reverse-engineered from finished output, which shows what was decided but
  never what was rejected. See q6.

Open items with the source that would settle each: [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md).
