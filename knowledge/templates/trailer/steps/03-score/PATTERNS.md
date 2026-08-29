# Score patterns — trailer (90–150s)

Read [`CRAFT-BASELINE.md`](../../../../CRAFT-BASELINE.md) and this template's
[`01-script/PATTERNS.md`](../01-script/PATTERNS.md) first — **especially its §6**, which establishes
that in this form the cue is the *parent* of the picture and that this studio's phase order has that
dependency backwards. This file does not restate that argument; it is the reason this file exists.

**Why `03-score` and not `04-score`.** `knowledge/README.md`'s contents table still lists
`03-motion · 04-score · 05-cut`, from before the Motion step was retired into Frames
(`lib/projects.ts` → `RETIRED_PHASES = { motion: "frames" }`). The studio's steps are
`research → script → frames → score → cut`, so Score is the third one with a knowledge directory,
after `01-script` and `02-frames`.

---

## Sources, stated before anything else

**n=0 cues torn down.** Nothing here has listened to a trailer cue, timed its movements, or counted
anything about how trailer scores are actually made. This step has the same evidence shape as
[`01-script`](../01-script/PATTERNS.md): doctrine written elsewhere, quoted by name, measured
nowhere in this repo.

**One local measurement, and it is a measurement of us, not of the craft.**
[`corpus/bar-math.mjs`](corpus/bar-math.mjs) counts whether this repo's own demo cues put a whole
number of 4/4 bars in the picture they play under. n=3 cues, 5 sections. It is real, it is
reproducible, and it says nothing whatever about what a trailer cue should sound like — it says the
numbers currently on the Score surface do not satisfy the rule the code beside them implements.

**The upstream documents**, all in the AI registry under `media-generation/audio-generation`:

| | What it is |
|---|---|
| `music-prompt-composition/` | golden path + 5 techniques — `section-plan-as-the-brief`, `sonic-style-vocabulary`, `duration-and-tempo-locking`, `reference-track-anchoring`, `lyrics-for-singability`. `status: forged` |
| `generated-music-acceptance/` | golden path + 5 techniques — `brief-conformance-listen`, `loudness-and-peak-acceptance`, `generated-audio-defect-taxonomy`, `structure-verification-against-plan`, `rights-and-provenance-record`. `status: forged` |
| `sound-effect-generation/techniques/trailer-punctuation-grammar.md` | the effects vocabulary, which this step does not own but will need |
| `music-prompt-composition/applications/node--duration-and-tempo-locking.md` | **this repo, described from outside** — see the warning in §8 |

---

## 1. The cue is the parent. This step sits in the wrong place and must say so.

Established in [`01-script` §6](../01-script/PATTERNS.md), quoted there in full and not repeated. The
short form: *"Act boundaries are cue boundaries. Planning act durations in the abstract and then
looking for music that fits produces a search with no results."* The Score step running **fourth**,
after Frames, is the inverted dependency in the product's own phase list —
[`01-script/OPEN-QUESTIONS.md` r3](../01-script/OPEN-QUESTIONS.md) and `s5` below.

What that means for *this* document is narrow and worth stating plainly: **everything below is about
briefing and accepting a cue against a picture that already exists.** That is the honest description
of what this studio does today. It is not what the form's doctrine says should happen, and a Score
step that quietly reads as best-practice would be teaching the inversion.

## 2. A brief is an ordered plan, not a wish

> "A prose wish ('epic orchestral trailer music, dark, builds to a climax') delegates every one of
> those decisions to the model, and the model's answers arrive fused into one take that can only be
> accepted or rejected whole."
> — OBSERVED · `music-prompt-composition/music-prompt-composition.md`

The unit is the **section**: a label, a duration, style directives in both directions, and its
content (lyrics, or an explicit instrumental marking). The argument for it is not tidiness — it is
that the two shapes *fail differently*:

> "A prose piece fails as a whole. When the one take comes back 80% right, there is no address for
> the 20% […] A planned piece fails by section. The chorus that missed its brief is a named region
> with a stated duration and its own directives; the note becomes an edit."
> — OBSERVED · `techniques/section-plan-as-the-brief.md` § Why the plan beats the paragraph

Four rules from that technique that a Score surface has to honour:

1. **The opening section is the anchor.** *"its style directives set the genre, tempo world, and
   tonal palette that later sections inherit"* — and a note against it is a global restyle, not a
   local edit. Later sections' directives should state **deltas**, not restate identity.
