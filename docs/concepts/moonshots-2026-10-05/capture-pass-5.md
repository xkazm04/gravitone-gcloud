# Capture pass 5 · 2026-10-18 · the catalogue against Gravitone Next

Pass 4 (`f9da7bf9`, 2026-10-14) was the last capture. Every commit since then is the rebuild
(`docs/next/migration-plan.md`, Phases 0-6, `81fbf98c`..`c3ddb052`, 2026-10-14..18). Phase 6 retired
v1 under `app/` (`ed151a11`): `app/{foundry,playground,articles,calendar,_phases (bar the compositor),
_projects,_studio,board,studio,projects}`, 92 `app/api` routes, `StudioFrame`, the Almanac kit,
`components/ui/{deck,shell,Modal,...}`, `lib/board`, and IndexedDB as a store (only the importer reads
it now). Many cards named one of those surfaces as their target.

## What was examined

The README catalogue has 72 rows. Pass 5 re-read every row that is not `landed` or `declined`:

- **12** `open` and **27** `partial` rows;
- **2** `merged into …` rows that still owe residue (`frames-score-cut-A`: the take-fit row;
  `pipeline-scripts-B`: the live-lane PATH shim).

The other 6 merged rows were not re-examined, because their parent closed them before the rebuild
with no residue left open: `research-run-engine-A` and `text-engine-A` (AIO-A), `phase-shared-B`
(research-scope-board-A), `library-view-A` (WORKSPACE-B), `library-view-B` (foundry-forge-B), and
`imaging-music-probes-A` (IMG-A; its residue was marked optional). The brief's estimate of about 49
open and 14 partial does not match the catalogue as committed at `60e3ab86`: that has 12 and 27.

**41 rows examined. Each got exactly one status, and 0 were left unclassified.**

| Status | Meaning | Rows |
| --- | --- | --- |
| LANDED-BY-NEXT | The rebuild delivered the card's intent. Shas checked with `git show --stat` against the carrying file | 14 |
| SUPERSEDED | The target surface was retired, and Next's record model makes the problem moot | 4 |
| STANDS-RETARGETED | The intent is still open; the card's target is rewritten onto a Next surface | 18 |
| STANDS-UNCHANGED | The rebuild did not touch it (pipeline Python, probe and mutant lanes) | 5 |

How it was done: nine read-only scouts, one per area file. Each re-read its cards against the tree at
`60e3ab86`. The capturing session then re-checked every LANDED-BY-NEXT sha with
`git show --stat <sha> -- <file>` and grepped the carrying code. In four cases a scout had credited a
file to the wrong commit; those rows now cite the commit that actually adds the file. No code ran
and no paid call was made.

Read the statuses this way:
- **LANDED-BY-NEXT** means the intent is delivered, not that every Acceptance case is green. Each
  row lists its residue. Several cards' pre-rebuild partial work (pure cores in `lib/`) was what the
  rebuild finally wired. The sha cited is the wiring.
- **The partial work of a SUPERSEDED or retargeted card that lived in a retired file left with v1.**
  The row says when that happened.
- **Landed rows from passes 1-4 were not re-examined.** Some of their code was retired too: for
  example WORKSPACE-B's Outputs panel and keep-on-shelf, UI-SHELL-B's palette, and foundry-dojo-B's
  DojoView. Whether Next carries each of them forward is a question for a later pass.

## Per card, in catalogue order

### `SHELF-A` · STANDS-RETARGETED

Card: [01-studio-hub.md](01-studio-hub.md).

The card targeted the v1 race sheet and an IndexedDB `digests` store (retired: app/_projects/{shelf,useShelf,RaceSheet}.ts, lib/studioDb.ts digests, app/_phases/*/digest.ts). The Next composition list (app/(studio)/projects/_plan/CompositionList.tsx, over ProjectSummary from @gt/domain/produce) shows a pip per part, ETA, failed and gate chips and cost. It does not show a poster, runtime against target, or a free-text search over a project's own content.

**Retarget:** Add poster, runtimeS vs target and a content search to ProjectSummary in the server read (app/(studio)/projects/_port/realRead.ts, packages/kernel/src/records/read.ts), and draw them in app/(studio)/projects/_plan/CompositionList.tsx.

**Next / live paths:** `app/(studio)/projects/_plan/CompositionList.tsx`, `app/(studio)/projects/_port/realRead.ts`, `packages/kernel/src/records/read.ts`, `packages/domain/src/produce.ts`

**Retired:** `app/_projects/shelf.ts`, `app/_projects/RaceSheet.tsx`, `lib/studioDb.ts (digests store)`

**Residue and doubts:** Spend per project and per-part state already land in Next, so the spend Tally and blocker parts of the card are done. The '5 MB step record per lane' premise is gone because records sit in server SQLite with derived reads. What is left is the poster, runtime-vs-target and search over research/script text.

### `SHELF-B` · LANDED-BY-NEXT

Card: [01-studio-hub.md](01-studio-hub.md).

Projects now live in the server SQLite kernel store, so a browser sign-out no longer destroys the only copy. lib/import/{archive,commit,project,export}.ts and /projects/import (057cf63d) import v1's .gravitone archive. The import refuses bad archives with v1's named codes and skips ids already present. It also re-exports a kernel project as a .gravitone archive (exportProjects, lib/import/serve.ts), and the round trip is checked by exit-roundtrip.

**Shas (checked with `git show --stat`):** `057cf63d` (lib/import/{archive,commit,export}.ts, app/(studio)/projects/import/ImportView.tsx)

**Next / live paths:** `lib/import/export.ts`, `lib/import/archive.ts`, `lib/import/commit.ts`, `lib/import/project.ts`, `lib/import/serve.ts`, `app/(studio)/projects/import/ImportView.tsx`

**Retired:** `components/ui/UserMenu.tsx`, `app/_projects/RaceSheet.tsx`

**Residue and doubts:** Not delivered: duplicateProject (only styles have a Duplicate act); the storage.persist chip (moot). Residual: the shell's sign-out (app/(studio)/_shell/Providers.tsx via lib/useAuth.tsx) still runs v1 evictIdentity over IndexedDB, which still wipes any v1 browser rows not yet imported. Not imported means the only copy. This is a small window that only applies to legacy data. The lock-instead-of-wipe half (policy-loosen) was declined 2026-10-06 and is moot for Next records.

### `DATA-A` · SUPERSEDED

Card: [01-studio-hub.md](01-studio-hub.md).

The card's targets are retired: lib/themes.ts, lib/assets.ts, lib/useThemes.ts, lib/useAssets.ts, lib/board/sources/proof.ts, app/library/LibraryAtelier.tsx, app/_projects/wizard/CreateWizard.tsx, and the IndexedDB themes/assets/uploads stores (read only by the importer). Next replaces them with a SQLite kernel store: declared REFERENCES/ON DELETE CASCADE in the schemas, every write one transaction plus an event, rev-guarded writes, and styles with no delete op at all (packages/kernel/src/styles/writers.ts, ce2b7cee; Phase 5 Director decision). So 'a locked style vanishes', the multi-transaction cascades and the proof lost-update are moot.

**Next / live paths:** `packages/kernel/src/styles/writers.ts`, `packages/kernel/src/records/schema.ts`, `packages/kernel/src/library/schema.ts`

**Retired:** `lib/themes.ts`, `lib/assets.ts`, `lib/useAssets.ts`, `lib/board/sources/proof.ts`, `app/library/LibraryAtelier.tsx`

**Residue and doubts:** Ask S2 (archive-not-delete) is mooted, not decided, by the 'no delete op for styles' ruling. lib/identityEviction.ts's hand list survives only for legacy IndexedDB rows.

### `DATA-B` · LANDED-BY-NEXT

Card: [01-studio-hub.md](01-studio-hub.md).

Per-hook IndexedDB caches are retired (lib/useProjects/useThemes/useAssets, StudioView). Next screens read on the server and stay live through a key-only change feed. The kernel event log is streamed over SSE (app/_server/sse.ts and /api/events/stream, cf6b2546), and app/(studio)/_shell/liveFeed.ts (47b8095b) coalesces events into one router.refresh ('events carry advice, reads carry truth'). Each tab holds its own stream, which covers cross-tab updates.

**Shas (checked with `git show --stat`):** `cf6b2546` (app/_server/sse.ts, app/api/events/stream/route.ts) · `47b8095b` (app/(studio)/_shell/liveFeed.ts)

**Next / live paths:** `app/(studio)/_shell/liveFeed.ts`, `app/_server/sse.ts`, `app/api/events/stream/route.ts`, `app/(studio)/floor/_floor/Floor.tsx`, `app/(studio)/projects/runs/_runs/Runs.tsx`

**Retired:** `lib/useProjects.ts`, `app/studio/[projectId]/StudioView.tsx`

**Residue and doubts:** Only the Floor, Runs and the studio header subscribe (openFeed). The Plan (/projects/[id]), part editors and Library do not, so the 'every read live' reach is partial. The hook-specific Acceptance (useList/useRecord, BroadcastChannel) is moot by design.

### `SLP-A` · STANDS-UNCHANGED

Card: [01-studio-hub.md](01-studio-hub.md).

tests/mutants/registry.ts (47 entries), tests/mutants/ledger.json, pipeline/probe-mutants.mts (+ pipeline/mutants-core.mts) and tests/golden-path/mutant-registry.probe.spec.ts are all still present and have the same role. The rebuild kept them current as v1 files retired, and added a sibling unit mutation rung (pipeline/unit-mutants.mts, tests/mutants-unit, 90f3bb55).

**Next / live paths:** `tests/mutants/registry.ts`, `tests/mutants/ledger.json`, `pipeline/probe-mutants.mts`, `pipeline/mutants-core.mts`, `tests/golden-path/mutant-registry.probe.spec.ts`, `pipeline/unit-mutants.mts`, `tests/mutants-unit/registry.ts`

**Residue and doubts:** Still partial with the same residue. Case 4 is still open by design: a full run writes tests/mutants/ledger.json in the main tree (probe-mutants.mts:78). Case 2 still has no committed toothless-mutant run. New gap from Phase 6: the probe runner cannot see a mutation in packages/**, and a unit twin covers it instead.

### `SLP-B` · STANDS-RETARGETED

Card: [01-studio-hub.md](01-studio-hub.md).

The v1 targets are retired (app/_studio/scenarios.ts, app/_phases/*/scenarios.ts, app/studio/[projectId]/StudioView.tsx, app/_studio/projectSeed.ts). Next's fixture side of the produce port (app/(studio)/projects/_port/fixtureData.ts, [id]/_part/fixture*.ts) and the cx ids part-*/studio-* in pipeline/cx-screens.mjs reach one seeded state per part editor. fixtureData has 12 done, 1 failed and 1 running job state, and there is no (part, state) catalogue, no ?scenario id and no coverage probe.

