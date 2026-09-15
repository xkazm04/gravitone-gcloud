# Kwame — compose-from-scratch · L1 (theoretical, code-grounded)

Character: `uat/characters/kwame-history-short.md` (KW) · Journey: `uat/journeys/compose-from-scratch.md`
Scenario: S1-variant — educational · **short-educational-video** · first-timer, guided faces everywhere.
Job: "the Suez crisis in two minutes" → a three-beat outline with one sourced reframing fact, in one evening.
Motivation (verbatim): manual way ~2.5 h; adopts if under 30 min; abandons the first time it teaches him a term instead of answering his question.
Senior bar (verbatim): refuse a script that states a date or cause it cannot source, and refuse a cliché reframing.

## Surface model

> Note: `app/_projects/wizard/{CreateWizard,stages}.tsx` changed on disk mid-walk (a parallel session added *borrowed presets* for trailer/free, `CreateWizard.tsx:111-127`). Kwame's educational path is unaffected — six presets fit, `borrowedPresets=false` — and citations below are against the post-change file.

### Reachable set (Kwame's branch), with the predicate that routes him

| Stage | Surface | Route predicate | Evidence |
|---|---|---|---|
| Shelf | `/projects` → "new project" tile | `onCreate={() => router.push("/projects/new")}` | `app/projects/ProjectsView.tsx:146` |
| Create | `CreateWizard` on `Deck` — 4 stages discipline · template · style · name | linear, Next gated on `stage.done` | `app/_projects/wizard/CreateWizard.tsx:218-291`, `components/ui/deck/Deck.tsx:65-66,147` |
| Create · style | 6 presets, all `discipline:"educational"` → `styleFits` passes | `fittingPresets.length === 6`, so `EmptyStyleDeck` is NOT reached for him (H1 does not apply to educational — contradicts nothing, scopes the orchestrator's blocker to trailer/free) | `CreateWizard.tsx:122-127,255-256` (educational: `disciplinePresets.length===6`, so `borrowedPresets=false`), `app/library/presets.ts:49-134` |
| Create · finish | mints preset → locked theme, `create()`, `router.push(/studio/<id>)` | new project parks on `phase:"research"` | `CreateWizard.tsx:163-212`, `lib/projects.ts:352` |
| Studio | header chip `Educational video · Short educational · 120s`, `prototype · mocked data`, Stepper 1–5 | `phaseKey = p.phase` | `app/studio/[projectId]/StudioView.tsx:106-110,203-211,293` |
| Research | `ResearchStep` → `EducationalResearch` → **guided** face (no decisions yet: `decided=false`) | `discipline==="educational"`; `defaultFace = decided ? "expert" : "guided"` | `app/_phases/research/ResearchStep.tsx:96,170-181` |
| Research · guided | `GuidedResearch` 4 stages run · the takes · conclusions · review; finish CTA = "Open the expert board" | `active` starts 0 (`ready=false`) | `app/_phases/research/guided/GuidedResearch.tsx:128,141-211` |
| Research · run | `RunStage`: OutcomePicker, TopicField, "Research this", `LocalProcessNote`, `RunTrace` | `run.start` → replayed `TRACE` at 8× | `guided/RunStage.tsx:125-237`, `run/useResearchRun.ts:30,170-177`, `run/trace.ts:24-38` |
| Research · takes | hand = `hotTakes` (1 card, `c-reserve-was-the-product`) + steel-man (unpickable) | `card.hottest`, `card.required` | `guided/passes.tsx:33-41`, `_shared/notebook/conclusions.ts:488`, `cards.ts:119-124` |
| Research · conclusions | 6 opt-in conclusions, default `not taken` | `c.optIn && !c.hottest` | `passes.tsx:46-48`, `research/scope.ts:37-45` |
| Research · review | `ScopeBar` + `Consequences` + `ConfirmScope` | `confirm()` writes a checkpoint only | `_parts/ScopeBar.tsx`, `_parts/ScopeGate.tsx:24-72`, `useScope.ts:94` |
| Script | `ScriptStep` → `ExplainerScript`; gate `researched` (written by the RUN, not by confirm) | `discipline!=="trailer"`; `saveStep(research,{researched: ready})` | `app/_phases/script/ScriptStep.tsx:104-111,161-167,197-205`; `guided/useEducationalResearch.ts:48-51` |
| Script · guided | `CandidatesDuel` (3 cards) + tabs Candidates/Coverage/Spend bar/Tracks + `StickyNotebook` pad | `face==="guided"` (no version work, no adoption at open) | `ScriptStep.tsx:241-258,278-311`, `candidates/useScriptFace.ts:47-56` |
| Adopt | whole-card pick → `script-adopted` record | `adopt(id)`; unpick writes `""` | `candidates/useAdoption.ts:45-53`, `CandidatesDuel.tsx:151-155` |

Stops before Frames. Nothing on this path opens the expert board or `/library` unless Kwame presses the wizard's finish CTA (see KW-L1-4) — the only surface he is *led* to that is off-binding.

### Grounding audit (against `uat/env.md`'s shared denominator)

- **research-run 0/5.** The trace is the Bitcoin `TRACE` regardless of topic (`run/trace.ts:24-38`); nothing reads the logline, template, targetS or prior notebooks (`grep -rln targetS app/_phases` → only cut/frames/score). Matches env.
- **script-candidates 2/4 — contradicting env's 3/4.** Reads (1) scope live via `useScope` and (4) the notebook. (3) "the template band" is the RENDER's own `template` field (`renders.ts:16,75,122`), never the project's: `ScriptStep` calls `getProject` only for `discipline` (`ScriptStep.tsx:99-111`); there is no `templateOf`/`project.template` anywhere under `app/_phases/script/`. For a mid-educational project the fixture happens to agree; for Kwame's short-educational it does not, so (3) is not read. (2) runtime is `r.durationS` from the fixture.
- beat-board: not met (educational).

### Wiring audit (one grep per suspected-unread value)

| Value | Read by the surfaces on this path? | Evidence |
|---|---|---|
| `project.targetS` (120) | **No** — only displayed in the studio header chip | `StudioView.tsx:206`; `grep targetS app/_phases/{research,script}` → none |
| `project.template` | **No** in Research/Script | `ScriptStep.tsx:99-111` reads `discipline` only |
| `project.logline` | **No** on this path (hint says "It is what the script step argues back against") | `stages.tsx:224`; no reader under `app/_phases/script` |
| `reportPhase` for research/script | **Never called** — only Frames reports | `grep -rln "reportPhase(" app` → `app/_phases/frames/useFrames.ts:724` only |
| research topic for a NEW project | pre-filled with `NOTEBOOK.topic` when no record exists | `useEducationalResearch.ts:43`; `stepStore.ts:495-498` seeds only ids matching `/bitcoin/i` |
| `api.confirmed` | read by nothing outside research (a checkpoint) | `useScope.ts:13-31` |

## Walkthrough (cognitive walkthrough: will he know what to do · will he see the control · will he connect it to his goal · will he see progress)

**Shelf → Create.** The new-project tile leads to the wizard; a second button "quick create — the expert form" (`ProjectsView.tsx:99`) is labelled as the expert path, so he ignores it. Good.

**Stage 1 · discipline.** Headline "What kind of video is this?" — his words. Card "Educational video · an argument explained well — the craft library measured these" (`lib/projects.ts:127,134`). He picks it. The rail label is `discipline` and the sub-line says "educational and promotional pieces are different contracts, and the craft library measured them separately" (`CreateWizard.tsx:221-222`) — "discipline", "contracts", "craft library" are the first three words he does not have, on the first screen. He can still act, because the headline is plain.

**Stage 2 · template.** "Which craft format inside it?" — "Short educational · one idea, explained well — a question chain with facts hung on it", chips `60–180s measured · target 120s` (`stages.tsx:86-88`, `lib/projects.ts:152-156`). This is exactly his job; he picks it. "measured" is unexplained but the number carries.

**Stage 3 · style.** "Which visual identity does it render in?" Six preset cards with real thumbnails, one-line pitches ("Chalk Argument — Blackboard, drawn live. Best when the video is a line of reasoning."), footnote "locks as this project's style when you create" (`stages.tsx:136-158`). Pickable, and the lock is explained. He picks Chalk Argument. Kwame does not know what "render" means for a video he narrates over slides, but the cards make the choice obvious.

**Stage 4 · name.** "Name it, and set the clock · Only the name is required." Types "Suez in two minutes". Logline hint: "It is what the script step argues back against" (`stages.tsx:224`) — he does not know what that means and, per the wiring audit, nothing on his path reads it. Runtime pre-set 120s with hint "Short educational was measured at 60–180s. Past that band the craft rules stop applying." "Create & open" enabled. He finishes. Back is always free and unpicking is a re-click (`DeckCard.tsx:287`) — criterion 4 holds throughout the wizard.

**Studio opens.** Headline is his title; chip says `EDUCATIONAL VIDEO · SHORT EDUCATIONAL · 120S`; amber `PROTOTYPE · MOCKED DATA` (`StudioView.tsx:203-211`). Stepper: 1 Research (cyan) … 5 Cut. He is on Research. "Score" and "Cut" are jargon but out of scope today.

**Research · stage 1 "run".** Eyebrow `step 1 · research · guided`. Headline "What should the research investigate?" — plain. But the first control on the table is `PROTOTYPE · DRIVE THE ENDING  returns a notebook · finds no tension · the local process dies | load saved run` (`RunStage.tsx:128-134`, `controls.tsx:56-70`) — three pills whose meaning is only in hover titles. Below it the topic field is **already filled with "Why Bitcoin price does not rise"** — not a placeholder, a value (`useEducationalResearch.ts:43`: `saved?.topic ?? NOTEBOOK.topic`, and a new project has no saved record — `stepStore.ts:495-498`). "Research this" is therefore enabled before he has typed anything. He clears it, types "The Suez crisis, 1956", presses Research this. The note under the field reads "research runs as a local Claude Code process — minutes, not milliseconds, and it can exit non-zero. Prototype: the trace is replayed at 8× from run 1 and nothing is executed." (`controls.tsx:150-151`) — "exit non-zero", "trace", "8×", "run 1" are all new words, and none of them says *the notebook will be about Bitcoin, not Suez*.

The run log fills with `1 · FACTUAL SPINE / web · the number · bitcoin all-time high 2025…` (`trace.ts:24`). This is the moment he learns the material is not his — from the content, not from the interface. On `done` the pills `notebook · the argument`, `evidence log · 19 claims`, `clear the research` and `Next deals the takes →` appear (`RunStage.tsx:216-226`). If he opens the notebook, the modal title is `notebook · why-bitcoin-price-does-not-rise` (`ResearchStep.tsx:299`). If he leaves the stage and comes back, the compact card headlines **his** topic over Bitcoin counts (`RunStage.tsx:100-104`) — "a notebook exists · The Suez crisis, 1956 · 19 facts · 3 mechanisms · 4 reversals · researched 2026-08-11".

**Research · stage 2 "the takes".** Headline "The takes that need your eyes first". Sub: "The steel-man always travels — the library forbids cutting it, so it has no pick target. The hottest take is yours…" (`GuidedResearch.tsx:161-162`). Two cards: `😈 HOTTEST TAKE` with chip `not taken`, risk "speculation about motive — not reporting. Held to a higher bar, not a lower one." (`passes.tsx:141-148`); and the steel-man card with chip `locked in scope — always travels` and footnote "The steel-man is mandatory (NOTEBOOK-SCHEMA §steel_man). Without it the script can only produce a polemic, and Engine D cannot be run honestly at all." (`GuidedResearch.tsx:85-86`, `cards.ts:123-124`). He asked "what does the button do"; the footnote answers with a schema section and an engine letter. The locked card at least says it is locked and why it cannot leave — criterion 3 is met in letter, not in his vocabulary. "details" expands to `moderate leap · would be the colour · pattern · announced-but-unbuilt infrastructure` (`passes.tsx:132-133,178`).

**Research · stage 3 "conclusions".** Six cards, all `not taken`; sub explains the default honestly ("every one starts OUT of scope — picking a card takes it") (`GuidedResearch.tsx:174`). Picking is a re-click toggle through `api.toggle` (`GuidedResearch.tsx:99`). Fine mechanically; "scope" is unglossed. Summary `0/6 taken`.

**Research · stage 4 "review".** "What did your scope decisions cost?" then a stat row `IN SCOPE 23/30 · LIKED 0 · DEEPEN 0 · WOUNDED 0` (`ScopeBar.tsx:12-24`) — `liked` and `deepen` are counters for actions that exist only on the expert board's `CardActions` (`CardTile.tsx:277`); the guided face never offers them. `Consequences` says "Nothing descoped. The script will be written against the full notebook, minus the 7 conclusions you have not taken." (`ScopeBar.tsx:58-62`). `ConfirmScope`: "confirm the scope · 23 of 30 cards will go to the Script step" → `confirm scope →` (`ScopeGate.tsx:31-35,66`). He confirms; the button becomes `confirmed` (disabled) and a `reopen` button appears. Then the deck's primary button reads **"Open the expert board"** (`GuidedResearch.tsx:208`). Nothing on this stage says "now go to 2 · Script"; the way forward is the Stepper above, which he has to notice himself.

**Script.** Header block: `WRITTEN AGAINST · 19 claims · 11 load-bearing · 3 mechanisms · 4 reversals · half-life … / tension strength — …` (`ScriptStep.tsx:219-227`). Tabs `Candidates — three renders, measured · Coverage — who used what, and for how long · Spend bar — the runtime as a budget · Tracks — running order — the bridge to Frames` (`ScriptStep.tsx:73-78`). A fixed amber pad bottom-right: `NOTES · 0 / no notes yet / [Recalibrate] (disabled) / local claude code · <model> · edits, not rewrites` (`StickyNotebook.tsx:60-68`, `RecalibrateControl.tsx:187-200`). Face switch button says `full controls`.

Three cards: `REVERSAL CHAIN · Why Bitcoin's Price Won't Rise · opens/turns/lands · 15 beats · 5:00 · risk — can read as contrarian if the steel-man is cut`; `ADJUDICATION · … · 4:10`; `PARADOX TEASER · "They never sell" · 6 beats · 0:45` (`CandidatesDuel.tsx:124-149`, `renders.ts:13-27,72-77,119-135`). His project chip three inches above says 120s. No card, tab or note mentions 120s, "short educational", or that these were rendered for a different template. "read more" reveals `pleasure: being corrected. Reads like an argument.`, band meters "turns … below the band reads as a lecture", "essay words", `0:45 at 150 wpm · promise form: contradiction · 0 questions aloud`, and `gate: 40% enforced · 5 checked · 0 failed · 3 not checked / checks: 5✓ 0! 1✕` (`CandidatesDuel.tsx:170-215`). He picks the 45-second one because it is the only one that is short; the card says `adopted — the Frames step opens on this chain` (`CandidatesDuel.tsx:153`). Adoption persists (`useAdoption.ts:50`). "read the beats" opens the real chain — readable, six lines, Bitcoin.

**Return visit (DoD 6).** Topic + `researched` persist (`useEducationalResearch.ts:48-51`); on reload `run.load()` restores `done` (`:44`); scope + checkpoint persist (`useScope.ts:56-59`); adoption persists; face choices persist under `research-mode`/`script-mode`; `parkAt` re-opens on the step he left (`StudioView.tsx:158`). But the shelf's Research/Script cells and the Stepper badges stay `not started` for ever — no reporter exists for those steps (`grep reportPhase(` → frames only).

## Scored criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Never has to guess what a stage word means — each has a gloss on screen | **FAIL** | 30+ unglossed terms on the path he is led down; worst: `NOTEBOOK-SCHEMA §steel_man … Engine D` on a card footnote (`cards.ts:123-124`), trace phases "spine / steel-man / turns / engine fit & currency" (`trace.ts:11-21`), stat row "descoped · deepen · wounded" (`ScopeBar.tsx:16-24`), `gate: 40% enforced … 5✓ 0! 1✕` (`CandidatesDuel.tsx:59-74`). Full list in KW-L1-2. |
| 2 | Create → readable candidate needs no page he was not led to | **PASS (conditional)** | The path is create → studio → Research guided → Stepper 2 → Script guided. But the guided wizard's only primary finish is "Open the expert board" (`GuidedResearch.tsx:208`) and nothing points at the Stepper (KW-L1-4). He is led to the wrong page, not forced onto it. |
| 3 | A locked/disabled control says what unlocks it | **PARTIAL** | Steel-man card: says locked and why (`GuidedResearch.tsx:85-86`) — pass. Expert tab "locked until a notebook exists" (`ResearchStep.tsx:244`) — pass but off-path. Deck `Next` disabled with no text (`Deck.tsx:147`), `Research this` disabled with no text (`RunStage.tsx:150`), pad `Recalibrate` disabled with no text on every Script tab (`RecalibrateControl.tsx:189-193`) — fail. |
| 4 | Can back out of any pick without losing the others | **PASS** | Deck backward always free (`Deck.tsx:65`); wizard cascade drops only what no longer fits and says so in code (`CreateWizard.tsx:137-155`); re-click unpicks (`DeckCard.tsx:287`); takes/conclusions are independent toggles (`GuidedResearch.tsx:99`); adoption unpick writes `""` (`useAdoption.ts:48`); `reopen` after confirm (`ScopeGate.tsx:50-57`). Exit link says "back to the shelf — nothing is kept" (`CreateWizard.tsx:320`). |
| 5 | The SHORT candidate is short — the runtime he chose is respected or the mismatch is stated | **FAIL** | He chose 120s (band 60–180). Candidates are 300s / 250s / 45s — executed: none equals 120, none inside 60–180, none tagged `short-educational-video` (`renders.ts:16-17,75-76,122-123`). No surface under `app/_phases/script` reads `targetS` or `template`; no mismatch text exists. The studio header (`StudioView.tsx:206`) and the cards contradict each other silently. Content is fixture; the *absent statement* is interface. |

Senior bar: the guided Research face deals no fact cards at all (`passes.tsx:33-48` — hottest take, steel-man, conclusions); the sourced facts are only in the evidence-log modal (`RunStage.tsx:48`) and on the expert board's `CardTile` (`CardTile.tsx:155-175`). A history teacher who wants "one sourced reframing fact" can reach the sources in one click, but the cards he is asked to decide on are the *unsourced* tier by construction (conclusions: "no direct source — reasoned", `CardTile.tsx:120`). Reframing-cliché test: not judgeable (fixture content).

## Findings

```json
[
  {
    "id": "KW-L1-1",
    "journey": "compose-from-scratch",
    "character": "kwame",
    "cert_level": "L1",
    "type": "strength",
    "severity": "P3",
    "impact": { "frequency": "every-run", "reachability": "full", "trust_erosion": "none" },
    "dimension": "create",
    "title": "The wizard's four questions are asked in his words and every pick is reversible",
    "expected": "Type question answerable without the studio's vocabulary; picks he can walk back",
    "got": "'What kind of video is this?' / 'Educational video' / 'Short educational — one idea, explained well' with '60–180s measured · target 120s'; six preset cards with real thumbnails and 'locks as this project's style when you create'; Back always enabled, re-click unpicks, exit link says 'nothing is kept'",
    "evidence": [
      "app/_projects/wizard/CreateWizard.tsx:218-270",
      "app/_projects/wizard/stages.tsx:55-95,136-158",
      "lib/projects.ts:126-135,150-156",
      "components/ui/deck/Deck.tsx:65-66,136-152",
      "components/ui/deck/DeckCard.tsx:283-291"
    ],
    "code_check": "styleFits passes all six presets for discipline=educational (presets.ts:49-134 all tagged educational) so EmptyStyleDeck is unreachable on this path; H1 is scoped to trailer/free only",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Low — confirm the deal-in animation does not hide the pick target on a slow machine; precondition: fresh profile, /projects/new"
  },
  {
    "id": "KW-L1-2",
    "journey": "compose-from-scratch",
    "character": "kwame",
    "cert_level": "L1",
    "type": "vocabulary",
    "severity": "P1",
    "impact": { "frequency": "every-run", "reachability": "full", "trust_erosion": "high" },
    "dimension": "research+script",
    "title": "The guided path teaches ~30 studio terms with no on-screen gloss — his stated abandon trigger",
    "expected": "Every stage word has a gloss on screen (criterion 1); a first-timer 'never has to guess what a stage word means'",
    "got": "Unglossed on the path he is LED down (file:line = where the string is emitted): CREATE — 'discipline' (stages.tsx:58, CreateWizard.tsx:220), 'craft format' / 'template' (CreateWizard.tsx:232-233), 'different contracts', 'the craft library measured' (CreateWizard.tsx:222; lib/projects.ts:134), 'visual identity … renders in', 'locked style' (CreateWizard.tsx:243-244), 'Logline … what the script step argues back against' (stages.tsx:224), 'craft band / craft rules' (stages.tsx:244). RESEARCH — 'prototype · drive the ending' pills 'returns a notebook / finds no tension / the local process dies' with hover-only hints (controls.tsx:56-70; trace.ts:52-66), 'notebook' (RunStage.tsx:233-234, 46), 'exit non-zero', 'trace replayed at 8× from run 1' (controls.tsx:150-151), trace phase headings 'factual spine / find the tension / build the mechanisms / pre-compute the turns / find the steel-man / engine fit & currency / declare your gaps' (trace.ts:11-21), trace detail 'BUT/THEREFORE chains', 'obvious_reading', 'reversal-chain excellent · adjudication good · paradox-teaser good' (trace.ts:32-37), 'evidence log · 19 claims' (RunStage.tsx:48-49), 'Next deals the takes' (RunStage.tsx:224), 'The takes that need your eyes first', 'steel-man', 'pick target', 'the library forbids' (GuidedResearch.tsx:161-162), '😈 hottest take' (passes.tsx:141), 'locked in scope — always travels' (GuidedResearch.tsx:85), footnote 'NOTEBOOK-SCHEMA §steel_man … Engine D cannot be run honestly' (cards.ts:123-124 via GuidedResearch.tsx:86), 'speculation about motive — not reporting' (passes.tsx:148), 'moderate/far/unhinged leap', 'would be the colour', 'pattern · announced-but-unbuilt infrastructure' (passes.tsx:132-133,178), 'OUT of scope' (GuidedResearch.tsx:174), stat row 'in scope / descoped / not taken / liked / deepen / wounded' (ScopeBar.tsx:12-24), 'written against the full notebook' (ScopeBar.tsx:58-62), 'confirm the scope' (ScopeGate.tsx:31), 'Open the expert board' (GuidedResearch.tsx:208). SCRIPT — 'written against · claims · load-bearing · mechanisms · reversals · half-life · tension strength' (ScriptStep.tsx:219-227), tabs 'renders, measured / Coverage / Spend bar — the runtime as a budget / Tracks — running order — the bridge to Frames' (ScriptStep.tsx:73-78), 'full controls' (ScriptStep.tsx:299), engine names 'Reversal Chain / Adjudication / Paradox Teaser' (renders.ts:13,72,119), 'risk — can read as contrarian if the steel-man is cut' (renders.ts:27), 'pleasure: being corrected', 'turns … below the band reads as a lecture', 'essay words', 'promise form', 'questions aloud' (CandidatesDuel.tsx:170-204), 'gate: 40% enforced · 5 checked · 0 failed · 3 not checked / checks: 5✓ 0! 1✕' (CandidatesDuel.tsx:53-76), pad 'NOTES · 0 / Recalibrate / local claude code · <model> · edits, not rewrites' (StickyNotebook.tsx:60-68; RecalibrateControl.tsx:193-200). Note 'liked' and 'deepen' are counters for actions the guided face never offers (CardActions only on CardTile.tsx:277).",
    "evidence": [
      "app/_projects/wizard/CreateWizard.tsx:220-244",
      "app/_projects/wizard/stages.tsx:224,244",
      "app/_phases/research/run/controls.tsx:56-70,150-151",
      "app/_phases/research/run/trace.ts:11-21,32-37",
      "app/_phases/research/guided/GuidedResearch.tsx:85-86,161-162,174,208",
      "app/_phases/research/guided/passes.tsx:132-148,178",
      "app/_phases/_shared/notebook/cards.ts:123-124",
      "app/_phases/research/_parts/ScopeBar.tsx:12-24,58-62",
      "app/_phases/script/ScriptStep.tsx:73-78,219-227,299",
      "app/_phases/script/candidates/CandidatesDuel.tsx:53-76,170-204",
      "app/_phases/script/_notes/RecalibrateControl.tsx:193-200"
    ],
    "code_check": "No gloss/tooltip mechanism exists on DeckStageDef (Deck.tsx:19-34: label/headline/sub only) or on chips (DeckCard.tsx:52: label+tone only); OutcomePicker hints are title= attributes (controls.tsx:62) — hover-only, absent on touch",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Count the terms a first-timer hovers or re-reads; verify the pill hints are unreachable on a touch/narrow viewport. Precondition: fresh profile, educational/short project, guided faces (default)."
  },
  {
    "id": "KW-L1-3",
    "journey": "compose-from-scratch",
    "character": "kwame",
    "cert_level": "L1",
    "type": "honesty",
    "severity": "P1",
    "impact": { "frequency": "every-run", "reachability": "full", "trust_erosion": "high" },
    "dimension": "script",
    "title": "He chose a 120s short; every candidate is 5:00 / 4:10 / 0:45 and nothing states the mismatch",
    "expected": "Criterion 5: the runtime he chose is respected, or the mismatch is stated on the surface where he decides",
    "got": "Studio header chip says '… · SHORT EDUCATIONAL · 120S' (StudioView.tsx:205-206); the three duel cards say '15 beats · 5:00', '… · 4:10', '6 beats · 0:45' (CandidatesDuel.tsx:143-145); the cards' own template fields are mid-educational-video / mid-educational-video / short-form-clip. No text anywhere on Script mentions the project's target, band or template. The only short one (0:45) is a clip 'pointing at the long video' (renders.ts:134), not a two-minute short.",
    "evidence": [
      "app/_phases/script/renders.ts:16-17,75-76,122-123,134",
      "app/_phases/script/candidates/CandidatesDuel.tsx:143-145",
      "app/_phases/script/ScriptStep.tsx:99-111",
      "app/studio/[projectId]/StudioView.tsx:205-206",
      "lib/projects.ts:150-156"
    ],
    "code_check": "node: short-educational-video defaultS=120 band 60–180; RENDERS durationS = [300, 250, 45] → matches target: none; inside band: none; template==short-educational-video: none. `grep -rln targetS app/_phases` → cut/frames/score only; `grep templateOf|project.template app/_phases/script` → none. ScriptStep's getProject reads only `discipline`.",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": true,
    "scope_note": "The durations are fixture content (accepted: one notebook, three renders). What is NOT accepted is the missing sentence — 'these candidates were rendered for a 5-minute mid-length template; your project asks for 120s' — which the surface has every input to print (project.targetS, project.template, r.template, r.durationS).",
    "l2_priority": "Create educational/short-educational (120s), load saved run, confirm, open Script: assert no element on the Candidates tab contains '120', 'short educational' or a mismatch note. Precondition: fresh profile."
  },
  {
    "id": "KW-L1-4",
    "journey": "compose-from-scratch",
    "character": "kwame",
    "cert_level": "L1",
    "type": "guidance",
    "severity": "P2",
    "impact": { "frequency": "every-run", "reachability": "full", "trust_erosion": "medium" },
    "dimension": "research→script",
    "title": "After 'confirm scope' the guided wizard's only primary action is 'Open the expert board' — nothing points him to Script",
    "expected": "Criterion 2: the path to a candidate needs no page he was not led to; the review stage should hand him to step 2",
    "got": "Deck finishLabel='Open the expert board', onFinish=switch to expert face (GuidedResearch.tsx:208-209). ConfirmScope says '23 of 30 cards will go to the Script step' (ScopeGate.tsx:35) but offers no way there; the Stepper is the only route and sits above the deck unmentioned. RunStage does the opposite well ('Next deals the takes →', RunStage.tsx:224).",
    "evidence": [
      "app/_phases/research/guided/GuidedResearch.tsx:202-211",
      "app/_phases/research/_parts/ScopeGate.tsx:31-38,59-67",
      "app/studio/[projectId]/StudioView.tsx:293",
      "components/ui/deck/Deck.tsx:146-152"
    ],
    "code_check": "Deck has exactly one primary control on the last stage (isLast ? onFinish : next), and GuidedResearch wires it to onSwitchFace('expert'); no onNavigate-to-script prop exists on GuidedResearch's signature (:110-124)",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "After confirm, record what a first-timer presses next; assert the expert board mounts (tab-topic/tab-board testids) if they press the primary. Precondition: guided research face, notebook loaded."
  },
  {
    "id": "KW-L1-5",
    "journey": "compose-from-scratch",
    "character": "kwame",
    "cert_level": "L1",
    "type": "honesty",
    "severity": "P2",
    "impact": { "frequency": "every-run", "reachability": "full", "trust_erosion": "high" },
    "dimension": "research",
    "title": "The topic field of a NEW project is pre-filled with 'Why Bitcoin price does not rise', and nothing before the run says the notebook will be Bitcoin whatever he types",
    "expected": "DoD 4: he can tell what the research is ABOUT — his, or a stand-in — before he decides; a first-timer's first field is empty or a placeholder",
    "got": "useEducationalResearch seeds topic with NOTEBOOK.topic when the project has no research record (`saved?.topic ?? NOTEBOOK.topic`), which is every project except ids matching /bitcoin/i — so 'Research this' is already enabled with a foreign topic in the box. LocalProcessNote says 'the trace is replayed at 8× from run 1' but never which run or topic; the OutcomePicker hint 'the run that happened — 6 searches, 19 facts, 3 renders' is a hover title. After the run, the compact card headlines HIS topic over Bitcoin counts (RunStage.tsx:100-104) while the notebook modal is titled 'notebook · why-bitcoin-price-does-not-rise' (ResearchStep.tsx:299).",
    "evidence": [
      "app/_phases/research/guided/useEducationalResearch.ts:42-45",
      "app/_phases/_shared/stepStore.ts:489-498",
      "app/_phases/research/run/controls.tsx:16,56-70,147-153",
      "app/_phases/research/guided/RunStage.tsx:95-104,136-141",
      "app/_phases/research/ResearchStep.tsx:296-303",
      "app/_phases/research/run/trace.ts:24"
    ],
    "code_check": "seededFor returns undefined for non-bitcoin ids → useStepFor callback receives undefined → setTopic(NOTEBOOK.topic). TopicField has a placeholder (controls.tsx:16) that is never shown because value is non-empty.",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": true,
    "scope_note": "The Bitcoin notebook is an accepted gap; the pre-filled VALUE and the his-title-over-Bitcoin-counts card are interface, and the accepted gap's own condition is 'every surface says so'.",
    "l2_priority": "Fresh project → Research: assert the topic input's value (not placeholder) on first paint; type 'Suez crisis', run, reopen the stage, read the compact card headline vs the modal title. Precondition: new educational project."
  },
  {
    "id": "KW-L1-6",
    "journey": "compose-from-scratch",
    "character": "kwame",
    "cert_level": "L1",
    "type": "affordance",
    "severity": "P2",
    "impact": { "frequency": "every-run", "reachability": "full", "trust_erosion": "medium" },
    "dimension": "shared",
    "title": "Three disabled buttons on his path say nothing about what enables them; the worst is a permanent 'Recalibrate' in a fixed pad on every Script tab",
    "expected": "Criterion 3: a disabled control tells him what unlocks it",
    "got": "Deck 'Next' disabled={!stage.done} with no reason text (Deck.tsx:147); 'Research this' disabled={!topic.trim()} with no text (RunStage.tsx:150); pad 'Recalibrate' disabled={!n} with no text, under 'NOTES · 0 / no notes yet', and notes can only be opened from a track id on the expert Coverage/Spend/Tracks tabs (StickyNotebook.tsx:10) — a first-timer on the guided Candidates tab has no way to make it enable. The steel-man card is the positive example: 'locked in scope — always travels' + why.",
    "evidence": [
      "components/ui/deck/Deck.tsx:146-152",
      "app/_phases/research/guided/RunStage.tsx:147-155",
      "app/_phases/script/_notes/RecalibrateControl.tsx:187-193",
      "app/_phases/script/_notes/StickyNotebook.tsx:10,60-68,85-87",
      "app/_phases/research/guided/GuidedResearch.tsx:85-86"
    ],
    "code_check": "RecalibrateControl's disabled branch renders only the label 'Recalibrate' (no title attribute, :187-193); StickyNotebook is mounted for all four tabs including the guided duel (ScriptStep.tsx:278)",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "On guided Candidates, hover/tap the disabled Recalibrate: assert no tooltip/aria-describedby. Precondition: researched project, guided script face."
  },
  {
    "id": "KW-L1-7",
    "journey": "compose-from-scratch",
    "character": "kwame",
    "cert_level": "L1",
    "type": "progress",
    "severity": "P2",
    "impact": { "frequency": "every-run", "reachability": "full", "trust_erosion": "medium" },
    "dimension": "shelf+stepper",
    "title": "Research and Script never report progress — the rail and the shelf say 'not started' after he researched, confirmed and adopted (H4 confirmed)",
    "expected": "DoD 6: tomorrow the project is where he left it — including that Research and Script show as done/in progress",
    "got": "reportPhase has exactly one caller, in Frames (useFrames.ts:724). Stepper badge title reads 'Research — not started' (Stepper.tsx:56, PHASE_STATE_WORD.empty) and the shelf matrix cells stay empty for research/script no matter what he did. parkAt does work, so the studio reopens on the right step — the bookmark is honest, the badges are not.",
    "evidence": [
      "lib/projects.ts:516-545",
      "app/_phases/frames/useFrames.ts:724",
      "app/studio/[projectId]/Stepper.tsx:42,56-66",
      "app/studio/[projectId]/StudioView.tsx:153-176"
    ],
    "code_check": "`grep -rln \"reportPhase(\" app` → app/_phases/frames/useFrames.ts only; useEducationalResearch/useScope/useAdoption write step records but never the project's progress",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "After confirm + adopt, reload /projects: assert research/script cells and step-research/step-script badge titles. Precondition: persistent profile."
  },
  {
    "id": "KW-L1-8",
    "journey": "compose-from-scratch",
    "character": "kwame",
    "cert_level": "L1",
    "type": "strength",
    "severity": "P3",
    "impact": { "frequency": "every-run", "reachability": "full", "trust_erosion": "none" },
    "dimension": "persistence",
    "title": "Every decision on his path is written to the project's own record and survives reload",
    "expected": "DoD 3 and 6: decisions kept; project where he left it",
    "got": "topic + researched saved on change (useEducationalResearch.ts:48-51) and `load()` restores a finished run on remount (:44); scope + checkpoint saved after hydration (useScope.ts:56-59); adoption saved on the click, never before hydration (useAdoption.ts:45-53); face choices saved under research-mode/script-mode; parkAt bookmarks the step (StudioView.tsx:158). Clear is gated by a dialog that says what is lost in his units ('six searches') (ScopeGate.tsx:76-116).",
    "evidence": [
      "app/_phases/research/guided/useEducationalResearch.ts:42-51",
      "app/_phases/research/useScope.ts:49-59",
      "app/_phases/script/candidates/useAdoption.ts:28-53",
      "app/_phases/research/_parts/ScopeGate.tsx:76-116",
      "app/studio/[projectId]/StudioView.tsx:153-176"
    ],
    "code_check": "useStepFor gates every save on hydration (the 'never save before hydration' rule is applied in all three hooks)",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Reload mid-journey after each decision (run, take, confirm, adopt) and assert the state re-renders. Precondition: persistent profile."
  },
  {
    "id": "KW-L1-9",
    "journey": "compose-from-scratch",
    "character": "kwame",
    "cert_level": "L1",
    "type": "affordance",
    "severity": "P3",
    "impact": { "frequency": "every-run", "reachability": "full", "trust_erosion": "low" },
    "dimension": "research",
    "title": "The first control a first-timer meets on Research is the prototype 'drive the ending' rack, above the topic field",
    "expected": "The product control (topic → Research this) comes first; evaluation scaffolding is secondary and labelled in his words",
    "got": "RunStage renders OutcomePicker before TopicField (RunStage.tsx:128-141): 'PROTOTYPE · DRIVE THE ENDING  returns a notebook · finds no tension · the local process dies | load saved run'. The label 'prototype' is honest (accepted gap condition met); the placement and the hover-only hints are not first-timer shaped.",
    "evidence": [
      "app/_phases/research/guided/RunStage.tsx:125-158",
      "app/_phases/research/run/controls.tsx:40-101"
    ],
    "code_check": "Hints are `title` attributes only (controls.tsx:62,87) — invisible on touch",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": true,
    "l2_priority": "Observe whether a first-timer presses a pill before typing; measure on a touch viewport. Precondition: fresh educational project."
  },
  {
    "id": "KW-L1-10",
    "journey": "compose-from-scratch",
    "character": "kwame",
    "cert_level": "L1",
    "type": "guidance",
    "severity": "P3",
    "impact": { "frequency": "every-run", "reachability": "full", "trust_erosion": "low" },
    "dimension": "research",
    "title": "The guided face deals only the unsourced tier (conclusions + steel-man); the sourced facts his senior bar needs live one modal or one face away",
    "expected": "A history teacher can find 'one sourced reframing fact' on the cards he is asked to decide on",
    "got": "hotTakes/steelManOf/conclusionChoices select only conclusions and the steel-man (passes.tsx:33-48); specOf's detail carries description, leap, use-for and precedent but no source line (passes.tsx:150-182). Facts with sources render only on the expert CardTile (CardTile.tsx:155-175) or in the evidence-log modal ('evidence log · 19 claims', RunStage.tsx:48-53). Reachable in one click, but the gloss is 'claims', not 'sources'.",
    "evidence": [
      "app/_phases/research/guided/passes.tsx:33-48,150-182",
      "app/_phases/research/_parts/CardTile.tsx:110-122,155-175",
      "app/_phases/research/guided/RunStage.tsx:45-53"
    ],
    "code_check": "specOf(card) never reads card.source / card.sources",
    "verdict": "uncertain",
    "resolution": "open",
    "l2_priority": "Does a first-timer open the evidence log unprompted before adopting? Precondition: guided faces, notebook loaded."
  }
]
```

## Verdict

**L1-conditional.** The mechanics hold — he can create, run, decide, confirm, adopt, leave and come back, and never loses a pick. What fails is exactly the thing this Character exists to test: the guided path is guided in *structure* and expert in *language*, and the one number he cared about (two minutes) is contradicted on the Script surface without a word.

grounding: research-run 0/5 · script-candidates 2/4 (env says 3/4 — the template band is the render fixture's own field, never the project's; `renders.ts:16,75,122`, no template reader under `app/_phases/script/`)

time-saved-if-it-all-worked: ~110 min (2.5 h manual → ~25 min tool time, +15 min vocabulary tax on a first run) · confidence low — the material is a stand-in, so the 25 min is the interface's cost, not the job's

## First-person review (L1, designed experience)

I got further than I expected. The first four screens asked me things I actually know — what kind of video, how long, what it should look like, what it's called — and I could change my mind on any of them without losing the rest. That's rare. The style cards with real pictures were the best moment.

Then I opened Research and the box already had someone else's topic in it. Bitcoin. I deleted it, typed Suez, pressed the button, and watched a list about Bitcoin fill up under the words "factual spine" and "find the steel-man". Nobody told me it was going to do that. The small grey line said something about a trace replayed at eight times from run one, which I read three times and still don't know what it means. When it finished, the card said "Suez crisis" on top of Bitcoin numbers — that's worse than either on its own.

The cards after that were pickable, and I liked that the locked one said it was locked. But its reason was a paragraph about a schema section and "Engine D". I asked what the button does; it answered in a language I don't have. Then a scoreboard: descoped, deepen, wounded. And the big button at the end said "Open the expert board" — I'm not an expert, that's the whole point of me. I found "2 Script" by looking around, not because anything sent me there.

Script: three cards, and the one thing I set — 120 seconds, it's in the header — appears nowhere. Five minutes, four minutes, forty-five seconds. I picked the forty-five because it was the only short one, and only later read that it's a teaser pointing at a long video. If the tool had said "these were written for a five-minute version, yours will be shorter", I'd have trusted it. It said nothing, so I don't know what else it isn't saying.

Would I adopt it? Not yet. Would I tell a peer? I'd tell them the first four screens are lovely and to bring a glossary for the rest. What's missing for my job: my topic, my two minutes, and plain words on the cards I'm meant to judge.

## First-person review (L2, live experience)

L2 verdict: **L2-conditional** — the buttons now say what they need and the cards say what they are not, but the path still teaches me thirty words I do not have.

I got to the end. The greyed Next told me what unlocks it. The topic box was empty — mine to fill — and a note above it said the notebook would be a saved Bitcoin run before I pressed anything, so when the list about Bitcoin filled up I already knew. After the review stage the big button sent me to Script instead of "the expert board"; I did not have to go looking.

On Script an amber line read `this project asked for Short educational · 120s — the three renders below were cut for the fixture's own runtimes (0:45–5:00) and your clock is not read here yet` (shot 05). That is the sentence I said would make me trust it. I picked the 45-second card; the shelf later showed my project as locked and in progress. The grey Recalibrate now says "Nothing to recalibrate yet — open a track's note handle…" — I still do not know what a track handle is, but it told me.

Still missing: "steel-man", "descoped", "Engine D", "load-bearing", "half-life" — all still on the cards I judge, and the research is still not about Suez. Would I tell a peer? "It stopped hiding things from you. Bring a glossary anyway."
