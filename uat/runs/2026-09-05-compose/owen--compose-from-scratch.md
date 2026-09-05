# Owen — compose-from-scratch · L1 (theoretical, code-grounded)

Character: `uat/characters/owen-truecrime-doc.md` (OW) · Journey: `compose-from-scratch` S4, FACTS branch
(free discipline → free-form → style stage on a fresh account → ModeChooser → facts → EducationalResearch → Script explainer half).
Hypotheses owned: H1, H2, H6. No browser was opened; every claim cites file:line and the two predicates that
decide the verdict were executed with `node -e` (reproductions quoted inline).

> **Mid-walk change of ground (2026-09-05).** While this report was being written,
> `app/_projects/wizard/{CreateWizard,stages}.tsx` changed on disk — UNCOMMITTED (`git status` → ` M`), HEAD is
> still `db77786`. The change is a "borrowed presets" fallback for exactly H1. Both states are recorded below:
> H1 is **confirmed at HEAD** and **resolved in the working tree**; L2 must say which build it ran.

## Surface model

### Reachable set (in order), and where it stops

| # | Surface | Entry | Reachability for Owen on a fresh account |
|---|---|---|---|
| 1 | `/projects/new` deck, stage 1 discipline | `app/_projects/wizard/CreateWizard.tsx:196-207`, cards `stages.tsx:55-73` | reachable — picks `free` ("Any video · no craft template — your own discipline; the studio only keeps time", `lib/projects.ts:129,136`) |
| 2 | stage 2 template | `CreateWizard.tsx:208-218`, `templatesFor("free")` → `["free-form"]` (`lib/projects.ts:227-233, 240-248`) | reachable — one card, chip "15–600s accepted" (`stages.tsx:85-86`) |
| 3 | stage 3 style | `CreateWizard.tsx:219-240` | **BLOCKED.** `fittingThemes` = `lockedOnly(themes).filter(styleFits(t,"free"))` (`:103-106`) is empty on a fresh account (`uat/env.md` "a fresh account has NO locked theme"); `fittingPresets = PRESETS.filter(styleFits(p,"free"))` (`:110-113`) is empty because every preset is `discipline: "educational"` (`app/library/presets.ts:49,66,83,100,117,134`) and `styleFits` is `discipline==="all" \|\| !theme.discipline \|\| theme.discipline===discipline` (`lib/themes.ts:133-134`). Both empty → `EmptyStyleDeck` (`:231-232`). Stage `done: styleId !== null` (`:224`) stays false → Deck's Next is `disabled={!stage.done}` (`components/ui/deck/Deck.tsx:148`), stage 4 unreachable (`Deck.tsx:65-66`), and `finish` early-returns without `styleId` (`CreateWizard.tsx:146`). |
| 3' | stage 3 style — **working tree (uncommitted)** | `CreateWizard.tsx:110-127` | `disciplinePresets` empty → `borrowedPresets = true` → `fittingPresets = PRESETS` (all six). Stage sub-line: "No style is written for any video yet, so the six explainer presets are offered as a starting look — one locks as this project's style when you create, and fits any discipline…" (`:243-246`); each card chips "written for educational video · fits any" (`stages.tsx:146-148`); the minted theme is `discipline: undefined` (`CreateWizard.tsx:186`) so it fits every discipline by `styleFits`. Stage 4 becomes reachable; `EmptyStyleDeck` is now dead for any picked discipline (`PRESETS` is never empty). |
| 3b | the exits from the empty deck (HEAD) | `stages.tsx:158-177` | "commission one in the library →". A theme locks only with ≥1 approved proof and no pending one (`lib/themes.ts:211-214`); proofs are generated renders (`app/library/LibraryAtelier.tsx:11` "proofs come back from /api/imaging/generate"). That is image generation = spend, which DoD 7 forbids for this journey. The expert dialog is no way round: `valid` requires `draft.themeId` on create (`app/_projects/ProjectDialog.tsx:111`) and its shelf is filtered by the same `styleFits` (`:100-102`). The shelf's own comment says "NEITHER is theme-gated any more" (`app/projects/ProjectsView.tsx:89`) — true for educational, false for trailer and free. |
| 4 | Studio → Research, `BeatsResearch` | `app/_phases/research/ResearchStep.tsx:96-97, 102-141` | reachable ONLY IF a `free`-fitting locked theme exists. Everything below is judged conditionally on that. |
| 5 | ModeChooser | `beats/ModeChooser.tsx:31-58`; stored via `useBeatPicks.setMode` (`beats/useBeatPicks.ts:51`, saved `:46-49` under `research-beats`) | reachable; `mode===null` → chooser (`ResearchStep.tsx:122`) |
| 6 | ModeSwitch above the facts surface | `ModeChooser.tsx:74-101`, mounted `ResearchStep.tsx:125-133` | reachable; `locked` only when `beats.confirmed` (beats path) |
| 7 | `EducationalResearch` — identical component to the educational discipline | `ResearchStep.tsx:137, 143-185` | reachable — same `useEducationalResearch` + `useScope` instances, same face record `research-mode` |
| 8 | Guided face (default while nothing decided, `:170-171,181`) | `guided/GuidedResearch.tsx:141-200`, `RunStage.tsx`, `passes.tsx` | reachable: stages run · the takes · conclusions · review |
| 9 | Expert face | `ResearchTriageBoard`, `_parts/CardTile.tsx` | reachable via FaceSwitch (`GuidedResearch.tsx:44-58`) or "Open the expert board" finish (`:208-209`) |
| 10 | Script, explainer half | `app/_phases/script/ScriptStep.tsx:96-127` route; `researched` gate `:161-166, 194-205` | reachable: `discipline==="free" && picks.mode==="facts"` → not trailer (`:105-106`) → `ExplainerScript`; `researched` written by `useEducationalResearch.ts:50` on `ready` |
| 11 | Candidates: guided duel / expert columns | `candidates/CandidatesDuel.tsx`, `_parts/HypothesisColumn.tsx` | reachable after a run |

