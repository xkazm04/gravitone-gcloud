# Lena — compose-from-scratch · S2 (educational · short-form-clip) · L1

Character: `uat/characters/lena-finance-shorts.md` (LE). Journey: `uat/journeys/compose-from-scratch.md`,
scenario S2 — the derived-short candidate; runtime vs words; the `ownDuration` latch; whether the
project's `targetS` reaches the Script step at all. Theoretical, code-grounded, no browser.

## Surface model

### Reachable set (educational → short-form-clip → preset → guided Research → explainer Script)

| Stage | Surface | Evidence |
|---|---|---|
| Create | `app/projects/new/page.tsx` → `app/_projects/wizard/CreateWizard.tsx` (4 stages) | `CreateWizard.tsx:196-265` |
| · template card | "Short-form clip" chip `15–60s measured` + `target 30s` | `stages.tsx:85-88`, `lib/projects.ts:139-146` (`defaultS: 30, range [15,60]`) |
| · style | every preset is `educational`, so an educational project always has cards | `CreateWizard.tsx:110-113,231` — H1 does not bite Lena |
| · name & clock | `NameStage` NumberInput `min=5 max=900`, hint "Short-form clip was measured at 15–60s" | `stages.tsx:231-250` |
| · latch | `ownDuration` set on first edit; `pickTemplate` only reseeds while `!ownDuration` | `CreateWizard.tsx:100,142,258-261` |
| · finish | `create({… targetS …})` then `router.push('/studio/<id>')` | `CreateWizard.tsx:180-190`; `lib/projects.ts:newProject` |
| Studio header | pill `Educational video · Short-form clip · {targetS}s` | `app/studio/[projectId]/StudioView.tsx:203-207` |
| Research | `ResearchStep` → `EducationalResearch` → guided face default (`GuidedResearch`) | `ResearchStep.tsx:96`, `guided/GuidedResearch.tsx:145-183` (run · takes · conclusions · cost) |
| · run engine | `useEducationalResearch` → `useResearchRun` replays `TRACE` at 8×; topic prefilled with `NOTEBOOK.topic` | `guided/useEducationalResearch.ts:42-45`, `run/useResearchRun.ts:30-38` |
| · gate to Script | `researched: ready` saved when the run lands `done` | `useEducationalResearch.ts:48-51` |
| Script | `ScriptStep` reads `getProject` **for `discipline` only**, routes explainer | `ScriptStep.tsx:96-114` |
| · candidates, guided | `CandidatesDuel` — 3 cards: Reversal Chain · Adjudication · Paradox Teaser ("They never sell") | `candidates/CandidatesDuel.tsx:276-313`, `renders.ts:115-157` |
| · candidates, expert | `HypothesisColumn` ×3 (face switch `script-face-switch`) | `ScriptStep.tsx:292-329` |
| · adoption | `useAdoption` writes `script-adopted`; card says "adopted — the Frames step opens on this chain" | `candidates/useAdoption.ts:443-451`, `CandidatesDuel.tsx:151-155` |
| Persistence | `stepStore` per `project:phase`; `parkAt` on rail click | `StudioView.tsx:153-176` |

Not reached (by design): Frames, Spend beyond the tab, recalibration.

### Grounding audit (against `uat/env.md`'s shared denominator)

- **research-run 0/5.** The typed topic is stored (`saveStep(… {topic})`) but the trace it runs is
  `TRACE` verbatim (`run/trace.ts`), the notebook is `NOTEBOOK` (`_shared/notebook/notebook.ts`),
  and nothing reads `logline`, `template`, `targetS`, or prior notebooks. Accepted gap for CONTENT.
- **script-candidates 3/4**, exactly as env.md states — and the missing quarter is Lena's whole job:
  runtime comes from `RENDERS[*].durationS` (fixture, `renders.ts:124`), never from the project.
- beat-board: not met (educational).

### Wiring audit — one grep per value I suspected unread

