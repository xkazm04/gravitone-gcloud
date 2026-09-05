# Priyanka (PR) — compose-from-scratch · L1 (theoretical, code-grounded)

Run `2026-09-05-compose` · Character `uat/characters/priyanka-course-module.md` · scenario S1 variant
(educational → `short-educational-video`, 120 s) + S7 (guided ⇄ expert discards nothing). No browser;
every claim below is a `file:line` or an executed predicate (`npx tsx` over the real modules).

Motivation, verbatim: *The manual way: research, outline, draft and a legal pre-read for a 2-minute
module is ~5 hours. She will adopt a tool that gets her a scoped, sourced candidate in under 45
minutes, with the scope record legal can read.*

Senior bar, verbatim: *A senior instructional designer refuses a script with a claim the evidence log
does not carry, and refuses any workflow where the approved scope and the script disagree without a
warning. The confirm/drift mechanism must say when the board has moved since confirmation.*

## Surface model

### Reachable set (educational · short-educational-video)

| Stage | Surface | Entry | Notes |
|---|---|---|---|
| Create | `app/_projects/wizard/CreateWizard.tsx:196-265` on `components/ui/deck/Deck.tsx` | `/projects/new` | 4 stages; Next gated on `stage.done` (`Deck.tsx:148`). Discipline copy `lib/projects.ts:126-136`; template copy `lib/projects.ts:151-156` ("one idea, explained well"). Style stage: `styleFits(p,"educational")` keeps all six presets (`CreateWizard.tsx:110-113`), so she never meets `EmptyStyleDeck` (`stages.tsx:158`) — her pet peeve ("sent to a library to commission a style") does not fire for this discipline. H1 is out of her reachable set. |
| Studio | `app/studio/[projectId]/phases.tsx:23-24` | `router.push('/studio/<id>')` (`CreateWizard.tsx:190`) | Research → Script; Frames never entered. |
| Research (guided, DEFAULT for a fresh project) | `ResearchStep.tsx:143-185` → `guided/GuidedResearch.tsx` | default face computed `decided ? "expert" : "guided"` (`ResearchStep.tsx:170-181`) | Stages run → takes → conclusions → review (`GuidedResearch.tsx:141-200`). |
| Research (expert) | `ResearchStep.tsx:240-291`: `TopicPanel` + `ResearchTriageBoard` + `FollowUpQueue` + `ConfirmScope` | `FaceSwitch` (`GuidedResearch.tsx:44-58`) or wizard finish (`GuidedResearch.tsx:208-209`) | Board tab locked until `ready` (`ResearchStep.tsx:246`). |
| Scope record | `useScope.ts:165-224`, persisted under `research-scope` (`useScope.ts:136,183-186`) | shared by BOTH research faces (`ResearchStep.tsx:150`) and Script (`ScriptStep.tsx:147`) | Checkpoint = `confirmed`, drift = `diverged` (`useScope.ts:206-209`, `scope.ts:81-83`). |
| Script (explainer) | `ScriptStep.tsx:130-370`; gate `!researched` → notice (`ScriptStep.tsx:197-205`) | `researched` written by `useEducationalResearch.ts:50` when the run lands `done` | Tabs Candidates / Coverage / Spend / Tracks (`ScriptStep.tsx:73-78`); Candidates has its own guided/expert face (`useScriptFace.ts`). |
| Evidence log | `app/_phases/_shared/notebook/EvidenceLog.tsx`, modal at `ResearchStep.tsx:305-324` | `open-evidence` pill — expert `TopicPanel.tsx:143-150`, guided `RunStage.tsx:48-53` (rendered at `RunStage.tsx:106-110` and `218-222`) | **No trigger under `app/_phases/script/`** (grep `open-evidence|EvidenceLog` → only the comment `ScriptStep.tsx:17` and the label `ScriptStep.tsx:229-233`). |

### Grounding audit (env.md shared denominator)

- `research-run` **0/5** — the run replays `run/trace.ts` and `load()` lands the 2026-08-11 Bitcoin
  notebook (`useResearchRun.ts:37-38`, `LOAD_NOTE`); the topic, logline, template, runtime and prior
  notebooks are read by nothing in the run path. Disclosure BEFORE deciding: `LocalProcessNote`
  (`run/controls.tsx:147-154`) — "the trace is replayed at 8× from run 1 and nothing is executed" —
  sits under the topic field on both faces (`RunStage.tsx:157`, `TopicPanel.tsx:79`). It says the
  *process* is replayed; it does not say the *notebook* will be about Bitcoin whatever she types.
  After the run the guided compact card prints HER topic as the headline over Bitcoin counts
  (`RunStage.tsx:100-104`), and the notebook modal title is hard-coded
  `notebook · why-bitcoin-price-does-not-rise` (`ResearchStep.tsx:299`). H2 confirmed.