Never reached (by binding): Frames. Not reached on this branch: beat board, trailer script.

### Grounding scores (against `uat/env.md`'s shared denominator)

- `research-run` **0/5** — the trace is replayed (`run/useResearchRun.ts:193`, `controls.tsx:151`), every step's `detail` is Bitcoin (`run/trace.ts:24-38`), the notebook is `NOTEBOOK` regardless of topic (`useEducationalResearch.ts:24,44`; modal title hard-coded `ResearchStep.tsx:299`). Typed topic: written to the record (`:50`) and printed as a heading (`RunStage.tsx:100`) but never read by the run. Logline / discipline / runtime / prior notebooks: no reader.
- `script-candidates` **3/4** — reads scope (`ScriptStep.tsx:147-148`), the notebook (`:38`), the template band via the fixture's craft checks (`renders.ts:48-58`); runtime is the fixture's "5:00 target" (`renders.ts:49,108`), not the project's `targetS` (grep `targetS` in `script/renders.ts`, `script/gate.ts`, `candidates/CandidatesDuel.tsx` → no hit).
- `beat-board` — not met on this branch.

### Wiring notes (one grep each)

- `targetS` → never read by the Script step (above). Owen's 600 s free-form runtime is decorative past the wizard.
- `researched` writers: `useEducationalResearch.ts:50` (the run) and `useBeatPicks.ts:71-74` (`confirm`). Readers: `ScriptStep.tsx:164`. `reopen` does NOT clear it (`useBeatPicks.ts:77-81`, by design comment).
- `reportPhase` — no caller under `app/_phases/research/` or `app/_phases/script/` (only `frames/useFrames.ts:724`). H4 stands for this branch: the shelf's research/script cells cannot move. (Owned by another walker; noted, not raised.)
- Reversal cards: built `_shared/notebook/cards.ts:100-106` (`title: r.obviousReading`, `detail: r.whyWrong`), in scope by default (`research/scope.ts:35-42` — only `optIn` cards start descoped). Guided passes: `passes.tsx:33-48` deal `hottest`, `steel-man`, `optIn && !hottest` — **no pass deals reversals, facts or mechanisms.**

## Walkthrough (cognitive walkthrough per stage)

**Stage 1 — "What kind of video is this?"** Owen sees three cards: Educational video / Movie · game trailer / Any video. His companion piece is none of the first two; "Any video — no craft template — your own discipline; the studio only keeps time" (`lib/projects.ts:129,136`) is honest and he picks it, with the mild sting that "any" is the studio's word for "we did not measure yours". Will he know what to do? Yes. Will he know he did the right thing? The rail shows "Any video" as the summary. DoD 2: answerable, if not in his vocabulary.

**Stage 2 — template.** One card, "Free form · 15–600s accepted · target 90s" (`stages.tsx:85-88`). Fine; the runtime is owned at stage 4 (`CreateWizard.tsx:97-100`).

**Stage 3 — style. At HEAD the journey ends here on a fresh account; in the working tree it continues.** At HEAD the deck draws "No locked style fits any video yet … Styles are commissioned in the library — a style from a brief fits every discipline" (`stages.tsx:158-177`). Reproduction:

```
node -e 'styleFits=(t,d)=>d==="all"||!t.discipline||t.discipline===d; …'
educational fitting presets: 6
trailer fitting presets: 0
free fitting presets: 0
```

Next is disabled (`Deck.tsx:148`); stage 4 is unreachable (`Deck.tsx:65-66`). The copy is honest about WHY and routes to `/library`, and "Your picks here are kept while you go back a stage" is true (state lives in the wizard). But the only exit is commissioning a style, which needs an approved generated proof to lock (`lib/themes.ts:211-214`) — spend, which this journey forbids (DoD 7). The expert dialog has the same gate (`ProjectDialog.tsx:111`). **H1 confirmed**, and it is a `broken-flow` blocker for the free discipline, not just trailer. Note the six presets exist precisely so a first project needs no commission (`CreateWizard.tsx:107-109`) — the intent is there; the tagging defeats it for two of the three disciplines.

*Working tree:* the same stage offers all six presets with an amber chip "written for educational video · fits any" and a sub-line that says a fitted style can be commissioned later and swapped in (`CreateWizard.tsx:243-246`, `stages.tsx:146-148`). Owen reads: these looks were drawn for explainers, they will do for now. Honest, and it unblocks him without spend. The minted theme is untagged (`:186`), so it will also serve his next trailer — a quiet consequence the copy ("fits any discipline") does state.

*Everything from here is walked on the working-tree state, or equivalently on a `free`-fitting locked theme (e.g. one "from a brief" with no `discipline`).*

**Stage 4 — name.** "The Vanishing of Anna Reyes, 1987", logline, runtime 600 s with the hint "Nothing was measured for a free-form video. There is no craft band here; the studio only keeps time" (`stages.tsx:237-238`). Honest. Create & open → `/studio/<id>` (`CreateWizard.tsx:190`). DoD 1 holds.

