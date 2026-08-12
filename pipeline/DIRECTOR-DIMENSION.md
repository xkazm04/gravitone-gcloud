# The director dimension — capturing visual intent in text, inside the Script step

**Status:** design proposal, 2026-08-11. Nothing here is implemented. This document proposes changes
to `NOTEBOOK-SCHEMA.md`, the per-template `params.json` files and `app/_studio/projectTypes.ts`;
**it does not make them**, and the proposals are written so another session can apply them.

Read [`../knowledge/CRAFT-BASELINE.md`](../knowledge/CRAFT-BASELINE.md),
[`../knowledge/ENGINES.md`](../knowledge/ENGINES.md) and [`NOTEBOOK-SCHEMA.md`](NOTEBOOK-SCHEMA.md)
first. Evidence labels are the library's: **MEASURED · OBSERVED · INFERRED · ASSUMED**, plus
**EXTERNAL** for anything taken from outside our corpus.

---

## 0. The problem

The Script step currently produces a beat chain and prose. It produces nothing about what is on
screen — and three separate places in the library have already noticed the hole from three
directions:

- `short-form-clip/PATTERNS.md` §3 — MEASURED · 125 wpm vs 247 wpm inside one format, a 2× spread,
  caused entirely by whether the pictures argue or the words do. It concludes the Script step must
  emit **image-led / narration-led** as a mode and hand it to Frames.
- `mid-educational-video/PATTERNS.md` §6 and OPEN-QUESTION **m4** — 156→234 wpm on one format,
  "rate is a consequence of the visual plan, which the Script step does not yet know."
- `runs/2026-08-11-…/NOTES.md` change **#5** — the first real run "threw away obvious material (the
  mNAV chart, the price line, the reserve that isn't there)" and asked for `visual_candidates[]`.

Two of those are the *same* problem stated as a delivery-rate symptom. The Script step cannot resolve
its own word budget because it does not know what the picture is doing. That is the practical cost of
the missing layer, and it is why this belongs in Step 1 rather than being deferred wholesale to Step 2.

`short-educational-video/TEMPLATE.md` already states the intended output of step 01 as
*"idea → beat chain → spoken script **+ scene plan**"*. The scene plan has never been specified. This
document specifies it.

> **A correction to the brief that commissioned this.** The brief cites
> `short-educational-video/steps/01-script/PATTERNS.md` §1 as observing that "the script and the
> scene plan are written together, and visuals change faster than sentences." §1 of that file is
> *The engine: a chain of turns* and says neither thing. The "written together" claim traces to
> `TEMPLATE.md`'s step-01 line quoted above; **"visuals change faster than sentences" is not in the
> library at all.** It is asserted in §2 below as INFERRED, with the only supporting number being
> external. Recorded here because a design built on a misremembered citation is exactly the failure
> this library exists to prevent.

### The scoping decision

**In Step 1:** what each beat must *do to the viewer's eye*, and what real-world material exists to
do it with.

**Not in Step 1:** anything that depends on the creator's visual identity, on a rendering tool, or on
a camera. Prompt-to-image generation and visual identity are later steps by the owner's explicit
instruction, and §7 makes the exclusion strict rather than vague.

**Why anything at all is in Step 1**, rather than all of it in Frames: because three things in the
Script step are *already* decided by the visual plan and cannot be written correctly without it.

1. **The word budget.** Established above, MEASURED, a 2× error.
2. **The analogy budget.** `short-educational-video/PATTERNS.md` §7 — one analogy per hard mechanism,
   one or zero at short length. An analogy is a *picture* as much as a sentence. A script that spends
   its one analogy in prose and then a Frames step that invents a second visual metaphor has broken
   the rule without either step noticing.
3. **Whether the beat is possible at all.** A beat whose only honest visual is an absence, or whose
   evidence is a chart we do not have, is a beat that may need rewriting. Discovering that in Step 2
   means rewriting a finished script.

Everything else — how many stills, how they are framed, what they look like — is genuinely downstream
and is left alone.

