# Script patterns — cinematic (60–120s)

Read [`CRAFT-BASELINE.md`](../../../../CRAFT-BASELINE.md) and
[`ENGINES.md`](../../../../ENGINES.md) first, then the **[trailer step's
patterns](../../../trailer/steps/01-script/PATTERNS.md)**, which own the spine, the escalation
anatomy, the reset and the promise ledger. **All of that applies here unchanged and is not repeated.**

This file covers only what is specific to a cut made **before the work exists**: the planning order,
the material question, wordlessness, and the trust problem. It is the shortest of the three files
because it is the one with the least evidence — see §6.

**Sources:** n=0 in this repo, and **the AI registry does not model this format at all**: its
`length-ladder` names the long cut, the teaser, the spot and the platform cut, and none of them is
this. Almost everything below comes from a single `.vault/` dossier.

---

## 1. It is a STAGE, not a length — and that decides which template a project is

Vault **C7** (High), quoting S3, a working game-trailer editor: cinematic trailers "present impressive
imagery **when gameplay isn't ready**."

The distinguishing question is therefore about the *work being sold*, not about the cut:

| Ask | If yes | If no |
|---|---|---|
| Will the finished work contain material this cut is standing in for? | **`cinematic`** — the plates are a promise about something that does not exist | **`trailer`** — the cut is assembled from the work's own material |

The duration band overlapping `trailer`'s is a consequence of this, not a defect in the taxonomy. Two
projects of identical length can be different templates, and that is the claim C7 makes.

**For an AI-composed studio this is close to always true**, which makes `cinematic` the default
promotional template here rather than the exotic one. That inversion is worth stating because it is
the opposite of the situation the source describes, where a cinematic is the exception a studio
reaches for when the real footage has slipped.

## 2. The curve is drawn before the shots — and this is a different planning order from the spine

The trailer's spine is a *part list* fitted to cue boundaries. A cinematic's plan starts one level
above that, as a **shape**. Vault **C8** (High), quoting S8, a first-party studio post that published
the graph itself:

> "an emotional curve graph"; "a crescendo of emotions in the first half", "a sudden plummet into a
> super slow motion sequence", then victory.

Four movements: **crescendo → interruption / slow-motion plunge → rebuild → climax.** The field note
attached is the reason this ordering is not optional:

> "studios lock pacing on that graph **before expensive animation**."

That is a production-economics argument, not an aesthetic one, and it transfers to this studio
directly: generation is the expensive step, and a curve locked first is what stops it being spent on
plates that have no position.

Note the relationship to the trailer's dip (§2 there) — **the plunge is the same device seen from a
different discipline.** The trailer's `dynamic-reset` describes it in the cue; C8 describes it in the
emotional plan. They are one thing, and if the two ever disagree the registry says the cue wins,
because "a boundary the music does not mark is a boundary the viewer cannot perceive."

The vault's own beat sheet places it as beat 9 of 13 ("Slow-mo plunge / breath, 4–8 s, energy valley
before climax") — durations OBSERVED from one template, not measured, and the sheet's own header says
"scale durations proportionally for 60 s", which is the uniform-trimming move the registry's
`length-ladder` names as the defect. **Take the sheet's ORDER, not its arithmetic.**

## 3. It may legitimately carry no words at all

Vault **C29**, and the vault grades it *Medium* on **n=1**. Quoting S8:

> For Honor's announce trailer: "**no dialogue, no voice-over, and no text**" — a single uncut sequence
> shot, so that it travels across languages.

This is the one place where a cinematic's script step should be able to produce **an empty dialogue
track and still be complete**. Two consequences:

- The trailer's cobbled-dialogue machinery (§5 there) has nothing to operate on, and its assembly
  problem shrinks to juxtaposition alone — which is the half that is hardest to audit, not the easy
  half.
- The `promise-ledger`'s claim-level audit ("easy to audit because it is text") is **empty by
  construction**, leaving only promises by *register* and by *assembly* — the two the ledger warns
  "never appear in a claim-level audit and are among the most common real complaints."

So a wordless cinematic is not a simpler object to check. It is one where the only checkable surface
has been removed.

The vault flags its own limit here in its counter-evidence: "Zero-text announce (C29) worked for a
melee game with universal imagery; **narrative concept pitches often need one line of VO to frame the
premise**."

## 4. The trust problem is this format's structural weakness

Its definition and its weakness are the same fact. From the vault's counter-evidence section:

> "Lieu (S3) notes cinematic/announce trailers are used precisely when gameplay 'isn't ready' —
> **audiences increasingly distrust pure-cinematic reveals**; for games, the plate pipeline should
> plan a gameplay or in-engine beat early in the campaign."

Read through `promise-ledger`, this is a **promise by register**: the grade, the cue and the finish
promise a fidelity, and no line has to be spoken for the promise to be made. The ledger's grading of
that failure is the one that matters — "*Partly paid* — the work delivers something adjacent, **which
is where most disappointment actually comes from**."

**And this studio cannot run the ledger's repair.** The ledger's own "when not to use it" is explicit:

> "**When the work does not exist yet.** A concept piece or a pre-production promotion has no payer to
> name for anything, which makes the ledger empty rather than clean. The honest instrument there is a
> **statement of intent**, and the ledger becomes runnable once there is a cut of the work."

That is a precise description of a Gravitone cinematic, and it names the correct substitute. The Script
step's honest output for this format is therefore an **intent statement** — what the finished work is
claimed to look and feel like — rather than a payer list. See `c3` in
[`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md).

## 5. Discover the duration by blocking, not by choosing it

Vault **C20**, quoting S9 (Dave Wilson, on Blur's Elder Scrolls Online cinematic):

> "shoot the stunt performers very quickly in a week or two and get an idea of **how long the cinematic
> was running**"

— mocap cameras for a "boots on the ground" feel, refined in previs. The rule the vault draws: block
with performers, even phone video, and cut that into the animatic **before committing boards**,
"because it reveals true duration and camera in days, not weeks."

The transferable half for a studio with no performers is the *order*: **a rough cut of placeholders,
timed, before any plate is generated.** The `targetS` a director types into the create dialog is a
target, not a measurement, and this is the format where the gap between the two is discovered latest
and most expensively.

## 6. Confidence and limits — this is the thinnest file in the library

- **n=0 here, and the registry is silent.** `trailer-structure` does not name a cinematic rung.
  Everything in §§1–5 is one dossier's reading.
- **C29 is n=1** and the vault grades it Medium; the vault also supplies its own counter-case (§3).
- **C8's curve comes from one first-party post about one game.** It is High confidence in the vault
  because the studio published the graph, not because anyone counted across studios.
- **The beat sheet's durations are a template, not a measurement**, and its "scale proportionally"
  instruction contradicts the registry's `length-ladder`. §2.
- **The 8-minute cinematic short is out of scope** — the vault records Blizzard's "Zero Hour (8 min)"
  in C17's field notes, and a piece of that length is a work, not a promotion. See `c1`.
- **`.vault/` is gitignored and the repo calls it disposable.** The primary source for this template
  is a file that is not versioned with it. That is the single largest fragility on this page and it is
  `c5`.