```
$ grep -rn "targetS" app/_phases/script/ app/_phases/_shared/     → no match (exit 1)
$ grep -rn "reportPhase" app lib | grep -v lib/projects.ts       → only app/_phases/frames/useFrames.ts:20,724
$ grep -rn "derivedFromId" app/_phases/script                     → types.ts:70, renders.ts:131, _parts/HypothesisColumn.tsx:65-67 (expert face ONLY)
```

Reproduction of the runtime arithmetic (fixture values, `renders.ts:124-126`):

```
$ node -e "…"   # 108 words · 150 wpm · durationS 45 · target 30
fixture seconds at wpm: 43.2
budget words at target 30 = 75
overrun seconds vs target: 15 | words over the 30s budget: 33
band meter (words): [101,112] value 108 inBand true      ← the meter reads CYAN (in band) for a 30 s project
narration-led 190 wpm needs words: 143
```

So a Lena who kept the template's 30 s (or typed 30, 35, 40) is shown a 0:45 candidate whose word meter
is *in band* and whose only overrun vocabulary is words-vs-fixture-budget. Nothing on the step can say
"15 seconds over your runtime", because the step never learns her runtime.

## Walkthrough (cognitive walkthrough: will she know what to do · see the action · connect it · see progress?)

**1 · /projects/new, discipline.** "Educational video — an argument explained well" (`DISCIPLINE_NOTE`).
Lena's vocabulary is "Short", not "educational", but the card chip "3 templates" and the next stage
resolve it in one click. Fine.

**2 · template.** "Short-form clip — ≤60s, target ≤30s — usually derived from a mid-length video"
with chips `15–60s measured` · `target 30s` (`stages.tsx:85-88`, `lib/projects.ts:139-146`). This is
the single best sentence in the flow for her: it says *derived*, it says the seconds. Picking it sets
`targetS = 30` (`CreateWizard.tsx:142`). She has not typed anything yet, so the latch is still off.

**3 · style.** Six presets, all `educational` — she sees cards, picks one, moves on. (H1 verified false
for this Character; it bites only trailer/free.)

**4 · name & clock.** She types "One number: the flywheel" and changes 30 → 40. `onDuration` sets
`ownDuration = true` then `targetS = 40` (`CreateWizard.tsx:258-261`). Traced the latch: if she now
goes **Back** to template and re-picks Short-form clip, `pickTemplate` skips the reseed because
`ownDuration` is true (`:142`) — her 40 survives. If she switches discipline to trailer and back, the
template is cleared but `targetS` is only zeroed when `!ownDuration` (`:129`) — 40 survives that too.
**Criterion 1 passes.** Two edges: (a) the hint says "measured at 15–60s. Past that band the craft
rules stop applying" but nothing changes colour or blocks if she types 90 — advisory only;
(b) clearing the field gives `Number('') || 0 = 0`, the `min=5` attribute is not enforced (no `<form>`
submit, `finish` checks only title/discipline/template/style at `:146`), so "Create & open" is enabled
with a 0 s runtime and the studio pill reads `· 0s`.

**5 · studio opens.** Headline = her title; pill `EDUCATIONAL VIDEO · SHORT-FORM CLIP · 40S`
(`StudioView.tsx:205-206`). **Criterion 5 passes.** Rail opens on Research (`phase: "research"`).

**6 · Research, guided face, run stage.** The topic field is **prefilled with "Why Bitcoin price
does not rise"** (`useEducationalResearch.ts:43` → `NOTEBOOK.topic`, `notebook.ts:15`). Her pet
peeve is re-researching what she already researched; she replaces the topic with her flywheel one and
hits run. `RunStage.tsx:41` then draws HER topic as the `<h3>` over a trace whose steps are all
Bitcoin (`trace.ts:28` "Strategic Bitcoin Reserve…"). The honesty line under the controls
(`LocalProcessNote`, `controls.tsx:147-153`) says "the trace is replayed at 8× from run 1 and nothing
is executed" — true, but it is engineer-speak; it does not say *the notebook you are about to make
decisions on is about Bitcoin, not your topic*. The `OutcomePicker`'s load note is more honest
("Loads the real 2026-08-11 Bitcoin notebook…", `useResearchRun.ts:37-38`) but that is the skip path,
not the run path. Journey DoD 4 ("I could tell what the research was ABOUT before I decided") is met
only if she reads the mono footnote. The takes / conclusions / cost stages are genuinely decisions as
cards (DoD 3 holds).

