# UAT · compose-from-scratch · 2026-09-05

**Mode:** `update` + `run` (the overlay already held 4 Characters / 1 journey / 1 run; this run added
a second journey and ten new content-creator Characters — the prior roster is untouched).
**Scope:** project creation → type selection → Research → Script composition. Stops before Frames
and before any image or music generation.
**Characters (10):** Dani (science explainer, mid-edu) · Kwame (history short, first-timer) · Lena
(finance Shorts, short-form clip) · Hana (kids STEM, mid-edu, 240 s override) · Priyanka (L&D module,
short-edu) · Owen (true-crime → free/facts) · Ravi (comedy sketch → free/beats) · Marco (indie game
trailer) · Sofia (festival teaser) · Yuki (animation cinematic) · Amara (brand launch → free/beats,
buyer).
**Levels:** L1 theoretical (ten parallel walkers over the code) → fixes → L2 live (chromium on ONE
persistent profile `uat/.profile`, `dev-automation-user`, port 3183). Every project the run created
is still in that profile; `created.json` lists them (14: ten Characters + four reruns/probes).
**Scope honesty:** the research run replays the Bitcoin notebook for every topic and the beat board
deals the Glass Harbor slots for every logline. L2 judged the interface and the contract, never the
fixture's content.

## Verdict

`L1-fail (5 of 10) / L1-conditional (5 of 10)` → **fixed in-session** → **`L2-pass` for all ten paths
(end to end)**, with the ceilings below. At HEAD, no trailer or free project could be created on a
fresh account at all: the style stage offered nothing and its only exit left the wizard. The L2
loop after the fixes: 10/10 Characters reached a Script surface with an adopted candidate or a
composed cut; 0 page errors in 15 journals; the only live FAILs are "observe" checks that confirm
open L1 findings, plus one harness artifact (the header pill is CSS-uppercased).

## Scorecard

| Character | Path | L1 | L2 | time-saved if it all worked | grounding |
|---|---|---|---|---|---|
| Dani | edu · mid 300 s · guided → duel | conditional | pass | ~330 of 420 min · med-low | run 0/5 · cand 3/4 |
| Kwame | edu · short 120 s · first-timer | conditional | pass | ~110 of 150 min · low | run 0/5 · cand 2/4 |
| Lena | edu · short-form 40 s | fail (runtime unread) | pass | ~38 of 50 min · low-med | run 0/5 · cand 3/4 |
| Hana | edu · mid 240 s | conditional | pass | ~150 of 240 min · med | run 0/5 · cand 3/4 |
| Priyanka | edu · short 120 s + face switch | conditional | pass | ~260 of 300 min · med-low | run 0/5 · cand 3/4 |
| Owen | free → facts | fail at HEAD → cond. | pass | ~0 today / ~120 min on own material | run 0/5 · cand 3/4 |
| Ravi | free → beats | fail at HEAD → cond. | pass | ~20 of 30 min · low-med | board 0/4 |
| Marco | trailer · trailer 90 s | fail at HEAD → cond. | pass | ~0 today / ~180 min once the seam is filled | board 0/4 |
| Sofia | trailer · teaser 60 s | fail at HEAD → cond. | pass | ~150 min of two people · low | board 0/4 |
| Yuki | trailer · cinematic 90 s | fail at HEAD → cond. | pass | ~1 day calendar · med | board 0/4 |
| Amara | free → beats, buyer | fail at HEAD | pass | ~40 min day one vs ~4 days | board 0/4 |

## Confirmed and fixed in this run (each carries a `ceiling` in `findings.json`)