**Research — ModeChooser.** "any video · research mode — This project claims no craft template, so the studio does not know what its research is. The choice is kept with the project, and you can switch later — neither mode discards the other's work." (`ModeChooser.tsx:35-40`). Two cards: "facts to involve — A topic goes in, a notebook comes out, and you scope what the script may use" / "beats to choose — Candidate beats per part of a spine…" (`:18-29`). Owen's question — *is my episode facts or beats?* — is answered in the studio's mechanics, not his: "notebook" and "spine" are not podcast words. But reversibility is stated up front, which is his first criterion, and the `ModeSwitch` ("switch to beats to choose", title "Nothing you have done here is discarded", `:89-98`) sits above the surface afterwards (`ResearchStep.tsx:125-133`). Criterion 1 passes on the chooser. Where it frays is the lock (finding OW-L1-6).

**Research — guided stage 1, run.** He types the 1987 disappearance, reads "research runs as a local Claude Code process — minutes, not milliseconds… Prototype: the trace is replayed at 8× from run 1 and nothing is executed" (`controls.tsx:148-152`). "run 1" means nothing to him. He presses Research this. The run log fills with "the number — bitcoin all-time high 2025 price history…" (`trace.ts:24`), "4 reversals pre-computed" (`:33`). He CAN infer that this is not his topic — the trace leaks it — but nothing on the surface says so. When it lands: pills "notebook · the argument", "evidence log · N claims", and "Next deals the takes →" (`RunStage.tsx:216-227`). No sentence says "this notebook is a stand-in; it is about Bitcoin, not your topic". On a return visit the compact card prints **his** topic as the heading over Bitcoin's counts — `<h3>{topic}</h3>` then "N facts · N mechanisms · 4 reversals · researched 2026-08-11" (`RunStage.tsx:100-104`). The one honest label, `load saved run`'s title "Loads the real 2026-08-11 Bitcoin notebook…" (`useResearchRun.ts:37-38`), is a tooltip on a control he did not use. DoD 4 ("I could tell what the research was ABOUT before I made decisions") fails on the labelling, not on the content — H2's not-accepted half.

**Research — guided stage 2, the takes.** Two cards: the 😈 hottest take (eyebrow "😈 hottest take", front risk line "speculation about motive — not reporting. Held to a higher bar, not a lower one." `passes.tsx:141,147-149`, rendered `DeckCard.tsx:137-138,226`) and the steel-man with "locked in scope — always travels" (`GuidedResearch.tsx:80-92`). Criterion 4 passes on the front. The tier ("unhinged leap") is behind `details` (`passes.tsx:131-133,158-175`; `DeckCard.tsx:227-254`), and the chip tone for `unhinged` is the same amber as `moderate` (`passes.tsx:83-88`, admitted in the comment).

**Research — guided stage 3, conclusions.** Only `optIn && !hottest` cards (`passes.tsx:46-48`) — conclusions with eyebrow "conclusion" and a state chip. The tier chip is again folded into details. **No reversal is ever dealt.** Owen's job — "get the notebook's reversals as choices" — has no stage. The reversals are in scope by default and only visible in the notebook modal (`ResearchStep.tsx:296-303`) or on the expert board, where the card reads eyebrow "reversal" + title = the obvious reading + detail = why it is wrong (`CardTile.tsx:70-77,97-108`; `cards.ts:103`). On the expert face criterion 3 holds for reversals; on the guided face — the DEFAULT face for a fresh project — it cannot be met because the cards are absent.

**Research — stage 4, review.** ScopeBar / Consequences / ConfirmScope. The wound copy names the turn: "A reversal with no surviving evidence is an assertion. Either restore a card or accept that the script loses that turn." (`ScopeBar.tsx:89`) — good, and the first time the guided face uses the word "reversal" as a thing he owns.

**Script — Candidates.** Route: `discipline==="free"` and `picks.mode==="facts"` → explainer (`ScriptStep.tsx:104-111`); `researched` true from the run → three renders. **H6 confirmed** for `free + facts`; for `free + beats` the route is `TrailerScript` and `researched` comes from `confirm()` (`useBeatPicks.ts:62-75`) — both routes reach a Script surface. Guided duel cards: engine label, title, three arc lines "opens / turns / lands", beats·runtime chip, risk line (`CandidatesDuel.tsx:110-149`). The "turns" line is `chain[Math.floor(chain.length/2)]` — position, not the beat with `kind:"turn"`. Reproduction:

```
reversal-chain len 16 turns→ "escalation"
adjudication   len 8  turns→ "C3 · the treasury flywheel reversed"
derived-short  len 6  turns→ "the reversal"
```

For the Reversal Chain the named turns are "TURN 1…TURN 4" (`renders.ts:37-44`) and the card names none of them; for Adjudication the card says "turns — C3 · the treasury flywheel reversed" while its own depth panel says "turns — n/a for this engine (candidates, not turns)" (`CandidatesDuel.tsx:190-192`). Criterion 5 fails 2/3. The expert `HypothesisColumn` gives a turns COUNT in band (`HypothesisColumn.tsx:79-83`); the names appear only in the expanded `BeatList` (`BeatList.tsx:106`). Also for Owen specifically: the winning engine's craft check is "thesis stated early — pass — 0:40 of 5:00" (`renders.ts:49`) — the explainer contract gives the reveal away at 0:40 by rule. Not a defect (it is the educational engine doing its job), but it means the `free` discipline's promise "no craft template" (`lib/projects.ts:136`) is not what Script delivers: Script measures him against mid-length educational bands ("turns in band (3–5 at mid-length)", `renders.ts:50`) and a 5:00 target, not his 600 s.

