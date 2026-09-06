# Concept · what the guided research face deals

**From:** uat drain 2026-09-05-compose (C-001; DA-L1-3, OW-L1-3, PR-L1-5, KW-L1-10). **Status:** open.

## The problem, in the Characters' words
- Dani (mechanism-first explainer): "the three mechanisms the video is made of were never dealt; I
  found them on the expert board, again."
- Owen (narrative, reversal-first): "the four 'everyone thought X' cards are still one face away …
  go straight there."
- Priyanka (fact-vetter): "confirmed 29 cards after dealing me 8."
- Kwame (first-timer): the guided face deals only the unsourced tier; the sourced facts his senior
  bar needs are a modal or a face away.

Today `guided/passes.tsx` deals: the hottest take + the steel-man (stage 2) and the six other
conclusions (stage 3). Facts (21), mechanisms (3) and reversals (4) are in scope by default and never
shown. The review stage then confirms the whole scope. The guided face is the computed default for
every fresh project.

## What must hold whatever is decided
- A face switch writes only the face key; nothing decided in the wizard may live in the wizard.
- Conclusions stay opt-in and keep the words `not taken` / `taken`.
- The steel-man stays undealt-as-a-choice (no pick target) with a readable reason.
- The review stage must not confirm what it did not show without saying so (B-002 is the interim).

## Options
1. **Deal the graph, not the tier.** Add a stage between run and takes that deals the reversals
   (obvious reading on top, why-it-is-wrong beneath, keep/cut) and, under each, the facts it rests
   on as a collapsed group. Mechanisms are dealt as the reversal's engine. ~4 reversals × 3–6 facts
   fits one screen per reversal. Serves Owen and Dani; Priyanka gets the facts grouped by the turn
   they support, which is how legal reads them.
2. **A "vet the facts" stage for fact-first segments only**, chosen by template (short-edu / L&D)
   — deals the 21 facts by dimension with source lines. Cheaper, but a template is a weak proxy for
   the person.
3. **Keep the guided face as the "decisions only" face** and make the review stage honest: "8
   dealt, 28 in scope by default — review them on the expert board" (B-002). Zero design risk;
   does not serve any of the three voices' job.

## Recommendation
Option 1, with option 3 shipped first as the interim. Decide the stage order (reversals before or
after the hottest take) with a read-aloud on Owen's and Priyanka's scripts.

## Open questions
- Does a dealt fact carry a keep/cut, or only a "flag for deepen"? (Cutting facts wounds reversals —
  the arithmetic exists; the guided face would have to draw the wound on the reversal card.)
- Where does the source line go on a dense card — front or detail?
