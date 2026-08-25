# Open questions — cinematic script step

Opened 2026-08-25, when the three promotional templates were added to the catalogue. **This is the
thinnest template in the library.** It is `n=0` here, the AI registry does not model the format at
all, and its distinguishing content rests on a single `.vault/` dossier — one of whose load-bearing
claims is `n=1`.

---

### c1 · Where does a cinematic stop being a promotion and become a work? ⭐
The band on this template is 60–120s, from the vault's own beat-sheet header. But the same dossier
records Blizzard's *Overwatch* "**Zero Hour (8 min)**" (C17 field notes) and cites fxguide on Blur's
Elder Scrolls Online cinematic — pieces made by the same pipeline, at the same fidelity, five to eight
times longer. At some length the piece stops selling something else and becomes the thing being
watched, which puts it under a different subject entirely (the registry: "when the artifact under
review *is* the thing being watched, the neighbour owns it").
*Settles it:* a rule, not a corpus — most likely "does it open a debt another artifact pays, or does it
pay its own?" But nobody has checked whether an 8-minute studio cinematic actually pays its own debts
or is still promotional. **Until then this template covers the short case only, and says so.**

### c2 · What would a `params.json` need? ⭐
Not written — [`knowledge/README.md`](../../../../README.md)'s contract, and the refusal precedent in
[`short-educational-video/steps/02-frames/PATTERNS.md`](../../../short-educational-video/steps/02-frames/PATTERNS.md).
This template is the one where writing one would do the most damage, because its numbers are the
weakest in the library:

| Field | What it would hold | What it needs first |
|---|---|---|
| `curve.movements` | crescendo · plunge · rebuild · climax, as an ordered enum | **writable today** — C8 states the order, from a first-party post that published the graph |
| `curve.*.durationS` | how long each movement runs | **nothing usable.** The beat sheet's per-beat durations are one template's numbers, and its own instruction to "scale durations proportionally for 60 s" is the uniform-trimming move the registry names as the defect |
| `duration.{min,default,max}` | 60 / 120 / 120 | a timed corpus, plus `c1` for the upper boundary |
| `dialogue.required` | `false` | **writable today**, but it rests on `n=1` (C29, graded Medium by the vault) and the vault supplies its own counter-case in the same document |
| `plateCount` · `platesPerMinute` | pacing | **nothing.** No frame-density figure exists for any format in this library; the Frames step says so and ships no `params.json` for the same reason |
| `yield` | generations per usable clip | the vault has four documented productions (C21) with keep rates of **14%**, **25%**, and a "social tier 60–85%" — and its own counter-evidence says "yields vary by quality bar and tool generation; treat C21 as a **planning prior, not a benchmark**." Encoding it would convert a prior into a target |

The `yield` row is the sharpest illustration of why this file exists: there are real numbers available,
they are from four real productions, and the source that supplies them says in writing that they are
not a benchmark. A `params.json` has no field for that sentence.

### c3 · The promise ledger cannot run here, and the substitute is unbuilt ⭐
`promise-ledger`'s own *when not to use it*: "**When the work does not exist yet.** A concept piece or
a pre-production promotion has no payer to name for anything, which makes the ledger empty rather than
clean. The honest instrument there is a **statement of intent**, and the ledger becomes runnable once
there is a cut of the work."
That describes every cinematic this studio will make. So the format's central honesty instrument is
unavailable, and the named substitute — a statement of intent — is not an artifact this studio has.
*Settles it:* a design decision. What would an intent statement contain, who signs it, and what later
checks it against the finished work? Until there is one, a cinematic here makes promises by register
with nothing recording them.

### c4 · Is `cinematic` the DEFAULT promotional template here rather than the exception?
`PATTERNS.md` §1 argues it is: the source describes a cinematic as what a studio reaches for when real
footage is not ready, and in an AI studio real footage is *never* ready. If that holds, `trailer` is
the rare case and the catalogue's framing is backwards from the user's point of view.
*Settles it:* watching which template real projects pick, once these ids have been in the dialog long
enough for that to mean anything. **This is a question the product can answer by itself**, which makes
it the cheapest one on the page.

### c5 · The primary source is gitignored ⭐
`.vault/Research/2026-08-23-trailer-cinematic-grammar.md` is the main source for this template, and
`.vault/` is gitignored — the repo's own `knowledge/README.md` calls it "disposable" and versions
`knowledge/` precisely because it is not. So this template's evidence can vanish from a fresh clone
while the template that quotes it remains, at which point the quotes become unverifiable authority:
exactly the failure the evidence contract is written against.
*Settles it:* either the dossier's C-claims relevant to this template are promoted into
`sources/`-style teardowns under `knowledge/` (the library's normal shape, and what `/research`'s
Bucket D is supposed to produce), or a fetched copy of S3/S8/S30 is checked in. **The quotes in this
template are the mitigation, not the fix** — they are at least reproduced here rather than referenced.

### c6 · Does the trailer's spine apply unchanged, or does the curve replace it?
`PATTERNS.md` says the spine applies unchanged and only the planning order differs, treating C8's
plunge and the registry's `dynamic-reset` as one device seen from two disciplines. That is an INFERRED
identification made here, across two independent bodies of doctrine, on no evidence beyond their
shapes matching.
*Settles it:* a cinematic planned both ways — parts-first against cue boundaries, and curve-first —
and a comparison of where the boundaries actually land. If they land in the same places the
identification is sound; if not, this template needs its own structure section rather than a deferral.

---

## Not asked

**Whether audiences distrust this format enough to matter.** `PATTERNS.md` §4 records the vault's
counter-evidence that they increasingly do. Quantifying it would need audience data this studio has no
channel to, and the craft-level response — plan a beat made of real material early — is already
recorded as the practitioner answer.