**EXTERNAL corroboration for the split.** Film pre-production draws the same line: a *beat board* is
"concept art before the concept art", organising story beats at a conceptual level, while the
storyboard and shot list are the operational documents that follow it
([CG Channel](https://www.cgchannel.com/2021/06/discover-how-to-create-beatboards-for-pre-production/),
[Final Draft](https://www.finaldraft.com/blog/what-is-a-beat-board-anyway),
[Storyflow](https://storyflow.so/blog/storyboard-vs-shot-list-complete-guide)). What this document
proposes is a beat board written in text. Step 2 is the storyboard.

---

## 1. The unit

**The unit of the director layer is the beat. The atom is a visual obligation attached to it.**

Rejected alternatives, with reasons:

- **Shot.** Fails the §7 test immediately — a shot presumes a camera or a renderer, a duration and a
  frame. `app/_studio/scenes.ts` is full of Step-2/3 vocabulary of exactly this kind ("low angle from
  the rails", "rack focus from glass plan to skyline", "drone top-down"). None of it can be written
  before the visual identity exists.
- **Scene.** A scene is a *packing* unit — a run of screen time that shares a setting or an asset.
  Which beats share a scene is a Step-2 decision, and committing to it in Step 1 fixes the still count
  before anyone knows what the stills are. It is also the wrong shape for an explainer: the app's
  `Scene` has `slug: "EXT. PIER 7 — NIGHT"`, `mood`, and `lines[]` with speakers, which is screenplay
  furniture for the fiction fixture (Glass Harbor) and has no meaning for a Bitcoin explainer.
- **A field on the sentence.** Too fine. Sentences are a prose artifact written at step 9 of the
  composition procedure; the director layer must survive a re-render in a different tone, which
  rewrites every sentence and no beat (`TONE.md` §3).

### The cardinality: beat → 1..n images → scenes

**INFERRED · a beat carries one visual *function* and one-to-many *images*.** The function is
singular by design (see §2's one-function rule); the image count is not.

The only number available is external and secondhand: Kurzgesagt illustrate **~200 panels per video**
across an 8–12 week illustration process
([10 Studio](https://10.studio/the-incredible-amount-of-work-behind-kurzgesagts-beautiful-animated-videos/),
[Medium write-up](https://medium.com/@savytecharticles/animated-video-production-how-kurzgesagt-videos-are-made-and-why-they-are-so-fascinating-f2b8a8abe0a3)).
At their typical 8–10 minutes that is roughly **one panel every 2.5–3 seconds**, against a corpus
sentence mean of 22 words / ~7 seconds (MEASURED, Economics Explained). If that ratio is anywhere
near right, the picture changes **2–3× per sentence** in densely visual work. EXTERNAL, one channel,
from a secondhand blog post, and the panel count includes reused and layered panels — treat it as
directional, not as a target.

That is enough to settle the design question: **beat and scene are not 1:1, and Step 1 must not
assume they are.** The director layer names obligations; Step 2 decides how many pictures discharge
them and how they group.

```
Step 1  beat  ──▶  visual { function, subject, shows[], thread }
                        │
Step 2                  ├──▶ still  ┐
                        ├──▶ still  ├── packed into scenes, count decided here
                        └──▶ still  ┘
```

The reverse direction also happens and must be legal: **several beats can share one image.** A
mechanism diagram established at one beat and modified at the next two is one asset with three
states, not three assets — which is what the `thread` field in §4 exists to express.

---

## 2. The vocabulary of visual functions

Seven functions, plus modifiers. The test each one has to pass: *does labelling a beat with this
change what Step 2 must produce?* A category that does not change the downstream obligation is
description, not design, and has been cut.

| Function | The picture's job | Removing it costs | Corpus witness |
|---|---|---|---|
| **evidence** | the picture *is* the proof — a document, a series, a photograph, a quantity | the claim degrades to assertion | OBSERVED · PolyMatter *Target*: the photographs **are** the argument, narration only labels them (`short-form-clip/PATTERNS.md` §3) |
| **comparison** | two quantities or states placed side by side so the relation is *seen* | the number stays abstract | OBSERVED · MinutePhysics' number ladder — the same measurement across conditions, "no analogy needed" (`short-educational-video/PATTERNS.md` §6) |
| **mechanism** | a process with parts, drawn so the viewer can follow it | the viewer is told a verdict instead of shown a derivation | OBSERVED · Fireship *100 Seconds* spends 33% of runtime on memory cells being incremented — the tape is the mechanism, drawn |
| **metaphor** | a physical stand-in for an abstraction | the abstraction stays abstract (`CRAFT-BASELINE` §6) | MEASURED · Fireship *Big O*: one deck of cards carries five complexity classes. EXTERNAL · Kurzgesagt describe storyboarding as the stage where they "think up visual metaphors" |
| **reveal** | the picture withholds, then delivers; the turn is *seen* | the reversal lands only in the voice | OBSERVED · PolyMatter *Target* — the reveal is a cut, not a sentence |
| **state-change** | the *same* picture, modified — imposes continuity on Step 2 | the change reads as a new subject | INFERRED · no frame-level witness; motivated by the reversal anatomy's "escalate once" step |
| **texture** | the picture is not arguing; it holds the screen | nothing — that is the point, and saying so is the value | MEASURED · Fireship spends 12% of a mid-length video on material that advances no beat (`mid-educational-video/PATTERNS.md` §3) |

### Why these seven and not the six in the brief

The brief proposed *evidence · metaphor · reveal · comparison · state-change · texture*. Two changes:

- **`mechanism` added.** The reversal anatomy's step 3 is "give the mechanism, not the verdict"
  (`short-educational-video/PATTERNS.md` §5), and `NOTEBOOK-SCHEMA.md` already stores mechanisms as
  first-class objects with pre-linked chains. Folding a drawn process into `metaphor` would lose the
  distinction that matters most in production: a mechanism diagram is built from the *subject's* real
  parts, a metaphor is built from something else entirely. They cost different work and they fail
  differently.
- **`absence` rejected as a function, kept as a modifier.** The brief's material — "the reserve that
  isn't there" — is evidence-shaped: you show the empty ledger, the unfilled column, the count nobody
  can agree on. It is `function: evidence` with **`negates: true`**. Making it a top-level function
  would put a *rhetorical* property in a vocabulary that is otherwise about production obligations.
  The flag still earns its place, because an absence is the visual most likely to be silently dropped
  by a downstream step that cannot render it. See d8.

### The one-function rule

**A visual carries exactly one function. A beat that needs two is two beats.**

This is deliberately the same shape as the library's one law: `AND THEN` between beats is a defect
that means the beats have no causal relation; **two functions on one visual is a defect that means
one beat is doing two jobs.** In the worked example (§5) this fired three times and each time the
split improved the beat list — b10/b11 (the turn and the mechanism that earns it) and b29/b30 (the
risk model and what happens to it) were each one beat in the prose and are two obligations on screen.

### Texture's three sub-roles

`texture` is the function that would otherwise become a dumping ground, so it carries a required
sub-role and the sub-roles are not interchangeable:

- **`hold`** — *do not change the picture.* A negative instruction, and a real one: b6 and b28 in the
  worked example are the two most important sentences in the video and the correct direction for both
  is that nothing on screen competes with them.
- **`navigation`** — where the viewer is in the structure. `short-educational-video/PATTERNS.md` §12
  point 9: "if the tool can't render the act structure as a shape, neither the writer nor the viewer
  will know it."
- **`atmosphere`** — persona, digression, b-roll. This is the one with a budget: ~10% ceiling,
  disabled for Adjudication (`mid-educational-video/params.json § digression`).

**Anti-shape: texture as a default.** A generator that assigns `texture/atmosphere` to any beat it
cannot picture produces a stock-footage video, and it will do so silently. Texture must always be
*chosen*; a beat with no picture and no choice is `unresolved` (§6), never texture.

---

## 3. Which beats need what

Derived from the beat roles the library already names. The **required** column is an obligation on
the Script step, not a suggestion — a beat in that role with a different function is a review item.

| Beat role (library) | Required function | Why |
|---|---|---|
| hook — contradiction shape | **evidence** | `short-form-clip/params.json` defines this hook as "assert something the picture denies". It is *constituted* by a visual; a contradiction hook with no picture is not that hook. |
| hook — scenario / stake shape | evidence or texture/atmosphere | the words carry it; the picture places the viewer |
| promise / question stack | texture/**navigation** | the act structure made visible |
| obvious reading ("settle") | evidence, **`generous: true`** | `NOTEBOOK-SCHEMA` says `obvious_reading` "must be stated generously — a strawman here produces a strawman on screen". The picture inherits that obligation: an unconvincing chart is a strawman. |
| turn / reversal | **reveal** or **state-change** | the turn must be visible. Which one depends on continuity: a reveal introduces, a state-change modifies something already established. |
| escalation | **state-change** on the turn's image | "more of the same, worse" is the same picture, further along |
| mechanism | **mechanism** | mechanism-not-verdict, drawn |
| analogy | **metaphor** | and it spends the analogy budget — see §3.1 |
| scale conversion | **comparison** | inherently visual. A conversion is *by construction* two things placed against each other; this is the one row where the beat type and the function are the same object. |
| steel-man | any function, **`register: "shift"`** | the change of stance must be seeable. INFERRED, weakest claim in the document — see d3. |
| digression | texture/**atmosphere** | by definition; counts against the 10% budget |
| sponsor | outside the visual plan | excluded from the essay budget, so excluded here |
| reframe close | **`register: "reprise"`** of an earlier thread | `CRAFT-BASELINE` §8: the ending re-describes rather than summarises. The visual form of a re-description is *the same picture, new sentence*. INFERRED — see d5. |

### 3.1 The analogy budget is a visual budget

`short-educational-video/PATTERNS.md` §7 caps analogies: one per hard mechanism, one or zero at ≤3
minutes, "each abandoned immediately after use". **The cap counts `metaphor` visuals, not prose
analogies**, and this is a real change: a beat that carries no verbal analogy but whose picture is a
metaphor has spent from the same budget. Under this rule the reversal-chain render (§5) spends
exactly two, both prose-and-picture together, and its third notebook candidate ("the party") is
correctly dropped rather than smuggled in as an image.

Corollary, and the strongest reason this layer belongs in Step 1: **Frames cannot enforce a budget it
cannot see.** A Frames step handed 34 beats with no functions will invent metaphors for the hard ones,
because that is what makes a good picture, and it will silently blow a cap the Script step was
carefully respecting.

---

## 4. Image-led vs narration-led — derived, not chosen

`short-form-clip/params.json` currently has `visual_mode.required_field: true`, i.e. the writer sets
it. **This proposes changing it to a derived value**, on the authority of `TONE.md` §2:

> "if a property is decided by the subject or the engine, the tool computes it and shows it. Only
> what remains is a dial."

The mode is decided by how much of the argument the pictures are carrying, which is exactly what the
function assignment records. The derivation:

```
load_bearing = beats whose function ∈ {evidence, comparison, mechanism, metaphor, reveal, state-change}
texture      = beats whose function = texture
mode         = image-led    if load_bearing / total ≥ ~0.6
               narration-led otherwise
```

The threshold is **ASSUMED** — a round number chosen to sit between the two MEASURED anchors
(PolyMatter *Target*, essentially all load-bearing, 125 wpm; Fireship *Big O*, narration-led, 247 wpm)
and calibratable the moment d4 is run. The mode then constrains the word budget, and the constraint is
the MEASURED 2× spread the library already holds.

**Per-video or per-beat?** Per video, with a per-beat override that is a *writing* instruction rather
than a mode.

- **Per video**, because rate is a delivery property. A narrator who changes speed by 2× mid-video
  sounds broken, and `TONE.md` treats rate as one profile per creator × format.
- **Per beat**, a `led: "image"` override inside a narration-led video means one thing only: *write
  fewer words here and let the picture land*. It is the mechanism by which a chart passage inside a
  talking video gets room. It does not change the video's rate; it moves words between beats. The
  reverse override (`led: "narration"` inside an image-led video) means the opposite and is how an
  unresolvable visual (§6) is paid for.

**What this hands back to m4.** OPEN-QUESTION m4 asks how rate resolves against visual density and
concludes it is "properly the first question of the 02-frames step". This proposal disagrees, on the
grounds that the Script step cannot write to a word budget it will only learn later: the *density* is
knowable at Step 1 from the function mix, even though the *still count* is not. m4 becomes a
calibration question (d4) rather than a blocking dependency.

---

## 5. Worked example — the full reversal-chain render

`runs/2026-08-11-why-bitcoin-price-does-not-rise/script--reversal-chain.md`, all 34 beats. Threads are
named in `SMALL-CAPS-STYLE`; `⟨…⟩` marks the honesty state where one applies. Every `shows` entry
that has no notebook material is flagged, and §5.3 collects those into the run's actual output.

This is written as a director would: it commits. Where it commits on thin evidence it says so.

### 5.1 The beats

| # | Beat (abbreviated) | Role | Function | Shows | Thread | Notes |
|---|---|---|---|---|---|---|
| b1 | "6 Oct 2025, Bitcoin hit $126,198. The highest in its history." | hook · situation | evidence | the price series, ending at the high | `PRICE-LINE` establish | ⟨material-missing⟩ `research_gaps`: "no price series". Confidence high on the number, but we do not hold the series. |
| b2 | "it has received almost everything it asked for" — SBR, GENIUS Act, regulators replaced, spot ETFs, retirement accounts | hook · complication | evidence | **five discrete exhibits**: the executive order, the bill, the leadership change, an ETF ticker, a 401(k) statement | `WISHLIST` establish | The cardinality argument in the flesh: one sentence, five images. b2 alone probably outruns a beat:image assumption of 1:1. |
| b3 | "Every single item on the wish list. Delivered." | hook · complication | state-change | the five exhibits gathered and struck through complete | `WISHLIST` change | State-change without a chart — it is the *same five objects*, re-composed. |
| b4 | ⟨scale conversion⟩ "in that same ten months, Bitcoin lost roughly half its value" | hook · the turn into the question | reveal + state-change → **split into b4a/b4b** | b4a: `PRICE-LINE` returns, continues past the high, falls. b4b: the wishlist and the line held together | `PRICE-LINE` change; `WISHLIST` carry | The one-function rule fires. The **most important image in the video** and it is a *continuation of a picture already shown* — the argument for state-change as a first-class function. Precision limit: draw as a proportion, never an axis with a current price (`unknowns`: "never a precise figure"). |
| b5 | "So what went wrong?" — the only question asked aloud | question | texture/**hold** | nothing new | — | The direction is a prohibition. |
| b6 | "Nothing went wrong. That is the problem." | the answer, at 0:40 | texture/**hold** | nothing new | — | The thesis sentence. Whatever a creator's title-card language is, it belongs here and it is Step 2's to design; Step 1 says only *do not compete*. |
| b7 | the promise — three topics in one breath | promise | texture/**navigation** | the three movements as a shape | `NAV` establish | Reprised at each movement boundary. |
| b8 | "the ETFs were supposed to be the whole thesis… the inflows have been real" | movement 1 open | evidence | cumulative ETF inflow, positive | `ETF-PIPE` establish | High confidence. |
| b9 | ⟨obvious reading, generous⟩ "More demand, same fixed supply, higher price. That is not a stupid model." | settle | evidence, **`generous: true`** | the naive model drawn so it looks *right* | `ETF-PIPE` carry | The strawman rule, transposed. If this picture looks foolish, turn 1 is unearned. |
| b10 | ◀ **TURN 1** "an inflow into an ETF is not the same thing as somebody buying Bitcoin" | turn | **reveal** | the pipe, and the money not arriving at the far end | `ETF-PIPE` change | |
| b11 | authorised participants create and short shares before buying the underlying | mechanism | **mechanism** | the AP loop: creation, short, lagged purchase | `ETF-PIPE` carry | Confidence **medium** — `f-etf-lag` is "mechanism reported by one analyst". The diagram must not look more settled than the source. |
| b12 | ⟨analogy 1 of 2⟩ "The inflow is a booking, not a meal." | analogy | **metaphor** | full reservation book / empty dining room | `BOOKING` establish + retire | Spends analogy 1. Notebook rates it *medium* — "the shorting mechanism is not fully captured", so the picture must not be asked to carry the shorting. **Must not reuse `ETF-PIPE`'s visual language**, or the metaphor reads as part of the mechanism. |
| b13 | "when the buying does arrive, somebody is waiting to meet it" | escalation | state-change | a seller on the far side of the pipe | `ETF-PIPE` change | |
| b14 | ⟨scale conversion⟩ 3.67m BTC distributed into the $100–126k range — larger than any previous cycle | evidence · escalation | **comparison** | this cycle's distribution against prior cycles | `ETF-PIPE` carry | Confidence **medium**, single aggregator, contradicted elsewhere in the notebook. **Precision limit: no axis ticks, no exact bar heights.** See §5.2. |
| b15 | "The ETF was not a wave lifting the boat. It was an exit." | movement close | texture/**hold** | nothing new | — | Reads like a metaphor invitation; the budget is spent and the notebook offers no candidate. Declining it is the discipline. |
| b16 | the treasury companies; Strategy made "we never sell" a public identity | movement 2 open | evidence | the primary artifact of the claim — the statement itself | `NEVER-SELL` establish | ⟨material-missing⟩ notebook has the claim, not the artifact. The beat is much stronger with the actual quote. |
| b17 | ⟨mechanism⟩ mNAV > 1 → issue shares → buy Bitcoin → accretive → price-insensitive buyer | mechanism | **mechanism** | the flywheel, turning | `FLYWHEEL` establish | The notebook's `m-treasury-flywheel` chain is already the panel order. |
| b18 | ⟨analogy 2 of 2⟩ "borrowing against your house to buy another house" | analogy | **metaphor** | the two houses | `HOUSE` establish + retire | Spends analogy 2. Notebook rates it *strong — physical, familiar, carries the reversal*, so unlike b12 this metaphor **may** carry the turn. |
| b19 | ◀ **TURN 2** "the machine only turns in one direction" — below mNAV 1, issuing destroys value | turn | **state-change** | the same flywheel, seizing | `FLYWHEEL` change | The archetype. Step 2 must render **the same asset twice**; that is a continuity constraint, not a style note, and it is the reason state-change is not folded into reveal. |
| b20 | ⟨scale conversion⟩ mNAV 3.89 → below 1.0; MSTR −70%; $12.4bn Q4 loss | evidence | **comparison** | one line crossing the 1.0 threshold | `MNAV` establish | Confidence high (`f-mnav`). The threshold crossing *is* the image; the −70% and the loss are captions, not two more charts. |
| b21 | "in June of this year, Strategy sold thirty two Bitcoin" | the payoff | evidence, **small** | thirty-two coins | `NEVER-SELL` change | **The direction is that the picture must be small.** Drawing this as a chart destroys the beat, whose whole force is that the quantity is trivial. A Frames step optimising for impressive imagery will get this exactly wrong unless told. |
| b22 | ⟨scale conversion⟩ "about two million dollars, from a company holding billions… As a sentence — *Strategy sold Bitcoin* — it ended the thing the model was built on" | scale conversion | evidence | **the sentence itself**, as the artifact | `NEVER-SELL` change | The notebook says it outright: "the number is meaningless; the sentence is not." The referent here is language, and that is legal — b16's claim, now negated. |
| b23 | ⟨**STEEL-MAN**⟩ not forced sellers: 2.5 years of coverage, the $8k claim; long-term holders *added* 380k BTC after the crash | steel-man | evidence, **`register: "shift"`** | the coverage, the accumulation | `COUNTER` establish | The stance changes and it must be seen to change. **What "shift" concretely means is Step 2's call** — Step 1 only asserts the obligation. INFERRED, no witness; d3. Confidence medium and the two on-chain figures may not be comparable (`unknowns`) — **the two charts must not be drawn on one axis**, or the picture asserts a comparison the notebook explicitly refuses. |
| b24 | "not a story about Bitcoin dying — a story about a mechanism changing direction" | synthesis | texture/**hold** | nothing new | `COUNTER` retire | |
| b25 | "on paper the politics could not have gone better" — the March 2025 executive order | movement 3 open | evidence | the order, the fact sheet | `RESERVE` establish; `WISHLIST` reprise | High confidence, primary source (whitehouse.gov). One of the few beats with material we actually hold. |
| b26 | ◀ **TURN 3** "sixteen months later, the reserve still is not built"; agencies cannot agree how much the US owns | turn | reveal, **`negates: true`** | the reserve that is not there — the count nobody agrees on | `RESERVE` change | ⟨unresolved⟩ Function known, image not. **Impact, stated as the script consequence:** if Frames cannot render an absence, this beat becomes narration-led and needs roughly +15 words to carry alone. This is the `negates` modifier's whole reason to exist — the beat NOTES.md named as thrown away. |
| b27 | "even where the policy landed, the price fell anyway. Regulatory permission is not demand." | turn · consequence | **comparison** | the policy wins marked onto `PRICE-LINE` — the two diverging | `PRICE-LINE` reprise; `WISHLIST` retire | The hook's image returns, now annotated. The strongest single frame in the video on this reading, and it is a *reprise*, not a new asset. |
| b28 | ◀ **TURN 4** "So institutional adoption failed? No. It succeeded completely. **That is what did this.**" | turn · thesis | **reveal** | *less* — strip the frame back | — | The reveal is a **subtraction**. Naming that as legal matters: b28 needs both "the turn must be seen" (§3) and "do not compete with the thesis" (b6's logic), and removal satisfies both. |
| b29 | ⟨mechanism — the thesis⟩ institutions size, hedge and rebalance; conviction becomes a position | mechanism | **mechanism** | Bitcoin as one sized sleeve among many in a portfolio | `PORTFOLIO` establish | The notebook marks `m-institutionalisation` "This is the video." It is also the one mechanism marked `needs_analogy: false` — so it gets a diagram and no metaphor, which is fortunate, because the budget is spent. |
| b30 | yields climb to 4.5% and 5%; "Bitcoin was sold. By people rebalancing a risk book." | mechanism · consequence | **state-change** | the sleeve cut | `PORTFOLIO` change | Yields are high-confidence and dated; drawing them is legal. Causation is not — `unknowns`: "phrase as *moves with*, not *because of*". **A picture that puts an arrow from yields to price asserts the causation the prose refuses.** No arrow. |
| b31 | ⟨scale conversion⟩ 0.70–0.80 Nasdaq correlation; "a technology stock with extra steps"; it moves on the 10-year yield | evidence | **comparison** | BTC and Nasdaq overlaid | `PORTFOLIO` carry | ⟨material-missing⟩ we hold no series for either. Confidence medium; draw as a band (0.70–0.80), never a single figure. |
| b32 | "Bitcoin spent fifteen years arguing it was an escape from the financial system" | close | texture/**hold** | nothing new | — | |
| b33 | "the prize for winning was being absorbed into the thing it was escaping from" | close | **state-change** | the line settling into the bundle | `PORTFOLIO` change | The notebook's third analogy candidate ("invited to the party") is *declined* — rated medium, "consider dropping, the thesis may be stronger unadorned", and the budget is spent. The state-change does the job without spending anything. |
| b34 | "The price isn't broken. The story is." | reframe | **`register: "reprise"`** — evidence | `PRICE-LINE`, **unchanged**, exactly as at b1 | `PRICE-LINE` reprise + retire | The visual form of a reframe: the same picture, a new sentence for it. Which is what `CRAFT-BASELINE` §8 asks the *words* to do. INFERRED; d5. |

**Totals.** 34 beats → 35 visual obligations (b4 splits) → **7 threads** (`PRICE-LINE`, `WISHLIST`,
`ETF-PIPE`, `FLYWHEEL`, `NEVER-SELL`, `RESERVE`, `PORTFOLIO`) plus three retired-on-use metaphor
threads. Function mix: evidence 11 · comparison 5 · mechanism 4 · state-change 7 · reveal 3 ·
metaphor 2 · texture 8 (7 `hold`, 1 `navigation`, **0 `atmosphere`**).

### 5.2 Three findings the layer produced that the script alone did not

**1. The render is over-written for its own visual plan.** Load-bearing 27 of 35 = **77%**, well over
the §4 threshold — this is an image-led video. It was written at **190 wpm, 947 words**. Image-led
work in the corpus runs 125–176 wpm. **INFERRED · at 150–170 wpm the same five minutes is 750–850
words, so the render is roughly 10–20% over-written** and, produced as directed above, the narration
would trample the pictures. This is a concrete, falsifiable claim about a finished script that could
not be made before this document existed, and it is the practical case for the whole layer.
Caveat: the wpm mapping has n=2 anchors, and the claim is only as good as d4.

**2. Zero atmosphere, and that is a defect, not a virtue.** `mid-educational-video/PATTERNS.md` §3
allows ~10% digression at this length. This render has none, which is consistent with NOTES.md's own
finding that "no humour anywhere" is a schema gap — and the two are the same gap seen twice. The
places a picture could carry a joke without spending a beat are visible in the table (b21's thirty-two
coins; b26's reserve nobody can count) and they are exactly the two NOTES.md named.

**3. A chart is a precision claim — the laundering rule.** NOTES.md #3 records that a
low-confidence vendor figure "nearly got laundered" and was caught by the schema's `confidence` field.
**A picture launders confidence the same way and has no such field.** A medium-confidence figure from
one aggregator, drawn as a crisp bar chart with axis ticks, states more than the prose is allowed to.
Three beats above are affected (b11, b14, b23) and one is worse than laundering: b23's two on-chain
figures are recorded in `unknowns` as possibly non-comparable, so drawing them on a shared axis
**asserts a comparison the notebook explicitly refuses**. Hence `confidence` and `precision_limit` are
required fields on evidence and comparison visuals (§6), and the rule:

> **The picture may never be more precise, more certain, or more causal than the fact it draws.**
> Fact confidence propagates to the visual. An arrow is a causal claim; an axis is a precision claim.

### 5.3 What run 1 actually produced: a research shopping list

Five `material-missing` entries, which is the run's most useful output and the thing NOTES.md #5 was
reaching for. Note that `research_gaps` **already contains the first one** — "No price series — a chart
would settle the price ambiguity and give the Frames step real material" — which is corroboration that
this is the right shape for the field.

| Material | Beats | Why it matters |
|---|---|---|
| BTC daily close, Jan 2025 – Aug 2026 | b1, b4, b27, b34 | four beats and the video's opening and closing image, all on one series |
| Strategy's "never sell" statement, primary | b16 | the payoff at b21–b22 is worth double with the original claim on screen |
| MSTR mNAV series | b20 | high-confidence fact, no series held |
| BTC vs Nasdaq series | b31 | the thesis beat's evidence |
| An image for a reserve that does not exist | b26 | `no-referent`, not `material-missing` — research will not fix it; either Frames invents or the beat is rewritten |

---

## 6. The proposed schema

**Proposal only.** Do not apply these edits from this document — `NOTEBOOK-SCHEMA.md` and the
`params.json` files may be under concurrent edit.

The layer splits across two artifacts, and the split is the design decision (§6.3).

### 6.1 Notebook — `visual_candidates[]` (durable material)

Claimed by NOTES.md change #5; this specifies the shape. The name is slightly wrong — half of these
are obligations rather than candidates — but it is already written down and renaming costs more than
it returns.

```json
"visual_candidates": [
  {
    "id": "v-price-line",
    "what": "Bitcoin daily close, Jan 2025 – Aug 2026",
    "kind": "series",
    "supports": ["f-ath", "f-nov-crash", "f-drawdown"],
    "exists": "yes-not-held",
    "source": null,
    "confidence": "high",
    "precision_limit": "Draw as a proportion of the high. Sources disagree by ~$5k on the current level — no current-price label, no fine y-axis.",
    "as_of": "2026-08-10"
  },
  {
    "id": "v-reserve-absence",
    "what": "The Strategic Bitcoin Reserve that was never built",
    "kind": "none",
    "supports": ["f-sbr-unbuilt"],
    "exists": "no",
    "confidence": "high",
    "precision_limit": null,
    "note": "There is nothing to photograph. Federal agencies disagree on the holding; the disagreement is the only depictable object."
  }
]
```

| Field | Why it exists |
|---|---|
| `kind` | `series · document · artifact · photograph · quantity · statement · none` — what *sort* of thing it is, which is what tells Frames whether it can be sourced, drawn or must be invented |
| `supports[]` | fact ids. **The join that makes confidence propagate** — no separate confidence bookkeeping |
| `exists` | `yes-held · yes-not-held · no`. The three-way distinction §6.4 depends on |
| `precision_limit` | the laundering rule (§5.2), stated once next to the material rather than repeated per beat |

### 6.2 Script beat — the `visual` block (disposable intent)

```json
{
  "id": "b14",
  "role": "escalation",
  "connector": "AND",
  "text": "…3.67 million Bitcoin into the hundred-to-a-hundred-and-twenty-six-thousand range…",
  "visual": {
    "function": "comparison",
    "subject": "this cycle's distribution against every previous cycle",
    "shows": [{ "ref": "v-lth-distribution", "note": "prior cycles alongside, same scale" }],
    "thread": { "id": "ETF-PIPE", "op": "carry" },
    "negates": false,
    "generous": false,
    "small": false,
    "register": "continue",
    "led": "inherit",
    "confidence": "medium",
    "precision_note": "Single aggregator. No axis ticks, no exact bar heights.",
    "unresolved": null
  }
}
```

```json
"unresolved": {
  "state": "unresolved",
  "why": "The function is a reveal that negates. Nothing in the notebook depicts a thing that does not exist.",
  "impact": "If Frames cannot render an absence, this beat becomes narration-led and needs ~+15 words."
}
```

**Invariants a validator should enforce:**

1. `function` is always present. There is no null function — a beat with no picture is
   `texture/hold`, which is a *decision*.
2. Exactly one `function` (§2). Two ⇒ split the beat.
3. `shows` empty ⇒ `unresolved` present. And the converse: a resolved visual with no referent is a
   silent blank, the same anti-shape `CaptionStatus.failed` exists to prevent in `app/_studio/types.ts`.
4. `unresolved.impact` is required, mirroring `NOTEBOOK-SCHEMA` rule 5 — an unknown with no
   consequence for the script is a note, not a constraint.
5. `thread.op ∈ establish · carry · change · reprise · retire`. `change` and `reprise` require an
   earlier `establish` on the same thread id. `function: "state-change"` **requires** `op: "change"`.
6. `confidence` and `precision_note` required when `function ∈ {evidence, comparison}` and `shows`
   is non-empty. `confidence` may not exceed the minimum confidence of the facts its `shows` support.
7. `metaphor` count across the render ≤ the template's analogy cap (§3.1).
8. `texture` requires a sub-role. `atmosphere` counts against the digression budget and is rejected
   outright for Adjudication.

### 6.3 Video level — `visual_plan`, all derived

```json
"visual_plan": {
  "derived": true,
  "mode": "image-led",
  "load_bearing_pct": 77,
  "function_mix": { "evidence": 11, "comparison": 5, "state-change": 7, "mechanism": 4,
                    "reveal": 3, "metaphor": 2, "texture": 8 },
  "wpm_range": [150, 176],
  "word_budget": [750, 880],
  "actual_words": 947,
  "threads": ["PRICE-LINE", "WISHLIST", "ETF-PIPE", "FLYWHEEL", "NEVER-SELL", "RESERVE", "PORTFOLIO"],
  "unresolved": { "unresolved": 1, "no-referent": 1, "material-missing": 4 },
  "atmosphere_pct": 0
}
```

Nothing in this block is user-editable. It is the "computed and shown" half of `TONE.md` §2, and the
`actual_words` vs `word_budget` disagreement above is the §5.2 finding rendered as a number the UI can
put a warning next to.

### 6.4 Why here and not elsewhere

**Rejected — a parallel `scene_plan[]` array.** It desynchronises. Renders reorder, merge and drop
beats — run 1's own adjudication render reshaped the same notebook's material substantially — and an
array indexed by position rots the first time that happens. A beat that has silently acquired another
beat's visual is worse than a beat with none, because nothing announces the error.

**Rejected — a separate artifact between Script and Frames.** It is a handoff document, and handoff
documents are maintained until the first deadline. It also contradicts the library's own position
that step 01 emits "spoken script + scene plan" — one artifact, written together.

**Rejected — the notebook alone.** The notebook must survive every engine (`NOTEBOOK-SCHEMA` rule 1),
and *function is engine-specific*. The mNAV series is `evidence` in the Reversal Chain and would be a
weighed exhibit under a candidate in the Adjudication. Storing intent in the notebook locks it to one
engine, the exact failure "no prose" already guards against.

**Chosen — both, split by durability.** Material in the notebook, intent on the beat. The split falls
out of the pipeline's one design decision: *the notebook is the asset, the script is a render.*
Researching a chart is expensive and reusable; deciding what a beat does with it is cheap and
disposable.

**The cost, stated.** Intent is thrown away on every re-render, so a creator who re-renders a script
after directing it loses that work. Three mitigations, in order of honesty: (a) the expensive half —
finding the material — is preserved; (b) `thread` names are stable across renders because they name
subjects, so an incremental re-render can re-attach; (c) it is genuinely correct to lose it, because a
new engine wants different functions and inheriting the old ones would produce a Reversal Chain's
pictures under an Adjudication's argument. **d6 tests whether (c) is true or is a rationalisation** —
and it is cheap to run.

---

## 7. What must NOT be in Step 1

Three tests. A director note must pass all three.

1. **The medium test** — *would this still be right if the video were animated by hand, or shot on a
   camera?* Every §5 entry passes; "the picture must be small" (b21) is a note a cinematographer, an
   illustrator and a diffusion model can all act on.
2. **The stranger test** — *could a researcher who has never seen this creator's channel write it?*
   If not, it is identity, not direction.
3. **The next-year test** — *would it still be right when the model is replaced?* Anything that would
   not is prompt engineering.

Excluded, specifically:

| Excluded | Belongs to | Note |
|---|---|---|
| model-specific prompt syntax, aspect flags, negative prompts, seeds | Frames | fails test 3 |
| model names (`imagen-3`, `veo-3`) | Frames / Motion | already correctly on `FrameCandidate.model` |
| palette, typeface, illustration style, grain, character design, logo furniture | visual identity, later step | fails test 2 — and `TONE.md`'s reference world is the *verbal* sibling of this and is explicitly a step-9 input |
| shot size, angle, composition | Frames | `FramesLightbox`'s `SHOT_SIZES` / `PALETTES` controls are in the right place already |
| camera or animation movement — "push in", "rack focus", "orbit" | Motion | `Clip.motionPrompt` is the right home |
| transitions, cuts, dissolves | Cut | |
| number of stills, per-image duration | Frames | Step 1 owns beat seconds only |
| choosing *which* of three candidate images wins | Frames | Step 1 names the obligation, not the winner |

**One deliberate borderline, and the reason for it.** Naming a *specific* artifact — the White House
fact sheet, Strategy's actual statement — looks like Step-2 asset selection but belongs in Step 1,
because it is a **research finding**, not a design choice. The test that separates them: *does
substituting a different artifact change what the beat proves?* For the fact sheet, yes — a generic
photograph of a government building proves nothing. For "a chart of the price", no — any faithful
rendering will do, so the rendering is Frames'.

**Anti-shape to watch for.** The most likely way this boundary erodes is a generator that writes
`subject` as a picture description ("a glowing golden Bitcoin over a stormy Wall Street") instead of a
function statement ("the price line continues past the high and falls"). The first is a prompt with
the syntax removed; it fails all three tests. `subject` should read like a note to a collaborator, and
a good smell test is whether it contains any adjective about *appearance*.

---

## 8. The contract handed to Step 2 (Frames)

**Frames receives**, per beat, in narrative order: `function`, `subject`, `shows[]` resolved against
the notebook's `visual_candidates[]`, `thread` with its op, the modifiers (`negates`, `generous`,
`small`, `register`, `led`), `confidence` + `precision_note`, any `unresolved` block with its
`impact`, and the beat's second budget. Plus the video-level `visual_plan`.

**Frames decides, freely:** how many stills discharge each obligation; how beats pack into scenes;
shot size, framing, composition, palette, style, model, prompt, aspect ratio; whether a `state-change`
is two stills or one animated asset; which candidate wins; everything in the visual identity.

**Frames may not:**

1. **Change a beat's `function` unilaterally.** A function change is a *script* edit, because it
   changes what the beat argues. It goes back to Step 1 as a request, the same way an `AND THEN`
   connector goes back rather than being papered over.
2. **Exceed a `precision_limit` or `precision_note`.** The laundering rule (§5.2) is a
   Frames-side obligation, and it is the one most likely to be broken innocently, because a cleaner
   chart looks like better work.
3. **Render an `unresolved` as texture without saying so.** Silent downgrade to b-roll is the named
   anti-shape (§2). It must surface as a resolution or an escalation.
4. **Break a thread.** `op: "change"` and `op: "reprise"` mean the viewer must recognise the earlier
   asset. b34's reprise is *the same picture as b1*; substituting a similar one destroys the reframe.
5. **Add a `metaphor` that was not in the script.** It spends a budget Frames cannot see (§3.1).

**Frames owes back, and this is the part that makes it a contract rather than a handoff:**

- a resolution for every `unresolved`, or an escalation with its script consequence, so an
  unrenderable beat can be rewritten rather than shipped weak;
- the actual still count, which **resolves the rate** the Script step could only band (§4) — this is
  the return leg that closes m4;
- the `material-missing` list, routed to *research*, not forward to production (§5.3).

**Proposed app change, for whoever owns `app/**` — not made here.** `Scene` in
`app/_studio/projectTypes.ts` should gain `beatIds: string[]`, making the many-to-many packing
explicit and giving the Frames UI a director rail to render alongside the lightbox. Separately, and
larger: the current `Scene` is screenplay-shaped (`slug: "EXT. PIER 7 — NIGHT"`, `mood`,
`lines[{speaker, kind}]`), which fits the Glass Harbor fiction fixture and fits an explainer badly —
there is no location, no speaker, and `mood` is doing work that `function` does better. Either a
second shape or a generalisation is needed before the pipeline's output can reach the UI. See d7.

---

## 9. Open questions

House convention: what we do not know, and the source that would settle it.

### d1 · What is the real beat:image cardinality? ⭐ blocking the schema's central assumption
The whole design rests on beat ≠ scene, and the only number supporting it is EXTERNAL, secondhand and
from one channel (Kurzgesagt's ~200 panels). If the real ratio is near 1:1 in the channels we actually
model, `shows[]` is over-engineered.
*Settles it:* a shot-change count against the transcript for three corpus videos. **This is q6 and m4
restated** — those questions have been waiting for the same measurement, and it needs the video, not
the captions.

### d2 · Are the seven functions separable by two people who do not talk? ⭐
A vocabulary is only useful if two annotators produce the same labels. `state-change` vs `reveal`, and
`mechanism` vs `metaphor`, are the pairs most likely to collapse.
*Settles it:* two annotators independently label the same three videos beat by beat; measure
disagreement. Cheap, decisive, and it needs no new corpus. **Do this before building anything.**

### d3 · Is a steel-man visually marked in real work?
`register: "shift"` (§3) is the least-evidenced proposal in this document — a reasoned obligation with
zero witnesses.
*Settles it:* watch the two known self-attack passages, Economics Explained 10:11 and PolyMatter 4:10,
and record whether the visual register changes at the turn. Two timestamps, ten minutes of work.

### d4 · Does the derived mode predict the observed rate?
§4 replaces a user-set field with a computed one, on a threshold that is ASSUMED and two calibration
anchors.
*Settles it:* annotate the three mid-length corpus videos with §2's functions, compute
`load_bearing_pct`, and check it against the MEASURED 156 / 176 / 234 wpm. n=3 is thin but it is a
real test and the three sources are already in the repo.

### d5 · Does the reframe reprise its opening image?
b34's "same picture, new sentence" is the most attractive claim here and is INFERRED from a *verbal*
rule in `CRAFT-BASELINE` §8.
*Settles it:* compare the first and last frames of Economics Explained and PolyMatter. Two
screenshots each.

### d6 · Does any director intent survive an engine change?
§6.4 argues intent is correctly disposable. If it is wrong, the layer belongs closer to the notebook
and the schema shifts.
*Settles it:* write the director layer for `script--adjudication.md` from the same notebook and diff
it against §5. **The cheapest question here and the one with the largest schema consequence** — it
needs no new research at all.

### d7 · Does the app's `Scene` generalise from fiction to explainer?
`app/_studio/scenes.ts` models a heist film. The pipeline produces explainers. The gap is not
cosmetic — slug, mood and speaker lines have no explainer meaning.
*Settles it:* a product decision, not research. Attempt to express three §5 beats as `Scene` objects
and see what has to be lied about.

### d8 · Is `absence` a function or a modifier?
Decided here as a modifier (`negates: true`), on the argument that it is evidence-shaped. One witness,
and it is our own run rather than the corpus.
*Settles it:* a corpus video that depicts a thing that does not exist. If depicting absence turns out
to need a production approach unlike any evidence beat, it should be promoted.

### d9 · Does the layer survive compression to ≤30s?
Inherits `short-form-clip` **s1** — nothing in that template is measured below 40 seconds. A 30-second
clip may hold three or four beats, and per-beat director notes may be the wrong granularity entirely
at that length.
*Settles it:* the same corpus s1 needs. Not separable from it.

---

## 10. Confidence and limits

- **This document has never seen a storyboard.** No shot list, no animatic, no production board, no
  panel breakdown from any channel we model. The external grounding in §0 and §1 is two blog posts and
  a search summary. Everything about how professionals actually record visual intent is EXTERNAL and
  thin.
- **Worse for the purpose: we have never watched the corpus.** The library's n=10 is **ten
  transcripts** — captions, plus `sources/*.md` prose notes. Every claim in §2 about what PolyMatter
  or Fireship *shows* is inferred from narration and from general familiarity with the channels, not
  from frame-level annotation. This is the single largest weakness, it is exactly what q6 and m4 have
  been asking for, and **no function in §2 has a frame-level witness.** `state-change` has none of any
  kind.
- **The vocabulary is INFERRED end to end.** It is a designed taxonomy justified against observed
  narration, not a taxonomy observed in production documents. d2 is the test that would make it real,
  and it has not been run.
- **The worked example is one script, one engine, one subject, unproduced.** Nothing in §5 has been
  drawn, rendered or shown to anyone. The 77% / over-written finding in §5.2 is a prediction, and it
  rests on a wpm mapping with **two** anchor points.
- **The threshold in §4 is a round number.** ASSUMED, not measured. It is stated precisely because a
  precise wrong number is easier to correct than a vague one.
- **Three modifiers have a single witness each, and the witness is our own run** — `negates`
  (b26), `small` (b21), `generous` (b9). They are the fields most likely to be wrong or to turn out to
  be the same field.
- **Nothing here is validated against a viewer**, for the same reason the rest of the pipeline is not:
  no script from this repo has been produced, voiced or published.

What this document is confident about, and would defend on the existing evidence: **that a text layer
between the beat chain and the frame plan is required rather than optional** (three independent places
in the library reached for it), **that its unit is the beat and not the scene**, and **that a picture
must inherit the confidence of the fact it draws**. The taxonomy in §2 is the part most likely to be
wrong, and d2 is cheap.
