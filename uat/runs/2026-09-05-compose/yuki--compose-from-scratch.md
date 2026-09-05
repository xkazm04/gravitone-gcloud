# Yuki — compose-from-scratch · L1 (theoretical, code-grounded)

Character: `uat/characters/yuki-animation-cinematic.md` (YU) · Journey: `compose-from-scratch` · Scenarios S3 (trailer → cinematic) + S6 (return visit / shelf) · Run `2026-09-05-compose` · Hypotheses owned: **H4** (plus H1/H3/H5 where they land on her path).

Method: surface model from the import chain, every predicate executed with `npx tsx` over the real modules (reproduction block under Surface model), then the journey walked in-character over that model. No browser.

## Surface model

### Reachable set for a `trailer · cinematic · 90 s` project on a fresh account

| Stage | Surface | Reachability |
|---|---|---|
| Shelf | `app/projects/ProjectsView.tsx:130-147` → `app/_projects/ProjectsMatrix.tsx` | reachable |
| Create | `app/_projects/wizard/CreateWizard.tsx` stages 1–4 (`stages.tsx`) on `components/ui/deck/Deck.tsx` | reachable — **but only as of an UNCOMMITTED working-tree change that landed mid-walk** (`CreateWizard.tsx:111-127` "borrowed presets"); at HEAD (`d1f11b0`) stage 3 is a dead end on a fresh account — see YU-L1-1 |
| Expert create | `app/_projects/ProjectDialog.tsx:111,268-272` | dead end on a fresh account, unchanged (`valid` requires `themeId`; copy says "Lock one in the library") |
| Studio shell | `app/studio/[projectId]/StudioView.tsx`, `Stepper.tsx`, `phases.tsx` | reachable (working tree) / only past YU-L1-1 (HEAD) |
| Research | `ResearchStep.tsx:96-97,117` → `beats/BeatVariantBoard.tsx` (trailer skips `ModeChooser`) with `useBeatPicks.ts`, slots from `beats.ts:47-49` = `GLASS_HARBOR_SLOTS` (`app/_studio/trailerFixtures.ts:114`) | reachable |
| Script | `ScriptStep.tsx:104-110,124-125` → `trailer/TrailerScript.tsx` over `useTrailerCut.ts` → `cut.ts#composeCut`, `structure.ts#runStructureCheck`, `StructurePanel.tsx` | reachable once `research-beats.confirmed` exists |
| Persistence | `_shared/stepStore.ts` keys `<id>:research-beats`, `<id>:research`, `<id>:script-trailer`; project record via `lib/projects.ts` (`parkAt` :516, `reportPhase` :533) | — |
| Frames | never (surface binding) | — |

### Reproduction (executed, `npx tsx --tsconfig tsconfig.json`)

```
presets fitting trailer: 0 of 6
trailer templates: teaser:60s[15,60] trailer:120s[90,150] cinematic:120s[60,120]
header: Movie · game trailer · Cinematic · 90s
new project phase/progress: research {"research":"empty","script":"empty","frames":"empty","score":"empty","cut":"empty"}
slots for trailer: 8 cold-open,introduction,escalation-1,escalation-2,escalation-3,reset,climax,tail
slots for teaser==cinematic==trailer (same array): true
spineComplete: {"complete":true,"missing":[]}
cut: Pitch — Series X long-cut wide-release beats 8 cue frozen false
report: malformed false enforced 69 pass 11 viol 0 unmeasured 5 notEngaged 1 findings 17
```

### Grounding audit (env.md denominator)

- `beat-board` — (1) logline: unread (`slotsFor(discipline)` only, `beats.ts:47-49`; the board says so at `BeatVariantBoard.tsx:44-47`); (2) template: unread — `slotsFor` takes the discipline, `cinematic`/`teaser`/`trailer` get the identical array (repro line 6); (3) target runtime: unread — `grep targetS app/_phases/research/beats app/_phases/script/trailer` → 0 hits; `composeCut` (`cut.ts:42-70`) takes no runtime and hard-codes `rung: "long-cut"`, beats stamped `at: "1:50"` for a 90 s project; (4) locked style's tone: unread. **0/4**, matching env.md's stated fixture reach.
- `research-run`, `script-candidates` — not met on this path.

### Wiring audit — H4, answered exactly

`grep -rn "reportPhase\|parkAt" app/ lib/ components/`:

- **`reportPhase` has exactly ONE caller in the app: `app/_phases/frames/useFrames.ts:724`.** Its reporter (`:688-712`) emits `blocked | review | working`, never `done`, and `null` (no write) when nothing was authored.
- **`parkAt` has exactly ONE caller: `StudioView.tsx:158`**, on a rail click only (`pick`); it writes `phase` and nothing else (`lib/projects.ts:516-520` — no `updatedAt`, no `progress`).
- **Research writes no progress.** `useBeatPicks.confirm` (`:62-75`) writes `research-beats` (`{mode,picks,confirmed}`) and `research` (`{topic, researched:true}`) through `stepStore` only. `reopen` (`:81`) writes `confirmed:null`. The project record is untouched.
- **Script writes no progress.** `useTrailerCut` (`:83-86`) writes `script-trailer` (`{cut,budget}`) through `stepStore` only. (The explainer half's `useAdoption` also never calls `reportPhase` — 0 hits under `app/_phases/script/`.)
- So for this journey `progress` stays `emptyProgress()` (`lib/projects.ts:355-356`) forever: shelf cells `Research — not started`, `Script — not started` (`ProjectsMatrix.tsx:153-154`), footer `0` locked, dot `draft` (`parts.tsx:46-50` via `projectState`), the **Updated column frozen at creation time** (`putProject` is the only `updatedAt` stamper and nothing on this path calls it after create), and inside the studio the rail badge title reads `Research — not started` after the spine is composed (`Stepper.tsx:56`).
- **What a reload lands on:** `StudioView.tsx:106-110` opens on `?step=` if it names a phase, else `project.phase`. `phase` is `"research"` at create (`newProject`, `:364`) and moves only when the user clicks the rail (`parkAt`). A `?step=` deep link is deliberately NOT parked (`:139-143`). So: reload of `/studio/<id>` after a rail click to Script → Script; reload of `/studio/<id>?step=script` → Script (the query survives); reload of the bare URL after arriving via the shelf cell and never clicking the rail → Research.

### Header line (StudioView.tsx:203-207)

`{DISCIPLINE_LABEL[discipline]} · {templateOf(template).label} · {targetS}s` → executed: `Movie · game trailer · Cinematic · 90s`. The cinematic catalogue note (`lib/projects.ts`, template `cinematic`) reads "imagery when the footage does not exist yet — a stage, not a length"; range `[60,120]`, default 120, and `NameStage` lets her take ownership of 90 (`CreateWizard.tsx:258-261`).

## Walkthrough

**Shelf (`/projects`).** Fresh account: six seeded demo rows plus the amber gate banner "this account has none yet — the create wizard offers presets that lock on create" (`ProjectsView.tsx:103-116`). *Does she know what to do?* Yes — "New project" → wizard. The banner's promise (presets lock on create) is true for educational and false for her, and she cannot tell yet.

**Wizard stage 1 — discipline.** Three cards; "Movie · game trailer — a promotional cut that opens a debt another artifact pays" (`DISCIPLINE_NOTE`, `lib/projects.ts`). *Her vocabulary?* Close enough — she is pitching a series, not a game, but "promotional cut … opens a debt" is exactly what a pitch cinematic is. Card chip says "3 templates". Fine.

**Stage 2 — template.** Teaser · Trailer · Cinematic, each with a "measured" band chip (`stages.tsx:85-88`): `60–120s measured · target 120s` for Cinematic, note "a stage, not a length". *Right for her?* Yes — the one sentence she wanted. (The chip says "measured" while the catalogue comment says the promotional corpus is n=0 — a small overclaim for the deck; not scored here, the four prior Characters' journey owns the wizard copy.)

**Stage 3 — style. DEAD END AT HEAD; opened by an uncommitted change during this walk.** At HEAD `d1f11b0`: `fittingPresets` = `PRESETS.filter(p => styleFits(p, "trailer"))` = 0 of 6 (every preset is `discipline: "educational"`, `presets.ts:49-134`; `styleFits` at `themes.ts:133-135` requires tag match or no tag); `fittingThemes` = 0 on a fresh account → `EmptyStyleDeck`; `Deck.tsx:148` keeps Next disabled while `!stage.done` (`done: styleId !== null`). The preflight shot `shots/01-trailer-style-stage.text.txt` shows exactly that screen. The only exit was `/library` → a theme "from a brief" → locks only with an approved proof (`canLock`, `themes.ts:211-214`; `lockBlocker`: "generate at least one proof first") → proofs come from `Playground.tsx:201 generateImage(...)` priced by `/api/imaging/pricing` (`:66`) — i.e. rendering and spend, which DoD 7 forbids.

While this report was being written, `CreateWizard.tsx` and `stages.tsx` changed on disk (uncommitted, `git status` `M`): when no preset fits the discipline the stage now offers all six as "borrowed" (`CreateWizard.tsx:122-127`), the stage sub-copy says "No style is written for movie · game trailer yet, so the six explainer presets are offered as a starting look … fits any discipline" (`:244-247`), every card carries an amber chip "written for educational video · fits any" (`stages.tsx:146-148`), and the minted theme is untagged when borrowed (`CreateWizard.tsx:185`) so it fits the project it was chosen for. *Can she finish without rendering or spending, on the working tree?* Yes — the preset thumb is a committed file (`proofFromThumb`, `:62-78`), no generation. The change is honest in her terms: it says whose look she is borrowing. The expert dialog (`ProjectDialog.tsx:111,268-272`) was NOT changed and still walls a fresh account.

**Everything below is walked on the working tree (borrowed preset → untagged locked theme).**

**Stage 4 — name & clock.** Title, optional logline, runtime hint "Cinematic was measured at 60–120s" — she types 90. Create & open → `/studio/<id>`.

**Studio header.** `Pitch — Series X` headline; pill `MOVIE · GAME TRAILER · CINEMATIC · 90S`; pill `PROTOTYPE · MOCKED DATA`. Criterion 1 holds. Rail: 1 Research (cyan, current) … all badges `not started`.

**Research — beat board.** Eyebrow "Movie · game trailer · beat variants" (not "Cinematic"); copy "Pick one beat per part — the spine you compose is what Script opens on. 8 parts"; the fixture line "fixture · n=0 · the Glass Harbor slots, whatever the project's logline — a model run from pipeline/BEATS-PROMPT.md is what replaces them" (`BeatVariantBoard.tsx:44-47`). *Does she know the material is a stand-in before deciding?* Yes — DoD 4 holds on this board (H3 board side confirmed honest). Eight columns, 2–3 tiles each, each tile shows kind · connector · timestamp · raises chips (`VariantTile.tsx`). The timestamps run `0:00 … 1:50` under a header that says 90 s; nothing reconciles them. Footer: "3 of 8 parts unpicked: …" until whole, then "compose spine →" (`:89-98`). She composes: status flips to "Step 2 opens on this frozen spine. Reopen to change a pick; it must be composed again." (`:72`), columns go read-only, `reopen` button appears. *Was the decision kept?* Yes — `research-beats` saved on every change.

**Back to the shelf (S6, first check).** Row `Pitch — Series X`: Research cell hollow, tooltip `Research — not started · open here`; dot `draft`; Updated `<create time>`. *Does the product say it does not report?* No. Nothing on the shelf, the legend, or the studio rail says research/script have no reporter. Criterion 2 fails. Only Frames can ever tint a cell (`useFrames.ts:724`), so the first honest row this project can show is "Frames in progress · Research not started · Script not started".

**Script — trailer half.** `ScriptStep` routes on `discipline === "trailer"` (`:105-106`) → `TrailerScript`. Hydrate: no saved cut yet → reads `research-beats.confirmed`, composes from `slotsFor("trailer")` + `GLASS_HARBOR_CUE`, saves once (`useTrailerCut.ts:59-77,83-86`). Header "composed from 8 picked parts · cue: Low Tide — candidate cue · lane: wide-release / Pitch — Series X · long-cut · the cue is a candidate, not frozen". Then EnergyCurve, eight MovementSections (editable), PromiseLedger, WithholdingPanel (Glass Harbor assets: "the premise — a crew that never breaks in…", "the glass floor over the harbour…"), StructurePanel. *Does she know this is a stand-in here?* The board said so one step back; this surface does not — the only fixture tell on Script is the amber `prototype · mocked data` pill in the studio header. A producer reading "the glass floor over the harbour giving way under the crew" under HER title has to remember the previous step's footnote.

**Structure report.** Executed over the composed cut: `malformed: no · 69% enforced · 11 pass · 0 violation · 5 unmeasured · 1 not-engaged`, 17 rows each with rule · verdict · subject · beat label · detail · cites, advisory rows (`promise`, `efficacy`) under their own dashed rule (`StructurePanel.tsx:40-110`). Rows like "promise · unmeasured · extraction — 0 promise(s) are declared on beats. The ledger's own step 1 is to watch the cut as a stranger…" and "magnitude · unmeasured · rise — not decidable from the beat layer" are exactly what she hands an artist. Criterion 4 holds. "ladder · pass · A long cut, and no part is declared dropped" is the one row that is wrong FOR HER — a 90 s cinematic is not a long cut, and the checker cannot know because the runtime never arrived.

**Reopen (criterion 3).** She goes back to Research, `reopen`, swaps the cold open, `compose spine →` again. `research-beats.confirmed` now names a different variant. Script: `useTrailerCut` hydrates, finds `saved.cut` under `script-trailer` and returns before reading picks (`:51-57`). The header still says "composed from 8 picked parts", the cold-open section still shows the old beat, and no sentence says the spine was recomposed since. `grep reopen|confirmed app/_phases/script/trailer` → only the hydrate path; no stale flag exists. The board's own copy ("it must be composed again") and `useBeatPicks.ts:77-80` ("Script keeps reading the last confirmed spine until a new one is composed") both promise a recompose reaches Script; the code never does. Criterion 3 fails — silently, which is the pet peeve verbatim.

**Reload (S6, criterion 5).** She was on Script via the rail → `parkAt(id,"script")` → reload opens on Script with the saved cut (`StudioView.tsx:106-110`). Edits to beats are saved per change (`:83-86`). Holds, with the documented caveat that a `?step=` arrival is not parked.

## Scored criteria (identical every run)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Header names discipline, template, runtime | **pass** | `StudioView.tsx:203-207`; executed `Movie · game trailer · Cinematic · 90s` |
| 2 | Shelf research cell changes after composing, or the product says it does not report | **fail** | `reportPhase` sole caller `useFrames.ts:724`; `useBeatPicks.ts:62-75` writes stepStore only; `ProjectsMatrix.tsx:153` tooltip stays "not started"; no "does not report" copy anywhere (`grep -rn "report" app/_projects app/studio` → only code comments) |
| 3 | Reopening a composed spine is visible on Script | **fail** | `useTrailerCut.ts:51-57` short-circuits on a saved cut; no stale statement in `trailer/*.tsx` |
| 4 | Structure report lists findings she can hand to an artist | **pass** | `StructurePanel.tsx:54-77` rows with detail + cites; executed 17 rows |
| 5 | Reload lands on the step she was on | **pass** (rail-parked) | `StudioView.tsx:106-110,153-158`; caveat `:139-143` |

Score 3/5 on the working tree. At HEAD (`d1f11b0`) **0/5 is reachable on a fresh account** (YU-L1-1) — the borrowed-presets change is uncommitted and must land for this score to hold.

## Findings

Impact scale: 1–5 (frequency = how often a Character like Yuki hits it; reachability = how few clicks from the journey's main path; trust_erosion = how much of the "would I run a production on this" bar it costs).

```json
[
  {
    "id": "YU-L1-1",
    "journey": "compose-from-scratch",
    "character": "yuki",
    "cert_level": "L1",
    "type": "broken-flow",
    "severity": "P0",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 4 },
    "dimension": "reachability",
    "title": "At HEAD a trailer project cannot be created on a fresh account without generating an image (every preset is tagged educational → empty style deck, Next disabled); an UNCOMMITTED working-tree change made mid-walk opens the wizard with borrowed presets — the expert dialog still walls",
    "expected": "Definition of done 7 — a cinematic project is created and the studio opens on it without rendering or spending; the shelf banner's own promise 'the create wizard offers presets that lock on create'.",
    "got": "HEAD d1f11b0: styleFits(p,'trailer') is false for all 6 presets (executed: 'presets fitting trailer: 0 of 6'); with no locked theme the stage renders EmptyStyleDeck and Deck keeps Next disabled while styleId is null. The only exit is /library → a theme from a brief → which locks only with an approved proof → proofs come from Playground.generateImage priced by /api/imaging/pricing. The preflight shot shots/01-trailer-style-stage.text.txt shows the dead end. WORKING TREE (git status M, uncommitted at the time of this report): CreateWizard.tsx:122-127 falls back to all six presets when none fits, the stage sub-copy and an amber 'written for educational video · fits any' chip say so (stages.tsx:146-148), and the minted theme is untagged when borrowed (CreateWizard.tsx:185) — no generation, no spend. ProjectDialog.tsx is unchanged: 'quick create — the expert form' still requires a locked fitting theme (valid needs themeId; copy 'No locked style fits … Lock one in the library').",
    "evidence": [
      "app/_projects/wizard/CreateWizard.tsx:110-113 (HEAD) / :111-127,185,244-247 (working tree)",
      "app/_projects/wizard/CreateWizard.tsx:224-232 (HEAD) / :253-261 (working tree)",
      "app/_projects/wizard/stages.tsx:158-176 (HEAD) / :136-159 (working tree)",
      "components/ui/deck/Deck.tsx:148",
      "app/library/presets.ts:49,66,83,100,117,134",
      "lib/themes.ts:133-135",
      "lib/themes.ts:211-214",
      "app/library/Playground.tsx:20,66,201",
      "app/_projects/ProjectDialog.tsx:111,268-272",
      "app/projects/ProjectsView.tsx:103-116",
      "uat/runs/2026-09-05-compose/shots/01-trailer-style-stage.text.txt"
    ],
    "code_check": "npx tsx: PRESETS.filter(p => styleFits(p,'trailer')).length === 0; Deck next disabled={!stage.done}; style stage done = styleId !== null. Working tree: borrowedPresets = disciplinePresets.length === 0 → fittingPresets = PRESETS (6 cards).",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Fresh uat/.profile (or a new devAuth uid), on a build that INCLUDES the borrowed-presets change: /projects/new → Movie · game trailer → Cinematic → expect six preset cards each chipped 'written for educational video · fits any', Create & open lands in the studio with NO /api/imaging call. Then 'quick create — the expert form' on the same fresh account → expect the wall. Precondition: NO locked theme on the account — a leftover lock makes both invisible. If the change is not committed by L2 time, expect EmptyStyleDeck instead and this stays P0.",
    "scope_note": "Shared with every trailer/free Character (H1). Not mock-bound: the tag on the presets and the fit predicate are product code. The working-tree fix resolves the wizard; the residual is the expert dialog (same predicate, no fallback) and the fact that the fix is uncommitted — it must be committed for the L1 verdict below to hold."
  },
  {
    "id": "YU-L1-2",
    "journey": "compose-from-scratch",
    "character": "yuki",
    "cert_level": "L1",
    "type": "silent-state",
    "severity": "P1",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 5 },
    "dimension": "trust",
    "title": "Composing the spine moves nothing on the shelf or the rail — reportPhase has one caller (Frames) and neither Research nor Script ever writes progress, and nothing says so",
    "expected": "Criterion 2: after composing, the research cell changes state, OR the shelf/rail says research and script do not report. Senior bar: every state shown corresponds to an act.",
    "got": "grep reportPhase across app/ → sole call site app/_phases/frames/useFrames.ts:724. useBeatPicks.confirm writes 'research-beats' and 'research' through stepStore only; useTrailerCut writes 'script-trailer' only; parkAt writes phase only (no updatedAt, no progress). Result for this journey: cell tooltip 'Research — not started · open here' and 'Script — not started' after a composed spine and an edited cut; project dot 'draft'; Updated column frozen at creation time (putProject is the only updatedAt stamper and nothing on this path calls it after create); studio rail badge title 'Research — not started' (Stepper.tsx:56) while standing on the composed board. The first row this project can ever show is 'Frames in progress · Research not started · Script not started'. No copy on the matrix, its legend, or the rail states that two steps have no reporter.",
    "evidence": [
      "app/_phases/frames/useFrames.ts:724",
      "lib/projects.ts:494-520",
      "lib/projects.ts:533-543",
      "app/_phases/research/beats/useBeatPicks.ts:62-75",
      "app/_phases/script/trailer/useTrailerCut.ts:83-86",
      "app/studio/[projectId]/StudioView.tsx:153-158",
      "app/_projects/ProjectsMatrix.tsx:143-157,160-165",
      "app/studio/[projectId]/Stepper.tsx:56",
      "app/_projects/parts.tsx:46-50,80-89"
    ],
    "code_check": "grep -rn 'reportPhase' app/ lib/ components/ → 1 call (frames); grep -rn 'reportPhase\\|putProject\\|updatedAt' app/_phases/research app/_phases/script → 0 hits; newProject().progress executed = all 'empty'",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Create a trailer project (needs YU-L1-1 cleared or a pre-locked untagged theme), compose the spine, open Script, return to /projects: assert cell-<id>-research title contains 'not started' and the Updated cell still reads the creation time; then assert the rail's step-research title after compose. Env: IndexedDB profile persists — read created.json for the id.",
    "scope_note": "H4 confirmed in full. The ONE mechanism is already built (reportPhase); the two steps just never call it. A Research reporter deriving 'working' from picks and 'review' from a composed spine, and a Script reporter from a saved cut, is the same derive-never-assert shape useFrames.ts:688-712 documents. Alternatively the matrix must say which columns can report."
  },
  {
    "id": "YU-L1-3",
    "journey": "compose-from-scratch",
    "character": "yuki",
    "cert_level": "L1",
    "type": "stale-state",
    "severity": "P1",
    "impact": { "frequency": 4, "reachability": 4, "trust_erosion": 5 },
    "dimension": "trust",
    "title": "Reopen → change a pick → compose again never reaches Script: the saved cut short-circuits the spine, and no surface says the cut is older than the spine",
    "expected": "Criterion 3: a reopened / recomposed spine is visible on Script as a stale or frozen statement. The board's own copy promises it: 'Reopen to change a pick; it must be composed again.' useBeatPicks.ts:77-80 promises 'Script keeps reading the last confirmed spine until a new one is composed'.",
    "got": "useTrailerCut hydrate: if a 'script-trailer' record with a cut exists it is loaded and the function returns before 'research-beats' is read (lines 51-57). The picks are only read when NO cut exists (59-77). So after the first compose, every later reopen+recompose changes 'research-beats.confirmed' and nothing else; TrailerScript keeps showing the first spine's beats under 'composed from 8 picked parts' with no version, no timestamp, no 'the spine was recomposed since' line. grep reopen|confirmed under script/trailer → only the hydrate path. Whether the cut SHOULD survive (the artist's edits) or follow the spine is a product call; that neither surface states which wins is the defect.",
    "evidence": [
      "app/_phases/script/trailer/useTrailerCut.ts:48-79",
      "app/_phases/research/beats/useBeatPicks.ts:60-81",
      "app/_phases/research/beats/BeatVariantBoard.tsx:70-76",
      "app/_phases/script/trailer/TrailerScript.tsx:82-101",
      "app/_phases/script/trailer/cut.ts:7-9"
    ],
    "code_check": "Static trace: loadStep(projectId,'script-trailer') truthy → setCut(saved.cut); return — the confirmed picks are never compared. No field on TrailerCut records which confirmed spine it was composed from (types.ts TrailerCut has id/title/rung/lane/cue/movements/beats).",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "After YU-L1-2's setup: on Research click reopen-spine, pick a different cold-open variant, compose-spine; open step-script and assert the cold-open MovementSection text changed OR a stale notice exists. Expect neither. Precondition: the project already had Script opened once (so a cut is saved).",
    "scope_note": "The inverse of Yuki's pet peeve — the spine is not lost, the recompose is. A composed-from stamp on the cut (the confirmed picks' identity) plus a one-line 'the spine was recomposed after this cut — recompose / keep edits' is the smallest honest fix."
  },
  {
    "id": "YU-L1-4",
    "journey": "compose-from-scratch",
    "character": "yuki",
    "cert_level": "L1",
    "type": "grounding",
    "severity": "P2",
    "impact": { "frequency": 5, "reachability": 4, "trust_erosion": 3 },
    "dimension": "grounding",
    "title": "The header says 90 s, the board and the cut say 1:50 — target runtime is read by nothing after the wizard, the cut is hard-coded 'long-cut', and the ladder rule passes a 'long cut' for a 90 s cinematic",
    "expected": "env.md beat-board denominator (3): the target runtime. Yuki's cinematic is 90 s; the length ladder is the doctrine's mechanism for shortening a promotional cut, and the structure report should at least say the runtime was not consulted.",
    "got": "grep targetS under research/beats and script/trailer → 0 hits. composeCut takes {projectId,title,picks,slots,cue} and sets rung:'long-cut', lane:'wide-release' unconditionally. Fixture beats carry at:'0:00'…'1:50'. The executed report says 'ladder · pass · A long cut, and no part is declared dropped' — a true statement about the fixture and a false one about her project. The board's fixture line names the logline as the thing ignored, not the runtime or template.",
    "evidence": [
      "app/_phases/script/trailer/cut.ts:42-70",
      "app/_studio/trailerFixtures.ts:122,162,358",
      "app/_phases/research/beats/BeatVariantBoard.tsx:44-47",
      "app/studio/[projectId]/StudioView.tsx:203-207"
    ],
    "code_check": "npx tsx: composeCut(...).rung === 'long-cut' for targetS 90; runStructureCheck → ladder pass 'A long cut, and no part is declared dropped'",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": true,
    "l2_priority": "On the composed Script for a 90 s cinematic, read the tail MovementSection timestamp and the ladder row in structure-panel; expect '1:50' and 'long cut' against a 90s header pill.",
    "scope_note": "Beat content is fixture (accepted). The wiring is not: composeCut has no runtime seam, so a real BEATS-PROMPT run would inherit the same blindness. Minimum interface fix: extend the fixture line to 'whatever the project's logline, template or runtime', and let the ladder row report unmeasured when no runtime was supplied."
  },
  {
    "id": "YU-L1-5",
    "journey": "compose-from-scratch",
    "character": "yuki",
    "cert_level": "L1",
    "type": "grounding",
    "severity": "P2",
    "impact": { "frequency": 5, "reachability": 4, "trust_erosion": 2 },
    "dimension": "grounding",
    "title": "Teaser, trailer and cinematic get the identical slot set — the 'three contracts' the wizard sells never reach the board, whose eyebrow says 'Movie · game trailer', not 'Cinematic'",
    "expected": "H5 / env.md beat-board denominator (2): the template. The wizard's template stage distinguishes three contracts with three bands; the board should at least name which one it is dealing for.",
    "got": "slotsFor(discipline) returns GLASS_HARBOR_SLOTS for every non-educational discipline (executed: slotsFor('trailer') === slotsFor('free')); the seam takes no template. Board eyebrow = DISCIPLINE_LABEL[discipline] · beat variants.",
    "evidence": [
      "app/_phases/research/beats/beats.ts:38-49",
      "app/_phases/research/beats/BeatVariantBoard.tsx:36",
      "lib/projects.ts (TEMPLATES teaser/trailer/cinematic; TEMPLATE_FAMILY)"
    ],
    "code_check": "npx tsx: slotsFor('trailer') === slotsFor('free') → true; 8 slots either way",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": true,
    "l2_priority": "Create one teaser and one cinematic project; assert both boards list the same 8 slot-<id> sections and the same eyebrow text.",
    "scope_note": "Content is fixture; the seam signature (discipline only) is code. Shared with Marco/Sofia (H5)."
  },
  {
    "id": "YU-L1-6",
    "journey": "compose-from-scratch",
    "character": "yuki",
    "cert_level": "L1",
    "type": "fixture-honesty",
    "severity": "P2",
    "impact": { "frequency": 5, "reachability": 4, "trust_erosion": 3 },
    "dimension": "legibility",
    "title": "The Script trailer half shows Glass Harbor's cue and withholding assets under her project title with no stand-in label; the only fixture tell is the board one step back",
    "expected": "accepted-gaps.md accepts the mock 'on the condition that every surface says so'. H3: where does a Character first meet Glass Harbor content unlabelled?",
    "got": "BeatVariantBoard labels the slots as fixture (honest). TrailerScript's header reads 'composed from 8 picked parts · cue: Low Tide — candidate cue · lane: wide-release / <her title> · long-cut'; WithholdingPanel lists GLASS_HARBOR_BUDGET assets ('the premise — a crew that never breaks in…', 'the glass floor over the harbour…'); no line on Script says the cue or the budget is a stand-in. The generic 'prototype · mocked data' pill in the studio header is the only tell.",
    "evidence": [
      "app/_phases/script/trailer/TrailerScript.tsx:82-101,109-112",
      "app/_phases/script/trailer/useTrailerCut.ts:6,55,68,71",
      "app/_studio/trailerFixtures.ts:30-33,50-80",
      "app/_phases/research/beats/BeatVariantBoard.tsx:44-47"
    ],
    "code_check": "grep -n 'fixture\\|stand-in\\|n=0' app/_phases/script/trailer/*.tsx → 0 hits in rendered copy",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": true,
    "l2_priority": "Open Script on a composed trailer project; assert no element under trailer-script contains 'fixture' or 'stand-in'.",
    "scope_note": "One sentence beside 'composed from' — 'cue and withholding budget are the Glass Harbor fixture' — satisfies the accepted-gap condition."
  },
  {
    "id": "YU-L1-7",
    "journey": "compose-from-scratch",
    "character": "yuki",
    "cert_level": "L1",
    "type": "strength",
    "severity": "P3",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 0 },
    "dimension": "legibility",
    "title": "The studio header states discipline · template · runtime exactly, and the cinematic template says it is a stage, not a length",
    "expected": "Criterion 1.",
    "got": "Executed: 'Movie · game trailer · Cinematic · 90s'. Template note 'imagery when the footage does not exist yet — a stage, not a length'; band 60–120 s; the wizard lets her own the 90.",
    "evidence": [
      "app/studio/[projectId]/StudioView.tsx:203-207",
      "lib/projects.ts (TEMPLATES.cinematic)",
      "app/_projects/wizard/CreateWizard.tsx:139-143,258-261"
    ],
    "code_check": "npx tsx over DISCIPLINE_LABEL/templateOf/newProject",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Assert the header pill text after create; env: any account that can finish the wizard."
  },
  {
    "id": "YU-L1-8",
    "journey": "compose-from-scratch",
    "character": "yuki",
    "cert_level": "L1",
    "type": "strength",
    "severity": "P3",
    "impact": { "frequency": 5, "reachability": 4, "trust_erosion": 0 },
    "dimension": "trust",
    "title": "The structure report is hand-able: 17 rows with rule, verdict, beat, detail and citation; unmeasured is drawn as loudly as violation; advisory rules sit under their own rule and never count toward malformed",
    "expected": "Criterion 4.",
    "got": "Executed over the composed cut: malformed no · 69% enforced · 11 pass · 0 violation · 5 unmeasured · 1 not-engaged; rows such as 'promise · unmeasured · 0 promise(s) are declared on beats…' and 'magnitude · unmeasured · rise' tell an artist exactly what to add. The panel header refuses to say 'works'.",
    "evidence": [
      "app/_phases/script/trailer/StructurePanel.tsx:40-110",
      "app/_phases/script/trailer/structure.ts:1174-1295"
    ],
    "code_check": "npx tsx runStructureCheck(composeCut(...), { budget: GLASS_HARBOR_BUDGET })",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Assert structure-panel and structure-malformed render with 'malformed: no' on a whole spine; count structure-rule-* groups."
  },
  {
    "id": "YU-L1-9",
    "journey": "compose-from-scratch",
    "character": "yuki",
    "cert_level": "L1",
    "type": "strength",
    "severity": "P3",
    "impact": { "frequency": 4, "reachability": 5, "trust_erosion": 1 },
    "dimension": "persistence",
    "title": "Reload lands on the step she parked on, and every pick and cut edit is saved per change",
    "expected": "Criterion 5; DoD 6.",
    "got": "Rail click → parkAt writes phase; StudioView opens on ?step= else project.phase; picks (research-beats) and the cut (script-trailer) save on every state change once hydrated. Caveat, documented in code: arriving via a shelf cell (?step=script) does not park, so a later reload of the bare URL opens on Research.",
    "evidence": [
      "app/studio/[projectId]/StudioView.tsx:76-79,104-110,128-176",
      "lib/projects.ts:516-520",
      "app/_phases/research/beats/useBeatPicks.ts:46-49",
      "app/_phases/script/trailer/useTrailerCut.ts:83-86"
    ],
    "code_check": "Static trace of setPhaseKey(wanted ?? p.phase) and pick→parkAt",
    "verdict": "uncertain",
    "resolution": "open",
    "l2_priority": "Click step-script on the rail, reload /studio/<id>, assert step-script has aria-current; then open via cell-<id>-script, reload the bare /studio/<id>, expect Research (the caveat). Env: persistent uat/.profile."
  }
]
```

## Verdict

**L1-conditional** — conditional on the uncommitted borrowed-presets change landing (YU-L1-1: at HEAD this is an **L1-fail**, a P0 wall at the wizard's style stage for every trailer/free Character on a fresh account; on the working tree the wizard opens without generation). Past the wizard the path scores 3/5: header and structure report are senior-grade; the shelf and the rail never learn that a spine was composed (YU-L1-2), and a recomposed spine never reaches Script and nothing says so (YU-L1-3) — both P1 on the exact job this Character has.

grounding: beat-board 0/4

time-saved-if-it-all-worked: ~1 day of calendar time (1.5 days manual → one 30-minute sitting for the beat list and structure read; the client review round is not replaced) · confidence medium — the composed spine is on screen in 30 minutes, but she still has to open the project to know its state, which is the half of her job the shelf was for.

## First-person review (L1, designed experience)

On the build that is checked in, I got as far as "which visual identity does it render in?" and the tool told me, politely and correctly, that nothing on my account fits a trailer and I should go commission a style in the library. I am not rendering anything this week — I want a beat list. So on a new account I do not get in. Somebody fixed that while I was standing there — the stage now deals the six explainer looks with an amber "written for educational video · fits any" chip on each, which is an honest sentence and I will take it — but the fix is not committed, and the "expert form" next to it still has the old wall. I will believe it when it is on main.

Past that, the header is exactly what I asked for: *Movie · game trailer · Cinematic · 90s*, and the template card had already told me a cinematic is a stage, not a length. The beat board is honest about being a Glass Harbor fixture before I pick anything, the eight columns are fast, and "compose spine →" with a "3 of 8 unpicked" count is how I would want an artist to hand me a spine. The structure report is the best thing here — seventeen rows, each with what it read and what it could not, "unmeasured" written as loudly as a failure. I can paste that into a Notion board for the artist as-is.

Then I go back to the shelf, and my project says *Research — not started · Script — not started · draft · updated an hour ago* (the hour I created it). Nothing I did in the studio exists on the wall chart. Nobody earned a badge, which I respect, but nobody told me the chart cannot show research or script at all — I had to read the code to learn only Frames reports. A producer cannot run three pitches off a chart that only knows about one step and does not say so.

And the thing I feared most is here in mirror image: my artist reopens the spine, swaps the cold open, composes again — and Script keeps the first cut, silently. The spine is not lost; the recompose is. Either answer is defensible; not saying which is not.

Worth the wait? Thirty minutes to a checked beat list is worth it. Would I adopt today? No: I cannot create the project, and if I could, the shelf would tell me a lie by omission every morning. Fix the style wall and give Research and Script a voice on the shelf, and I would put this in front of a client on Thursday.

## First-person review (L2, live experience)

L2 verdict: **L2-pass** — every status I saw traced to an act, live, and the reopen was visible on Script; the spine is a Glass Harbor stand-in and the page says so.

All five of my criteria held in the browser. Header pill: `Movie · game trailer · Cinematic · 90s`. Before any pick the record read `research: empty`; one pick → `working`; compose → `done`, drawn "locked" on the shelf; reopen → back to `working`, Script `working` too. That four-state sequence is the trace a producer needs, and it did not exist when I read the code this morning. Script said the spine was reopened and this was the last composed cut — the thing I feared most, now spoken. Reload landed on Script. The structure report listed twelve rows by rule I can paste for an artist.

The shelf (shot 03) shows "Emberline — series pitch cinematic", Research locked, Script in progress, sorted to the top by an updated time that finally moves with work.

What I still cannot do: put the beat list in front of a client — it is a harbour heist with my title on it, and the amber line says so. "Locked" on the shelf means a checkpoint, "locked" on the style card means a minted theme, "locked in scope" means a card cannot be cut; one word per meaning, please, before the client sees it. Script never says "done", by design — accepted.

Would I tell a peer? Yes: "The state is honest now. Thursday, if the board reads our logline."
