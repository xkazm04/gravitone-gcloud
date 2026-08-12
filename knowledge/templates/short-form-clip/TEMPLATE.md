# Template — short-form clip (≤60s, target ≤30s)

Engagement-first clips, most often **derived from a mid-length video** in the
[`mid-educational-video`](../mid-educational-video/TEMPLATE.md) template.

## ⚠ A gap in the evidence, stated up front

The brief asks for **max 30 seconds**. The three sources studied are **40s, 53s and 57s** — the best
short-form work available from the channels this studio is modelling on sits at 40–60s, because that
is the YouTube Shorts ceiling and creators use it. **Nothing in this document is measured below 40
seconds.** The compression from 40s → 25s is currently INFERRED and is the template's first open
question.

## What a short is not

The brief suggests *"Did you know"* / *"Fun fact"* framing. **None of the three studied shorts uses
it**, and that is a finding rather than an oversight. Each opens with something stronger:

| Studied opening | Why it beats "did you know" |
|---|---|
| *"this is not Target"* | a flat contradiction — the viewer must resolve it |
| *"it's 3am, your code is broken, you have no idea where your kids are"* | a scenario the viewer is already inside |
| *"if you want to get a job as a programmer you need to know Big O"* | a stake attached to the viewer's own life |

*"Did you know"* announces that a fact is coming, which gives the viewer a moment to decide they don't
care. A contradiction, a scenario or a stake gives them a reason to stay before they know what the
subject is. **Treat "did you know" as a fallback, not a form.**

## The format

| Property | Value | Source |
|---|---|---|
| Duration | 40–60s measured; **≤30s target is unverified** | MEASURED n=3 |
| Words | 110–235 | MEASURED |
| Rate | **125–247 wpm** | MEASURED — the widest spread in the whole corpus |
| Ideas | exactly **one** | OBSERVED · all three |
| Hook | at 0:00, zero setup, zero branding | OBSERVED · all three |
| Engines | **F · Anchor Ladder** · **G · Paradox Teaser** · **B · Effort/Payoff** in miniature | see [`ENGINES.md`](../../ENGINES.md) |

The rate spread is the headline mechanical fact: PolyMatter's *Target* runs **125 wpm** because the
images carry the argument, Fireship's *Big O* runs **247 wpm** because the narration is the argument.
**Rate in short form is a function of the visual plan, not of pacing taste.**

## Sources

| | Engine | Length | Rate | Derived? |
|---|---|---|---|---|
| [Fireship, *Big O with a deck of cards*](steps/01-script/sources/fireship--big-o-cards.md) | F · Anchor Ladder | 0:57 | 247 wpm | standalone |
| [PolyMatter, *This is Not Target*](steps/01-script/sources/polymatter--not-target.md) | G · Paradox Teaser | 0:53 | 125 wpm | **derived** |
| [Fireship, *rubber duck debugging*](steps/01-script/sources/fireship--rubber-duck.md) | B · Effort/Payoff | 0:40 | 224 wpm | standalone |

## The steps

| # | Step | Studio phase | Knowledge |
|---|---|---|---|
| 01 | **Script** | Script | [`steps/01-script/`](steps/01-script/) — n=3 |
| 02–05 | Frames · Motion · Score · Cut | — | not started |

## What makes this template hard

1. **There is no room to recover.** A mid-length video can survive a weak first beat. A 30-second clip
   that opens badly has no second act.
2. **Derivation is not extraction.** A clip cut out of a long video inherits context it no longer has.
   The derived-short contract in `steps/01-script/PATTERNS.md` §4 exists because the naive version —
   clip the best 30 seconds — reliably produces something that makes sense only to people who already
   watched.
3. **One idea means one.** All three sources hold exactly one, and the Anchor Ladder only appears to
   break that rule: five complexity classes, but one object and one idea (cost grows differently for
   different work).