- `beat-board` — not met (educational discipline never mounts `BeatsResearch`, `ResearchStep.tsx:96`).
- `script-candidates` **3/4** — scope read live (`ScriptStep.tsx:147` → matrix `stateOf`), template band
  and notebook read (`HypothesisColumn.tsx:109-110`); runtime is the render fixture's
  (`renders.ts:17,76,123` = 300 s / 250 s / 45 s), never `project.targetS` (grep `targetS|template`
  under `app/_phases/script/` hits only the fixture and its label). For her 120 s module no candidate
  sits in her measured 60–180 s band, and no surface says so.

### Wiring notes (one grep per value suspected unread)

- `confirmed` (the checkpoint): read only inside `app/_phases/research/` (`useScope.ts:140-146`
  documents it). Script reads the LIVE scope. Drift (`diverged`) is drawn on Research only
  (`ScopeGate.tsx:40-47`, `GuidedResearch.tsx:185-189`); grep `diverged|confirmed` under
  `app/_phases/script/` → trailer half only.
- `scope` in Script: `MatrixCoverage.tsx:134` / `MatrixSpend.tsx:124` / `MatrixTracks.tsx:100,176`
  read `stateOf(api.scope, id).descoped` for a tint + `ScopePip`. `usageIn(version, renderId, cardId)`
  (`versions.ts:337`) takes NO scope — attribution is the fixture's `ATTRIBUTION` map
  (`impact.ts:118-140`). Candidates chains: `chainOf(reading, r.id)` falls back to the fixture
  (`ScriptStep.tsx:65-66`); `gateChains(chains, { conclusions })` (`ScriptStep.tsx:192`) never sees scope.
- `required`: enforced on the card itself only — CardTile hides the toggle (`CardTile.tsx:227,251`),
  ScopePip disables (`shared.tsx:48,54`), wizard deals it `pickable:false` (`GuidedResearch.tsx:76-92`).
  `summary.blocked` = "a required card is descoped" (`scope.ts:103,125`) — unreachable from any UI.
- `reportPhase`: one caller, `app/_phases/frames/useFrames.ts:724`. H4 confirmed — the shelf's
  research/script cells never move on this journey.
- Topic default for a NEW project: `setTopic(saved?.topic ?? NOTEBOOK.topic)` (`useEducationalResearch.ts:43`)
  → the field arrives pre-filled with "Why Bitcoin price does not rise" (`notebook.ts:15`).

### Executed predicates (`scratchpad/pr-check.ts`, `pr-check2.ts`, `npx tsx`)

```
total 36  required ['steel-man']  optIn 7 (c-*)  hottest ['c-reserve-was-the-product']
kinds fact 21 · mechanism 3 · reversal 4 · conclusion 7 · steel-man 1
fresh scope  → kept 29/36 · descoped 0 · notTaken 7 · blocked false · wounds 0
steel-man dependsOn ['f-mstr-defence','f-supply-2pct']
cut both     → wounds [{steel-man, missing both, severity "broken"}] · blocked FALSE
confirm then cut f-ath → diverged ['f-ath']
usageIn(BASELINE,'reversal-chain','f-ath') → spoken 12s @0:00   (usageIn.length === 3, no scope arg)
```

## Walkthrough

**1 · Create (`/projects/new`).** "What kind of video is this?" → *Educational video — an argument
explained well* (`lib/projects.ts:127,133`). "Argument" is not her word, but the template card
underneath — *Short educational · one idea, explained well — a question chain with facts hung on it ·
60–180s measured · target 120s* (`lib/projects.ts:151-156`, `stages.tsx:85-88`) — is exactly her
module. Can she tell what to do? Yes. Style: six presets fit, one click, no library detour
(`CreateWizard.tsx:231-239`). Name stage: "Only the name is required" (`CreateWizard.tsx:245`); the
logline placeholder is a heist ("A crew that never breaks in…", `stages.tsx:225`) and the name
placeholder "Glass Harbor" (`stages.tsx:210`) — polish, off-register for an L&D module. Create & open
awaits the write and only then routes (`CreateWizard.tsx:180-190`). DoD 1, 2: met.

**2 · Research, guided face (default).** Stage *run*: the topic field is already holding "Why Bitcoin
price does not rise" for her brand-new "Data-handling refresher" project (`useEducationalResearch.ts:43`).
She overtypes it; the note under the field says the trace is replayed and nothing executes
(`controls.tsx:150-151`); a `prototype · drive the ending` rack sits above (`controls.tsx:56`). She
presses *Research this*, the trace grows, "Next deals the takes →" (`RunStage.tsx:224`). Can she tell
what the research is about before deciding? Partly: the compact card prints HER topic as the headline
(`RunStage.tsx:100`) over "21 facts · 3 mechanisms · 4 reversals · researched 2026-08-11" — a date
before she created the project is the only tell. The notebook pill opens a modal titled
`why-bitcoin-price-does-not-rise` (`ResearchStep.tsx:299`). DoD 4: **not met before the decision**.