**7 · Script, Candidates tab, guided face (the default for a fresh project —
`useScriptFace.ts:368-371`).** Three cards. The third: eyebrow `PARADOX TEASER`, title "They never
sell", arc bullets (opens / turns / lands), chip `6 beats · 0:45`, risk line. **Nothing on the guided
card says it is derived, or from what** — `derivedFromId` is rendered only by the expert
`HypothesisColumn.tsx:65-67` ("derived from the Reversal Chain — no additional research"). The
engine label "Paradox Teaser" is the studio's vocabulary, not hers. **Criterion 2 fails on the face
she lands on;** it passes one click away behind `full controls`.

"read more" → depth: `108 words` chip, band meter `essay words 108 / band 101–112` (cyan, in band),
line `0:45 at 150 wpm · promise form: contradiction · 0 questions aloud`, gate counts. **Criterion 3
passes** — words, seconds and a stated wpm are all visible — but with two asterisks: the wpm and the
seconds are the fixture's, and the declared deviation that matters to a talking-head creator ("Word
budget assumes image-led production at 150 wpm. If produced narration-led it needs ~60 more words",
`renders.ts:154`) renders only in the expert column (`HypothesisColumn.tsx:145-150`), never in the duel.

**Criterion 4 — a candidate that overruns her runtime says so in seconds — fails outright.** Her
40 s (or the default 30 s) is not read by any file under `app/_phases/script/` (grep above). The only
overrun language is `BandMeter`'s `aboveNote` "over the budget the duration bought"
(`CandidatesDuel.tsx:195-200`), which is words against `wordBudget × 0.9..1.0` of the fixture, and
for this render it does not even fire (108 ≤ 112). `gate.ts` has no runtime rule either. So for a
30 s project the card reads `0:45` with a cyan meter and no warning; her senior bar ("refuses one that
runs over") cannot be applied on this surface.

The expert column adds a line that actively misleads a short-form project: `template short-form-clip
— outside the notebook's intent, by design` (`HypothesisColumn.tsx:109-112`, compared against
`NOTEBOOK.templateIntent = "mid-educational-video"`, `notebook.ts:21`). For Lena the short IS the
project's template; the sentence is true of the fixture notebook and false of her project, and it is
computed against the notebook rather than `project.template`.

**8 · Adopt.** Whole-card pick writes `script-adopted`; the card says "adopted — the Frames step opens
on this chain". DoD 5 holds. Sticky pad / recalibration not needed for her job.

**9 · Return visit / shelf.** `parkAt` bookmarks the rail; adoption and research records are per
project in IndexedDB (DoD 6 holds). But the shelf's Research and Script cells stay `not started`
forever: `reportPhase` is called only from Frames (`useFrames.ts:724`). Her five-a-week cadence
lives on a shelf that cannot tell "researched + adopted" from "never opened" (H4 confirmed).

**Which stage loses Lena:** Script → Candidates, guided face. She gets a candidate that is derived
and timed — the fixture is honestly a good short — but the surface cannot say *derived*, cannot say
*your 40 seconds*, and cannot say *over*.

## Scored criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Short-form-clip seeds the runtime and keeps her override | **pass** | `lib/projects.ts:143` defaultS 30 → `CreateWizard.tsx:142`; latch `:100,:129,:142,:258-261` |
| 2 | Script shows a DERIVED short and says what from | **fail** (guided) / pass (expert) | `CandidatesDuel.tsx` has no `derivedFromId` read; `HypothesisColumn.tsx:65-67` does; default face guided `useScriptFace.ts:370` |
| 3 | Words vs seconds at a stated wpm visible | **pass, conditional** | `CandidatesDuel.tsx:144,177-179,195-204` — one gesture deep; wpm/seconds are fixture, narration-led caveat expert-only |
| 4 | An overrunning candidate says so in seconds | **fail** | no `targetS` under `app/_phases/script/`; `Meters.tsx:28` overrun is words vs fixture budget; `gate.ts` has no runtime rule |
| 5 | Runtime visible on the studio header | **pass** | `StudioView.tsx:205-206` |

Journey DoD: 1 ✓ · 2 ✓ · 3 ✓ · 4 ◐ (footnote-only) · 5 ✓ · 6 ✓ (studio) ✗ (shelf cells) · 7 ✓.

## Findings

```json
[
  {
    "id": "LE-L1-1",
    "journey": "compose-from-scratch",
    "character": "lena",
    "cert_level": "L1",
    "type": "wiring-gap",
    "severity": "P1",
    "impact": { "frequency": "every short-form project", "reachability": "default path — Candidates tab, both faces", "trust_erosion": "high: the one number she typed is the one number the candidate never meets" },
    "dimension": "contract",
    "title": "The project's targetS never reaches the Script step; the derived short is timed against the fixture's 45 s, not the runtime she set",
    "expected": "A 30 s (or 40 s) short-form project shows the derived candidate measured against 30 s (40 s): seconds over/under, and a word budget at the stated wpm for HER runtime.",
    "got": "ScriptStep reads getProject only for `discipline` (ScriptStep.tsx:104). Every duration on the Candidates tab is RENDERS[*].durationS (renders.ts:124 = 45) and every word budget is the fixture's wordBudget (112). For a 30 s project the card reads `6 beats · 0:45` with an in-band cyan word meter and no warning. Reproduced: 108 words at 150 wpm = 43.2 s; 30 s at 150 wpm buys 75 words; the candidate is 15 s / 33 words over and nothing says so.",
    "evidence": [
      "grep -rn targetS app/_phases/script/ → no match",
      "app/_phases/script/ScriptStep.tsx:96-114",
      "app/_phases/script/renders.ts:122-126",
      "app/_phases/script/candidates/CandidatesDuel.tsx:143-146,195-204",
      "app/_phases/script/_parts/Meters.tsx:26-28",
      "app/studio/[projectId]/StudioView.tsx:206 (the header DOES know it)",
      "app/_phases/frames/useFrames.ts:244-248 (Frames reads targetS — Script is the only step between that does not)"
    ],
    "code_check": "node -e arithmetic above; grep exit code 1 under app/_phases/script/",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Create a short-form-clip project with targetS=30 (fresh profile, wizard), run research, open Script → Candidates, expand the Paradox Teaser: assert the card shows 0:45 and no over-runtime text; assert the studio pill shows 30s. Env: NEXT_PUBLIC_DEV_AUTH=1 on :3183.",
    "mock_bound": false,
    "scope_note": "The candidate's 45 s is fixture content (accepted); the finding is that the surface has no channel for the project's runtime at all — a real generator that honoured targetS would still be displayed against the fixture's numbers."
  },
  {
    "id": "LE-L1-2",
    "journey": "compose-from-scratch",
    "character": "lena",
    "cert_level": "L1",
    "type": "legibility",
    "severity": "P2",
    "impact": { "frequency": "every fresh project (guided is the computed default)", "reachability": "default face of the Candidates tab", "trust_erosion": "medium: her whole format is 'derived from the long one' and the card that IS derived does not say so" },
    "dimension": "surface",
    "title": "The guided Candidates duel never says the third card is derived, or from what — the `derivedFromId` line is expert-face only",
    "expected": "The derived-short card states, on its front or in its depth, 'derived from the Reversal Chain — no additional research' (the render carries derivedFromId + derivedFromBeat).",
    "got": "CandidatesDuel reads no `derivedFromId`/`derivedFromBeat`; the only renderer is HypothesisColumn.tsx:65-67, behind the `full controls` switch. On the guided face the card is 'PARADOX TEASER · They never sell · 6 beats · 0:45' — an engine name, not a lineage.",
    "evidence": [
      "app/_phases/script/candidates/CandidatesDuel.tsx:83-247 (no derivedFrom read)",
      "app/_phases/script/_parts/HypothesisColumn.tsx:65-67",
      "app/_phases/script/renders.ts:131-132",
      "app/_phases/script/candidates/useScriptFace.ts:368-371 (fresh project → guided)"
    ],
    "code_check": "grep -rn derivedFromId app/_phases/script → types.ts, renders.ts, HypothesisColumn.tsx only",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "On a fresh short-form project open Script (guided): assert no text matching /derived from/ on duel-depth-derived-short; click script-face-switch and assert it appears in render-derived-short.",
    "mock_bound": false
  },
  {
    "id": "LE-L1-3",
    "journey": "compose-from-scratch",
    "character": "lena",
    "cert_level": "L1",
    "type": "legibility",
    "severity": "P2",
    "impact": { "frequency": "every short-form project", "reachability": "Candidates depth (guided) / column (expert)", "trust_erosion": "medium: 150 wpm is an image-led assumption; a talking-head short at 190 wpm needs 143 words for 45 s, and the caveat that says so is hidden on the default face" },
    "dimension": "surface",
    "title": "Overrun vocabulary is words-vs-fixture-budget, never seconds-vs-runtime, and the wpm assumption's declared deviation is expert-only",
    "expected": "Per Character criterion 4: 'over by N s at W wpm'. And the render's own deviation ('Word budget assumes image-led production at 150 wpm… narration-led needs ~60 more words') shown wherever the wpm is shown.",
    "got": "BandMeter aboveNote is 'over the budget the duration bought' (words). It does not fire for the derived short (108 in [101,112]). `deviations[]` are rendered only in HypothesisColumn.tsx:145-150; the duel's depth shows the 150 wpm line (CandidatesDuel.tsx:201-204) with no caveat.",
    "evidence": [
      "app/_phases/script/candidates/CandidatesDuel.tsx:195-204",
      "app/_phases/script/_parts/Meters.tsx:10-50",
      "app/_phases/script/_parts/HypothesisColumn.tsx:145-150",
      "app/_phases/script/renders.ts:153-155"
    ],
    "code_check": "node -e: band [101,112], value 108, inBand true; 45 s × 190 wpm / 60 = 143 words",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Expand duel-depth-derived-short: assert the text 'declared deviation' is absent; switch face and assert present. Same project as LE-L1-1.",
    "mock_bound": false,
    "scope_note": "Overlaps LE-L1-1 in cause (no runtime on the step) but is a separate fix: the meter's unit and where deviations render."
  },
  {
    "id": "LE-L1-4",
    "journey": "compose-from-scratch",
    "character": "lena",
    "cert_level": "L1",
    "type": "expressiveness",
    "severity": "P2",
    "impact": { "frequency": "every project on this journey", "reachability": "/projects shelf after any research or script work", "trust_erosion": "medium: five shorts a week on a shelf that says 'not started' for all of them" },
    "dimension": "contract",
    "title": "Research and Script never call reportPhase — the shelf's research/script cells cannot leave `not started` on this journey",
    "expected": "After the run lands and a candidate is adopted, the shelf shows Research and Script as in progress / needs a call.",
    "got": "The only reporter in the app is Frames (useFrames.ts:724). `ProjectsMatrix` draws `p.progress` which stays emptyProgress() for research and script. `parkAt` moves the bookmark only (by design).",
    "evidence": [
      "grep -rn reportPhase app lib → app/_phases/frames/useFrames.ts:20,724 only",
      "lib/projects.ts:reportPhase, emptyProgress",
      "app/_projects/ProjectsMatrix.tsx:161"
    ],
    "code_check": "grep above",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "After adopting a candidate, navigate to /projects and read the row's research/script cells — expect 'not started' for both. Env: same profile.",
    "mock_bound": false,
    "scope_note": "Orchestrator H4 — confirmed for research and script. Which state a run or an adoption should report is a product call; the finding is that no channel exists."
  },
  {
    "id": "LE-L1-5",
    "journey": "compose-from-scratch",
    "character": "lena",
    "cert_level": "L1",
    "type": "honesty",
    "severity": "P2",
    "impact": { "frequency": "every fresh educational project", "reachability": "Research run stage, before any decision", "trust_erosion": "medium: her typed topic is drawn as the headline over a Bitcoin trace" },
    "dimension": "surface",
    "title": "The run stage prefills the Bitcoin topic and then echoes whatever she types as the headline over a Bitcoin notebook; the stand-in is disclosed only in a mono footnote about process",
    "expected": "Before she picks takes and conclusions, one plain sentence: 'this prototype's notebook is the saved Bitcoin run whatever topic you type'.",
    "got": "useEducationalResearch.ts:43 seeds `topic` with NOTEBOOK.topic on a fresh project; RunStage.tsx:41 renders `{topic}` as the h3; LocalProcessNote (controls.tsx:147-153) says 'the trace is replayed at 8× from run 1 and nothing is executed' — about the engine, not about the subject. The honest sentence exists but only on the LOAD path (useResearchRun.ts:37-38 LOAD_NOTE).",
    "evidence": [
      "app/_phases/research/guided/useEducationalResearch.ts:42-45",
      "app/_phases/_shared/notebook/notebook.ts:15",
      "app/_phases/research/guided/RunStage.tsx:41,98",
      "app/_phases/research/run/controls.tsx:147-153",
      "app/_phases/research/run/useResearchRun.ts:37-38"
    ],
    "code_check": "read; no execution needed",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Fresh short-form project → Research: assert the topic input's initial value equals 'Why Bitcoin price does not rise'; type a new topic, run, and assert the notebook modal title still reads 'why-bitcoin-price-does-not-rise' (ResearchStep.tsx:299) while the h3 shows the typed topic.",
    "mock_bound": true,
    "scope_note": "Content is the accepted 'one notebook' gap; the finding is the labelling before the decision (orchestrator H2, Lena's slice). Other Characters will raise this too — keep one canonical row at drain."
  },
  {
    "id": "LE-L1-6",
    "journey": "compose-from-scratch",
    "character": "lena",
    "cert_level": "L1",
    "type": "legibility",
    "severity": "P3",
    "impact": { "frequency": "every short-form project that opens the expert face", "reachability": "expert Candidates column", "trust_erosion": "low-medium: a sentence that is true of the fixture and false of her project" },
    "dimension": "surface",
    "title": "Expert column says 'template short-form-clip — outside the notebook's intent, by design' on a project whose template IS short-form-clip",
    "expected": "The template line compares the render's template to the PROJECT's template, or is omitted when they match.",
    "got": "HypothesisColumn.tsx:109-112 compares `r.template` against `NOTEBOOK.templateIntent` ('mid-educational-video', notebook.ts:21), not `project.template`, so the derived short is always 'outside intent'.",
    "evidence": [
      "app/_phases/script/_parts/HypothesisColumn.tsx:109-112",
      "app/_phases/_shared/notebook/notebook.ts:21"
    ],
    "code_check": "read",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Expert face on the short-form project: assert render-derived-short contains 'outside the notebook's intent'. Low priority.",
    "mock_bound": true
  },
  {
    "id": "LE-L1-7",
    "journey": "compose-from-scratch",
    "character": "lena",
    "cert_level": "L1",
    "type": "validation",
    "severity": "P3",
    "impact": { "frequency": "rare (clearing the field, or typing outside the band)", "reachability": "wizard name stage", "trust_erosion": "low" },
    "dimension": "contract",
    "title": "The wizard creates a project with a 0 s or out-of-band runtime without saying so; NumberInput's min/max are advisory",
    "expected": "Create & open disabled (or a visible refusal) when targetS is 0; an out-of-band number gets the same amber the script meters use.",
    "got": "`finish` gates on title/discipline/template/style only (CreateWizard.tsx:146); `Number('') || 0` yields 0 (stages.tsx:248); no <form>, so `min=5` never validates. The studio pill then reads '· 0s'. The band hint (stages.tsx:239) is text only.",
    "evidence": [
      "app/_projects/wizard/CreateWizard.tsx:146",
      "app/_projects/wizard/stages.tsx:231-250",
      "app/studio/[projectId]/StudioView.tsx:206"
    ],
    "code_check": "node -e \"console.log(Number('')||0)\" → 0",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Wizard: clear the runtime field on the name stage, assert Create & open is enabled, create, assert the pill reads '0s'.",
    "mock_bound": false
  },
  {
    "id": "LE-L1-8",
    "journey": "compose-from-scratch",
    "character": "lena",
    "cert_level": "L1",
    "type": "strength",
    "severity": "P3",
    "impact": { "frequency": "every create", "reachability": "wizard", "trust_erosion": "none — builds it" },
    "dimension": "contract",
    "title": "Runtime seeding + the ownDuration latch + the header pill do exactly what the Character asks (criteria 1 and 5)",
    "expected": "Template seeds 30 s; her override survives re-picking template or discipline; the studio shows it.",
    "got": "Traced: pickTemplate reseeds only while !ownDuration (CreateWizard.tsx:142); pickDiscipline zeroes only while !ownDuration (:129); StudioView.tsx:206 prints `{project.targetS}s`. The template card itself says 'usually derived from a mid-length video' and '15–60s measured · target 30s' — the best sentence in the flow for this Character.",
    "evidence": [
      "app/_projects/wizard/CreateWizard.tsx:100,129,142,258-261",
      "app/_projects/wizard/stages.tsx:85-88",
      "lib/projects.ts:139-146",
      "app/studio/[projectId]/StudioView.tsx:203-207"
    ],
    "code_check": "read",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Type 40 at the name stage, go Back to template, re-pick Short-form clip, Next ×2, assert the field still reads 40; create; assert the pill reads 40s.",
    "mock_bound": false
  },
  {
    "id": "LE-L1-9",
    "journey": "compose-from-scratch",
    "character": "lena",
    "cert_level": "L1",
    "type": "strength",
    "severity": "P3",
    "impact": { "frequency": "every Candidates visit", "reachability": "guided depth", "trust_erosion": "none" },
    "dimension": "surface",
    "title": "Words, seconds and wpm are all on the candidate, counts never collapse into a crown, and adoption is a record that says where it goes",
    "expected": "Criterion 3; the senior bar's 'no invented number' is served by cutFacts and the constraint ledger.",
    "got": "Duel depth: `108 words`, `essay words 108 / band 101–112`, `0:45 at 150 wpm`, gate counts (CandidatesDuel.tsx:177-215). Adopted card: 'adopted — the Frames step opens on this chain' (:151-155), written to script-adopted (useAdoption.ts:443-451). Expert column adds the ledger row for u-spot-price 'down fifty percent is a ratio, not a level' (constraints.ts:311-314) — exactly the check her senior bar names.",
    "evidence": [
      "app/_phases/script/candidates/CandidatesDuel.tsx:142-146,173-215",
      "app/_phases/script/candidates/useAdoption.ts:443-451",
      "app/_phases/script/constraints.ts:310-315"
    ],
    "code_check": "read",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Expand duel-depth-derived-short and assert the '0:45 at 150 wpm' line and the '108 words' chip; adopt and assert duel-adopted-derived-short.",
    "mock_bound": false
  }
]
```

## Verdict

**L1-fail** for S2 as Lena — the journey's own definition of done mostly holds (create ✓, vocabulary ✓,
decisions-as-cards ✓, adopt ✓, persist ✓, no forced spend ✓), but two of her five criteria fail on the
default path and one of them (4) is the job: the Script step has no channel for the runtime she set,
so "know it fits the length before I record" cannot be answered by this surface for any short-form
project. Criterion 2 fails on the guided face only.

