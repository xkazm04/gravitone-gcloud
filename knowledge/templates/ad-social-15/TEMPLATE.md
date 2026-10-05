# Template — ad-social-15 (social vertical ad, 6–20s, target 15s)

One idea that sells one thing, built for a vertical feed and read with the sound off. It is the
first template in the **ads** discipline. The other is [`ad-spot-30`](../ad-spot-30/TEMPLATE.md).

**An ad is not a promotional cut.** The `teaser` / `trailer` / `cinematic` family sells *another*
artifact and succeeds by leaving its gap open. An ad sells a product and **pays its own debt** inside
its own runtime. The registry draws that line in `short-ad-structure`:

> "If the piece exists to make someone watch, play or attend something else, it belongs to the trailer
> subject, and a withheld payoff is correct there. If it exists to make someone believe a claim about
> a product, it belongs here, and a withheld payoff is a defect."

So the habits of the promotional templates read backwards here. In those templates, withholding is
the product. In this one, the payoff lands before the ask.

## ⚠ Two gaps in the evidence, stated up front

**1 · The corpus for this template is n=0.** Nothing has been torn down, timed or counted in this
repo. Every figure on this page is doctrine from four AI-registry subjects forged on 2026-10-06:

- `media-generation/narrative-craft/ad-concept-ideation`
- `media-generation/narrative-craft/short-ad-structure`
- `media-generation/visual-generation/still-to-motion-direction`
- `media-generation/production-ops/ad-finishing`

Each is cited by technique below. Those subjects grade their own sources, and the grades are carried
here unchanged.

**2 · The evidence behind the doctrine was gathered on filmed ads, not generated ones.** The
peer-reviewed results — brand pulsing against avoidance, and brand timing against entertainment —
come from TV and online video ads that were shot. The registry says so in `short-ad-structure`: "most
of the evidence above was measured on broadcast and online video ads that were filmed, not
generated." Nobody has checked that the structure transfers to a cut made from four generated stills
animated into clips. It is the best doctrine available, and it is not a measurement of this format as
this studio makes it.

## The format

| Property | Value | Source |
|---|---|---|
| Duration | **6–20s**, studio default 15 | ASSUMED · `lib/projects.ts` range; the registry's rungs are "roughly six, fifteen and thirty seconds" (`length-rungs`) · **n=0** |
| Aspect | **9:16**, composed natively, never cropped from wide | OBSERVED · `still-to-motion-direction/animatable-key-image` rule 5: "Generate the still at the clip's aspect ratio" |
| Parts (15s rung) | **hook · truth · payoff · end card** — the set-up merges into the hook; the turn is dropped | OBSERVED · `length-rungs`: "Fifteen seconds: hook, truth, payoff, end card" |
| Parts (6s floor) | **one image and the brand** | OBSERVED · `length-rungs`: "Six seconds: one image and the brand" |
| Shot count | **2–5 shots + end card** at 15s; **1 + end card** at 6s | INFERRED · `timed-shot-list` arithmetic (reserve the card, ~1.5s floor per new image, each shot ≤ one clip's usable span) against the pipeline's 1–6 cap. Not measured |
| Hook window | **first shot, first 1–2s**, product-tied, readable muted | OBSERVED · `product-tied-hook`; platform guidance "the core proposition in the first three seconds" is **vendor-grade** |
| Brand timing | a **cue in the opening shots**, brief **pulses** through the middle, brand on the end card. No logo card first, no watermark | OBSERVED · `brand-presence-timing` (peer-reviewed: pulsing "cut avoidance by about 8% on average") |
| End-card hold | **≥ the card's reading time**; ~2s is the only practitioner figure, and it comes from six-second ads | OBSERVED · `payoff-before-ask` / `end-card-and-lockup`: "No platform or standard publishes an end-card duration" — **lore** |
| Super hold | **0.2s per word + 2s** (≤9 words) or **+3s** (≥10) | OBSERVED · `drawn-supers`, quoting a broadcast regulator. **Regulator-grade for UK TV, adopted by choice** |
| Safe zone (vertical) | load-bearing elements clear of **~14% top, ~35% bottom, ~6% sides**; band shifted slightly left of centre | OBSERVED · `safe-zones-per-placement` — **vendor-grade, one platform family, read 2026**; other platforms publish overlays only |
| Sound posture | **sound-off first**; one music bed; generated clip audio stripped by default | OBSERVED · `single-bed-loudness`; `product-tied-hook` procedure 2 |
| Loudness | **~−14 to −16 LUFS integrated, −1 dBTP**, short-term ≤ integrated +5 LU | OBSERVED · `single-bed-loudness` — the social target is **lore** (no platform publishes one); the short-term rule is borrowed from the broadcast short-form standard |
| Lettering in plates | **none, ever** | OBSERVED · `animatable-key-image` rule 4; law `checkability-routes-the-pixel` |
| Frame density / words | **nothing measured** | — · no `params.json`, on purpose |

## Sources

**None in this repo.** There is no `sources/` and no `corpus/`. The upstream documents are:

| | What it is | Grade |
|---|---|---|
| registry · `narrative-craft/ad-concept-ideation` | golden path + 6 techniques, `status: forged` — the authority for the **Idea** round | doctrine, forged; mix of peer-reviewed (creativity templates, 1999; LLM homogenization) and preprint (prompting) |
| registry · `narrative-craft/short-ad-structure` | golden path + 6 techniques — the authority for the **Scenario** round | doctrine, forged; peer-reviewed brand-timing spine, vendor-grade platform guidance |
| registry · `visual-generation/still-to-motion-direction` | golden path + 6 techniques — **key image + motion line** | doctrine, forged; vendor-grade i2v guides that disagree with each other, plus peer-reviewed benchmarks |
| registry · `production-ops/ad-finishing` | golden path + 6 techniques — **Finish** | doctrine, forged; standard/regulator-grade loudness and super holds, vendor-grade safe zones |

## The steps

| # | Step | Studio phase | Knowledge |
|---|---|---|---|
| 01 | **Script** — brief → ideas → scenarios | Script (research rounds) | [`steps/01-script/`](steps/01-script/) — **n=0**, doctrine only |
| 02–05 | Frames (stills) · Motion (i2v) · Score · Cut / Finish | — | not started here; the registry subjects above are the doctrine |

## What makes this template hard

1. **The idea is most of the work, and a model's default idea is the wrong one.** The registry's
   governing fact for ideation is that models "regress toward the typical". Single model ideas rate as
   competent, while the sets they come from are narrow. The fix is structural (one angle per slot, a
   banality floor, gates), and so is the failure.
2. **Fifteen seconds is four images.** Once the idea is chosen, the scenario is a timed shot list, and
   "which four, in what order, for how long each, is most of what can still go right or wrong"
   (`short-ad-structure`).
3. **Every checkable thing is drawn, not generated.** That covers supers, the logo, the product's
   label, the call to action and any price. The generated plates are composed to carry none of them,
   so the Finish step is where the ad's claims actually enter the picture.
4. **Nothing here can say whether an ad works.** "A structural pass is evidence that an ad is
   well-formed. Reporting it as evidence of effectiveness is the confusion `unmeasured-is-not-pass`
   exists to prevent." This studio has no recall or attribution test.