Stage *the takes*: two cards — the 😈 hottest take (opt-in, "not taken") and the steel-man dealt with
no pick target, chip *locked in scope — always travels*, footnote = `requiredWhy`
(`GuidedResearch.tsx:81-91`, `DeckCard.tsx:140-141`). The footnote reads "The steel-man is mandatory
(NOTEBOOK-SCHEMA §steel_man). Without it the script can only produce a polemic, and Engine D cannot be
run honestly at all." (`cards.ts:123-124`). Explained, yes; in her vocabulary, no.

Stage *conclusions*: "A conclusion is a leap past the evidence, so every one starts OUT of scope"
(`GuidedResearch.tsx:174`); six cards, all "not taken" (`passes.tsx:46-48`, `specOf` chip
`passes.tsx:125-129`). She takes none. Criterion 4 met, and said in words.

Stage *review*: ScopeBar `in scope 29/36 · not taken 7` (`ScopeBar.tsx:128-133`), Consequences
"Nothing descoped… minus the 7 conclusions you have not taken" (`ScopeBar.tsx:172-180`), ConfirmScope
"29 of 36 cards will go to the Script step" (`ScopeGate.tsx:35`). **But she has not seen 28 of those
29 cards.** The wizard deals only the hottest take, the steel-man and the conclusions
(`passes.tsx:33-48`); the 21 facts, 3 mechanisms and 4 reversals — the material she is supposed to
vet — are never dealt in the guided face, and no stage says "the facts are on the expert board".
The finish label *Open the expert board* (`GuidedResearch.tsx:208`) is the only hint. She confirms a
scope she did not review.

**3 · Face switch (S7).** *switch to the expert board* (`GuidedResearch.tsx:44-58`) writes only
`research-mode` (`ResearchStep.tsx:159-162`); the scope api is one instance above both faces
(`ResearchStep.tsx:149-150`); the wizard's `onPick` is `api.toggle(id,"descoped")`
(`GuidedResearch.tsx:99`), identical to CardTile (`CardTile.tsx:256`). Confirmed checkpoint survives
(`useScope.ts:168,178`). Back to guided: the wizard re-mounts on stage 2 (`GuidedResearch.tsx:128`) and
the state chips re-read the same record (`passes.tsx:119-129`). Discards nothing — **confirmed by
structure.**

**4 · Expert board.** Seven columns, "Sweep the columns, cut what you do not want, and watch what it
costs" (`ResearchTriageBoard.tsx:62-66`). She cuts three facts she cannot attribute to a source legal
would accept. Each cut is the whole card as a button (`CardTile.tsx:251-265`), chip flips to
*descoped* (`CardTile.tsx:206-208`), ScopeBar `descoped 3` amber. ConfirmScope now reads *scope has
moved · 3 cards have changed since you confirmed. The Script step works from the live board, so the
change is already in it — confirm again to move the checkpoint up to it.* plus `moved · f-…, f-…`
(`ScopeGate.tsx:31-47`). Criterion 1: **met, and honestly worded** (the copy admits Script reads the
live board rather than the checkpoint).

The steel-man card: chip *locked in scope*, no toggle, the reason only as a native `title` tooltip on
the `<li>` (`CardTile.tsx:233`) — hover-only. Now the pointed case: she cuts `f-mstr-defence` and
`f-supply-2pct` (two facts she cannot vet). Executed: the steel-man is wounded *broken*, `blocked`
stays false. Consequences turns red: *1 turn cannot be argued … A reversal with no surviving evidence
is an assertion. Either restore a card or accept that the script loses that turn.*
(`ScopeBar.tsx:189-207`); the steel-man tile shows the wound (`CardTile.tsx:189`). The confirm button
stays enabled (`ScopeGate.tsx:63` — `blocked` is false). So the "required" rule is: the card cannot
leave, but everything it rests on can, and the checkpoint proceeds with a disclosed warning. Disclosed
— not silent — so this is a product call rather than a bug; recorded as such below.

**5 · Script.** Header: "written against · 21 claims · … · half-life …" and, top-right,
*the notebook and the evidence log live in step 1* (`ScriptStep.tsx:219-233`) — a sentence, not a
link. Criterion 5: **fails**; the legal pre-read she does from the script has to go back a step to
find the claims. Candidates (guided duel default, `useScriptFace.ts:54`): three cards with opens /
turns / lands, `n beats · 5:00 | 4:10 | 0:45` (`CandidatesDuel.tsx:120-141`), a risk line, *adopt*.
Nothing here says which of her cut facts each script still speaks; the chains are the fixture
(`ScriptStep.tsx:65-66`). She adopts *Paradox Teaser* (45 s, the only one near her length) — "adopted
— the Frames step opens on this chain" (`CandidatesDuel.tsx:152-153`); the record persists
(`useAdoption`). DoD 5: met as an interface.