2. **State the style in full on every section anyway.** *"Inheritance is a model behavior, not a
   promise."*
3. **Durations are decisions, not suggestions.** *"'auto' duration is for standalone pieces where the
   clock is free."* A trailer cue's clock is never free.
4. **Mark instrumental sections explicitly.** *"The most expensive missing word in an underscore
   brief is that one."*

And the sentence that makes acceptance possible at all: *"The plan is also the acceptance contract.
'Does the delivered audio have the briefed structure' is only a checkable question because the brief
committed to a structure."*

## 3. Style is layered vocabulary, stated in both directions

> "'Cinematic' is not a style; it is an evasion with good posture."
> — OBSERVED · `techniques/sonic-style-vocabulary.md`

**Five axes, one directive each**, beats five synonyms on one axis:

| Axis | What it names |
|---|---|
| Genre and era | the tradition the piece sits in |
| Mood and energy | the emotional temperature and its wattage |
| Instrumentation | what is actually playing |
| Production character | how it is recorded and finished |
| **Motion** | tempo feel and rhythmic posture — "half-time", "four-on-the-floor", "rubato" |

**Audited against this repo, 2026-08-29.** `MUSIC_STYLE_BLOCK` (`app/_studio/score.ts`) is
`["dark orchestral", "modern trailer production", "low strings and brass", "restrained percussion"]`.
Mapped onto the axes: genre+mood ✓, production character ✓, instrumentation ✓✓ (two entries),
**motion ✗ — no axis word for tempo feel or rhythmic posture at all.** That is not a criticism of the
words chosen; it is the technique's own diagnostic (*"When a result is generic, add axes before
adding adjectives — the miss usually means an axis was left to the model"*) applied to the one style
block this repo has. INFERRED, from one style block: n=1.

**The exclude list is the fence you cannot see past**, and the source names the standing ones:

> "Standing excludes worth writing by default: vocals, for any underscore brief (and say
> 'instrumental' positively too — redundancy is cheap, a singer is not); fade-out endings, for
> anything that must cut to picture; **the genre's own clichés when they would collide with the
> picture** (the four-chord loop, the drop, the gospel choir on the final chorus)."
> — OBSERVED · `techniques/sonic-style-vocabulary.md`

`lib/music/plan.ts`'s `STANDING_EXCLUDES` is `["vocals", "singing", "fade-out ending"]` and is
labelled INVENTED there. It is not invented — **two of its three items are exactly this quote**, and
the item it is missing is the third one, which is per-project rather than standing. See §8.

## 4. Duration and tempo are rented from the picture — and the bar math is arithmetic

> "A standalone piece owns its clock. A cue against picture rents its clock from the cut, and the
> brief must say so in numbers […] At tempo B in four-beat bars, a bar lasts `240 / B` seconds […]
> To land an accent on a picture event at T seconds after the cue's entry, choose B so that T divides
> into whole bars."
> — OBSERVED · `techniques/duration-and-tempo-locking.md` § The bar math

Three consequences the source states, all of which this repo can act on today:

- **Lock one edge, float the other.** *"Both edges locked plus a fixed tempo over-determines the
  cue."*
- **Structure serves the clock, not the reverse.** *"A 38-second cue is not a song compressed; it is
  one or two sections doing one job. Brief the section plan from the duration […] never write the
  plan first and hope it sums."*
- **Duration is a delivery gate, not a hope.** *"A cue that is right at the wrong length fails
  acceptance even when it is beautiful […] 'sounds about right' is unmeasured."*

### 4.1 The measurement — MEASURED, n=3 cues / 5 sections

Script: [`corpus/bar-math.mjs`](corpus/bar-math.mjs). Inputs copied from `app/_studio/scenes.ts`
(scene `targetS`) and `app/_studio/score.ts` (`SPOTS[].bpm`, `sceneIds`), 2026-08-29; the tolerance is
`barsFit`'s own (0.02 bars, `lib/music/plan.ts`).

| Cue | picture | bpm | bar | bars | lands? |
|---|---|---|---|---|---|
| cue-1 "The door (build)" | 13s (6+7) | 84 | 2.857s | 4.550 | **no** |
| cue-2 "Never at the gate (turn)" | 13s (6+7) | 112 | 2.143s | 6.067 | **no** |
| cue-3 "Waterline (release)" | 5s | 84 | 2.857s | 1.750 | **no** |

