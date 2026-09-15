# Sofia — compose-from-scratch · L1 (theoretical, code-grounded)

Character: `uat/characters/sofia-festival-teaser.md` (SO) · scenario S3 with the TEASER template
(plus S5, fresh account, by construction). Hypotheses owned: H1, H5. Walked at HEAD `d1f11b0`
**with an uncommitted working-tree change to the wizard's style stage found mid-walk**
(`app/_projects/wizard/CreateWizard.tsx`, `stages.tsx`, header comment dated 2026-09-05, "uat
compose-from-scratch"). Both states are reported; L2 must say which one it ran against.

Motivation (verbatim): the manual way is a teaser beat sheet argued out with her editor over two
evenings — ~3 hours of two people. She adopts a tool that gets her a composed, withholding-aware
teaser spine in under 30 minutes, provided it does not decide her tone for her.

Senior bar (verbatim): a senior trailer editor refuses a teaser with more than one hook, refuses one
that pays its own promise, and refuses a "teaser" that is a trailer cut short. The teaser spine must
be visibly a different contract from the trailer's, not the trailer's rungs trimmed.

## Surface model

Reachable set for a `trailer` discipline · `teaser` template project on a fresh account:

| Stage | Surface | Evidence |
|---|---|---|
| Create | `/projects/new` → `CreateWizard` on the deck engine; 4 stages, Next gated on `stage.done` (`components/ui/deck/Deck.tsx:66,148`) | `app/_projects/wizard/CreateWizard.tsx:217-289` |
| · discipline | `DISCIPLINE_LABEL.trailer = "Movie · game trailer"`, note "a promotional cut that opens a debt another artifact pays" | `lib/projects.ts:128,135` |
| · template | `templatesFor("trailer")` = `teaser · trailer · cinematic`; teaser card: "≤60s, one hook — imagery and tone, light on story", chips `15–60s measured` · `target 60s` | `lib/projects.ts:192-219`, `stages.tsx:75-95` |
| · style | `fittingThemes = lockedOnly(themes).filter(styleFits)`; presets filtered by `styleFits(p, discipline)`; **all 6 presets are `discipline: "educational"`** | `CreateWizard.tsx:103-127`, `app/library/presets.ts:49,66,83,100,117,134`, `lib/themes.ts:133-135` |
| · name | title required; logline optional ("what the script step argues back against" — it is not, see wiring); runtime seeded 60 from the template | `stages.tsx:181-253` |
| Studio | header `Movie · game trailer · Teaser · 60s` — the ONE place the template is shown after creation | `app/studio/[projectId]/StudioView.tsx:205-206` |
| Research | `ResearchStep` → `discipline === "trailer"` → `BeatVariantBoard` directly (no ModeChooser) | `app/_phases/research/ResearchStep.tsx:96-97,117` |
| · board | `slotsFor(discipline)` → `GLASS_HARBOR_SLOTS` for every non-educational discipline; header `{DISCIPLINE_LABEL} · beat variants`, "8 parts, in spine order"; fixture line "fixture · n=0 · the Glass Harbor slots, whatever the project's logline" | `beats/beats.ts:47-49`, `BeatVariantBoard.tsx:36-47` |
| · compose | `confirm()` freezes picks and writes `research.researched = true` | `beats/useBeatPicks.ts:62-75` |
| Script | `ScriptStep` → `discipline === "trailer"` → `TrailerScript` | `app/_phases/script/ScriptStep.tsx:104-125` |
| · cut | `useTrailerCut` seeds `composeCut({ picks, slots: slotsFor(discipline), cue: GLASS_HARBOR_CUE })`, budget `GLASS_HARBOR_BUDGET` | `trailer/useTrailerCut.ts:59-75` |
| · `composeCut` | hard-codes `rung: "long-cut"`, `lane: "wide-release"`; no `droppedParts`; takes no template and no runtime | `trailer/cut.ts:42-69` |
| · panels | `EnergyCurve`, `MovementSection` ×8, `PromiseLedger`, `WithholdingPanel`, `StructurePanel` | `trailer/TrailerScript.tsx:103-116` |
| Never | Frames — nothing on this path links to it; the stepper is navigable but no surface pushes her there | `app/studio/[projectId]/phases.tsx` |

### Grounding audit (shared denominator, `uat/env.md`)

`beat-board` — (1) logline: not read (`slotsFor` takes only `discipline`); (2) template: not read
(the argument is `Discipline`, and `teaser` never reaches `beats.ts` or `cut.ts`); (3) target
runtime: not read (`grep targetS app/_phases` hits only `frames/`, `cut/`, `score/` — never
`research/` or `script/`); (4) locked style's tone: not read. **0/4**, as the denominator predicts.
`research-run` and `script-candidates` are not on this path (a trailer has no notebook and no
candidates — `TrailerScript.tsx:4-6`).

### Wiring audit (executed, `npx tsx` over the real modules)

```
H1 presets fitting trailer: 0 / 6 | free: 0
teaser template: {"id":"teaser","defaultS":60,"range":[15,60],"note":"≤60s, one hook — imagery and tone, light on story"}
H5 slots: 8 | cold open@0:00 | introduction@0:12 | escalation · rung 1@0:30 | escalation · rung 2@0:45
           | escalation · rung 3@1:00 | the reset@1:16 | climax@1:22 | tail — cards and button@1:50
composed rung: long-cut lane: wide-release movements: 8 beats: 8 last at: 1:50 droppedParts: undefined
LADDER rung pass :: A long cut, and no part is declared dropped — "The long cut — four parts and an optional button."
malformed: false enforced: 69 pass/viol/unm/ne: 11 0 5 1
promises in composed cut: []
budget assets: novum:spend, best-moment:spend, reveal:imply, turn:hold, resolution:hold
PROMISE extraction unmeasured :: 0 promise(s) are declared on beats …
```

- `styleFits(p, "trailer")` is `!p.discipline || p.discipline === "trailer"` (`lib/themes.ts:134`) → false
  for every shipped preset. At HEAD the style stage renders `EmptyStyleDeck` and `Deck` will not
  advance (`done: styleId !== null`). **H1 confirmed at HEAD.**
- Working tree (uncommitted): `borrowedPresets = disciplinePresets.length === 0` → all six presets
  are dealt with an amber chip `written for educational video · fits any` and the stage sub says
  "No style is written for movie · game trailer yet, so the six explainer presets are offered as a
  starting look…"; the minted theme is left untagged (`discipline: undefined`,
  `CreateWizard.tsx:187`) so `styleFits` accepts it (`CreateWizard.tsx:110-127,244-247`,
  `stages.tsx:136-159`). **H1 repaired in the working tree, honestly labelled.** The expert dialog
  (`app/_projects/ProjectDialog.tsx:111,270`) is NOT patched and still requires a fitting locked
  theme — an edge, since the wizard is the default route.