grounding: research-run 0/5 · script-candidates 3/4

time-saved-if-it-all-worked: ~38 min per short (50 → ~12: research reuse + a timed derived candidate
with a lineage line) · confidence low-medium — today the timing half of that saving is not delivered,
so the realised saving is closer to ~20 min (she still times it aloud herself).

## First-person review (L1, designed experience)

Adopt? Not yet, and it is close, which is the annoying kind of no.

The create flow gets me. "Short-form clip — usually derived from a mid-length video, 15–60 s measured,
target 30 s" is the first time a tool has described my format back to me in my own units. I typed 40,
went back to double-check the template, and the 40 was still there. The studio opens with
`SHORT-FORM CLIP · 40S` in the header. Good. That is the one number I care about and it is on the wall.

Research: the topic box already had *someone else's topic* in it. I typed mine, it put my words in big
type over a run that was visibly about Bitcoin, and a grey footnote told me the trace was "replayed at
8×". I am ex-bank; I know what a replayed fixture is. My editor would not. Say it in a sentence a
person reads.

Script is where it falls down. There is a card that is, in fact, exactly what I want — one claim, one
turn, one payoff, 108 words, 45 seconds, and a pointer to the long video at the end. But the card does
not tell me it was *derived* from the long one (the expert view does, one click away, in violet). And
nowhere — not the card, not the depth, not the meter — does anything say *45 seconds is 5 seconds over
the 40 you typed*, or 15 over the 30 the template promised. The word meter is cyan. Cyan means fine.
It is not fine; I would cut it. The wpm line says 150, which is an image-led number; I talk to camera
at 180–190, and the sentence that admits that is also hidden in the expert column.

