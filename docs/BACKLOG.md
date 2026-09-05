# Backlog

Append-only, numbered. Items enter from a `/uat drain` (analysis docs in `docs/product/uat-insights/`)
or from a session that names its source. A drained `build` item is not done at merge: it re-enters
through `/uat recertify` against the originating Character's scored criteria.

Legend: `build` (a concrete change) · `concept` (a design doc first, in `docs/product/concepts/`) ·
`method` (a standing commitment with a trigger) · `declined` (with the reason; a declined idea needs
new evidence to return).

## 2026-09-05 · from uat-insights/2026-09-05-compose.md

| # | kind | item | source | recertify with |
|---|---|---|---|---|
| B-001 | build | Coverage marks a descoped card that a render still speaks ("cut · still spoken 12 s by …") and counts them in the footnote; the pip and tint say `not taken` vs `descoped` in ScopeBar's words | PR-L1-2, DA-L1-12, HA-L1-5 | Priyanka, Hana |
| B-002 | build (interim of C-001) | The guided review stage states how many cards it did not deal and links the expert board before `confirm scope` | PR-L1-5 | Priyanka, Kwame |
| B-003 | build | Glossary layer: visible one-line glosses under chips/eyebrows on the guided faces; `requiredWhy` rewritten for a reader; ModeChooser lines and `DISCIPLINE_NOTE.trailer` in the maker's words | KW-L1-2, HA-L1-4, PR-L1-7, AM-L1-3/4, RA-L1-6, OW-L1-8 | Kwame, Hana, Amara |
| B-004 | build (interim of C-002) | Duel depth prints the subtraction: `0:45 · +5 s over your 40 s at 150 wpm`; the narration-led caveat shown on the guided face | LE-L1-2, LE-L1-3 | Lena |
| B-005 | build | Evidence-log modal mounted on Script; "what was cut, and why" list at the checkpoint with an optional reason per cut; `url` on `FactSource` rendered as an anchor when present | PR-L1-3, PR-L1-12, DA-L1-7 | Priyanka, Dani |
| B-006 | build | A beat tile with no `risk` renders "no downside named" | MA-L1-6, RA-L1-4 | Marco |
| B-007 | build | Lock facts→beats while an adoption or accepted version exists, with a reason; reopen keeps the beats→facts lock or the copy says Script still reads the last spine | OW-L1-6 | Owen |
| B-008 | build (batch) | Auto-fill the one-template stage for "Any video"; lane switch + allowance glosses on the trailer Script; expert face says the guided one is a switch away; all-facts-cut reversal reads "broken"; confirm over a broken required turn says so; render template compared to the project's; logline hint reworded | AM-L1-12, SO-L1-4/5, DA-L1-11, DA-L1-4, PR-L1-6, LE-L1-6, SO-L1-8, DA-L1-9 | Amara, Sofia, Dani |
| C-001 | concept | What the guided research face deals a first-timer (facts / mechanisms / reversals), and what the review stage claims — `docs/product/concepts/guided-research-hand.md` | DA-L1-3, OW-L1-3, PR-L1-5, KW-L1-10 | — |
| C-002 | concept | The clock as an input: seconds-vs-runtime rule on the explainer half; runtime/template seam in `composeCut`/`slotsFor` (rung from template, teaser drop order, lane) — `docs/product/concepts/runtime-seam.md` | LE-L1-*, DA-L1-10, MA-L1-5, SO-L1-2, YU-L1-5 | — |
| C-003 | concept | Scope ↔ script reconciliation: should the gate refuse a candidate that speaks a not-taken conclusion or a cut fact — `docs/product/concepts/scope-script-reconciliation.md` | HA-L1-2, PR-L1-2 | — |
| M-001 | method | Any commit under `app/_phases/research/guided/` or `app/_phases/script/` re-runs `compose-from-scratch` L2 for Priyanka, Kwame and Marco | drain §2.10 | — |
| M-002 | method | After any L2 run with ≥5 Characters on one profile, count duplicates on the style and projects shelves | L2-1 | — |
| D-001 | declined | Fixture beats declaring a promise — the ledger's "incomplete" is reachable by hand; fixture work belongs to C-002 | AM-L1-6 | — |
| D-002 | declined | Mechanisms citing evidence in the fixture — fixture content; the wound edge exists | DA-L1-5 | — |
| D-003 | declined | Moving the prototype outcome picker below the topic field — evaluation scaffolding, labelled; revisit when the run is real | KW-L1-9 | — |
| D-004 | declined (for now) | Re-checking tile-risk hazards on Script — the checker reads declared structure by design; carrying rationale/risk onto the cut is C-002's seam | MA-L1-8 | — |
