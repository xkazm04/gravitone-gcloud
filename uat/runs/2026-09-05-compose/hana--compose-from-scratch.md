# Hana (kids' STEM channel) — compose-from-scratch · L1 (theoretical, code-grounded)

Run `2026-09-05-compose` · Character `hana-kids-stem` (`HA`) · Scenario **S1**: educational →
mid-educational-video → runtime OVERRIDE to **240 s** at the name stage → preset style → guided
Research (takes · conclusions · review) → guided Script duel + beats modal + Coverage. Never Frames.

Motivation (verbatim): *The manual way: research, simplify, draft, partner review — ~4 hours per
video. She will adopt a tool that gets her a sourced, speculation-free beat outline in under 40
minutes.*

Senior bar (verbatim): *A senior children's science educator refuses any claim that is false-when-
simplified and any speculation presented at the same weight as fact. The scope must let her exclude
every conclusion and the script must honour that exclusion visibly.*

---

## Surface model

### Reachable set (S1, follow-the-imports)

| Stage | Surface | Route condition | Evidence |
|---|---|---|---|
| Create | `app/projects/new/page.tsx` → `app/_projects/wizard/CreateWizard.tsx` | none | `CreateWizard.tsx:214-289` four stages |
| Create · style | `stages.tsx#presetCards` (all 6 presets tagged educational) | `styleFits(p,"educational")` → non-empty | `CreateWizard.tsx:122-127,255-263` — H1's `EmptyStyleDeck` is NOT hit for educational (and since the 2026-09-05 borrowed-presets change, not for anyone) |
| Create · name | `stages.tsx#NameStage` — title, logline, `NumberInput` min 5 max 900 | discipline && template | `stages.tsx:186-258` |
| Finish | `finish()` mints the preset into a locked theme, then `create({... targetS ...})`, `router.push('/studio/<id>')` | title.trim() | `CreateWizard.tsx:163-212`; record shape `lib/projects.ts:339-355` (`targetS: draft.targetS`) |
| Studio header | `StudioView.tsx:203-207` pill: `DISCIPLINE_LABEL · templateOf(template).label · {project.targetS}s` | door open | — |
| Research | `ResearchStep.tsx:96` educational → `EducationalResearch` → default face **guided** while no decisions (`:170-181`) | discipline === educational | `guided/GuidedResearch.tsx:141-200` four stages |
| Research · run | `guided/RunStage.tsx` — `TopicField`, `OutcomePicker`, `LocalProcessNote`, `RunTrace` | — | `RunStage.tsx:125-237` |
| Research · takes | `passes.tsx#hotTakes` (1 card: `c-reserve-was-the-product`) + `steelManOf` (required, no pick target) | `ready` | `GuidedResearch.tsx:66-106,158-169` |
| Research · conclusions | `passes.tsx#conclusionChoices` = optIn && !hottest → 6 cards | `ready` | `:171-178` |
| Research · review | `ScopeBar`, `Consequences`, `ConfirmScope` (reused) | `ready` | `:179-199`; `_parts/ScopeBar.tsx`, `_parts/ScopeGate.tsx` |
| Script | `ScriptStep.tsx:104-111` → `ExplainerScript`; gate `researched` from the `research` step record (`:161-167,197-205`) | `saved.researched` — written by `useEducationalResearch.ts:48-51` when the run lands | — |
| Script · duel | `candidates/CandidatesDuel.tsx` (guided default via `useScriptFace`) | face guided | `ScriptStep.tsx:302-311` |
| Script · beats modal | `ScriptStep.tsx:352-368` → `_parts/BeatList.tsx` | `expanded` set by `onReadBeats` | `CandidatesDuel.tsx:234-243` — the button exists only when `open` (after "read more") |
| Script · Coverage | `_matrix/MatrixCoverage.tsx` rows read `stateOf(api.scope, card.id)` | tab | `MatrixCoverage.tsx:134-147`; pip `_matrix/shared.tsx:46-73` |

Not reachable / not in S1: trailer/free branches, `EmptyStyleDeck` (note: the wizard changed on disk mid-walk — `CreateWizard.tsx:111-127` now borrows every preset when none fits a discipline, so H1 is closed at source; irrelevant to S1), expert faces (only via the switch), recalibration (optional).

### Grounding audit (against `env.md`'s shared denominator)

