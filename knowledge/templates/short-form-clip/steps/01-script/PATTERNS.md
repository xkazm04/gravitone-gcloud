# Script patterns — short-form clip (≤60s)

Read [`CRAFT-BASELINE.md`](../../../../CRAFT-BASELINE.md) and [`ENGINES.md`](../../../../ENGINES.md)
first. This covers only what is specific to ≤60 seconds.

**Sources:** n=3, read in full — Fireship *Big O* (0:57, Anchor Ladder) · PolyMatter *This is Not
Target* (0:53, Paradox Teaser, **derived**) · Fireship *rubber duck* (0:40, Effort/Payoff).

**Unverified below 40 seconds** — see the template's evidence gap.

---

## 1. The first sentence is the whole hook

MEASURED · all three deliver a complete hook in **one sentence, at 0:00**, with no branding, no
throat-clearing and no "in this video":

> *"this is not Target"* — 4 words
> *"it's 3am, your code is broken, you have no idea where your kids are"* — a scenario, escalating
> *"if you want to get a job as a programmer you need to know Big O"* — a stake

OBSERVED · each is a different opening *shape*, and they exhaust the useful set:

| Shape | Move | When |
|---|---|---|
| **Contradiction** | assert something the picture denies | there is a visual paradox |
| **Scenario** | drop the viewer inside a moment they recognise | the subject is a felt problem |
| **Stake** | attach the subject to something the viewer wants | the subject is a skill or a risk |

**Not observed, and worth avoiding:** the announced fact (*"did you know…"*). It signals a fact is
coming and gives the viewer a clean moment to leave.

## 2. One idea, and the Anchor Ladder is not an exception

MEASURED · Fireship's *Big O* teaches five complexity classes in 57 seconds, which looks like five
ideas. It is one: **cost grows differently for different work**, demonstrated five times on one deck
of cards.

```
one shuffled deck of cards          ← THE ANCHOR, established at 0:01
  pop one card                      O(1)
  BUT count the cards               O(n)
  BUT sort the deck (bubble sort)   O(n²)
  BUT throw them in the air         O(n!)   ⟨the joke — and it teaches the top of the scale⟩
  BUT binary-search the sorted deck O(log n)
```

Each rung is linked by *but* — each new task defeats the previous solution — so this is a causal chain,
not a list. **INFERRED · the anchor must be established in the first 2 seconds and never replaced.** A
second metaphor in a short is the single most expensive mistake available; the viewer has to rebuild
their mental model with no time to spare.

## 3. Rate is set by the visual plan, not by taste

MEASURED · **125 wpm** (PolyMatter) vs **247 wpm** (Fireship) — a 2× spread inside one format.

PolyMatter's *Target* is a sequence of images that make the argument; the narration only labels them
(*"this is not a Target store — neither is this — and this is not Target's website"*). Fireship's *Big
O* has visuals that follow the narration, so the narration carries everything.

**INFERRED · the Script step cannot resolve rate for a short.** It should emit a word budget as a
*range* (roughly 110–235 words for 40–60s) and record which of the two modes the clip intends —
**image-led** or **narration-led** — as an input to the Frames step. Guessing wrong by 2× is the
difference between a clip that breathes and one nobody can follow.

## 4. The derived-short contract

The studio's stated workflow is **shorts scoped from mid-length content**. The naive version — cut the
best 30 seconds out of the long video — reliably fails, because a clip inherits context it no longer
carries. PolyMatter's *Target* is the worked example of doing it properly:

```
[0:00]  "this is not Target"                          ← self-contained hook, no prior knowledge
[0:02]  "this is not a Target store, neither is this, and this is not Target's website"
[0:10]  THE REVEAL: all Target Australia — "not owned by, associated with, or related to in any
        way Target America"                            ← a COMPLETE payoff, delivered
[0:20]  THE ABSURDITY: "despite having identical names, logos, colors, websites and even products,
        both companies maintain this is pure coincidence"
[0:29]  THE DETAIL: "practically the only difference is this period found Down Under"
[0:35]  CONTEXT: 120 years, 2000 stores, all in the US
[0:44]  THE WITHHELD LOOP: "it only tried to expand overseas once and it failed spectacularly —
        click the link below to watch what happened"
```

**The contract, INFERRED from this one example:**

1. **The clip must be complete on its own.** It answers a real question fully — *are these the same
   company? No.* A viewer who never clicks through has still received something.
2. **The withheld thing must be a different question**, not the rest of the same one. "It failed
   spectacularly" is a *new* loop opened at the end, not the missing half of the one just closed.
3. **The pointer is explicit and last.** No coy "watch the full video to find out"; a named thing that
   happened, then the link.
4. **The clip must not depend on the long video's setup.** Nothing in the first 44 seconds assumes you
   know who PolyMatter is or that a longer video exists.

**Anti-pattern — the amputated clip:** cutting a segment out of the middle of a long video, where the
hook is a mid-argument sentence and the payoff was established four minutes earlier. It reads as
complete to the person who made it and as noise to everyone else.

## 5. The joke lands last

OBSERVED · two of three end on a joke, and in both cases it is the *only* place a beat is spent purely
on comedy:

> *"not only does rubber duck debugging make you more productive, but it's also a great way to prepare
> for all your upcoming technical interview failures"*
> *"alternatively, if you're stupid, you could throw the cards up in the air and hope that they land
> perfectly sorted"* — which also teaches O(n!)

INFERRED · in short form the closing joke replaces the reframe. There is no room to re-describe, so the
last beat buys memorability instead of insight. Note the second example still carries information — the
`joke-carries-info` rule from the other templates holds even here.

## 6. What this means for the Script step's UI

1. **A hook shape picker** — contradiction · scenario · stake (§1). Three options, not a text box.
2. **The anchor is a named, single field** for Anchor Ladder clips, and the UI should refuse a second
   one.
3. **Image-led vs narration-led** as an explicit mode, driving a 110–235 word budget range and
   handed to the Frames step (§3).
4. **Derived-short mode**: pick the parent script, then the four contract checks in §4 as review
   items — *is it complete alone; is the withheld thing a different question; is the pointer explicit;
   does it depend on the parent's setup?*
5. **No "did you know" template.** If the tool offers it, it will be used.

## 7. Confidence and limits

- **n=3, and nothing measured below 40 seconds** — the ≤30s target is entirely unverified.
- **The derived-short contract is one example.** PolyMatter's *Target* is the only derived clip
  studied; all four of its rules are INFERRED from a single witness.
- **Two of three sources are the same channel**, so the closing-joke pattern may be a Fireship habit.
- **All three are ASR captions** — no sentence-level data.
- **No engagement data.** Nothing here is validated against retention or completion; these are craft
  observations from work that appears to succeed, and view counts are not evidence of craft.
