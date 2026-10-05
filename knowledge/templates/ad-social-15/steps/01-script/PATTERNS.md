# Script patterns — ad-social-15 (6–20s, target 15s)

This step is two rounds and a brief. First a **Brief card**: product, audience, single-minded
proposition, tone, must-include, CTA, platform. Then **Round 1**, about six ad IDEAS, each from a
different angle, of which the creator picks one. Then **Round 2**, three SCENARIOS executing that
idea, each a timed shot list. This file states the rules the Idea prompt and the Scenario prompt must
obey. [`ad-spot-30`](../../../ad-spot-30/steps/01-script/PATTERNS.md) shares §1–§5 and adds only what
the longer rung changes.

Read [`CRAFT-BASELINE.md`](../../../../CRAFT-BASELINE.md) for the but/therefore law, which holds
between an ad's shots unchanged. Do **not** carry over the promotional templates' withholding rules;
see the template's opening.

**Sources:** n=0. Every rule below is doctrine from four registry subjects (paths in the template),
quoted by technique. Labels follow [`knowledge/README.md`](../../../../README.md): OBSERVED means read
off the registry document named, with its own evidence grade carried in brackets.

---

## 1. The brief comes before any idea

OBSERVED · `ad-concept-ideation/proposition-before-idea` [practitioner doctrine]:

> "Ideation without a proposition does not produce free creativity; it produces ideas about the
> *category*, the *mood* or the *audience*, any of which could front any brand."

**Rules for the Idea prompt:**

1. **One proposition, written from the viewer's side.** "This jacket keeps you dry in a downpour," not
   "Innovative waterproof technology." If the brief lists several benefits, the creator chooses one
   *before* ideation: "A short ad that carries three benefits carries none."
2. **A truth to grip.** A property, behaviour, consequence or tension that makes the proposition
   believable. "Ideas run through truths; a proposition alone is a slogan."
3. **If no proposition can be written, ask; do not invent.** "An invented proposition is a strategic
   decision taken by the tool and hidden inside the creative."
4. **A creator's proposition is used verbatim**, and passed to every downstream prompt as a fixed field.

## 2. Spread is manufactured: one angle per slot

OBSERVED · `ad-concept-ideation/divergence-before-selection` [peer-reviewed + preprint]: model idea
sets are narrow. In one study, thousands of seeds per topic collapsed to "about one in twenty"
after de-duplication. People who brainstorm with a model converge on each other's ideas.

OBSERVED · `angle-template-seeding` [peer-reviewed, 1999, mostly print ads]: "judges classified 89%
into six templates", and template-trained novices outscored both untrained and free-association
novices.

**Rules for the Idea prompt:**

1. **Assign each of the ~6 slots a different angle *before* generating.** "Two ideas from one angle are
   one idea seen twice."
2. **The studio's `AdAngle` set vs the templates**, which is the one real tension in this step:

   | AdAngle | Registry template it maps to |
   |---|---|
   | `exaggeration` | extreme situation / extreme consequences |
   | `absurd` | extreme situation, *absurd alternative* form |
   | `demo` | interactive experiment / competition (attribute) |
   | `twist` | inverted consequences, or analogy-replacement |
   | `emotional` | **outside the templates** ("emotion is a separate lever") |
   | `problem-solution` | **the category default** ("the most common source of the banal execution") |
   | *(missing)* | **pictorial analogy**, "about two-fifths of the matches", the most frequent template among winners |

   The registry rule is "Always include the analogy and consequences angles when they fit." The
   current set has no analogy angle. That is `a1` in [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md).
3. **`problem-solution` only through a template**: "only when the problem itself is shown through one of
   the templates — an extreme or analogical problem, not a literal one."
4. **Check the angle held.** "A model asked for an absurd-alternative idea often returns a plain
   problem-and-solution idea with a joke on top." Classify the returned mechanism and reject drift.