- **research-run — 0/5.** `run/trace.ts:24,28` step details are Bitcoin literals ("bitcoin all-time high 2025…", "Strategic Bitcoin Reserve signed…"); `useEducationalResearch.ts:43` seeds the topic field with `NOTEBOOK.topic`; the run lands on `NOTEBOOK` whatever she types. Reads none of: topic, logline, template, **runtime**, prior notebooks.
- **script-candidates — 3/4.** Reads scope (`ScriptStep.tsx:147`, `MatrixCoverage.tsx:134`), template band (`renders.ts` `template: "mid-educational-video"`, `turnBand`), notebook (`ScriptStep.tsx:221-227`). **Runtime is the render fixture's** (`renders.ts:17,76,123` — 300 / 250 / 45 s; `CandidatesDuel.tsx:144,202` `mmss(r.durationS)`; `MatrixSpend.tsx:82` `of secs(RENDER_BY_ID[r.id].durationS)`).
- beat-board: not met (educational).

### Wiring audit (one grep per suspected-unread value)

- `grep -rn targetS app/_phases/script` → **0 hits**. `grep -rn targetS app lib` → readers are `StudioView.tsx:206` (header pill), `ProjectsMatrix.tsx:161` (shelf `fmtDur`), `frames/useFrames.ts:244-248,578` (Frames — out of scope), `api/frames/route.ts:168` (`compileFormatBrief`). **No Research or Script surface reads the project runtime.** `lib/formatBrief.ts:5` says it out loud: "Both were display-only — a label on the studio header".
- `grep -rn reportPhase app lib` → the only caller is `frames/useFrames.ts:724`. Research and Script never report; `progress.research` / `progress.script` stay `empty` → Stepper badge "not started" (`Stepper.tsx:26,56`) and the shelf's cells hollow (`ProjectsMatrix.tsx:46-51`) for the whole of this journey. H4 confirmed.
- `stateOf` default for every conclusion is `OPT_IN_DEFAULT = {descoped:true}` (`scope.ts:37-46`); `scopeSummary` counts them as `notTaken`, not `descoped` (`scope.ts:113-115`). H-independent, confirmed.
- `gate.ts:326-345 checkConclusions(r, CONCLUSIONS)` — called from `ScriptStep.tsx:192` with **all** `CONCLUSIONS`, never with the scope. A conclusion whose claim reaches a render is judged on naming/falsifier rules only; **whether the creator took it is not an input to the gate.**
- `requiredWhy` origin: `_shared/notebook/cards.ts:118-125` — one hard-coded string on the synthetic `steel-man` card: *"The steel-man is mandatory (NOTEBOOK-SCHEMA §steel_man). Without it the script can only produce a polemic, and Engine D cannot be run honestly at all."* (150 chars). Consumers: `GuidedResearch.tsx:86` (card footnote), `ScopeBar.tsx:51` (blocked notice — unreachable, the card has no pick target), `shared.tsx:57` (pip title).
- `splitTitle` on the hottest take (reproduced with `node -e`): head = *"The Strategic Bitcoin Reserve was never meant to be built"*, rest = *"Announcing it \*was\* the product — a way to put a floor under an asset your donors hold…"* → the motive half of the claim is behind the `details` toggle (`passes.tsx:98-110,150-153`; `DeckCard.tsx:227-257`).
- Coverage footnote (`shared.tsx:84-91`): all 7 conclusions are in no render — "reasoned after these 3 scripts were written". So the not-taken hottest take shows a row of zeros for a reason unrelated to her decision.

### Expressiveness notes

- `Conclusion.withheld` (`conclusions.ts:174`) is admitted by the type; no fixture row sets it, so the "renders as the withholding" state is unreachable and the wizard's `conclusionChoices` would deal a withheld card as a normal choice (`passes.tsx:46-48` filters only `optIn && !hottest`). Not Hana's path today; noted for the drain.

---

## Walkthrough (cognitive walkthrough, in order)

### 1 · `/projects/new` — discipline
Cards: "Educational video — an argument explained well — the craft library measured these" (`lib/projects.ts:127,134`). *Will she know what to do?* Yes — "educational" is her word. "Argument" is slightly adult for a kids' explainer but not blocking. *Feedback:* rail summary "Educational video" (`Deck.tsx:104-106`).

