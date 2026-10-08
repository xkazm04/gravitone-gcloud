# Critic pass · 2026-10-07 · the picture chain

**Status: READ-ONLY REVIEW.** This is the fourth critic pass of the day over the
[moonshot backlog](README.md). The earlier three are [critic-2026-10-07.md](critic-2026-10-07.md),
[critic-2026-10-07-script-chain.md](critic-2026-10-07-script-chain.md) and
[critic-2026-10-07-step-record-shell.md](critic-2026-10-07-step-record-shell.md). This pass covers
the last milestone-2 chain that had no spec: `frames-phase-A` → `frames-score-cut-B` →
`video-clip-pipeline-B` (`README.md:59-60`), plus the C4 tails.

**The base.** I opened every anchor below at **`5c51f6c`**, which is local `main` and this
worktree's base. The C2 AIO-A 4b delivery run was in flight beside this pass. Its write set is
`app/api/research/`, `lib/turns/`, `lib/jobs.tsx`, `app/_phases/research/`,
`app/_phases/_shared/stepStore.ts`, `tests/golden-path/` and the README. It **had not merged** when
I finished: `git rev-parse main` was still `5c51f6c`. No anchor here sits in a file 4b writes,
except two stale comments in `stepStore.ts`, which are named and left alone.

Nothing here changes a card, the README or any code. The status edits it proposes are listed at the
end, for whoever owns the README.

**Scope.**
- **Part 1, the cards:**
  - `frames-phase-A` (`03-frames-score-cut.md:7-53`);
  - `frames-score-cut-B` (`03-frames-score-cut.md:147-196`);
  - `video-clip-pipeline-A` (`04-pipeline-probes-video.md:208-253`);
  - `video-clip-pipeline-B` (`04-pipeline-probes-video.md:254-301`).
- **Part 2, the C4 tails:**
  - the `take-fit` row from `frames-score-cut-A` (`03-frames-score-cut.md:102-146`), which merged
    into MUSIC-B at `6997be6`;
  - MUSIC-B's kept-range metering (`06-imaging-music.md:351-396`, case 3).
- **Part 3:** the measure, collisions, operator decisions, the order to build in, and catalogue
  edits.
- **Out of scope:** `frames-phase-B` and `phase-shared-A`. Part 3 states how this chain sequences
  against phase-shared-A's specified stages (`critic-2026-10-07-step-record-shell.md:177-227`).

**Method.** The same as the step-record pass. Each Premise anchor gets one of three verdicts:
- `true`: it holds, at that line or within a few;
- `moved`: it holds, at the new `path:line` given;
- `false`: it no longer holds; the evidence and the sha that changed it are given.

The card text dates from `bf0a94d` (2026-10-05). Four read-only verifiers each took one group of
cards. I re-opened every load-bearing anchor myself with `sed -n` before writing it down.

