# Marco — compose-from-scratch · L1 (theoretical, code-grounded)

Character: `uat/characters/marco-indie-game-trailer.md` (MA) · Journey: `compose-from-scratch` S3 + S5
Repo state walked: HEAD `db77786` + an UNCOMMITTED working-tree change to
`app/_projects/wizard/{CreateWizard,stages}.tsx` that landed mid-walk (a parallel session's H1 fix).
Both states are judged below and named where they differ.

## Surface model

Marco's reachable set — trailer discipline, `trailer` template, style stage, then the studio's
Research (beats) and Script (trailer) halves. Never Frames.

| Stage | Surface | Where | Grounding / wiring |
|---|---|---|---|
| Create | `CreateWizard` on `Deck` | `app/_projects/wizard/CreateWizard.tsx`, `components/ui/deck/Deck.tsx:65-66,148` (forward gated on `stage.done`) | Discipline card body = `DISCIPLINE_NOTE.trailer` "a promotional cut that opens a debt another artifact pays" (`lib/projects.ts:135`). Template chips claim `90–150s measured` for teaser/trailer/cinematic (`stages.tsx:85-87`) while the catalogue says n=0 (`lib/projects.ts:189-191`). |
| Style stage (S5) | `EmptyStyleDeck` at HEAD; borrowed preset cards in the working tree | HEAD: `CreateWizard.tsx:110-113,230-232` · WT: `CreateWizard.tsx:110-127`, `stages.tsx:136-149` | Predicate executed (`node`/tsx, below): `styleFits(p,"trailer")` is false for all six presets; `lockedOnly([])` on a fresh account is `[]`. |
| Studio shell | `StudioView` + `Stepper` | `app/studio/[projectId]/StudioView.tsx:106-110,153-176,209-211` | Header pill `prototype · mocked data` is the ONLY fixture label that reaches the Script step. `parkAt` bookmarks the rail; `reportPhase` has one caller in the app (`app/_phases/frames/useFrames.ts:724`) — research/script never report. |
| Research (S3) | `BeatsResearch → BeatVariantBoard` | `ResearchStep.tsx:96-97,117`; `beats/BeatVariantBoard.tsx:44-47` (fixture label), `:89-98` (compose), `SlotColumn.tsx`, `VariantTile.tsx:79-86` | `slotsFor("trailer")` → `GLASS_HARBOR_SLOTS` for teaser, trailer AND cinematic (`beats/beats.ts:52-54`; executed: identical array, `===` true with `free`). **beat-board grounding 0/4**: reads neither logline, template, `targetS` (grep: `targetS` appears nowhere under `research/beats` or `script/trailer`), nor the locked style. |
| Script (S3) | `TrailerScript` | `ScriptStep.tsx:104-110,124-125`; `trailer/TrailerScript.tsx`, `useTrailerCut.ts:48-79`, `cut.ts:42-69`, `structure.ts:1253-1296`, `StructurePanel.tsx:40-96`, `EnergyCurve.tsx:47-49`, `PromiseLedger.tsx:45-48`, `WithholdingPanel.tsx:34` | Cut composed from confirmed picks; `rung: "long-cut"`, `lane: "wide-release"` hard-coded (`cut.ts:61-62`); cue and budget are `GLASS_HARBOR_CUE/BUDGET` (`useTrailerCut.ts:68,71`). No fixture label on this surface. |
| Persistence (S6) | `stepStore` records `research-beats`, `research`, `script-trailer` | `useBeatPicks.ts:46-49,62-75`; `useTrailerCut.ts:83-86` | Picks and cut survive reload. But `useTrailerCut` prefers a saved cut over a re-composed spine (`useTrailerCut.ts:51-58`) and nothing ever clears `script-trailer` (grep: only Frames reads it) → a recompose never reaches Script. |

### Executed reproductions (scratchpad `marco-probe.mts`, `npx tsx`)

```
H1  trailer themes: 0  presets: []            (all six presets tagged educational)
H5  teaser/trailer/cinematic → 8 identical slots; slotsFor("trailer") === slotsFor("free")
C2  19 variants over 8 slots, every slot ≥2; risk stated on 11/19 (absent on cold-open-a,
    intro-a, esc1-a, esc2-a, esc2-c, esc3-a, reset-b, tail-a)
C5  runStructureCheck over four full compositions (all-a, all-b, cold-open-b+climax-a,
    intro-b+esc2-b): malformed=false, 0 violations, 5 unmeasured, 67–71% enforced;
    the word "works" appears only inside "It says nothing about whether it works — see the
    efficacy row" and the efficacy row itself is `unmeasured`. Empty cut: malformed=true, 7 violations.
    Cross-slot hazards the fixture's own risk text names (glass floor twice; Mara unnamed
    before "Mara's brother") produce NO finding — the checker reads structure, not content.
```

### `structure.ts` — the assertion the brief asked for
Verdict union is `pass | violation | unmeasured | not-engaged` (`structure.ts:67`, imported from `../gate`). `malformed` is `boolean | null` (`:1188`), the standing `efficacyRow()` is emitted on every report as `unmeasured` (`:1243-1251,1267`) so `enforced` can never reach 100. `StructurePanel` renders `malformed: yes | no | unmeasured` and nothing warmer (`StructurePanel.tsx:42-45,86`). There is no code path that emits a "works" verdict. Holds.

## Walkthrough

**1 · `/projects/new`, discipline.** Three cards. "Movie · game trailer" is Marco's word; the body says the contract out loud (a debt another artifact pays). He is satisfied — this is his pet-peeve #1 answered at the door. Can he tell what happens next? The chip says `3 templates`.

**2 · template.** Teaser ≤60s / Trailer 90–150s / Cinematic 60–120s. His target is a 60–90s Steam trailer, which no band names; he picks `trailer` and plans to own the number. The chip reads `90–150s measured`. Marco, who asks for evidence: measured where? `lib/projects.ts:189-191` says the corpus is n=0 and "none of it was measured in this repo". The card and the last-stage hint (`stages.tsx:239` "Trailer was measured at 90–150s") both assert a measurement the catalogue disclaims. Free form got the honest `accepted` chip; the promotional three did not.

**3 · style (S5).**
- *At HEAD:* `fittingThemes=[]`, `fittingPresets=[]` → `EmptyStyleDeck`. `done` is false → Next is disabled (`Deck.tsx:148`). The card says "commission one in the library" and links away. The wizard's state is `useState` only — following the link drops discipline and template. The copy "Your picks here are kept while you go back a stage" is true of Back and false of the one CTA offered. Commissioning requires `/api/imaging/generate`, which is gated on `IMAGING_ACCESS_SECRET` + a vendor key (`.claude/onboarding/config.md:101-102`, `lib/imaging/env.ts:46-49`); `canLock` needs an approved proof (`lib/themes.ts:211-214`) and the only proof writer outside the wizard is a generation. **On the L2 recipe in `env.md` (dev-auth only, no key named) a trailer project cannot be created at all.** Criterion 1 fails. Journey blocked at stage 3 of 4.
- *Working tree (uncommitted):* when nothing fits, all six presets are dealt with an amber chip `written for educational video · fits any` and the stage sub-line says so; the minted theme is untagged (`CreateWizard.tsx:185`). The wizard finishes. Honest about what it is offering; Marco takes "Data Neon" and moves on, noting that a dashboard look on a roguelike trailer is a placeholder he will have to replace in the library.

**4 · name.** Placeholders are `Glass Harbor` and the heist logline — the first Glass Harbor sighting, unlabelled but placeholder-grey, harmless. He types "Hollowdeep — Steam trailer", a logline, sets 75s. The wizard's `sub` said the runtime would be seeded from "the runtime it measured" — same n=0 claim.

**5 · Studio opens on Research.** Header pill: `Movie · game trailer · Trailer · 75s` and `prototype · mocked data`. Board eyebrow `Movie · game trailer · beat variants`, then the line `fixture · n=0 · the Glass Harbor slots, whatever the project's logline`. Criterion 3 passes on this surface — he is told before he decides. Every slot has ≥2 candidates, each with a `rationale`; `risk —` is drawn only when the fixture named one, so eight tiles read as risk-free with no "no risk named" line (`VariantTile.tsx:82-86`, `beats.ts:29` says absent ≠ none). Unpicked columns are amber; the compose button counts what is missing. He picks cold-open-a, intro-a, esc1-a, esc2-a, esc3-a, reset-b, climax-b, tail-b. `compose spine →` → `spine composed`. Rail badge for Research stays `not started` (no reporter).

**6 · Script.** `TrailerScript` opens on the cut: header `composed from 8 picked parts · cue: Low Tide — candidate cue · lane: wide-release` and `Hollowdeep — Steam trailer · long-cut · the cue is a candidate, not frozen`. Energy curve captioned "a shape read from the parts — not a measurement". Each movement is editable (label, text, connector control, raise chips on rungs). Promise ledger: "no promise declared on any beat — the ledger is empty, which is not the same as the cut promising nothing". Withholding panel: `withholding budget · campaign-glass-harbor`, five heist assets. Structure panel: `malformed: no · 67% enforced · 10 pass · 0 violation · 5 unmeasured`, with the efficacy row `? unmeasured — does this cut work`. Criteria 4 and 5 pass. But nothing on this page says the beats, the cue and the budget are the Glass Harbor fixture; the only word for it is the header pill, three scrolls up. His project name sits over a heist spine — pet peeve #1, on the second surface, after the first surface had answered it.

**7 · Timecodes.** Beats sit at 0:00 / 0:12 / 0:30 / 0:45 / 1:00 / 1:16 / 1:22 / 1:50 — a 120s cut. He set 75s; `targetS` is read nowhere in the beat or cut code. Nothing on Script says the cut ignores the clock he set.

**8 · Return visit (S6).** Reload → Script hydrates `script-trailer`, cut intact. He goes back to Research, `reopen`, swaps climax-b for climax-a, `compose spine →` — the board says "Step 2 opens on this frozen spine". Step 2 does not: `useTrailerCut` returns the saved cut before it looks at the picks (`useTrailerCut.ts:51-58`), and no code deletes or versions `script-trailer`. The recomposed spine is unreachable from Script forever. Frames (out of scope) reads the same saved cut (`useFrames.ts:64`).

## Scored criteria

| # | Criterion | HEAD | Working tree | Evidence |
|---|---|---|---|---|
| 1 | Trailer project on a fresh account without leaving the wizard | **FAIL** | PASS (honestly labelled borrow) | `CreateWizard.tsx:230-232` (HEAD) / `:110-127` (WT); `Deck.tsx:148`; probe H1 |
| 2 | Every part ≥2 candidates with rationale AND stated risk | PARTIAL | PARTIAL | ≥2 and rationale on 19/19; risk on 11/19, absence not drawn (`VariantTile.tsx:82`) |
| 3 | Board states fixture vs his | PASS on the board, **FAIL on Script** | same | `BeatVariantBoard.tsx:44-47` vs `TrailerScript.tsx:82-101`, `WithholdingPanel.tsx:34` |
| 4 | Compose opens Script on an editable cut with energy curve and promise ledger | PASS | PASS | `TrailerScript.tsx:103-116`, `BeatEditor.tsx`, `EnergyCurve.tsx`, `PromiseLedger.tsx` |
| 5 | Structure check never says "works" | PASS | PASS | `structure.ts:1243-1251,1288-1294`; `StructurePanel.tsx:42-45`; probe C5 |

## Findings

```json
[
  {
    "id": "MA-L1-1",
    "journey": "compose-from-scratch",
    "character": "marco",
    "cert_level": "L1",
    "type": "broken-flow",
    "severity": "P0",
    "impact": { "frequency": "every trailer/free project on a fresh account", "reachability": "stage 3 of the only guided create path", "trust_erosion": "high — the product's first promise to a non-educational maker is a dead end" },
    "dimension": "reachability",
    "title": "H1 confirmed at HEAD: a trailer project cannot be created on a fresh account — the style stage deals nothing and Next is disabled",
    "expected": "The style stage offers something a first-time trailer maker can pick, or the wizard says the project can be created without a style and what that costs.",
    "got": "All six presets are tagged educational (`app/library/presets.ts:49-134`); `styleFits(p,\"trailer\")` is false for every one and a fresh account has no locked theme, so `EmptyStyleDeck` renders, `done` stays false and `Deck` disables Next. The only exit links to /library, where locking needs an approved proof (`lib/themes.ts:211-214`) and the only proof writer is image generation gated on IMAGING_ACCESS_SECRET + a vendor key. On env.md's L2 recipe the journey ends at stage 3.",
    "evidence": ["app/_projects/wizard/CreateWizard.tsx:110-113 (HEAD)", "app/_projects/wizard/CreateWizard.tsx:230-232 (HEAD)", "app/_projects/wizard/stages.tsx:158-177 (HEAD)", "components/ui/deck/Deck.tsx:65-66", "components/ui/deck/Deck.tsx:148", "lib/themes.ts:133-135", "lib/themes.ts:211-214", "app/library/presets.ts:49-134", ".claude/onboarding/config.md:101-102"],
    "code_check": "tsx probe: PRESETS.filter(p => styleFits(p,'trailer')) → []; lockedOnly([]) → []. An UNCOMMITTED working-tree change (CreateWizard.tsx:110-127, stages.tsx:136-149, 2026-09-05) offers all six presets as borrowed, amber-chipped 'written for educational video · fits any', and mints the theme untagged — this resolves the blocker honestly if it lands.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Fresh profile, discipline=trailer, template=trailer: assert the style stage has ≥1 pickable card and Next enables; then assert the created project's theme is untagged (fits any). Precondition: run against the committed state — if the working-tree fix is not merged, expect data-testid-less EmptyStyleDeck and a disabled Next."
  },
  {
    "id": "MA-L1-2",
    "journey": "compose-from-scratch",
    "character": "marco",
    "cert_level": "L1",
    "type": "broken-flow",
    "severity": "P1",
    "impact": { "frequency": "every reopen → recompose (the board invites it)", "reachability": "two clicks from the composed board, on a return visit", "trust_erosion": "high — the board says Step 2 opens on the new spine and Step 2 silently shows the old one" },
    "dimension": "persistence",
    "title": "A recomposed spine never reaches Script: the saved cut wins over the picks and nothing clears `script-trailer`",
    "expected": "After `reopen` → change a pick → `compose spine →`, Script opens on the new spine (or says it is still showing the earlier cut and offers to rebuild from the picks).",
    "got": "`useTrailerCut` loads `script-trailer` first and returns before reading the picks; the picks are consulted only when no cut is saved. No code path deletes or versions `script-trailer` (grep: only Frames reads it). The board's own status line promises 'Step 2 opens on this frozen spine. Reopen to change a pick; it must be composed again.'",
    "evidence": ["app/_phases/script/trailer/useTrailerCut.ts:48-79", "app/_phases/research/beats/useBeatPicks.ts:60-81", "app/_phases/research/beats/BeatVariantBoard.tsx:70-76", "app/_phases/frames/useFrames.ts:64"],
    "code_check": "Read: hydrate branch `if (saved?.cut) { setCut(saved.cut); ...; return; }` precedes `loadStep(picks)`. `reopen` is `setConfirmed(null)` only; `confirm` writes research-beats and research, never script-trailer.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Compose with climax-b, open Script, note `trailer-composed-line`/movement text; back to Research → reopen → pick climax-a → compose; open Script and assert the climax beat text changed. Precondition: a created trailer project (needs MA-L1-1 resolved)."
  },
  {
    "id": "MA-L1-3",
    "journey": "compose-from-scratch",
    "character": "marco",
    "cert_level": "L1",
    "type": "trust",
    "severity": "P1",
    "impact": { "frequency": "every trailer project, on the surface where the creator edits", "reachability": "Step 2, directly after compose", "trust_erosion": "high for this Character — his stated pet peeve is a heist spine not labelled as a placeholder" },
    "dimension": "mock-honesty",
    "title": "H3 confirmed for the Script half: the composed cut, the cue and the withholding budget are Glass Harbor and nothing on Script says so",
    "expected": "The same one-line disclosure the board carries ('fixture · n=0 · the Glass Harbor slots…') repeated on TrailerScript, ideally on the composed-from header and beside the budget.",
    "got": "TrailerScript's header prints the project's own title over the fixture beats ('Hollowdeep — Steam trailer · long-cut'), the cue title 'Low Tide — candidate cue' and the raw campaign id 'campaign-glass-harbor' with five heist assets. The only fixture word on the page is StudioView's global 'prototype · mocked data' pill in the header. The board (Step 1) is honest; Script does not repeat it.",
    "evidence": ["app/_phases/script/trailer/TrailerScript.tsx:82-101", "app/_phases/script/trailer/WithholdingPanel.tsx:34", "app/_phases/script/trailer/useTrailerCut.ts:63-71", "app/_phases/research/beats/BeatVariantBoard.tsx:44-47", "app/studio/[projectId]/StudioView.tsx:209-211"],
    "code_check": "grep 'fixture|Glass Harbor|n=0' in app/_phases/script/trailer/*.tsx → no match in any rendered string.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Open Script on a composed trailer project and assert the DOM under `trailer-script` contains a fixture/stand-in disclosure (expect absence today). Precondition: composed spine."
  },
  {
    "id": "MA-L1-4",
    "journey": "compose-from-scratch",
    "character": "marco",
    "cert_level": "L1",
    "type": "trust",
    "severity": "P2",
    "impact": { "frequency": "every trailer/teaser/cinematic create", "reachability": "template stage and name stage of the wizard", "trust_erosion": "medium — a maker who asks for evidence is told a measurement exists that the catalogue itself disclaims" },
    "dimension": "grounding-honesty",
    "title": "Trailer template cards claim '90–150s measured' while the catalogue says the corpus is n=0",
    "expected": "The promotional templates get the same honesty free-form gets: a band shown as 'sourced' or 'not measured here', not 'measured'.",
    "got": "`templateCards` special-cases only `free-form` as 'accepted'; teaser/trailer/cinematic render '{range}s measured' (cyan). `NameStage` repeats 'Trailer was measured at 90–150s'. `lib/projects.ts` states 'none of it was measured in this repo — the corpus for all three is n=0'.",
    "evidence": ["app/_projects/wizard/stages.tsx:85-87", "app/_projects/wizard/stages.tsx:237-239", "lib/projects.ts:189-191", "lib/projects.ts:212-218"],
    "code_check": "Read: the ternary keys on `t.id === \"free-form\"` only.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Assert the trailer template card chip text; expect 'measured'. No precondition beyond /projects/new."
  },
  {
    "id": "MA-L1-5",
    "journey": "compose-from-scratch",
    "character": "marco",
    "cert_level": "L1",
    "type": "wiring",
    "severity": "P2",
    "impact": { "frequency": "every trailer project whose runtime is not 120s", "reachability": "visible on Script as beat timecodes vs the header pill", "trust_erosion": "medium — the clock he set is shown in the header and ignored by the cut" },
    "dimension": "grounding",
    "title": "H5 confirmed and wider: one slot set for teaser/trailer/cinematic, rung hard-coded 'long-cut', and the project's targetS reaches neither board nor cut",
    "expected": "The 'different contracts' claim in the catalogue reaches the board (a teaser deals fewer parts per the drop order; the cut's `rung` follows the template), and the beats' `at` values scale to — or at least are labelled against — the runtime the creator set.",
    "got": "`slotsFor` returns `GLASS_HARBOR_SLOTS` for every non-educational discipline; `composeCut` writes `rung: \"long-cut\"`, `lane: \"wide-release\"`; `targetS` is not read anywhere under research/beats or script/trailer. A 60s teaser composes to an 8-part long cut with a 1:50 title card and passes the ladder rule as 'A long cut, and no part is declared dropped'.",
    "evidence": ["app/_phases/research/beats/beats.ts:47-49", "app/_phases/script/trailer/cut.ts:57-68", "app/_phases/script/trailer/structure.ts:1027-1046", "lib/projects.ts:176-183", "app/_studio/trailerFixtures.ts:8-10"],
    "code_check": "tsx probe: slotsFor for all three templates → identical 8 ids; `slotsFor('trailer') === slotsFor('free')` → true. grep targetS in beats/ and trailer/ → no hits.",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": true,
    "scope_note": "The slot set is the fixture seam (accepted: one fixture). What is NOT mock-bound is that `rung`/`lane` are constants in `composeCut` and that `targetS` has no consumer — the seam a model run would fill has no field for the template or the clock."
  },
  {
    "id": "MA-L1-6",
    "journey": "compose-from-scratch",
    "character": "marco",
    "cert_level": "L1",
    "type": "expressiveness",
    "severity": "P3",
    "impact": { "frequency": "8 of 19 tiles", "reachability": "the board", "trust_erosion": "low-medium — a tile with no risk line reads as the safe pick" },
    "dimension": "decision-legibility",
    "title": "A variant with no named risk is drawn as if it had none",
    "expected": "Criterion 2 asks for a stated risk per candidate; where the source named none, the tile says 'no risk named' so absence is not read as safety.",
    "got": "`VariantTile` renders the `risk —` line only when `variant.risk` is truthy; `beats.ts:29` documents that absent means 'none was named, not none exists'. 8/19 fixture variants have no risk (cold-open-a, intro-a, esc1-a, esc2-a, esc2-c, esc3-a, reset-b, tail-a).",
    "evidence": ["app/_phases/research/beats/VariantTile.tsx:82-86", "app/_phases/research/beats/beats.ts:28-36", "app/_studio/trailerFixtures.ts:119-128"],
    "code_check": "tsx probe: 11/19 variants carry `risk`.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Assert `variant-cold-open-a` contains no 'risk' text and no 'no risk named' text. Precondition: a trailer project on the board."
  },
  {
    "id": "MA-L1-7",
    "journey": "compose-from-scratch",
    "character": "marco",
    "cert_level": "L1",
    "type": "gap",
    "severity": "P2",
    "impact": { "frequency": "every trailer project", "reachability": "the shelf matrix and the studio rail, after composing", "trust_erosion": "medium — the shelf says 'not started' about a composed spine" },
    "dimension": "progress-legibility",
    "title": "H4 confirmed for this journey: Research and Script never report progress, so the shelf and rail stay 'not started' after a spine is composed",
    "expected": "Composing a spine moves Research to at least 'in progress'/'needs a call' and an edited cut moves Script; the matrix cell and rail badge tint accordingly.",
    "got": "`reportPhase` has exactly one caller (`frames/useFrames.ts:724`). `useBeatPicks.confirm` writes `researched: true` to the step store, which the shelf does not read. `projectState` therefore stays 'draft' for a project with a composed, edited cut.",
    "evidence": ["lib/projects.ts:533-542", "app/_phases/frames/useFrames.ts:724", "app/_phases/research/beats/useBeatPicks.ts:62-75", "app/_projects/ProjectsMatrix.tsx:153-155", "app/studio/[projectId]/Stepper.tsx:42,63"],
    "code_check": "grep reportPhase across app/ and lib/ → one call site, in Frames.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "After compose, return to /projects and assert the research cell title reads 'not started'. Precondition: composed spine."
  },
  {
    "id": "MA-L1-8",
    "journey": "compose-from-scratch",
    "character": "marco",
    "cert_level": "L1",
    "type": "gap",
    "severity": "P3",
    "impact": { "frequency": "any composition the fixture's own risk text warns about", "reachability": "Script structure panel", "trust_erosion": "low-medium — 'malformed: no' over a cut whose tile said 'a reader should' catch it" },
    "dimension": "senior-bar",
    "title": "Cross-slot hazards the board names in tile risk text (same image twice; a cost personalised on a character never introduced) produce no finding on Script, and Script says the rationale 'lives in step 1'",
    "expected": "Either the board warns at pick time when a combination it has already described as risky is selected, or the composed cut carries the picked variants' risk sentences so the structure panel can list them as 'declared, unmeasured'.",
    "got": "Executed: cold-open-b + climax-a and intro-b + esc2-b both report malformed=false, 0 violations, no row mentioning the repeat. The fixture's risk text says 'the board does not forbid it, a reader should'; `composeCut` drops `rationale`/`risk` (only `variant.beat` is carried) and TrailerScript's header says 'the picks and their rationale live in step 1'.",
    "evidence": ["app/_studio/trailerFixtures.ts:336", "app/_studio/trailerFixtures.ts:237", "app/_phases/script/trailer/cut.ts:49-55", "app/_phases/script/trailer/TrailerScript.tsx:96-101", "app/_phases/script/trailer/structure.ts:570-582"],
    "code_check": "tsx probe over both compositions: findings.some(repeat|twice) outside the escalation rule → false.",
    "verdict": "confirmed",
    "resolution": "open",
    "scope_note": "Design gap, not a checker defect: `structure.ts` is explicit that it reads declared structure only. The honest verdict it gives is correct; the gap is that the risk the board knew is not carried to where the verdict is read."
  },
  {
    "id": "MA-L1-9",
    "journey": "compose-from-scratch",
    "character": "marco",
    "cert_level": "L1",
    "type": "strength",
    "severity": "none",
    "impact": { "frequency": "every trailer project", "reachability": "Script", "trust_erosion": "none — earns trust" },
    "dimension": "senior-bar",
    "title": "The structure check meets the senior bar verbatim: malformed / unmeasured / specific findings, never 'works', and the energy curve says it is a shape, not a measurement",
    "expected": "As the Character's bar states.",
    "got": "`Verdict` has no 'works' member; `efficacyRow` is emitted on every report as unmeasured so `enforced` can never be 100; `malformed` is `boolean | null` and the panel prints 'malformed: yes | no | unmeasured'; every finding cites its doctrine path. Executed over four compositions and an empty cut with consistent, honest output. `EnergyCurve` captions 'a shape read from the parts — not a measurement'; `PromiseLedger` says an empty ledger 'is not the same as the cut promising nothing'.",
    "evidence": ["app/_phases/script/trailer/structure.ts:1243-1251", "app/_phases/script/trailer/structure.ts:1253-1296", "app/_phases/script/trailer/StructurePanel.tsx:42-45,86,96", "app/_phases/script/trailer/EnergyCurve.tsx:47-49", "app/_phases/script/trailer/PromiseLedger.tsx:45-48", "app/_phases/script/trailer/cut.ts:167-207"],
    "code_check": "tsx probe C5; grep '\\bworks\\b' in trailer/ → only the negation in malformedNote and a header comment.",
    "verdict": "confirmed",
    "resolution": "open"
  },
  {
    "id": "MA-L1-10",
    "journey": "compose-from-scratch",
    "character": "marco",
    "cert_level": "L1",
    "type": "strength",
    "severity": "none",
    "impact": { "frequency": "every create", "reachability": "stage 1", "trust_erosion": "none" },
    "dimension": "vocabulary",
    "title": "The discipline card states the trailer contract in one line and in Marco's words",
    "expected": "Criterion 'the discipline is explicit about its contract'.",
    "got": "'Movie · game trailer — a promotional cut that opens a debt another artifact pays', with the template count as a chip; the board eyebrow and the studio pill repeat the discipline label. Definition-of-done 2 holds.",
    "evidence": ["lib/projects.ts:126-137", "app/_projects/wizard/stages.tsx:55-73", "app/studio/[projectId]/StudioView.tsx:203-207"],
    "code_check": "Read.",
    "verdict": "confirmed",
    "resolution": "open"
  },
  {
    "id": "MA-L1-11",
    "journey": "compose-from-scratch",
    "character": "marco",
    "cert_level": "L1",
    "type": "gap",
    "severity": "P3",
    "impact": { "frequency": "every user who follows the empty-style CTA (HEAD only)", "reachability": "stage 3 dead end", "trust_erosion": "medium — the card promises picks are kept and the one link it offers discards them" },
    "dimension": "copy-honesty",
    "title": "EmptyStyleDeck says 'Your picks here are kept while you go back a stage' and then offers only a link that leaves the wizard and loses them",
    "expected": "Either persist the draft across the library detour or say the link discards the picks.",
    "got": "Wizard state is `useState` only; the `<Link href=\"/library\">` unmounts CreateWizard. The sentence is true of Back and false of the CTA. Moot if the working-tree borrow lands, since the empty deck then renders only for a discipline with zero presets in the catalogue (none today).",
    "evidence": ["app/_projects/wizard/stages.tsx:163-177 (HEAD 158-177)", "app/_projects/wizard/CreateWizard.tsx:87-101"],
    "code_check": "Read: no draft persistence (no stepStore/localStorage write in the wizard).",
    "verdict": "confirmed",
    "resolution": "open",
    "scope_note": "Superseded in practice by the uncommitted MA-L1-1 fix; keep as a copy note in case EmptyStyleDeck is reached again."
  }
]
```

## Verdict

**L1-fail** at HEAD `db77786` (criterion 1 is a hard blocker: no trailer project can be created on a fresh account). **L1-conditional** if the uncommitted borrowed-presets change in `app/_projects/wizard/` lands as-is — the conditions being MA-L1-2 (recompose never reaches Script) and MA-L1-3 (Script never says it is Glass Harbor).

grounding: beat-board 0/4 · script-candidates n/a (trailer half has no candidates; the cut reads the picks, the fixture cue, the fixture budget — 0 of logline / template / runtime / style) · research-run n/a

time-saved-if-it-all-worked: ~0 min for MY trailer today (a Glass Harbor spine is a vocabulary lesson, as the Character says) · ~3 h of the 4 h beat-sheet once a model run replaces `slotsFor` and reads the logline and runtime · confidence: medium (the Script instrument is already the right shape; the board's seam is the whole gap)

## First-person review (L1, designed experience)

Would I adopt it? Not tonight. The door is honest — "a promotional cut that opens a debt another artifact pays" is the best one-line definition of a trailer I have seen in a tool — and then the wizard hands me nothing to pick for a style and a link to a library that needs an image key I do not have. If the fix I can see sitting uncommitted goes in, I get through: six explainer looks with an amber chip that admits they were written for explainers. Fine. I would rather be told than flattered.

The beat board is what I came for and it says, in monospace, that it is `fixture · n=0 · the Glass Harbor slots, whatever the project's logline`. Good. So I know I am learning the vocabulary, not cutting my trailer. Each part gives me two or three options with a reason; the risk lines are sharp when they exist ("opens on words rather than an image … close to a card" is exactly the Steam-page mistake). Eight tiles have no risk line and read as the safe choice, which I do not believe.