### 2 · template
"Mid-length educational — 3–6 min — the shortest length that holds a full argument", chips `180–360s measured` · `target 300s` (`stages.tsx:86-88`, `lib/projects.ts:157-163`). Stage sub promises: *"you can take ownership of the number at the last stage"* (`CreateWizard.tsx:233`). Good — the override is advertised before she reaches it. `pickTemplate` seeds `targetS=300` (`:157-161`).

### 3 · style
All six presets fit (`presets.ts` all `educational`), each footnoted *"locks as this project's style when you create"* (`stages.tsx:157`). She picks one. H1 does not apply to her.

### 4 · name & clock
Title required only (`:269-270`). Runtime field: hint *"Mid-length educational was measured at 180–360s. Past that band the craft rules stop applying."* (`stages.tsx:244`); she types **240** → `onDuration` latches `ownDuration` (`CreateWizard.tsx:282-285`), in band. Placeholders are Glass Harbor heist copy (`stages.tsx:215,230`) — off-world for her but harmless. Finish → `create({targetS:240})` → studio.

### 5 · studio header
Pill reads `EDUCATIONAL VIDEO · MID-LENGTH EDUCATIONAL · 240S` (`StudioView.tsx:205-206`) beside `prototype · mocked data`. **Criterion 5 holds.** Headline is her title (`:183-185`). Stepper: 1 Research (parked, `newProject` → `phase:"research"`).

### 6 · Research · run (guided by default)
Headline "What should the research investigate?". Topic field is **pre-filled with the Bitcoin topic** (`useEducationalResearch.ts:43` `saved?.topic ?? NOTEBOOK.topic`) — she must delete it before typing "Why do leaves change colour in autumn?". Under the button, `LocalProcessNote` (`controls.tsx:147-153`): *"Prototype: the trace is replayed at 8× from run 1 and nothing is executed."* — honest that nothing runs, silent that **her topic is not read**. Idle notice: *"Run the research, or load the saved Bitcoin run"* (`RunStage.tsx:232-236`) — reads as two different outcomes; they are one. She clicks "Research this"; the trace prints Bitcoin searches (`trace.ts:24-28`) under her leaves topic; it lands `done`; pills "notebook · the argument", "evidence log · N claims"; "Next deals the takes →". If she leaves and returns, the compact card sets **her topic as the `<h3>`** over Bitcoin counts (`RunStage.tsx:100-104`). *Can she tell the material is a stand-in before deciding?* Only by inference from the trace text; no sentence says "this notebook is not about your topic". (Accepted gap covers the CONTENT; the surface honesty is the finding — see HA-L1-3.)

### 7 · Research · the takes
Sub: *"The steel-man always travels — the library forbids cutting it, so it has no pick target. The hottest take is yours: picking the card takes it into the script, picking again puts it back."* (`GuidedResearch.tsx:162`). Two cards:
- **😈 hottest take** — eyebrow `😈 hottest take`, chip **`not taken`** (neutral) by default (`passes.tsx:125-129,141`), amber risk line *"speculation about motive — not reporting. Held to a higher bar, not a lower one."* on the front (`:147-149`), rose/violet wash. Front title is the tame first sentence; the motive clause and `unhinged leap` chip are behind `details`. **Criteria 1 and 2 (first half) hold: leaving it out is zero gestures** and the rail summary says `hottest not taken` (`:167`).
- **steel-man** — chip `locked in scope — always travels`, footnote = `requiredWhy` (`:85-86`), rendered `text-white/30` (`DeckCard.tsx:140-141`). *Is the explanation there?* Yes. *Is it hers?* "NOTEBOOK-SCHEMA §steel_man" and "Engine D" are the pipeline's names for things she has never seen; "polemic" is the one word doing the work. **Criterion 3: present, but not in her vocabulary and at the lowest contrast on the card** (`Field.tsx:121-124` measures `/35` at 3.2:1; this is `/30`).

### 8 · Research · conclusions
Sub states the default rule plainly (`:174`): *"every one starts OUT of scope… an unpicked card simply stays not taken."* Six cards with leap chips (`near`/`moderate`/`far`) in details. She takes none. Summary `0/6 taken`. **Criterion 1 fully holds.**