**MEASURED: 0 of 3 cues and 0 of 5 sections land on a bar line at their declared tempo.** The
consequence is not cosmetic — `cueToPlan` gates *"hard ending on the beat"* on `barsFit` returning
non-null, so **the demo never asks for the ending it was designed to ask for**; every section falls
back to `"arrival"` plus the direction *"…is not a whole number of bars — cut to picture, not to the
bar"*. The code is behaving correctly and honestly. The numbers beside it are the problem.

**MEASURED: the tempo is not always the fixable end.** For cue-1 and cue-2 there is **no integer
tempo between 60 and 160** at which both of their sections and the whole cue land on bar lines — a 6s
section and a 7s section share no bar length in that range. For cue-3, 96 or 144 bpm would work and
84 does not. Restricted to what the code actually gates on (the *last* section only): 68, 69, 103 or
137 bpm would earn cue-1 and cue-2 their hard ending; 96 or 144 would earn cue-3 one.

**INFERRED from that**, and it is the finding this step should carry upward: *one section per scene*
guarantees the bar math fails whenever adjacent scenes have coprime lengths. The registry's rule is
*"the caller then adjusts bpm, not the picture"* — here, adjusting bpm cannot fix it, which means
either the section boundaries are chosen musically rather than per-scene, or the accent is not the
section edge. Nothing in the sources resolves that for a per-scene section plan. `s3` in
[`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md).

## 5. Ducking is not a brief line, and this repo has no mixer

> "A cue that will sit under narration is briefed *thinner* (sparser instrumentation, restrained
> motion in the narrated region — style-level decisions this subject owns), but the duck itself —
> attenuation while voice is present — is automation at the mix […] Do not ask the generator to 'get
> quieter when someone talks'; it cannot hear the narrator, and the request spends style budget on a
> mix problem."
> — OBSERVED · `techniques/duration-and-tempo-locking.md` § Ducking is a mix rule, not a brief line

Two things follow for this studio. The brief-side move is real and available now: **brief the narrated
region thinner**, on the instrumentation and motion axes. The mix-side move is not available at all —
there is no mixing layer in this repo, and `grep -rniE "lufs|dbtp|loudness" app lib components`
matches nothing but three comments saying so. A duck depth is therefore not a number this document is
missing; it is a **layer this product does not have**, and the honest surface treatment is the one
`app/_studio/score.ts` already reached independently: a declared-not-performed row. `s4`.

## 6. Acceptance is three gates and they do not substitute for one another

> "A generated track arrives as a finished-sounding file, and that is exactly the problem: it *sounds*
> finished whether or not it is usable."
> — OBSERVED · `generated-music-acceptance/generated-music-acceptance.md`

1. **Brief conformance** — is it the piece that was asked for?
2. **Technical acceptance** — is it deliverable? Loudness, true peak, structure at the briefed
   offsets, no defect from the taxonomy.
3. **Rights and provenance** — is it *usable*, legally, for what the production will do with it?
   *"Recorded at acceptance time, because the facts it needs exist at generation time and evaporate
   afterwards."*

*"A track can pass any two and fail the third, and each failure has a different remedy."*

**The routing law, which decides what the UI may ask a human to do:**

> "what could be checked against the plan is checked deterministically; the ear is reserved for what
> only an ear can judge. An acceptance pass that plays the file and nods has used its most expensive,
> least reliable instrument on questions a script answers exactly."
> — OBSERVED · `techniques/structure-verification-against-plan.md`

And the ordering rule, which is the one most likely to be dropped by a tool: **run the deterministic
pass first and let it gate the listen.** *"the ear, arriving first, likes the take, and the liking
negotiates with the numbers ('13 seconds over, but it breathes…') — at which point the timeline it
must fit has not gotten any longer."*

The listen itself has a method, not a vibe: a checklist derived **mechanically from the brief**, one
item per commitment; the three-state verdict vocabulary **pass / fail / unmeasured** (*"the item the
listen could not resolve […] is recorded as unmeasured, never rounded to pass"* — the same law this
repo's `gate.ts` and trailer checker already run on); first listen at delivery volume in the delivery
context; **one translation pass on deliberately bad speakers**; and *"Verdict on the sheet within two
listens per item, then stop"*, because the ear normalises defects with exposure.

### 6.1 The numbers, and the one this template most needs and does not have

> "Integrated loudness (LUFS) […] streaming platforms normalize to the neighbourhood of −14 LUFS;
> broadcast delivery specs sit near −23/−24 LUFS depending on region; **theatrical and trailer chains
> run their own, louder regimes with their own compliance measures.** […] keep true peak at or under
> −1 dBTP, and allow more headroom (−2 dBTP) when the destination will transcode to lossy formats"
> — OBSERVED · `techniques/loudness-and-peak-acceptance.md`

Read that carefully. The two destinations the source *numbers* are streaming and broadcast. **The one
this template is named after — the trailer chain — is the one it explicitly declines to number.** So
for a trailer cue this repo can encode the true-peak ceiling and the verdict vocabulary, and cannot
encode the integrated-loudness target, and must not guess one. `s1` in
[`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md); it is the blocking gap on the technical gate.