Coverage: her three cut facts show pip `—`, amber tint (`MatrixCoverage.tsx:134,142,147`) — **the cut
stays cut** (criterion 2, the state half). But the same row still prints `12s` under Reversal Chain
for `f-ath` (executed above), and the cell tooltip says `beats 0:00` (`MatrixCoverage.tsx:161`).
Nothing says "out of scope, yet spoken". The Coverage answer to "which facts does this script use" is
the fixture's, unreconciled with her scope. Her senior bar — *refuses any workflow where the approved
scope and the script disagree without a warning* — is not met on this tab. Whether the fixture scripts
should speak a cut fact is mock content; that the grid shows a cut and a spend in one row with no
conflict marker is interface.

**6 · Return visit (DoD 6).** Scope + checkpoint (`research-scope`), topic + researched (`research`),
faces (`research-mode`, `script-mode`), adoption (`script-adopted`) — all IndexedDB per project
(`stepStore.ts`). The shelf cell for research/script never changes (`reportPhase` only in Frames), so
the shelf will say nothing happened while the studio remembers everything.

**7 · Nothing forced her toward Frames or spending (DoD 7).** Adopt says Frames "opens on this chain";
it does not navigate. Met.

## Scored criteria (identical every run)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Scope checkpoint states what will travel and reports drift after | **pass** | `ScopeGate.tsx:35,37,45`; `useScope.ts:206-209`; executed `diverged ['f-ath']`. Drift is reported on Research only; Script carries no drift line (grep). |
| 2 | Every card she cuts stays cut in Script's Coverage | **partial** | State stays: `MatrixCoverage.tsx:134,142,147`, one record `useScope.ts:165`. Contradicted in the same row: `usageIn` ignores scope (`versions.ts:337`, `impact.ts:118-140`); no conflict marker. |
| 3 | Required material is explained on the card that cannot be cut | **partial** | Guided: footnote visible (`GuidedResearch.tsx:86`). Expert: `title` tooltip only (`CardTile.tsx:233`), hover-gated; text is schema jargon (`cards.ts:123-124`). |
| 4 | Conclusions default OUT and say so | **pass** | `scope.ts:37,46`; `CardTile.tsx:206-208`; `ScopeBar.tsx:133,176-178`; `GuidedResearch.tsx:174`; `dimensions.ts:101`; executed `notTaken 7 · descoped 0`. |
| 5 | Evidence log reachable from Research AND Script | **fail** | Research: `TopicPanel.tsx:143`, `RunStage.tsx:48`. Script: none — `ScriptStep.tsx:229-233` names it, no trigger; comment `ScriptStep.tsx:17`. |

## Findings