### 9 · Research · review
`ScopeBar`: `in scope 30/37 · descoped 0 · not taken 7 · …` (`ScopeBar.tsx:12-24`, counts from `scopeSummary`). `Consequences`: *"Nothing descoped. The script will be written against the full notebook, minus the 7 conclusions you have not taken."* (`:56-64`). `ConfirmScope`: *"30 of 37 cards will go to the Script step."* — she confirms. Note the copy at `ScopeGate.tsx:35` counts a checkpoint, not a gate: Script reads the live scope (`ScopeGate.tsx:10-23`). Fine for her.

### 10 · Script · candidates (guided duel)
Gate passes because `researched` was written when the run landed (`useEducationalResearch.ts:50`). Three cards: Reversal Chain `16 beats · 5:00`, Adjudication `· 4:10`, Derived Short `· 0:45` (`CandidatesDuel.tsx:143-145`). **Nothing says 240 s.** The Spend bar says `of 5:00` per render (`MatrixSpend.tsx:82`). Her project header says 240 s one scroll up; no surface reconciles them, and the template card told her the runtime "sets" the craft measurement. **Criterion 5 second half ("or the mismatch is stated") fails.** To read beats: "read more" → "read the beats" (`:223-243`) → modal `Reversal Chain · full beat chain`, footer `16 beats · 947 words`, `BeatList` rows with `at`, connector chip, label, device, full `text` (`BeatList.tsx:88-141`). **Criterion 4 holds** (two gestures, text is the only thing on the row). Adopt = whole-card press; `adopted — the Frames step opens on this chain` (`:151-155`).

### 11 · Script · Coverage
Row for `c-reserve-was-the-product`: pip `—` amber, `aria-label "… is out of scope"`, title *"Out of scope. Click to bring it back."* (`shared.tsx:55-71`), row tinted amber (`MatrixCoverage.tsx:142`), three `unused` cells. Footnote: *"7 of 37 cards are in no render — including all 7 conclusions, which were reasoned after these 3 scripts were written."* **Criterion 2 second half: reflected — but the vocabulary drops from "not taken" (Research) to "out of scope" (Coverage), and the zeros are the fixture's, not her decision's.** If a render DID speak the hottest take, nothing in Coverage or the gate would mark it as a scope breach (`gate.ts:332-345`).

### 12 · Return visit / shelf
`parkAt` bookmarks the rail (`StudioView.tsx:153-176`); scope, adoption, research record persist via `stepStore`. Shelf row: research/script cells hollow, `fmtDur(240)` correct. Stepper badges: Research and Script "not started" after both are done (H4).

---

## Scored criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Conclusions default to not-taken and the wizard says so | **pass** | `scope.ts:37-46` default; `GuidedResearch.tsx:162,174` copy; chip `not taken` `passes.tsx:128` |
| 2 | Leaving the hottest take out is one gesture and is reflected in Coverage | **pass (conditional)** | 0 gestures; `MatrixCoverage.tsx:134-147` + `shared.tsx:55-71` reflect it as "out of scope"; exclusion not enforced by the gate (`gate.ts:326-345`) and only trivially honoured by the fixture (`shared.tsx:84-91`) |
| 3 | The steel-man's "always travels" is explained on the card | **pass (weak)** | `GuidedResearch.tsx:85-86`; text `cards.ts:123-125` is pipeline jargon at `/30` contrast (`DeckCard.tsx:141`) |
| 4 | Beat text is readable in the beats modal before adoption | **pass** | `CandidatesDuel.tsx:234-243` → `ScriptStep.tsx:352-368` → `BeatList.tsx:130-136`; two gestures, adoption independent |
| 5 | Her runtime override (240 s) survives to the studio header | **pass / fail** | header `StudioView.tsx:206` ✓; no Script surface reads it (`grep targetS app/_phases/script` = 0) and the 5:00/4:10/0:45 candidates never state the mismatch ✗ |

---

## Findings