The framing that survives regardless: *"The target is a property of the **destination**, not of the
track […] the acceptance question is 'at the target for where this ships', never 'loud enough'."* And
every number is recorded **with its basis**, *"because '−14' with no basis is a different kind of
unmeasured."*

## 7. Defects have names, and the name routes the remedy

> "'It sounds off' is not a verdict anyone can act on."
> — OBSERVED · `techniques/generated-audio-defect-taxonomy.md`

Nine named classes, each with a cause and a remedy — smeared transients, vocal garble, section bleed,
tempo instability, broken ending, loop seam, spectral hole, phase/width artifacts, and *the confident
hallucination* (*"an instrument or voice nobody briefed, mixed as if intended"*). The remedy column is
the point, and it routes three ways: **repair in post** (spectral or edge defects), **re-render the
failing section** (localized, and only available because the plan made sections addressable),
**condemn the take** (global — *"and record what condemned it"*).

Two rules a tool must carry:

- **Tempo instability condemns a picture-locked cue.** Not "re-render" — *"condemn if picture-locked
  accents depend on the grid."* Every cue this studio makes is picture-locked.
- **The recurrence rule.** *"A defect class that appears in consecutive takes from the same brief has
  stopped being generation noise and become a property of the brief–model pair. Stop re-rolling: the
  same request will keep buying the same defect."* This requires a record across takes, and this repo
  keeps none. `s6`.

## 8. What the Score surface's numbers are today — the accounting

**This is the section the direction exists for, and it is deliberately an accounting rather than a
replacement.** Every value below was invented; some of them this document can now source, and some it
cannot. Saying which is which is the whole job.

**A warning about one of the sources, because it would otherwise be circular.** The registry's
`music-prompt-composition/applications/node--duration-and-tempo-locking.md` **describes this
repository by name** — it is a dated application note about `gravitone-gcloud`'s own `lib/music/`.
Where it states that this repo splits cues 2:1 above 20 seconds, it is *reporting what this code does*,
not *establishing that it should*. **A repo's own behaviour, written down in a registry and read back
as doctrine, is laundering with an extra hop.** It is cited below only for the things it genuinely
measured (a live render), never for the rules it merely observed us following.