Then Script. This is the instrument I want to run a production on: parts as objects, a connector I choose between beats, a raise chip per rung that warns when I repeat the last one, a promise ledger that refuses to pretend an empty list means nothing is owed, a withholding budget with a trade sentence per spend, and a structure check that says `malformed: no · 67% enforced · 5 unmeasured` and then, as the last row, that whether the cut works is unmeasured. It never says "works". That is the senior editor I would hire.

But my project's name is on top of a heist. The page never says so; the only word for it is a header pill three scrolls up. And when I went back and swapped the climax, Script kept the old one and did not say it had. That is the thing I would tell a peer about first, because it is the thing that would cost me a bad build on the store page.

Would I tell a peer? "Wait for the model run; the editor half is already worth the wait." Worth the wait for me: yes, if the board reads my logline and my 75 seconds, and if Script stops keeping cuts I have replaced.

## First-person review (L2, live experience)

L2 verdict: **L2-conditional** — I created the trailer, Script told me whose beats these are, and the recompose actually landed; the spine is still Glass Harbor, so it saved me a vocabulary lesson and nothing else yet.

Finished. Style stage: `presets=6 borrowed=true`, Data Neon, and the journal confirms the minted theme is untagged so it will serve the next trailer too. The board said `fixture · n=0` before any pick.

The two things that would have cost me a bad store-page build are gone. Script opens with an amber line under the composed-from header: `the beat text, the cue and the withholding budget are the Glass Harbor stand-in … your target is 90s; these beats run to 1:50 and the clock is not read here yet` (shot 04). When I reopened, swapped the climax and composed again, Script said the spine was recomposed after this cut, the shelf dropped Script to "needs a call", and `recompose-cut` rebuilt with climax-b — "every door opens at once". It said beforehand that my beat edits would go. Fair.

The structure panel still never says "works" — the harness tripped on the panel's own sentence "It says nothing about whether it works", which is the point. Eight tiles still carry no risk line. The ladder still calls my 90 s a long cut and passes it; the note explains why, the check does not change.

Would I tell a peer? "The editor half is honest and now consistent. Wait for the board to read your logline; then it is worth the weekend."