**Adoption.** `adopt` writes a record (`ScriptStep.tsx:139-143`), "adopted — the Frames step opens on this chain" (`CandidatesDuel.tsx:152-154`). DoD 5 holds. DoD 6 (return) holds for mode (`research-beats`), topic/researched (`research`), scope (`research-scope`), face, adoption — all IndexedDB per project.

## Scored criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | The free discipline's chooser is reversible and says so | **pass** (with a contract fray) | `ModeChooser.tsx:36-40` says it; `ModeSwitch` `:74-101` does it. Fray: OW-L1-6 |
| 2 | Facts mode on a free project reaches the same notebook path as educational, with the same decisions | **pass** | `ResearchStep.tsx:137` mounts the same `EducationalResearch` as `:96`; same `useEducationalResearch`/`useScope`/face record (`:149-161`) |
| 3 | Reversal cards labelled as reversals; conclusions as leaps with a tier | **fail on the guided (default) face / pass on expert** | guided deals no reversals (`passes.tsx:33-48`); tier chip behind details (`passes.tsx:131-133,158`). Expert: `CardTile.tsx:77` eyebrow "reversal", `:110-121` tier on the front |
| 4 | The hottest take carries its speculation warning on the front | **pass** | `passes.tsx:147-149` → `DeckCard.tsx:137-138,226`; expert `CardTile.tsx:85-92,120` |
| 5 | A candidate script's turn is named on the card | **fail** | positional "turns" line `CandidatesDuel.tsx:112-117`; reproduction above; contradiction with `:190-192` |

Definition of done: 1 pass (conditional on a style) · 2 pass · 3 pass · 4 **fail** (labelling) · 5 pass · 6 pass · 7 **fail** — on a fresh account the only way past the style stage is a generated proof.

## Findings

