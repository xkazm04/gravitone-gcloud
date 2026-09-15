# Dani (science explainer) — compose-from-scratch · S1 · L1

Character: `uat/characters/dani-science-explainer.md` (DA). Scenario S1: educational, mid-length,
guided research → candidates. L1 = theoretical walk over the code-derived surface model. No browser.
Product is mocked; content complaints are `mock_bound`. Recalibration not exercised (optional).

## Surface model

### Reachable set (educational · mid-educational-video)

| Stage | Surface | Entry / branch | Evidence |
|---|---|---|---|
| Create | Deck wizard, 4 stages: discipline → template → style → name | `app/projects/new/page.tsx:9-15` → `CreateWizard.tsx:196-265` | 3 disciplines `lib/projects.ts:123-137`; educational templates `lib/projects.ts:142-163` (short-form-clip 15–60s · short-educational 60–180s · mid-educational 180–360s, default 300) |
| Style | 6 presets, all `discipline: "educational"` → all fit | `CreateWizard.tsx:110-113`, `lib/themes.ts:133-135`, `app/library/presets.ts:44-149` | `EmptyStyleDeck` (`CreateWizard.tsx:231`) is NOT reachable for Dani. H1 verified as code-true for trailer/free (`styleFits` needs `theme.discipline === discipline`; every preset is educational) — outside this Character's path, not raised here. |
| Name | title (required) · logline (optional) · runtime 5–900s | `stages.tsx:181-253` | Runtime hint at `stages.tsx:239`: "measured at 180–360s. Past that band the craft rules stop applying." |
| Finish | mint preset → locked theme, `create()`, `router.push(/studio/<id>)` | `CreateWizard.tsx:145-194` | Project record `phase: "research"`, `progress` all `empty` (`lib/projects.ts:339-355`) |
| Studio | Headline = project title; discipline · template · targetS pill; "prototype · mocked data" pill; Stepper | `StudioView.tsx:184-191, 204-211, 293` · `Stepper.tsx:56` | Rail badge tint = `progress[key]`; title attr `"<Step> — <state word>"` |
| Research | discipline `educational` → `EducationalResearch` → default face **guided** while no decisions | `ResearchStep.tsx:96, 170-181` | `useEducationalResearch` (`guided/useEducationalResearch.ts:29-105`) + `useScope` (`useScope.ts:38-97`) owned above the face |
| Research · guided | 4 deck stages: run · the takes · conclusions · review; finish = "Open the expert board" | `GuidedResearch.tsx:141-211` | Stage 2 deals `hotTakes` (1 card) + steel-man (no pick target); stage 3 deals `conclusionChoices` (6). `passes.tsx:33-48` |
| Research · run | `RunStage`: OutcomePicker · TopicField · "Research this" · `LocalProcessNote` · RunTrace | `RunStage.tsx:125-237`, `run/controls.tsx`, `run/useResearchRun.ts` | Trace is `TRACE` (`run/trace.ts:23-39`), 15 Bitcoin-specific steps replayed at 8× |
| Research · expert | Topic tab (`TopicPanel`) · Triage board (`ResearchTriageBoard` + `CardTile`) · FollowUpQueue · ConfirmScope | `ResearchStep.tsx:239-291` | 36 cards = 21 facts · 3 mechanisms · 4 reversals · 7 conclusions · 1 steel-man (`buildCards`, executed below) |
| Notebook modal | title hard-coded `notebook · why-bitcoin-price-does-not-rise` | `ResearchStep.tsx:296-303` | H2 confirmed |
| Script | `researched` from `research` step record → `ExplainerScript`; face default guided (duel) while no adoption/version work | `ScriptStep.tsx:97-127, 153-160, 197-205` | Chains = `RENDERS` fixture (`renders.ts`) unless a model-path version exists |
| Script · Candidates (guided) | 3 deck cards: engine · title · opens/turns/lands arc · beats/duration · risk · read more → depth + "read the beats" · whole-card adopt | `CandidatesDuel.tsx:83-247, 251-316` | Adopt writes `script-adopted` (`useAdoption.ts:45-53`); on-card text "adopted — the Frames step opens on this chain" (`:151-155`) |
| Script · Candidates (expert) | `HypothesisColumn` ×3: fit, measured meters, craft checks, ConstraintLedger, GatePanel, deviations, cut facts, "adopt this one" | `HypothesisColumn.tsx:44-177` | |
| Script · Coverage | every card × render seconds; descoped rows tinted; ScopePip toggles scope from here | `_matrix/MatrixCoverage.tsx:134-142`, `_matrix/shared.tsx:47-71`, `impact.ts:284-313` | |
| Persistence | IndexedDB per `project:phase` — `research`, `research-scope`, `research-mode`, `script-adopted`, `script-mode` | `_shared/stepStore.ts:37-98`, `useLoadFor.ts` | `parkAt` on rail click (`StudioView.tsx:154-177`) |