**Retarget:** Add a (part kind x state) scenario catalogue to the fixture produce port (app/(studio)/projects/_port/fixtureData.ts + app/(studio)/projects/[id]/_part/fixture*.ts), with cx ids like part-frames@refused in pipeline/cx-screens.mjs and a coverage-budget probe.

**Next / live paths:** `app/(studio)/projects/_port/fixtureData.ts`, `app/(studio)/projects/[id]/_part/fixtureFramesView.ts`, `pipeline/cx-screens.mjs`, `pipeline/cx-capture.mjs`

**Retired:** `app/_studio/projectSeed.ts`, `app/studio/[projectId]/StudioView.tsx`

**Residue and doubts:** Gate was policy-loosen (harness writes no fixtures). Under Next, the fixture side of the port (GRAVITONE_PRODUCE_SIDE=fixture) is already sanctioned product code, which may make the policy question moot. The operator should confirm that, and this scout does not decide it.

### `WORKSPACE-A` · LANDED-BY-NEXT

Card: [01-studio-hub.md](01-studio-hub.md).

Part verdicts are pure functions over persisted part records, computed on the server with nothing mounted: lib/parts/verdict.ts covers frames, motion, score and cut with ads faces, and the research and script verdicts are in app/(studio)/projects/[id]/_part. They feed the PartView, and READY opens the gate packet (lib/parts/gates.ts), all in e54e14fe. Part and project state are derived on read (packages/domain/src/project.machine.ts projectStateOf, kernel records 9cb1b4bc). This retires usePhaseReport, the seed's asserted states and the unreachable 'delivered' for Cut and Score.

**Shas (checked with `git show --stat`):** `e54e14fe` (lib/parts/verdict.ts, lib/parts/gates.ts) · `9cb1b4bc` (packages/kernel/src/records/read.ts)

**Next / live paths:** `lib/parts/verdict.ts`, `lib/parts/gates.ts`, `lib/parts/context.ts`, `packages/kernel/src/parts/core.ts`, `packages/kernel/src/records/read.ts`, `packages/domain/src/project.machine.ts`

**Retired:** `app/_phases/_shared/stepContract.ts`, `app/_phases/_shared/usePhaseReport.ts`

**Residue and doubts:** Stage 3 case 5 (upstream basis change marks a ratified downstream part staleSince) is not found in Next. The only staleness is the ads 'record for another scenario reads stale'. Ask S1a-d (done/empty/applicability/ads) was answered by the rebuild's design: sign-off is the gate packet, and READY is the verdict's ceiling.

### `research-run-engine-B` · STANDS-RETARGETED

Card: [02-research-script.md](02-research-script.md).

Stages 1-2 (pre-rebuild 9e81447: lib/text/providers/claudeCliRetrieve.ts, lib/notebook/retrieval.ts 'cited, not fetched', engineReceipt.searched from receipts) survive in lib and Next wires them: lib/turns/kinds/research.ts dispatches retrieval first when TEXT_RETRIEVE is on, and lib/producers/research.ts:246-247 (7a5e0b9f) stores kind researched/reasoned from engine.searched. The kernel router has the retrieve candidate and the policy-forbidden refusal (packages/kernel/src/router/route.ts:98, tables.ts:167). Stages 3-4 are open: there is no streamed phase trace anywhere (no TraceStep or PHASE parsing in lib/text, lib/turns or the producers), and the research part editor (Notebook.tsx) never renders the source.kind chip or the source receipts. The v1 RunTrace.tsx and LiveResult.tsx were retired with app/_phases.

**Retarget:** The phase trace streams as kernel job progress/events from lib/producers/research.ts (notebookUnit) through lib/text/providers/claudeCliRetrieve.ts. The reasoned/researched chip and the receipts render in app/(studio)/projects/[id]/[part]/_edit/Notebook.tsx from NotebookBoard.source.kind and engine (packages/domain/src/partView.data.ts:89).

**Next / live paths:** `lib/text/providers/claudeCliRetrieve.ts`, `lib/notebook/retrieval.ts`, `lib/notebook/engineReceipt.ts`, `lib/turns/kinds/research.ts`, `lib/producers/research.ts`, `packages/kernel/src/router/route.ts`, `packages/kernel/src/router/tables.ts`, `packages/domain/src/partView.data.ts`, `app/(studio)/projects/[id]/[part]/_edit/Notebook.tsx`

**Retired:** `app/_phases/research/run/RunTrace.tsx`, `app/_phases/research/run/LiveResult.tsx`, `app/api/research/route.ts`

**Residue and doubts:** The card's gate is policy-loosen and is the operator's decision: the README lists 'give the research engine WebSearch,WebFetch (prompt-injection surface)'. TEXT_RETRIEVE is still off by default and no live retrieval run has been made. The stage 1-2 code predates the rebuild; the rebuild only carried it into the producer.

### `research-scope-board-B` · LANDED-BY-NEXT

Card: [02-research-script.md](02-research-script.md).

Next makes follow-ups real turns. packages/producers/src/research/followUp.ts (7a5e0b9f) checks the answer against an allowlist and refuses all of it if any effect names an unknown id (case 7). lib/producers/research.ts followUpUnit asks against reviseNotebook(base, revisions). The research part record persists followUps[] and revisions[] (fixtureResearch.ts and realResearch.ts, 99a23228), so a reload keeps the queue and its effects. Notebook.tsx has per-effect apply and reject through the decide-effect op, and researchView.ts derives each effect's landing and the board from reviseNotebook (lib/research/revisions.ts). The server-side part undo (PartEditor.tsx undoPart) reverses a decision.

**Shas (checked with `git show --stat`):** `7a5e0b9f` (packages/producers/src/research/followUp.ts, lib/producers/research.ts) · `99a23228` (app/(studio)/projects/[id]/_part/fixtureResearch.ts) · `6d24d9b8` (app/(studio)/projects/[id]/_part/realResearch.ts)

**Next / live paths:** `packages/producers/src/research/followUp.ts`, `lib/producers/research.ts`, `lib/research/revisions.ts`, `app/(studio)/projects/[id]/_part/fixtureResearch.ts`, `app/(studio)/projects/[id]/_part/realResearch.ts`, `app/(studio)/projects/[id]/_part/researchView.ts`, `app/(studio)/projects/[id]/[part]/_edit/Notebook.tsx`, `packages/domain/src/partView.ts`

**Retired:** `app/_phases/research/followup.ts`, `app/_phases/research/useFollowUps.ts`, `app/_phases/research/_parts/FollowUpQueue.tsx`

**Residue and doubts:** There is no dedicated 'undo revision' control. Undo is the generic last-op part undo, not a checkpoint restore of a chosen revision. I did not confirm that the digest returns after an undo (case 5) beyond the generic undo. Ask A4 (the scope key) was resolved by a decision recorded in code: the scope digest is the BASE notebook's, so an applied revision does not orphan the scope (fixtureResearch.ts header).

### `script-phase-A` · LANDED-BY-NEXT

Card: [02-research-script.md](02-research-script.md).

Session 1 (draft.ts, impactOf, editPlanSchema(draft), derived ledgerFor) predates the rebuild and moved to lib/script in 33b6484c. Next delivers the s2 intent: the script part record holds this project's candidates (fixtureScript.ts ScriptRec.candidates, empty until composed, with no fallback to the three fixture renders). lib/producers/script.ts:131 (7a5e0b9f) wraps composed renders as draftOf(...) on the record. scriptView.ts (99a23228) runs runGate per candidate and derives the constraint ledger with ledgerFor, and an unadopted state is used instead of falling back to a render outside the draft (case 6).

**Shas (checked with `git show --stat`):** `7a5e0b9f` (lib/producers/script.ts) · `99a23228` (app/(studio)/projects/[id]/_part/{scriptView,fixtureScript}.ts)

**Next / live paths:** `lib/script/draft.ts`, `lib/script/editPlan.ts`, `lib/script/constraints.ts`, `lib/script/gate.ts`, `lib/producers/script.ts`, `app/(studio)/projects/[id]/_part/fixtureScript.ts`, `app/(studio)/projects/[id]/_part/realScript.ts`, `app/(studio)/projects/[id]/_part/scriptView.ts`

**Retired:** `app/_phases/script/ScriptStep.tsx`, `app/_phases/script/candidates/adoption.ts`