So I would still time it aloud. That is the 10 minutes I was paying to skip. What is missing for my
job is one line per card: `0:45 vs your 0:40 · +5 s at 150 wpm (+12 s if narration-led)`. The header
already knows my number; the step just never asks it.

Would I tell a peer? "Watch this one — the create flow already speaks Shorts, and the derived
candidate is real. Wait until it can count against your runtime." Then I would send them my spreadsheet.

## First-person review (L2, live experience)

L2 verdict: **L2-conditional** — it now says my 40 seconds were not read; it still cannot tell me how many seconds over the card is.

I finished with a derived short adopted. The template seeded 30, I typed 40, re-picked the template twice, and the 40 survived (`owned runtime survives re-picking the template — 40`). I cleared the field to 0 and Create & open greyed out and said why — someone closed that hole while I was in the wizard. Header: 40s. Research: empty topic box, the stand-in named before the run in plain words; my editor would understand it now.

Script: the amber line reads `this project asked for Short-form clip · 40s — the three renders below were cut for the fixture's own runtimes (0:45–5:00) and your clock is not read here yet`. Honest, and not arithmetic. The depth still says `0:45 at 150 wpm` with a cyan meter; the number I want — `+5 s over your 40` — is one subtraction the page now has both operands for and does not do. The guided card still does not say it is derived from the Reversal Chain (`expect absent` held). The narration-led caveat is still expert-only.

Would I tell a peer? "Closer. It admits it is not counting against your runtime, which beats pretending. I am still timing it aloud." Ten minutes promised; today it saves the research reuse and costs me the stopwatch.
