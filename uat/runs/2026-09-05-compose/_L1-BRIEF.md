# L1 brief — run `2026-09-05-compose` · journey `compose-from-scratch`

Mode: `update` + `run` (an overlay already existed: 4 Characters, 1 journey,
1 run from 2026-08-12). Ten NEW content-creator Characters were authored for
this journey; the four prior Characters keep their own journey and are not
walked here. Scope: **project creation → type selection → Research → Script
composition. Stop before Frames and before any image generation.**

## Read first (in this order)
1. `uat/README.md` — the product is MOCKED; L1/L2 judge the interface and the
   contract, never fixture content. Mock-content complaints are `mock_bound`.
2. `uat/rubric.md` if present (else the finding schema in the skill).
3. `uat/env.md` — the shared grounding denominators (score against THOSE).
4. `uat/journeys/compose-from-scratch.md` — the goal + definition of done.
5. Your Character file under `uat/characters/`.
6. `uat/accepted-gaps.md` — do not re-raise these; you MAY cite them as a
   ceiling.

## The surface model — entry points (follow the import chain yourself; cite file:line)
- Create: `app/projects/new/page.tsx` → `app/_projects/wizard/CreateWizard.tsx`
  + `stages.tsx` (4 deck stages: discipline · template · style · name), on
  `components/ui/deck/{Deck,DeckStage,DeckCard}.tsx`. Catalogue in
  `lib/projects.ts` (DISCIPLINES, TEMPLATES, TEMPLATE_FAMILY). Styles:
  `lib/themes.ts` (`styleFits`, `lockedOnly`) and `app/library/presets.ts`.
- Shelf: `app/projects/ProjectsView.tsx`, `app/_projects/ProjectsMatrix.tsx`,
  seed `app/_studio/projectSeed.ts`. Expert create dialog `app/_projects/ProjectDialog.tsx`.
- Studio shell: `app/studio/[projectId]/{StudioView,Stepper,phases}.tsx`.
- Research: `app/_phases/research/ResearchStep.tsx` branches by discipline:
  educational → `guided/{GuidedResearch,RunStage,passes}.tsx` (guided face) or
  `TopicPanel` + `ResearchTriageBoard` (expert face), run engine
  `run/useResearchRun.ts` + `run/controls.tsx` + `run/trace.ts`; scope
  `scope.ts`, `useScope.ts`, `_parts/{ScopeGate,ScopeBar,CardTile}.tsx`;
  trailer/free → `beats/{ModeChooser,BeatVariantBoard,SlotColumn,VariantTile,beats,useBeatPicks}.ts(x)`
  with fixture `app/_studio/trailerFixtures.ts`.
- Script: `app/_phases/script/ScriptStep.tsx` routes explainer vs trailer.
  Explainer: `candidates/{CandidatesDuel,useAdoption,useScriptFace}`, `_parts/HypothesisColumn.tsx`,
  `_matrix/*`, `_notes/*` (recalibration = real model turn, OPTIONAL here), `renders.ts`, `gate.ts`.
  Trailer: `trailer/{TrailerScript,useTrailerCut,cut,structure,PromiseLedger,WithholdingPanel,EnergyCurve,MovementSection}`.
- Persistence: `app/_phases/_shared/stepStore.ts` (IndexedDB per project:phase),
  `lib/projects.ts` (parkAt / reportPhase), `lib/studioDb.ts`.

## HYPOTHESES from the orchestrator — verify independently, and contradict me if the code says otherwise
- H1: The wizard's style stage filters presets with `styleFits(p, discipline)` and
  every preset is tagged `educational` (`app/library/presets.ts`), so a **trailer or
  free** project on an account with no locked theme sees `EmptyStyleDeck` and
  cannot finish the wizard without going to `/library` (`CreateWizard.tsx:231`).
  If true this is a `broken-flow` blocker for every trailer/free Character.
- H2: The research run is a replayed trace that lands on the Bitcoin notebook
  regardless of topic (`run/useResearchRun.ts`, `_shared/notebook/notebook.ts`);
  the notebook modal title is hard-coded `why-bitcoin-price-does-not-rise`
  (`ResearchStep.tsx:299`). Accepted gap for the CONTENT; what is NOT accepted
  is whether the surface tells the Character *before they decide* that the
  notebook is a stand-in. Check `LocalProcessNote`, `RunStage`, `ScopeBar`.
- H3: The beat board says `fixture · n=0 · the Glass Harbor slots, whatever the
  project's logline` (`BeatVariantBoard.tsx:44`) — honest — but the ModeChooser
  and the Script trailer half may not repeat it. Check where a Character first
  meets Glass Harbor content unlabelled.
- H4: `reportPhase` has reporters only in some steps (grep `reportPhase`); the
  shelf's research/script cells may never move for this journey. Verify which
  surfaces write progress.
- H5: The teaser/trailer/cinematic templates share ONE slot set (`slotsFor`
  returns `GLASS_HARBOR_SLOTS` for every non-educational discipline) — the
  "different contracts" claim in `lib/projects.ts` may not reach the board.
- H6: `ScriptStep` gates on `research.researched`; for a free project in FACTS
  mode `researched` is set by the run; in BEATS mode by `confirm()`. Check the
  `free + facts` and `free + beats` routes both reach a Script surface.

## Method (per the skill)
1. Build the surface model for YOUR Character's reachable set (project type →
   which branch of Research/Script). Reachability check BEFORE judging.
2. Grounding audit: score each AI surface you meet against `env.md`'s shared
   denominator. Wiring audit: one grep per value you suspect is unread.
3. Walk the journey in-character over the model. Apply the Character's scored
   criteria 1–5 IDENTICALLY. Enumerate every branch of a shared mapping you
   land in (e.g. `stateChip`, `DISCIPLINE_NOTE`, `slotsFor`).
4. Execute, don't eyeball: if a claim hinges on a predicate, run
   `node -e` / read the fixture and cite the reproduction.

## Output contract
Write `uat/runs/2026-09-05-compose/<character-slug>--compose-from-scratch.md` with:
- `## Surface model` (reachable set, file:line, grounding scores, wiring notes)
- `## Walkthrough` (stage by stage, cognitive-walkthrough questions)
- `## Scored criteria` (1–5, pass/fail, evidence)
- `## Findings` — a fenced ```json array of finding objects, each:
  `{ id, journey:"compose-from-scratch", character, cert_level:"L1", type, severity,
  impact:{frequency,reachability,trust_erosion}, dimension, title, expected, got,
  evidence:[...file:line], code_check, verdict:"uncertain"|"confirmed", resolution:"open",
  l2_priority:"<what L2 must verify live + its env precondition>", mock_bound?:bool, scope_note? }`
  Ids: `<CHAR-INITIALS>-L1-<n>`. Strengths are `type:"strength"` rows.
- `## Verdict` — `L1-pass` | `L1-conditional` | `L1-fail`, plus
  `grounding: research-run x/5 · beat-board x/4 · script-candidates x/4` (only
  those you met), and `time-saved-if-it-all-worked: ~N min · confidence`.
- `## First-person review (L1, designed experience)` — in the Character's
  voice: adopt? delight/frustration? fits my world? worth the wait? what's
  missing for MY job? would I tell a peer?

Return in your final message: the verdict line, the grounding line, the
time-saved line, and the findings JSON array verbatim. Nothing else.