Besides the gates, I ran:
- five existing offline probes (listed below);
- one hand-built ffmpeg graph on synthetic `lavfi` inputs, in a temp directory that was then
  deleted ([The measure](#the-measure-which-probe-exports-the-animatic-offline)).

No app, dev server, engine, GPU job or paid call ran.

---

## Verdicts at a glance

| Card | Premise | What main already covers | Verdict | Next stage | Shape |
| --- | --- | --- | --- | --- | --- |
| `frames-phase-A` | 12 anchors: 1 false (`alts.ts` is now keyed by unit id, `6ab78b7`), 4 moved, 7 true. **New finding:** trailer shot units are derived but never saved. | Stage 1 (`6ab78b7`): `PictureUnit`, `unitsFromRender`, v2 record migrated on read. Cases 1-4 met. | **Build after phase-shared-A's writers stage** | Stage 2: shot units persist, and Score and Cut read units (card case 5) | Decided |
| `frames-score-cut-B` | 11 anchors: 1 false ("nothing in `cut/` renders": ads Finish `f913ad7`, the route `b3c54be`), 3 moved, 7 true | `compileCut`, `lib/export/headless.ts`, `POST /api/cut/export` and its download route (`38bfc82`). Cases 1-4 and 6 met; case 5 open. | **Build next: 2a (the offline render probe). 2b (the Finish-line control) after phase-shared-A's writers.** Drawn layers held for the operator (P3). | 2a: one probe, tests only | 2a and 2b decided; drawn layers is P3 |
| `video-clip-pipeline-A` | 11 anchors, all true. Nothing of the card is built. | Nothing | **Build: stage 1, in any free slot** (pipeline-only, disjoint). Enforcement in `check:clips` waits for V1. | Stage 1: `ledger.py`, the stdlib selftest, takes layout, regrade, build refusal | Stage 1 decided; waivers are V1 |
| `video-clip-pipeline-B` | 9 anchors: 1 false (`PHASES` has `motion`, `1c90240`), 2 moved, 6 true | Stage 1 (`1c90240`): Motion is step 6, the direction proposes or declines. Cases 1, 2 and 6 met. **A paid i2v queue already exists for ads** (`710240a`). | **Hold for the operator** (V2: which engine renders a standard Motion clip). Stage 4 also waits for frames-phase-A stage 2. | None now | V2 |
| `frames-score-cut-A` take-fit row | 9 anchors: 4 false (MUSIC-B delivered them, `e2e907b`), 3 moved, 1 true, 1 not verifiable here | Cases 1 and 3 met. Case 2 half met. Case 5 built but not probed. | **Build after frames-phase-A stage 2** (they share `deriveTimeline.ts` and `useCut.ts`). Case 6 declined. | `take-fit` row, plus the active take measured on bind | Decided |
| MUSIC-B kept-range metering | 11 anchors: 3 false (delivered by `e2e907b`), the rest true or moved | Cases 1, 2 and 4 met; 3, 5 and 6 partly | **Build next: the honest-meter stage** (pins today's full-length metering, fixes two false comments). The pricing change itself is M1. | Comment truth plus a meter probe | Decided; the rate is M1 |

---

## Gate state of the base

I ran the gates the brief names on the untouched base (`5c51f6c`, this worktree). **All pass.**

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint:ratchet` | exit 0: "1024 files, 0 errors, 12 warnings, all 3 bucket(s) at baseline (measured 2026-09-05)" |
| `npm test` | exit 0: 1712 passed, 1 skipped (3.0 min) |

The brief's inherited flake, `tests/golden-path/articles-checks.probe.spec.ts:147`, passed in this run.

I also ran these offline probes on their own:
- `npx playwright test tests/golden-path/{cut-document,ad-render,score-takes,picture-unit,motion-phase}.probe.spec.ts`
- Result: 44 passed, **0 skipped**. That means `ad-render`'s real ffmpeg render
  (`tests/golden-path/ad-render.probe.spec.ts:264`) ran on this machine; it was not skipped.

**`census.json` keeps every merge below serial.** That is true of every stage that adds or
re-imports a `.ts`/`.tsx` file under `app/` or `components/` (`critic-2026-10-07-step-record-shell.md:80-83`).

---

## Part 1 · The cards

### What already sits on the chain

- **Picture units** (`6ab78b7`, merged `eff57ca`) live in `app/_phases/frames/picture/`:
  - `unit.ts`:
    - `PictureUnit` at `:59-92`;
    - `unitId` at `:98`, which builds `${sourceId}:${beatId ?? at}:${ordinal}`;
    - `unitsFromFrames` at `:133`;
    - `unitsFromRender` at `:168`;
    - `framesFromUnits` at `:272`, which keeps **beat units only**.
  - `migrate.ts`: `framesV1ToV2` at `:59` and `parseFramesRecord` at `:68`.
  - `FRAMES_RECORD` is v2 with `migrate: {1: framesV1ToV2}` (`app/_phases/frames/records.ts:14-20`).
- **The compiled cut** (`d6a7a0e`, `9f64953`, `b3c54be`, merged `38bfc82`):
  - `compileCut` at `app/_phases/cut/cutDocument.ts:153`, with `takePointers` at `:172`;
  - the kernel, `lib/export/headless.ts`;
  - the animatic, `lib/cutExport.ts`, with `runCutExport` at `lib/cutExport.ts:237`;
  - `POST /api/cut/export` (`app/api/cut/export/route.ts`) and
    `GET /api/cut/export/file` (`app/api/cut/export/file/route.ts`).
- **Score takes in the sound store** (`e2e907b`, `41fd01a`, merged `6997be6`):
  - `ScoreSpot.takeIds`/`activeTakeId` at `app/_phases/score/spots.ts:78-82`;
  - the Cut resolves `activeTakeId` against the store's listing (`app/_phases/cut/deriveTimeline.ts:239-261`).
- **Motion, step 6** (`1c90240`, merged `a9d5975`):
  - `PHASES` at `lib/projects.ts:43`;
  - `app/_phases/motion/{direction,records,useMotion,MotionStep}.ts(x)`;
  - `POST /api/motion/direct`.
- **The ads clip queue** (`710240a`, moved into Motion by `f441b62`):
  - Leonardo image-to-video, `lib/imaging/video/leonardo.ts:155`;
  - `POST /api/video/clips` with polling and file routes;
  - a `video-usd` budget class (`lib/spend/classes.ts:97-102`);
  - clips stored under `foundry-out/clips/` (`lib/imaging/video/store.ts:27`);
  - per-shot `clips` and `adoptedClip` on the `ADS_SHOTS` record (`app/_phases/_shared/records/ads.ts:82`).

### frames-phase-A: premise

| # | Anchor (card) | Verdict | Evidence at `5c51f6c` |
| --- | --- | --- | --- |
| 1 | `frames.ts:399-401` `framesFor` returns `[]` except `explainer-fixture` | **moved** | `app/_phases/frames/frames.ts:401-402`; the body is unchanged (`6ab78b7` added the comment above it) |
| 2 | `ShotSheet.tsx:3-9,25-29` read-only, no generate path | **true** | Unchanged since `bf0a94d`; nothing imports `generatePlate` |
| 3 | `shots.ts:611-623` `reviewSceneSpecs` keys by `f.at` | **true** | `app/_phases/frames/shots.ts:618`, `:622` |
| 4 | `sceneSpec.ts:244,295-297` keyed by `at` | **true** | `app/_phases/frames/sceneSpec.ts:244` `byAt`; `:295-297` keys by `s.beatAt`. No `unitId` anywhere in the file. |
| 5 | `deriveTimeline.ts:167-172` no frames → `origin: "empty"` | **moved** | `app/_phases/cut/deriveTimeline.ts:176-181` (moved by `e2e907b`); `:186` still calls `pictureFromFrames` |
| 6 | `score/picture.ts` `pictureFromFrames` | **true** | `app/_phases/score/picture.ts:55`. No `pictureFromUnits` exists anywhere under `app/`, `lib/` or `tests/`. |
| 7 | `shots.ts:204,237` `beatId`, `holdS` | **true** | |
| 8 | `frames.ts:470` positional `fr-${i}` | **moved** | `frames.ts:472`. It now names only the seeds, which `unitsFromRender` re-ids (`picture/unit.ts:168-174`). |
| 9 | `alts.ts:10-14` keyed by positional frame id | **false** (`6ab78b7`) | `app/_phases/frames/alternatives/alts.ts:10-17` now says the store is keyed by picture-unit id |
| 10 | `useAlternatives.ts:112-113` | **moved** | `:108-109` `byFrame[f.id]`; `f.id` is now a unit id |
| 11 | (risk) `useFrames.ts:11-15` the 5 MB note | **true** | |
| 12 | (runner-up) `alts.ts:12-14` ≈1.5 MB per scene | **moved** | `alts.ts:16-17` |

**A finding the card could not have made: trailer shot units are never saved.**
1. `useFrames` derives the step's frames with `framesFromUnits(unitsFromRender(…))` (`app/_phases/frames/useFrames.ts:156-157`).
2. `framesFromUnits` keeps beat units only (`picture/unit.ts:272-273`). A trailer's units are all
   shots (`unit.ts:228-245`), so its `frames` is `[]`.
3. The save writes `units: unitsFromFrames(frames, …)` (`useFrames.ts:407`). That rebuilds the units
   from the beat-only shadow, so a trailer's stored record holds `units: []`.
4. `sameCut` needs `stored.units.length` (`useFrames.ts:356`), so it is never true for a trailer, and
   every open re-derives.

So "units are the record" (`useFrames.ts:404-406`, `migrate.ts:64-66`) holds for explainers only.
For trailers the record is a function of the beat list. Stage 1's case 2 is met **at the unit
level**: `unitsFromRender` gives 7 shots (`tests/golden-path/picture-unit.probe.spec.ts:308`). Its
units never reach disk, so no reader downstream could see them even if it read `units`.

**The v1 writers.** Two writers still save the frames record through the def-less store, and both
stamp `v: 1`:
- Motion's accept: `app/_phases/motion/useMotion.ts:122`, through `patchStep`;
- the board's alternative decision: `lib/board/sources/alternative.ts:105`, through `saveStep`.

`SCHEMA_VERSION` is 1 (`app/_phases/_shared/stepStore.ts:682`), and both paths apply it at
`stepStore.ts:738` and `:803`. `framesV1ToV2` then rebuilds units from `frames` and never trusts a
`units` field on a v1 object (`picture/migrate.ts:22-29`, `:59-62`). Two consequences:
- **Today, this is what makes those writes land.** Motion's accepted line lives only in
  `stored.frames` (`app/_phases/motion/direction.ts:293-297`). If the record were read as v2,
  `parseFramesRecord` would rebuild `frames` from `units` (`migrate.ts:80-81`) and drop the line.
- **It is also what will erase shot units** the day they are saved. A v1 write over a record that
  holds shot units comes back with only the beat units it can re-derive. Stage 2 below must close
  this in the migration before it saves a single shot unit.

The step-record pass named the Motion stamp as a hazard (`critic-2026-10-07-step-record-shell.md:165-169`).
This is the concrete failure it predicted.

### frames-phase-A: what main covers, against the acceptance

| Case | Status | Evidence |
| --- | --- | --- |
| 1 · explainer units equal today's frames, apart from the id | **met** | `tests/golden-path/picture-unit.probe.spec.ts:263`, `:296` |
| 2 · trailer: 7 units, `startS` strictly increasing, Σ`holdS` = 30 | **met at the unit level; never persisted** (finding above) | `picture-unit.probe.spec.ts:308`, control `:342` |
| 3 · v1 record → v2 with `emptyClip()`, no write before the migration resolves | **met** | `picture-unit.probe.spec.ts:365`, `:392` |
| 4 · switching the adopted render carries no alternatives across | **met** | `picture-unit.probe.spec.ts:435`, control `:480` |
| 5 · `deriveTimeline` over trailer units → `origin: "project"`, 7 clips | **open** | `deriveTimeline` takes `frames` (`deriveTimeline.ts:176`, `:186`). `useCut` reads `.frames` raw (`app/_phases/cut/useCut.ts:100`, `:118`). Score reads `.frames` raw and calls `pictureFromFrames` (`app/_phases/score/ScoreSpotting.tsx:474`, `:491`, `:507`). |
| 6 · two shots under one beat, both directed (keyed by unit id) | **open** (stage 4) | `sceneSpec.ts:244`, `:295`; the turn echoes `beatAt` (`lib/turns/assemble/frames.ts:152`) |

**The readers of the frames record.**
- Exactly one reads `units`: `useFrames` (`useFrames.ts:334`, `:356-359`).
- Every other reader reads the `frames` shadow:
  - `frames/verdict.ts:28` and `cut/verdict.ts:24`, through `stepContract`;
  - `useCut.ts:100`, raw;
  - `ScoreSpotting.tsx:474`, raw;
  - `useMotion.ts:50`, raw;
  - `lib/board/sources/alternative.ts:43`, raw.
- `migrate.ts:7-10` lists three readers that have not moved. Motion is a fourth.

### frames-phase-A next stage 2: shot units persist, and Score and Cut read units

One session, size M-L. **Build after phase-shared-A's writers stage.** That stage converts
`useCut.ts:100-101` to `readRecord(FRAMES)`/`readRecord(SCORE)`
(`critic-2026-10-07-step-record-shell.md:188`), so this stage changes a def read from `.frames` to
`.units` instead of converting a raw read a second time.

**Write set.**
- `app/_phases/frames/picture/migrate.ts`:
  - `framesV1ToV2` keeps the `kind: "shot"` units riding on a v1 object when that object's
    `renderId` is the one they were derived from;
  - beat units are still re-derived from `frames`;
  - the header (`:22-29`) is rewritten to say that.
- `app/_phases/frames/useFrames.ts`:
  - hold the source's shot units beside `frames`: from the stored record when `sameCut`, else from
    `unitsFromRender`;
  - the save at `:403-411` writes `units: [...unitsFromFrames(frames, …), ...shots]`;
  - `sameCut` (`:356`) stays as written. It becomes true for a trailer because `units` is no longer
    empty.
- `app/_phases/score/picture.ts`: a new `pictureFromUnits(units, targetS)` that reads the explicit
  `startS`/`holdS`. `pictureFromFrames` stays until its last caller is gone.
- `app/_phases/score/ScoreSpotting.tsx` (`:470-507`): reads through `readRecord(FRAMES_RECORD)` and
  draws `pictureFromUnits`.
- `app/_phases/cut/deriveTimeline.ts`:
  - takes `units` in place of `frames`;
  - its scene ids are unit ids, so `cutDocument.ts`'s `unitRef` is unchanged;
  - a shot with an empty plate is a `missing` picture clip with a `why`.
- `app/_phases/cut/useCut.ts`: hand `deriveTimeline` the def read's `units`.
- New `tests/golden-path/picture-readers.probe.spec.ts`.
- `app/kit/census.json`.

**Acceptance (write failing first, on fake-indexeddb).**
1. **Shot units persist.** `useFrames` on a trailer project (3 beats → 7 shots, `durationS` 30)
   saves a record with 7 `kind: "shot"` units. A second open is `sameCut`, re-derives nothing and
   arms no save. **Red today:** the record holds `units: []`.
2. **A v1 writer keeps the shots.** A `saveStep(pid, "frames", {...stored, frames})` (stamped
   v1, as `useMotion.ts:122` and `alternative.ts:105` write it) over a record holding 7 shot units
   reads back with the same 7 shot units. **Red** once case 1 passes, until the migration changes.
3. **Card case 5.** `deriveTimeline` over a trailer project's units gives:
   - `origin: "project"` and 7 picture clips;
   - Σ durations = 30 ± 0.01;
   - each clip `missing`, with the empty plate as its `why`.

   `compileCut` over that cut gives 7 `gap` segments. **Red today:** `origin: "empty"`.
4. **The explainer does not move.** On the fixture project, `pictureFromUnits(units)` gives the same
   scene starts and durations as `pictureFromFrames(frames)`. `cut`, `score-spot-origin`,
   `cut-document` and `picture-unit` pass **unmodified**.
5. **Score draws the trailer.** On the trailer project, Score's picture has 7 scenes at the shot
   boundaries.
6. **A refused record is refused downstream.** A frames record stamped `v: 99` makes Score and
   Cut show their read trouble. Neither draws an empty picture over it.
7. **The raw readers fall.** `readStep<FramesStepData>` disappears from `ScoreSpotting.tsx` and
   `useCut.ts`. That lowers phase-shared-A's literal-key ratchet budget by two, and the ratchet
   holds the drop.

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/{picture-readers,picture-unit,cut,cut-document,score-spot-origin,score-takes,step-records,step-verdicts}.probe.spec.ts`
- `npm run check:kit-census`
- `npm test`
- `node pipeline/cx-capture.mjs studio-cut`, then `studio-score`, each with `CX_PROJECT` set to a
  trailer project, and the PNG opened by eye

**Must not touch.**
- `sceneSpec.ts`, `/api/frames` and `lib/turns/assemble/frames.ts`: stage 4, and `lib/turns/` is
  4b's.
- `ShotSheet.tsx`: stage 3.
- `frames/verdict.ts`, `cut/verdict.ts` and `stepContract.ts`: WORKSPACE-A 2a. After this stage, a
  trailer's Cut lays out 7 gaps while its verdict, which reads `.frames`, still sees nothing. That
  is a known divergence for WORKSPACE-A to close, not a reason to edit a verdict here.
- `useMotion.ts` and `lib/board/sources/*`: the v1 writers move onto the def in phase-shared-A's
  lineage stage. Case 2 makes their writes safe until then.
- `stepStore.ts`, which 4b owns.

**Shape: decided.**

**Stages 3-4 stay as the card wrote them, with one sequencing change.**
- **Stage 3** gives trailer shots plates. That is new spend, and ShotSheet becomes a ledger, which
  is the card's direction call (`03-frames-score-cut.md:33`).
- Once shots carry paid plates, the live renderId data-loss path (`useFrames.ts:356`, `:359`,
  `:403-411`; `critic-2026-10-07-step-record-shell.md:136`) would throw those plates away on a
  render switch, exactly as it does for explainer plates today.
- So **stage 3 should land after phase-shared-A's lineage stage**, whose Frames branch becomes
  "stale, plates kept, rebase offered" (`critic-2026-10-07-step-record-shell.md:223-227`). The
  step-record pass ordered lineage *after* shot plates (`:1128`), because both write
  `useFrames.ts`. I recommend the inverse. See P1.

### frames-score-cut-B: premise

| Anchor (card) | Verdict | Evidence at `5c51f6c` |
| --- | --- | --- |
| `finishLine.ts:1-9` "between this cut and a render" | **true** | `app/_phases/cut/finishLine.ts:1` |
| `parts/FinishLine.tsx:47` | **true** | `app/_phases/cut/parts/FinishLine.tsx:47` |
| nothing in `cut/` outside `music-video/` produces a render | **false** (`f913ad7`, `b3c54be`) | Ads Finish renders through `/api/ads/render` (`app/_phases/cut/ads/`). The animatic route exists, though **no UI calls it**: `cut/export` appears only in the routes, `lib/capabilities.ts:112`, `:273`, and tests. |
| `musicVideoExport.ts:1-20` the Chromium → PNG → ffmpeg pipeline | **true** | `lib/musicVideoExport.ts:1-20` |
| `musicVideoExport.ts:308-330` encoder fallback, atomic land | **moved** (`9f64953`) | `runExport` is at `:310`. The fallback, landing and sidecar moved into the kernel: `lib/export/headless.ts:88-97`, `:101-118`. |
| `:84-95` `ExportRequest`; `:90-94` projectId sidecar | **moved** | `musicVideoExport.ts:90-103`; the sidecar is written by `headless.ts:112-114` |
| `deriveTimeline.ts:186-252` a pure function with `missing` + `why` | **moved** | `deriveTimeline.ts:172-267` |
| `offsets.ts:30-31` `drawnStart` | **true** | The doc comment is at `:30-31`; the function is at `app/_phases/cut/offsets.ts:32` |
| `Monitor.tsx:3-16` composites with `FrameCanvas` | **true** | `app/_phases/cut/parts/Monitor.tsx:3-16`; `<FrameCanvas>` at `:84` |
| `lib/deployment.ts:103` `canSpawnLocalBinaries` | **true** | |

**One sentence in the card's move is now false.** The animatic does **not** render through
headless Chromium, and it does not use the concat demuxer:
- Each picture segment is the unit's **plate**, handed straight to ffmpeg. A data: URL is decoded to
  a file, and a public path is used as is (`lib/cutExport.ts:215-231`).
- The plate is held with `-loop 1 -t`. A gap is a `color=black` lavfi source.
- Every branch is normalised, then joined by the `concat` **filter** (`lib/cutExport.ts:157-167`).
  The header gives the reason: the demuxer needs uniform inputs (`:20-23`).
- The layers FrameCanvas draws are in the document but not on the picture. The result says so,
  hard-coded `drawn: "plates"` (`lib/cutExport.ts:12-18`, `:84`, `:284`).

### frames-score-cut-B: what main covers

| Case | Status | Evidence |
| --- | --- | --- |
| 1 · a dialled offset of +0.25 s; Σ picture = `totalS` | **met** | `tests/golden-path/cut-document.probe.spec.ts:68` |
| 2 · a missing plate becomes a gap carrying its `why` | **met** | `cut-document.probe.spec.ts:94`; the blob-take gap at `:121` |
| 3 · deterministic JSON and hash | **met** | `cut-document.probe.spec.ts:137` |
| 4 · posture refuses, no file lands | **met, as 503** | `cut-document.probe.spec.ts:186`; the route at `app/api/cut/export/route.ts:35-43`. One comment is stale: `tests/golden-path/posture-coherence.probe.spec.ts:8` still says "cut/export (403)". |
| 5 · the exported MP4's ffprobe duration = `totalS` ± 1 frame | **open** | The probe defers it (`cut-document.probe.spec.ts:11-12`), and no case in `tests/live/` exports anything |
| 6 · the sidecar carries `projectId` and the verdicts | **met, on a hand-landed file** | `cut-document.probe.spec.ts:216`, through `landExport`, not through a real export |

The argument plan is checked purely at `cut-document.probe.spec.ts:239`. **No probe has ever run
`runCutExport`.** The card's own gate assumed a music-video live export test existed
(`03-frames-score-cut.md:189`). There is none.

### frames-score-cut-B next stage 2a: the animatic, exported offline

One session, size S. **Tests only.** This is the clause the plan's measure names (see
[The measure](#the-measure-which-probe-exports-the-animatic-offline)).

**Write set.** New `tests/golden-path/cut-export-render.probe.spec.ts`. Nothing else.

**How it runs.**
- It calls `runCutExport` (`lib/cutExport.ts:237`) in the node lane, with no route and no browser.
- It points the server's storage at temp directories through env: `PUBLISH_EXPORTS_DIR`
  (`lib/publish/exports.ts:35-38`) and `SOUND_STORE_DIR` (`lib/sound/store.ts:48`), plus
  `LOCAL_BINARIES=on` (`lib/deployment.ts:96-98`).
- It makes its fixtures with ffmpeg's `lavfi`, as `ad-render.probe.spec.ts:278-287` does:
  - a solid-colour PNG plate, sent as a data: URL;
  - a 2 s sine WAV, filed into the temp store with `createTake` (`lib/sound/takes.ts:271`,
    origin `import`).
- The document comes from `compileCut` over a synthetic `DerivedCut`, built the way
  `cut-document.probe.spec.ts` builds one: picture `[plate 2.0 s, gap 1.5 s, plate 1.5 s]`, one
  music take with offset `+250 ms`, and `totalS` 5.0.

**Acceptance.** It cannot be written red against absent code, because the code exists. Each
assertion is made live by being seen to fail once against a sabotaged expectation, and the commit
message records that.
1. **The file.** `ffprobe` finds:
   - exactly one `h264` 1920×1080 video stream;
   - one `aac` 48000 Hz audio stream;
   - `format.duration` = `totalS` ± 0.04 (one frame at `CUT_FPS` 25, `lib/cutExport.ts:56`).
2. **The picture.** The mean luma of one frame (the `frameLuma` helper shape of
   `ad-render.probe.spec.ts:256-262`):
   - at the middle of each plate segment matches the plate's colour;
   - at the middle of the gap is ≤ 16 (black).
3. **The sound.** `volumedetect` gives:
   - `max_volume` ≤ −60 dB over `[0, 0.2]` s, before the dialled start;
   - ≥ −30 dB over `[0.5, 1.5]` s;
   - ≤ −60 dB over `[3.0, 4.5]` s, after the take ends.
4. **The landing.**
   - `<id>.mp4` and `<id>.json` exist, and no `<id>.partial.mp4` does.
   - The sidecar has `kind: "cut-animatic"`, the `projectId`, and
     `document === cutDocumentHash(doc)`.
   - `result.drawn === "plates"`.
   - `result.encoder` is `libx264` or `h264_nvenc`; the probe logs which one ran.
5. **The take vanished.** A document naming a take id the store does not hold still lands a file.
   `result.unreachable` names the take as "take gone from the store", and its span is silent.
6. **A skip is not a pass in CI.** The probe skips when ffmpeg or ffprobe is off PATH, using the
   same `onPath` check as `ad-render.probe.spec.ts:237-245`. But when `process.env.CI` is set, a
   missing binary **fails** the probe. CI's gates job installs ffmpeg (`.github/workflows/gates.yml:319`)
   before the probes run (`:364`), so in CI the skip branch is unreachable.

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/{cut-export-render,cut-document,ad-render}.probe.spec.ts`
- `npm test`

No census entry: the stage adds no file under `app/` or `components/`.

**Must not touch.** `lib/cutExport.ts`, `lib/export/headless.ts` and the route. If the probe finds a
defect, the probe lands red-marked (`test.fail` with the defect named), and the fix is its own
commit. The stage is not widened to fix it.

**Shape: decided.**

### frames-score-cut-B next stage 2b: the Finish-line export control

One session, size S-M. **Build after phase-shared-A's writers stage**, and serial with
frames-phase-A stage 2, because both edit `useCut.ts`.

**Write set.**
- `app/_phases/cut/useCut.ts`: return the `spots` it already reads (`:119`), so the control can
  build `takePointers(spots)` (`cutDocument.ts:172`). One field; nothing else changes.
- New `app/_phases/cut/useCutExport.ts`:
  - `compileCut(cut, offsets, takePointers(spots))`, posted to `/api/cut/export` with
    `accessHeader()`;
  - in-flight dedupe, as `useCueTakes.ts:53-58` does.
- `app/_phases/cut/parts/FinishLine.tsx`: one export control in the section header.
  - It is rendered **only** when `localRender` is answered `true` (`lib/capabilities.ts:110-114`,
    `:273`), so it is never visible and then 503.
  - It is enabled whatever the verdicts are (`03-frames-score-cut.md:171`).
  - The result is a download link and a `<Tally>` of `unreachable`.
  - `drawn: "plates"` is a `<StaleBadge>`-shaped mark, not a sentence.
- New `tests/golden-path/cut-export-control.probe.spec.ts`.
- `app/kit/census.json`.

**Acceptance (write failing first).**
1. With `localRender: false`, no export control renders.
2. With failing finish rows, the control is enabled.
3. Two activations while the first is in flight send exactly one POST (stub fetch).
4. The POST body is `compileCut(cut, offsets, takePointers(spots))` byte-for-byte
   (`cutDocumentJson`), with `projectId`.
5. A 503 body's `detail` reaches the bell, verbatim.
6. `npm run check:narration` stays green, and the control's accessible name is a verb.

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/{cut-export-control,cut,cut-document,posture-coherence}.probe.spec.ts`
- `npm run check:narration`
- `npm run check:kit-census`
- `npm test`
- `node pipeline/cx-capture.mjs studio-cut`, with the PNG opened by eye

**Shape: decided.**

**Drawn layers are not a stage here.** The kernel's header records why plates-only was chosen: a
second compositor would drift from the monitor (`lib/cutExport.ts:12-18`). The other route is the
music video's: rasterise through the same page bundle in headless Chromium
(`lib/musicVideoExport.ts:1-20`). That costs a browser launch per export, and with it the
posture/Chromium dependency the animatic currently avoids. Which one ships is ask P3.

### video-clip-pipeline-A: premise

`be6f800` is the only commit since `bf0a94d` that touches these files. It changed home-directory
paths and none of the anchored lines.

| Anchor (card) | Verdict | Evidence at `5c51f6c` |
| --- | --- | --- |
| `render_preset_clips.py:230-234` one raw, others unlinked | **true** | `pipeline/video/render_preset_clips.py:230-234`. Its raw sidecar (`:235-240`) does record seed, engine and prompt. |
| `render_preset_clips.py:179` reseeding is manual | **true** | |
| `pipeline/video/README.md:311-314` four hand-driven seeds | **true** | `pipeline/video/README.md:312` |
| `build-preset-clips.mts:65-78`, `:136-144` route only | **true** | `pipeline/build-preset-clips.mts`; `clip_check` is never called |
| `clip_check.py:101-106` `PALETTE_FLOOR = 0.55` | **true** | `pipeline/video/clip_check.py:106` |
| `pipeline/video/README.md:296-297` 0.18 and 0.42 shipped | **true** | `pipeline/video/README.md:296-297` |
| both in `public/clips/manifest.json` | **true** | `public/clips/manifest.json:10` (signal-ledger), `:67` (chalk-argument) |
| `check-clips.mjs:16-24` no quality check | **true** | `pipeline/check-clips.mjs:16-24`. It lists four checks under a "THREE CHECKS" header; none of them reads quality. |
| `render_preset_clips.py:88-105` regex over `presets.ts` | **true** | |
| `compose_clip.py:250`, `:270` caches keyed by slug | **true** | `pipeline/video/compose_clip.py:245`, `:250`, `:270` |
| `ledger.py`, `selftest.py` | **absent** | Neither exists; nothing of the card is built |

**What main covers:** nothing. The raws are gitignored, and `pipeline/runs/preset-clips` does not
exist on this checkout. So this stage cannot regrade the shipped clips here, and stage 1 must not
need them.

### video-clip-pipeline-A next stage 1: the ledger, offline

One session, size M. Pipeline-only, and disjoint from every other stage in this document.

**Write set.**
- New `pipeline/video/ledger.py`.
- New `pipeline/video/selftest.py`, stdlib only, in the shape of `pipeline/foundry/selftest.py`.
- `pipeline/video/render_preset_clips.py`:
  - `--takes N` over a deterministic seed list;
  - raws go to `pipeline/runs/preset-clips/<id>/takes/<engine>-<seed>.{webm,json}` and are never
    overwritten.
- `pipeline/video/clip_check.py`: `--regrade <id>`.
- `pipeline/build-preset-clips.mts`: squeezes only the adopted take, refuses `check.ok === false`
  without a waiver, and copies `{engine, seed, prompt, route, check | waiver}` into each **new**
  manifest entry.
- `pipeline/video/README.md`.

**Acceptance (write failing first).**
- Card cases 1, 2, 3, 6 and 7. Cases 1 and 2 run in the selftest, on fake take files, with no GPU
  and no numpy.

**Not in this stage:** card cases 4 and 5. `check-clips` must not demand a `check` or `waiver` on
the shipped entries until the two palette failures are answered (V1). Turning the rule on first
would make `npm run verify` red for a decision nobody has made.

**Gates.**
- `python pipeline/video/selftest.py`
- `npm run check:clips`, unchanged and green
- `npm run typecheck`

**Shape: decided.**

### video-clip-pipeline-B: premise

| Anchor (card) | Verdict | Evidence at `5c51f6c` |
| --- | --- | --- |
| `lib/projects.ts:39` five `PHASES`, no motion | **false** (`1c90240`) | `lib/projects.ts:43`: `["research","script","frames","motion","score","cut"]` |
| `FramesAssembly.tsx:452-458` "no render button … until something can render it" | **moved** | `app/_phases/frames/FramesAssembly.tsx:518-521` |
| `LayerPanel.tsx:95-100` "the render seam is unbuilt" | **true** | `:91-100`; it still says "no video provider in this app", which `710240a` made false for ads |
| `projectTypes.ts:21` `ClipStatus` | **true** | Nothing under `app/` or `lib/` sets `rendered` or `rendering` |
| `frames.ts:112` `emptyClip()` | **true** | |
| `shots.ts:20-31` motion seeded empty | **true** | |
| `pipeline/video/README.md:120-146` compose holds a designed background | **true** | |
| `pipeline/video/README.md:207-212` "the author cannot decline" | **true for the pipeline** | The product's direction declines (`app/_phases/motion/direction.ts:230-264`) |
| `lib/foundry/store.ts:53` disk-run precedent | **moved** | `lib/foundry/store.ts:56` |

**What main covers.**

| Case | Status | Evidence |
| --- | --- | --- |
| 1 · `motion` after `frames`; old records give `progress.motion === "empty"` | **met** | `tests/golden-path/motion-phase.probe.spec.ts:84`, `:89` |
| 2 · no separable element → `declined` | **met** | `tests/golden-path/motion-direction.probe.spec.ts:81` |
| 3 · no runner heartbeat → "no runner", never "rendering" | **open** | There is no queue, no `lib/motion/`, no `motion_runner.py` |
| 4 · a failing take needs an override | **open** | No takes |
| 5 · adopted take → `rendered`, on the Cut at the frame's hold | **open** | `deriveTimeline.ts:19-22`; `cutDocument.ts:111-124` emits `still` or `gap` only |
| 6 · narration stays green | **met as a gate** | |

**What the card could not know.** Since the card was written, the repo has gained a **paid,
hosted** image-to-video path:
- Leonardo, offering `hailuo-03` only (`lib/imaging/video/types.ts:21`, `:29`), at 16:9 and 9:16
  (`lib/imaging/video/leonardo.ts:56-59`);
- a server-side record, detached runs, polling and a `video-usd` pre-gate;
- an adapter seam for tests (`setVideoAdapterForTests`).

It already covers most of the card's stage 2 queue and stage 3 takes list. What it lacks is
`clip_check` verdicts and the compose route that keeps a designed graphic's background
bit-identical (`pipeline/video/README.md:120-146`). The video price table is deliberately all
`null` (`lib/imaging/video/pricing.ts:3`, `:28`).

**Verdict: hold for the operator (V2).** Stage 2 has three possible shapes:
- the card's local GPU runner, polled from disk;
- the existing paid Leonardo queue;
- one queue with a local-runner adapter beside Leonardo.

That is a spend and direction call. It follows from the decision already taken at `README.md:140`
but is not settled by it. Stage 4 (Cut reads adopted clips) also needs frames-phase-A stage 2's
unit readers, plus a third `CutDocument` picture kind (`clip`), which `lib/cutExport.ts` would have
to learn to trim and concat.

---

## Part 2 · The C4 tails

### frames-score-cut-A: premise (the card merged into MUSIC-B)

| Anchor (card) | Verdict | Evidence at `5c51f6c` |
| --- | --- | --- |
| `ScoreSpotting.tsx:217-221,523,583-606` a take is a blob in `useState` | **moved; only partly true** (`e2e907b`) | `Take` is at `app/_phases/score/ScoreSpotting.tsx:230-234`. Renders go to the store first (`:609-628`). The blob path (`:631-651`) is the fallback for when the store is off. |
| `useCut.ts:131-170` "no take in hand" unless dropped | **false** (`e2e907b`) | `useCut.ts:170-188` lists the store's music takes |
| `deriveTimeline.ts:31-37,241-252` | **false** (`e2e907b`) | `deriveTimeline.ts:247` resolves `takeFileUrl(held)` |
| `finishLine.ts` "takes in hand" can never pass across a reload | **false** | `finishLine.ts:104-113` counts `status === "ok"`, which a stored take now reaches |
| the ADR is `proposed` | **not verifiable here** | `.vault/` is gitignored and absent from this worktree. `ScoreSpotting.tsx:208-229` records option D. |
| `phases.tsx:29` passes `projectId` | **moved** | `app/studio/[projectId]/phases.tsx:34` |
| `lib/sound/types.ts:1-9,105-150` | **moved** | `lib/sound/types.ts:129` (`measured`); `SoundTake` from `lib/sound/types.ts:110` |
| `app/api/sound/generate/route.ts:1-8` money route | **true** | |
| `stepStore.ts:188-216` `ScoreStepData` has no take field | **true as text, stale as fact** | The comment is at `app/_phases/_shared/stepStore.ts:199-207`. The pointers live on `ScoreSpot` (`spots.ts:78-82`). `stepStore.ts` is 4b's file, so this pass proposes the comment fix and does not make it. |

**What main covers.**

| Case | Status | Evidence |
| --- | --- | --- |
| 1 · a pointer resolves to `takeFileUrl`, never `blob:` | **met** | `tests/golden-path/score-takes.probe.spec.ts:353-359` |
| 2 · a v1 record reads unchanged, with no write on load | **half met** | `:368-370`. Nothing asserts "no write". |
| 3 · a take gone from the store → `missing`, never `ok` | **met** | `:361-366` |
| 4 · the `take-fit` row | **open** | `FinishCheck.id` has no `take-fit` (`finishLine.ts:17`). The measured length is dropped at `useCut.ts:183` (a `Set` of ids). Session drops decode `durationS` (`:149-153`), and `takeUrls` keeps only `.url` (`:191-194`). |
| 5 · two renders in flight → one request | **built, not probed** | `app/_phases/score/useCueTakes.ts:53-58` |
| 6 · `bindableTakes` ranks by length and tempo | **open; decline** | `adoptable` filters by label (`app/_phases/score/takes.ts:111-114`). Ranking by length is MUSIC-B's runner-up, "auto-spot" (`06-imaging-music.md:394`). It is not a gap in this chain. |

**One more fact the row depends on.** A Score take is not measured when it is filed:
- `lib/sound/generate.ts` never writes `measured`;
- only the lab's measure-on-open patches it (`app/playground/shared/measure.ts:64-83`);
- `CueTakes.tsx:237` displays `measured.durationS` but never fills it.

So a `take-fit` row built alone would read `unmeasured` for almost every Score take.

### take-fit next stage: the row, and the active take measured on bind

One session, size S-M. **Build after frames-phase-A stage 2**, because both edit `deriveTimeline.ts`
and `useCut.ts`.

**Write set.**
- `app/_phases/cut/useCut.ts`: keep `Map<takeId, measuredS | null>` from the listing at `:183`.
  Session drops keep their decoded `durationS`.
- `app/_phases/cut/deriveTimeline.ts`:
  - `storeTakeIds` becomes `storeTakes: ReadonlyMap<string, {measuredS: number | null}> | null`;
  - a music clip carries `measuredS`.
- `app/_phases/cut/finishLine.ts`:
  - the `take-fit` row, compared against the cue's span;
  - a named tolerance constant, `TAKE_FIT_TOLERANCE_S = 0.5`.
- `app/_phases/score/useCueTakes.ts`: when the active take `needsMeasure`, call `measureAndStore`
  (`app/playground/shared/measure.ts:66`) once per id.
- New `tests/golden-path/take-fit.probe.spec.ts`.
- `app/kit/census.json`: `useCueTakes` gains an import.

**Acceptance (write failing first).**
1. **Card case 4.** A take measured 34 s under a 30 s cue gives `take-fit` `fail` with
   "+4.0s over picture". With `measured: null` the row is `unmeasured`.
2. **Within tolerance.** 30.3 s under 30 s passes.
3. **Session drops.** A session-dropped take is judged by its decoded `durationS`.
4. **Store not read.** With the store unread (`storeTakes === null`), the row is `unmeasured`,
   never `pass`.
5. **The row travels.** `compileCut` and the sidecar carry the row, because `finish` comes from
   `finishLine` (`cutDocument.ts:167`).
6. **Measured once.** Binding a take whose `measured` is null sends exactly one measure PATCH (stub
   fetch), and two binds of the same id still send one.
7. **Card case 5.** Two `generate` calls with the same key send one request.
8. **Unchanged probes.** `score-takes` and `cut-document` pass unmodified. `cut.probe` changes only
   where it asserts the row list.

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/{take-fit,cut,cut-document,score-takes}.probe.spec.ts`
- `npm run check:narration`
- `npm run check:kit-census`
- `npm test`

**Must not touch.** `lib/sound/*`, so the server keeps no new behaviour, and `stepStore.ts`.

**Shape: decided.** The tolerance is a number the row states. Moving `measure.ts` out of
`app/playground` into a shared module is a refactor for later; importing it is enough.

### MUSIC-B: premise

| Anchor (card) | Verdict | Evidence at `5c51f6c` |
| --- | --- | --- |
| `ScoreSpotting.tsx:202-220` "NOT PERSISTED" | **false** (`e2e907b`) | `:208-229` records option D |
| `ScoreSpotting.tsx:585-605` revoke and replace | **moved** | Only on the blob fallback (`:645-650`); the store path keeps both takes (`:609-623`) |
| `stepStore.ts:190-198` | **stale comment** | `stepStore.ts:199-207` (see above) |
| `lib/sound/store.ts:1-27` file-backed, atomic | **true** | |
| `lib/sound/types.ts:104-160` | **moved** | `verdict` `:131`, `stage` `:135`, `label` `:139`, `parentId` `:140`, `songId` `:143`, `plan` `:145`; `projectId`/`cueId` at `:161-167` |
| `lib/sound/generate.ts:19-20,152-170` section-edit | **true** | Rendered at `lib/sound/generate.ts:264-289` |
| `lib/music/types.ts:10-15` the doctrine | **true** | |
| `types.ts:19` `TakeOrigin` has no `score` | **false** (`e2e907b`) | `lib/sound/types.ts:23` |
| `types.ts:132-133` label | **moved** | `:138-139` |

| Case | Status | Evidence |
| --- | --- | --- |
| 1 · a rendered cue is a stored take; survives a reload | **met** | `tests/golden-path/score-takes.probe.spec.ts:176-221` |
| 2 · two takes; the active one follows the pick | **met** | `:243-274` |
| 3 · section edit: the chunks, the parent, **and metered seconds equal section 2's length only** | **chunks met; metering false** | Chunks at `:278-303`. Metering: see below. |
| 4 · adopting a lab take makes no vendor call | **met** | `:307-322` |
| 5 · hosted posture hides the section edit | **built, not probed on Score** | `CueTakes.tsx:90`, wired at `ScoreSpotting.tsx:1167`. The flag itself is probed at `posture-coherence.probe.spec.ts:94-128`. |
| 6 · a verdict writes its ledger row | **half met** | `score-takes.probe.spec.ts:326-334` |

**The metering, as it is.**
1. `composeDetailed` meters `requestedSeconds(req)` (`lib/music/elevenlabs.ts:417`).
2. `requestedSeconds` adds every chunk, **including each kept section's referenced range**
   (`elevenlabs.ts:431-441`, `:436`).
3. That figure is reserved at `:105` and settled at `:112`.

So a 2-of-3 edit of the 19 s probe cue books 19 s, not the 5 s of the regenerated section. Two
comments claim the opposite:
- `lib/sound/editPlan.ts:67-68`: "what the meter is charged with. Kept sections are references, so
  they cost nothing to keep";
- `app/playground/labModel.ts:145-146`.

Neither function reaches the meter. `generate.ts:275` uses `editSeconds` only as a `≤ 0` guard.
The merge `6997be6` said it plainly: "Section-revision metering of kept ranges is a pricing call
left open."

**Which way is right is a fact about the vendor, not about this code.** The rate table is
deliberately undeclared until somebody reads a credit delta off the ElevenLabs dashboard after a
real render (`lib/music/pricing.ts:26-34`). Metering the full length errs high, which is the
direction this file chose for a money guard (`elevenlabs.ts:425-429`). So the stage below changes
**no number**. It makes the code say what it does. The rate itself is M1.

### MUSIC-B next stage: the honest meter

One session, size S. Disjoint from every other stage in this document.

**Write set.**
- `lib/sound/editPlan.ts`: the `editSeconds` doc comment says "seconds the edit regenerates; the
  meter books the whole requested length (`requestedSeconds`), pending M1".
- `app/playground/labModel.ts`: the same correction on its copy.
- New `tests/golden-path/section-edit-meter.probe.spec.ts`. It uses the fake-vendor harness shape
  of `score-takes.probe.spec.ts:74-122`: a temp `SOUND_STORE_DIR`, a fake key, and
  `__resetMusicBudget()`.

**Acceptance.**
1. **The section edit books the full length.** A 2-of-3 section edit on the 19 s cue books 19 s in
   the music window. The probe names M1 in its title, so the number is visibly a decision and not
   an accident.
2. **A full render books its length.** A full render of the same cue books 19 s.
3. **All-keep refuses.** An edit with every section `keep` is refused before any reserve, and books
   nothing.
4. **No false comment survives.** No source line under `lib/sound` or `app/playground` claims that
   kept sections are free of the meter (source grep).

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/{section-edit-meter,score-takes,sound-lab}.probe.spec.ts`
- `npm test`

`labModel.ts`'s edit is comment-only, so there is no census change.

**Shape: decided.** Changing what a section edit books is M1. If the operator answers "kept ranges
are free", the change is one line in `requestedSeconds` and case 1's number.

---

## Part 3

### The measure: which probe exports the animatic offline

The plan measures this chain by: *"frames-phase-A, frames-score-cut-B, video-clip-pipeline-A and -B
landed or declined, frames-score-cut-A take-fit row and MUSIC-B kept-range metering closed; a probe
exports an animatic MP4 offline."* Concretely:

**What encoder the kernel needs.**
- One binary, `ffmpeg`, resolved on `PATH`. There is no `FFMPEG_PATH` and no `ffmpeg-static`
  (`lib/export/headless.ts:36`, `lib/cutExport.ts:272`).
- Video: `h264_nvenc` is tried first, with one fallback to **`libx264`**
  (`headless.ts:73-77`, `:88-97`).
- Audio: the native **`aac`** encoder at 48 kHz (`lib/cutExport.ts:200`).
- Filters, all compiled into stock builds:
  - the `lavfi` sources `color` and `anullsrc`;
  - `scale`, `crop`, `fps` and `concat`;
  - `atrim`, `aresample`, `adelay`, `amix`, `apad`.
- **No Chromium.** The animatic imports none of `launchHeadless` (`lib/cutExport.ts:30-50`); only
  the music-video and ads paths launch a browser.
- Reading takes needs no vendor key. `getTake` reads the file store (`lib/cutExport.ts:256-267`).

**Is it present in the probe lane?**
- **On this machine: yes.** `ffmpeg 2025-02-17 essentials_build` with `libx264`, `h264_nvenc` and
  `aac`. `ad-render.probe.spec.ts:264`'s real render ran in this pass's probe run rather than
  skipping.
- **In CI: yes, for the node lane.** The `gates` job installs ffmpeg when `ffprobe` is absent
  (`.github/workflows/gates.yml:319`), and later in the same job runs `npm test` (`:364`).
  - On a GPU-less runner, `h264_nvenc` fails to initialise and the kernel falls back to `libx264`,
    which is the path the fallback exists for.
  - The `live` job (`:390`) installs Chromium but no ffmpeg, so this is a node-lane probe, not a
    `test:live` case.
- **I ran the kernel's graph shape here,** by hand, on synthetic inputs in a temp directory:
  - inputs: a `loop`ed PNG plate, then a 1.5 s `color=black` gap, then the plate again, and one
    `sine` take `adelay`ed 250 ms, `apad`/`atrim` to 5.0 s;
  - output: `h264` 1920×1080 plus `aac` 48000 Hz, duration `5.000000`;
  - luma at 1.0 s was 171.8, and at 2.75 s (in the gap) 0.0;
  - `max_volume` was −91 dB over 0-0.2 s, −18 dB over 0.5-1.5 s, and −91 dB over 3.0-4.5 s.

  The assertions in stage 2a are therefore measurable with the tools CI already installs.

**What the probe asserts about the file.** Exactly cases 1-5 of
[stage 2a](#frames-score-cut-b-next-stage-2a-the-animatic-exported-offline):
- the stream set and the duration, `totalS` ± one frame at 25 fps;
- a plate where a plate is, and black where the gap is;
- silence before and after the dialled take, and sound inside it;
- an atomic landing with a sidecar whose document hash matches;
- an unreachable take named and silent.

Its case 6 makes a CI skip impossible. **The probe is
`tests/golden-path/cut-export-render.probe.spec.ts`, built by frames-score-cut-B stage 2a.**

### How the picture chain sequences against phase-shared-A

The step-record pass's stage plan for phase-shared-A
(`critic-2026-10-07-step-record-shell.md:177-227`), and how this chain orders against it:
1. **Writers + ratchet.** This edits `useCut.ts` and `useSpots.ts`.
   - frames-phase-A stage 2, FSC-B 2b and take-fit all edit `useCut.ts`, so all three land **after**
     it.
   - frames-phase-A stage 2 removes two raw frames readers, which **lowers** that stage's pinned
     ratchet budget (case 7 above).
2. **Lineage.** `derivedFrom`, `staleness()`, and the Frames `renderId` branch becoming "stale,
   plates kept, rebase offered".
   - **The Frames `renderId` data-loss finding is not made worse by anything in this document.**
     frames-phase-A stage 2 persists shot units, which carry no plates.
   - **It becomes a money loss on shot plates the moment frames-phase-A stage 3 lands.** So lineage
     should run **before** stage 3, not after it as `critic-2026-10-07-step-record-shell.md:1128`
     orders. Both write `useFrames.ts`, so they are serial in either order.
   - The order that loses nothing: frames-phase-A stage 2 → lineage → stage 3. See P1.
   - Lineage also moves `useMotion.ts:122` and `alternative.ts:105` onto the def. Until it does,
     stage 2's migration rule (case 2) is what keeps their v1 writes from erasing shot units.

### Collisions

The in-flight run is C2 AIO-A 4b: `app/api/research/`, `lib/turns/`, `lib/jobs.tsx`,
`app/_phases/research/`, `app/_phases/_shared/stepStore.ts`, `tests/golden-path/` and the README. The
milestone-1 stages are C6 WORKSPACE-B 1 (`critic-2026-10-07.md:420-481`) and C7 foundry-forge-B 1
(`critic-2026-10-07.md:571-620`). The step-record and shell stages are
`critic-2026-10-07-step-record-shell.md:996-1007`.

| Next stage here | Writes | AIO-A 4b (in flight) | WORKSPACE-B 1 (C6) | foundry-forge-B 1 (C7) | Step-record / shell stages | Other picture stages |
| --- | --- | --- | --- | --- | --- | --- |
| **FSC-B 2a** offline animatic probe | one new probe | none (new file name in `tests/golden-path/`) | none | none | none | none |
| **MUSIC-B honest meter** | `lib/sound/editPlan.ts`, `app/playground/labModel.ts` (comments), one new probe | none | soft: WORKSPACE-B's score collector reads `listTakes`; no shared file | none | none | none |
| **video-clip-pipeline-A 1** | `pipeline/video/*`, `pipeline/build-preset-clips.mts` | none | none | none | none | none |
| **frames-phase-A 2** | `frames/picture/migrate.ts`, `frames/useFrames.ts`, `score/picture.ts`, `score/ScoreSpotting.tsx`, `cut/deriveTimeline.ts`, `cut/useCut.ts`, new probe, census | none (stays out of `stepStore.ts` and `lib/turns`) | **Soft but real.** `frames/outputs.ts` reads v2 `units`, and after this stage a trailer's units are 7 shots with `empty` plates. WORKSPACE-B case 1 must count only `ready` plates and treat `kind: "shot"` explicitly. Tell its builder. Census serial. | none | **Hard: phase-shared-A writers** (`useCut.ts`) lands first. **Hard: script-phase-A s2c** writes `useFrames.ts:282` and `picture/migrate.ts:31` (`critic-2026-10-07-script-chain.md:489-496`), so they are serial, either order. **Hard: phase-shared-A lineage** writes `useFrames.ts`, so it runs after this stage. | FSC-B 2b and take-fit (`useCut.ts`, `deriveTimeline.ts`) come after |
| **FSC-B 2b** export control | `cut/useCut.ts` (one field), new `cut/useCutExport.ts`, `cut/parts/FinishLine.tsx`, new probe, census | none | none (census only) | none | **Hard: phase-shared-A writers** (`useCut.ts`) first | serial with frames-phase-A 2 and take-fit on `useCut.ts` |
| **take-fit** | `cut/useCut.ts`, `cut/deriveTimeline.ts`, `cut/finishLine.ts`, `score/useCueTakes.ts`, new probe, census | none | soft: WORKSPACE-B's missing-row codes come from the verdicts, not `finishLine`; no shared file | none | phase-shared-A writers first (`useCut.ts`) | after frames-phase-A 2; serial with FSC-B 2b (`finishLine.ts` and `FinishLine.tsx` are different files, but `useCut.ts` is shared) |
| **frames-phase-A 3** (held, P1) | `ShotSheet.tsx`, `shotPrompt.ts`, `FramesAssembly.tsx`, `useFrames.ts` | none | soft: shot plates become Outputs | none | **after phase-shared-A lineage** (`useFrames.ts`, and the money reason) | after frames-phase-A 2 |
| **video-clip-pipeline-B 2** (held, V2) | depends on V2 | `lib/jobs.tsx` if it rides the job tray, as the ads clip does (`useAdsMotion.ts:126-160`): **after 4b merges** | Motion has no collector yet; none | none | WORKSPACE-A: Motion has no verdict module (`critic-2026-10-07-step-record-shell.md:261`) | stage 4 needs frames-phase-A 2 |

**Must not run in parallel:**
- frames-phase-A 2 with script-phase-A s2c;
- frames-phase-A 2 with phase-shared-A lineage;
- any two of frames-phase-A 2, FSC-B 2b and take-fit;
- any of those three with phase-shared-A writers.

Everything else above can run side by side, and only the `census.json` merges queue.

### Operator decisions

#### The seven in `README.md:132-142`

| Decision | Touched by this chain? |
| --- | --- |
| `research-run-engine-B` web tools | No |
| `AUP-B` lock-instead-of-wipe | No (declined, `README.md:242`) |
| `SLP-B` dev-only `?scenario=` door | No. Every case above seeds through `saveStep`/`saveRecord` on fake-indexeddb, or through `createTake` into a temp store. No route writes step records. |
| `AUP-A` creator data on a server | No. The sound store and the exports directory are local disk, as today. |
| `UI-SHELL-A` stage 3 | No |
| **`video-clip-pipeline-B`: Motion as a phase** | **Yes, already decided** (`a9d5975`, reversing `80ac10c`). What it does not decide is which engine renders a standard clip, and that is V2 below. |
| `library-styles-atelier-A` `LOCK_PROBLEMS` | No |

#### New asks found by this pass (asks, not decisions)

- **P1 · Trailer shot plates (frames-phase-A stage 3), and when.** This is new spend through
  `planRender`, and ShotSheet becomes a ledger (the card's direction call).
  - (a) Approve stage 3, sequenced **after** phase-shared-A lineage, so a render switch keeps the
    paid shot plates. This is recommended.
  - (b) Approve it now, in the step-record pass's order. A render switch then discards shot plates
    the way it discards explainer plates today.
  - (c) Hold. Trailers reach Score and Cut as gaps (stage 2), and ShotSheet stays read-only.
- **P3 · Drawn layers in the animatic.**
  - (a) Plates only, declared (`drawn: "plates"`), as shipped. This needs no browser.
  - (b) Rasterise each unit through the page bundle in headless Chromium, as the music video does.
    The export then matches the monitor, at the cost of a browser launch and a Chromium dependency
    in the node lane.
  - (c) Plates only, until frames-phase-B's per-layer provenance lands, then (b).
- **V1 · The two shipped preset clips below the palette floor** (signal-ledger 0.18, chalk-argument
  0.42; `pipeline/video/README.md:296-297`).
  - (a) Waive both, with the operator's reason recorded in the manifest.
  - (b) Re-render seeds on the GPU box (no paid call) and adopt passing takes.
  - (c) Drop them from `public/clips/manifest.json`.
- **V2 · Which engine renders a standard Motion clip** (video-clip-pipeline-B stage 2).
  - (a) The card's local GPU runner. It is unpaid, keeps the compose route for designed graphics,
    and runs only where a GPU is.
  - (b) The existing Leonardo i2v queue (`710240a`). It is paid per clip, works on any posture with
    a key, has no `clip_check` and no compose route, and its price is unpriced (`null`).
  - (c) One queue with both adapters behind `setVideoAdapterForTests`'s seam, local first.
  - (d) Hold Motion at direction-only.
- **M1 · What a section edit books.**
  - (a) The full requested length, as today. It errs high, and the honest-meter stage pins it.
  - (b) The regenerated seconds only. Before that change ships, the operator renders one live
    section edit and reads the credit delta (a paid call, the operator's own).
  - (c) Hold until `lib/music/pricing.ts` declares a credit rate.

### Ordered recommendation

**No step 0 is needed.** The base is green on every gate this work meets
([Gate state](#gate-state-of-the-base)).

1. **FSC-B 2a, the offline animatic probe.** It closes the measure's last clause, it is tests only,
   and it collides with nothing.
2. **MUSIC-B, the honest meter**, beside 1. It removes two comments that misstate a money path. It
   is disjoint.
3. **phase-shared-A writers + ratchet** (the step-record pass's item 1). This is the prerequisite
   for everything on `useCut.ts`.
4. **frames-phase-A stage 2**, after 3, and serial with script-phase-A s2c. It is the one stage that
   lets a trailer reach Score and Cut.
5. **FSC-B 2b, the Finish-line control**, then **take-fit**, both after 4 and serial with each
   other. With these, frames-score-cut-B's button and frames-score-cut-A's row are closed.
6. **video-clip-pipeline-A stage 1**, in any free slot. Its `check:clips` rule waits for V1.
7. **phase-shared-A lineage**, after 4 and script-phase-A s2c.
8. **frames-phase-A stage 3**, after 7 and per P1. **Stage 4** (unit-keyed direction) comes after
   AIO-A 4b, because it touches `lib/turns/assemble/frames.ts`.
9. **video-clip-pipeline-B stage 2**, per V2. Its stage 4 needs 4 and a `clip` picture kind.
10. **Drawn layers**, per P3.

**Two to run in parallel next: FSC-B 2a and the MUSIC-B honest meter.**
- Their write sets are a new probe each, plus two comment-only source edits.
- Neither touches a file of AIO-A 4b, WORKSPACE-B 1, foundry-forge-B 1, or any step-record or shell
  stage.
- Neither changes `census.json`.
- Both shapes are decided.
- The first produces the measure's offline MP4. The second makes a money path say what it does.

If a third slot exists, video-clip-pipeline-A stage 1 is disjoint from both. It touches only
`pipeline/video/` and `pipeline/build-preset-clips.mts`.

### Citation check

Every `path:line` in this document was checked by script against `5c51f6c`. The script:
1. extracts each backticked `path:line[-line]` and each comma-continued `:N`;
2. resolves the path from the repo root, or under `app/_phases/` and the other prefixes this
   document abbreviates;
3. asserts that the file exists and has at least that many lines.

The result is in the commit message. Citations into `.vault/` are excluded, because it is
gitignored and absent from this worktree. That exclusion is stated in the anchor tables.

---

## Proposed catalogue edits (for the README owner; not applied here)

| ID | Proposed status |
| --- | --- |
| `frames-phase-A` | `partial eff57ca - stage 1 (units, v2 record); trailer shot units are derived but never saved (useFrames.ts:407); next: stage 2 shot units persist + Score/Cut read units (after phase-shared-A writers; serial with script-phase-A s2c); stage 3 shot plates after phase-shared-A lineage (P1)` |
| `frames-score-cut-B` | `partial 38bfc82 - CutDocument + kernel + /api/cut/export (plates only, no Chromium); next: 2a offline render probe (cut-export-render), 2b Finish-line control after phase-shared-A writers; drawn layers P3` |
| `frames-score-cut-A` | `merged into MUSIC-B 6997be6 (Cut resolution); next: take-fit row + active take measured on bind, after frames-phase-A stage 2; case 6 (bindableTakes) declined - MUSIC-B runner-up auto-spot` |
| `MUSIC-B` | `landed 6997be6 - takes in the sound store, Score adopts/revises, Cut resolves; section edits book the full length (elevenlabs.ts:436), comments claim otherwise; next: honest-meter stage; the rate is M1` |
| `video-clip-pipeline-A` | `open - next: stage 1 ledger.py + stdlib selftest + takes/regrade + build refusal; check:clips rule after V1 (two shipped palette failures)` |
| `video-clip-pipeline-B` | `partial a9d5975 - stage 1, Motion restored as step 6 (operator decision, reverses 80ac10c); stage 2 held for V2 (local runner vs the ads Leonardo queue 710240a); stage 4 after frames-phase-A stage 2` |

Also:
- **`README.md:59-60`** can say that frames-phase-A stage 1 and frames-score-cut-B's kernel have
  landed. The chain's next link is frames-phase-A stage 2, not the animatic.
- **`README.md:140`** stays as it is: the Motion phase is decided. V2 is a new ask under it.
- **Three write-set corrections:**
  - frames-phase-A stage 2: add `picture/migrate.ts` (shot units survive a v1 write) and
    `ScoreSpotting.tsx` (the raw reader is there, not in `useSpots.ts`).
  - frames-score-cut-B: the export is plates through the ffmpeg `concat` filter, not Chromium plus
    the concat demuxer. Its case 5 is a node-lane probe, not a `test:live` case.
  - video-clip-pipeline-B: `LayerPanel.tsx:91-100` "no video provider in this app" is false since
    `710240a`.
- **Two stale comments, for whoever next owns those files:**
  - `app/_phases/_shared/stepStore.ts:199-207`, which says `ScoreStepData` has no take field (the
    pointers are on `ScoreSpot`). 4b owns the file today.
  - `tests/golden-path/posture-coherence.probe.spec.ts:8`, which says `cut/export` answers 403; it
    answers 503.
- **The step-record pass's item 10** (`critic-2026-10-07-step-record-shell.md:1128`): lineage
  should run *before* frames-phase-A's shot plates, not after them (P1).