- `slotsFor` returns the same 8 Glass Harbor slots for `teaser`, `trailer` and `cinematic`; the
  template id is not in scope anywhere on the beat or cut path. **H5 confirmed.** The "different
  contracts" argument in `lib/projects.ts:165-191` stops at the catalogue.
- The cut composed for the teaser is declared `long-cut` with no `droppedParts`; `checkLadder`
  therefore reports `ladder · rung · pass` (`trailer/structure.ts:1027-1043`) on a cut whose last
  beat sits at 1:50 against a 60 s target. The checker states it "has no access to duration"
  (`structure.ts:40`) and no surface compares `at` to `targetS`.
- `lane: "wide-release"` is hard-coded (`cut.ts:62`); `types.ts:389` names `specialty` as a
  recognised lane, and no control sets it.
- `reportPhase` is called only from `app/_phases/frames/useFrames.ts:724`; research and script
  write step records (`stepStore`) but never a phase claim, so the shelf cells for both stay
  `not started` (`lib/projects.ts:322-336`, `ProjectsMatrix.tsx:153`). H4 confirmed for this path.
- The logline hint "It is what the script step argues back against" (`stages.tsx:219`) — the
  trailer script path never reads `logline` (`composeCut` takes `title` only).

## Walkthrough (cognitive walkthrough: will she know what to do · see how · tell it worked)

**1 · Discipline.** "Movie · game trailer / a promotional cut that opens a debt another artifact
pays". She knows what to do — that sentence is her vocabulary (withholding = a debt). Educational
and "Any video" are legibly not hers. Pass.

