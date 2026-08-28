# Spike brief — can we make 20 shots look like one world?

**Status:** ANSWERED 2026-08-26 — see `CONSISTENCY-FINDINGS.md`. There is a
route, in stills and in motion. Approaches 1, 2 and 3 were all run. For stills,
3 clears the bar at the real-film floor using only what was already on disk. For
motion, Ref2VA (now downloaded) holds identity across three hard cuts at 0.189 —
tighter than one continuous take of real film — while last-frame chaining drifts
to a different person by the third clip. Approach 4 (a trained LoRA) was not
started and is not needed yet.
**Owner question:** does automated trailer generation have a route, or does it
produce a slideshow?

## Why this is the blocking gap

Everything else in the trailer pipeline has a working answer. We can generate a
still with controlled craft (Flux 2), animate it ~5 s with controlled camera
(MiniMax H3 image-to-video), and — with the corpus work — we will know what
structure a trailer should have.

None of that matters if shot 7 and shot 18 do not appear to be the same
character in the same place. A 90-second trailer is **20–30 shots**, and
coherence across them is not a nice-to-have; it is the difference between a
trailer and a mood board.

This gap is also different in kind from the others: it is a **generation**
problem, not a knowledge problem. No amount of corpus analysis touches it.
Watching a hundred trailers teaches nothing about holding a face stable across
shots. That is why it deserves its own session rather than a lane in the
corpus work.

## What is already on this machine

Worth knowing before choosing an approach — some of this was set up in an
earlier session and is not obvious from the repo:

- **Flux 2 dev (fp8)** + Mistral text encoder, via ComfyUI at `~\ComfyUI`.
  Text-to-image, ~20 steps, 1280×720 in well under a minute.
- **MiniMax H3 FL2VA** — the **first/last-frame** checkpoint, already
  downloaded. Anchors a clip to a supplied first frame; proven working (the
  "duel" test: environment retention excellent, choreography credible).
- **H3 Ref2VA** — a reference-conditioned checkpoint accepting **up to 9
  reference images**. *Not downloaded.* This is the most directly relevant
  asset for the spike and should be the first thing checked.
- 8-step turbo LoRA for H3, both VAEs, RTX 4090 (24 GB), 63 GB RAM.
- `guard.py` — engine recycling and commit-charge headroom checks. **Use it.**
  Flux and H3 cannot co-reside; see the ops notes below.

## The approaches, cheapest first

Run them in order and stop when one clears the bar. Do not start with the
expensive one.

1. **Prompt and seed discipline.** Fixed seed, an identical character/location
   clause reused verbatim across shots, varying only camera and action. Costs
   nothing and is almost certainly insufficient — but it establishes the
   **baseline** that every later approach has to beat, and without it there is
   no way to claim an improvement.

2. **Last-frame chaining (FL2VA).** Generate shot A, take its final frame, use
   it as the first frame of shot B. Already proven to work mechanically. Gives
   strong continuity *within* a continuous action, and is expected to fail
   across a hard cut to a different angle — establishing where the technique's
   boundary sits is itself a result worth having.

3. **Reference conditioning (Ref2VA, or Flux image-reference input).** Supply
   the same character reference to every shot. This is the approach most likely
   to work at trailer scale, because it does not depend on shots being adjacent.
   Check availability first — if Ref2VA needs downloading, that is ~20 GB and
   should be started early in the session so it lands while other work proceeds.

4. **A trained LoRA on one character.** Most reliable, most expensive, and it
   only makes sense once 1–3 have failed. Note the honest trade: a LoRA per
   character means the pipeline cannot generate an *arbitrary* trailer, only
   one for a character we have trained. That may be acceptable — it is how
   studios work — but it changes what "automated" means and should be a
   deliberate decision rather than a drift.

## How to measure it — decide this BEFORE generating

The trap this project has already fallen into twice is measuring agreement and
calling it truth. Consistency is unusually easy to fool yourself about, because
the eye forgives a lot in motion and forgives nothing in a still comparison.

- **Do not** ask a vision model "are these the same character?" while showing it
  both images and your intended answer. That is the anchoring failure this
  project measured at +11 points of suppressed disagreement.
- **Preferred:** an embedding distance between character crops across shots
  (any image embedding model), reported against two anchors — the same
  character in two frames of a *real* trailer (the floor we want to reach) and
  two *different* characters (the ceiling of failure). A number without those
  anchors means nothing.
- **Also run the naive human check**, because it is the actual acceptance test:
  show three shots to someone cold and ask what they notice. If they say "why
  does his jacket change", the embedding score is irrelevant.

## The bar

**Three shots. One character, one location, three different camera setups —
a wide, a medium and a close — that a viewer accepts as the same scene.**

Three is deliberate: two shots can match by luck, and twenty is not needed to
learn whether the technique holds. If three works, scaling to thirty is an
engineering problem. If three fails, the trailer pipeline needs a different
plan and it is much better to know that before building the structure lane on
top of it.

## Ops notes that will otherwise cost hours

Learned the hard way in the session that produced this brief:

- **Flux and H3 cannot both be loaded.** Both stages must run sequentially with
  the engine restarted between them, or ComfyUI dies with
  `HostBuffer.read_file_slice failed`.
- **Watch the system commit charge, not free RAM.** Commit reached 95% of its
  limit while VRAM was only 69% used. Commit exhaustion is what produces the
  allocation failures, and free-RAM headroom does not predict it.
- **A preflight cannot bound growth.** ComfyUI's footprint climbs across a
  batch (33 GB observed) and its `/free` endpoint does not return it. Recycle
  the process periodically — `guard.recycle_comfy()`.
- **Reclaim stale engines before measuring, not after.** A previous run's
  engine holding 32 GB will make a perfectly viable run look impossible.
- **Every failure here presents as silence** — a stalled queue, a vanished
  process, a closed socket — never an exception at the call site. Read the
  redirected stderr file first; symptom-reading is slower and wrong more often.
- Launch long runs detached (`Start-Process ... -WindowStyle Hidden`); a
  foreground command window will be killed at ~10 minutes and take the run with
  it.

## What a good outcome looks like

Not "consistency solved". A clear statement of **which technique holds at what
distance** — within a continuous action, across a cut, across a whole trailer —
and what each costs. That is enough for the structure lane to be designed
against something real instead of an assumption.
