# Template — trailer (90–150s)

The full spine, and the only promotional rung with room to open strong, **fall back**, and build to a
peak. A piece whose product is an **unpaid debt**: it succeeds by opening a gap another artifact
closes.

## Three contracts, not three lengths

This template has two siblings — [`teaser`](../teaser/TEMPLATE.md) and
[`cinematic`](../cinematic/TEMPLATE.md) — and they are **three ids rather than one id with a wide
`range`**, for a reason that is stated by both sources and is worth reading before using any of them.

The `.vault/` dossier's claim **C7** ("Teaser vs trailer vs cinematic are different contracts") gives
the *what*:

> "When the asset is a teaser/announce, keep it under ~60 s with one hook, heavy on imagery and tone
> and light on story; a full trailer is ~90–150 s and may spell out plot; a cinematic trailer exists
> to deliver impressive imagery when gameplay/footage is not ready — **because each is made at a
> different stage with different material.**"

The registry's `length-ladder` gives the *why it cannot be a slider*:

> "One campaign ships several cuts of very different lengths, and **they are not versions of each
> other** — they are rungs of a ladder, each with its own part count. […] Halving a cut does not halve
> its parts. It **removes** parts, in a known order."

A single `trailer` id with a `range` of 15–150 would encode exactly the uniform-trimming model that
technique exists to prevent. And `cinematic` is not a rung of that ladder at all — it is a
**production stage**, which is why its band overlaps this one's.

## The format

| Property | Value | Source |
|---|---|---|
| Duration | **90–150s**; the studio default is 120 | OBSERVED · vault C7 (S30: trailer 1.5–2 min) · **n=0**, no cut timed here |
| Hard ceiling | **2:30**, "with a single annual exception per distributor under the exhibitor-facing advertising rules" | OBSERVED · registry `trailer-structure` — an external rule, not a craft preference |
| Centre of gravity | "just above two minutes", stable "across nine decades of releases" | MEASURED **elsewhere** · registry `trailer-structure`; the underlying n is not given, and "trailers keep getting longer" is a claim the registry says the measurement does not support |
| Parts | **four** + an optional button — cold open · introduction · escalation · climax | OBSERVED · registry `trailer-structure`; vault C1 (S1, S2, S5 converge) |
| Shape | open strong → **dip** → build → peak. "The dip is not a lull. It is where the debt gets opened." | OBSERVED · registry `trailer-structure` |
| Escalation | rungs that close; **one raised variable each** (scale · threat · speed · intimacy · cost) | OBSERVED · registry `escalation-without-mechanism` |
| Rung floor | "below roughly ten seconds per rung the closure disappears" | OBSERVED · registry `escalation-without-mechanism`, procedure §1 |
| Dynamic reset | **exactly one**, immediately before the peak | OBSERVED · registry `dynamic-reset` ("when there are three or more, remove all but one") |
| Reset's signature | a **spike in shot length immediately before the peak**, in an otherwise falling curve | MEASURED **elsewhere** · registry cites a published analysis of **n=130 releases over sixty years**, which also found average shot length *and its variance* both decline over time |
| Withholding default | hold the turn · hold the resolution · **imply** the reveal · spend the best moment only against a decision | OBSERVED · registry `withholding-budget` |
| Plot | **may be spelled out** — the one thing this rung is allowed that the teaser is not | OBSERVED · vault C7 (S5: the Hobbs & Shaw trailer spelled plot, the Joker teaser posed questions) |
| Frame density | **nothing measured** | — · no `params.json`, on purpose |

The falling-variance result is the more interesting half of the n=130 study and the registry says so:
falling variance is "a measurable form of *generic*".

## ⚠ The evidence gap

**The corpus for this template is n=0.** No trailer has been torn down here, no act boundary timed, no
shot-length curve computed. Everything above is doctrine written elsewhere, cited inline. Compare the
three educational templates, whose figures come from transcripts read in full and a `metrics.py` that
produced them.

Two consequences worth holding:

- **The two MEASURED rows measure something else.** The n=130 analysis and the nine-decade centre of
  gravity are counts of *theatrical film trailers*. This studio makes AI-composed cuts of a different
  kind of work, and nobody has checked that the structural statistics transfer. They are the best
  numbers available and they are not measurements of this format as this studio will make it.
- **The spine is a default, not a gate.** The registry is emphatic: award-winning cutters in the
  specialty lane "map a work's **mood** rather than its plot", and "the structure alone cannot tell
  you" whether a deviation is a choice or a defect. Anything downstream that checks a cut against
  this table must report the deviation, never fail on it.

## Sources

**None in this repo** — no `sources/`, no `corpus/`. The two upstream documents:

| | What it is | Grade |
|---|---|---|
| AI registry · `media-generation/narrative-craft/trailer-structure` | golden path + six techniques (`promise-ledger`, `withholding-budget`, `escalation-without-mechanism`, `dynamic-reset`, `cue-first-assembly`, `length-ladder`), `status: forged` | doctrine, forged |
| `.vault/Research/2026-08-23-trailer-cinematic-grammar.md` | 31-source dossier. **`.vault/` is gitignored and disposable** — claims are cited with their id and the vault's own confidence grade, never imported wholesale. | research dossier |

## The steps

| # | Step | Studio phase | Knowledge |
|---|---|---|---|
| 01 | **Script** | Script | [`steps/01-script/`](steps/01-script/) — **n=0**, doctrine only. Now carries a [`params.json`](steps/01-script/params.json) the structural checker reads rather than restates |
| 02 | Frames | Frames | not started |
| 03 | **Score** | Score | [`steps/03-score/`](steps/03-score/) — **n=0** for the craft; **one measurement, n=3**, of this repo's own demo cues |
| 04 | Cut | Cut | not started |

The numbering skips no step: `motion` was retired into Frames (`lib/projects.ts` →
`RETIRED_PHASES`), so the studio's steps are `research → script → frames → score → cut` and Score is
the third with a knowledge directory. `knowledge/README.md`'s contents table still says
`03-motion · 04-score · 05-cut`, from before that merge.

## What makes this template hard

1. **The naive shape is a ramp, and the correct shape is almost its opposite.** "Open strong to arrest
   attention, then *fall back* to a quiet setup, and build from there to a peak." A cut with no dip has
   spent its ceiling in the first fifteen seconds — and every instinct in an assembly tool pushes
   toward the ramp, because a ramp is what "ordered by size" produces.
2. **Its escalation looks like a reversal chain and is not one.** A turn in a self-sufficient piece
   delivers the **mechanism** — the reason the expectation was wrong. Here the mechanism is the thing
   being sold, so it cannot be delivered. What replaces it is **closure**, not size: each rung finishes
   a piece of information before the next begins. The naive substitute (bigger, louder, faster)
   produces the form's most common defect, "one long beat repeated".
3. **The honesty problem lives in the assembly, not in the claims.** Dialogue here is *cobbled* —
   sub-clipped from anywhere and reassembled into a sentence the work never says. Two true images
   placed adjacently assert a relationship neither contains, and "the shots are all real" is not a
   defence. The `promise-ledger` pass that catches this can only be run **from ignorance**, by someone
   who has not seen the work, which is precisely who is never in the room.
4. **Music is the parent, not a track.** The acts of the finished cut *are* the movements of the cue,
   and "a late note asking to try a different cue is the worst note there is, because everything is cut
   to the music." The registry states the tooling corollary directly: "In a tool, model the cue as the
   timeline's parent, not as a track." **This studio's phase order is Script → Frames → Score → Cut**,
   which puts the score *after* the picture — the inverted dependency, by construction. That is a
   product-shaped finding, and it is `r3` in
   [`steps/01-script/OPEN-QUESTIONS.md`](steps/01-script/OPEN-QUESTIONS.md).
5. **A checker can prove a cut is malformed and can never prove one works.** The instrument
   practitioners use is a survey whose questions are almost never about the artifact — what the viewer
   *understood*, what it *reminded them of*, what was *unclear*. This studio has no such instrument, and
   a green structural verdict must not be allowed to stand in for the unmeasured one.