```json
[
  {
    "id": "HA-L1-1",
    "journey": "compose-from-scratch",
    "character": "hana-kids-stem",
    "cert_level": "L1",
    "type": "contract",
    "severity": "P1",
    "impact": { "frequency": "every educational project with an owned runtime", "reachability": "direct — Script candidates tab, first tab shown", "trust_erosion": "high — the wizard says the number is hers, the header repeats it, the script ignores it silently" },
    "dimension": "wiring · runtime",
    "title": "The 240 s she took ownership of reaches the studio header and nothing else — Script shows 5:00 / 4:10 / 0:45 and never states the mismatch",
    "expected": "Either the candidates and the Spend bar are measured against the project's targetS, or a line says 'these renders were cut for 5:00; your project is 240 s' (Character: 'respected or the mismatch is stated').",
    "got": "`targetS` has zero readers under app/_phases/script. CandidatesDuel prints `mmss(r.durationS)` from the render fixture; MatrixSpend prints `of secs(RENDER_BY_ID[r.id].durationS)`; the wizard's template stage promised 'you can take ownership of the number' and the name stage's hint ties the band to craft rules that then read the fixture's 300 s.",
    "evidence": ["app/_projects/wizard/CreateWizard.tsx:233", "app/_projects/wizard/CreateWizard.tsx:282-285", "app/_projects/wizard/stages.tsx:236-255", "app/studio/[projectId]/StudioView.tsx:206", "app/_phases/script/candidates/CandidatesDuel.tsx:144", "app/_phases/script/candidates/CandidatesDuel.tsx:202", "app/_phases/script/_matrix/MatrixSpend.tsx:82", "app/_phases/script/renders.ts:17,76,123", "lib/formatBrief.ts:5"],
    "code_check": "grep -rn targetS app/_phases/script → 0 hits; grep -rn targetS app lib → StudioView, ProjectsMatrix, frames/useFrames, api/frames only",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Create an educational project with runtime 240 in the wizard; assert header pill ends '240s' AND that the Script candidates tab contains no '240' / '4:00' and no mismatch sentence. Precondition: fresh profile, dev-auth banner present.",
    "mock_bound": false,
    "scope_note": "env.md already scores script-candidates 3/4 for this reason; the finding is that the SURFACE does not say so, which is the part accepted-gaps.md conditions acceptance on."
  },
  {
    "id": "HA-L1-2",
    "journey": "compose-from-scratch",
    "character": "hana-kids-stem",
    "cert_level": "L1",
    "type": "trust",
    "severity": "P1",
    "impact": { "frequency": "every candidate a real model returns that quotes a conclusion", "reachability": "latent today (fixture renders quote no conclusion), immediate once renders are generated", "trust_erosion": "high — her senior bar is 'the script must honour that exclusion visibly' and nothing checks it" },
    "dimension": "expressiveness · scope enforcement",
    "title": "Not-taking the hottest take is never checked against the script: the conclusions gate reads all CONCLUSIONS, not the scope, and Coverage would show a spoken not-taken conclusion as ordinary seconds",
    "expected": "A render whose text reaches a conclusion the creator has not taken is flagged — in the gate as a scope violation and in Coverage as a breach on that row — so leaving speculation out is enforced, not assumed.",
    "got": "`gateChains(chains, { conclusions: CONCLUSIONS })` passes every conclusion; `checkConclusions` tests only naming/falsifier rules on any conclusion whose first 28 chars appear in the render. MatrixCoverage's Row reads `descoped` for a tint and a pip only; a `spoken` cell on a not-taken row renders exactly like any other. Today the exclusion 'holds' only because the fixture footnote admits all 7 conclusions are in no render.",
    "evidence": ["app/_phases/script/ScriptStep.tsx:192", "app/_phases/script/gate.ts:326-345", "app/_phases/script/_matrix/MatrixCoverage.tsx:134-171", "app/_phases/script/_matrix/shared.tsx:84-91", "app/_phases/research/scope.ts:37-46"],
    "code_check": "gate.ts:332 `for (const c of conclusions)` with no `stateOf`/scope import; MatrixCoverage.tsx:153-168 cell class keyed on `u.kind` only",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Not verifiable live on the fixture (no render speaks a conclusion). L2 should confirm the null case: Coverage row for c-reserve-was-the-product shows three '·' cells and the amber pip with title 'Out of scope' while Research's ScopeBar says 'not taken 7'. Precondition: guided research run landed, no conclusion picked.",
    "mock_bound": true,
    "scope_note": "The fixture makes the gap invisible; the wiring is the finding and it is fully visible in code."
  },
  {
    "id": "HA-L1-3",
    "journey": "compose-from-scratch",
    "character": "hana-kids-stem",
    "cert_level": "L1",
    "type": "trust",
    "severity": "P2",
    "impact": { "frequency": "every first run on a new project", "reachability": "direct — stage 1 of the guided wizard", "trust_erosion": "medium-high — her typed question is printed as the heading over a notebook about something else" },
    "dimension": "mock honesty · research run",
    "title": "The run stage never says her topic is not read: the field is pre-filled with the Bitcoin topic, the idle notice offers 'run' and 'load the saved Bitcoin run' as if they differed, and the returned card sets HER topic as the h3 over the Bitcoin counts",
    "expected": "Before she presses 'Research this', one sentence that the prototype will return the stored Bitcoin notebook whatever the topic; and the compact 'a notebook exists' card headed by the notebook's own topic, not hers.",
    "got": "LocalProcessNote says the trace is 'replayed at 8× from run 1 and nothing is executed' — true about the process, silent about the topic. `useEducationalResearch` seeds the field with `NOTEBOOK.topic`; the trace steps are Bitcoin literals; RunStage:100 renders `{topic}` (her string) as the card headline with `NOTEBOOK.researched` beneath it.",
    "evidence": ["app/_phases/research/run/controls.tsx:147-153", "app/_phases/research/guided/RunStage.tsx:100-104", "app/_phases/research/guided/RunStage.tsx:232-236", "app/_phases/research/guided/useEducationalResearch.ts:43", "app/_phases/research/run/trace.ts:24-28", "app/_phases/research/run/useResearchRun.ts:38"],
    "code_check": "RunStage.tsx:100 `<h3 …>{topic}</h3>` where `topic` is the user-edited field; no reference to NOTEBOOK.topic on that card",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Type a non-Bitcoin topic, run, leave the step and return; assert the compact card's h3 equals the typed topic while the notebook modal title is 'notebook · why-bitcoin-price-does-not-rise'. Precondition: guided face (fresh project).",
    "mock_bound": true,
    "scope_note": "Content is the accepted gap; the missing pre-decision disclosure is the interface half the gap is conditioned on."
  },
  {
    "id": "HA-L1-4",
    "journey": "compose-from-scratch",
    "character": "hana-kids-stem",
    "cert_level": "L1",
    "type": "legibility",
    "severity": "P2",
    "impact": { "frequency": "every guided research pass (the takes stage is mandatory)", "reachability": "direct", "trust_erosion": "medium — the one card she cannot remove explains itself in another team's vocabulary, at the faintest weight on the card" },
    "dimension": "copy · steel-man card",
    "title": "The steel-man's 'always travels' reason is on the card, but it is NOTEBOOK-SCHEMA / Engine D jargon rendered as a /30 footnote",
    "expected": "A one-line reason in the creator's terms — e.g. 'the script must argue against itself once, or it is a lecture' — set at a readable weight, since it is the only justification for a card with no choice in it.",
    "got": "`requiredWhy` is one hard-coded string in cards.ts: 'The steel-man is mandatory (NOTEBOOK-SCHEMA §steel_man). Without it the script can only produce a polemic, and Engine D cannot be run honestly at all.' It is passed as `footnote` and DeckCard draws footnotes `text-white/30`; Field.tsx measures /35 at 3.2:1 on the same ground.",
    "evidence": ["app/_phases/_shared/notebook/cards.ts:118-125", "app/_phases/research/guided/GuidedResearch.tsx:85-86", "components/ui/deck/DeckCard.tsx:140-141", "components/ui/Field.tsx:121-124"],
    "code_check": "node -e length of requiredWhy = 150 chars; only consumers: GuidedResearch.tsx:86, ScopeBar.tsx:51 (unreachable — required card has no pick target), _matrix/shared.tsx:57 (pip title)",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Screenshot the takes stage; confirm the footnote text and measure its contrast against the card ground. Precondition: run landed.",
    "mock_bound": false
  },
  {
    "id": "HA-L1-5",
    "journey": "compose-from-scratch",
    "character": "hana-kids-stem",
    "cert_level": "L1",
    "type": "legibility",
    "severity": "P3",
    "impact": { "frequency": "every Coverage read after a guided research pass", "reachability": "direct", "trust_erosion": "low-medium — a word she was taught in Research ('not taken') becomes 'out of scope' / 'descoped' tint in Script" },
    "dimension": "vocabulary · scope states across steps",
    "title": "Research distinguishes 'not taken' from 'descoped'; Coverage's pip and row tint collapse both to 'out of scope'",
    "expected": "The Coverage pip for an opt-in card says 'not taken' (with the same neutral tone the Research chip uses), and the footnote counts 'not taken' separately, so her non-decision is not drawn as a cut.",
    "got": "ScopePip title/aria-label: 'Out of scope…' for every `descoped` state; Row tint keyed on `descoped`; ScopeBar/Consequences in Research say 'not taken 7' and 'minus the 7 conclusions you have not taken'.",
    "evidence": ["app/_phases/script/_matrix/shared.tsx:55-71", "app/_phases/script/_matrix/MatrixCoverage.tsx:134-144", "app/_phases/research/_parts/ScopeBar.tsx:13-17", "app/_phases/research/_parts/ScopeBar.tsx:56-64", "app/_phases/research/scope.ts:85-98"],
    "code_check": "shared.tsx:46-73 has no `card.optIn` branch; scope.ts:113-115 already splits the count the pip ignores",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Hover the pip on row-c-reserve-was-the-product in Coverage; assert title text. Precondition: no conclusion taken.",
    "mock_bound": false
  },
  {
    "id": "HA-L1-6",
    "journey": "compose-from-scratch",
    "character": "hana-kids-stem",
    "cert_level": "L1",
    "type": "progress",
    "severity": "P3",
    "impact": { "frequency": "every project on every return visit", "reachability": "direct — stepper and shelf", "trust_erosion": "medium — a researched, adopted project reads 'not started' on both rails" },
    "dimension": "wiring · reportPhase",
    "title": "Research and Script never report progress: after a landed run and an adopted candidate the Stepper badges and the shelf cells still say 'not started'",
    "expected": "Research reports 'in progress' when a notebook exists and 'needs a call' / 'locked' around confirm; Script reports when a candidate is adopted — so DoD 6 ('the project is where I left it') is visible from the rail and the shelf.",
    "got": "The only `reportPhase` caller is frames/useFrames.ts:724. `parkAt` bookmarks the rail (phase) but by design touches neither `progress` nor `updatedAt`.",
    "evidence": ["lib/projects.ts:533-542", "app/_phases/frames/useFrames.ts:724", "app/studio/[projectId]/StudioView.tsx:153-176", "app/studio/[projectId]/Stepper.tsx:21-27,56", "app/_projects/ProjectsMatrix.tsx:46-51"],
    "code_check": "grep -rn reportPhase app lib → one non-definition caller, in frames",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "After run + adopt, reload /studio/<id>; assert step-research and step-script buttons' title attribute ends '— not started'. Precondition: persistent profile.",
    "mock_bound": false
  },
  {
    "id": "HA-L1-7",
    "journey": "compose-from-scratch",
    "character": "hana-kids-stem",
    "cert_level": "L1",
    "type": "strength",
    "severity": "none",
    "impact": { "frequency": "every guided research pass", "reachability": "direct", "trust_erosion": "negative — this is what earns trust" },
    "dimension": "opt-in default · speculation labelling",
    "title": "Speculation is opt-in by construction and labelled on the front: 'not taken' chip, '😈 hottest take' eyebrow, amber 'speculation about motive — not reporting' risk line, stage copy that names the default as the board's rule",
    "expected": "—",
    "got": "OPT_IN_DEFAULT is the read-time default for every conclusion id; the wizard's takes and conclusions stages both say so in prose; the summary in the rail reads 'hottest not taken' / '0/6 taken'; Consequences restates 'minus the 7 conclusions you have not taken'.",
    "evidence": ["app/_phases/research/scope.ts:37-46", "app/_phases/research/guided/passes.tsx:125-149", "app/_phases/research/guided/GuidedResearch.tsx:162-176", "app/_phases/research/_parts/ScopeBar.tsx:56-64"],
    "code_check": "stateOf({}, 'c-reserve-was-the-product') → {descoped:true}",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Assert deck-card-c-reserve-was-the-product shows chip 'not taken' and the risk line on first deal.",
    "mock_bound": false
  },
  {
    "id": "HA-L1-8",
    "journey": "compose-from-scratch",
    "character": "hana-kids-stem",
    "cert_level": "L1",
    "type": "strength",
    "severity": "none",
    "impact": { "frequency": "every create", "reachability": "direct", "trust_erosion": "negative" },
    "dimension": "wizard · runtime ownership",
    "title": "The runtime override is advertised at the template stage, latched on first edit, and never overwritten by a later template change; the header pill shows the exact number she typed",
    "expected": "—",
    "got": "`ownDuration` latch; template stage sub; band hint under the field; `create({targetS})`; StudioView pill.",
    "evidence": ["app/_projects/wizard/CreateWizard.tsx:97-100,157-161,282-285", "app/_projects/wizard/stages.tsx:236-255", "app/studio/[projectId]/StudioView.tsx:203-207"],
    "code_check": "pickTemplate: `if (next && !ownDuration) setTargetS(...)`",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Set 240, go Back, re-pick the template, Next; assert the field still reads 240 and the header pill ends '240s'.",
    "mock_bound": false
  }
]
```