```json
[
  {
    "id": "PR-L1-1",
    "journey": "compose-from-scratch",
    "character": "priyanka",
    "cert_level": "L1",
    "type": "strength",
    "severity": "polish",
    "impact": { "frequency": "high", "reachability": "high", "trust_erosion": "low" },
    "dimension": "trust",
    "title": "The scope checkpoint is honest about being a checkpoint, and drift is named card by card",
    "expected": "Confirming says what travels; a later change is reported, not silently absorbed.",
    "got": "'29 of 36 cards will go to the Script step' → after a cut: 'scope has moved · 3 cards have changed since you confirmed. The Script step works from the live board … confirm again' plus 'moved · f-…'. The copy admits Script reads the live board rather than the frozen one.",
    "evidence": ["app/_phases/research/_parts/ScopeGate.tsx:31-47", "app/_phases/research/useScope.ts:206-209", "app/_phases/research/scope.ts:81-83", "app/_phases/research/guided/GuidedResearch.tsx:185-189"],
    "code_check": "n-a",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Confirm on the expert board, cut one fact, assert data-testid=scope-diverged lists it and the button reads 'confirm again →'. Precondition: educational project with a loaded run."
  },
  {
    "id": "PR-L1-2",
    "journey": "compose-from-scratch",
    "character": "priyanka",
    "cert_level": "L1",
    "type": "trust",
    "severity": "major",
    "impact": { "frequency": "high", "reachability": "high", "trust_erosion": "high" },
    "dimension": "senior-quality",
    "title": "Coverage shows a cut card and the seconds a script spends on it in the same row, with no conflict marker",
    "expected": "A card she descoped either disappears from a script's attribution or the row says 'out of scope — still spoken by Reversal Chain for 12 s'. The approved scope and the script must not disagree without a warning.",
    "got": "Descoped rows get an amber tint and a '—' pip, but usageIn(version, renderId, cardId) takes no scope and returns the fixture attribution unchanged; the cell still prints '12s' and its tooltip 'beats 0:00'. Candidates chains fall back to the fixture whatever the scope; gateChains reads conclusions only. Executed: cut f-ath → still spoken 12s @0:00 in reversal-chain.",
    "evidence": ["app/_phases/script/_matrix/MatrixCoverage.tsx:134-167", "app/_phases/script/versions.ts:337", "app/_phases/script/impact.ts:118-140", "app/_phases/script/ScriptStep.tsx:65-66", "app/_phases/script/ScriptStep.tsx:192", "app/_phases/research/useScope.ts:140-146"],
    "code_check": "confirmed-absent",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": false,
    "scope_note": "That the fixture scripts were written against the full notebook is accepted mock content; that the grid renders 'cut' and 'spoken' in one row with no reconciliation is the interface gap. A real rewrite (recalibration, optional here) is the only path that re-attributes.",
    "l2_priority": "Cut f-ath on the board, open Script → Coverage, assert row-f-ath shows pip '—' AND cell-reversal-chain-f-ath still reads 12s with no warning text. Precondition: educational project, run loaded, no recalibration accepted."
  },
  {
    "id": "PR-L1-3",
    "journey": "compose-from-scratch",
    "character": "priyanka",
    "cert_level": "L1",
    "type": "missing-feature",
    "severity": "major",
    "impact": { "frequency": "high", "reachability": "high", "trust_erosion": "med" },
    "dimension": "completion",
    "title": "The evidence log is named on the Script step but cannot be opened from it",
    "expected": "Criterion 5: the evidence log is reachable from both Research and Script — the legal pre-read is done against the candidate, not the notebook.",
    "got": "Script's header prints 'the notebook and the evidence log / live in step 1' as static text; no button, no modal. grep open-evidence|EvidenceLog under app/_phases/script/ → only the comment at ScriptStep.tsx:17 ('The evidence log moved to Step 1'). Research has the pill on both faces.",
    "evidence": ["app/_phases/script/ScriptStep.tsx:17", "app/_phases/script/ScriptStep.tsx:229-233", "app/_phases/research/_parts/TopicPanel.tsx:143-150", "app/_phases/research/guided/RunStage.tsx:48-53"],
    "code_check": "by-design",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "On /studio/<id> Script tab assert no element with data-testid=open-evidence exists and the header text names step 1. Precondition: researched educational project."
  },
  {
    "id": "PR-L1-4",
    "journey": "compose-from-scratch",
    "character": "priyanka",
    "cert_level": "L1",
    "type": "trust",
    "severity": "major",
    "impact": { "frequency": "high", "reachability": "high", "trust_erosion": "high" },
    "dimension": "trust",
    "title": "A brand-new project opens Research with another project's topic already in the field, and the notebook never says it is a stand-in until after the run",
    "expected": "DoD 4: she can tell what the research is ABOUT — hers or a stand-in — before she makes decisions against it. A new project's topic field is empty.",
    "got": "setTopic(saved?.topic ?? NOTEBOOK.topic) pre-fills 'Why Bitcoin price does not rise' for a project with no research record. After she overtypes and runs, the guided compact card prints HER topic as the headline over Bitcoin counts; the notebook modal title is hard-coded 'why-bitcoin-price-does-not-rise'. LocalProcessNote says the TRACE is replayed, not that the NOTEBOOK is fixed.",
    "evidence": ["app/_phases/research/guided/useEducationalResearch.ts:43", "app/_phases/_shared/notebook/notebook.ts:15", "app/_phases/research/guided/RunStage.tsx:100-104", "app/_phases/research/ResearchStep.tsx:299", "app/_phases/research/run/controls.tsx:147-154"],
    "code_check": "present-broken",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": false,
    "scope_note": "The Bitcoin notebook itself is an accepted gap. The pre-filled topic and the headline that repeats her topic over the stand-in are interface, and are what the accepted gap's condition ('every surface says so') is about.",
    "l2_priority": "Create a fresh educational project, open Research, read the topic input value before typing — expect empty, observe Bitcoin. Then run and assert the compact card headline vs the notebook modal title. Precondition: NEW project (not seed-why-bitcoin)."
  },
  {
    "id": "PR-L1-5",
    "journey": "compose-from-scratch",
    "character": "priyanka",
    "cert_level": "L1",
    "type": "confusion",
    "severity": "major",
    "impact": { "frequency": "high", "reachability": "high", "trust_erosion": "med" },
    "dimension": "clarity",
    "title": "The guided face confirms a scope of 29 cards after dealing only 8 of them, and never says the facts are on the other face",
    "expected": "'Scope the material so only vetted facts travel.' The default face for a new project should either deal the facts or say plainly that the 28 facts/mechanisms/reversals are un-reviewed until the expert board.",
    "got": "passes.tsx deals hottest take + steel-man (stage 2) and six conclusions (stage 3). Stage 4 shows 'in scope 29/36', 'Nothing descoped. The script will be written against the full notebook…' and a live confirm button. The only pointer to the facts is the finish label 'Open the expert board'.",
    "evidence": ["app/_phases/research/guided/passes.tsx:33-48", "app/_phases/research/guided/GuidedResearch.tsx:158-199", "app/_phases/research/guided/GuidedResearch.tsx:208", "app/_phases/research/_parts/ScopeBar.tsx:172-180", "app/_phases/research/ResearchStep.tsx:170-181"],
    "code_check": "confirmed-absent",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Fresh educational project → run → walk the wizard to 'review' without switching face; assert confirm-scope is enabled and no stage text mentions the 21 facts. Precondition: new project so the guided default latches."
  },
  {
    "id": "PR-L1-6",
    "journey": "compose-from-scratch",
    "character": "priyanka",
    "cert_level": "L1",
    "type": "quality-gap",
    "severity": "minor",
    "impact": { "frequency": "med", "reachability": "high", "trust_erosion": "med" },
    "dimension": "senior-quality",
    "title": "The 'required' steel-man cannot be cut, but both facts it rests on can — and the checkpoint still confirms",
    "expected": "Required material is explained AND its evidence is protected, or the confirm refuses while a required turn has no surviving evidence.",
    "got": "Executed: descoping f-mstr-defence and f-supply-2pct → wound {steel-man, severity 'broken'}, summary.blocked === false (blocked only tests the required card's own descoped flag, which no UI can set). Consequences shows the red 'cannot be argued' notice with 'restore a card or accept that the script loses that turn'; confirm-scope stays enabled. Disclosed, not silent — a product call on whether to refuse.",
    "evidence": ["app/_phases/research/scope.ts:59-70", "app/_phases/research/scope.ts:103,125", "app/_phases/research/_parts/ScopeGate.tsx:63", "app/_phases/research/_parts/ScopeBar.tsx:189-207", "app/_phases/research/_parts/CardTile.tsx:227,251"],
    "code_check": "by-design",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Cut f-mstr-defence and f-supply-2pct on the board; assert the Consequences error notice AND that confirm-scope is not disabled. Precondition: loaded run, expert face."
  },
  {
    "id": "PR-L1-7",
    "journey": "compose-from-scratch",
    "character": "priyanka",
    "cert_level": "L1",
    "type": "confusion",
    "severity": "minor",
    "impact": { "frequency": "med", "reachability": "high", "trust_erosion": "low" },
    "dimension": "clarity",
    "title": "On the expert board the reason a card is locked is a hover tooltip, and its wording is schema jargon",
    "expected": "Criterion 3: the reason is on the card, readable without hovering, in the creator's vocabulary.",
    "got": "CardTile puts requiredWhy in the <li> title attribute (hover-only; not reachable by keyboard or touch); the chip says 'locked in scope' with no reason. The text — 'mandatory (NOTEBOOK-SCHEMA §steel_man)… Engine D cannot be run honestly' — is written for the pipeline, not for an instructional designer. The guided face does print it as a visible footnote.",
    "evidence": ["app/_phases/research/_parts/CardTile.tsx:233", "app/_phases/research/_parts/CardTile.tsx:199-205", "app/_phases/_shared/notebook/cards.ts:122-124", "app/_phases/research/guided/GuidedResearch.tsx:86"],
    "code_check": "present-but-missed",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Keyboard-tab to card-steel-man on the expert board; assert no visible reason text without hover. Precondition: expert face."
  },
  {
    "id": "PR-L1-8",
    "journey": "compose-from-scratch",
    "character": "priyanka",
    "cert_level": "L1",
    "type": "strength",
    "severity": "polish",
    "impact": { "frequency": "high", "reachability": "high", "trust_erosion": "low" },
    "dimension": "trust",
    "title": "Conclusions default OUT and every surface says so in the same words",
    "expected": "Nothing speculative travels by default, and the default is labelled as a default rather than a decision.",
    "got": "OPT_IN_DEFAULT for all 7 conclusions; chip 'not taken' vs 'descoped'; ScopeBar counts 'not taken' separately so the board does not open amber; Consequences 'minus the 7 conclusions you have not taken'; wizard stage copy 'every one starts OUT of scope'. Executed: fresh scope kept 29/36, notTaken 7, descoped 0.",
    "evidence": ["app/_phases/research/scope.ts:37,46,99-115", "app/_phases/research/_parts/CardTile.tsx:206-208", "app/_phases/research/_parts/ScopeBar.tsx:132-133,176-178", "app/_phases/research/guided/GuidedResearch.tsx:174", "app/_phases/_shared/notebook/dimensions.ts:101"],
    "code_check": "n-a",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Assert scope-state-c-* chips all read 'not taken' on first open and the ScopeBar shows 'not taken 7' with 'descoped 0'."
  },
  {
    "id": "PR-L1-9",
    "journey": "compose-from-scratch",
    "character": "priyanka",
    "cert_level": "L1",
    "type": "strength",
    "severity": "polish",
    "impact": { "frequency": "med", "reachability": "high", "trust_erosion": "low" },
    "dimension": "trust",
    "title": "Guided ⇄ expert discards nothing, on both steps, by construction (S7)",
    "expected": "Switching face keeps every keep/cut, the checkpoint, and the adoption.",
    "got": "One useScope instance above both research faces; the wizard's onPick IS api.toggle; the face is stored under its own key (research-mode / script-mode) and switching writes only that key. Script's face switch is also mode-only.",
    "evidence": ["app/_phases/research/ResearchStep.tsx:149-150,159-162", "app/_phases/research/guided/GuidedResearch.tsx:99", "app/_phases/research/_parts/CardTile.tsx:256", "app/_phases/script/candidates/useScriptFace.ts:72-79", "app/_phases/script/ScriptStep.tsx:293-300"],
    "code_check": "n-a",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Take the hottest take in the wizard, switch to expert, assert scope-state-c-reserve-was-the-product reads 'taken'; cut a fact on the board, switch back, assert the review summary changed. Then reload and repeat."
  },
  {
    "id": "PR-L1-10",
    "journey": "compose-from-scratch",
    "character": "priyanka",
    "cert_level": "L1",
    "type": "quality-gap",
    "severity": "minor",
    "impact": { "frequency": "high", "reachability": "high", "trust_erosion": "med" },
    "dimension": "senior-quality",
    "title": "No candidate sits in her 60–180 s band and nothing says so",
    "expected": "Candidates measured against the project's template band and target (120 s), or a line saying these three are 300/250/45 s renders of a mid-length intent.",
    "got": "Runtime comes from the render fixture (300 s, 250 s, 45 s), project.targetS is read nowhere under app/_phases/script/. The expert column prints 'template mid-educational-video — outside the notebook's intent, by design' per render; the duel prints only the duration.",
    "evidence": ["app/_phases/script/renders.ts:16-17,75-76,122-123", "app/_phases/script/_parts/HypothesisColumn.tsx:109-110", "app/_phases/script/candidates/CandidatesDuel.tsx:139-141"],
    "code_check": "confirmed-absent",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": false,
    "scope_note": "env.md already scores script-candidates 3/4 for this; raised because a 120 s module against three off-band renders has no 'off-band' word on the guided face.",
    "l2_priority": "Create with target 120 s; on Script Candidates assert no text references 120 s or the 60–180 s band."
  },
  {
    "id": "PR-L1-11",
    "journey": "compose-from-scratch",
    "character": "priyanka",
    "cert_level": "L1",
    "type": "confusion",
    "severity": "minor",
    "impact": { "frequency": "high", "reachability": "high", "trust_erosion": "low" },
    "dimension": "clarity",
    "title": "The shelf never learns that Research or Script happened (H4)",
    "expected": "After a run and an adopted script the project card on /projects reflects it.",
    "got": "reportPhase has exactly one caller, in Frames. Research and Script write their own step records but never report progress, so the shelf cell stays empty while the studio remembers everything.",
    "evidence": ["app/_phases/frames/useFrames.ts:724", "lib/projects.ts:533-542"],
    "code_check": "confirmed-absent",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "After adopting, return to /projects and read the project's research/script cells. Precondition: any educational project."
  },
  {
    "id": "PR-L1-12",
    "journey": "compose-from-scratch",
    "character": "priyanka",
    "cert_level": "L1",
    "type": "missing-feature",
    "severity": "minor",
    "impact": { "frequency": "high", "reachability": "high", "trust_erosion": "low" },
    "dimension": "missing",
    "title": "There is no scope record to hand to legal — a cut has no reason and no list leaves the screen",
    "expected": "'A record of what was kept and cut' she can point to: the cut cards, why, and when the checkpoint was taken.",
    "got": "CardState is {descoped, liked, deepen}; no reason field, no timestamp on confirmed, no list view or copy of the cut set. The board and ScopeBar show the state live; that is the whole record.",
    "evidence": ["app/_phases/research/scope.ts:32-37", "app/_phases/research/useScope.ts:221", "app/_phases/research/_parts/ScopeBar.tsx:124-142"],
    "code_check": "confirmed-absent",
    "verdict": "confirmed",
    "resolution": "open",
    "scope_note": "Export is an accepted out-of-scope; the reason-per-cut and a readable cut list are interface and are not.",
    "l2_priority": "Not L2-verifiable beyond absence; confirm no 'why' affordance appears on a descoped card."
  },
  {
    "id": "PR-L1-13",
    "journey": "compose-from-scratch",
    "character": "priyanka",
    "cert_level": "L1",
    "type": "strength",
    "severity": "polish",
    "impact": { "frequency": "high", "reachability": "high", "trust_erosion": "low" },
    "dimension": "effort",
    "title": "The wizard answers the type question in her words and never sends her to the library",
    "expected": "DoD 2 and her pet peeve: a type question answerable without the studio's vocabulary, and no style detour.",
    "got": "'Short educational · one idea, explained well — a question chain with facts hung on it · 60–180s measured · target 120s'. All six presets fit educational, so the style stage is one click. Only the name is required. Polish: the logline placeholder is a heist line and the name placeholder 'Glass Harbor' on an L&D project.",
    "evidence": ["lib/projects.ts:126-136,151-156", "app/_projects/wizard/CreateWizard.tsx:110-113,231-239", "app/_projects/wizard/stages.tsx:210,225"],
    "code_check": "n-a",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Assert the style stage shows preset cards (not EmptyStyleDeck) for educational on a fresh profile."
  }
]
```