**2 · Template.** Three cards: Teaser "≤60s, one hook — imagery and tone, light on story", Trailer
"90–150s — the full spine, and it may spell out plot", Cinematic "imagery when the footage does not
exist yet — a stage, not a length". She sees the contract stated the way she thinks about it, and
the trailer card even confesses "may spell out plot" — which is what she is avoiding. The chip
`15–60s measured` is a small lie the catalogue admits (`n=0`, `lib/projects.ts:189-191`), and she
would not know that. Pass with a footnote.

**3 · Style.** *HEAD:* "No locked style fits movie · game trailer yet … commission one in the
library →". Next is disabled. The library's commission path renders proofs through
`/api/imaging/generate` (`app/library/LibraryAtelier.tsx:10-12`) — so the only way forward is
picking and approving generated images, which is criterion 5's exact refusal, and the wizard's
picks are lost the moment she leaves the route. Dead end. *Working tree:* six explainer presets,
every card chipped `written for educational video · fits any`, and the stage says why. She would
grumble — Signal Ledger, Chalk Argument and Data Neon are explainer looks and she knows it — but
the stage does not call them hers, which is precisely her pet peeve's wording. She picks Paper
Relief as the least explanatory and moves on. Conditional pass.

**4 · Name.** Title, logline, runtime 60 with the hint "Teaser was measured at 15–60s. Past that
band the craft rules stop applying." Clear. She types the logline expecting the script to argue
against it (the hint says so). Create & open → `/studio/<id>`, header "Movie · game trailer ·
Teaser · 60s". DoD 1, 2 hold.

**5 · Research (beat board).** Eyebrow "Movie · game trailer · beat variants" — the word *teaser*
is gone. "Pick one beat per part … 8 parts, in spine order". Then, honestly: "fixture · n=0 · the
Glass Harbor slots, whatever the project's logline". She reads that as: the content is not mine
(fine, DoD 4 holds — she is told before deciding). What it does not say is that the *shape* is not
hers either: eight parts, three escalation rungs, a reset, a climax at 1:22, cards at 1:50. Her
senior bar names this exact shape — "a trailer cut short" — and the board does not say "this is
the long cut's spine; a teaser's is two parts" or offer a shorter slot set. Every column must be
picked before "compose spine →" enables (`BeatVariantBoard.tsx:93`), so she cannot leave the
reset or rungs 2–3 empty to make a teaser out of it; the checker would then flag holes
(`SlotColumn.tsx:54-58`). She composes an 8-part spine because that is the only spine on offer.
Picks persist per project (`useBeatPicks.ts:46-49`); DoD 3 holds, criterion 2 fails.

**6 · Script (TrailerScript).** "composed from · 8 picked parts · cue: Low Tide — candidate cue ·
lane: wide-release" and "<title> · long-cut". The word *teaser* does not appear on the surface at
all; the cut is declared long-cut, wide-release, and its beats run to 1:50. The Structure panel then
says `ladder · rung · ✓ pass — A long cut, and no part is declared dropped`, `malformed: no`,
`69% enforced`. To a festival director that reads as the tool certifying her 60-second teaser as a
correctly-formed two-minute trailer. Trust cost is high because the panel is otherwise scrupulous
(`unmeasured` drawn as loudly as `violation`, `StructurePanel.tsx:5-9`) — it is *believable*.

The PromiseLedger: "0 promised · 0 incomplete" and "no promise declared on any beat — the ledger is
empty, which is not the same as the cut promising nothing". Honest, and she can add promises per
beat and name a payer; an unnamed payer is drawn `incomplete`, never blocked
(`PromiseLedger.tsx:45-48,71-76`). Criterion 3 passes on the contract; nothing in the fixture
exercises it (mock-bound).

The WithholdingPanel: five named assets (novum, best-moment, reveal, turn, resolution) × spend /
imply / hold, a trade sentence required on every spend, "N spent · M without a trade" in the
header. Editable, yes. Explained, no: nothing on the panel says what *imply* means versus *hold*, or
that a teaser's craft default is hold the turn · hold the resolution · imply the reveal
(`knowledge/templates/teaser/TEMPLATE.md` § The format). The fixture budget happens to match that
default — because it is the *trailer's* budget, not because the teaser's rule was applied. Criterion
4 half-passes.