---

## Verdict

**L1-conditional** — the scope half of her job is designed exactly the way she wants it (opt-in, labelled, one-gesture-or-fewer), but the script half does not honour two of her three promises: the runtime she owns is not read past the header and the mismatch is unstated (HA-L1-1), and the exclusion of speculation is assumed rather than enforced (HA-L1-2).

grounding: research-run 0/5 · script-candidates 3/4

time-saved-if-it-all-worked: ~150 min of her ~240 (research + speculation triage + beat outline; the partner's age-fit review and the reading-level rewrite remain manual) · confidence: medium — contingent on a real run reading her topic and on the runtime reaching the candidates.

---

## First-person review (L1, designed experience)

I would adopt the *front half* tomorrow. The takes stage is the first tool I have seen that treats a
spicy claim as something I have to reach for rather than something I have to fend off — the card says
"not taken" before I touch it, the eyebrow has a little devil on it, and the amber line under the
title says "speculation about motive — not reporting" in words I could read to a ten-year-old. The
conclusions stage says the same thing again and calls it the board's rule, not the wizard's. That is
the exact posture my partner and I argue about every week, done for us.

Two things would make me stop trusting it. First, I typed 240 seconds and the header agreed with me,
and then the script cards said 5:00, 4:10 and 0:45 as if I had never spoken. I do not need the tool
to obey — I need it to *say* "these were cut for five minutes; yours is four". Silence there is the
kind of thing that gets a nine-minute script into a four-minute slot. Second, I can see that leaving
the hottest take out is "reflected" in Coverage only because none of the three scripts ever said it.
If one had, nothing would have caught it. My whole job is that nothing slips through.

Smaller: the one card I cannot remove explains itself with "NOTEBOOK-SCHEMA" and "Engine D" in the
faintest text on the card — say "a script that never argues against itself is a lecture" and I am
with you. And when I came back to the run stage, my leaves question was sitting as the headline over
a notebook about Bitcoin; I understand it is a prototype, but say so *before* I press the button.

Would I tell a peer? Yes — "the research scoping is built by someone who has been burned by
speculation; wait for the script side to catch up".

## First-person review (L2, live experience)

L2 verdict: **L2-conditional** — the script cards finally say my four minutes were not read; nothing yet checks that the speculation I left out stayed out.

I finished — adopted Adjudication after reading its beats in the modal, and the shelf said `Research — locked`. The takes stage is exactly as designed: `not taken`, "speculation about motive — not reporting" on the front. The topic box was empty, and the note said before I ran that the notebook would be the saved Bitcoin run; when I came back my leaves question was not sitting over Bitcoin numbers.

The line I asked for exists now, in amber, above the cards: `this project asked for Mid-length educational · 240s — the three renders below were cut for the fixture's own runtimes (0:45–5:00) and your clock is not read here yet`. That is the sentence. It does not fix the four-minute slot; it stops a nine-minute script sneaking into it.

Still missing: Coverage called my not-taken hot take `Out of scope. Click to bring it back.` — the same words it would use for a fact I cut, and I keep those apart on purpose. Nothing would catch a script that spoke the take; the null case held only because no render does. The steel-man's reason is still "NOTEBOOK-SCHEMA" in the faintest text. Would I tell a peer? "Yes for the scoping, today. The script side now admits what it does not read; it does not yet enforce what you decided."