## Verdict

**L1-conditional** — the journey completes structurally (create → run → scope → confirm → adopt, all
persisted), with four majors carried to L2: PR-L1-2 (Coverage contradicts the scope in one row),
PR-L1-3 (evidence log unreachable from Script), PR-L1-4 (Bitcoin topic pre-filled; stand-in not named
before the decision), PR-L1-5 (guided face confirms un-reviewed facts).

grounding: research-run 0/5 · script-candidates 3/4 (beat-board not met — educational never mounts it)

time-saved-if-it-all-worked: ~260 min (≈5 h manual → wizard 3 min + run at replay speed + 36-card
triage ~15 min + adopt ~5 min ≈ 30–40 min, under her 45-minute bar) · confidence medium-low: the
legal pre-read half of her job (evidence log against the candidate, scope record with reasons) is not
on the Script surface, so the last hour of the five is not yet saved.

## First-person review (L1, designed experience)

Would I adopt it? Provisionally — for the front half. The create flow is the first tool that has asked
me "what kind of video" and had "one idea, explained well, 60 to 180 seconds" as an answer. That is my
module. The conclusions being OFF until I take them, and the board telling me the difference between
"not taken" and "cut", is exactly the discipline I have to enforce by hand in Articulate today.

What frustrated me: I named the project "Data-handling refresher" and the research field was already
holding somebody's Bitcoin question. I know this is a prototype; the little note under the field says
the run is replayed. But it says the *process* is replayed. It does not say the notebook I am about to
scope is about a cryptocurrency whatever I type, and the card that came back had MY title on it over
the Bitcoin numbers. My legal reviewer would stop reading at that card.