The cut is editable per beat (`MovementSection` → `BeatEditor`, connector picks, raises chips) and
every change saves (`useTrailerCut.ts:83-86`). DoD 5 holds in letter ("compose one and know it was
adopted"); DoD 6 holds for the work (IndexedDB per project:phase) but the shelf's research/script
cells never move (H4), so "where I left it" is answered by the studio, not the shelf.

**7 · Frames.** Never pushed there. Criterion 5 holds on the working tree; fails at HEAD via the
library detour.

## Scored criteria

| # | Criterion | HEAD | Working tree | Evidence |
|---|---|---|---|---|
| 1 | Teaser project on a fresh account with a style honest about what it was written for | **FAIL** — cannot create; `EmptyStyleDeck`, Next disabled | **PASS** — presets offered with `written for educational video · fits any`, stage sub states it | `CreateWizard.tsx:103-127,244-263`, `stages.tsx:136-159`, `presets.ts` (6× `educational`), `Deck.tsx:148` |
| 2 | Teaser spine visibly different from a trailer's — fewer parts or a stated rule — or the board says it is not | **FAIL** | **FAIL** — same 8 slots for every promotional template; board names discipline, never template; nothing says "this is the long cut's spine" | `beats.ts:47-49`, `BeatVariantBoard.tsx:36-47`, `cut.ts:58-68` |
| 3 | Every promise in the composed cut names a payer, or says none is named | PASS (vacuous) | PASS (vacuous) — ledger states emptiness honestly; add-a-promise + payer field, `incomplete` word | `PromiseLedger.tsx:27-28,45-48,71-76`; fixture declares no `promises` |
| 4 | Withholding budget editable and its allowances explained | PARTIAL | PARTIAL — three allowances + trade are editable; no gloss on spend/imply/hold, no teaser default stated | `WithholdingPanel.tsx:16-20,47-53` |
| 5 | Nothing on the path asks her to render or pick an image | **FAIL** — the only exit from the style stage is the library's generate→approve→lock flow | PASS | `stages.tsx:163-181`, `LibraryAtelier.tsx:10-12,272` |

## Findings

```json
[
  {
    "id": "SO-L1-1",
    "journey": "compose-from-scratch",
    "character": "sofia",
    "cert_level": "L1",
    "type": "broken-flow",
    "severity": "P1",
    "impact": { "frequency": "every trailer/free project on a fresh account", "reachability": "wizard stage 3, unavoidable", "trust_erosion": "high" },
    "dimension": "reachability",
    "title": "At HEAD a teaser project cannot be created on a fresh account: every preset is tagged educational, the style stage is empty and Next is disabled — repaired, honestly, in an uncommitted working-tree change",
    "expected": "A first-time film director reaches the name stage with a style she can pick, labelled for what it was written for.",
    "got": "HEAD d1f11b0: styleFits(p,'trailer') is false for all 6 presets (probe: 0/6), fittingThemes is empty on a fresh account, EmptyStyleDeck renders and Deck's Next stays disabled (done: styleId !== null). The only exit is 'commission one in the library →', which is a generate-proofs-then-lock flow (image generation) and discards the wizard draft. Working tree (uncommitted, dated 2026-09-05 in the header comment): when no preset fits, all six are offered with an amber chip 'written for educational video · fits any', the stage sub says so, and the minted theme is left untagged so it fits the project. ProjectDialog (expert path) is NOT patched and still requires a fitting locked theme.",
    "evidence": [
      "app/_projects/wizard/CreateWizard.tsx:103-127",
      "app/_projects/wizard/CreateWizard.tsx:187",
      "app/_projects/wizard/CreateWizard.tsx:244-263",
      "app/_projects/wizard/stages.tsx:136-159",
      "app/_projects/wizard/stages.tsx:163-181",
      "app/library/presets.ts:49,66,83,100,117,134",
      "lib/themes.ts:133-135",
      "components/ui/deck/Deck.tsx:66,148",
      "app/library/LibraryAtelier.tsx:10-12",
      "app/_projects/ProjectDialog.tsx:111,270"
    ],
    "code_check": "npx tsx probe: PRESETS.filter(p => styleFits(p,'trailer')).length === 0 (and 0 for 'free'). git status shows CreateWizard.tsx and stages.tsx modified, uncommitted.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "On a FRESH profile (delete uat/.profile or use a new one) walk trailer → teaser → style: confirm six cards with the 'written for educational video · fits any' chip render and 'Create & open' lands on /studio/<id>. If the working-tree patch has not landed, expect EmptyStyleDeck and a disabled Next — record which build was run.",
    "scope_note": "H1 was true at HEAD and is answered by a concurrent session's uncommitted patch; the verdict below is conditional on that patch landing."
  },
  {
    "id": "SO-L1-2",
    "journey": "compose-from-scratch",
    "character": "sofia",
    "cert_level": "L1",
    "type": "contract",
    "severity": "P1",
    "impact": { "frequency": "every teaser and cinematic project", "reachability": "Research board and Script cut, the whole path", "trust_erosion": "high" },
    "dimension": "grounding",
    "title": "The teaser gets the trailer's spine: slotsFor() ignores the template, composeCut() hard-codes rung 'long-cut', and the Structure panel then certifies the 60 s teaser as a correctly-formed long cut",
    "expected": "Per the Character's senior bar and the repo's own craft library, a teaser is two parts (a context section and one set-piece) derived by DELETING parts down the drop order — 'not the trailer with less of everything'. The board should deal a teaser slot set, or state a shortening rule, or say plainly that it is dealing the long cut's spine.",
    "got": "slotsFor(discipline) returns GLASS_HARBOR_SLOTS (8 parts: cold open, introduction, 3 escalation rungs, reset, climax, tail) for teaser, trailer and cinematic alike; the template id never reaches beats.ts or cut.ts. composeCut sets rung:'long-cut', lane:'wide-release', no droppedParts. checkLadder then reports 'ladder · rung · pass — A long cut, and no part is declared dropped' and the panel shows malformed: no · 69% enforced (probe). The board's eyebrow says 'Movie · game trailer · beat variants' and its fixture line says 'whatever the project's logline' — honest about content, silent about shape. Compose is gated on all 8 parts picked, so she cannot compose a two-part spine by leaving columns empty.",
    "evidence": [
      "app/_phases/research/beats/beats.ts:38-49",
      "app/_phases/research/beats/BeatVariantBoard.tsx:36-47,93",
      "app/_phases/script/trailer/cut.ts:42-69",
      "app/_phases/script/trailer/useTrailerCut.ts:59-75",
      "app/_phases/script/trailer/structure.ts:1027-1043,1077-1081",
      "app/_phases/script/trailer/types.ts:290-302",
      "lib/projects.ts:165-191",
      "lib/formatBrief.ts:134-160",
      "knowledge/templates/teaser/TEMPLATE.md"
    ],
    "code_check": "npx tsx probe: slotsFor('trailer').length === 8 for a teaser project; composeCut(...).rung === 'long-cut', droppedParts undefined; runStructureCheck → ladder/rung 'pass'. grep -rn 'teaser' app/_phases/research app/_phases/script/trailer → only prose in structure.ts:1079 and types.ts:299-302 (LadderRung includes 'teaser' but nothing assigns it).",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Create a teaser project, pick 8 beats, compose, open Script: confirm the composed line reads '8 picked parts … long-cut' and the Structure panel's ladder row is a green pass. Precondition: SO-L1-1 patch landed (else the project cannot be created).",
    "mock_bound": false,
    "scope_note": "The fixture being Glass Harbor is accepted (mock_bound); the finding is that the slot SET and the declared rung do not vary by template, which is wiring, not fixture content. lib/formatBrief.ts already carries a teaser brief ('Two parts, not four') that only the frames route reads."
  },
  {
    "id": "SO-L1-3",
    "journey": "compose-from-scratch",
    "character": "sofia",
    "cert_level": "L1",
    "type": "legibility",
    "severity": "P2",
    "impact": { "frequency": "every teaser project", "reachability": "Script cut header and every beat's timecode", "trust_erosion": "medium" },
    "dimension": "grounding",
    "title": "The composed cut runs to 1:50 on a 60 s target and no surface says so — targetS is never read on the research or script path",
    "expected": "A cut composed for a project whose header says 'Teaser · 60s' either fits the target or states the overrun beside the timecodes.",
    "got": "The fixture beats carry timecodes 0:00 → 1:50 (tail). composeCut copies them; TrailerScript shows '{title} · long-cut' with no runtime; the Structure checker states it 'has no access to duration'. grep targetS under app/_phases hits only frames/, cut/, score/ — never research/ or script/. The only place the 60 s target is visible is the studio header.",
    "evidence": [
      "app/_studio/trailerFixtures.ts:122,162,190,219,259,288,329,358",
      "app/_phases/script/trailer/TrailerScript.tsx:82-101",
      "app/_phases/script/trailer/structure.ts:40-43",
      "app/studio/[projectId]/StudioView.tsx:205-206"
    ],
    "code_check": "probe: composed cut last beat at '1:50'; grep -rn targetS app/_phases → frames/useFrames.ts, cut/CutTimeline.tsx, score/ScoreSpotting.tsx only.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Confirm no runtime or overrun note appears anywhere on the Script surface for a 60 s teaser whose tail beat reads @1:50. Precondition: SO-L1-1.",
    "mock_bound": false
  },
  {
    "id": "SO-L1-4",
    "journey": "compose-from-scratch",
    "character": "sofia",
    "cert_level": "L1",
    "type": "legibility",
    "severity": "P2",
    "impact": { "frequency": "every festival / specialty project", "reachability": "Script cut header", "trust_erosion": "medium" },
    "dimension": "control",
    "title": "The cut is declared 'lane: wide-release' by construction and nothing lets a festival director say otherwise",
    "expected": "types.ts names a 'specialty' lane as a recognised, successful shape whose mood-led cut should not be audited for rungs; a festival short's teaser is that lane, and she should be able to declare it.",
    "got": "composeCut hard-codes lane:'wide-release' (and never sets moodLed); the header prints 'lane: wide-release' as fact; no control on TrailerScript, StructurePanel or the board changes lane or moodLed. The spine/reset rules therefore audit her teaser as a wide-release long cut.",
    "evidence": [
      "app/_phases/script/trailer/cut.ts:57-68",
      "app/_phases/script/trailer/types.ts:383-395",
      "app/_phases/script/trailer/TrailerScript.tsx:85-88",
      "app/_phases/script/trailer/structure.ts:502"
    ],
    "code_check": "grep -rn 'lane\\|moodLed' app/_phases/script/trailer/*.tsx → read in TrailerScript.tsx only; no setter in useTrailerCut.ts (setBeat/setPayer/addPromise/setAllowance are the whole API).",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Confirm the header shows 'lane: wide-release' and no control changes it. Precondition: SO-L1-1."
  },
  {
    "id": "SO-L1-5",
    "journey": "compose-from-scratch",
    "character": "sofia",
    "cert_level": "L1",
    "type": "legibility",
    "severity": "P3",
    "impact": { "frequency": "every trailer-path project", "reachability": "WithholdingPanel, always rendered", "trust_erosion": "low" },
    "dimension": "explanation",
    "title": "The withholding budget is editable but its allowances are not explained, and the teaser's craft default (hold the turn, hold the resolution, imply the reveal) is nowhere stated",
    "expected": "Criterion 4: allowances explained. A one-line gloss per allowance (spend = shown and traded · imply = present, unresolved · hold = absent) and, for a teaser, the default the template names.",
    "got": "Three bare segmented labels 'spend / imply / hold'; a trade field appears only on spend with the placeholder 'what this spend buys, and what it costs the work'. The fixture budget's imply/hold split matches the teaser doctrine by coincidence — it is the Glass Harbor trailer's campaign budget, seeded for every project.",
    "evidence": [
      "app/_phases/script/trailer/WithholdingPanel.tsx:16-20,47-53,65-73",
      "app/_studio/trailerFixtures.ts:50-60",
      "app/_phases/script/trailer/useTrailerCut.ts:55,71",
      "knowledge/templates/teaser/TEMPLATE.md"
    ],
    "code_check": "ALLOWANCES array carries id+label only; no description field, no tooltip, no title attribute.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Hover/inspect the allowance control for any gloss; confirm none. Precondition: SO-L1-1.",
    "mock_bound": false
  },
  {
    "id": "SO-L1-6",
    "journey": "compose-from-scratch",
    "character": "sofia",
    "cert_level": "L1",
    "type": "legibility",
    "severity": "P3",
    "impact": { "frequency": "every project on this journey", "reachability": "shelf, after any research/script work", "trust_erosion": "low" },
    "dimension": "progress",
    "title": "Research and Script never report progress: the shelf's cells stay 'not started' after a composed spine and an edited cut (H4)",
    "expected": "DoD 6: 'the project is where I left it'. The shelf should show research and script as at least in progress once a spine is composed.",
    "got": "reportPhase is called only from frames/useFrames.ts:724; useBeatPicks.confirm() and useTrailerCut write step records but no phase claim, so Project.progress.research/script remain 'empty' → 'not started' on ProjectsMatrix. The work itself persists (IndexedDB per project:phase).",
    "evidence": [
      "lib/projects.ts:322-336,533",
      "app/_phases/frames/useFrames.ts:724",
      "app/_phases/research/beats/useBeatPicks.ts:62-75",
      "app/_projects/ProjectsMatrix.tsx:153-155"
    ],
    "code_check": "grep -rn reportPhase app lib → one call site, in frames.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "After composing a spine, return to /projects and read the research/script cells' title attribute; expect 'not started'. Shared with every Character on this journey.",
    "scope_note": "Not Sofia-specific; recorded once so the synthesis can count it."
  },
  {
    "id": "SO-L1-7",
    "journey": "compose-from-scratch",
    "character": "sofia",
    "cert_level": "L1",
    "type": "strength",
    "severity": "P4",
    "impact": { "frequency": "every trailer-path project", "reachability": "board, ledger, structure panel", "trust_erosion": "none" },
    "dimension": "honesty",
    "title": "The trailer path is honest where it can be: the board labels its fixture before any pick, the promise ledger states that empty is not 'promises nothing', and the structure panel draws unmeasured as loudly as violation",
    "expected": "DoD 4: know it is a stand-in before deciding; criterion 3: unnamed payers reported, not accepted.",
    "got": "BeatVariantBoard prints 'fixture · n=0 · the Glass Harbor slots, whatever the project's logline' above the columns; PromiseLedger prints 'the ledger is empty, which is not the same as the cut promising nothing' and marks an unnamed payer 'incomplete' without blocking; StructurePanel's header is 'malformed: yes / no / unmeasured' and never 'works'. The template card confesses the trailer 'may spell out plot' and the teaser is 'light on story' — her vocabulary.",
    "evidence": [
      "app/_phases/research/beats/BeatVariantBoard.tsx:44-47",
      "app/_phases/script/trailer/PromiseLedger.tsx:3-9,45-48,71-76",
      "app/_phases/script/trailer/StructurePanel.tsx:3-11,81-96",
      "lib/projects.ts:199,208"
    ],
    "code_check": "read",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Confirm the fixture line is visible above the fold on the board before any pick."
  },
  {
    "id": "SO-L1-8",
    "journey": "compose-from-scratch",
    "character": "sofia",
    "cert_level": "L1",
    "type": "legibility",
    "severity": "P3",
    "impact": { "frequency": "every wizard user who types a logline", "reachability": "name stage hint", "trust_erosion": "low" },
    "dimension": "honesty",
    "title": "The logline hint promises 'It is what the script step argues back against' — the trailer script path never reads the logline",
    "expected": "A hint that is true for the discipline chosen two stages earlier, or no promise.",
    "got": "stages.tsx:219 shows the hint for every discipline; composeCut takes title only, slotsFor takes discipline only, and the board says outright that the slots are dealt 'whatever the project's logline'.",
    "evidence": [
      "app/_projects/wizard/stages.tsx:216-229",
      "app/_phases/script/trailer/cut.ts:42-48",
      "app/_phases/research/beats/BeatVariantBoard.tsx:45"
    ],
    "code_check": "grep -rn logline app/_phases/research app/_phases/script → no hits.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Read the logline hint on the name stage for a trailer project; confirm the wording."
  }
]
```

## Verdict

**L1-conditional** — conditional on the uncommitted 2026-09-05 style-stage patch landing; at HEAD
`d1f11b0` this is **L1-fail** (SO-L1-1 blocks creation). With the patch, the journey completes end
to end but the teaser is the trailer's spine under a green ladder pass (SO-L1-2/3/4), which is the
senior bar's explicit refusal.

grounding: beat-board 0/4 (research-run and script-candidates not on this path)

time-saved-if-it-all-worked: ~150 min of two people (3 h manual → ~30 min composed spine) · confidence low — the spine she would walk out with is an 8-part long cut she still has to argue down to two parts with her editor, which is most of the two evenings.

## First-person review (L1, designed experience)

Would I adopt it? Not yet — but I read the first two screens and thought someone here has actually
cut a trailer. "A promotional cut that opens a debt another artifact pays" is the first time a tool
has described my job back to me without saying *cinematic*. The teaser card says "light on story";
the trailer card admits it "may spell out plot". Good. That is the distinction I keep having to
explain to producers.

Then the style screen. On the build I first read it was a wall: no style fits, go commission one,
which means generating pictures and approving them before I am allowed to name my film. I would
have closed the tab. On the patched build it hands me six explainer looks and says, on every card,
that they were written for explainers and I am borrowing one. Fine. That is honest. I will take
Paper Relief and change it later, and I will not hold it against you that nobody has drawn a film
look yet — as long as you keep saying so.

The board is where it loses me. It tells me, up front, that the beats are not mine — Glass Harbor,
a crew, a door — and I can live with that; I am picking shapes, not lines. What it does not tell me
is that the *shape* is not mine either. Eight columns. Three escalation rungs. A reset at 1:16, a
climax at 1:22, cards at 1:50. That is a trailer. I told you, two screens ago, that this is a
sixty-second teaser, and you wrote "one hook" on the card yourself. I cannot leave five columns
empty — the button will not enable — so I compose the trailer, and Script opens on "long-cut ·
wide-release" and a green tick that says the ladder is satisfied. The panel is careful everywhere
else, which makes that tick worse: I believe the panel, so I would believe the tick.

The withholding budget is the thing I came for and it is nearly right. Five named assets, and I
decide spend / imply / hold, and every spend has to say what it buys and what it costs. That is
the conversation with my editor, as a form. I want it to tell me what *imply* means to it, and I
want it to know that for a teaser the default is hold the turn, hold the ending, imply the reveal —
it happens to be set that way, but only because it is somebody else's trailer's budget.

The promise ledger is empty, and it says that an empty ledger is not a cut that promises nothing.
I would write my promises in and name who pays them. That is the right instrument.

What is missing for my job: a spine that is a teaser's — two parts, and the panel saying which
parts were removed, in which order — or at least the board admitting "this is the long cut's
spine; compose it and delete down". A lane switch so I am not audited as wide release. The target
runtime somewhere near the timecodes. Would I tell a peer? I would tell my editor: the vocabulary
is right, the budget is right, and the spine is a trailer wearing a teaser's name.

## First-person review (L2, live experience)

L2 verdict: **L2-conditional** — I created the teaser without rendering, the band stopped calling itself measured, and Script states my 60 s against the fixture's 1:50; the spine is still the trailer's, and the tool now says so instead of hiding it.

Finished, on a fresh account, Paper Relief borrowed and labelled. The template chip now reads `15–60s sourced · n=0 here` and the name stage says the band is "sourced from the craft library — nothing was measured for it in this studio yet". The small lie is removed.

The board still dealt eight columns (`slots=8`, the trailer's set — the harness expected it and so did I). I composed the trailer because it is the only spine on offer. Script then opened with the amber line: `your target is 60s; these beats run to 1:50 and the clock is not read here yet`. The lane is stated — wide-release — and there is still no control to say otherwise. The promise ledger said an empty ledger is not a cut that promises nothing.

So: the shape is still not mine, but the tool no longer pretends it is. The ladder row still passes "a long cut" above a note saying the clock was never read — two sentences on one page that disagree. The allowances still have no gloss for spend / imply / hold.

Would I tell a peer? "The vocabulary is right, the budget is right, and it now tells you the spine is a trailer wearing a teaser's name. That honesty is worth more than the spine."
