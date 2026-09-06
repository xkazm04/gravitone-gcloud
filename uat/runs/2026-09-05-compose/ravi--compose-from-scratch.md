# Ravi — compose-from-scratch · L1 (theoretical, code-grounded)

Character: `uat/characters/ravi-comedy-sketch.md` (RA) · scenarios S4 + S5 ·
hypotheses H1, H3, H6 · walked 2026-09-05 over the working tree (HEAD `d1f11b0`
plus an UNCOMMITTED patch to `app/_projects/wizard/{CreateWizard,stages}.tsx`
that landed mid-walk — see RA-L1-1; both states are reported).

## Surface model

Ravi's reachable set — `free` discipline → `free-form` template → style stage →
name → studio → Research (`BeatsResearch`) → ModeChooser → beat board → compose
spine → Script trailer half. Never Frames.

| Stage | Surface | Where | Reachable? |
|---|---|---|---|
| Create · discipline | "Any video" card, note "no craft template — your own discipline; the studio only keeps time" | `lib/projects.ts:126-137`, `stages.tsx:55-73` | yes |
| Create · template | one card, `free-form`, chip "15–600s accepted" (not "measured") | `lib/projects.ts:228-233`, `stages.tsx:85-88` | yes |
| Create · style | `fittingThemes = lockedOnly(themes).filter(styleFits)`; `fittingPresets` | `CreateWizard.tsx:103-130` | **HEAD: NO** (RA-L1-1) · **patched tree: yes** |
| Create · name | title / logline / runtime; free hint "Nothing was measured for a free-form video" | `stages.tsx:181-253` | yes (behind style) |
| Studio rail | steps titled Research · Script · Frames · Score · Cut, all clickable | `lib/projects.ts:42-48`, `Stepper.tsx:46` | yes |
| Research · chooser | `ModeChooser` while `beats.mode === null` | `ResearchStep.tsx:122`, `ModeChooser.tsx:18-57` | yes |
| Research · board | `BeatVariantBoard discipline="free"` + `ModeSwitch` above it | `ResearchStep.tsx:123-140`, `BeatVariantBoard.tsx` | yes |
| Research · facts (if mis-picked) | `EducationalResearch` under the same `ModeSwitch` | `ResearchStep.tsx:137` | yes |
| Compose | `api.confirm()` freezes picks, writes `research.researched=true` | `useBeatPicks.ts:62-75` | yes |
| Script | route = `free && picks.mode==="beats"` → `TrailerScript` | `ScriptStep.tsx:104-109,124-125` | yes |
| Script · no spine | Notice "no spine composed for this project yet" | `TrailerScript.tsx:40-48` | yes |
| Script · cut | header, EnergyCurve, MovementSection×8 (editable label/text/connector), PromiseLedger, WithholdingPanel, StructurePanel | `TrailerScript.tsx:80-118` | yes |

### Grounding audit (env.md denominator)

- `beat-board` — **0/4**. `slotsFor()` returns `GLASS_HARBOR_SLOTS` for every
  non-educational discipline (`beats.ts:47-49`); the board reads `discipline`
  only. Wiring grep: `targetS` and `logline` appear in
  `app/_phases/research/beats/**` and `app/_phases/script/trailer/**` ONLY
  inside comments and the fixture line (`beats.ts:41`,
  `BeatVariantBoard.tsx:45`, `trailerFixtures.ts:5-10`) — never read. Template
  is unread (free has none anyway). The locked style's tone is unread.
- `research-run` — not met (Ravi never picks facts; if he does, see H6 below).
- `script-candidates` — not met (trailer half, not Candidates).
- Trailer cut (not in the shared list, noted for completeness): `composeCut`
  reads `title` and `picks` from the project, hard-codes `rung:"long-cut"`,
  `lane:"wide-release"`, `cue: GLASS_HARBOR_CUE`, budget
  `GLASS_HARBOR_BUDGET` (`cut.ts:57-68`, `useTrailerCut.ts:63-71`). 1 of 5
  fields is the project's.