The checkpoint is good — genuinely good. It told me the board had moved and named the three cards.
That is the sentence I have wanted from every tool I have used. But then Script's coverage grid showed
one of my cut facts with twelve seconds spent on it, in the same row as the "out of scope" mark, and
said nothing about the contradiction. A scope and a script that disagree without a warning is the one
workflow I said I would refuse.

And the evidence log: Script tells me it "lives in step 1". I do my pre-read against the candidate,
not the notebook. A sentence pointing back a step is not a link.

Does it fit my world? The guided wizard would, if it dealt me the facts. It dealt me a hot take, a
locked argument with a reason written for an engineer, and six conclusions, then told me 29 cards were
going to Script. I had reviewed eight. I only found the other twenty-eight because the last button said
"expert board".

Worth the wait? Yes if the scope and the script agree and I can hand legal something. Would I tell a
peer? "Wait one release — the scoping is the best I've seen; the script side doesn't read it yet."

## First-person review (L2, live experience)

L2 verdict: **L2-conditional** — the checkpoint reports drift to the board AND the shelf now, but Coverage still shows a cut fact being spoken for 12 s with no warning, which is the workflow I said I would refuse.

I finished create → run → confirm → cut → confirm again → Script. The topic field was empty and the note named the Bitcoin stand-in against "How phishing emails get past a careful reader" before I decided anything; my legal reviewer could read that card. On the expert board I cut `f-ath` past the checkpoint and the gate said `moved · f-ath` (shot 05); the project record flipped Research to `review` and the shelf drew "needs a call". A status I can trace to an act — new since the design.

Then Coverage: the row for the fact I cut is tinted and pipped `—`, and the same row reads `usage=spoken text=12s`. No conflict marker. Script still says the evidence log "lives in step 1" with nothing to click (`expect absent` held). The guided review still confirmed 29 cards after dealing me 8; the finish now hands me to Script, which is kinder, and also means a first-timer never meets the facts.

What is missing for my job is unchanged and precise: a warning where scope and script disagree, the evidence log on the candidate, a cut list with reasons. Would I tell a peer? "The scoping is the best I have seen and now tells the shelf when it moved. The script side still does not read it. One release."