```json
[
  {
    "id": "OW-L1-1",
    "journey": "compose-from-scratch",
    "character": "owen",
    "cert_level": "L1",
    "type": "broken-flow",
    "severity": "P0",
    "impact": { "frequency": "every free or trailer project on an account with no locked theme (every first-timer)", "reachability": "stage 3 of 4 in the primary create path; the expert dialog has the same gate", "trust_erosion": "high — the wizard promises 'a preset off the shelf' and offers none" },
    "dimension": "reachability",
    "title": "A free (or trailer) project cannot be created on a fresh account at HEAD: every preset is tagged educational, so the style stage is empty and Next/finish are disabled — RESOLVED in the uncommitted working tree by a 'borrowed presets' fallback",
    "expected": "Owen picks Any video → Free form → a preset off the shelf → name → Create & open, spending nothing (DoD 7).",
    "got": "HEAD db77786: styleFits(preset, 'free') is false for all six presets (all `discipline: \"educational\"`), no locked theme exists, so `EmptyStyleDeck` renders; the stage is not `done`, Deck's Next is disabled, stage 4 is unreachable, `finish` returns without `styleId`. The only exit is 'commission one in the library', and a theme locks only with an approved GENERATED proof. The expert dialog requires `themeId` too. `ProjectsView.tsx:89` claims neither path is theme-gated — false for two of three disciplines. WORKING TREE (uncommitted, 2026-09-05): when no preset fits, all six are offered with the chip 'written for educational video · fits any', the stage sub-line explains the borrowing, and the minted theme is untagged so it fits the project. This resolves the blocker for the wizard; the expert dialog (`ProjectDialog.tsx:100-111`) is unchanged and still theme-gated, and `EmptyStyleDeck` is now unreachable for any picked discipline.",
    "evidence": [
      "app/_projects/wizard/CreateWizard.tsx:103-113",
      "app/_projects/wizard/CreateWizard.tsx:146",
      "app/_projects/wizard/CreateWizard.tsx:224",
      "app/_projects/wizard/CreateWizard.tsx:231-232",
      "app/_projects/wizard/stages.tsx:158-177",
      "components/ui/deck/Deck.tsx:65-66",
      "components/ui/deck/Deck.tsx:148",
      "lib/themes.ts:133-134",
      "lib/themes.ts:211-214",
      "app/library/presets.ts:49,66,83,100,117,134",
      "app/_projects/ProjectDialog.tsx:100-111",
      "app/projects/ProjectsView.tsx:89",
      "WORKING TREE: app/_projects/wizard/CreateWizard.tsx:110-127,186,243-246",
      "WORKING TREE: app/_projects/wizard/stages.tsx:136-159"
    ],
    "code_check": "node -e with styleFits verbatim over six {discipline:'educational'} presets → educational 6 · trailer 0 · free 0. Deck.tsx:148 `disabled={!stage.done || busy}`; stage.done = `styleId !== null`. Working tree: `fittingPresets = borrowedPresets ? PRESETS : disciplinePresets` — never empty.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "State which build is under test. On a profile with NO locked theme: HEAD → assert 'No locked style fits any video yet' with Next disabled; working tree → assert six preset cards each chipped 'written for educational video · fits any', create, and assert the minted theme has no `discipline` in IndexedDB. Env precondition: no theme whose `discipline` is undefined or 'free'.",
    "scope_note": "The fix is uncommitted at the time of writing; if it is not committed, this is a P0 blocker for every trailer/free Character."
  },
  {
    "id": "OW-L1-2",
    "journey": "compose-from-scratch",
    "character": "owen",
    "cert_level": "L1",
    "type": "trust-gap",
    "severity": "P1",
    "impact": { "frequency": "every run on every non-Bitcoin project", "reachability": "the first thing the Research step does", "trust_erosion": "high — the notebook is labelled with the user's own topic" },
    "dimension": "honesty",
    "title": "The guided run never says the notebook is a stand-in; on return it prints the typed topic as the notebook's heading over Bitcoin's counts",
    "expected": "Before Owen makes a scope decision, the surface says in one line that the notebook is the 2026-08-11 Bitcoin run and not about his topic (DoD 4). The content itself is an accepted gap; the label is not.",
    "got": "After 'Research this' lands: artifact pills and 'Next deals the takes →' with no stand-in sentence. The LocalProcessNote says 'replayed at 8× from run 1' — 'run 1' is opaque. The compact card on a revisit renders `<h3>{topic}</h3>` (his 1987 disappearance) over '… 4 reversals · researched 2026-08-11'. The only explicit 'Bitcoin' label is the tooltip on `load saved run`, a control he did not press, and the notebook modal's hard-coded title. The trace rows leak 'bitcoin' in their detail text, which is how a careful reader finds out.",
    "evidence": [
      "app/_phases/research/guided/RunStage.tsx:100-104",
      "app/_phases/research/guided/RunStage.tsx:216-227",
      "app/_phases/research/run/controls.tsx:148-152",
      "app/_phases/research/run/useResearchRun.ts:37-38",
      "app/_phases/research/run/trace.ts:24-38",
      "app/_phases/research/guided/useEducationalResearch.ts:43-50",
      "app/_phases/research/ResearchStep.tsx:299"
    ],
    "code_check": "grep -n 'Bitcoin\\|stand-in' app/_phases/research/guided/*.tsx → only RunStage.tsx:234 ('or load the saved Bitcoin run'), shown in the idle state before a run, never after one.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Create a free+facts project, type a non-Bitcoin topic, run, leave the step, return: assert the compact card heading equals the typed topic and no visible text on the stage says the notebook is the Bitcoin stand-in. Env: any locked theme that fits free (see OW-L1-1).",
    "mock_bound": false,
    "scope_note": "The Bitcoin content is the accepted 'one notebook for every project' gap; this finding is only about the label a Character reads before deciding."
  },
  {
    "id": "OW-L1-3",
    "journey": "compose-from-scratch",
    "character": "owen",
    "cert_level": "L1",
    "type": "expressiveness-gap",
    "severity": "P1",
    "impact": { "frequency": "every guided-face research pass (the default face for a fresh project)", "reachability": "stages 2–3 of the guided wizard", "trust_erosion": "medium — the wizard says it deals 'the notebook's decisions as cards' and deals a third of them" },
    "dimension": "completeness",
    "title": "The guided face deals hottest take, steel-man and conclusions only — reversals (and facts, mechanisms) are never dealt as cards, so Owen's job has no stage",
    "expected": "Facts mode gives him the notebook's reversals as choices (Character JTBD). A stage — or a hand inside stage 2/3 — that deals the four `kind: \"reversal\"` cards with eyebrow 'reversal', the obvious reading and why it is wrong, and keep/cut.",
    "got": "`hotTakes`, `steelManOf`, `conclusionChoices` are the only passes; reversal cards exist (`buildCards`, in scope by default) but appear only on the expert board or inside the notebook modal. Stage 1's sub-line 'The stages after this one deal the notebook's decisions as cards' overstates what is dealt. The expert face labels them correctly (eyebrow 'reversal', title = obvious reading, detail = why wrong), so the data and the vocabulary exist; only the guided selection is missing.",
    "evidence": [
      "app/_phases/research/guided/passes.tsx:31-48",
      "app/_phases/research/guided/GuidedResearch.tsx:130-136,146,158-178",
      "app/_phases/_shared/notebook/cards.ts:100-106",
      "app/_phases/research/scope.ts:35-42",
      "app/_phases/research/_parts/CardTile.tsx:42-45,70-77,97-108"
    ],
    "code_check": "grep -n 'reversal' app/_phases/research/guided/*.tsx → passes.tsx:69 (icon case only), RunStage.tsx:103 (a count). No pass filters `kind === 'reversal'`.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "On a researched free+facts project in the guided face, walk stages 2 and 3 and assert no card carries eyebrow 'reversal'; switch to the expert board and assert four do. Env: researched project, `research-mode` unset or 'guided'."
  },
  {
    "id": "OW-L1-4",
    "journey": "compose-from-scratch",
    "character": "owen",
    "cert_level": "L1",
    "type": "legibility",
    "severity": "P2",
    "impact": { "frequency": "every conclusion card in the guided face", "reachability": "guided stages 2–3", "trust_erosion": "low-medium — the tier is one click away, but the decision is on the front" },
    "dimension": "legibility",
    "title": "On the guided face a conclusion's leap tier is folded behind 'details'; the front shows only 'conclusion' + taken/not taken, and 'unhinged' shares moderate's amber",
    "expected": "Conclusions labelled as leaps WITH a tier on the front (criterion 3), as the expert CardTile does.",
    "got": "`specOf` puts the `${leap} leap` chip in `metaChips`, rendered inside the expandable `detail`; the front carries the state chip only. `LEAP_CHIP.unhinged === 'amber' === LEAP_CHIP.moderate` because the deck has no rose chip (the comment concedes it and leans on the risk line, which only the hottest card carries). The hottest take's front IS honest (risk line) — criterion 4 passes — but a far/unhinged non-hottest conclusion looks like a moderate one until opened.",
    "evidence": [
      "app/_phases/research/guided/passes.tsx:78-88",
      "app/_phases/research/guided/passes.tsx:123-133",
      "app/_phases/research/guided/passes.tsx:137-149,158-175",
      "components/ui/deck/DeckCard.tsx:137-138,226-254",
      "app/_phases/research/_parts/CardTile.tsx:110-121",
      "app/_phases/_shared/notebook/conclusions.ts:373-465"
    ],
    "code_check": "conclusions.ts fixture tiers: moderate ×3, far ×2, near ×1, unhinged ×1 (the hottest). So exactly two 'far' conclusions are dealt in stage 3 with no tier on the front.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Guided stage 3: assert the front of each conclusion card has no '… leap' chip until 'details' is opened. Env: researched project, guided face."
  },
  {
    "id": "OW-L1-5",
    "journey": "compose-from-scratch",
    "character": "owen",
    "cert_level": "L1",
    "type": "wrong-claim",
    "severity": "P1",
    "impact": { "frequency": "every Candidates duel card, every project", "reachability": "the first Script surface", "trust_erosion": "high for a narrative user — the card's 'turns' line is the reason he would pick a candidate, and it names a beat by position" },
    "dimension": "correctness",
    "title": "The duel card's 'turns' arc line is the chain's middle beat by index, not a beat of kind 'turn' — it names 'escalation' for the Reversal Chain and a candidate beat for Adjudication, whose own depth panel says 'turns — n/a for this engine'",
    "expected": "A candidate script's turn is named on the card (criterion 5): the beat(s) with `kind: \"turn\"`, e.g. 'TURN 1 · an inflow is not a purchase', or 'no turns — candidates' for Adjudication.",
    "got": "`arc` = opens `chain[0]`, turns `chain[floor(len/2)]`, lands `chain[len-1]`. Reproduced over the shipped chains: reversal-chain (16) → 'escalation'; adjudication (8) → 'C3 · the treasury flywheel reversed' (kind 'candidate', while the same card's depth prints 'turns — n/a for this engine (candidates, not turns)'); derived-short (6) → 'the reversal' by coincidence. The chain data carries `kind: \"turn\"` on every real turn and BeatList colours it, so the honest answer is one filter away. The expert column shows only a turn COUNT until expanded.",
    "evidence": [
      "app/_phases/script/candidates/CandidatesDuel.tsx:108-118",
      "app/_phases/script/candidates/CandidatesDuel.tsx:181-193",
      "app/_phases/script/renders.ts:36-45,88-96,137-143",
      "app/_phases/script/_parts/BeatList.tsx:103-115",
      "app/_phases/script/_parts/HypothesisColumn.tsx:79-90"
    ],
    "code_check": "node -e over the three fixture label arrays with Math.floor(len/2): 'escalation' · 'C3 · the treasury flywheel reversed' · 'the reversal'.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Open Script → Candidates (guided duel) on any researched project and read the 'turns' line of the Adjudication card; assert it names 'C3 …' and that expanding the card prints 'turns — n/a for this engine'. Env: any researched project (seed-why-bitcoin suffices)."
  },
  {
    "id": "OW-L1-6",
    "journey": "compose-from-scratch",
    "character": "owen",
    "cert_level": "L1",
    "type": "contract-gap",
    "severity": "P2",
    "impact": { "frequency": "free projects that change their mind after composing or after adopting", "reachability": "one button above the research surface", "trust_erosion": "medium — the lock's own copy names a hazard that reopening does not remove" },
    "dimension": "consistency",
    "title": "The ModeSwitch lock is lifted by 'reopen' but `researched` stays true, so the state the lock exists to prevent is reachable anyway; and facts→beats is never locked, even after a candidate is adopted",
    "expected": "'You can switch later — neither mode discards the other's work' holds in both directions with the same rule, and the lock copy ('reopen the composed spine first — composing it marked this project researched, and Script reads that') is a sufficient instruction.",
    "got": "(a) beats→facts is `locked` only while `beats.confirmed`; `reopen()` sets `confirmed` null and deliberately does not flip `researched` (comment: Script keeps reading the last spine). After reopen the switch is enabled; switching mounts `EducationalResearch`, whose hydrate sees `saved.researched` and calls `run.load()` → a finished Bitcoin notebook the project never ran, exactly the outcome the lock comment describes. (b) facts→beats is never locked: after a run, confirmed scope and an adopted candidate, one click re-routes Script to `TrailerScript` ('no spine composed for this project yet') while the adoption record sits on disk unseen. Records are kept; what the Script step shows is not.",
    "evidence": [
      "app/_phases/research/ResearchStep.tsx:125-133",
      "app/_phases/research/beats/ModeChooser.tsx:65-98",
      "app/_phases/research/beats/useBeatPicks.ts:60-81",
      "app/_phases/research/guided/useEducationalResearch.ts:42-51",
      "app/_phases/research/run/useResearchRun.ts:202-205",
      "app/_phases/script/ScriptStep.tsx:104-111",
      "app/_phases/script/trailer/TrailerScript.tsx:42-46"
    ],
    "code_check": "grep -n 'researched' app/_phases/research/beats/useBeatPicks.ts → written true at :73, never written false; grep 'locked=' app/_phases/research/ResearchStep.tsx → one site, keyed on `beats.confirmed` only.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "(a) free → beats → pick every slot → compose → reopen → switch to facts: assert the run stage opens 'a notebook exists' without a run. (b) free → facts → run → adopt a candidate → switch to beats → Script: assert 'no spine composed' and no trace of the adoption. Env: a free-fitting locked theme."
  },
  {
    "id": "OW-L1-7",
    "journey": "compose-from-scratch",
    "character": "owen",
    "cert_level": "L1",
    "type": "contract-gap",
    "severity": "P2",
    "impact": { "frequency": "every free project that reaches Script in facts mode", "reachability": "Script → Candidates", "trust_erosion": "medium — the discipline card promised no craft band; Script grades him on one" },
    "dimension": "consistency",
    "title": "The free discipline promises 'no craft template — the studio only keeps time', but the explainer half measures the free project against mid-length educational bands and a fixture 5:00 target, ignoring its 600 s runtime",
    "expected": "Either the free project's Script shows candidates against its own runtime and says no band applies, or the discipline card does not promise that.",
    "got": "Owen's `targetS` is never read by the Script step (no reference in renders.ts / gate.ts / CandidatesDuel.tsx). The craft checks print 'turns in band (3–5 at mid-length)' and 'thesis stated early — 0:40 of 5:00'; the Adjudication weakness cites 'a 5:00 target'. The wizard's own hint says 'Nothing was measured for a free-form video. There is no craft band here.' For a true-crime companion the early-thesis rule is the opposite of the job; the surface never says the explainer contract is what a facts-mode free project gets.",
    "evidence": [
      "lib/projects.ts:133-137,227-233",
      "app/_projects/wizard/stages.tsx:237-238",
      "app/_phases/script/renders.ts:48-58,108",
      "app/_phases/script/ScriptStep.tsx:73-78",
      "uat/env.md (script-candidates 3/4 — runtime from the render fixture)"
    ],
    "code_check": "grep -rn 'targetS' app/_phases/script/ → no hit outside trailer/ (the trailer half does read it).",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Free+facts project with runtime 600 s → Script: assert every candidate shows the fixture durations and '5:00' text, and that no line mentions 600 s or 'free form'. Env: a free-fitting locked theme.",
    "mock_bound": true,
    "scope_note": "The band figures are fixture prose; the contract (which band, if any, a free project is measured against) is code and copy, and that is the finding."
  },
  {
    "id": "OW-L1-8",
    "journey": "compose-from-scratch",
    "character": "owen",
    "cert_level": "L1",
    "type": "legibility",
    "severity": "P3",
    "impact": { "frequency": "every free project's first research visit", "reachability": "ModeChooser", "trust_erosion": "low" },
    "dimension": "vocabulary",
    "title": "The ModeChooser explains the two modes in the studio's mechanics ('a notebook comes out', 'a spine'), not in the creator's terms",
    "expected": "'The ModeChooser explains both modes in his terms' — e.g. facts: 'you have sourced material and want it as decisions'; beats: 'you have a structure and want to pick what fills each part'.",
    "got": "'facts to involve — A topic goes in, a notebook comes out, and you scope what the script may use.' / 'beats to choose — Candidate beats per part of a spine; you pick one each, and Script opens on the spine.' Both are accurate; neither tells a podcaster which one an episode is. Reversibility copy is good and the switch exists, so the cost of a wrong first guess is low (criterion 1 passes).",
    "evidence": [
      "app/_phases/research/beats/ModeChooser.tsx:18-29,35-40"
    ],
    "code_check": "n/a — copy.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Low; read the chooser aloud to a non-studio user in L2 only if time allows. Env: a free project with no stored mode."
  },
  {
    "id": "OW-L1-9",
    "journey": "compose-from-scratch",
    "character": "owen",
    "cert_level": "L1",
    "type": "strength",
    "severity": "P3",
    "impact": { "frequency": "every free project", "reachability": "ModeChooser and the switch above it", "trust_erosion": "none — builds trust" },
    "dimension": "reversibility",
    "title": "The chooser says it is reversible and it is: ModeSwitch sits above the chosen surface, the mode lives in its own record, topic and picks survive a switch",
    "expected": "Criterion 1.",
    "got": "'you can switch later — neither mode discards the other's work'; `switch to <other>` with title 'Nothing you have done here is discarded'; mode under `research-beats`, topic under `research`, scope under `research-scope` — separate records, and `confirm()` re-reads the topic so a facts→beats→compose keeps it.",
    "evidence": [
      "app/_phases/research/beats/ModeChooser.tsx:36-40,74-101",
      "app/_phases/research/ResearchStep.tsx:122-133",
      "app/_phases/research/beats/useBeatPicks.ts:24-30,68-74",
      "app/_phases/_shared/stepStore.ts:37-70"
    ],
    "code_check": "three phase keys, three writers, no shared field.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Covered by OW-L1-6's live check."
  },
  {
    "id": "OW-L1-10",
    "journey": "compose-from-scratch",
    "character": "owen",
    "cert_level": "L1",
    "type": "strength",
    "severity": "P3",
    "impact": { "frequency": "every free+facts project", "reachability": "Script", "trust_erosion": "none" },
    "dimension": "reachability",
    "title": "H6 holds: free+facts reaches the Candidates tab and free+beats reaches the trailer script — both routes end on a Script surface, gated by a `researched` flag each mode's own surface writes",
    "expected": "Both routes reach Script.",
    "got": "Route: `discipline==='free' && picks.mode==='beats'` → trailer half, else explainer. Explainer gates on `research.researched`, written true by the run (`useEducationalResearch` on `ready`); the trailer half opens on `confirmed`, which `confirm()` writes alongside `researched: true`. Before a run the explainer says 'no notebook for this project yet … Run Step 1', which is the right sentence. Facts-mode research is the SAME component the educational discipline mounts (criterion 2).",
    "evidence": [
      "app/_phases/script/ScriptStep.tsx:96-127,161-166,194-205",
      "app/_phases/research/guided/useEducationalResearch.ts:48-51",
      "app/_phases/research/beats/useBeatPicks.ts:62-75",
      "app/_phases/research/ResearchStep.tsx:96,137"
    ],
    "code_check": "traced; both writers and the one reader cited.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "free+facts → run → Script: assert `view-candidates` renders three duel cards. Env: a free-fitting locked theme."
  }
]
```

## Verdict

**L1-conditional** — on the working tree. At HEAD `db77786` it is **L1-fail**: the FACTS branch is unreachable for its own Character on a fresh account (OW-L1-1: the style stage has nothing that fits `free`, and the only exit is a generated proof the journey forbids). The uncommitted borrowed-presets fallback opens the stage; from there reachability and reversibility hold (OW-L1-9, OW-L1-10), but the default research face never deals the reversals Owen came for (OW-L1-3), the stand-in notebook is labelled with his topic (OW-L1-2), and the candidate card names its turn by position (OW-L1-5). Conditions to clear: commit OW-L1-1's fix; resolve OW-L1-3 and OW-L1-5; label the stand-in (OW-L1-2).

grounding: research-run 0/5 · script-candidates 3/4

time-saved-if-it-all-worked: ~0 min today (a stand-in notebook is a demo, not a saving — Character's own rule); ~2 h of the 3 h manual outline if it ran on his material with the reversals dealt and the turn named · confidence low

## First-person review (L1, designed experience)

I got two cards in. "Any video" is honest about what you have not measured, and I will take honest over flattering. Then the studio asked which visual identity my true-crime companion renders in. On the build that is checked in it had nothing on the shelf that "fits any video" — six presets, all filed under educational — and the way out was to go commission a style, which means generating pictures, which is the one thing I told myself I would not do this afternoon. Somebody fixed that while I was reading: the same shelf now hands me the six explainer looks with a chip that says they were written for explainers and will do for anything. Fine. I would rather be told that than be sent away. But it is not committed yet, and until it is, my afternoon ends at stage three.

Say I have a style. The chooser is the best thing on the path: it tells me up front that I can change my mind and there is a button that proves it. I do not love "facts to involve" as a description of an episode I spent three weeks sourcing, but I understood it. What I did not get is the thing I came for. The wizard says it will deal the notebook's decisions as cards and it deals the hot take, the steel-man and the conclusions. The reversals — the "everyone thought X; the record shows Y" cards, the four things I would build an episode around — are not on the table. They exist; I can find them on the expert board, correctly labelled, with the obvious reading on top and why it is wrong under it, which is exactly how I think. But that is the face the studio hides from a first-timer.

And when I typed the 1987 disappearance and pressed Research this, the log talked about Bitcoin and the finished notebook was headed with my title. I know it is a prototype; the small print says so. The heading does not. If I had made scope decisions against that card without reading the trace I would have been scoping someone else's story under my name.

Script: three candidates, a "turns" line on each, and it names the middle beat. On one card that is "escalation"; on another it is a candidate beat on an engine that, by its own admission one click down, has no turns. For someone whose whole job is where the turn sits, that line is the one I would have chosen by, and it is a coin flip. The hottest take is labelled speculation on the front — good, that is my senior bar — but the other far leaps look like moderate ones until I open them.

Would I tell a peer? Not yet. I would tell them the chooser is reversible and the expert board is the real product. Worth the wait? On my material, with the reversals dealt and the actual turn named, yes — that is most of my three hours. Today it is a demo I could not start.

## First-person review (L2, live experience)

L2 verdict: **L2-conditional** — I could start, the chooser was reversible, the notebook was named a stand-in before I typed; the reversals I came for are still not dealt to a first-timer.

I finished, on my own account: `presets=6 borrowed=true`, a newsprint look I was told was written for explainers, then "The 1987 disappearance" over a chooser that said it was reversible. Facts mode mounted the same research a teacher gets. The topic field was empty and the stand-in was disclosed before the run; afterwards the note said `not research on "The 1987 disappearance"`. Nobody scopes someone else's story under my name now.

The candidate cards changed while I walked: the Adjudication card no longer invents a "turns" line, and the Reversal Chain names `TURN 1 · an inflow is not a purchase`. For a man who chooses by where the turn sits, that is the fix. The Script note also said my 600 s free-form clock was not read — honest, though it still measures me against explainer bands.

Still missing: the guided face dealt me the hot take, the steel-man and the conclusions; the four "everyone thought X" cards are still one face away. After adopting, the facts→beats switch was `disabled=false` — never locked — so the state the lock exists to prevent is still reachable. Would I tell a peer? "You can start today and it tells you the truth about what you are looking at. The reversals are on the expert board; go straight there."