| Value, where it lives | What it was | This document's verdict |
|---|---|---|
| `STANDING_EXCLUDES = ["vocals", "singing", "fade-out ending"]` · `lib/music/plan.ts` | labelled INVENTED in the file | **SOURCED.** `sonic-style-vocabulary.md` states both standing excludes verbatim. The label can be corrected. It is *incomplete*: the source names a third, "the genre's own clichés when they would collide with the picture" — per-project, so a field rather than a constant |
| `MUSIC_STYLE_BLOCK` (4 entries) · `app/_studio/score.ts` | a plausible list | **PARTLY SOURCED.** The *shape* is doctrine (5 axes, both directions, restated in full per section). The *words* are this production's identity and are nobody's to source. **The Motion axis is missing** — §3 |
| `bpm: 84`, `bpm: 112` · `app/_studio/score.ts` | typed numbers | **CANNOT REPLACE, and now demonstrably wrong for their purpose.** No source gives a trailer tempo, and none should — tempo is *chosen from the picture* by bar math. §4.1 measures that these three do not fit theirs, and gives the tempos that would. This document supplies the **method**, not the number |
| `CLOSING_STYLES = ["arrival", "hard ending on the beat"]` · `lib/music/plan.ts` | labelled INVENTED | **PARTLY SOURCED.** That a picture-locked cue needs a stated ending shape is doctrine twice over (`sonic-style-vocabulary` on fade-out excludes; the defect taxonomy's *broken ending*, cause: "ending shape left unstated"). **Which words** buy it from a given model is unsourced and unmeasured |
| `APPROACH_STYLES = ["rising energy"]` · `lib/music/plan.ts` | labelled INVENTED | **CANNOT REPLACE.** "Rising" is an assumption about shape. The doctrine says later sections state *deltas* from the anchor — it does not say the delta is a rise, and for a trailer cue's exposition section it probably is not. §2, `s5` |
| `adherence: "high"` on every section · `lib/music/plan.ts` | a vendor enum, always the same value | **PARTLY SOURCED.** `lib/music/types.ts` already documents the posture correctly. Whether every section of a picture-locked cue wants `high` is unmeasured |
| the 3s/120s section window, 30-section cap · `lib/music/plan.ts` | vendor limits | **SOURCED, as vendor facts with a date.** `applications/process--section-plan-as-the-brief.md`, docs resolved 2026-08-26, `refresh_by: 2026-11-26`. These are not craft and must never be presented as craft |
| **`MIN_TWO_SECTION_S = 20` and the 2:1 build→release split** | were in `lib/music/plan.ts` | **GONE before this document landed** — removed in this same wave when `cueToPlan` was rewritten to follow the picture's scenes. Recorded here because they were the largest invented numbers on the step and a reader will find them in the history: neither had a source, and the only place either appears in the registry is the application note *describing this repo* |
| **`durS: 13` on a cue; `−6dB` duck** · `app/_studio/score.ts` | were hand-typed | **GONE before this document landed** — duration is now derived from the picture, and the duck is a declared-not-performed row. §5 explains why the duck number was never this document's to supply |

Two of today's constants are therefore replaceable now, three are partly sourced, and **the tempo —
the number a creator actually sees — is not replaceable by any document, only by a calculation
against the picture.** That is the useful answer, and it is better than a plausible default would
have been.

## 9. What this means for the Score step's UI

1. **The cue's sections are first-class, addressable objects**, with durations, both style lists and
   an explicit instrumental marking. Not a prose box. §2.
2. **The style block is edited on five named axes**, with the exclude list beside it as a peer, not
   as an afterthought. A missing axis should be visible as a missing axis. §3.
3. **The tempo field shows its bar math** — bars-in-span at the current bpm, and the tempos that
   would land the accent. `barsFit` already computes it; §4.1 shows what a creator would learn.
4. **The deterministic pass runs before the play button is offered.** Duration, section offsets,
   true peak. *"a file that failed on duration or structure does not need twenty minutes of anyone's
   ears."* §6.
5. **The listen is a sheet, not an impression** — one row per brief commitment, verdicts
   pass/fail/**unmeasured**, and the sheet is the artifact. §6.
6. **A failed take is classified before it is re-rolled**, from the nine named classes, and the class
   picks repair / section re-render / condemn. §7.
7. **Nothing shows a loudness verdict until §6.1's `s1` is answered.** An unmeasurable gate must read
   as unmeasured, not as green.
8. **The rights record is written at generation time or not at all.** `MusicProvenance` today carries
   vendor, model id, requested ms, plan and timestamp — real provenance, and *not yet* a rights
   record: account, plan tier, terms and referenced material are the facts that evaporate. `s7`.

## 10. Confidence and limits

- **n=0 for the craft.** No cue has been torn down here. Every rule above is doctrine, quoted, from
  two `status: forged` registry subjects.
- **n=3 for the one measurement**, and it measures this repo's fixture rather than the craft.
- **The two subjects are about *generated* music, not about trailer scoring.** They tell this studio
  how to brief and accept a generated cue; they do not tell it what a trailer cue *is*. The nearest
  thing to that is `cue-first-assembly`'s description of a usable cue's shape — mood opening,
  exposition, response, build, peak, short tail — which lives in the narrative-craft bundle and is
  quoted in [`01-script` §6](../01-script/PATTERNS.md). Whether that six-part shape can be expressed
  as a per-scene section plan is unanswered. `s5`.
- **The one number this template most needs is the one the source declines to give** — §6.1.
- **A conformance sheet cannot tell you a cue works**, for the same reason the structural checker
  cannot tell you a cut works. The neighbouring refusal applies here unchanged: *"a piece can hit
  every offset and be dull, which is the conformance listen's territory, and no meter's."*