**Residue and doubts:** Two pieces remain, both now lib work. (1) Unknown.probe is still not in the notebook schema or validate.ts (cases 4-5 open); gate.ts probesFor reads only draft or fixture PROBES. (2) lib/producers/script.ts header: recalibrateFromPlan and the render payload still walk v1's three fixture renders (lib/script/chainBase.ts), so a composed candidate cannot be recalibrated. scriptView also falls back to ATTRIBUTION_OF and fixtureFrames.ts:79 to RENDERS[0] on the fixture side. A strict reader could call this STANDS-RETARGETED for those two pieces (lib/notebook/validate.ts and lib/script/chainBase.ts and recalibrate.ts).

### `script-phase-B` · LANDED-BY-NEXT

Card: [02-research-script.md](02-research-script.md).

Pre-rebuild stages 1-2 (prompt, parseDraft, /api/script and the gate) were lifted into lib/script/compose.ts, and Next finally gives compose a caller. In lib/producers/script.ts (7a5e0b9f) 'compose-candidates' is a priced kernel job (stage 4, durable) that receives the project clock targetS, runs parseDraft, and lands the candidates on the part record. The script editor offers compose candidates once a scope is confirmed (fixtureScript.ts:124), and scriptView.ts shows each candidate's GateReport and enforced figure (case 5). v1 /api/script was retired with the 92 routes.

**Shas (checked with `git show --stat`):** `7a5e0b9f` (lib/producers/script.ts (`compose-candidates`)) · `99a23228` (app/(studio)/projects/[id]/_part/{fixtureScript,scriptView}.ts)

**Next / live paths:** `lib/script/compose.ts`, `lib/script/validate.ts`, `lib/producers/script.ts`, `packages/producers/src/script/define.ts`, `app/(studio)/projects/[id]/_part/fixtureScript.ts`, `app/(studio)/projects/[id]/_part/scriptView.ts`

**Retired:** `app/api/script/route.ts`, `app/_phases/script/candidates/CandidatesDuel.tsx`

**Residue and doubts:** Case 6 is open: recalibrating a composed render is not supported, because chainBase and recalibrateFromPlan are fixture-bound (stated in the lib/producers/script.ts header). Phase 6 carried forward: /api/script's request-size bound left with the route, and compose has no size bound in lib. The asks A3 and A5 on the card are operator decisions; I did not see them recorded here and have not decided them. No live compose run was verified.

### `trailer-script-B` · STANDS-RETARGETED

Card: [02-research-script.md](02-research-script.md).

Session 1 (pre-rebuild d43b36a: lib/script/trailer/notes.ts notesFromFindings, lib/script/trailer/plan.ts parseTrailerPlan) moved to lib in 33b6484c, but nothing outside pipeline/trailer-structure-regression.mts calls either. The Next trailer face (app/(studio)/projects/[id]/[part]/_edit/Trailer.tsx) has hand ops only (set-connector, patch-beat, reset-beat) over trailer-script-A's op log, plus the structure check. It has no notes rail, no model edit plan, no candidate-vs-current delta and no Accept/Discard. The lib/jobs.tsx recalibrate serialisation the card relied on is retired; kernel jobs replace it.