5. **Generation levers that work** (graded in the source): staged generation ("many short titles, then
   ask the model to push them further apart … then expand"), ordinary-person personas, "several
   answers with their probabilities", forced connections. **Levers that do not:** temperature ("buys
   nonsense faster than ideas"), "be bold", and "ten more".
6. **The tone field filters angles; it never writes the idea.** From `ad-concept-ideation`: "Tone may
   exclude an angle; it may not choose the idea."

## 3. Every idea passes gates; the model screens, the creator picks

OBSERVED · `idea-screening-gates`: "gates, not a score". The Idea prompt (or a judge pass after it)
applies each gate as a yes/no and records **the gate verdicts as words**:

| Gate | Test, quoted |
|---|---|
| Product-tied | "Replace the product in the idea with a competitor's … If the idea still works unchanged, it is not about this product" |
| Single-minded | "Name what the viewer should believe afterwards in one clause" |
| One line | "Write the idea as a single sentence a stranger could repeat" |
| Ownable | write "the three most obvious ads for the category *before* reading the candidate", then reject matches (`banality-screen`) |
| Filmable in the medium | fails ideas that depend on "dialogue performance, on a long continuous action, on legible text inside the picture, on an exact likeness held across many shots, or on a precise physical interaction with the real product" |

Plus one question that is not a gate. **What does the picture claim about the product?** A generated
demonstration "can show a performance the product has never given". The idea is either substantiated
or "pushed into a register no reasonable viewer reads as literal" (law
`output-never-outruns-evidence`).

**The banality floor goes to the judge, not the generator.** From `banality-screen`: "Recognising a
match is an easier task than avoiding one, so the floor belongs to the judge." In the generation
prompt, "state the wanted quality positively". *Grade note in the source: the backfire of naming a
forbidden thing is measured for image models and older text models, and unmeasured for current
ones.*

**The model never ranks the survivors.** From `idea-screening-gates`: "model rankings of creative
ideas have been measured near chance against expert humans … The model screens; the creator picks."
So the UI shows the spread, each idea labelled with its angle, and does not show a model's favourite.

## 4. Every idea carries one honest risk

OBSERVED · `honest-risk-statement`: a required, specific, never-empty field. A risk names "a failure
mode and the condition that triggers it". Its categories are misread, wrong attribution, audience,
medium, claim and tone. A risk "that would fit every idea in the set is not about any of them". A
**claim** risk is blocking, not a matter of taste.

**Idea output shape the prompt must emit:** `{ angle, oneLine, proposition-as-felt, risk, gateNotes }`.
The UI already owns the angle and the one-liner; `gateNotes` and `risk` are what the doctrine adds.

## 5. The scenario is a timed shot list

OBSERVED · `short-ad-structure/timed-shot-list`. Each shot is `{ durationS, image, motion, super|null }`,
plus `musicMood` and `endCard {cta, line}`, which matches the studio's schema. **Rules for the Scenario
prompt:**

1. **"Reserve the end card first."** "The end card is a shot. A scenario whose shots fill the runtime
   and whose end card is an afterthought has spent the seconds the ad is buying."
2. **"Allocate by function, not evenly."** Give the hook short, give the truth shot the most time, and
   give the payoff "enough to land and no more".
3. **Every shot ≤ one clip.** "Plan durations that are **at or below** one clip length, and expect the
   usable part of a clip to be its first seconds."
4. **Floor every shot.** A new image needs "on the order of a second and a half"; a shot with a super
   needs its words' reading time (§7).
5. **"Sum and assert."** The shot durations plus the end card equal the runtime to the second. A
   mismatch is never absorbed silently.
6. **No timing in the motion prose.** "Duration is a typed field here, and a second, prose authority
   over the same channel produces a compromise that matches neither."
7. **Shots link by but/therefore.** "When two adjacent shots can only be linked by 'and then', one of
   them is decoration."

## 6. The 15s order: hook, brand, payoff, ask

OBSERVED · `short-ad-structure` and its techniques. **Rules for the Scenario prompt:**

1. **Parts at 15s: hook · truth · payoff · end card** (`length-rungs`). "The set-up merges into the
   hook — the first shot *is* the situation — and the turn is dropped or becomes the payoff itself."
   The hook, the payoff, the brand and the ask are never dropped. "A rung that cannot hold all four is
   not available for this idea."
2. **Shot 1 is the hook and it is about the product** (`product-tied-hook`): "The first shot opens a
   question the product answers." The patterns that tie a hook to the product are *the payoff first*,
   *the problem at its extreme*, and *the product doing something it should not*. "Do not open on the
   logo card."
3. **Brand: a cue in the opening shots, pulses after, brand on the card** (`brand-presence-timing`).
   This rests on peer-reviewed evidence: brand first shown in the last third "did worst at every level
   of entertainment", and pulsed brand time cut avoidance "by about 8% on average". So no watermark
   and no logo-only ending.
4. **Payoff, then ask** (`payoff-before-ask`): "An ad … must **close its own gap**." The payoff is
   "visibly *because of* the product". There is one call to action, and the end-card line "restates, it
   does not extend". "No button after the ask."
5. **One message across every shot, super and card** (`one-message-spine`). "Supers restate or sharpen
   the proposition; they do not extend it." *Grade note:* the source calls this "a default argued from
   runtime, not a law the evidence settled". One peer-reviewed study favoured three claims.

## 7. What the `image` and `motion` fields must look like

The Scenario prompt writes the seeds of the next two steps, so it obeys their rules now.

**`image`, the key-image prompt.** OBSERVED · `still-to-motion-direction/animatable-key-image`:

- "Leave room for the move", so the shot's camera move is decided before the still is generated.
- "Separate the subject from the ground", and keep a simple background.
- "The pose should be the moment *before* the shot's action, not the action completed."
- "No lettering anywhere in the plate." That means no signs, labels, screens with text, or model-drawn
  logos.
- 9:16 native.
- If the shot has a super, describe the quiet region it will sit in.
- The product's label is never asked of the model when legible: "the label is composited or the shot
  is re-staged so that it is not legible" (`product-fidelity`).

**`motion`, the i2v line.** OBSERVED · `motion-line-composition` [vendor-grade guides that disagree; the
registry takes the conservative reading]:

- **One camera move + one subject action + a speed word + a 3–8 word medium phrase.** That is the
  whole line.
- Refer to the subject generically ("the woman", "the bottle"). **Do not re-describe the image**:
  "re-describing elements the image already shows 'can lead to reduced motion or unexpected results'".
- No negations. State stillness positively ("locked-off camera; the frame holds steady"). No request
  for a figure to freeze; give it "a small, specific, wanted action" instead.
- No text, no duration, and no mood words ("dynamic", "cinematic").
- Product and likeness shots move little, mostly by camera; energy goes to the hook and the
  environment (`motion-amount-tradeoff`).

**`super`.** At most one line of about five to seven words, held 0.2s per word plus 2s (`drawn-supers`).
If the shot is shorter than that hold, move the super or cut words: "Never shorten the hold." A
super carries no new claim.

## 8. Confidence and limits

- **n=0.** No ad has been made, timed or tested here.
- **Filmed-ad evidence applied to generated ads**: see the template's second gap.
- **Platform figures are vendor-grade and date fast.** The proposition-in-3s guidance, the 14/35/6
  safe zone and the 15s ceiling are platform self-reports.
- **Model-prompting evidence is mostly preprint**, and the template-seeding of a *model* is "a
  reasonable inference from the persona-seeding results, not a measurement".
- **Nothing measures whether an ad works.** See the template's fourth difficulty.