| # | Severity | Finding | Fix | Live evidence |
|---|---|---|---|---|
| AM/MA/OW/RA/SO/YU-L1-1 | **blocker** | Trailer and free projects could not be created on a fresh account: every preset is tagged `educational`, the style stage dealt nothing, Next stayed disabled, the only exit needed image generation. | Wizard offers all six presets when none fits, chipped "written for educational video · fits any", stage copy explains the borrow, minted theme is untagged. | every trailer/free journal: `presets=6 borrowed=true`; marco: untagged theme in IDB |
| MA-L1-2 · RA-L1-3 · YU-L1-3 · AM-L1-8 | major | Reopen → change a pick → compose again never reached Script: the saved cut won and nothing said so. | The cut is stamped with the spine it was composed from; Script says when the board's spine moved past it and offers "rebuild from the new spine" (edits discarded, budget kept). Pre-stamp cuts read "unknown". | marco: stale notice → `script: review` → rebuild changes the climax beat |
| MA-L1-3 · RA-L1-2 · AM-L1-5 · YU-L1-6 · AM-L1-9 · SO-L1-3 · RA-L1-5 · YU-L1-4 | major | The trailer Script showed Glass Harbor's cue, budget and timecodes under the project's own title with no stand-in label; the runtime was never mentioned. | `trailer-fixture-note`: fixture · n=0 · "whatever this project's logline, template or runtime — your target is 60s; these beats run to 1:50 and the clock is not read here yet". | sofia, marco, ravi, amara logs |
| LE-L1-1 · HA-L1-1 · KW-L1-3 · OW-L1-7 · PR-L1-10 | major | The runtime the creator owns reached the header and nothing on Script; candidates were timed against 45/250/300 s silently. | `script-runtime-note` states "this project asked for Short educational · 120s — the three renders below were cut for the fixture's own runtimes (0:45–5:00) and your clock is not read here yet"; absent when the clock matches a render. | kwame shot `05-script-runtime-note.png`; dani (300 s) shows no note |
| LE-L1-4 · HA-L1-6 · AM-L1-7 · MA-L1-7 · YU-L1-2 · SO-L1-6 · KW-L1-7 · DA-L1-8 · PR-L1-11 | major | Research and Script never called `reportPhase`; the shelf and rail said "not started" after a notebook, a confirmed scope and an adopted script. | `_shared/usePhaseReport.ts` (the Frames rule, lifted) + reporters: research working → done (checkpoint) → review (drift) / working (reopen); script working / review (stale spine). | yuki: empty → working → done → working; dani: shelf "Research — locked · Script — in progress" |
| LE-L1-5 · HA-L1-3 · KW-L1-5 · OW-L1-2 · DA-L1-1 · DA-L1-2 · PR-L1-4 | major | A fresh project's topic field arrived pre-filled with the Bitcoin topic; nothing before the run said the notebook would be Bitcoin; the compact card headlined the typed topic over Bitcoin counts. | Field starts empty; `stand-in-note` before the run and after it ("not research on “…” — every card below is about Bitcoin"); the card heads with the notebook's own topic; no research row is written on mount. | every educational journal |
| OW-L1-5 · DA-L1-6 | major | The duel's "turns" line was the middle beat by index ("escalation"; a candidate on Adjudication). | Names the first beat of kind `turn`; no line when there is none. | dani, owen; kwame shot shows "TURNS TURN 1 · an inflow is not a purchase" |
| KW-L1-4 | minor | The guided wizard's finish opened the expert board instead of Script. | Finish → `?step=script`; an in-app step change now parks like a rail click. | dani: reload lands on Script |
| KW-L1-6 · LE-L1-7 · MA-L1-4 · AM-L1-2 | minor | Disabled Next/Recalibrate said nothing; 0 s projects were creatable; trailer bands claimed "measured" at n=0; the expert dialog's empty shelf had no route. | `blockedHint` on the deck; title on the disabled Recalibrate; runtime > 0 gate; "sourced · n=0 here"; dialog links the wizard. | kwame-recal, lena, sofia, amara-dialog |
| L2-1 (new at L2) | minor | Every create minted a new locked theme from the preset — ten creates, three duplicate names on the style shelf. | Reuse the theme already minted from the same preset with the same tag. | theme-reuse: themes 14 → 14 on a repeat create |

## Still open (top of the impact-ranked backlog — full list in `SUMMARY.md`)

- **DA-L1-3 · OW-L1-3 · PR-L1-5 · KW-L1-10** — the guided research face deals only the hottest take,
  the steel-man and six conclusions; facts, mechanisms and reversals (28 of 36 cards) are never
  choices there, and the review stage confirms a 29-card scope it never showed. Product call.
- **PR-L1-2 · DA-L1-12** — Coverage draws a cut card and the seconds a script spends on it in the same
  row with no conflict marker.
- **PR-L1-3** — the evidence log is named on Script and cannot be opened from it.
- **DA-L1-11** — a decided project reopens on the expert face; the wizard the decisions were made in is
  gone without a word (confirmed live on Priyanka's return visit).
- **HA-L1-5** — "not taken" in Research becomes "out of scope" in Coverage's pip.
- **LE-L1-2 / LE-L1-3** — the guided duel never says the third card is derived, or from what; overrun
  is words-vs-fixture, never seconds-vs-runtime.
- **MA-L1-6 / RA-L1-4** — a variant with no named risk is drawn as if it had none.
- **KW-L1-2** — ~30 studio terms with no on-screen gloss on the first-timer's path.
- **OW-L1-6** — facts→beats is never locked, even after a candidate is adopted; reopen lifts the
  beats→facts lock while `researched` stays true.
- **SO-L1-4 / SO-L1-5** — lane is "wide-release" by construction with no control; allowances unglossed.

## What passed before any fix

- The wizard's four questions are in the maker's words and every pick is reversible; runtime
  ownership latches and survives re-picks (KW-L1-1, LE-L1-8, HA-L1-8, DA-L1-S1).
- Conclusions default OUT and every surface says so in the same words; the hottest take carries its
  speculation warning on the front (HA-L1-7, PR-L1-8).
- The scope checkpoint is honest about being a checkpoint and names drift card by card (PR-L1-1,
  DA-L1-S2).
- The beat board labels its fixture before any pick; the structure check never says "works"; the
  promise ledger says an empty ledger is not "promises nothing" (AM-L1-10, MA-L1-9, SO-L1-7, RA-L1-8).
- Guided ⇄ expert discards nothing, on both steps (PR-L1-9); every decision survives a reload
  (AM-L1-11, KW-L1-8).

## Refuted / uncertain

- MA-L1-9 harness check "never says works" fired on the panel's own negation ("says nothing about
  whether it works") — the strength stands.
- RA-L1-6 / AM-L1-4 / OW-L1-8 (chooser vocabulary) — a read-aloud question, not a DOM one; uncertain.
- HA-L1-2 (a spoken not-taken conclusion is not flagged) — not reproducible on the fixture; the null
  case held.

## Artifacts

`findings.json` (117 rows, 45 `resolved-verified` with ceilings) · `SUMMARY.md` · ten per-Character
reports with L1 and L2 first-person reviews · `l2/*.js` scripts + `l2/journals/` · `created.json` ·
`shots/<slug>/` (gitignored). Driver: `uat/driver/drive-script.mjs` on `uat/driver/lib.mjs`.
