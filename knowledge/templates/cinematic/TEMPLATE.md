# Template — cinematic (60–120s)

A promotional cut made **when the real footage does not exist yet**. Its job is to deliver imagery the
work cannot yet show, and that is a description of a **production stage**, not of a length.

Sibling templates: [`teaser`](../teaser/TEMPLATE.md) and [`trailer`](../trailer/TEMPLATE.md). The
argument for three ids rather than one is in
[`trailer/TEMPLATE.md` § Three contracts](../trailer/TEMPLATE.md#three-contracts-not-three-lengths).

## ⚠ This is the one template whose band is not its definition

The duration below **overlaps the trailer's on purpose**, and the overlap is the point. The vault's
claim C7 separates a cinematic from a trailer by *when it is made and out of what*, not by how long it
runs:

> "a cinematic trailer exists to deliver impressive imagery **when gameplay/footage is not ready** —
> because each is made at a different stage with different material."
> — vault C7, quoting S3 (a working game-trailer editor): cinematic trailers "present impressive
> imagery when gameplay isn't ready."

So a project should be a `cinematic` when the **source material** is generated rather than captured —
which, for this studio, is nearly always true. Choosing between `trailer` and `cinematic` is therefore
a question about the *work being sold*, not about the cut: if the finished work will contain footage
that this cut is standing in for, it is a cinematic; if the cut is assembled from the work's own
material, it is a trailer.

**And the band is soft in one direction only.** The 60–120s figure is the vault's own beat sheet
header. Studio cinematics routinely run far longer — the vault records Blizzard's *Overwatch* "Zero
Hour (8 min)" in C17's field notes — but an eight-minute cinematic **short** is a piece of work in its
own right, not a promotional cut, and this template does not cover it. That boundary is `c1` in
[`steps/01-script/OPEN-QUESTIONS.md`](steps/01-script/OPEN-QUESTIONS.md).

## The format

| Property | Value | Source |
|---|---|---|
| Duration | **60–120s**; the studio default is 120 | OBSERVED · vault beat sheet header, "90–120 s cinematic trailer; scale durations proportionally for 60 s" · **n=0**, no cut timed here |
| Defined by | the production **stage** it is made at, not the runtime | OBSERVED · vault C7 (S3), confidence High |
| Register | "light on story, but heavy on imagery and tone" | OBSERVED · vault C7 quoting S3 |
| Planning order | **emotional curve first, shots against it** — crescendo → interruption / slow-motion plunge → rebuild → climax | OBSERVED · vault C8, quoting S8, a first-party studio post with the curve graph in it |
| Words | may be **none** — no dialogue, no voice-over, no on-screen text until the title | OBSERVED · vault C29, **n=1** first-party case (S8: "no dialogue, no voice-over, and no text"), graded *Medium* confidence by the vault itself |
| Cue | chosen at the animatic stage, before the work's own score exists | OBSERVED · vault C9 (S10: temp track chosen at animatic stage) · registry `cue-first-assembly`: "When the work's own score does not exist yet, do not wait for it." |
| Duration discovery | block with performers — even phone video — and cut it into the animatic before committing boards | OBSERVED · vault C20, quoting S9 (Dave Wilson): "shoot the stunt performers very quickly in a week or two and get an idea of how long the cinematic was running" |
| Frame density · plate count · finish | **nothing measured** | — · no `params.json`, on purpose |

## ⚠ The counter-evidence, which this template must carry rather than bury

The vault's own counter-evidence section names the format's structural weakness, and it is the same
fact as its definition:

> "**Cinematic trailers vs gameplay honesty.** Lieu (S3) notes cinematic/announce trailers are used
> precisely when gameplay 'isn't ready' — **audiences increasingly distrust pure-cinematic reveals**;
> for games, the plate pipeline should plan a gameplay or in-engine beat early in the campaign."

Read against the registry's `promise-ledger`, this is a **promise by register**: a cut whose grade,
cue and finish promise a fidelity the finished work will not have has made a false promise without a
single false statement — and it is the one failure that survives release, because it converts a viewer
and then loses them.

For an AI-composed studio this is not an edge case, it is the default condition. Every plate is
generated; none of it is footage of anything. **A cinematic here promises a look that nothing yet
guarantees the work will deliver**, and the honest instrument is the ledger's rule: name the payer.
That is `c3` in [`steps/01-script/OPEN-QUESTIONS.md`](steps/01-script/OPEN-QUESTIONS.md).

## The evidence gap

**The corpus for this template is n=0**, and it is the thinnest of the three: unlike `teaser` and
`trailer`, the AI registry's `trailer-structure` subject **does not name a cinematic rung at all**. Its
`length-ladder` lists the long cut, the teaser, the spot and the platform cut — four rungs, none of
them this. So this template's distinguishing content comes almost entirely from **one `.vault/`
dossier**, whose C29 rests on `n=1` and which the vault itself grades *Medium*.

Where the registry does apply it applies unchanged: withholding, escalation, the reset and the
cue-first dependency are properties of a promotional cut regardless of what its material is made of.
What is *specific* to this template — the curve-first planning order, the no-words option, the trust
problem — is single-source.

## Sources

**None in this repo** — no `sources/`, no `corpus/`.

| | What it is | Grade |
|---|---|---|
| `.vault/Research/2026-08-23-trailer-cinematic-grammar.md` | 31-source dossier; **the primary source for this template**, and `.vault/` is gitignored and disposable. Claims cited by id with the vault's own confidence grade. | research dossier |
| AI registry · `media-generation/narrative-craft/trailer-structure` | golden path + six techniques, `status: forged`. Applies to this format everywhere it is about promotion; **silent on the cinematic as a rung**. | doctrine, forged |

## The steps

| # | Step | Studio phase | Knowledge |
|---|---|---|---|
| 01 | **Script** | Script | [`steps/01-script/`](steps/01-script/) — **n=0**, doctrine only |
| 02–05 | Frames · Motion · Score · Cut | — | not started |

## What makes this template hard

1. **The picture is the whole deliverable, so it cannot borrow.** The other two formats can be carried
   by material they did not make — a strong performance, a real location, an existing score. This one
   has nothing behind the plates. Every weakness in the imagery is a weakness in the product.
2. **The planning order inverts the studio's own step order twice.** The curve is drawn before the
   shots (C8) and the cue is chosen before the picture (C9, and the registry's `cue-first-assembly`).
   This studio's phases run Script → Frames → Score → Cut, which puts both of those *after* the thing
   they are supposed to determine. Two inversions, one of them shared with `trailer` (§4 there).
3. **Its defining property is also the reason its audience distrusts it.** See the counter-evidence
   above. There is no craft move that resolves this; the literature's answer is to plan a beat made of
   real material early, which for this studio means having something real at all.
4. **Almost none of it is checkable.** `n=0` here, `n=1` for the no-words rule, and the registry does
   not model the format. A downstream checker built on this page would be checking one dossier's
   reading of one editor's taxonomy.
