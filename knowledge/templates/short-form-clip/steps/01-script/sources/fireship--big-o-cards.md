---
source: fireship--big-o-cards
channel: Fireship
title: "Big O explained with a deck of cards"
url: https://www.youtube.com/watch?v=WbF2bLbAUik
duration_s: 59
narration_s: 57
views_at_capture: 1550808
captured: 2026-08-11
engine: anchor-ladder
derived_from_long_form: false
read: in full
corpus: ../corpus/fireship-bigo--WbF2bLbAUik.stamped.txt
transcript_kind: ASR auto-captions
---

# Fireship — *Big O explained with a deck of cards*

The reference for **Engine F — Anchor Ladder**, and the highest information density measured anywhere
in the corpus: five complexity classes in 57 seconds, on one object.

## The beat chain

```
[0:00]  STAKE: "if you want to get a job as a programmer you need to know Big O"
[0:01]  THE ANCHOR: "imagine you have a shuffled deck of cards"      ← established by second 2, never replaced
   THEREFORE
[0:03]  pop one card off the stack — "extremely fast"                O(1) constant
   BUT
[0:10]  "but if you then want to count the cards you'll need to loop over the entire deck"   O(n) linear
   BUT
[0:16]  "but now let's imagine we need to sort the deck in perfect order" — bubble sort, loop and
        swap adjacent cards, worst case 52 passes                    O(n²) quadratic
   ALTERNATIVELY ⟨the joke, which also teaches the top of the scale⟩
[0:32]  "if you're stupid you could throw the cards up in the air and hope that they land perfectly
        sorted on the ground — that's called BOGO sort"              O(n!) worst possible
   BUT
[0:41]  "but now we want to find the eight of hearts in the sorted deck" — binary search, split the
        deck, go left or right, "cut your work in half after every step"   O(log n) logarithmic
```

## What transfers

1. **One anchor, five concepts.** The deck is established at 0:01 and carries every rung. A second
   metaphor in a short is the most expensive available mistake — the viewer must rebuild their model
   with no slack.
2. **The ladder is a causal chain, not a list.** Each rung is linked by *but*: the new task defeats the
   previous solution. That is why it does not read as five facts.
3. **The joke teaches.** BOGO sort is funny *and* it anchors the top of the scale. The
   joke-carries-information rule survives even at this length.
4. **Ordered difficulty is a prerequisite.** This engine only works where a subject has a natural
   escalation. Without one, the rungs have no reason to follow each other.

## Measured

247 wpm (235 words / 57s) — the fastest measured, narration-led · ASR captions, no sentence-level
data.

## What does not transfer

- 57s, not ≤30s. The five-rung ladder is very unlikely to survive compression to 25s; three rungs is
  the plausible short version and is untested.
- 247 wpm assumes visuals that *follow* the narration. An image-led clip cannot run this rate.
