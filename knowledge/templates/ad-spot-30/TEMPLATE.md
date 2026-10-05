# Template — ad-spot-30 (spot ad, 20–45s, target 30s)

One idea with room for a small arc: set-up, turn, payoff, end card. It is delivered wide (16:9) or
square (1:1). It is the second template in the **ads** discipline. Its sibling is
[`ad-social-15`](../ad-social-15/TEMPLATE.md), which carries the full statement of why an ad is not a
promotional cut. That reasoning is not repeated here.

**Two ids, not one with a wide range, for the reason the registry gives.** `length-rungs`:

> "Short ads ship at a few standard lengths — roughly six, fifteen and thirty seconds — and the lengths
> are not one ad at three speeds. Each length holds a different number of **parts**, and a shorter
> version is made by **removing parts**, not by trimming every part."

A 30s spot holds all six parts. The 15s rung drops the set-up (it merges into the hook) and the turn.
A single id with a 6–45s range would encode the uniform trim the technique exists to prevent.

## ⚠ Two gaps in the evidence, stated up front

**1 · The corpus is n=0.** The doctrine comes from the same four registry subjects as `ad-social-15`,
forged 2026-10-06. Nothing has been timed here.

**2 · The 30s length effect rests on one campaign.** From `length-rungs`: "One research firm's 2026 test
of a single brand found fifteen- and thirty-second versions comparable on brand lift in social feeds,
with the thirty ahead on long-form placements. That is one campaign. The widely repeated ratios of
short-ad impact to thirty-second impact have no traceable source." Whether a 30s earns its extra
fifteen seconds is not known for any medium, let alone a generated one.

## The format

| Property | Value | Source |
|---|---|---|
| Duration | **20–45s**, studio default 30 | ASSUMED · `lib/projects.ts` range; the registry names the ~30s rung only · **n=0** |
| Aspect | **16:9 or 1:1**, chosen per project, composed natively | OBSERVED · `animatable-key-image` rule 5; `reframe-per-aspect`: "Square from either is the forgiving middle" |
| Parts | **hook · set-up · truth · turn · payoff · end card** | OBSERVED · `length-rungs`: "Thirty seconds: all six. Room for a small arc" |
| Drop order (if cut down) | turn → set-up → separate truth shot; **never** hook, payoff, brand, ask | OBSERVED · `length-rungs` §The drop order |
| Shot count | **4–6 shots + end card** | INFERRED · the pipeline cap is 6. A 30s picture budget (~26–27s after the card) over ≤6 shots means ~4.5s+ per shot, which sits at the edge of one 5s clip's usable span. See `s1` in OPEN-QUESTIONS |
| Hook window | first shot, first few seconds, product-tied | OBSERVED · `product-tied-hook`. The scroll pressure is lower on chosen placements: "a slower opening that builds a situation can earn its seconds" (*When not to use it*) |
| Brand timing | cue in the opening shots, pulses through the middle, brand on the card | OBSERVED · `brand-presence-timing` (peer-reviewed). Platform guidance for the "brand or product in the first five" seconds is **vendor-grade** |
| End-card hold | ≥ reading time, reserved first | OBSERVED · `end-card-and-lockup` — no published figure, **lore** |
| Super hold | 0.2s/word + 2s (≤9 words) / +3s (≥10) | OBSERVED · `drawn-supers` — **regulator-grade (UK TV), adopted** |
| Safe area | title-safe for wide/square players; a feed placement's overlay if it runs in one | OBSERVED · `safe-zones-per-placement` |
| Sound posture | **sound designed in**, sound-off still legible; one bed | OBSERVED · `single-bed-loudness`; wide placements are more often sound-on — INFERRED, not measured |
| Loudness | online ~−14 to −16 LUFS (**lore**). **Any broadcast use gets a separate −23 LUFS / −24 LKFS master**, max short-term −18 LUFS, −1 dBTP | OBSERVED · `single-bed-loudness`; the broadcast figures are **standard-grade** |
| Lettering in plates | none | OBSERVED · law `checkability-routes-the-pixel` |
| Frame density / words | nothing measured | — · no `params.json` |

## Sources

The same four registry subjects as [`ad-social-15`](../ad-social-15/TEMPLATE.md#sources). There is no
`sources/` and no `corpus/` here.

## The steps

| # | Step | Studio phase | Knowledge |
|---|---|---|---|
| 01 | **Script** — brief → ideas → scenarios | Script (research rounds) | [`steps/01-script/`](steps/01-script/) — n=0 |
| 02–05 | Frames · Motion · Score · Cut / Finish | — | not started here |

## What makes this template hard

1. **The turn is the most fun part and the first to go.** At 30s there is room for the idea's leap to
   develop: "the extreme pushed further, the analogy extended". But `length-rungs` names the turn as
   the most expendable part, "and the most painful to lose". A spot whose idea *only* works with its
   turn has no 15s sibling, and the template should say so rather than producing one.
2. **More seconds, same shot cap.** Six shots over thirty seconds pushes each shot toward or past one
   clip's usable span. The doctrine says to split at real cut points, not where a generator's cap falls.
   With a 6-shot cap, the spot's upper band (≥35s) may not be producible without longer clips.
3. **Longer shots expose generated motion.** Fidelity "decays with time and with the amount of
   motion" (`product-fidelity`). A 5s product shot in a spot is a longer test of the label than a 2s
   one in a social ad.
4. **Nothing measures whether it works**, as in the sibling.