**Retarget:** A trailer recalibrate act in lib/producers/script.ts (via lib/turns/kinds/recalibrate.ts, with plan ops in trailer-script-A's lib/script/trailer/ops.ts), with notes, the structure delta and Accept/Discard on app/(studio)/projects/[id]/[part]/_edit/Trailer.tsx and scriptView.ts.

**Next / live paths:** `lib/script/trailer/notes.ts`, `lib/script/trailer/plan.ts`, `lib/script/trailer/ops.ts`, `lib/script/trailer/structure.ts`, `lib/producers/script.ts`, `app/(studio)/projects/[id]/[part]/_edit/Trailer.tsx`, `app/(studio)/projects/[id]/_part/scriptView.ts`

**Retired:** `app/_phases/script/trailer/TrailerScript.tsx`, `app/api/recalibrate/route.ts`, `lib/jobs.tsx serialisation`

**Residue and doubts:** plan.ts still speaks BeatPatch, not trailer-script-A's CutOp (its own header says so). Case 5 (the one-recalibrate-per-project rule) would now be a kernel lane or job rule. The card's gate is direction, an operator call.

### `frames-phase-A` · LANDED-BY-NEXT

Card: [03-frames-score-cut.md](03-frames-score-cut.md).

Stages 1-2 (PictureUnit, unitsFromRender with trailer shot units, pictureFromUnits) were v1 work that moved to lib/frames/picture/unit.ts and lib/score/picture.ts in Phase 0 (574e5313). The rebuild added the rest. The frames part record stores units (packages/domain/src/steps/frames.ts). lib/producers/frames.ts renders a plate for any unit, shots included, and keys alternatives by unit id (frames-alts byFrame[unitId]). lib/producers/score.ts and lib/producers/cut.ts read units through pictureFromUnits/deriveTimeline. The chain derivation in app/(studio)/projects/[id]/_part/fixtureFrames.ts covers explainer beats or a trailer's SHOTS.

**Shas (checked with `git show --stat`):** `7a5e0b9f` (lib/producers/{frames,score,cut}.ts) · `e54e14fe` (packages/domain/src/steps/frames.ts) · `87ded901` (app/(studio)/projects/[id]/_part/fixtureFrames.ts)

**Next / live paths:** `lib/frames/picture/unit.ts`, `lib/score/picture.ts`, `lib/producers/frames.ts`, `lib/producers/score.ts`, `lib/producers/cut.ts`, `app/(studio)/projects/[id]/_part/fixtureFrames.ts`, `packages/domain/src/steps/frames.ts`, `packages/producers/src/frames/define.ts`

**Retired:** `app/_phases/frames/ShotSheet.tsx`, `app/_phases/frames/useFrames.ts`

**Residue and doubts:** Residue: the shot plate subject is subjectFor(frameOfUnit(u)), not promptsForShots/shotPrompt as stage 3 asked. Accepting direction still picks rows by beatRef.at, so case 6 (two shots under one beat, keyed by unit id) is not proven. When no frames record exists, the producer's own unitsOf derives explainer units only; trailer units come from the kinds module's chainOf until the first edit stores them. The unit.ts header still says stage 3 is not built, which is stale.

### `frames-phase-B` · LANDED-BY-NEXT

Card: [03-frames-score-cut.md](03-frames-score-cut.md).

lib/producers/frames.ts landFrames writes direct-cut as a persisted `proposal` (planFromSpecs) on the frames record and leaves units unchanged. app/(studio)/projects/[id]/_part/fixtureFrames.ts has five ops: accept-direction (all or per row, human layers kept unless overwrite), discard-direction, revert-direction (by row or by pass, through acceptProposal/revertPass/revertRow and a checkpoint) and rederive. Plates carry renderedSubject and stale is counted apart from missing. Frames.tsx and FramesInspector.tsx show the proposal, conflict and stale Chips/Tally, plus accept row, accept all and accept over human.

**Shas (checked with `git show --stat`):** `7a5e0b9f` (lib/producers/frames.ts (`proposal: planFromSpecs(...)`)) · `87ded901` (app/(studio)/projects/[id]/[part]/_edit/{Frames,FramesInspector}.tsx, _part/fixtureFrames.ts) · `ff7e2eeb` (lib/frames/directionPlan.ts)

**Next / live paths:** `lib/frames/directionPlan.ts`, `lib/frames/direction.ts`, `lib/producers/frames.ts`, `app/(studio)/projects/[id]/_part/fixtureFrames.ts`, `app/(studio)/projects/[id]/[part]/_edit/Frames.tsx`, `app/(studio)/projects/[id]/[part]/_edit/FramesInspector.tsx`, `packages/domain/src/partView.frames.ts`, `packages/domain/src/steps/frames.ts`

**Retired:** `app/_phases/frames/useFrames.ts`, `app/_phases/frames/direction/ProposalReview.tsx`

**Residue and doubts:** The pure core (f4ae178) predates the rebuild. Next wired it, as the producer header says ('which v1 wrote and never wired'). The review is a unit list plus an inspector, not a side-by-side before/after FrameCanvas pair. The rows are drawn with Chip/Tally, not with the StaleBadge component.

### `frames-score-cut-A` · STANDS-RETARGETED

Card: [03-frames-score-cut.md](03-frames-score-cut.md).

The core landed: takes are bytes in the sound store and spots hold takeId pointers. That merged pre-rebuild via MUSIC-B 6997be6 (lib/score/takes.ts). The rebuild moved it server-side: lib/producers/score.ts renders through generateTake, files the take in the sound store and binds the pointer with bindTake; lib/producers/cut.ts resolves takes with getTake/storeTakeIds. The card's residue is still open: lib/cut/finishLine.ts has no take-fit row (its ids are picture, voice, coverage, takes, drift, runtime and unplaced).

**Retarget:** Add a take-fit FinishCheck (|measured.durationS - cue span| against a tolerance, unmeasured when null) in lib/cut/finishLine.ts, shown through app/(studio)/projects/[id]/_part/fixtureCut.ts on the cut part editor (app/(studio)/projects/[id]/[part]/_edit/Cut.tsx).

**Next / live paths:** `lib/score/takes.ts`, `lib/producers/score.ts`, `lib/producers/cut.ts`, `lib/cut/finishLine.ts`, `app/(studio)/projects/[id]/_part/fixtureCut.ts`, `app/(studio)/projects/[id]/[part]/_edit/Cut.tsx`

**Retired:** `app/_phases/score/ScoreSpotting.tsx`, `app/_phases/cut/useCut.ts`

**Residue and doubts:** Case 6 (bindableTakes ranking) was declined earlier; the MUSIC-B runner-up auto-spot covers it. Also still open: measuring the active take's length on bind. It could be argued LANDED-BY-NEXT for the persistence intent, but the open residue is what the catalogue tracks.

### `frames-score-cut-B` · LANDED-BY-NEXT

Card: [03-frames-score-cut.md](03-frames-score-cut.md).

lib/producers/cut.ts export-animatic chains deriveTimeline, then compileCut/cutDocumentHash (lib/cut/cutDocument.ts), then runCutExport through ffmpeg. The mp4 lands as a blob on the cut record with the document hash, totalS and unreachable list. It runs on the box.render lane, dry by default. app/(studio)/projects/[id]/_part/fixtureCut.ts offers 'export animatic', which needs only picture on the clock and does not wait on the finish verdicts. The cut editor (Cut.tsx/CutFinish.tsx) drives it.

**Shas (checked with `git show --stat`):** `7a5e0b9f` (lib/producers/cut.ts (`export-animatic`)) · `87ded901` (app/(studio)/projects/[id]/_part/fixtureCut.ts, [part]/_edit/{Cut,CutFinish}.tsx)

**Next / live paths:** `lib/cut/cutDocument.ts`, `lib/producers/cut.ts`, `packages/producers/src/cut/define.ts`, `app/(studio)/projects/[id]/_part/fixtureCut.ts`, `app/(studio)/projects/[id]/[part]/_edit/Cut.tsx`, `app/(studio)/projects/[id]/[part]/_edit/CutFinish.tsx`

**Retired:** `app/api/cut/export`, `app/_phases/cut/parts/FinishLine.tsx`

**Residue and doubts:** CutDocument and the export kernel (38bfc82, d818535) predate the rebuild. Next made the export a priced kernel job. The v1 2b residue (control disabled with a Hint, double-POST, 503 shown in a Notice) belonged to retired v1 files. Drawn layers (P3) are not verified.

### `phase-shared-A` · LANDED-BY-NEXT

Card: [03-frames-score-cut.md](03-frames-score-cut.md).

packages/domain/src/steps/record.ts (defineStepRecord: key, owner, version, zod schema, migrations, refuses future or malformed versions, never casts) and steps/registry.ts (STEP_RECORDS: every key declared once, owner and grower cross-writes declared, the kernel refuses an undeclared key). They replace the untyped IndexedDB stepStore, which the importer now only reads. packages/kernel/src/parts/driver.ts and core.ts write each op and its event in one SQLite transaction. The fixtureFrames 'rederive' op keeps the work on surviving units instead of re-deriving over paid plates.

**Shas (checked with `git show --stat`):** `e54e14fe` (packages/domain/src/steps/{record,registry}.ts, packages/kernel/src/parts/{driver,core}.ts)

**Next / live paths:** `packages/domain/src/steps/record.ts`, `packages/domain/src/steps/registry.ts`, `packages/kernel/src/parts/driver.ts`, `packages/kernel/src/parts/core.ts`, `lib/steps/recordRegistry.ts`, `app/(studio)/projects/[id]/_part/fixtureFrames.ts`

**Retired:** `app/_phases/_shared/stepStore.ts`, `app/_phases/_shared/records/`

**Residue and doubts:** Not delivered: a generic derivedFrom stamp and staleness(records) graph. Lineage is still per record (renderId, scenarioId), and rederive is an explicit op, not an offered rebase. The literal-key ratchet is moot because the browser stepStore is no longer a store; lib/steps survives for the importer and pipeline readers. If the lineage graph is still wanted, it would land in packages/kernel/src/parts plus the step defs.

### `production-script-probes-A` · STANDS-RETARGETED

Card: [04-pipeline-probes-video.md](04-pipeline-probes-video.md).

The client-authored-schema hole (case 4) no longer exists: app/api/frames/route.ts and app/_phases/frames/useFrames.ts were retired (useFrames deleted in 6d24d9b8, routes in ed151a11), and lib/producers/frames.ts (7a5e0b9f) now builds the direction input on the server with SCENE_SCHEMA from lib/frames/sceneSpec.ts. The core of the card is still open: there is no TURNS registry over TurnClass, the two shallow parseAgainstSchema copies remain (lib/imaging/json.ts:71, lib/text/json.ts:39), and edit-plan-parse.probe.spec.ts:75 still pins the additionalProperties BOUNDARY gap.

**Retarget:** A TurnContract registry beside the existing lib/turns/kinds/* (lib/turns/registry.ts and a validate.ts that replaces lib/text/json.ts and lib/imaging/json.ts parseAgainstSchema), called by lib/producers/{frames,script}.ts, possibly through the @gt/domain/door validation door.

**Next / live paths:** `lib/turns/kinds/frames.ts`, `lib/turns/assemble/frames.ts`, `lib/turns/runner.ts`, `lib/producers/frames.ts`, `lib/producers/script.ts`, `lib/script/editPlan.ts`, `lib/text/json.ts`, `lib/imaging/json.ts`, `lib/text/types.ts`, `packages/domain/src/door.ts`, `tests/golden-path/edit-plan-parse.probe.spec.ts`, `tests/golden-path/format-brief.probe.spec.ts`

**Retired:** `app/api/frames/route.ts`, `app/api/recalibrate/route.ts`, `app/_phases/frames/useFrames.ts`, `app/_phases/script/editPlan.ts`

**Residue and doubts:** Case 4 is closed by the rebuild, but the cause is that the route and hook are gone, not that a contract was added. lib/turns/assemble/frames.ts still accepts body.schema and puts it in the prompt (line 139); only the server-side frames producer calls it now. The server-side turn kinds (frames, recalibrate, research) were built before the rebuild (AIO-A), not by Next. Cases 1-3, 5, 6 and 7 are not done.

### `production-script-probes-B` · STANDS-RETARGETED

Card: [04-pipeline-probes-video.md](04-pipeline-probes-video.md).

Stage 1 survives in Next form. tests/golden-path/_studio/hooks.ts and hook-coverage.probe.spec.ts remain, and their EXEMPT list was cut to the 3 remaining (studio) hooks in 8f972e0f/ed151a11. The journey stage aimed at retired targets (useTrailerCut, useFrames, useScoreSpots, useCut, app/api/* routes, fake-indexeddb STEPS_STORE). In Next the steps join through kernel part records read by lib/producers/*, but each tests/next-server/producer-step-*.test.ts seeds its upstream records directly, so no test walks one project through every step.

**Retarget:** A node-lane journey in tests/next-server/ (e.g. studio-journey.test.ts) that drives one project's parts through lib/producers/{research,script,frames,motion,score,cut}.ts with driveStep/launchPartAct in dry mode over a temp kernel, checks each join from the part records (@gt/kernel/parts/driver readPart), and keeps a KNOWN_BREAKS ratchet.

**Next / live paths:** `tests/golden-path/_studio/hooks.ts`, `tests/golden-path/hook-coverage.probe.spec.ts`, `tests/next-server/producer-step-motion.test.ts`, `tests/next-server/producer-step-cut.test.ts`, `lib/producers/research.ts`, `packages/kernel/src/parts`, `lib/text/router.ts`, `tests/golden-path/trailer-cut-ops.probe.spec.ts`

**Retired:** `app/_phases/frames/useFrames.ts`, `app/_phases/cut/useCut.ts`, `app/_studio/`

**Residue and doubts:** Stage 1 landed before the rebuild (138df68, 44ae22b). The shas cited here are rebuild commits that only shrank the hook-coverage exemptions; they did not deliver the journey. The router scripted-engine seam (case 5) is less needed now, because the producers' meteredCall dry stand-ins already drive turns offline. Cases 3, 4 and 6 refer to retired hooks and routes and would need restating against part records. trailer-cut-lifecycle.probe.spec.ts no longer exists.

### `video-clip-pipeline-A` · STANDS-UNCHANGED

Card: [04-pipeline-probes-video.md](04-pipeline-probes-video.md).

Every target file still exists and keeps its role: pipeline/video/{ledger.py,selftest.py,render_preset_clips.py,clip_check.py,compose_clip.py}, pipeline/build-preset-clips.mts, pipeline/check-clips.mjs and public/clips/manifest.json. The only rebuild change was dc57fd06, which switched the preset import in build-preset-clips.mts (and emit-presets.mts) to @gt/catalog/presets.

**Next / live paths:** `pipeline/video/ledger.py`, `pipeline/video/selftest.py`, `pipeline/video/render_preset_clips.py`, `pipeline/video/clip_check.py`, `pipeline/video/compose_clip.py`, `pipeline/build-preset-clips.mts`, `pipeline/check-clips.mjs`, `pipeline/emit-presets.mts`, `public/clips/manifest.json`, `packages/catalog/src/presets.ts`

**Residue and doubts:** The residue is unchanged. Case 5: check-clips.mjs:175 only reports the two palette failures as legacy, without a waiver. compose_clip.py:250/270 still caches author.json and plate.png by slug alone. Cases 1, 2 and 6 have not been shown on the GPU box. Waiving the two shipped clips (signal-ledger 0.18, chalk-argument 0.42) is an operator taste call and is recorded here, not decided.

### `video-clip-pipeline-B` · STANDS-RETARGETED

Card: [04-pipeline-probes-video.md](04-pipeline-probes-video.md).

Next carried stage 1 and part of stage 2. lib/producers/motion.ts and packages/producers/src/motion/define.ts (7a5e0b9f) run direct-motion with lib/motion/direction.ts (code-side decline) and render-clip via Leonardo hailuo-03 i2v, then land the unit clip as status "rendered". The motion editor is app/(studio)/projects/[id]/[part]/_edit/Motion.tsx (87ded901). Still open: graded takes with a clip_check verdict and adoption-with-override for picture clips (landMotion overwrites one clip), live Wan local renders (refused with WAN_LIVE), and the picture Cut track (lib/cut/deriveTimeline.ts:213 places plates, not rendered clips).

**Retarget:** Takes plus clip_check verdict plus adoption with override in lib/producers/motion.ts landMotion and the Motion part editor, the Wan runner as a Python job on the worker's GPU lane (workers/), and adopted clips onto the video track in lib/cut/deriveTimeline.ts / lib/cut/cutDocument.ts via lib/producers/cut.ts.

**Next / live paths:** `lib/producers/motion.ts`, `packages/producers/src/motion/define.ts`, `lib/motion/direction.ts`, `app/(studio)/projects/[id]/[part]/_edit/Motion.tsx`, `tests/next-server/producer-step-motion.test.ts`, `tests/live/part-frames-motion.live.spec.ts`, `lib/producers/cut.ts`, `lib/cut/deriveTimeline.ts`, `lib/cut/cutDocument.ts`, `workers/`, `pipeline/video/motion_author.py`

**Retired:** `app/_phases/motion/`, `lib/projects.ts`

**Residue and doubts:** Acceptance status: 1 (motion step after frames) and 2 (declined) hold in Next form. 5 holds only in half: the clip is "rendered" but the Cut picture track does not use it, though the ads face does read adopted clips. 3 (no-runner status word) is replaced by kernel jobs and lanes, and has not been checked as a status word. 4 (failing check cannot be adopted without an override) is not done. Operator direction gate V2 is still unresolved: a local Wan runner versus the Leonardo queue. Live Wan currently refuses with 'no app path renders a Wan i2v clip from a plate yet'. Stage 1 itself landed before the rebuild (a9d5975) and Next re-implemented it as a producer.

### `foundry-curation-A` · LANDED-BY-NEXT

Card: [05-asset-management.md](05-asset-management.md).

The card's targets, app/foundry/{FoundryView,ExtractView,DojoView}.tsx and lib/board/sources/*, were retired in Phase 3. Their verdict state now runs through one decision kernel. packages/kernel/src/decision/core.ts holds the server-side undo as a decision, keyed patches and a commit that refuses the undecided. packages/ui/src/board/{useGate,gate,boardGate,undo}.ts is the client kernel with a keepalive flush (app/(studio)/board/[packet]/keepalive/route.ts). lib/decision/v1/sources/{forge,extract,dojo}.ts are the adapters, and one Board sheet serves cull, extract and Dojo blind pair. tests/live/board-exit.live.spec.ts drives every source through decide, undo and commit.

**Shas (checked with `git show --stat`):** `47b8095b` (packages/kernel/src/decision/core.ts, packages/ui/src/board/{useGate,undo}.ts, app/(studio)/board/[packet]/keepalive/route.ts) · `7245d4b2` (lib/decision/v1/sources/{forge,extract,dojo}.ts) · `26820a6d` (app/(studio)/board/_board/Board.tsx)

**Next / live paths:** `packages/kernel/src/decision/core.ts`, `packages/ui/src/board/useGate.ts`, `packages/ui/src/board/undo.ts`, `lib/decision/v1/sources/forge.ts`, `lib/decision/v1/sources/extract.ts`, `lib/decision/v1/sources/dojo.ts`, `app/(studio)/board/_board/Board.tsx`, `app/(studio)/board/[packet]/keepalive/route.ts`

**Retired:** `app/foundry/FoundryView.tsx`, `app/foundry/ExtractView.tsx`, `app/foundry/DojoView.tsx`, `app/foundry/gate/useGate.ts`, `lib/board/sources/cull.ts`

**Residue and doubts:** Before the rebuild, the catalogue had it as partial (84d43bb, c45eb6a: Cull only). The rebuild finished the job by putting Extract and Dojo on the kernel and retiring the separate /foundry tabs, which makes the multi-tab write race moot. One deviation is recorded in the plan: PacketReview decides items[0] only, so a multi-claim Dojo review cannot overturn its other claims.

### `foundry-curation-B` · STANDS-RETARGETED

Card: [05-asset-management.md](05-asset-management.md).

The retired target was the CullGrid in app/foundry/. What landed: calibration was generalised into packages/kernel/src/calibration/{core,series}.ts (AUC with bootstrap CI; a grade is shown only when calibrated). lib/decision/v1/sources/forge.ts attaches each grade's calibration. Verdicts carry a by field (lib/foundry/types.ts VerdictBy, mapped to agent/operator in lib/decision/v1/types.ts). What does not exist: any pre-decision step, meaning no fitted per-curator predictor, no agreement Tally, no uncertain-first order and no batch of model verdicts that can be undone together.

**Retarget:** Calibrated pre-decision as a matrix-cull act on the Board: a predictor beside packages/kernel/src/calibration, and the 'decide the rest' batch in packages/ui/src/board/cull.ts + lib/decision/v1/sources/forge.ts, with model verdicts as by=agent decisions in packages/kernel/src/decision.

**Next / live paths:** `packages/kernel/src/calibration/core.ts`, `packages/kernel/src/calibration/series.ts`, `lib/decision/v1/sources/forge.ts`, `lib/decision/v1/types.ts`, `packages/ui/src/board/cull.ts`

**Retired:** `app/foundry/CullGrid.tsx`, `app/foundry/FoundryView.tsx`, `lib/board/sources/cull.ts`

**Residue and doubts:** Direction gate, operator-only, not decided here. It is held because no field is calibrated (LOO 0.78 < 0.9; grader-calibration.json still holds 87 unstamped rows). The by-field slice landed before the rebuild (foundry-engine-B d7fe018). Commit already refuses undecided plates by default in kernel/decision, so the old silent 'undecidedAs reject' premise has softened.

### `library-assets-audio-A` · STANDS-RETARGETED

Card: [05-asset-management.md](05-asset-management.md).

Half of the card landed in 66b03edf. lib/sound/hands.ts puts the team's hand on the server under the sound store's lock. The /audio composer (app/(studio)/audio/_audio/read.ts) reads the one derivation, deriveVocabulary over computeInsights cells with the hands laid on top, and actions.ts writes hands. Suno drafts live server-side (lib/sound/suno/draft.ts). The card's main unlock is still open (case 2): compose lives client-side in packages/ui/src/components/audio/recipe.ts, and lib/sound/hunt.ts, generate.ts, propose.ts and cli.ts never read hands.

**Retarget:** Move compose from packages/ui/src/components/audio/recipe.ts into a pure shared module that lib/sound/hunt.ts, lib/sound/generate.ts, lib/sound/suno/propose.ts and lib/sound/cli.ts (and the sound producer in lib/producers/sound.ts) apply over lib/sound/hands.ts.

**Next / live paths:** `lib/sound/hands.ts`, `lib/sound/vocabulary.ts`, `app/(studio)/audio/_audio/read.ts`, `app/(studio)/audio/_audio/actions.ts`, `packages/ui/src/components/audio/recipe.ts`, `lib/sound/hunt.ts`, `lib/sound/generate.ts`, `lib/sound/suno/draft.ts`

**Retired:** `app/library/audio/book.ts`, `app/library/audio/bookStore.ts`, `app/library/audio/Terms.tsx`

**Residue and doubts:** a5b955a (vocabulary.ts, 2026-10-12) came before the rebuild. Cases 3-4 (migrating the localStorage book) are effectively superseded: the v1 Library audio was retired and no importer reads the gravitone.audio-book key, which only lib/identityEviction.ts still mentions. Hands therefore start empty on the server. Case 5 (an ElevenLabs draft attached across browsers) is not verified. You could argue LANDED-BY-NEXT for the structural move; the agent-side avoid rule (case 2) is what keeps this open.

### `library-styles-atelier-B` · LANDED-BY-NEXT

Card: [05-asset-management.md](05-asset-management.md).

The atelier at app/(studio)/library/style/[id]/_atelier/Atelier.tsx renders packages/ui/src/components/style/TrialMatrix.tsx: five trial problems as columns, the plate under the current block, coverage and a verdict count. Pressing column heads picks which trials render, and one generate-proofs act runs them as one priced style job through the receipt (packages/producers/src/style/define.ts, lib/producers/styleLaunch.ts). Proofs carry their trial and are judged in place with approve, reject and undecide keys. style-exit.live drives adopt, generate, judge three trial problems, then lock.

**Shas (checked with `git show --stat`):** `66b03edf` (packages/ui/src/components/style/TrialMatrix.tsx) · `15fd570c` (app/(studio)/library/style/[id]/_atelier/Atelier.tsx, packages/producers/src/style/define.ts, lib/producers/styleLaunch.ts)

**Next / live paths:** `packages/ui/src/components/style/TrialMatrix.tsx`, `app/(studio)/library/style/[id]/_atelier/Atelier.tsx`, `packages/producers/src/style/define.ts`, `lib/producers/styleLaunch.ts`, `packages/domain/src/styleView.ts`

**Retired:** `app/library/TrialMatrix.tsx`, `app/library/trialIndex.ts`, `app/library/Playground.tsx`, `app/library/PresetShowcase.tsx`

**Residue and doubts:** Session 1's read-only 6-preset x 5-problem wall from public/trials/index.json (1a7c8c5, now retired with app/library) did not carry over. public/trials/index.json is still tracked but has no consumer in app/, lib/ or packages/, so the readback glyphs (hasText, drewWhatWasAsked, clutter) and the preset-versus-mine comparison are residue. The control-arm toggle (case 6) and per-cell failure with retry (case 5) are not verified. Session 2's one-press slate, the open part of the card, is delivered.

### `IMG-B` · STANDS-RETARGETED

Card: [06-imaging-music.md](06-imaging-music.md).

The v1 Frames hook files (app/_phases/frames/{useFrames.ts,frames.ts,parts.tsx}, alternatives/useAlternatives.ts, app/_phases/_shared/stepStore.ts) are retired. Plates are now made by lib/producers/frames.ts `imageUnit`, which calls the imaging router's generate, books `{state:'ready', blob, look, model, costUsd}` and nothing else. Nothing in the tree does QC: no recognize pass over a plate, no `has_text`, no edit act, no plate versions with parentId. lib/frames/frames.ts `Plate` still holds only state/src/model/costUsd/subject/renderedSubject/note/receipt, and lib/imaging/inspect.ts does not exist.

**Retarget:** A QC recognize pass plus an 'edit' act (a new version of the unit with parentId) in lib/producers/frames.ts (imageUnit/performFrames) and packages/producers/src/frames/define.ts, with the QC chip and E key in app/(studio)/projects/[id]/[part]/_edit/Frames.tsx and FramesInspector.tsx, and a new lib/imaging/inspect.ts.

**Next / live paths:** `lib/producers/frames.ts`, `packages/producers/src/frames/define.ts`, `lib/frames/frames.ts`, `app/(studio)/projects/[id]/[part]/_edit/Frames.tsx`, `app/(studio)/projects/[id]/[part]/_edit/FramesInspector.tsx`, `lib/imaging/router.ts`, `lib/imagingClient.ts`

**Retired:** `app/_phases/frames/useFrames.ts`, `app/_phases/frames/frames.ts`, `app/_phases/frames/alternatives/useAlternatives.ts`, `app/_phases/_shared/stepStore.ts`

**Residue and doubts:** The card's gate is 'direction', an operator call that is not decided here. Under Next the kernel job's spend receipt records each paid call. The plate's own booked output still drops provider, costBasis and reroutedFrom (only model and costUsd are kept), so case 3 is only partly moot. 'Persist through saveStep' would now mean the part record or unit events. The 'no UI caller of editImage' premise still holds: grep finds no Next caller.

### `CC-A` · STANDS-UNCHANGED

Card: [06-imaging-music.md](06-imaging-music.md).

Pipeline Python that the rebuild did not touch. Partial work from pre-rebuild 5ce5578 is in pipeline/vlm-probe/ruler/{api,calibrate,serve,backend}.py and selftest_ruler.py. Since 2026-10-13 the only commit touching vlm-probe is 948d14d0 (refs.py and the CI gate, not the ruler). The residue is unchanged: there is no committed ruler/scale-v3.json, identity.py is still its own calibrating CLI, and pipeline/foundry/dojo_measure.py:79-80 still does `sys.path.insert` + `import identity` and recalibrates per run, with no scaleVersion.

**Next / live paths:** `pipeline/vlm-probe/ruler/api.py`, `pipeline/vlm-probe/ruler/calibrate.py`, `pipeline/vlm-probe/ruler/serve.py`, `pipeline/vlm-probe/identity.py`, `pipeline/foundry/dojo_measure.py`, `pipeline/vlm-probe/motion.py`, `pipeline/vlm-probe/selftest_ruler.py`

**Residue and doubts:** Status stays partial (cases 1-4 from 5ce5578). Cases 5-6 need calibrate.py run on the GPU box to commit the scale. Dojo now runs as a kernel job (lib/producers/dojo.ts, 9447ae20), but the identity measure still goes through dojo_measure.py, so the write set is unchanged.

### `VLM-B` · STANDS-UNCHANGED

Card: [06-imaging-music.md](06-imaging-music.md).

The targets still exist in the same role. pipeline/vlm-probe/score.py has no `--certify`, and there is no certificates/ dir or lib/imaging/eyes.ts. lib/imaging/router.ts is still the single recognize router; ollama leads and there is no field-trust constraint. The rebuild did not touch router.ts: its Phase 2/6 commits only touched lib/imaging/video/client.ts and other imaging files. Truth minting (probe-frame-data-B: consistency.py/truth_admit.py) was in place before the rebuild.

**Next / live paths:** `pipeline/vlm-probe/score.py`, `pipeline/vlm-probe/consistency.py`, `pipeline/vlm-probe/replicate.py`, `pipeline/vlm-probe/truth_admit.py`, `lib/imaging/router.ts`, `lib/imaging/json.ts`, `lib/imaging/providers/ollama.ts`, `lib/producers/motion.ts`, `lib/producers/extract.ts`

**Retired:** `app/foundry/CullGrid.tsx`

**Residue and doubts:** One premise example is retired: app/foundry/CullGrid.tsx, whose foundry grading now runs through the extract producer. The router seam is unchanged, and the new kernel producers (motion, extract, dojo) call the same recognize(), so a field-trust constraint in router.ts would cover them. The README says the router stage needs an operator call; that is not decided here. Certify is unblocked by VLM-A, and no truth sidecar has been minted yet (needs a GPU lane run).

### `MUSIC-A` · STANDS-RETARGETED

Card: [06-imaging-music.md](06-imaging-music.md).

The transport half is gone or done. app/api/music/generate (the poor /v1/music cue path) is retired. Production cues now render through lib/producers/score.ts -> lib/sound/generate.ts generateTake -> composeDetailed({storeForInpainting:true}), so songId and the vendor plan are stored on the take: MUSIC-B 6997be6 did this before the rebuild, and 7a5e0b9f carries it into the kernel. The body deadline (case 1) landed earlier as Q2 (vendorFetch's `read` inside the timer). The conformance half is still open: there is no lib/music/conformance.ts and no checkPlan, measuredConformance or receiptVersion. composeMusic survives only for probes.

**Retarget:** A new pure lib/music/conformance.ts checkPlan(brief, take.plan), run where lib/producers/score.ts renderTake/landScore books a take, with the measured layer on the /audio desk (app/(studio)/audio/_audio) and the conformance chip in app/(studio)/projects/[id]/[part]/_edit/ScoreTakes.tsx.

**Next / live paths:** `lib/producers/score.ts`, `lib/sound/generate.ts`, `lib/music/elevenlabs.ts`, `lib/music/types.ts`, `lib/music/plan.ts`, `app/(studio)/projects/[id]/[part]/_edit/ScoreTakes.tsx`, `app/(studio)/audio/_audio/read.ts`

**Retired:** `app/api/music/generate/route.ts`, `app/_phases/score/ScoreSpotting.tsx`, `app/playground/shared/measure.ts`, `app/library/audio/analysis.ts`

**Residue and doubts:** Cases 1, 2 and 6 are satisfied in substance, by Q2 and MUSIC-B before the rebuild rather than by Next. 7a5e0b9f only carries them in the score producer. Cases 3-5 (the plan-vs-delivered verdict) are open. The exported dead composeMusic (/v1/music) could be deleted, but probes still import it.

### `UI-SHELL-A` · SUPERSEDED

Card: [07-design-system.md](07-design-system.md).

The card wanted the two v1 worlds (Almanac k-* and Obsidian Tailwind/Obsidian-kit remap) folded into role-token bindings, removing roughly 78 `almanac ?` forks in components/ui. Phase 1 replaced the multi-world system with one world: migration plan §3.3 says "Replace. One world", built as packages/ui/tokens/source.json (primitives to roles, ADMISSION.md) styled through CSS Modules and scoped by `[data-world="next"]` in app/(studio)/_shell/world.css. The fork sites the card targeted (Almanac kit, Deck/DeckCardAlmanac, StudioFrame, Modal, Field) were retired.

**Next / live paths:** `packages/ui/tokens/source.json`, `packages/ui/tokens/ADMISSION.md`, `packages/ui/src/tokens.css`, `app/(studio)/_shell/world.css`, `app/(studio)/layout.tsx`

**Retired:** `components/kit`, `components/ui/deck`, `components/ui/StudioFrame.tsx`, `components/ui/Modal.tsx`, `components/ui/Field.tsx`

**Residue and doubts:** Stage 3 operator call S4 (DeckCard vs DeckCardAlmanac, StudioFrame Bar vs nav) no longer has a subject because both sides were retired; I did not decide it. Leftover: components/ui/world.tsx and components/ui/signal/{Tally,TabRail,Hint,StackBar,Fold}.tsx plus Primitives.tsx still call useWorld(). Outside tests, the only v1 consumers left are app/_landing/parts.tsx (StaleBadge), app/error.tsx (Button) and the dev inspector; a few @gt/ui files (Tally, StaleBadge, keymap, layers) reference these paths. This is dead-weight cleanup, not the card's intent. Do not count the shas as delivering the card: they are the commits that made it moot.

### `SIGNAL-A` · LANDED-BY-NEXT

Card: [07-design-system.md](07-design-system.md).

packages/ui/src/keymap/ is one app-wide binding table scoped by mode (bindings.ts). Its parts: compile/conflicts/problems checks (keymap.ts, run as unit tests); pure route() and targetInfo guards for typing, field, repeat (refused by default), modifiers and onControl Enter (route.ts, target.ts, chord.ts); and the only keydown listener (dispatch.ts). @gt/ui Keycaps draws keyTable(mode) derived from the same rows. pipeline/next-gates.mts hygiene fails any other raw addEventListener("keydown") in packages/, which is the census (case 6). The conflict check plus per-mode verbs (board.cull K=keep, X=reject) stand in for the verb table (case 7).

**Shas (checked with `git show --stat`):** `33b21d2a` (packages/ui/src/keymap/{bindings,dispatch}.ts) · `64bc6bcc` (packages/ui/src/components/keycaps/Keycaps.tsx)

**Next / live paths:** `packages/ui/src/keymap/bindings.ts`, `packages/ui/src/keymap/keymap.ts`, `packages/ui/src/keymap/route.ts`, `packages/ui/src/keymap/target.ts`, `packages/ui/src/keymap/dispatch.ts`, `packages/ui/src/components/keycaps/Keycaps.tsx`, `packages/ui/test/keymap.test.ts`, `pipeline/next-gates.mts`

**Retired:** `app/foundry/CullGrid.tsx`, `app/foundry/DojoView.tsx`, `app/library/AssetLightbox.tsx`, `lib/board/keys.ts`

**Residue and doubts:** The adopters SIGNAL-A left open (Dojo, ExtractBoard, Lightbox, AssetLightbox, kit KeyRow) were all retired, and the Next screens register verbs against the one table instead. The v1 kernel components/ui/signal/keymap.ts from 72c484f is still in the tree, but the Next keymap only cites it as lineage. The census gate covers packages/ only; app/(studio) screens get no raw listener because they register verbs through dispatch.ts. In 9c17dfbc the owner ruled the keymap as built (plan §8.7, "one key, two verbs" kept).

### `KIT-B` · SUPERSEDED

Card: [07-design-system.md](07-design-system.md).

The card wanted /kit specimens and the Identity contrast table shown per world (Almanac, Obsidian-kit, bare Obsidian) with alpha-aware contrast.ts. The v1 /kit (app/kit/{KitView,Identity,Parts,contrast}.tsx), the Almanac kit and the multi-world tokens were retired in Phase 1 (f3a99718). The new /kit (app/(studio)/kit/*) renders the one Next world the screens ship in, so there is nothing to compare across worlds. Composited, alpha-aware contrast is now measured on the live page by tests/live/legibility.live.spec.ts over the kit* cx screens (pipeline/cx-screens.mjs).

**Next / live paths:** `app/(studio)/kit/page.tsx`, `app/(studio)/kit/Tokens.tsx`, `pipeline/cx-screens.mjs`, `tests/live/legibility.live.spec.ts`

**Retired:** `app/kit/contrast.ts`, `app/kit/Identity.tsx`, `app/kit/Parts.tsx`, `components/kit`

**Residue and doubts:** The stage 1 partial (d879035: alpha-aware contrast.ts, per-world Identity palette) lived in the retired app/kit files. Ask S5 (Ghost at 2.12:1) was answered for the Next Ghost in 9c17dfbc: per the commit message, the owner approved raising the Ghost outline from 1.21:1 to at least 3:1 and 12 baseline rows were removed. Case 5 (Modal portal carries its world) has no subject left, since there is one world and v1 Modal is retired.

### `UCP-A` · STANDS-RETARGETED

Card: [07-design-system.md](07-design-system.md).

tests/golden-path/_ast.ts is still alive with only fn, fnIn, switchCase and callsTo (010d28f, 7e0cdae; adjusted in ed151a11). importers (case 4), ordered (case 5), text-probe-ratchet.probe.spec.ts and the timing (case 6) are all missing. Its SOURCE_ROOTS are app, components and lib, so packages/ is outside every population. commit-gate-parity.probe.spec.ts is retired; dialog-closes-on-success still reads source as text (readFileSync + stripComments), and 93 of 207 golden-path files use readFileSync. Separately, pipeline/next-gates.mts already runs TypeScript-AST checks over packages/, though only for governance rules.

**Retarget:** Add importers and ordered to tests/golden-path/_ast.ts and widen SOURCE_ROOTS to packages/ (or share a query layer with pipeline/next-gates.mts). Migrate dialog-closes-on-success, chrome-colour-literals and comment-strip-ratchet onto it over the Next surfaces (app/(studio), packages/ui layers and sheet), and add the text-probe ratchet.

**Next / live paths:** `tests/golden-path/_ast.ts`, `tests/golden-path/_ast.probe.spec.ts`, `tests/golden-path/cull-keys.probe.spec.ts`, `tests/golden-path/dialog-closes-on-success.probe.spec.ts`, `tests/golden-path/chrome-colour-literals.probe.spec.ts`, `tests/golden-path/comment-strip-ratchet.probe.spec.ts`, `pipeline/next-gates.mts`

**Retired:** `tests/golden-path/commit-gate-parity.probe.spec.ts`

**Residue and doubts:** STANDS-UNCHANGED would also be defensible, since the lane files still exist. I chose retargeted because the populations moved: keydown handlers now live only in packages/ui/src/keymap/dispatch.ts, which _ast's roots do not cover, and the Modal callers that dialog-closes-on-success targeted are retired. Case 2's '19 keydown files' population is obsolete.

### `UCP-B` · LANDED-BY-NEXT

Card: [07-design-system.md](07-design-system.md).

Before the rebuild the lane was built in b3dee8d/e53cd09: tests/live/legibility.live.spec.ts plus _legibility.ts, pipeline/cx-screens.mjs shared with cx-capture, a shrink-only legibility-baseline.json and the Ghost negative control. The rebuild carried it forward as a plan §3.5 gate and walks it over every Next screen (cx-screens kit*, floor, board, library, audio ids). The only open item, case 1's floor, was closed by 9c17dfbc: the owner ruled the @gt/ui Ghost to at least 3:1 (Ghost.module.css) and 12 baseline rows were removed.

**Shas (checked with `git show --stat`):** `9c17dfbc` (packages/ui/src/components/ghost/Ghost.module.css, tests/live/legibility-baseline.json) · `7b088459` (tests/live/legibility-baseline.json)

**Next / live paths:** `tests/live/legibility.live.spec.ts`, `tests/live/_legibility.ts`, `tests/live/legibility-baseline.json`, `pipeline/cx-screens.mjs`, `pipeline/cx-capture.mjs`, `packages/ui/src/components/ghost/Ghost.module.css`, `tests/golden-path/legibility-composite.spec.ts`

**Residue and doubts:** Most of the substance predates the rebuild; the rebuild sustained the lane and resolved the S5 floor. Leftover: tests/golden-path/legibility-composite.spec.ts still pins the v1 Ghost arithmetic at about 2.12 (toBeCloseTo 2.12) as 'still under 3'. That describes the v1 components/ui/signal/Ghost.tsx, not the shipped @gt/ui Ghost, so the pin is stale. a6a5f2fc is a fix(live) commit from inside the rebuild window, not a feat(next) commit.

### `AUP-A` · STANDS-RETARGETED

Card: [08-app-infrastructure.md](08-app-infrastructure.md).

Stage 1 (verified Firebase principal over WebCrypto, PRINCIPAL_MODE, principal-keyed buckets) predates the rebuild in lib/principal.ts. Next re-used it: app/_server/principal.ts plus the session cookie bridge (cf6b2546), and ec399f28 added per-caller CLI tokens (packages/kernel/src/token.ts, a cli-token principal, rate bucket keyed on the token id). Stage 2 is still open: nothing in packages/kernel/src (spend/ledger.ts, spend/projection.ts, records/) carries a principal or uid, so there is no per-principal ceiling. The Stage 3 vault was aimed at IndexedDB-as-only-copy, and that problem is mostly moot because the server SQLite store is now the record; per-account scoping of that store does not exist.

**Retarget:** Stage 2: per-principal spend attribution and ceilings in packages/kernel/src/spend/ (ledger.ts, the reserve/settle path), keyed on the Resolution from lib/principal.ts via app/_server/action.ts. Stage 3 becomes per-account scoping of kernel records (packages/kernel/src/records, store.ts) for a hosted posture, not a vault of IndexedDB snapshots.

**Next / live paths:** `lib/principal.ts`, `lib/sessionToken.ts`, `app/_server/principal.ts`, `app/_server/session.ts`, `packages/kernel/src/token.ts`, `packages/kernel/src/spend/ledger.ts`, `packages/kernel/src/records/`

**Retired:** `app/api/vault/route.ts (never built)`, `lib/studioDb.ts as the record (IndexedDB now read only by the importer)`

**Residue and doubts:** Direction gate. The operator approved stage 1 only. Stage 2 (spend attribution) and stage 3 (vault, creator data on a server) are not approved. The plan's carried-forward item 'retire legacy shared-secret mode once the CLIs authenticate (P2)' is now unblocked by the CLI tokens, but PRINCIPAL_MODE still defaults to legacy (lib/principal.ts:66-67). The single-operator local store already holds the work server-side, so a hosted multi-account deployment is what would still need the vault/isolation part. That is the operator's call.

### `AUP-B` · SUPERSEDED

Card: [08-app-infrastructure.md](08-app-infrastructure.md).

The card's premise is that IndexedDB is the only copy and sign-out wipes it. Phase 4 (057cf63d) made the server SQLite store the record for projects and steps, and Phase 5/6 did the same for themes and assets. IndexedDB is now read only by the importer, so a sign-out (app/(studio)/_shell/Providers.tsx signOut -> store.evict('identity') + v1 useAuth.signOut) no longer destroys imported or new work. The archive/import half landed as the migration door: /projects/import (app/(studio)/projects/import/ImportView.tsx) and lib/import/{archive,commit,export}.ts keep the .gravitone format byte-exact, with preview, one-confirm import in one transaction and server re-export. The sign-out dialog targeted components/ui/UserMenu.tsx and app/projects/ProjectsView.tsx, and both are retired.

**Next / live paths:** `app/(studio)/projects/import/ImportView.tsx`, `lib/import/archive.ts`, `lib/import/export.ts`, `lib/import/commit.ts`, `lib/studioArchive.ts`, `app/(studio)/_shell/Providers.tsx`, `app/(studio)/_shell/HeaderBar.tsx`, `lib/identityEviction.ts`, `lib/useAuth.tsx`

**Retired:** `components/ui/UserMenu.tsx`, `app/projects/ProjectsView.tsx`

**Residue and doubts:** One residual risk survives. Next's 'Sign out' (HeaderBar.tsx:114) is still one click with no confirm, and it calls v1 useAuth.signOut, which still runs evictIdentity(uid,'signed-out') over IndexedDB (lib/useAuth.tsx:231). A browser whose v1 data has NOT been imported yet still loses that data on sign-out. A small guard (block or warn on sign-out while unimported v1 rows exist) may be worth a follow-up through /projects/import. The lock-instead-of-wipe half (policy-loosen) was declined by the operator on 2026-10-06 and is moot now. Partial pre-rebuild work ef42e6f (the sign-out dialog in the retired UserMenu) left with v1.

### `text-engine-B` · STANDS-RETARGETED

Card: [09-content-pipeline.md](09-content-pipeline.md).

The v1 targets are gone: app/api/research, app/api/recalibrate and app/_phases/research/run/LiveResult.tsx were retired in ed151a11. lib/text/repair.ts (repairTurn) still exists, but the only thing that calls it is tests/golden-path/repair-turn.probe.spec.ts. In Next, lib/producers/research.ts runUnit catches a settle failure and returns {kind:"fatal", code:"invalid", message}, and textFailure joins the findings into one string. The paid answer is still thrown away, and no repair act exists.

**Retarget:** Keep the draft and add a repair act in lib/producers/research.ts (settle-failure branch) and lib/producers/script.ts (recalibrate / lib/turns/kinds/recalibrate.ts). Call lib/text/repair.ts repairTurn as a priced kernel job, and show the draft with its pinned findings plus a repair act in app/(studio)/projects/[id]/[part]/_edit/Research.tsx (port: _part/realResearch.ts).

**Next / live paths:** `lib/text/repair.ts`, `lib/notebook/validate.ts`, `lib/script/editPlan.ts`, `lib/producers/research.ts`, `lib/producers/script.ts`, `lib/turns/kinds/recalibrate.ts`, `app/(studio)/projects/[id]/[part]/_edit/Research.tsx`

**Retired:** `app/api/research/route.ts`, `app/api/recalibrate/route.ts`, `app/_phases/research/run/LiveResult.tsx`

**Residue and doubts:** Gate: direction. Work already landed (a815c35, c6c465b): path-addressed NotebookFinding, and repair.ts with its guards (acceptance cases 1-5). Still open: a caller for repairTurn, keeping the draft on a failed job record, path-addressed findings in lib/script/editPlan.ts, the repair UI, and the single receipt covering both turns. The route-plus-LiveResult half of case 6 pointed at files that are now retired.

### `foundry-forge-A` · STANDS-RETARGETED

Card: [09-content-pipeline.md](09-content-pipeline.md).

The calibration math moved into the kernel (1ee60926: packages/kernel/src/calibration/{core,series}.ts with AUC, CI, status, and cullOrder over calibrated grades only). The domain Grade carries a required calibration status, and packages/domain/src/candidate.ts shownGrades draws only `calibrated` grades. lib/decision/v1/sources/forge.ts (7245d4b2/26820a6d) stamps each forge grade with v1's grader-calibration.json status. What is still missing: nothing calls registerScore, measureRegistered or kernel cullOrder; the Board draws no grade meters and has no StaleBadge; the forge commit keeps no thumbnails (mediaRefs only hashes files).

**Retarget:** Register forge grades with packages/kernel/src/calibration/series.ts registerScore at forge settle (lib/producers/forge.ts / lib/decision/v1/sources/forge.ts). Make kernel cullOrder the default order for matrix-cull packets in app/(studio)/board/_board, add a StaleBadge for a series mismatch, and put thumbnail retention in the forge commit (lib/foundry/store.ts commitRun, or the content-addressed blob store).

**Next / live paths:** `packages/kernel/src/calibration/core.ts`, `packages/kernel/src/calibration/series.ts`, `packages/domain/src/candidate.ts`, `lib/decision/v1/sources/forge.ts`, `lib/foundry/calibration.ts`, `lib/foundry/store.ts`, `app/(studio)/board/_board/Board.tsx`

**Retired:** `app/foundry/CullGrid.tsx`, `app/foundry/Lightbox.tsx`

**Residue and doubts:** The "meters steer the curator backwards" harm is moot for now: the Next Board draws no grade meters, and the domain allows only calibrated grades to be drawn. Still open from the card: case 6 (thumbnail retention), the StaleBadge, cullOrder having a caller, and kernel calibration series fed with live data (the module is built but unwired). The v1 stage-2 work (5b4a9b7: grader_digest, the commit rewriting grader-calibration.json) still runs through lib/foundry/store.ts.

### `foundry-dojo-A` · STANDS-RETARGETED

Card: [09-content-pipeline.md](09-content-pipeline.md).

Nothing from this card has landed. lib/foundry/training/types.ts:109 still has `reflected: false | string`, and store.ts:348 writes reflected:false for every decided improvement, rejects included. lib/foundry/training/lifecycle.ts and pipeline/dojo-status.mts do not exist, and pipeline/frames-prompt-regression.mts is still in the tree. The UI target, app/foundry/DojoView.tsx, was retired in ed151a11. The Dojo gate is now the Board packet (lib/decision/v1/sources/dojo.ts, pipeline/decide.mts).

**Retarget:** The lifecycle core lands where the card said (lib/foundry/training/{lifecycle,types,store}.ts, pipeline/dojo-status.mts, pipeline/frames-prompt-regression.mts). The per-state Tally moves from DojoView to the Ledger's training source (lib/ledger/v1/sources/training.ts on /ledger) or the Board dojo packet (lib/decision/v1/sources/dojo.ts).

**Next / live paths:** `lib/foundry/training/types.ts`, `lib/foundry/training/store.ts`, `pipeline/frames-prompt-regression.mts`, `pipeline/foundry/training-ledger.json`, `lib/ledger/v1/sources/training.ts`, `lib/decision/v1/sources/dojo.ts`

**Retired:** `app/foundry/DojoView.tsx`

**Residue and doubts:** The catalogue lists it as open. The ledger has 17 rows, all with a `reflected` key. Only the status-surface half was retargeted; the schema-2 migration still has to ship together with the GPU box's loop.

### `probe-frame-data-A` · STANDS-UNCHANGED

Card: [09-content-pipeline.md](09-content-pipeline.md).

pipeline/vlm-probe/{materialize.py,refs.py,corpus.lock.json,frame_manifest.py} are tracked and the rebuild left them alone. No rebuild commit touches pipeline/vlm-probe. corpus.lock.json is still {"frames":{}}, and no frame manifest is tracked. 9447ae20 changed forge.py, but only to split it into kernel-job steps; that has nothing to do with the lockfile.

**Next / live paths:** `pipeline/vlm-probe/materialize.py`, `pipeline/vlm-probe/refs.py`, `pipeline/vlm-probe/corpus.lock.json`, `pipeline/vlm-probe/frame_manifest.py`, `pipeline/foundry/forge.py`, `.gitignore`

**Residue and doubts:** Partial since 9a1a9b5. Left: run --build-lock on the machine that holds the frames (operator/box act), track the manifests, switch the lanes to logical refs, and stamp dojo readbacks. I did not check whether forge.py still stamps source_sha256 after the 9447ae20 split.

### `pipeline-scripts-B` · STANDS-RETARGETED

Card: [09-content-pipeline.md](09-content-pipeline.md).

The card was merged into CIP-A (2059833: tests/_engine/fake-claude.mjs puts a PATH stand-in ahead of the real CLI). The rebuild kept that lane alive: ed151a11 rewrote tests/golden-path/{recalibrate,frames}-route-e2e.probe.spec.ts to drive the real turn kinds on lib/turns/runner.ts after the routes retired. The residue is untouched: tests/live has no fake-engine shim. pipeline/drive-{research-step,recalibration,script-step}.mjs are still present but drive retired v1 pages (app/_phases/research/ResearchStep.tsx).

**Retarget:** Live-lane PATH shim: run tests/live journeys on /projects/[id]/[part] (Research.tsx, Script.tsx editors) against the real, non-DRY research and script producers (lib/producers/{research,script}.ts on the worker) with tests/_engine/fake-claude.mjs first on PATH, then delete the dead pipeline/drive-*.mjs drivers.

**Next / live paths:** `tests/_engine/fake-claude.mjs`, `tests/golden-path/recalibrate-route-e2e.probe.spec.ts`, `tests/golden-path/frames-route-e2e.probe.spec.ts`, `lib/producers/research.ts`, `lib/producers/script.ts`, `app/(studio)/projects/[id]/[part]/_edit/Research.tsx`, `pipeline/drive-research-step.mjs`, `pipeline/drive-recalibration.mjs`, `pipeline/drive-script-step.mjs`

**Retired:** `app/api/research/route.ts`, `app/api/recalibrate/route.ts`, `app/api/frames/route.ts`

**Residue and doubts:** The card itself is merged (C10). The /api/{research,recalibrate,frames} routes it targeted are retired, and the reasoning now runs as kernel producer jobs and turn kinds. Only the residue (the live-lane shim after AIO-A 4b) stays open. The three pipeline/drive-*.mjs drivers are now orphaned against retired pages.