### Hypotheses

- **H1 — CONFIRMED on HEAD, addressed by an uncommitted patch.** Reproduction
  (`node -e` over `presets.ts` with `styleFits` as written at `lib/themes.ts:133-135`):
  `educational 6/6 · trailer 0/6 · free 0/6` fitting presets; a fresh account
  has no themes (`lib/useThemes.ts:10` "No seeding"; `projectSeed.ts` writes
  no theme). On HEAD `fittingThemes.length===0 && fittingPresets.length===0`
  → `EmptyStyleDeck`, `done:false`, Deck's Next is `disabled={!stage.done}`
  (`Deck.tsx:148`) and stage 4 is unreachable (`Deck.tsx:66`), so `finish`
  can never run. The link out goes to `/library`, where a lock needs an
  approved proof (`lib/themes.ts:224-231`) and proofs come from
  `/api/imaging/generate` (`LibraryAtelier.tsx:10-12`), which without a vendor
  key answers 503 (`lib/imaging/errors.ts:163`, `router.ts:307-311`). The
  expert dialog is the same dead end (`ProjectDialog.tsx:111` requires
  `themeId`; `:270-271` shows the same "No locked style fits" copy). The
  working-tree patch (`CreateWizard.tsx:110-130`) falls back to ALL presets
  when none fit, chips them "written for educational video · fits any"
  (`stages.tsx:146-148`) and mints the theme UNTAGGED (`CreateWizard.tsx:186`),
  which `styleFits` accepts. `EmptyStyleDeck` is now unreachable by
  construction (PRESETS is never empty). `ProjectDialog` is NOT patched.
