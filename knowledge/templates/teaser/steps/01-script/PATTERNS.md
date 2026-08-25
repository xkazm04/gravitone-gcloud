# Script patterns — teaser (≤60s)

Read [`CRAFT-BASELINE.md`](../../../../CRAFT-BASELINE.md) and
[`ENGINES.md`](../../../../ENGINES.md) first, and then read the **[trailer step's
patterns](../../../trailer/steps/01-script/PATTERNS.md)**, which own the full spine. This file covers
only **what a teaser removes from that spine, and in what order** — because that is the entire
difference between the two formats, and restating the spine here would put two copies of it in the
library.

**Sources:** n=0. Nothing torn down, timed or counted in this repo. Every rule below is doctrine
written elsewhere, cited by name. See the template's evidence gap.

---

## 1. Shortening is subtraction, not scaling

The single rule this format exists around. The registry's `length-ladder`:

> "Halving a cut does not halve its parts. It **removes** parts, in a known order."

And the failure it prevents, in the same paragraph:

> "**uniform trimming**: shortening every part proportionally, which produces a cut where the setup is
> too short to establish anything, the escalation is too compressed to close a single rung, and the
> peak arrives before the viewer has stakes."

**Procedure consequence, quoted:** "For each shorter rung, **choose a part count before choosing
content.** Two for a teaser, three for a spot. This is the decision; everything after it is
selection."

So the Script step's first act for a teaser is not writing — it is **committing to two parts**. A
context section, and one set-piece.

## 2. The drop order — what goes, from most to least expendable

Quoted from `length-ladder`, which calls this "the technique's actual content":

| # | Dropped | Why, in the source's words |
|---|---|---|
| 1 | **Exposition and the setup act** | "the single largest saving and the first thing practitioners name — a teaser keeps the premise and the best moments and nothing else" |
| 2 | **Dialogue line count** | "the cobbled sequence collapses to one or two lines, and at the shortest lengths to none" |
| 3 | **The escalation's middle rungs** | "Multi-step escalation becomes a single step: state, threat, payoff. Note this is dropping *rungs*, not shortening them — a rung that no longer closes is worse than a rung removed" |
| 4 | **The dynamic reset** | "At around thirty seconds there is no dynamic range to reset and the gap costs a tenth of the runtime" |
| 5 | **The separate cold open** | "It merges into the hook; the first seconds *are* the opening rather than being a distinct part before one" |

**Stop when the count is met.** The rule attached: "Delete whole parts down the drop order until the
count is met. **Never shorten a part below the length at which it closes.**"

And the floor, stated as a decision rule: "If no part can be removed, the cut is already at its floor
and the correct answer is that **this length is not available for this material**." That is a real
answer the Script step should be able to give, and it is not "make it shorter anyway".

## 3. What survives, and it is not what people expect

Two things, both counter-intuitive, both quoted:

**The title, the call-to-action and the button are LAST to go** — after the setup act, after the
dialogue, after the escalation rungs, after the reset.

> "The first two are contractual and are the only thing the cut is actually buying; the button
> survives because it carries the highest quote-to-a-friend value per second of any part."

**The cue's shape survives; the picture's does not.**

> "The standard construction for a short cut is to keep the music's opening and its climax and
> custom-edit the middle to connect the two. **The picture's structure is sacrificed and the music's
> is preserved** — which says plainly which of the two the form treats as load-bearing."

So a teaser is derived by re-deriving the cue for the new length ("rather than trimming the long cut's
audio") and fitting a two-part picture to it. The picture plan is the thing that gets thrown away.

## 4. The floor case, which is not a structure at all

> "**When the shortest rung has no room for a promise, give it a single unmistakable image and the
> call-to-action.** A fifteen-second cut that attempts a structure delivers three half-parts and no
> promise."

This is the studio's `range` floor (15s) meeting the doctrine: below the length at which two parts can
close, the correct output is **one image and a pointer**, not a miniature trailer. A Script step that
always emits beats will emit three half-beats here, and that is the defect.

## 5. Open immediately, and open in the picture

Two sources converge and they are not the same claim.

`length-ladder`, decision rule: "**Open in the first few seconds on every rung below the long cut.**
The patience assumption that makes a slow open viable exists only for a captive audience."

Vault **C2** (confidence High), on *how* to open — quoting S3/S4, a working game-trailer editor:

> "cold because it's sudden and mostly visual… a strong auditory opening might result in a negative
> reaction, especially if YouTube autoplay."

and S5 quoting Noam Kroll: the cut must work "even on mute", with title cards before the five-second
mark for social.

The registry does not duplicate hook-shape guidance and says so explicitly, deferring to
`production-ops/platform-format-adaptation/techniques/hook-shape-selection` — which is the same
technique the `short-form-clip` template's §1 is built on (contradiction · scenario · stake, and the
banned announced fact). **Reuse it. It is the one part of the short-form craft that transfers to this
format unchanged**, because the constraint it solves — the viewer decides in the first seconds — is
identical. Everything downstream of the hook inverts; the hook does not.

## 6. What is withheld is decided ONCE, for the whole family — not here

The teaser is where campaign drift starts, because it is usually cut first and approved on its own
performance. `withholding-budget` names the failure:

> "It is **revealing by drift** — a campaign where nobody ever decided, each successive cut showed
> slightly more than the last, and by the third one the work's central withheld asset had become a
> marketing asset with no one having chosen that."

and `length-ladder`'s decision rule points the same way: "**Do not let a later rung reveal what an
earlier one implied.** This is the most common breach, it happens across rungs rather than within one,
and it is the reason the budget binds to the campaign."

**Consequence for this studio, which does not model campaigns.** A Gravitone project is one cut. There
is no object here that a budget could bind to, so the mechanism that prevents the most common breach
in the form **does not exist in the product**. That is not a documentation gap; it is a missing
entity, and it is `t3` in [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md).

## 7. What this means for the Script step's UI

1. **A part-count commitment before any beat is written** — two, and the UI should say so rather than
   offering a beat list of arbitrary length (§1).
2. **The drop order as an explicit, ordered checklist** when a teaser is derived from a longer cut:
   which of the five was dropped, in order, and where it stopped (§2).
3. **A floor state.** Below the length at which two parts close, the step's honest output is *one
   image + call-to-action*, and it should be able to say "this length is not available for this
   material" (§4).
4. **The title and CTA are not optional fields.** They are the last things dropped and the only thing
   the cut is buying (§3).
5. **Nothing that offers "shorten by N%".** That control is the defect this whole file is about.

## 8. Confidence and limits

- **n=0.** No teaser has been torn down here. Every rule is transferred doctrine.
- **The registry's teaser rung is one of three below the long cut**, and this template collapses the
  spot and the platform cut into it — see the template's second evidence gap and `t1`.
- **The drop order is stated as craft knowledge, not as a measurement.** The registry gives no counts
  behind the ordering, and no n.
- **The ladder assumes a family.** `length-ladder`'s own "when not to use it" excludes "a
  single-deliverable piece" — "a cut with no siblings has no ladder, and the consistency machinery is
  overhead." A Gravitone project is currently a single deliverable, so this format is being applied
  slightly outside the condition its doctrine states. See `t3`.
- **Nothing here is validated against audience response**, and the registry says a structural check
  never can be.