Not walked (other Characters' branches): trailer/free ModeChooser, BeatVariantBoard, TrailerScript (H3, H5, H6).

### Grounding audit (shared denominator, `uat/env.md`)

**research-run — 0/5.** (1) typed topic: stored (`useEducationalResearch.ts:50`) and drawn as the compact card's headline (`RunStage.tsx:100`) but nothing feeds it to the trace or notebook — `TRACE`/`NOTEBOOK` are constants. (2) logline: no file under `app/_phases/research/` or `app/_phases/script/` reads `project.logline` (grep `logline` → only `beats/beats.ts:41` and `BeatVariantBoard.tsx:45`, both trailer-side, both saying it is NOT read). (3) discipline/template: only the branch in `ResearchStep.tsx:96`; the notebook's `templateIntent` is a constant (`notebook.ts:21`). (4) target runtime: no `targetS` read outside frames/score/cut (grep). (5) prior notebooks: none exist as a concept.

**script-candidates — 3/4** (per env). (1) scope decisions: live via `useScope` into Coverage/Spend (`ScriptStep.tsx:148, 334-339`); the candidate chains themselves do not change with cuts. (2) runtime: `r.durationS` from the fixture (300 · 250 · 45), never `project.targetS`. (3) template band: `r.template` vs `NOTEBOOK.templateIntent` (`HypothesisColumn.tsx:108-111`). (4) notebook: `ATTRIBUTION` + `NOTEBOOK.engineFit` (`impact.ts:284`, `HypothesisColumn.tsx:37`).

beat-board: not met.

### Wiring notes (one grep per suspect value)

- `logline` — written by the wizard, promised at `stages.tsx:219` ("It is what the script step argues back against"), read by nothing in research/ or script/.
- `targetS` — read by `frames/useFrames.ts:244,248,578`, `cut/CutTimeline.tsx:44`, `score/ScoreSpotting.tsx:201`; never by research/ or script/.
- `reportPhase` — one caller: `frames/useFrames.ts:724`. Research and Script never report (H4 confirmed).
- `NOTEBOOK.topic` — seeds the topic field on a fresh project (`useEducationalResearch.ts:43`), then the persist effect (`:48-51`) writes that seeded topic to disk before the Character types anything.
- Sources — `FactSource` (`notebook/types.ts:62-69`) has `name · evidenceClass · locator?: string · interested?`; no URL field. No `href` in `notebook/*.tsx` (grep). `CardTile.tsx:164, 172` and `FactRow.tsx:80` print strings.

### Executed checks

`buildCards()` + `woundsOf()` run with `npx tsx` from the repo root (script in scratchpad):

```
cards: 36 { fact: 21, mechanism: 3, reversal: 4, conclusion: 7, 'steel-man': 1 }
hottest: [ 'c-reserve-was-the-product' ]  optIn: 7
mechanism dependsOn: m-etf-plumbing [] · m-treasury-flywheel [] · m-institutionalisation []
cut m-institutionalisation            → r4:weakened[m-institutionalisation]            kept 28/36
cut f-mnav                            → r2:weakened[f-mnav]                             kept 28/36
cut f-mnav,f-mstr-drop,f-mstr-sold    → r2:weakened[f-mnav,f-mstr-drop,f-mstr-sold]     kept 26/36   ← every fact r2 cites, and it is only "weakened"
cut all three mechanisms              → r1,r2,r4 weakened                               kept 26/36
facts with sources[]: [ 'f-midtier-distribute' ]  (1 of 21 carries a structured source)
```

Duel "turns" bullet = `chain[Math.floor(chain.length / 2)]` (`CandidatesDuel.tsx:117`): reversal-chain (16 beats) → index 8 = `1:45 · escalation`; adjudication (8 beats) → index 4 = `2:00 · C3 · the treasury flywheel reversed` (kind `candidate`); derived-short (6) → index 3 = `0:24 · the reversal`.

## Walkthrough

**1 · /projects/new — discipline.** "What kind of video is this?" · Educational video / Movie · game trailer / Any video, each with one line (`DISCIPLINE_NOTE`, all three enumerated: "an argument explained well — the craft library measured these" · "a promotional cut that opens a debt another artifact pays" · "no craft template — your own discipline; the studio only keeps time"). Does Dani know what to do? Yes — "Educational video" is his word. Does he know it worked? Rail shows `✓ discipline · Educational video`.

**2 · template.** Three cards with measured bands and targets. He reads "Mid-length educational · 3–6 min — the shortest length that holds a full argument". His videos are 8–15 min. Nothing here is his length; the closest is mid-length. He picks it (target 300s). Question raised, unanswered on this stage: "what happens to my 10 minutes?"

**3 · style.** Six presets (Signal Ledger, Newsprint Cutout, Blueprint, Chalk Argument, Paper Relief, Data Neon) with a real render each and "locks as this project's style when you create". Blueprint or Chalk Argument fits a mechanism explainer. He does not need `/library`. Fine.

**4 · name.** Title, logline ("Optional — one sentence. It is what the script step argues back against."), runtime prefilled 300 with the hint that 180–360s is the measured band and "past that band the craft rules stop applying". He types 600. He has now been told the craft rules do not apply to his video, at the last stage, after choosing the template that seemed closest. Create & open → `/studio/<id>`, headline = his title, pill `EDUCATIONAL VIDEO · MID-LENGTH EDUCATIONAL · 600S`, plus `PROTOTYPE · MOCKED DATA`. Elapsed: ~90 s. Criterion 1 holds.

**5 · Research · guided · stage 1 (run).** Headline "What should the research investigate?" Topic field arrives **already filled with "Why Bitcoin price does not rise"** (`useEducationalResearch.ts:43`) — the first thing he sees on his own project is somebody else's topic. He deletes it, types "why does a bridge sing in the wind". Above it: `prototype · drive the ending` pills and `load saved run`; below: "research runs as a local Claude Code process — minutes, not milliseconds… Prototype: the trace is replayed at 8× from run 1 and nothing is executed." Does he understand that his topic will not be researched? "replayed from run 1" is an engineering sentence; "nothing is executed" is the honest half but does not say *what he will get instead*. The idle notice ("Run the research, or load the saved Bitcoin run…") is the only place the word Bitcoin appears before he clicks.

He clicks Research this. The run log arrives: `1 · factual spine · web · the number · bitcoin all-time high 2025 price history…` — every one of 15 rows is about Bitcoin, in front of him, for ~5 s. So he *does* find out during the run — from the content, not from the interface. Status lands `complete · 41s`, the bell says "A notebook is ready for review.", pills `notebook · the argument` and `evidence log · 21 claims`, and `Next deals the takes →`. If he leaves this stage and returns, the compact card (`RunStage.tsx:85-122`) reads **"a notebook exists" · "why does a bridge sing in the wind" · 21 facts · 3 mechanisms · 4 reversals · researched 2026-08-11** — his topic as the headline over a notebook that is not about it. That card is the one lie on the step; the modal title one click away says `why-bitcoin-price-does-not-rise`.

**6 · stage 2 (the takes).** Two cards: `😈 hottest take` (c-reserve-was-the-product, "not taken", risk line "speculation about motive") and the steel-man ("locked in scope — always travels"). Where are the mechanisms? Not on this stage, nor the next. Stage 3 deals the six other conclusions. The header promised "the stages after this one deal the notebook's decisions as cards" (`GuidedResearch.tsx:146`) — 8 of 36 cards are dealt; the 21 facts, 3 mechanisms and 4 reversals — the material Dani's job is about — are choices only on the expert board. He would be on the board within two minutes, via "Open the expert board", which is fine, but the guided wizard has nothing for his job.

**7 · stage 4 (review) / expert board.** ScopeBar `in scope 28/36 · descoped 0 · not taken 7 · wounded 0`; Consequences "Nothing descoped. The script will be written against the full notebook, minus the 7 conclusions you have not taken." On the board he cuts f-mnav, f-mstr-drop, f-mstr-sold to see what it costs: r2 is marked "weakened — f-mnav, f-mstr-drop, f-mstr-sold descoped" and the Consequences panel says "1 weakened… These still stand, on less." Every fact r2 cites is gone; a senior would say that reversal is now an assertion. The "cannot be argued" state exists (`ScopeBar.tsx:47-54, 73-92`) but is unreachable while the mechanism id is counted as a surviving dependency (`scope.ts:67`). Cutting a mechanism does wound its reversal — so the graph is legible in one direction. He opens the evidence log: 21 rows, sources like "coindesk 2026-03-04, analyst explanation", "CryptoQuant via search". Nothing to click. Confirm scope → "28 of 36 cards will go to the Script step" (with cuts: 25).

**8 · Script · Candidates (duel).** "written against 21 claims · 20 load-bearing · 3 mechanisms · 4 reversals · half-life weeks". Three cards: Reversal Chain — opens "SCQA · situation" / **turns "escalation"** / lands "reframe, not summary" · 16 beats · 5:00 · risk. Adjudication — turns "C3 · the treasury flywheel reversed" (that is a candidate, not a turn). Paradox Teaser — a 45 s short (`template short-form-clip`), for a project whose runtime is 600 s; the expert column says "outside the notebook's intent, by design", the duel card does not. "read more" → gate counts (no score), band meters, then "read the beats" → the modal with the full chain, turns in violet, connectors chipped. Here the turn IS named: `TURN 4 · the thesis`. So criterion 4 holds one gesture deep and fails on the card front.

**9 · Adopt.** Whole-card pick, ring + tint + "adopted — the Frames step opens on this chain", `aria-pressed`. Saved (`script-adopted`). Rail: Research and Script badges still `empty`; hover title "Script — not started".

**10 · Reload.** `phase` parked on script → opens on Script. `useScriptFace` latches `expert` because an adoption exists (`useScriptFace.ts:54`) — he sees three dense columns instead of the duel, with "adopted — undo" on his pick. Research also opens on the expert board (`ResearchStep.tsx:170-181`, `decided` true). Decisions intact: scope, confirmed checkpoint, topic, adoption. Criterion 5 holds; the layout he made the decision in is gone.

## Scored criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Create educational mid-length in <2 min, own vocabulary | **pass** (with a caveat) | 4 stages, one click each + a title; `stages.tsx:55-95`. Caveat: no template covers 8–15 min (`lib/projects.ts:142-163`); the "craft rules stop applying" hint lands on stage 4 (`stages.tsx:239`) |
| 2 | Told BEFORE deciding whether the notebook is his topic | **fail** | Disclosure exists but in engineering words (`controls.tsx:150-152`, `RunStage.tsx:234`); the compact card headlines HIS topic over the Bitcoin counts (`RunStage.tsx:100-103`); trace content is what actually tells him (`trace.ts:24-38`) |
| 3 | Mechanism-level material as keep/cut choices, consequence shown | **partial** | Expert board: yes (`CardTile.tsx:252-266`, `Consequences`). Guided: only conclusions + steel-man (`passes.tsx:33-48`). Consequence understated: all-facts-cut → "weakened" (`scope.ts:66-68`, executed) |
| 4 | Candidate names its turn; beats readable before adopting | **partial** | Beats: yes via read more → read the beats (`CandidatesDuel.tsx:234-243`, `BeatList.tsx`). Turn on the card front: positional middle beat, wrong for 2 of 3 renders (`CandidatesDuel.tsx:117`) |
| 5 | Adopted candidate survives reload | **pass** | `useAdoption.ts:28-53`, `adoption.ts:39-42`; face flips to expert on return (`useScriptFace.ts:46-56`) but the pick is drawn (`HypothesisColumn.tsx:48, 173`) |

## Findings

```json
[
  {
    "id": "DA-L1-1",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "trust",
    "severity": "high",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 5 },
    "dimension": "research · stand-in disclosure",
    "title": "The research step labels the replayed Bitcoin notebook with the Character's own topic; the only pre-run disclosure is engineering jargon",
    "expected": "Before he clicks Research this, one plain sentence: whatever topic you type, this prototype returns the 2026-08-11 Bitcoin notebook. After it lands, the notebook card carries the notebook's topic, not the typed one.",
    "got": "Pre-run: 'the trace is replayed at 8x from run 1 and nothing is executed' (controls.tsx:150-152) and an idle notice mentioning 'the saved Bitcoin run'. Post-run, on re-entry to stage 1, the compact card reads 'a notebook exists' with the TYPED topic as its headline (RunStage.tsx:100) over the Bitcoin counts. The typed topic feeds nothing (grep: TRACE and NOTEBOOK are constants). The trace rows are the only honest tell, and they are content, not interface.",
    "evidence": ["app/_phases/research/guided/RunStage.tsx:85-122", "app/_phases/research/guided/RunStage.tsx:100", "app/_phases/research/run/controls.tsx:147-155", "app/_phases/research/guided/RunStage.tsx:232-236", "app/_phases/research/run/trace.ts:23-39", "app/_phases/research/ResearchStep.tsx:296-303", "app/_phases/research/guided/useEducationalResearch.ts:42-51"],
    "code_check": "TopicField value is stored to the research step record and rendered at RunStage.tsx:100; no consumer in run/ or _shared/notebook/ reads it. Notebook modal title is a string literal at ResearchStep.tsx:299.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Create an educational project, type a non-Bitcoin topic, run, leave stage 1 and return: assert the compact card headline equals the typed topic while open-notebook modal title contains 'why-bitcoin'. Precondition: fresh profile, port 3183, dev-auth banner present.",
    "mock_bound": false,
    "scope_note": "The CONTENT being Bitcoin is an accepted gap; this finding is the labelling and the timing of the disclosure."
  },
  {
    "id": "DA-L1-2",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "trust",
    "severity": "low",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 3 },
    "dimension": "research · topic field default",
    "title": "A fresh project's topic field arrives pre-filled with 'Why Bitcoin price does not rise' and that seeded topic is written to disk before he types",
    "expected": "An empty field with a placeholder; the step record is written when he types.",
    "got": "useEducationalResearch hydrates topic as saved?.topic ?? NOTEBOOK.topic; the persist effect fires on hydration and saves {topic: <Bitcoin>, researched: false} for a project the Character has not touched.",
    "evidence": ["app/_phases/research/guided/useEducationalResearch.ts:42-45", "app/_phases/research/guided/useEducationalResearch.ts:48-51", "app/_phases/research/run/controls.tsx:16"],
    "code_check": "TopicField already carries the Bitcoin string as its placeholder (controls.tsx:16), so the value seed is redundant with the placeholder.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Open Research on a just-created educational project: assert the Topic input value is non-empty and equals the Bitcoin topic. Precondition: fresh project via wizard.",
    "mock_bound": false
  },
  {
    "id": "DA-L1-3",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "gap",
    "severity": "medium",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 3 },
    "dimension": "research · guided face coverage",
    "title": "The guided research wizard deals only the hottest take, the steel-man and six conclusions; facts, mechanisms and reversals (28 of 36 cards) are never choices there",
    "expected": "The header says 'the stages after this one deal the notebook's decisions as cards'. For a mechanism-first explainer the mechanisms and the reversals they carry are the decisions.",
    "got": "hotTakes() = cards with hottest (1), steelManOf() (1, unpickable), conclusionChoices() = optIn && !hottest (6). No stage deals kind fact/mechanism/reversal. The wizard's finish is 'Open the expert board', where they live.",
    "evidence": ["app/_phases/research/guided/GuidedResearch.tsx:141-200", "app/_phases/research/guided/GuidedResearch.tsx:146", "app/_phases/research/guided/passes.tsx:33-48", "app/_phases/_shared/notebook/cards.ts:65-127"],
    "code_check": "buildCards() executed: 36 cards, 21 fact · 3 mechanism · 4 reversal · 7 conclusion · 1 steel-man; hottest = c-reserve-was-the-product only.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Walk guided stages 2-3 and count dealt cards (expect 2 and 6); confirm no mechanism card appears before 'Open the expert board'. Precondition: educational project with a landed run.",
    "mock_bound": false
  },
  {
    "id": "DA-L1-4",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "logic",
    "severity": "medium",
    "impact": { "frequency": 3, "reachability": 4, "trust_erosion": 4 },
    "dimension": "research · consequence arithmetic",
    "title": "A reversal whose every cited fact is cut reads 'weakened', never 'cannot be argued', because the mechanism id counts as surviving evidence",
    "expected": "scope.ts:66 — 'A reversal with NO surviving evidence cannot be argued at all.' Cutting f-mnav, f-mstr-drop and f-mstr-sold (all of r2's evidence) should mark r2 broken and the Consequences panel should say '1 turn cannot be argued'.",
    "got": "woundsOf computes survivors = dependsOn.length - missing.length, and buildCards appends the mechanismId to a reversal's dependsOn (cards.ts:104). With the mechanism kept, survivors = 1 and severity = 'weakened'. Executed: cut f-mnav,f-mstr-drop,f-mstr-sold -> r2:weakened. 'broken' is reachable only by cutting the mechanism as well.",
    "evidence": ["app/_phases/research/scope.ts:59-70", "app/_phases/_shared/notebook/cards.ts:100-106", "app/_phases/research/_parts/ScopeBar.tsx:73-92", "app/_phases/research/_parts/CardTile.tsx:182-191"],
    "code_check": "npx tsx over buildCards/woundsOf/scopeSummary from the repo root; output quoted in the Surface model.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "On the expert board descope f-mnav, f-mstr-drop, f-mstr-sold; assert card-r2 shows 'weakened' and the Consequences title is '1 weakened' rather than '1 turn cannot be argued'. Precondition: landed run.",
    "mock_bound": false
  },
  {
    "id": "DA-L1-5",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "fixture",
    "severity": "low",
    "impact": { "frequency": 3, "reachability": 4, "trust_erosion": 2 },
    "dimension": "research · mechanism evidence edges",
    "title": "Cutting the facts under a mechanism wounds nothing: no mechanism in the fixture cites evidence",
    "expected": "A mechanism whose supporting facts are cut is shown weakened, as reversals are.",
    "got": "buildCards reads m.evidence / steps[].evidence (the edge exists in code) but all three mechanisms carry dependsOn [] on this fixture; cards.ts:90-93 says so.",
    "evidence": ["app/_phases/_shared/notebook/cards.ts:76-99", "app/_phases/_shared/notebook/notebook.ts:36-80"],
    "code_check": "Executed: mechanism dependsOn = [] for m-etf-plumbing, m-treasury-flywheel, m-institutionalisation.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "None at L2 — data property. Fixture may grow richer: author evidence ids on the three mechanisms.",
    "mock_bound": true
  },
  {
    "id": "DA-L1-6",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "legibility",
    "severity": "medium",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 3 },
    "dimension": "script · candidate card front",
    "title": "The duel card's 'turns' bullet is the positional middle beat, not the render's turn — Reversal Chain shows 'escalation', Adjudication shows a candidate",
    "expected": "A candidate names its turn on the front (Dani criterion 4): the beat of kind 'turn' that carries the thesis, or the render's declared turn count with its first turn.",
    "got": "arc = [chain[0], chain[floor(len/2)], chain[len-1]] labelled opens/turns/lands. Reversal Chain (16 beats) -> index 8 '1:45 escalation'; Adjudication (8) -> index 4 'C3 · the treasury flywheel reversed' (kind candidate; the engine has turns: null); derived-short (6) -> index 3 'the reversal' (correct by luck).",
    "evidence": ["app/_phases/script/candidates/CandidatesDuel.tsx:109-120", "app/_phases/script/renders.ts:29-46", "app/_phases/script/renders.ts:88-97", "app/_phases/script/_parts/BeatList.tsx:102-116"],
    "code_check": "Indexed the fixture chains by hand against the formula; the beats modal (BeatList) does colour kind 'turn' violet, so the truth is one gesture deep.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Read the three duel cards' 'turns' bullet text; assert Reversal Chain reads 'escalation' and Adjudication reads 'C3 …'. Precondition: researched project, Script guided face.",
    "mock_bound": false
  },
  {
    "id": "DA-L1-7",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "expressiveness",
    "severity": "medium",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 4 },
    "dimension": "research · evidence log sources",
    "title": "No source is openable: the source type has no URL field and no notebook surface renders a link",
    "expected": "A claim's source is something he can open (pet peeve: 'Facts with no source he can open'). Even with mocked data the interface should have the affordance and draw 'no link' honestly.",
    "got": "FactSource = {name, evidenceClass, locator?: string, interested?}. CardTile prints locator or 'no locator'; FactRow prints the same; the legacy source line is 'coindesk 2026-03-04, analyst explanation · as of …'. grep href in _shared/notebook/*.tsx -> none. NOTEBOOK.sources is a prose bibliography with no anchors. Only 1 of 21 facts carries sources[] at all.",
    "evidence": ["app/_phases/_shared/notebook/types.ts:62-69", "app/_phases/_shared/notebook/FactRow.tsx:80", "app/_phases/research/_parts/CardTile.tsx:155-175", "app/_phases/_shared/notebook/notebook.ts:152-164", "app/_phases/_shared/notebook/facts.ts:88-110"],
    "code_check": "Type-level: no url/href on FactSource or Fact; render-level: no anchor elements in the notebook UI.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Open the evidence log and assert zero anchor elements inside it. Precondition: landed run.",
    "mock_bound": false,
    "scope_note": "The fixture's sources being short attributions is mock content; the absence of a field and an affordance is the interface finding."
  },
  {
    "id": "DA-L1-8",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "trust",
    "severity": "medium",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 3 },
    "dimension": "studio rail · shelf progress",
    "title": "Research and Script never report progress: after a notebook, a confirmed scope and an adopted script the rail badge and the shelf cell still say 'not started'",
    "expected": "Definition of done 6 and the rail's own promise (Stepper.tsx:11-13): the number is tinted by the project's own progress.",
    "got": "reportPhase has exactly one caller, frames/useFrames.ts:724. progress.research and progress.script stay 'empty' for the life of every project; Stepper title attr renders 'Research — not started', ProjectsMatrix cell renders the empty tone.",
    "evidence": ["lib/projects.ts:534-543", "app/_phases/frames/useFrames.ts:724", "app/studio/[projectId]/Stepper.tsx:40-77", "app/_projects/ProjectsMatrix.tsx:153-155"],
    "code_check": "grep reportPhase across app/ and lib/: definition + one call site in frames + comments.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "After adopting a candidate, hover step-research and step-script and read the title attribute; then return to /projects and read the row's research/script cell aria-label. Expect 'not started' on both. Precondition: project with landed run + adoption.",
    "mock_bound": false
  },
  {
    "id": "DA-L1-9",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "wiring",
    "severity": "low",
    "impact": { "frequency": 4, "reachability": 5, "trust_erosion": 2 },
    "dimension": "create · logline promise",
    "title": "The wizard says the logline 'is what the script step argues back against'; nothing in research/ or script/ reads it",
    "expected": "Either the Script step reads project.logline, or the hint says it is stored for later.",
    "got": "grep logline under app/_phases: only beats/beats.ts:41 and beats/BeatVariantBoard.tsx:45, both stating the logline is NOT read. Explainer Script reads RENDERS, NOTEBOOK and the scope only.",
    "evidence": ["app/_projects/wizard/stages.tsx:216-229", "app/_phases/script/ScriptStep.tsx:131-214"],
    "code_check": "grep -rn logline app/_phases -> two trailer-side comments, zero reads.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "None live; copy/wiring. Could assert the logline appears nowhere on the Script step after creation with a distinctive logline.",
    "mock_bound": false
  },
  {
    "id": "DA-L1-10",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "gap",
    "severity": "medium",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 3 },
    "dimension": "create · template catalogue",
    "title": "No educational template covers an 8–15 minute explainer; the runtime input accepts 600s but tells him the craft rules stop applying",
    "expected": "Either a long-form educational band, or the template stage saying up front that anything past 6 minutes has no measured band, before he commits to 'Mid-length'.",
    "got": "Educational templates: short-form-clip 15–60s, short-educational 60–180s, mid-educational 180–360s. NumberInput max=900. The 'past that band the craft rules stop applying' hint is on stage 4, after the template pick. Candidate renders are 300/250/45s regardless of targetS.",
    "evidence": ["lib/projects.ts:142-163", "app/_projects/wizard/stages.tsx:231-250", "app/_phases/script/renders.ts:17,76,123"],
    "code_check": "TEMPLATE_FAMILY educational entries enumerated; no read of project.targetS in script/.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Type 600 on the name stage and read the hint; open the studio pill (expect '600S') and the Candidates cards (expect 5:00 / 4:10 / 0:45). Precondition: wizard.",
    "mock_bound": false,
    "scope_note": "Catalogue decision (knowledge/templates); raised as a segment-fit gap, not a defect."
  },
  {
    "id": "DA-L1-11",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "ux",
    "severity": "low",
    "impact": { "frequency": 4, "reachability": 5, "trust_erosion": 2 },
    "dimension": "return visit · face default",
    "title": "On reload both steps open on the expert face if he never touched a face switch — the wizard he made his decisions in is gone",
    "expected": "Return to the layout the decisions were made in, or a one-line note that the guided face is available.",
    "got": "Research: defaultFace = decided ? 'expert' : 'guided', computed and never stored (ResearchStep.tsx:170-181). Script: useScriptFace latches 'expert' when hasAdoption (useScriptFace.ts:52-55). Decisions are intact on both faces; only the lens changes. Documented intent, but unannounced to the user.",
    "evidence": ["app/_phases/research/ResearchStep.tsx:164-184", "app/_phases/script/candidates/useScriptFace.ts:39-68"],
    "code_check": "Both defaults read decision records, not a stored face; a stored face (research-mode / script-mode) wins when present.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Adopt in the duel without touching the face switch, reload: assert candidates-duel is absent and render-<id> columns are present with 'adopted — undo'. Precondition: adoption saved.",
    "mock_bound": false
  },
  {
    "id": "DA-L1-12",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "fixture",
    "severity": "low",
    "impact": { "frequency": 4, "reachability": 5, "trust_erosion": 3 },
    "dimension": "script · scope → candidates",
    "title": "Cutting cards on the board does not change the candidate chains; the consequence shows only as tinted rows on the Coverage tab",
    "expected": "A candidate whose beats rest on a descoped card says so on the card (the duel front or its depth).",
    "got": "chains come from RENDERS unless a model-path version exists; gateChains reads beats + conclusions, not scope. Coverage tints descoped rows (MatrixCoverage.tsx:134-142); the duel card carries no scope signal.",
    "evidence": ["app/_phases/script/ScriptStep.tsx:65-66,178-193", "app/_phases/script/_matrix/MatrixCoverage.tsx:134-142", "app/_phases/script/impact.ts:284-313"],
    "code_check": "gateChains(chains, {conclusions}) — no scope argument; ATTRIBUTION maps beats to card ids, so the signal is computable.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Descope f-mnav, open Script Candidates: assert no duel card mentions the cut; open Coverage: assert the f-mnav row is tinted.",
    "mock_bound": true,
    "scope_note": "Ceiling: accepted gap 'A recalibration does not rewrite beat text — on the fallback path'. Raised only for the missing per-card signal, which ATTRIBUTION already makes computable."
  },
  {
    "id": "DA-L1-S1",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "strength",
    "severity": "none",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 0 },
    "dimension": "create · vocabulary and speed",
    "title": "The wizard asks the type question in the maker's words and finishes in four clicks and a title",
    "expected": "Criterion 1.",
    "got": "'What kind of video is this?' → 'Educational video · an argument explained well'; templates carry measured bands and a target; a preset off the shelf is a complete answer with a real render; 'back to the shelf — nothing is kept' is an honest exit.",
    "evidence": ["app/_projects/wizard/CreateWizard.tsx:196-265", "app/_projects/wizard/stages.tsx:55-154", "lib/projects.ts:126-137"],
    "code_check": "Deck gates Next on stage.done; finish awaits create and only redirects on a stored answer (CreateWizard.tsx:180-190).",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Time the wizard from /projects/new to studio-headline data-door=open; expect under 2 minutes."
  },
  {
    "id": "DA-L1-S2",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "strength",
    "severity": "none",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 0 },
    "dimension": "research · scope as a graph",
    "title": "Scope is a separate document from the notebook, cuts are reversible, wounds are arithmetic, and the checkpoint reports its own drift",
    "expected": "Decisions kept, consequences stated.",
    "got": "The card is the toggle (aria-pressed, labelled Include/Exclude); wounds name the missing ids on the card and in Consequences; ConfirmScope says how many cards go forward and lists what moved since the checkpoint instead of pretending Script froze.",
    "evidence": ["app/_phases/research/scope.ts:1-20", "app/_phases/research/_parts/CardTile.tsx:248-266", "app/_phases/research/_parts/ScopeGate.tsx:24-72", "app/_phases/research/useScope.ts:56-59"],
    "code_check": "Scope persisted per project under research-scope; diverged computed from confirmed snapshot.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Cut a card, confirm, cut another: assert scope-diverged lists it and the button reads 'confirm again'."
  },
  {
    "id": "DA-L1-S3",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "strength",
    "severity": "none",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 0 },
    "dimension": "script · adoption and gate honesty",
    "title": "Adoption is one gesture, announced on the card, persisted, and the gate reports counts with 'not checked' as loud as 'failed' — never a score",
    "expected": "Know it was adopted; no generic 'best pick'.",
    "got": "'adopted — the Frames step opens on this chain' + ring + aria-pressed; script-adopted record; VerdictCounts prints enforced% / checked / failed / not checked; HypothesisColumn shows 'unmeasured rather than as a pass'.",
    "evidence": ["app/_phases/script/candidates/CandidatesDuel.tsx:53-77,151-155", "app/_phases/script/candidates/useAdoption.ts:45-53", "app/_phases/script/_parts/HypothesisColumn.tsx:112-117", "app/_phases/script/gate.ts:162-172"],
    "code_check": "resolveExplainerRender table in adoption.ts is pure and probed.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Adopt, reload, assert duel-adopted-<id> or the column's 'adopted — undo'."
  },
  {
    "id": "DA-L1-S4",
    "journey": "compose-from-scratch",
    "character": "dani",
    "cert_level": "L1",
    "type": "strength",
    "severity": "none",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 0 },
    "dimension": "research · prototype honesty",
    "title": "Every run surface carries the local-process note, the outcome picker is labelled 'prototype', and the notebook modal names the real notebook",
    "expected": "The surface says it is mocked.",
    "got": "LocalProcessNote on RunStage and TopicPanel; 'prototype · drive the ending'; 'saved research · not re-run'; modal title 'notebook · why-bitcoin-price-does-not-rise' with 'researched 2026-08-11'. What is missing is covered by DA-L1-1: the words are for an engineer and the compact card contradicts them.",
    "evidence": ["app/_phases/research/run/controls.tsx:37-101,147-155", "app/_phases/research/ResearchStep.tsx:296-303", "app/studio/[projectId]/StudioView.tsx:210-212"],
    "code_check": "Strings are literals on the surfaces named.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Assert the LocalProcessNote text is visible before the run button is clicked."
  }
]
```

## Verdict

**L1-conditional.** The flow reaches a persisted, adopted candidate with no broken step, and the decision surfaces (scope graph, gate counts, adoption) are the right instrument. It fails this Character's one non-negotiable — being told, in his words and before he decides, that the notebook is a stand-in — and the surface that should say it instead prints his topic over someone else's research (DA-L1-1). Conditions for L1-pass: DA-L1-1 and DA-L1-6; DA-L1-4 and DA-L1-7 for the senior bar.

grounding: research-run 0/5 · script-candidates 3/4

time-saved-if-it-all-worked: ~330 min (~5.5 h of the 7 h manual way: create 2 min · research wait + triage 20 min · candidates + adopt 15 min → reviewable beat outline in ~40 min) · confidence medium-low — the outline would exist, but with sources he cannot open and a turn he has to dig for, a senior reviewer would still re-verify the mechanisms by hand.

## First-person review (L1, designed experience)

Would I adopt this? Not today, and not because it is mocked — I was told it was mocked; the amber pill is fine. I would not adopt it because the research step put my sentence on top of somebody else's notebook and called it "a notebook exists". I typed "why does a bridge sing in the wind", I watched a log search for Bitcoin all-time highs, and when I came back the card said my topic. That is exactly the failure I left two tools over: something that could have been about anything, wearing my title. The one honest line — "replayed at 8× from run 1" — is written for whoever built it, not for me.

What I liked, and I liked a lot: the board treats research as a graph. I cut three facts under the treasury reversal and the reversal told me it was standing on less. The checkpoint tells me when I moved past it instead of pretending the script froze. The candidates do not rank themselves; they count what was checked and say "not checked" in the same amber as "failed". The beat modal is readable and the turns are coloured. Adopt is one click and it says where the chain goes next. That is the instrument I want.

What is missing for MY job: the mechanisms are not choices in the wizard at all — I had to leave the guided face to find the three things the video is made of. When I cut every fact under a reversal it said "weakened", and a senior would say "you have an assertion". No source opens; "coindesk 2026-03-04, analyst explanation" is a name, not a source. The card that should name the turn names the middle beat. And the whole catalogue tops out at six minutes; I make ten to fifteen, and the last stage told me the craft rules stop applying after I had already committed to the closest template.

Worth the wait? Forty seconds at 8× is nothing; the real minutes I would happily spend if the notebook were mine. Would I tell a peer? I would tell them to watch the triage board, and to ignore the research step until it stops telling them it is about their topic.

## First-person review (L2, live experience)

L2 verdict: **L2-conditional** — the research step stopped wearing my title and the instrument held end to end; the mechanisms are still not choices on the face I land on.

I finished, reloaded, and my adopted Reversal Chain was still adopted. The thing I left two tools over is gone: the topic field was empty (`a fresh project's topic field is empty — ""`), the stand-in was disclosed before I pressed anything, and after the run the note said, in a sentence a person reads, `this notebook is the saved 2026-08-11 Bitcoin run, not research on "Why bridges sing in the wind"`. The card no longer lies. The "turns" line now names a turn — `TURN 1 · an inflow is not a purchase` — not the middle beat.

The guided face is unchanged: hot take, steel-man, six conclusions, confirm. The three mechanisms the video is made of were never dealt; I found them on the expert board, again. Cutting every fact under a reversal still reads "weakened". No source opens. The catalogue still tops out at six minutes — I typed 300 this time so the runtime note stayed silent, which is correct and also means my ten-minute video has nowhere to live.

Would I tell a peer? "The board is real and the honesty is now on the surface. Wait for the run to be about you."