- **H3 — CONFIRMED.** The board is honest (`BeatVariantBoard.tsx:40-47`, two
  sentences: "borrows the trailer spine because it is the only beat vocabulary
  the studio has" + "fixture · n=0 · the Glass Harbor slots, whatever the
  project's logline"). The ModeChooser before it says only "Candidate beats
  per part of a spine" (`ModeChooser.tsx:27`) — no hint that the beats are a
  heist fixture, but Ravi has not met content yet. The Script trailer half is
  the first UNLABELLED contact: `grep -rni "fixture|glass harbor|n=0|stand-in|borrow" app/_phases/script/trailer/*.tsx`
  → no matches, while the surface shows `cue: Low Tide — candidate cue`
  (`TrailerScript.tsx:86`), `withholding budget · campaign-glass-harbor` with
  five heist assets (`WithholdingPanel.tsx:34,46`; `trailerFixtures.ts:50-86`),
  and `lane: wide-release` / `long-cut` (`cut.ts:61-62`). The header's only
  pointer is "the picks and their rationale live in step 1" (`:96-100`).
- **H6 — CONFIRMED, both routes reach a Script surface.** `free + beats`:
  `ScriptStep.tsx:105-106` reads `research-beats.mode==="beats"` → `TrailerScript`;
  before `confirm()` it renders the "no spine composed" notice; after, the
  cut. `free + facts`: mode≠beats → `ExplainerScript`, gated on
  `research.researched` (`ScriptStep.tsx:197`), which the run writes
  (`useEducationalResearch.ts:50`). One new defect found on the beats route,
  RA-L1-3: once a cut is saved, `useTrailerCut` never recomposes
  (`useTrailerCut.ts:51-57` returns on `saved.cut`), and nothing in
  `app/_phases` ever clears `script-trailer` (`grep -rn "script-trailer"` →
  only `useTrailerCut.ts`, `useFrames.ts`, `frames.ts` reads). Reopen →
  re-pick → compose again leaves Script on the first spine.

## Walkthrough

**1 · `/projects/new`, discipline.** "What kind of video is this?" — three
cards. Ravi reads "Any video · no craft template — your own discipline; the
studio only keeps time" and picks it. Does he know what to do? Yes. Does he
know it was right? The rail summarises "Any video" (`CreateWizard.tsx:210`).
The sub-line "educational and promotional pieces are different contracts, and
the craft library measured them separately" is studio talk but skippable.

**2 · template.** One card, "Free form · 15–600s accepted · target 90s". Nothing
to decide; he clicks it. The chip honestly says "accepted" not "measured".

**3 · style.** HEAD: amber box "No locked style fits any video yet … commission
one in the library →". Next is disabled. Ravi has no idea what a "locked
visual identity" is, follows the link, finds a wall that needs a rendered
proof, and leaves. **Journey ends here on HEAD.** Patched tree: six explainer
presets, each chipped "written for educational video · fits any", sub-line
says a fitted style can be commissioned later. He picks any one — he does not
care, he is not rendering today (DoD 7 holds). The chip copy is honest.

**4 · name.** "Project name", optional logline (placeholder is the Glass Harbor
heist line — `stages.tsx:225` — mildly confusing for a comedy premise but
labelled optional), runtime seeded 90s with the hint "Nothing was measured for
a free-form video". He types "Hold music from hell", logline "A support agent
discovers the hold music is a hostage negotiation", sets 45s. Create & open.

**5 · studio, Research.** The rail says "Research" — his pet peeve — but the
step itself opens on "any video · research mode … the studio does not know
what its research is. The choice is kept … you can switch later". Two cards:
"facts to involve" (a topic in, a notebook out) and "beats to choose"
(candidate beats per part of a spine; you pick one each, Script opens on the
spine). He picks beats. Criterion 1: answerable, though "facts to involve" is
odd English and "spine" is borrowed vocabulary — see RA-L1-6.

**6 · board.** Header: "Any video · beat variants — Pick one beat per part … 8
parts … This project has no craft template; it borrows the trailer spine
because it is the only beat vocabulary the studio has." Then the mono line
"fixture · n=0 · the Glass Harbor slots, whatever the project's logline".
Criterion 3 passes here: before any decision he is told twice. Then eight
columns — cold open, introduction, escalation · rung 1/2/3, the reset, climax,
tail — 19 tiles about a harbour heist, timestamps 0:00 → 1:50 on his 45-second
sketch. Rung tiles carry "raises scale/threat/cost/speed/intimacy" chips
(`VariantTile.tsx:55-61`) — that IS his senior bar ("name what they raise")
and it is on the tile. 11 tiles carry "risk — …"; 8 carry nothing where the
risk would be (RA-L1-4). Unpicked columns say "the spine has a hole at
escalation until one is". He clicks 8 tiles; footer counts "8 of 8 parts
picked — the spine is whole"; "compose spine →" enables.

**7 · switch check.** Above the board: "research mode · beats to choose ·
[switch to facts to involve]". Clicking it swaps in the Topic panel; the picks
stay in `useBeatPicks` state and in the saved record (`{mode, picks,
confirmed}` — `useBeatPicks.ts:46-49`); switching back shows them picked.
After compose the button is disabled with a title that explains why
(`ResearchStep.tsx:128-132`). Criterion 4 passes.

**8 · compose → Script.** Rail → Script. `data-testid=trailer-script`.
"composed from · 8 picked parts · cue: Low Tide — candidate cue · lane:
wide-release / Hold music from hell · long-cut · the cue is a candidate, not
frozen". Below: an energy curve, eight movement sections with the heist beats
in editable text boxes, a promise ledger, "withholding budget ·
campaign-glass-harbor" listing "the glass floor over the harbour giving way",
a structure panel "malformed: no/yes/unmeasured". Nothing on this page says
fixture, Glass Harbor, borrowed, or stand-in. Ravi's reaction is the finding:
"whose cut is this?" He CAN retype every label and text into his sketch
(`BeatEditor.tsx:80-99`) — but the frame stays "long-cut · wide-release", the
budget stays a heist, and the checker judges a trailer. Criterion 5 fails.

**9 · change of mind.** Back to Research, "reopen", swap climax-a for
climax-b, "compose spine →" again — status says "Step 2 opens on this frozen
spine". Script still shows climax-a (RA-L1-3). Nothing on either page says so.

## Scored criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Free discipline's research-mode question answerable without the studio's words | **pass (marginal)** | `ModeChooser.tsx:18-29` — "beats to choose" carries it; "facts to involve", "spine", "notebook" are studio words but each card has a plain second line. Rail still says "Research" (`lib/projects.ts:43`). |
| 2 | Beats offered as pickable options with their downside stated on the tile | **fail** | 8 of 19 variants have no `risk` (`node` count over `trailerFixtures.ts`: cold-open-a, intro-a, esc1-a, esc2-a, esc2-c, esc3-a, reset-b, tail-a); `VariantTile.tsx:82-86` draws nothing for absence although `beats.ts:29-31` defines absent as "none was named, not none exists". |
| 3 | The board says plainly whether the beats are about his premise or a stand-in | **pass** | `BeatVariantBoard.tsx:40-47`, before any pick. (Script does not — RA-L1-2.) |
| 4 | Switch facts ⇄ beats without losing picks | **pass** | `ModeSwitch` (`ModeChooser.tsx:74-101`), picks in the same record (`useBeatPicks.ts:46-49`), lock after compose is explained (`ResearchStep.tsx:128-132`). |
| 5 | The composed spine opens Script on something readable as a sketch, not a trailer | **fail** | `cut.ts:58-62` `form:"trailer", rung:"long-cut", lane:"wide-release"`; cue + budget are Glass Harbor (`useTrailerCut.ts:68,71`); timestamps 0:00–1:50 from a 120s fixture on a 45s project (`targetS` unread); no "borrowed spine" line on Script; movement labels are trailer roles. Editable text is the only concession. |

Senior bar: rung tiles name what they raise (chips) and the three rung slots
raise disjoint variables (`trailerFixtures.ts:108-110`) — the instrument can
express escalation. The composed list ends on "tail — cards and button", a
title card, not a comedic button; that is fixture content (mock-bound) but the
structure has no "payoff" slot for a sketch, which is the borrowed-spine cost.

## Findings

```json
[
  {
    "id": "RA-L1-1",
    "journey": "compose-from-scratch",
    "character": "ravi",
    "cert_level": "L1",
    "type": "broken-flow",
    "severity": "P0",
    "impact": { "frequency": "every free or trailer project on a fresh account", "reachability": "stage 3 of the create wizard, and the expert dialog", "trust_erosion": "total — the journey cannot start" },
    "dimension": "reachability",
    "title": "Free project cannot be created on a fresh account (H1) — confirmed on HEAD, addressed by an uncommitted wizard patch; the expert dialog still dead-ends",
    "expected": "Picking Any video leads to a style pick Ravi can make without leaving the wizard, or the stage says a style is optional for a project that renders nothing today.",
    "got": "HEAD: every preset is tagged educational and styleFits(p,'free') rejects all six (node: free 0/6); no theme is seeded; EmptyStyleDeck renders with done:false, Next is disabled, finish is unreachable. The way out is /library, whose lock needs an approved proof from /api/imaging/generate (503 without a vendor key). Working tree: CreateWizard falls back to all presets when none fit, chips them 'written for educational video · fits any' and mints the theme untagged. ProjectDialog.tsx:111,270 is not patched and still requires a fitting locked theme.",
    "evidence": ["app/_projects/wizard/CreateWizard.tsx:103-130", "app/_projects/wizard/CreateWizard.tsx:186", "app/_projects/wizard/CreateWizard.tsx:231-239", "app/_projects/wizard/stages.tsx:146-148", "app/_projects/wizard/stages.tsx:163-181", "components/ui/deck/Deck.tsx:66", "components/ui/deck/Deck.tsx:148", "lib/themes.ts:133-135", "lib/themes.ts:224-231", "app/library/presets.ts:49-134", "lib/useThemes.ts:10", "app/library/LibraryAtelier.tsx:10-12", "lib/imaging/errors.ts:163", "app/_projects/ProjectDialog.tsx:111", "app/_projects/ProjectDialog.tsx:270-271"],
    "code_check": "node -e over presets.ts with styleFits as written: educational 6/6, trailer 0/6, free 0/6 fitting presets. git status: CreateWizard.tsx and stages.tsx are ' M' (uncommitted) against HEAD d1f11b0.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "On the PATCHED build: fresh profile → /projects/new → Any video → Free form → style stage must show six preset cards with the amber 'written for educational video · fits any' chip, Next enabled after a pick, Create & open lands in /studio/<id>. Then repeat via the shelf's expert dialog and expect the dead end (unpatched). Precondition: uat/.profile with no themes; the patch must be committed or L2 runs against HEAD and reproduces the blocker.",
    "scope_note": "The fix arrived mid-walk from another session; this report grades HEAD as failed and the working tree as passing, and flags the dialog as the remaining copy of the rule."
  },
  {
    "id": "RA-L1-2",
    "journey": "compose-from-scratch",
    "character": "ravi",
    "cert_level": "L1",
    "type": "honesty",
    "severity": "P1",
    "impact": { "frequency": "every beats-mode project that composes a spine", "reachability": "Script, one rail click after compose", "trust_erosion": "high — the first page whose content he cannot attribute" },
    "dimension": "legibility",
    "title": "The Script trailer half is the first unlabelled contact with Glass Harbor (H3) — cue, campaign budget, lane and rung are fixture, and nothing on the page says so",
    "expected": "The same two sentences the board carries — borrowed spine, fixture n=0 — repeated once at the top of the cut, so the heist budget and the 'Low Tide' cue read as stand-ins.",
    "got": "grep for fixture|glass harbor|n=0|stand-in|borrow over app/_phases/script/trailer/*.tsx returns nothing. The page shows 'cue: Low Tide — candidate cue', 'withholding budget · campaign-glass-harbor' with five heist assets, 'lane: wide-release', 'long-cut'. The only pointer is 'the picks and their rationale live in step 1'. ModeChooser before the board also gives no hint the beats are a fixture, but there he has met no content yet.",
    "evidence": ["app/_phases/script/trailer/TrailerScript.tsx:82-101", "app/_phases/script/trailer/WithholdingPanel.tsx:34", "app/_phases/script/trailer/cut.ts:57-68", "app/_phases/script/trailer/useTrailerCut.ts:63-71", "app/_studio/trailerFixtures.ts:30-86", "app/_phases/research/beats/BeatVariantBoard.tsx:40-47", "app/_phases/research/beats/ModeChooser.tsx:24-28"],
    "code_check": "grep -rni 'fixture|glass harbor|n=0|stand-in|borrow' app/_phases/script/trailer/*.tsx → 0 matches; BeatVariantBoard.tsx:45 is the only fixture line on the route.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "After compose on a free project titled anything but Glass Harbor, open Script and assert no text node matches /fixture|stand-in|borrow/i while 'campaign-glass-harbor' and 'Low Tide' are visible. Precondition: a free project in beats mode with all 8 slots picked."
  },
  {
    "id": "RA-L1-3",
    "journey": "compose-from-scratch",
    "character": "ravi",
    "cert_level": "L1",
    "type": "broken-flow",
    "severity": "P1",
    "impact": { "frequency": "any second compose on a project", "reachability": "reopen → re-pick → compose, three clicks", "trust_erosion": "high — the surface promises Script follows and it silently does not" },
    "dimension": "persistence",
    "title": "A re-composed spine never reaches Script — the saved cut wins and nothing invalidates it",
    "expected": "'Reopen to change a pick; it must be composed again' (board footer) → Script opens on the newly composed spine, or says it is still on the old one.",
    "got": "useTrailerCut hydrates from the saved script-trailer record and returns before reading picks whenever saved.cut exists; the seed from picks runs only when no cut was ever saved. useBeatPicks.confirm/reopen write research-beats and research only. No code in app/_phases deletes or rewrites script-trailer on reopen or confirm. So the first composition is permanent; edits in Script persist, but a changed pick in Research is never reflected.",
    "evidence": ["app/_phases/script/trailer/useTrailerCut.ts:48-79", "app/_phases/research/beats/useBeatPicks.ts:62-81", "app/_phases/research/beats/BeatVariantBoard.tsx:70-76"],
    "code_check": "grep -rn 'script-trailer' app/_phases → useTrailerCut.ts (read+write of its own), useFrames.ts / frames.ts (reads only); no delete path in stepStore is called for it.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Free project, beats mode: pick climax-a, compose, open Script (note the climax text), back to Research, reopen, pick climax-b, compose, open Script — assert the climax beat text is still climax-a's. Precondition: IndexedDB profile persists between the two Script visits (it does)."
  },
  {
    "id": "RA-L1-4",
    "journey": "compose-from-scratch",
    "character": "ravi",
    "cert_level": "L1",
    "type": "expressiveness",
    "severity": "P2",
    "impact": { "frequency": "8 of 19 tiles on every board", "reachability": "the board itself", "trust_erosion": "medium — a silent tile reads as 'no downside', the type says 'unstated'" },
    "dimension": "legibility",
    "title": "A variant with no named risk draws nothing where the downside goes, although the type defines absence as 'none was named, not none exists'",
    "expected": "Criterion 2: every tile states its downside — or states that none was named.",
    "got": "VariantTile renders the 'risk — …' line only when variant.risk is set; the fixture leaves it off 8 variants (cold-open-a, intro-a, esc1-a, esc2-a, esc2-c, esc3-a, reset-b, tail-a). The missing risks are fixture content; the absence of a 'no downside named' placeholder is interface.",
    "evidence": ["app/_phases/research/beats/VariantTile.tsx:82-86", "app/_phases/research/beats/beats.ts:28-36", "app/_studio/trailerFixtures.ts:114-378"],
    "code_check": "node count over GLASS_HARBOR_SLOTS: 19 variants, 11 with risk, 8 without.",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": true,
    "l2_priority": "On the board, assert that tiles variant-cold-open-a and variant-intro-a contain no 'risk' text while variant-cold-open-b does; the interface half (placeholder) is what a fix would change.",
    "scope_note": "mock_bound for the eight missing sentences; NOT mock-bound for the tile drawing silence as if it were a clean bill."
  },
  {
    "id": "RA-L1-5",
    "journey": "compose-from-scratch",
    "character": "ravi",
    "cert_level": "L1",
    "type": "grounding",
    "severity": "P2",
    "impact": { "frequency": "every free project", "reachability": "board tiles and Script header", "trust_erosion": "medium — numbers on his screen contradict the number he typed" },
    "dimension": "grounding",
    "title": "The board and the cut ignore the project's runtime and logline: 0:00–1:50 timestamps and 'long-cut · wide-release' on a 45-second sketch",
    "expected": "Either the tile timestamps and the cut's rung/lane derive from targetS/template, or the surface says they are the fixture's 120 s.",
    "got": "targetS and logline are never read under research/beats or script/trailer (only in comments and the fixture line). Every tile shows a fixture 'at' (0:00 … 1:50); composeCut hard-codes rung 'long-cut' and lane 'wide-release'. The board's fixture line covers the logline but not the clock; Script covers neither.",
    "evidence": ["app/_phases/research/beats/beats.ts:47-49", "app/_phases/script/trailer/cut.ts:57-68", "app/_phases/research/beats/VariantTile.tsx:52-54", "app/_studio/trailerFixtures.ts:10", "app/_studio/trailerFixtures.ts:122"],
    "code_check": "grep -rn 'targetS|logline' app/_phases/research/beats app/_phases/script/trailer → matches only in comments/fixture-line text. Timestamps on tiles: 0:00 0:12 0:30 0:45 1:00 1:16 1:22 1:50.",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": true,
    "l2_priority": "Create a free project with targetS 45; on the board assert a tile shows '1:50'; on Script assert 'long-cut' and 'wide-release' are visible. Precondition: none beyond the project.",
    "scope_note": "Grounding is the accepted fixture gap; the interface part is that the clock and lane are presented as the project's without a label."
  },
  {
    "id": "RA-L1-6",
    "journey": "compose-from-scratch",
    "character": "ravi",
    "cert_level": "L1",
    "type": "copy",
    "severity": "P3",
    "impact": { "frequency": "once per free project", "reachability": "first screen of Research", "trust_erosion": "low — recoverable via ModeSwitch" },
    "dimension": "vocabulary",
    "title": "ModeChooser labels lean on studio words — 'facts to involve', 'spine', 'notebook' — and the rail still calls the step Research",
    "expected": "Two options a sketch writer reads cold: e.g. 'I need facts' / 'I need beats', with 'beats' explained as an escalating list he picks from.",
    "got": "'facts to involve' and 'beats to choose', each with one plain sentence; the free note explains that the studio does not know what its research is. Adequate — criterion 1 passes — but the copy is close to his vocabulary rather than in it, which is exactly his pet peeve, and nothing says the beat vocabulary is borrowed until the board.",
    "evidence": ["app/_phases/research/beats/ModeChooser.tsx:18-29", "app/_phases/research/beats/ModeChooser.tsx:35-40", "lib/projects.ts:42-48"],
    "code_check": "labels read from OPTIONS[] and MODE_LABEL; PHASE_TITLE.research = 'Research'.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Low; observe only. Assert both mode-facts and mode-beats buttons are visible and the free note is present."
  },
  {
    "id": "RA-L1-7",
    "journey": "compose-from-scratch",
    "character": "ravi",
    "cert_level": "L1",
    "type": "strength",
    "severity": "P3",
    "impact": { "frequency": "every free project", "reachability": "above the board", "trust_erosion": "none" },
    "dimension": "reversibility",
    "title": "The facts ⇄ beats switch is reversible, keeps the picks, and explains the one time it is locked",
    "expected": "Criterion 4.",
    "got": "ModeSwitch drawn above whichever board; picks and mode share one record so a switch changes mode only; after compose the button is disabled with a title saying to reopen the spine because Script reads researched.",
    "evidence": ["app/_phases/research/beats/ModeChooser.tsx:74-101", "app/_phases/research/ResearchStep.tsx:123-140", "app/_phases/research/beats/useBeatPicks.ts:46-51"],
    "code_check": "setMode only calls setModeState; the persisted record is {mode, picks, confirmed}.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Pick two tiles, switch to facts, switch back, assert both tiles still aria-pressed=true."
  },
  {
    "id": "RA-L1-8",
    "journey": "compose-from-scratch",
    "character": "ravi",
    "cert_level": "L1",
    "type": "strength",
    "severity": "P3",
    "impact": { "frequency": "every board", "reachability": "board header", "trust_erosion": "none" },
    "dimension": "honesty",
    "title": "The beat board tells a free project twice, before any pick, that the spine is borrowed and the beats are a fixture",
    "expected": "Criterion 3.",
    "got": "'This project has no craft template; it borrows the trailer spine…' plus 'fixture · n=0 · the Glass Harbor slots, whatever the project's logline'. Rung tiles also chip what they raise, which is the senior bar's 'name what they raise'.",
    "evidence": ["app/_phases/research/beats/BeatVariantBoard.tsx:40-47", "app/_phases/research/beats/VariantTile.tsx:55-61"],
    "code_check": "static JSX, discipline==='free' branch.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Assert the header text contains 'borrows the trailer spine' and 'fixture · n=0'."
  },
  {
    "id": "RA-L1-9",
    "journey": "compose-from-scratch",
    "character": "ravi",
    "cert_level": "L1",
    "type": "strength",
    "severity": "P3",
    "impact": { "frequency": "every create", "reachability": "wizard stages 1, 2, 4", "trust_erosion": "none" },
    "dimension": "vocabulary",
    "title": "The type question is in his words — 'Any video · no craft template — your own discipline; the studio only keeps time' — and the free-form runtime refuses to claim a measurement",
    "expected": "Definition of done 2.",
    "got": "Discipline card copy from DISCIPLINE_NOTE.free; template chip says '15–600s accepted' rather than 'measured'; runtime hint says 'Nothing was measured for a free-form video'.",
    "evidence": ["lib/projects.ts:126-137", "app/_projects/wizard/stages.tsx:85-88", "app/_projects/wizard/stages.tsx:237-239"],
    "code_check": "static catalogue strings.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Assert the Any video card body and the 'accepted' chip render."
  }
]
```

## Verdict

**L1-fail** on HEAD (RA-L1-1 blocks stage 3 of create for every free project);
**L1-conditional** on the working tree, conditional on committing the wizard
patch and on RA-L1-2 / RA-L1-3 (Script never says the cut is a fixture; a
second compose never reaches Script). Criteria: 1 pass · 2 fail · 3 pass ·
4 pass · 5 fail.

grounding: beat-board 0/4

time-saved-if-it-all-worked: ~20 min per sketch (30 → under 10, three options
per beat with what each raises on the tile) · confidence low-medium — for the
fixture premise it saves nothing and costs him the reading, per his own rule.

## First-person review (L1, designed experience)

Adopt? Not today. On the version that was committed I never got a project —
"no locked style fits any video" and a link to a library that wants me to
render something before I can name a sketch. Someone fixed that while I was
standing there; fine, the six explainer looks with "written for educational
video · fits any" on them are honest and I do not care which one I pick.

The good bit: the "Any video" card is my words, the research question is
almost my words, and the board is upfront — "borrows the trailer spine",
"fixture, whatever your logline" — before I click anything. The tiles say
what each beat raises. That is the thing I would pay for, if the beats were
about a call centre instead of a harbour heist.

The bad bit: I compose, go to Script, and get "Hold music from hell · long-cut
· lane: wide-release · cue: Low Tide" with a withholding budget about a glass
floor. Nothing on that page says borrowed or fixture. Where's the joke in
this? I can retype every beat, and I would — but the frame still calls my
45-second sketch a long cut, the timeline says 1:50, and if I go back and swap
the climax, Script keeps the old one and does not tell me. That last one would
cost me a take.

Would I tell a peer? "Wait for it — the beat board is the right idea, the
script page does not know whose script it is yet."

## First-person review (L2, live experience)

L2 verdict: **L2-conditional** — I got a project, the board told me it was borrowed, Script now says so too and names my 45 s; it is still a trailer frame around a heist, so no joke yet.

Finished. "Any video", one template card, six explainer looks with a chip that admits it (`borrowed=true`), "Hold music — a sketch", 45 s. The research question still opened with "A topic goes in, a notebook comes out, and you scope what the script may use" — the harness flagged it and so would I; I picked "beats" because it was the other one.

The board said borrowed and fixture before I clicked anything. I picked two tiles, flipped to facts and back, and the picks were still there (`picks survive a facts⇄beats round trip`). After compose the switch locked and said why: `reopen the composed spine first — composing it marked this project researched, and Script reads that`. Studio words, but a reason.

Script is where design and walk differ: the page now opens with `the beat text, the cue and the withholding budget are the Glass Harbor stand-in … your target is 45s; these beats run to 1:50`. So "whose cut is this?" is answered. It is still "long-cut · wide-release", the timeline still runs to 1:50, the tail is still a title card, eight tiles still show no downside.

Would I tell a peer? "The beat board is the right idea and the script page finally admits whose script it is. Wait for it to be about your premise."
