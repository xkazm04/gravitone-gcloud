# Taste decks — 2026-08-23 (round 1)

Three decks of **paired prompts** for you to run by hand. Each pair isolates ONE rule from the
2026-08-23 research dossiers (`.vault/Research/2026-08-23-*.md`): **A** is our current house way
(or the common naive way), **B** is the same brief with exactly one rule applied. Nothing else
differs, so whichever you prefer is attributable to that rule.

| Deck | Use case | Pairs | Images (2 rolls/side) |
| --- | --- | --- | --- |
| `deck-01-explainer-plate.md` | infographic explainer plate, Signal Ledger house style | 10 | 40 |
| `deck-02-cinematic-key-art.md` | cinematic still / key art for a film or game concept | 10 | 40 |
| `deck-03-video-first-frame.md` | a still built to be the first frame of an I2V clip (+ its motion line) | 8 | 32 (+ optional 16 clips) |

## How to run a deck

1. Pick one provider and stay on it for the whole deck (Nano Banana 2 is our production
   generator; gpt-image-2 is the second dialect worth testing; Leonardo only if credits are idle).
   Note model name + version in the ledger header.
2. **Aspect ratio is an API/UI parameter, never prose** — set it per deck (each deck says which).
3. Roll each side twice (or use 2 fixed seeds where the tool offers seeds). Same seeds for A and B.
4. Look at A and B side by side. Record in `TASTE-LEDGER.md`: winner (A / B / tie), keep per
   image (would it ship as a plate?), and ONE line why. Don't score 1–10 — pairwise + one reason is
   the format both humans and judges are reliable in.
5. Don't read the "What the rule predicts" line until after you've judged — it is there so the
   later explanation pass knows what to look for, not to steer you.
6. ~10–12 minutes per deck. Stop when a pair is boring; note "no difference" — that's a result.

## Dialect notes

- **Nano Banana 2 (Gemini image)**: paste the prose as-is. No negative field — the prompts already
  phrase absences positively where the rule calls for it. Reference images: not used in round 1.
- **gpt-image-2**: paste the prose as-is; optionally wrap it in the five-slot form
  (`Scene / Subject / Important details / Use case / Constraints`) — Deck 01 pair E01-06 tests
  exactly that, so elsewhere keep it prose so only one thing varies.
- **Leonardo**: append the house negative list from `lib/stylePrompt.ts` (`NEGATIVE_PROMPT`) to
  BOTH sides of Deck 01 pairs (it's a vendor parameter, not part of the rule under test).

## After you've judged

The keepers (and their losing twins) go to the explanation pass — free checks first (text-leak
OCR, palette/role, aspect), Qwen only to *describe why the winner won*. Rules that win their pair
here get a second deck on fresh briefs before they're promoted into prompt cards / the registry.
