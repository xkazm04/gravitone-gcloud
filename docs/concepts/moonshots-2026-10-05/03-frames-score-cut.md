# Moonshot cards · Frames Score Cut

_Part of [the 2026-10-05 moonshot backlog](README.md). Each card is one dispatchable session; start from its **First session dispatch**._

## frames-phase

### frames-phase-A · One picture-unit contract: trailer shots own plates and reach Score and Cut

**Context:** frames-phase · **Slot:** A architecture
**Size:** XL · **Effort:** 8/10 · **Impact:** 9/10 · **Risk:** 6/10 · **Gate:** architecture + direction
**Registry:** media-generation/video-assembly#generated-shot-sourcing; media-generation/production-pipeline-phasing#shared-clock-across-phases

**Summary.** Today a `Frame` is "one explainer beat", identified by its position. So trailer and free-beats projects produce zero frames, and everything after Frames (Score's picture and the whole Cut) is empty for them. The move is a single `PictureUnit`: a stable id, explicit `startS`/`holdS` and the plate/clip/layers. An explainer beat projects to one unit, a trailer shot to one unit each, and Score and Cut read units instead of re-deriving time from `Frame.at`.

**Premise (verified).**
- `app/_phases/frames/frames.ts:399-401`: `framesFor` returns `[]` for every origin except `explainer-fixture`. A trailer cut derives no frames by construction.
- `app/_phases/frames/ShotSheet.tsx:3-9,25-29`: the shot lane is read-only, has no generate path, and imports nothing from `lib/imaging`. `app/_phases/frames/shots.ts:611-623` names the blocker: `reviewSceneSpecs` keys by `f.at`, so "whoever builds shot→frame has to give a shot its own identity in that contract first" (also `sceneSpec.ts:244,295-297`).
- `app/_phases/cut/deriveTimeline.ts:167-172`: no frames gives `origin: "empty"` and zero seconds, so a trailer project's Cut has nothing to lay out. `app/_phases/score/picture.ts` (`pictureFromFrames`) builds the Score's picture only from `Frame.atS` + `durationOf`.
- `app/_phases/frames/shots.ts:204,237`: a `Shot` already has the two things a unit needs, a stable `beatId` and a derived `holdS`. Only `Frame` lacks them.
- `app/_phases/frames/frames.ts:470`: frame ids are positional (`fr-${i}`). Alternatives are keyed by frame id (`alternatives/alts.ts:10-14`, `useAlternatives.ts:112-113`). When a project switches its adopted render, the new render's `fr-3` inherits the kept plates of the old render's `fr-3`, which belong to a different beat.

**The move.**
- New `app/_phases/frames/picture/unit.ts`:
  - `PictureUnit { id, sourceId, beatRef: {beatId?, at}, ordinal, ofBeat, startS: number|null, holdS: number|null, kind: "beat"|"shot", plate, clip, elements, texts, staging?: ShotStaging }`.
  - The id is derived, never positional: `${sourceId}:${beatId ?? at}:${ordinal}`.
- `unitsFromRender(source)`:
  - Explainer: one unit per beat, timing from `durationOf`. The projection is byte-identical to today's frames apart from the id.
  - Trailer: one unit per `shotsFromBeats` shot, timing from `holdS` accumulated.
- `FramesStepData` v2 stores `units`. A pure v1→v2 migration runs at the read seam and folds in `withClips`.
- `sceneSpec` keys by `unitId` (the schema gains `unitId`, with `beatAt` kept for prompt legibility).
- `pictureFromUnits` replaces `pictureFromFrames` and reads explicit `startS`/`holdS`. `deriveTimeline` and `useSpots` consume it.
- Alternatives are keyed by unit id.
- Stage 3 lets trailer units generate plates through the existing `generatePlate` path, with `promptsForShots` as the subject. ShotSheet becomes a ledger, and that is the direction call.

**Why it is a moonshot / what it unlocks.** The trailer discipline currently ends at Step 3. This makes it reach Score spotting (movements finally land on real scenes) and the Cut monitor/finish line. Time stops being re-derived from `Frame.at` strings in three places and becomes data on one clock. A future clip renderer gets a unit with a stable identity and a duration. The cross-render alternatives contamination disappears as a side effect. Trailer creators notice first; the Score and Cut builders stop special-casing "no picture".

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. Explainer fixture → `unitsFromRender` gives the same count, `at`, `kind`, `line`, layers and seeded elements as today's `framesFromRender`; only `id` differs.
2. Trailer cut (3 beats → 7 shots, durationS 30) → 7 units, `startS` strictly increasing, Σ`holdS` = 30 ± 0.01.
3. Stored v1 frames record with plates and no `clip` → v2 units with plates and `emptyClip()`; no write happens before the migration resolves.
4. Adopted render switches A→B → no alternative from A's units appears under B's units (the ids differ).
5. `deriveTimeline` over a trailer project's units → `origin: "project"` and 7 picture clips.
6. A direction spec for two shots under one beat → both applied (keyed by unit id), neither rejected as "covered twice".

**Write set.** Stage 1: new `app/_phases/frames/picture/unit.ts` and `picture/migrate.ts`; edit `frames.ts`, `useFrames.ts`, `sceneSpec.ts`, `alternatives/alts.ts`, `alternatives/useAlternatives.ts`. Stage 2: `app/_phases/score/picture.ts`, `score/useSpots.ts`, `cut/deriveTimeline.ts`. Stage 3: `ShotSheet.tsx` → ledger, `shotPrompt.ts`, `FramesAssembly.tsx` (shared row). Stage 4: `/api/frames` prompt and schema for unit ids. Tests: `tests/golden-path/shot-decomposition.probe.spec.ts`, `cut.probe.spec.ts`, `score-spot-origin.probe.spec.ts`, new `picture-unit.probe.spec.ts`.

**Risks & rollback.** The v1→v2 migration touches money-bearing records, so a bug strands plates. Mitigations: migrate on read only and never rewrite until the first user edit; keep `frames` as a read-only shadow for one release. Trailer plate generation is new spend and must route through the existing `planRender` quote. Rollback: stages 1-2 are behaviour-neutral for explainers; stage 3 is a flag on the ShotSheet ledger.

**First session dispatch.**
Read `app/_phases/frames/frames.ts`, `shots.ts` (the seam note at :605-660), `sceneSpec.ts`, `score/picture.ts` and `cut/deriveTimeline.ts`. Build stage 1 only: `picture/unit.ts` with `unitsFromRender` and the v1→v2 migration, with explainer units proven byte-identical to today's frames. Write `tests/golden-path/picture-unit.probe.spec.ts` (cases 1-4) red first. Gate: `npm run typecheck` and `npm test -- picture-unit shot-decomposition cut`.

_Runner-up:_ plates out of IndexedDB data: URLs into the asset blob store with pointer records (the 5MB-per-cut warning at `useFrames.ts:11-15`; alternatives add ~1.5MB per scene, `alts.ts:12-14`).

### frames-phase-B · The direction pass becomes a proposal: per-beat diff, keep my edits, stale plates marked

**Context:** frames-phase · **Slot:** B experience
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 4/10 · **Gate:** direction
**Registry:** media-generation/review-iteration-loops#edit-plan-over-regeneration; media-generation/frame-direction#per-beat-rejection; software-engineering/undo-history#checkpoint-restore

**Summary.** "Direct the cut" is the most expensive call in the step and takes minutes. Its result is applied blind: every accepted spec replaces the frame's elements and texts wholesale, which erases human fact bindings and hand placement, and there is no undo. The move turns the pass into a persisted, reviewable proposal: a per-row diff, accept/reject per beat, preservation of anything a human touched, and a plate that knows the subject it was actually rendered from.

**Premise (verified).**
- `app/_phases/frames/sceneSpec.ts:294-313`: `applySceneSpecs` replaces `elements` and `texts` outright, with fresh ids, on every frame that has a spec.
- `app/_phases/frames/useFrames.ts:443-447`: `bindFact` is the human act this step "exists to hold". The next pass silently drops the binding unless the model happens to re-cite the same fact (`sceneSpec.ts:311`). Moves and resizes (`useFrames.ts:475-496`) are lost the same way.
- `app/_phases/frames/useFrames.ts:645`: the result is applied in the same tick it is parsed. Nothing in the hook keeps a prior state, and `setFrames` is the only writer.
- `app/_phases/frames/sceneSpec.ts:303-305` and `useFrames.ts:419-421`: `plate.subject` is overwritten while `plate.src` keeps the old picture. `frames.ts:75` documents `subject` as "What was asked for", so after a pass the record claims the plate was asked for a subject it was never rendered from, and nothing marks it.
- `app/_phases/frames/useFrames.ts:613-633`: the pass's cost is real and accumulated. That makes discarding a pass by accident (or keeping a bad one irrecoverably) a money problem, not only a UX one.

**The move.**
- `direct()` stops writing frames. It writes a `DirectionProposal` under a new step key `frames-proposal`, persisted because it was paid for: per unit `{ before, ops: EditOp[], rejected?, conflicts[] }`.
- New `app/_phases/frames/direction/plan.ts` holds:
  - `planFromSpecs(frames, specs)`, which emits typed ops: `setSubject`, `setMotion`, `setRationale`, `replaceElements`, `upsertText(keepFactId)`.
  - `applyOps(frame, ops, policy)`.
- Every layer gains `by: "seed" | "pass" | "human"` (set by `bindFact`, `moveLayer`, `setText`). An op that would overwrite a `human` layer becomes a conflict whose default is keep.
- `Plate` gains an immutable `renderedSubject`, written once in `generatePlate`. When `subject !== renderedSubject` the row shows a `<StaleBadge>`, and `planRender` counts those rows as re-render candidates in the quote, separately from "missing".
- The review surface is a row-level before/after `FrameCanvas` pair with accept / reject / accept-all, using the signal vocabulary (Tally of conflicts and stale plates, no prose).
- One checkpoint, "before last applied pass", supports whole-pass revert, plus per-row revert.

**Why it is a moonshot / what it unlocks.** Re-running direction becomes safe, so creators can iterate on art direction (new style, new brief) without losing the integrity work: fact bindings on figures. The "a plate that matches its subject" invariant becomes checkable, which gives budget forecasting a real number for re-renders. The same op plan is what an agent-assist or a per-beat "re-direct just this row" would emit. Anyone who has bound sixteen figures and pressed "direct the cut" again notices.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `direct()` resolves → `frames` deep-equal to before; a `frames-proposal` record exists and survives a reload.
2. A frame whose figure text has a human-bound `factId: "f-ath"`, and a spec whose text omits `factId` → after accept, the figure keeps `f-ath` (or the row lists a conflict with keep as default).
3. Accept row 3 only → frames other than 3 are byte-identical.
4. Plate rendered with subject A, accepted proposal sets subject B → `renderedSubject === A`, `subject === B`, the row is flagged stale, and `planRender` reports 1 re-render separate from missing.
5. "Revert last pass" → frames equal the pre-accept snapshot exactly.
6. An element the user moved (`by: "human"`) and a spec that replaces elements → the proposal marks a conflict, and the default apply keeps the moved element.

**Write set.** new `app/_phases/frames/direction/plan.ts`, new `direction/ProposalReview.tsx`; edit `useFrames.ts`, `sceneSpec.ts`, `frames.ts` (Plate, layer `by`), `FramesAssembly.tsx`, `renderPlan.ts`, `parts.tsx`; `app/_phases/_shared/stepStore.ts` (proposal type). Tests: new `tests/golden-path/direction-proposal.probe.spec.ts`.

**Risks & rollback.** It adds a click between paying and seeing the result. Mitigation: accept-all is one key, and the rows already carry the rejections. The `by` provenance on legacy records is absent, so treat absent as `seed`, which means an old cut's hand edits are not protected until touched again; say so in a code comment, not in the UI. Rollback: `direct()` can call `applyOps(…acceptAll)` immediately behind a flag, which restores today's behaviour.

**First session dispatch.**
Read `app/_phases/frames/useFrames.ts:539-677`, `sceneSpec.ts:226-313` and `renderPlan.ts`. Build `direction/plan.ts` (`planFromSpecs`, `applyOps`, conflict policy) as pure functions, with cases 2, 3, 5 and 6 in `tests/golden-path/direction-proposal.probe.spec.ts` red first. Then add `renderedSubject` to `generatePlate` (case 4). Gate: `npm run typecheck` and `npm test -- direction-proposal frames`.

_Runner-up:_ a music-video effects slate: N seeds × effectParams rendered as an anchored-variation contact sheet from the deterministic `compositor.ts` before export.

_Checked:_ read in full: `frames/useFrames.ts`, `frames/frames.ts`, `frames/FramesStep.tsx`, `frames/sceneSpec.ts` (16-314); read in part: `shots.ts` (1-283, 480-663), `ShotSheet.tsx` (1-80), `alternatives/alts.ts`, `alternatives/useAlternatives.ts` (1-130), `music-video/useMusicVideoComposition.ts` (95-130); grep-traced `renderPlan.ts` exports, `FramesAssembly` direct/subject sites, and `framesFor` → Cut/Score. Hypotheses traced: trailer dead-end (confirmed), positional-id alternatives contamination (confirmed by code path, not run), subject/src drift (confirmed). Map drift: `frames/renderPlan.ts` is in no context.

## frames-score-cut

### frames-score-cut-A · Cue takes become sound-store rows: the music lane survives a reload, and agents can fill it

**Context:** frames-score-cut · **Slot:** A architecture
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** contract (closes ADR 2026-08-29-score-take-persistence)
**Registry:** media-generation/video-assembly#music-spotting-against-picture; media-generation/generated-music-acceptance#structure-verification-against-plan; media-generation/production-pipeline-phasing#asset-vs-disposable-render

**Summary.** A Score take is still a `blob:` URL in React state. It is dead on reload, invisible to the Cut after navigation, and re-billed every time. Meanwhile the repo has grown a file-backed sound store that persists takes, measures their length, and is already agent-drivable. The move answers the open ADR with a fourth option: the bytes live in the sound store, and the spot record holds only a `takeId`. Then Score and Cut both read persisted takes, and the finish line can check a take's measured length against its cue.

**Premise (verified).**
- `app/_phases/score/ScoreSpotting.tsx:217-221,523,583-606`: `Take = { state: "done"; url }`, held in `useState`, minted by `generateCueAudio` → `audioUrl` (a blob, `lib/musicClient.ts:55-62`).
- `app/_phases/cut/useCut.ts:131-170` and `deriveTimeline.ts:31-37,241-252`: the Cut's music lane is "missing… no take in hand" unless a file is dropped into this session. `finishLine.ts` "takes in hand" can therefore never pass across a reload.
- `.vault/Architect/decisions/2026-08-29-score-take-persistence.md`: status `proposed`, decision "Not made", options A/B/C (B is IndexedDB bytes against a quota the store calls reachable). Its prerequisite, a `projectId` on Score, is now met (`app/studio/[projectId]/phases.tsx:29`).
- `lib/sound/types.ts:1-9,105-150`: a FILE-backed store "because agents must be able to generate… and pick from Finalized without a browser". A `SoundTake` carries `file`, `measured.durationS`, `tempoBpm`, `stage`, `label`. `app/api/sound/generate/route.ts:1-8` is a money route that persists the take it bills for.
- `app/_phases/_shared/stepStore.ts:188-216`: `ScoreStepData` "does not have a field for [a take], and must not grow one without answering the question" the ADR leaves open. This card answers it.

**The move.**
- ADR resolution, written to the vault: option D, "the asset in the sound store, the decision in the step record".
- `ScoreSpot` gains `take?: { takeId: string; boundAt: number }` as a pointer only, under score record v2.
- New `app/_phases/score/takes.ts`:
  - `renderCueTake(cue)` posts to `/api/sound/generate` with the cue brief that `cueToPlan` already builds, then binds the returned `take.id`.
  - `bindableTakes(cue)` calls `listTakes({ kind: "music", stage: "finalized" })` and ranks by |`measured.durationS` − cue `durS`| and tempo, so Arrangement's finalized takes become pickable per cue.
  - A dropped file goes through `uploadTake` (origin `import`) and is bound the same way, so the Cut's drop zone stops minting session-only URLs.
- `deriveTimeline`'s `takes` input becomes `Record<cueId, { src: takeFileUrl(id); measuredS: number | null }>`, resolved from the spots.
- `finishLine` gains a `take-fit` row: |measured − cue span| against a stated tolerance, `unmeasured` when `measured` is null.
- The sound store stays project-agnostic; the binding lives only on the spot.

**Why it is a moonshot / what it unlocks.** It closes a five-week-old open ADR with infrastructure that now exists instead of a quota gamble. The Cut's music lane survives navigation, which makes the finish line's "takes" row honest across sessions. Takes judged in the Sound lab (verdict, defects, finalized) become what the film actually uses, not a parallel universe. An agent driving `pipeline/sound.mts` can fill a project's cues headlessly. Re-billing a take after every reload stops. Card frames-score-cut-B depends on this: the server can read the bytes by id.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. A spot with `take.takeId = "st_x"` → the `deriveTimeline` music clip has `status: "ok"` and `src === takeFileUrl("st_x")` (no `blob:`).
2. A v1 score record (no `take`) → reads unchanged; spots identical; no write on load.
3. A `takeId` the store no longer has → the clip is `missing`, why "take gone from the store", and never `ok`.
4. Take `measured.durationS` 34 under a 30s cue → the `take-fit` row is `fail` with "+4.0s over picture"; `measured: null` → `unmeasured`.
5. `renderCueTake` called twice while the first is in flight → exactly one `/api/sound/generate` request.
6. `bindableTakes` ranks a 30.4s take above a 22s take for a 30s cue.

**Write set.** new `app/_phases/score/takes.ts`; edit `score/spots.ts` (ScoreSpot), `score/useSpots.ts`, `score/ScoreSpotting.tsx`, `score/SpotList.tsx`, `cut/useCut.ts`, `cut/deriveTimeline.ts`, `cut/finishLine.ts`, `cut/parts/Lanes.tsx` (drop zone → upload), `_shared/stepStore.ts` (ScoreStepData doc); `.vault/Architect/decisions/2026-08-29-score-take-persistence.md`. Tests: `tests/golden-path/cut.probe.spec.ts`, `score-spot-origin.probe.spec.ts`, new `score-take-binding.probe.spec.ts`.

**Risks & rollback.** The sound store lives at `foundry-out/sound/` (`lib/sound/store.ts:10,49`), which is local-disk. On an ephemeral cloud deploy, bound takes vanish, so the "take gone" branch (case 3) must be honest and the posture must be stated where it is decided (`lib/deployment.ts`). Spend moves from `/api/music/generate` to `/api/sound/generate`, and the budget ceiling must still refuse first (the route says it does). Rollback: the `take` field is optional, and dropping it restores session takes.

**First session dispatch.**
Read the ADR above, `lib/sound/types.ts`, `lib/sound/client.ts`, `score/ScoreSpotting.tsx:517-620` and `cut/deriveTimeline.ts:233-255`. Build `score/takes.ts` plus the `ScoreSpot.take` field and the `deriveTimeline` resolution, with cases 1-4 red first in `tests/golden-path/score-take-binding.probe.spec.ts`. Wire the UI second. Gate: `npm run typecheck` and `npm test -- score-take-binding cut score-spot-origin`.

_Runner-up:_ a voice lane: per-line narration takes (the ElevenLabs adapter is already in `lib/music/elevenlabs.ts`) into the same store, so "written, not recorded" (`deriveTimeline.ts:24-28`) becomes a measured lane.

### frames-score-cut-B · Compile the cut: an animatic MP4 from the derived timeline

**Context:** frames-score-cut · **Slot:** B experience
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** architecture + direction
**Registry:** media-generation/video-assembly#cut-compiled-from-source; media-generation/video-assembly#gap-and-refusal-honesty; media-generation/review-iteration-loops#gate-record-outlives-the-media

**Summary.** The Cut has a finish line that lists "what stands between this cut and a render", but no render exists for any standard project. Only the music-video branch can export. Meanwhile the derived cut is already a pure, clock-exact document. The move compiles that document (picture segments with their composited layers, takes at their dialled offsets, gaps as gaps) and renders an animatic MP4 through the headless pipeline the music video already proved. The Cut stops being a viewer and produces a deliverable.

**Premise (verified).**
- `app/_phases/cut/finishLine.ts:1-9` and `parts/FinishLine.tsx:47`: the checks exist "between this cut and a render", and nothing in `app/_phases/cut/` outside `music-video/` produces one.
- `lib/musicVideoExport.ts:1-20,308-330`: the headless Chromium → PNG → ffmpeg mux pipeline exists, with encoder fallback, atomic landing and a projectId sidecar (`:90-94`). Its `ExportRequest` is poster+envelope only (`:84-95`).
- `app/_phases/cut/deriveTimeline.ts:186-252`: the cut is already a pure function giving scenes and clips with `startS`/`durS`/`src` and explicit `missing` + `why`. `offsets.ts:30-31` (`drawnStart`) is the one formula for where a block plays.
- `app/_phases/cut/parts/Monitor.tsx:3-16`: the preview composites each shot with `FrameCanvas` (`frames/parts.tsx`), so preview and export can share one compositor, which is the music video's own duality.
- `lib/deployment.ts:103`: `canSpawnLocalBinaries()` already gates local-binary work, so posture handling is not new design.

**The move.**
- New `app/_phases/cut/cutDocument.ts`: `compileCut(cut, offsets, takes) → CutDocument v1`, a deterministic JSON EDL:
  - `picture: { unitRef, startS, durS, layers snapshot | gap{why} }[]`
  - `audio: { takeId | gap, startS (with offset), durS, gainDb? }[]`
  - `finish: FinishCheck[]` (the gate record travels with the media)
- Factor `lib/export/headless.ts` out of `musicVideoExport.ts` (browser launch, temp dirs, encoder probe, atomic land, sidecar).
- New `lib/cutExport.ts`:
  - Picture: render each picture segment's `FrameCanvas` SVG once to PNG (stills held, so no per-frame capture), then use the ffmpeg concat demuxer with per-segment durations. A gap is black.
  - Audio: `adelay` + `amix` of takes read by id from the sound store (card A), with silence over audio gaps.
- New route `app/api/cut/export`. An "export animatic" control on the Finish line is enabled whatever the verdicts, because an animatic with holes is the review artifact. The document and the sidecar carry the failing rows.
- The Publish calendar picks the result up through the same sidecar.

**Why it is a moonshot / what it unlocks.** The pipeline ends in a watchable, shareable file for every discipline, not just music video. The cut becomes source: versions are documents to diff, a restyle is a recompile, and the critique pass can read relations (gaps, overhangs, unscored seconds) rather than watch. It also gives the probe lane a deterministic artifact to snapshot. Creators and reviewers notice on day one: "send me the cut" becomes possible.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `compileCut` over 3 scenes with offsets `{ "mus-a": 250 }` → that audio segment's `startS` is +0.25s; Σ picture `durS` = `cut.totalS`.
2. A missing plate → its picture segment is `gap` carrying the clip's `why`, with no `src`.
3. Same inputs twice → identical JSON (stable key order); the document hash is equal.
4. `canSpawnLocalBinaries()` false → the route returns 4xx with the posture sentence, and no file lands.
5. Live lane: the exported MP4's duration (ffprobe) equals `cut.totalS` ± 1 frame at 25 fps.
6. The sidecar JSON carries `projectId` and the finish-line verdicts at export time.

**Write set.** new `app/_phases/cut/cutDocument.ts`, new `lib/export/headless.ts`, new `lib/cutExport.ts`, new `app/api/cut/export/route.ts` (plus a download route); edit `lib/musicVideoExport.ts` (use the shared kernel), `cut/parts/FinishLine.tsx`, `cut/useCut.ts`, `lib/publish/exports.ts`. Tests: new `tests/golden-path/cut-document.probe.spec.ts`; a live-lane case under `npm run test:live`.

**Risks & rollback.** SVG → PNG fidelity: `FrameCanvas` fonts must be present in headless Chromium, so render through the same page bundle, as music video does. Without card A, takes are blob-only and would need a base64 upload (works, but heavy). Refactoring `musicVideoExport.ts` risks a working export, so land the kernel extraction as its own commit with the music-video live test green. Rollback: the route and button are additive.

**First session dispatch.**
Read `lib/musicVideoExport.ts`, `cut/deriveTimeline.ts`, `cut/offsets.ts`, `cut/finishLine.ts` and `cut/parts/Monitor.tsx`. Build `cutDocument.ts` (`compileCut`, pure and deterministic) with cases 1-3 red first in `tests/golden-path/cut-document.probe.spec.ts`. Then extract `lib/export/headless.ts` without behaviour change. Gate: `npm run typecheck`, `npm test -- cut-document cut`, then `npm run test:live` for the music-video export.

_Runner-up:_ persist the compiled `CutDocument` as the one clock record that Score and Frames read back (shared-clock-across-phases), so no downstream step re-derives seconds from `Frame.at`.

_Checked:_ read in full: `cut/deriveTimeline.ts`, `cut/useCut.ts`, `cut/finishLine.ts`, `cut/offsets.ts`, `score/spots.ts`, `score/picture.ts`; read in part: `score/ScoreSpotting.tsx` (1-140, 210-240, 570-625), `score/useSpots.ts` (30-120), `cut/CutTimeline.tsx` (1-40), `cut/parts/FinishLine.tsx` (1-80), `cut/parts/Monitor.tsx` (1-60), `cut/clock.ts` (1-50), `lib/musicVideoExport.ts`, `lib/sound/types.ts`, `lib/sound/client.ts`, `app/api/sound/generate/route.ts`, the score-take-persistence ADR. Findings for the operator:
- The context map lists only `cut/CutTimeline.tsx`, but `cut/` now holds 18 files, so the map has drifted.
- The registry's `video-assembly` deviation (stale, revisionsBehind 2) cites the `TIMELINE` fixture that `deriveTimeline.ts` (2026-10-05) replaced, so it wants a `/conform --stale` re-judgement.

## phase-shared

### phase-shared-A · Step records get a registry: typed keys, a versioned read seam, atomic patch, lineage

**Context:** phase-shared · **Slot:** A architecture
**Size:** XL · **Effort:** 8/10 · **Impact:** 9/10 · **Risk:** 6/10 · **Gate:** architecture
**Registry:** software-engineering/migrations#migrate-from-data-shape; software-engineering/versioning-snapshots#lineage-and-variants; media-generation/production-pipeline-phasing#asset-vs-disposable-render

**Summary.** Today `stepStore` is an untyped key/value store. Every phase key is a string literal redeclared at each reader, every read is an unchecked cast, the version stamp is written and never read, and "read-merge-write" is copy-pasted in four places on top of the read that flattens failure into `{}`. Lineage is hand-rolled per record (`renderId`, `spine`), and in Frames it destroys work: a changed upstream silently re-derives over paid plates. The move is a record registry: each step declares its records once (key, owner, version, parser, migrations, `derivesFrom`), and every read, patch and save goes through it.

This explicitly adopts studio-workspace's "in-transaction patchProject" idea for step records and goes materially beyond it: typed keys, a versioned and refusing read seam, a derived staleness graph, and a ratchet.

**Premise (verified).**
- `app/_phases/_shared/stepStore.ts:547-561`: `readStep<T>` returns `req.result?.data as T` with no parse and no version check. `:578-618`: `SCHEMA_VERSION` is stamped and "nothing reads this yet"; the policy's rules 3-4 (refuse the future, migrate at the read seam) are "NOT built yet".
- Phase keys are redeclared string literals: `frames/useFrames.ts:64-71`, `score/useSpots.ts:38-42`, `score/ScoreSpotting.tsx:89`, `cut/useCut.ts:94-95` (bare `"frames"`, `"score"`), `script/trailer/useTrailerCut.ts:27-28`, `research/useMusicVideoSource.ts:38` and `frames/music-video/useMusicVideoComposition.ts:43`. The shared store also imports step types upward (`stepStore.ts:36-37`).
- The read-merge-write is copied ("copied from useMusicVideoSource.ts's write verbatim", `useMusicVideoComposition.ts:101-111`; also `useMusicVideoSource.ts:62-64` and `research/beats/useBeatPicks.ts:74-80`). Each copy uses `loadStep`, which turns a failed read into `{}` (`stepStore.ts:563-573`), so a transient failure writes a partial record over the poster, envelope and seed.
- `frames/alternatives/useAlternatives.ts:58,94-102`: `loadStep`, then `loaded = true`, then a debounced save. A failed read arms a write of `{}`-plus-seeds over the stored kept alternatives (≈1.5MB of paid plates per scene, `alts.ts:12-14`).
- `frames/useFrames.ts:296-307,333-339`: a `renderId` mismatch re-derives fresh frames, and the save overwrites the stored cut 600ms later. Re-adopting a different candidate in Script silently discards the paid plates. `TrailerCutStepData.spine` (`stepStore.ts:156-163`) is a second, separately invented lineage key.
- `frames/frames.ts:119-124`: `withClips` is a hand migration "because there is no migration seam to hang this off".

**The move.**
- New `app/_phases/_shared/records/`, sketched in the block after this list.
- Each owning step exports its defs from its own directory (`frames/records.ts`, `score/records.ts`…). Readers import the def from the owner, as `FramesStepData` already travels with its writer, so the store holds no step types.
- `readRecord(def, pid)` returns `ReadOutcome` plus `refused: "future" | "malformed"`.
- `patchRecord(def, pid, fn)` runs get+put in ONE readwrite transaction and replaces the four copies.
- `useRecord(def, pid)` folds `useStepFor` with save gating: never armed after a failed or refused read.
- Every write stamps `derivedFrom: { [key]: savedAt }`. A pure `staleness(records)` returns the records that are behind their inputs.
- Frames' `renderId` branch becomes "stale, plates kept, rebase offered" instead of re-derive-and-overwrite.
- A ratchet probe fails on any `saveStep`/`readStep`/`loadStep` call with a string-literal key outside `records/`.

```ts
defineRecord<T>({
  key,
  owner: PhaseKey,
  version,
  parse: (raw) => T | Refusal,
  migrate: { 1: v1ToV2, … },
  derivesFrom?: RecordDef[],
})
```

**Why it is a moonshot / what it unlocks.** Three classes of silent data loss (failed-read overwrite, non-atomic merge, upstream-change wipe) stop being problems re-fixed per site. The persisted-payload-versioning ADR finally gets the half it deferred. The Studio gets a derived, cross-step "what is stale and why" for free (the matrix and UpstreamBreak can read it). The next steps (motion, VO) get a record contract instead of a copy-paste template. frames-phase-A's v1→v2 frames migration has a seam to land on. Builders notice first; creators notice when re-adopting a script stops eating their plates.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `readRecord` over a stored record with `v: 2` while the def is at version 1 → `refused: "future"`; `useRecord` never arms a save.
2. A v1 frames record without `clip` → the def's migration yields `clip: emptyClip()`, and `withClips` is deleted with no behaviour change.
3. Two `patchRecord` calls on `music-video-source` issued in the same tick (`posterAssetId`, `seed`) → both fields are present after both settle.
4. Alternatives hook with a read that fails → zero writes issued (saveStep spy).
5. Frames record `derivedFrom["script-adopted"] = T1`, adoption rewritten at T2 → `staleness()` lists `frames`, and the frames hook writes nothing over stored plates until an explicit rebase.
6. Ratchet probe: a new file calling `saveStep(pid, "frames", …)` with a literal → fails.

**Write set.** Stage 1: new `app/_phases/_shared/records/{registry,patch,useRecord,lineage}.ts`; edit `_shared/stepStore.ts`. Stage 2: defs plus migration of `frames/useFrames.ts`, `frames/alternatives/useAlternatives.ts`, `frames/music-video/useMusicVideoComposition.ts`, `research/useMusicVideoSource.ts`, `research/beats/useBeatPicks.ts`. Stage 3: `score/useSpots.ts`, `cut/useCut.ts`, `script/trailer/useTrailerCut.ts` and the staleness read in `UpstreamBreak` consumers. Stage 4: the ratchet in `tests/golden-path/shared-notebook-contracts.probe.spec.ts`.

**Risks & rollback.** It touches every persisted step, the money-bearing ones included. Mitigations: defs are additive wrappers over the same keys and record shapes, and stage 2 converts one site per commit with its probe. "Refuse the future" could hide records in a two-tab, two-build session, which is the intended trade per the ADR. Rollback per site: the def call compiles down to today's `readStep`/`saveStep`.

**First session dispatch.**
Read `app/_phases/_shared/stepStore.ts` (all of it), `.vault/Architect/decisions/2026-08-29-persisted-payload-versioning.md` and `_shared/useLoadFor.ts`. Build `records/registry.ts` + `records/patch.ts` (`readRecord`, `patchRecord`, `useRecord`) with cases 1, 3 and 4 red first in a new `tests/golden-path/step-records.probe.spec.ts`. Convert `useAlternatives.ts` and `useMusicVideoComposition.ts` first, since they carry the live data-loss paths. Gate: `npm run typecheck` and `npm test -- step-records shared-notebook-contracts`.

_Runner-up:_ a project bundle export/import (all step records + uploads + asset pointers as one file), the remedy that the `quota` trouble kind ("means stop and export", `stepStore.ts:254-255`) names and nothing provides.

### phase-shared-B · Your own notebook, downstream: one resolver replaces the Bitcoin fixture everywhere

**Context:** phase-shared · **Slot:** B experience
**Size:** XL · **Effort:** 8/10 · **Impact:** 9/10 · **Risk:** 6/10 · **Gate:** direction + architecture
**Registry:** media-generation/evidence-bound-visuals#figure-must-cite-a-fact; media-generation/content-research-grounding; media-generation/review-iteration-loops#follow-up-that-can-kill-a-fact

**Summary.** Step 1 can now reason a notebook for the creator's own topic and saves it per project. Every downstream consumer still reads one module-level constant, the 2026-08-11 Bitcoin run: the triage board, scope, evidence log, notebook modal, Script gate, Script model turns, and Frames' figure binding. So a creator's own research dead-ends on the card that produced it, and their figures are checked against Bitcoin facts. The move is one per-project resolver with its provenance, threaded through every reader.

**Premise (verified).**
- `app/_phases/_shared/stepStore.ts:45-84`: the `research-notebook` record exists (validated notebook + receipt, `null` = cleared). Its only readers are `research/guided/useEducationalResearch.ts:82` and `lib/board/sources/projects.ts:41`.
- `app/_phases/research/run/LiveResult.tsx:33-39,231`: "the board, the conclusions deck and the scope arithmetic are all built from the SHIPPED FIXTURE"; on screen, "the triage board below still reads the saved 2026-08-11 run".
- `app/_phases/_shared/notebook/cards.ts:65` defaults `buildCards(nb = NOTEBOOK)`, and `research/useScope.ts:39` calls it with no argument. `notebook.ts:184-227` computes `FACT_BY_ID`, `UNKNOWN_BY_ID` and `NOTEBOOK_COUNTS` at module load.
- `script/gate.ts:45,418` (`opts.facts ?? NOTEBOOK.facts`), `script/useVersions.ts:203` (`notebook: NOTEBOOK` sent to the model) and `script/ScriptStep.tsx:351-356`: Script judges and prompts against the fixture.
- `frames/useFrames.ts:43,606,640-641`: the direction pass is briefed with, and the figure gate graded against, `FACTS` (the Bitcoin table) for every project. `figure-must-cite-a-fact` requires resolution "against the actual research corpus for this piece".
- `_shared/notebook/EvidenceLog.tsx:22-26` and `NotebookBody.tsx:77` render the constant regardless of project.

**The move.**
- New `app/_phases/_shared/notebook/source.ts`: `resolveNotebook(projectId) → { notebook, provenance: "reasoned" | "replay" | "none", engine? }`. The order of authority:
  1. A valid `research-notebook` record (checked by `lib/notebook/validate.ts`) → `reasoned`.
  2. A seeded `research` replay → `replay`.
  3. Otherwise → `none`. A cleared record (`null`) also gives `none`, never `replay`.
- `indexNotebook(nb)` replaces the module constants (byId, counts).
- A `NotebookProvider` / `useNotebook()` is mounted at the studio route. Each consumer takes the notebook as an argument, not an import: `buildCards(nb)`, gate `opts.facts`, the `useVersions` payload, the `useFrames` facts and grades, `EvidenceLog` and `NotebookBody` props, and follow-up effects.
- The provenance chip (`ReasonedNote` / `StandInNote`) is carried onto every surface that shows notebook content.
- `CONCLUSIONS` (`conclusions.ts:369`) is fixture-only. For a reasoned notebook the conclusions deck draws absence (a `<Ghost>`) rather than Bitcoin conclusions.
- Staged:
  1. Resolver + indexes + evidence log/modal.
  2. Triage board and scope.
  3. Script gate and versions.
  4. Frames binding and direction.

**Why it is a moonshot / what it unlocks.** This is the product's core promise: research about my topic drives my script and my frames. Today it holds only for one seeded project. It also makes the evidence-bound visuals gate mean something, because a figure must cite this piece's facts, and a live notebook with zero facts correctly leaves every figure unbound. Future research engines (search-enabled rungs, follow-ups that kill facts) land with consequences downstream instead of on a dead-end card. Every creator who runs live research notices immediately.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. A project with a valid `research-notebook` record → `provenance: "reasoned"`, and the facts equal the record's.
2. The seeded Bitcoin project → `replay`, and it is the fixture.
3. A fresh project → `none`. The Frames bind-fact list is empty, the direction request's `facts` is `[]`, and no `f-*` Bitcoin id appears anywhere in the payload (fetch spy).
4. A cleared record (`notebook: null`) → `none`, not `replay`.
5. `buildCards(reasonedNb)` contains no card id from `facts.ts` (e.g. no `f-ath`).
6. A record that fails `validate.ts` → `none` plus a storage/validation trouble, never a silent fixture fallback.
7. `gate(render, { facts: resolved.facts })` on a reasoned notebook → scale-conversion checks read the resolved notebook, not `NOTEBOOK.scaleConversions` (`gate.ts:303`).

**Write set.** Stage 1: new `_shared/notebook/source.ts` and `_shared/notebook/NotebookProvider.tsx`; edit `notebook.ts` (indexes), `EvidenceLog.tsx`, `NotebookBody.tsx`, `sections/*.tsx`, `FactRow.tsx` (FACT_BY_ID). Stage 2: `cards.ts`, `research/useScope.ts`, `research/scope.ts`, `research/followup.ts`. Stage 3: `script/gate.ts`, `script/constraints.ts`, `script/useVersions.ts`, `script/ScriptStep.tsx`. Stage 4: `frames/useFrames.ts`, `app/api/recalibrate/route.ts`. Tests: `tests/golden-path/notebook-graph.probe.spec.ts`, `shared-notebook-contracts.probe.spec.ts`, new `notebook-source.probe.spec.ts`.

**Risks & rollback.** A "reasoned, not searched" notebook (LiveResult's own warning) becomes evidence that gates scripts and frames, and whether it may is the direction call. The provenance chip has to travel with it, and the Script/Frames surfaces should show the `reasoned` tone. The scripts' `RENDERS` are also fixture-bound to Bitcoin, so stage 3 exposes that a reasoned notebook has no candidate renders yet. That is honest absence, but name it before building (C-002/C-003 adjacent, not overlapping). Rollback: the resolver falls back to today's constant behind a flag, per stage.

**First session dispatch.**
Read `research/run/LiveResult.tsx`, `research/run/live.ts:110-300`, `_shared/notebook/notebook.ts`, `cards.ts:60-200` and `lib/notebook/validate.ts`. Build `source.ts` (`resolveNotebook`, `indexNotebook`) and the provider, with cases 1-4 and 6 red first in `tests/golden-path/notebook-source.probe.spec.ts`. Then convert `EvidenceLog`/`NotebookBody` to props as stage 1. Gate: `npm run typecheck`, `npm run check:notebook`, `npm test -- notebook`.

_Runner-up:_ claim ripple. A follow-up `downgrades`/`kills` effect (`research/followup.ts:17-23`) marks every frame figure bound to that fact (`FrameText.factId`) and every conclusion depending on it as stale, on the evidence log row itself.

_Checked:_ read in full: `_shared/stepStore.ts`, `_shared/useLoadFor.ts`, `_shared/usePhaseReport.ts`, `_shared/notebook/notebook.ts`, `facts.ts`, `NotebookBody.tsx`, `FactRow.tsx`, `EvidenceLog.tsx`; read in part: `cards.ts` (1-40 + exports), `conclusions.ts`/`dimensions.ts`/`types.ts` (exports), `research/followup.ts` (1-60), `research/guided/useEducationalResearch.ts` (60-140), `research/run/LiveResult.tsx` (1-60, 210-240), `frames/music-video/useMusicVideoComposition.ts` (95-130), `research/beats/useBeatPicks.ts` (60-80). A census of phase-key literals and of every `NOTEBOOK`/`FACTS` importer (14 sites, 35 files referencing either name) was run by grep. Hypotheses traced: failed-read overwrite in alternatives and in the music-video read-merge-write (confirmed by code path, not executed), renderId wipe (confirmed), fixture notebook downstream (confirmed, and stated by LiveResult itself).
