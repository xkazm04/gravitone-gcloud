# Critic pass · 2026-10-07 · milestone 1's three open tails

**Status: READ-ONLY REVIEW.** This is the fifth critic pass of the day over the
[moonshot backlog](README.md). The earlier four are [critic-2026-10-07.md](critic-2026-10-07.md),
[critic-2026-10-07-script-chain.md](critic-2026-10-07-script-chain.md),
[critic-2026-10-07-step-record-shell.md](critic-2026-10-07-step-record-shell.md) and
[critic-2026-10-07-picture-chain.md](critic-2026-10-07-picture-chain.md). This pass covers the three
milestone-1 clusters whose remaining work has no spec:
- **C6:** WORKSPACE-B after stage 1 (`31a211d`);
- **C7:** the PresetRail Foundry lane, from library-view-B, which merged into foundry-forge-B;
- **C2:** AIO-A's open tail: poster and export onto turns, the cross-device bell, and the hosted ledger.

**The base.** I opened every anchor below at **`101a0ed`**, which is local `main` and this
worktree's base.

The IMG-A 3a resume was in flight beside this pass. Its write set:
- `lib/spend/`;
- `lib/imaging/{budget,budgetForecast,router}.ts` and `lib/imaging/video/{budget,clips}.ts`;
- `lib/music/{budget,elevenlabs}.ts` and `lib/text/{spend,router}.ts`;
- `app/api/imaging/budget/route.ts`, `playwright.config.ts`, and the spend and meter probes.

It **had not merged** when I finished: `git log -1 main` was still `101a0ed`. I did not review it.
Every anchor here that sits in one of its files is marked *moves with IMG-A 3a*.

Nothing here changes a card, the README or any code. The status edits it proposes are listed at the
end, for whoever owns the README.

**Method.** The same as the earlier passes. Each premise anchor gets one of three verdicts:
- `true`: it holds, at that line or within a few;
- `moved`: it holds, at the new `path:line` given;
- `false`: it no longer holds; the evidence and the sha that changed it are given.

Every anchor below was opened with `sed -n` or `grep -n` at `101a0ed` before I wrote it down.

Besides the gates, I ran:
- the four offline probes the measures name (results under [Gate state](#gate-state-of-the-base));
- `npm run verify`, for C2's measure.

No app, dev server, engine, GPU job or paid call ran. The research probes drive the CIP-A stand-in
`claude`, and their `cost=$0.2000` log lines are the cassette's numbers, not a bill.

---

## Verdicts at a glance

| Tail | Sub-item | Verdict | Why, in one line | Shape |
| --- | --- | --- | --- | --- |
| C6 WORKSPACE-B | **keep-on-shelf** | **Build next** | Decided (copy the bytes); nothing in the code makes a copy unsafe, and a deleted project makes a copy *necessary* | Decided |
| C6 | demo plane | **Decline** | It can only draw the fixture `Asset` shape, which stage-1 case 9 forbids; a populated demo is SLP-B's (operator-only) | — |
| C6 | Motion outputs | **Move to a later milestone**, after V2 | A standard Motion clip is never rendered (`video-clip-pipeline-B` stage 2 is held for V2) | V2 |
| C6 | script outputs | **Move**; build after script-phase-A s2a | The script's artifact is the draft record s2a introduces | Decided once s2a lands |
| C6 | ads outputs | **Move**; build after WORKSPACE-A answers S1d (ads) | Ads have no verdict path, so a missing row has no code to reuse | Needs S1d |
| C6 | cut-derived stamp | **Move**; build after WORKSPACE-A 2a | The stamp is honest only if it knows when Research deals the replay, and 2a makes that React-free | Decided |
| C6 | point (e), a dangling `activeTakeId` | **Hold for the App Master** (T4) | The verdict is pure over records and cannot see the sound store; Outputs and the Cut can | T4 |
| C7 foundry-forge-B | **PresetRail Foundry lane** | **Decline** (T6) | After decisions (a)-(f) it adds only a second door to the same POST; it would show four styles a hosted Library can never adopt | — |
| C7 | the measure's "Library lists it" | **Merge into queued delivery 1** (text-lane seeding) | One `listThemes` assertion, in the probe file delivery 1 already writes | Decided |
| C7 | palette editor (critic ask 8) | **Hold for the operator; out of milestone 1** | Unchanged; the measure does not need it | Operator |
| C2 AIO-A | **poster onto turns** | **Hold for T1; move to a later milestone.** The seam is designed below. | It does not fit `dispatch`; it needs a *work kind*. The money ask is real but small: today the paid image is generated anyway and then thrown away. | Seam decided; T1 open |
| C2 | export onto turns | **Decline** (T3) | It spends nothing, its file already lands durably with its `projectId`, and `GET /api/publish/exports` already lists it | — |
| C2 | cross-device bell | **Hold for the operator (AUP-A, `README.md:140`); out of milestone 1** | Projects are per-device IndexedDB; a second device does not know the project id | Operator (one of the seven) |
| C2 | hosted ledger and lease | **Hold for the operator ("hosted later"); out of milestone 1** | Same call as IMG-A's hosted store (critic ask 1) | Operator |

**The three measures, in one line each.**
- **C2:** the README clause and the probe are met on `main`. `npm run verify` is unconfirmed: here
  only `build` failed, on the worktree's junctioned `node_modules`.
- **C6:** met on `main` at the read seam. The README must still say WORKSPACE-B landed.
- **C7:** met in substance. It is one `listThemes` assertion short, and that assertion belongs in
  queued delivery 1.

See [The measures](#the-measures).

---

## Gate state of the base

I ran the gates the brief names on the untouched base (`101a0ed`, this worktree). **All pass.**

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint:ratchet` | exit 0: "1036 files, 0 errors, 12 warnings, all 3 bucket(s) at baseline (measured 2026-09-05)" |
| `npm test` | exit 0: 1751 passed, 1 skipped (5.3 min) |
| `npm run verify` | exit 1. 16 gates pass; `build` fails on this worktree's junctioned `node_modules` (see [C2](#c2)) |

The measure probes, run on their own:
- `npx playwright test tests/golden-path/{turn-research-live,turn-research,project-outputs,foundry-adopt}.probe.spec.ts`
- Result: **37 passed, 0 failed, 0 skipped** (33 s):

| Probe | Passed |
| --- | --- |
| `turn-research-live` | 8 |
| `turn-research` | 9 |
| `project-outputs` | 10 |
| `foundry-adopt` | 10 |

**`census.json` keeps every merge below serial.** That applies to every stage that adds or
re-imports a `.ts`/`.tsx` file under `app/` or `components/`
(`critic-2026-10-07-step-record-shell.md:80-83`).

---

## Part 1 · C6: WORKSPACE-B after stage 1

### What stage 1 put on main

- **The collectors.**
  - `app/_phases/frames/outputs.ts` and `app/_phases/score/outputs.ts` are pure projections.
  - The reads live in `app/_library/projectOutputs.ts:75-104` (decision (a), `01-studio-hub.md:398`).
  - `Output` is at `app/_library/projectOutputs.ts:32`. Its `state` is the artifact's
    (`:29`): `in-cut | alternative | unresolved | missing`.
  - `readOutputs` is at `:106`.
- **The hook** answers only the read that belongs to its project
  (`app/_library/useProjectOutputs.ts:26`).
- **The shelf.**
  - `LibraryShelves` takes `projectId` (`app/_library/LibraryShelves.tsx:39-40`).
  - `OutputCard` (`:153`) draws `Provenance` (`:169`).
- **The fixture is gone from both surfaces**, held by `tests/golden-path/project-outputs.probe.spec.ts:308`
  (case 9).
- **The tally's cost is measured, never asserted** (`project-outputs.probe.spec.ts:318`).

### C6 tail: premise

| # | Anchor | Verdict | Evidence at `101a0ed` |
| --- | --- | --- | --- |
| 1 | The open list (`README.md:194`) | **true** | Demo plane; Motion, script and ads outputs; keep-on-shelf; the cut-derived stamp |
| 2 | Point (e): a dangling `activeTakeId` makes Outputs and the verdict disagree (`01-studio-hub.md:402`) | **true** | `scoreOutputs` gives `take-missing` when the active take is not in the store (`app/_phases/score/outputs.ts:21-39`). The verdict flags only `!s.activeTakeId` (`app/_phases/score/verdict.ts:16-20`). |
| 3 | Decision (b): the demo plane is open and unscheduled (`01-studio-hub.md:399`) | **true** | Case 9 forbids the fixture import (`project-outputs.probe.spec.ts:308-315`) |
| 4 | The card's move: keep writes `src: plate:<projectId>/<frameId>` (`01-studio-hub.md:419`) | **false (decided away)** | The App Master's call on critic ask 10 is to copy the bytes. No `plate:` scheme exists in `lib/assets.ts`. |
| 5 | Ask 10: regenerating overwrites the plate in place (`useFrames.ts:434-447`) | **moved** | `generatePlate` at `app/_phases/frames/useFrames.ts:434`; the new plate is written over the unit at `:453-460` |
| 6 | Ask 10: the unit id changes with the adopted render (`unit.ts:98`) | **true** | `app/_phases/frames/picture/unit.ts:98` |
| 7 | Ask 10: `deleteProject` drops every step row (`lib/projects.ts:835-845`) | **true** | `lib/projects.ts:835-857`. It deletes `PROJECTS_STORE` and `STEPS_STORE` only; `ASSETS_STORE` and `UPLOADS_STORE` are untouched. |
| 8 | `upload:` rows own their bytes (`lib/assets.ts:290-340`) | **true** | The section opens at `lib/assets.ts:283`; the scheme is at `:297`, `assetFromUpload` at `:319` and `putUploads` (one transaction over both stores) at `:348-363` |
| 9 | Ads key images are upload rows (`lib/ads/types.ts:236-237`) | **moved** | `lib/ads/types.ts:236-238` (`imageTakes`, `adoptedImage`) |
| 10 | The stamp is unconditional (`critic-2026-10-07.md:374`, at `:337-339`) | **moved** | `app/studio/[projectId]/StudioView.tsx:340-344` |
| 11 | Motion has no verdict module | **true** | `STEP_MODULES` (`app/_phases/_shared/stepContract.ts:108`) lists research, script, frames, score and cut |
| 12 | Script outputs are C1 territory (`critic-2026-10-07.md:474-475`) | **moved** | C1 has landed (`README.md:41`). What a script output *is* now waits on script-phase-A s2a's draft record (`README.md:199`). |
| 13 | The stamp's fixture reads | **true** | `app/_phases/research/beats/beats.ts:18`, `app/_phases/script/trailer/useTrailerCut.ts:6`, and the seed project's Cut (`app/_phases/cut/deriveTimeline.ts:59`, `:174`) |

### Keep-on-shelf: is a copy safe?

The decision is to copy the plate's bytes into a `lib/assets` row, as `upload:` rows and the ads
key images already do. **I find no code reason against it, and one reason it is the only correct
option.**

- **Size.**
  - A plate is a data: URL or a public path (`app/_phases/frames/frames.ts:69-78`).
  - `useFrames` measures a full sixteen-frame cut at about 5 MB (`app/_phases/frames/useFrames.ts:12`),
    so a plate is roughly 300 KB as base64.
  - Stored as a `Blob` (`lib/assets.ts:306-309`), it is about a quarter smaller.
  - A keep is one human act on one plate, so the store grows by what a person chose. It never grows
    by a batch.
- **Quota.**
  - `putUploads` writes the asset row and its bytes in **one** transaction (`lib/assets.ts:348-363`),
    so a `QuotaExceededError` leaves neither row behind.
  - The step store already names that error class (`app/_phases/_shared/stepStore.ts:389`).
  - What is missing is surfacing it on the keep control. That is acceptance case 6 below.
- **A deleted project.** `deleteProject` never touches the asset or upload stores
  (`lib/projects.ts:835-857`). So a copy outlives its project, and a pointer would dangle. That is
  the strongest argument *for* the decision.
- **Sign-out.**
  - Identity eviction wipes uploads with everything else (`lib/identityEviction.ts:306`). A kept
    plate is no worse off than any upload.
  - The AUP-B archive carries the `uploads` section (`lib/studioArchive.ts:94`).
  - One wrinkle: an archive import re-mints ids (`lib/studioArchive.ts:157`). A plate kept again
    after an import makes a second row. That is acceptable, and it is stated here so nobody reads it
    as a bug.
- **Score takes are not part of this.** They already outlive their project:
  - the sound store is not touched by `deleteProject`;
  - the Library's audio shelf lists every take (`app/library/audio/useAudioShelf.ts:74`).

  So "keep" is for plates only.

### C6 next stage: keep-on-shelf (WORKSPACE-B stage 2)

One session, size S-M. **Build next.** It is disjoint from IMG-A 3a, from all three queued
deliveries, and from every next stage in the other four critics, apart from soft notes in the
[collisions table](#collisions).

**Write set.**
- `lib/assets.ts`, additive only. A new **pure** `assetFromKeptPlate(uid, kept)` returns
  `{asset, upload}`.
  - **Ids are content-addressed:** `as-kept-<d16>` and `up-kept-<d16>`, where `d16` is the first 16
    hex characters of the bytes' SHA-256. This is the same rule, and the same reason, as `promotedId`
    (`lib/assets.ts:168`, whose docstring above it explains it).
  - `path`: `["kept", <project title as a folder segment>]`.
  - `src`: `uploadPointer(uploadId)`.
  - `meta`: `{upload: true, uploadId, mime, bytes, kept: "plate", digest, projectId, outputId, renderId, model, costUsd}`.
    `outputId` is the `Output.id` (`frames:<unitId>[:<altId>]`). `renderId` is `provenance.run`.
- New `app/_library/keepPlate.ts`, the client IO:
  - `keepable(o: Output)`, pure: `kind === "image"`, a `src`, and `state !== "missing"`.
  - `plateBlob(src, fetchImpl = fetch)`: a data: URL is decoded in place; any other `src` is fetched
    once. A non-OK fetch throws the response's own status line.
  - `keepPlate(uid, projectId, o)`: reads the project title with `getProject`, digests the bytes
    (`crypto.subtle`), builds the pair, and calls `putUploads([pair])`.
  - `keptIndex(assets)`, pure: `Map<outputId, digest>` over rows with `meta.kept === "plate"`.
- `app/_library/LibraryShelves.tsx`:
  - a keep control on every `keepable` `OutputCard` (`:153`);
  - a kept mark when `keptIndex` holds this `outputId` with this plate's digest;
  - the store's own error message beside the card on failure;
  - `uid` comes from `useAuth()`, as `app/foundry/StylesShelf.tsx:255` does. `projectId` already
    arrives as a prop.
- New `tests/golden-path/keep-on-shelf.probe.spec.ts`.
- Regenerate `app/kit/census.json`.

**Acceptance (fake-indexeddb, node lane; each written red first).**
1. **One keep, one row, one blob.** Keeping a ready data: plate writes:
   - asset `as-kept-<d16>`, whose `src` is `upload:up-kept-<d16>` and whose path is
     `["kept", <slug>]`;
   - `meta` with `projectId`, `outputId`, `renderId`, `model`, `costUsd` and `digest`;
   - one upload row whose blob bytes equal the decoded base64.

   **Red today:** `assetFromKeptPlate` does not exist.
2. **Idempotent.** Two keeps of the same bytes (a double click, or the same plate from two projects)
   leave one asset row and one upload row.
3. **A copy, not a pointer.**
   - The project's frames record is rewritten with a different `src` on that unit (a regenerate),
     and then `deleteProject(p)` runs.
   - After that, `getUploadBlobs` still returns the original bytes, and `listAssets(uid)` still
     lists the row.
4. **Only plates.** `keepable` is false for:
   - `missing` rows;
   - `audio` outputs;
   - outputs without a `src`.

   A source check finds the keep control rendered only behind `keepable`.
5. **A public-path plate** is fetched exactly once (stub fetch). A 404 writes nothing, and the
   thrown message carries the status.
6. **A refused transaction writes nothing.**
   - `putUploads` is stubbed to reject with a `DOMException` named `QuotaExceededError`.
   - Neither row exists afterwards.
   - The caller receives the store's message verbatim. That is a real error, so it explains itself
     in full (the CLAUDE.md exemption).
7. **The kept mark follows the bytes.**
   - After a keep, `keptIndex` marks that output.
   - After a regenerate (new bytes, same unit id) the mark is gone, and a second keep makes a second
     row.
8. **No new prose.** `npm run check:narration` stays green, and the control's accessible name is a
   verb.

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/{keep-on-shelf,project-outputs,library-view-chrome,asset-drawer-dialog,studio-archive}.probe.spec.ts`
- `npm run check:narration`
- `npm run check:kit-census`
- `npm test`
- `node pipeline/cx-capture.mjs studio-outputs`, with `CX_PROJECT` set to a project that holds a
  ready plate, and the PNG opened by eye. If the machine has no such project, the capture is
  **skipped, and the result says so.** No plate is generated to make one: that would be a paid call.

**Must not touch.**
- `lib/useAssets.ts`: DATA-A stage 1 writes it (`critic-2026-10-07-step-record-shell.md:1001`).
- `app/_library/projectOutputs.ts` and `app/_phases/*/outputs.ts`: the read is unchanged.
- `lib/themes.ts`.
- `app/studio/[projectId]/StudioView.tsx`.

**Shape: decided.** The copy is the App Master's call. Content-addressed ids follow the precedent
at `lib/assets.ts:168`. The folder layout and the exact control are the builder's, within the
narration law: a control and a chip, never a sentence.

### The other C6 sub-items

- **The demo plane: decline.**
  - It would draw the fixture `Asset`, whose mock-only fields (`tone`, collection, preview) no record
    holds (`critic-2026-10-07.md:417-418`).
  - It would also re-import what case 9 forbids.
  - `LibraryShelves`' own header states the rule: a surface may not draw what the product cannot do
    (`app/_library/LibraryShelves.tsx:13-16`).
  - The seed project's Outputs is honestly empty, because no step record exists for it.
  - If a populated demo is wanted, the honest route is real step records for the seed project. That
    is SLP-B's scenario rung, which is operator-only (`README.md:139`).
  - **WORKSPACE-B can read `landed` without it.** The C6 measure asks for real outputs and no fixture
    import, and a demo plane runs against both.
- **Motion outputs: move to a later milestone, after V2.**
  - A standard Motion clip is never rendered: `ClipStatus` is only ever `not-started`
    (`app/_phases/frames/frames.ts:83-96`), and stage 2 is held for V2
    (`critic-2026-10-07-picture-chain.md:516-524`).
  - Ads clips do render, and they belong with ads outputs.
- **Script outputs: move; build after script-phase-A s2a.** A script output is the adopted draft
  render, and s2a is what makes the draft a record (`README.md:199`). Reading `RENDERS` before then
  would build the collector twice.
- **Ads outputs: move; build after WORKSPACE-A answers S1d.**
  - Ads key images are already `lib/assets` rows (`lib/ads/types.ts:236-238`), so they already reach
    `/library`.
  - Clips and renders have records, but ads have no verdict module. A missing row would then have no
    code to reuse, which breaks the rule that the two cannot disagree (`critic-2026-10-07.md:482-499`).
- **The cut-derived stamp: move; build after WORKSPACE-A 2a.** For a user project the stamp is true
  only while one of these is drawn:
  - the seed project's Cut (`deriveTimeline.ts:59`, `:174`);
  - a trailer's beat or budget fixtures (`beats.ts:18`, `useTrailerCut.ts:6`);
  - Research dealing the replay notebook.

  The last of these is knowable without React only once 2a moves `activeSourceOf` into
  `_shared/notebook/active.ts` (`critic-2026-10-07-step-record-shell.md:319`). Built earlier, the
  stamp would recompute what the verdict decides.
  - Side note: StudioView's own header (`StudioView.tsx:14-15`) still says every step renders Glass
    Harbor "whatever project is open". That is no longer true of Frames, Score or Cut, which read
    this project's records (`app/_phases/cut/deriveTimeline.ts:3-8`). It is a comment for whoever
    builds the stamp.
- **Point (e): hold for the App Master (T4).**
  - The verdict is pure over decoded records (`stepContract.ts:24-26`), and the sound store is not a
    record. So it *cannot* see a dangling id, while the Cut (`deriveTimeline.ts:244-250`, "take gone from the store") and
    Outputs can.
  - The smallest truthful fix is a distinct code in Outputs, so the two never claim the same code
    for different facts. If T4 picks that option, it rides in the keep-on-shelf stage as a ninth
    case: `score/outputs.ts` gains `take-gone`, and `project-outputs` case 4 changes one expected
    code.

---

## Part 2 · C7: the PresetRail Foundry lane

### What stage 1 put on main

- **The draft builder** is `lib/foundry/adopt.ts`:
  - one plate (`palettePlate`, `:53`);
  - recipe slots with palette sentences stripped (`:59-76`);
  - no palette, no theme.
- **The route** is `POST app/api/foundry/styles/[id]/adopt/route.ts`, behind `guardRequest` (`:36-37`).
  - Its recognizer is the imaging router's (`:14`, `:30-32`). That import's target moves with IMG-A
    3a; the route file does not.
- **The adopt action** is in `app/foundry/StylesShelf.tsx:313-321`, for proven styles only.
  - It calls `adoptStyle` (`app/foundry/foundryClient.ts:50-51`), then
    `putTheme(newTheme(… origin: "foundry" …))`, then `/library?style=` (`StylesShelf.tsx:260-271`).
- **The Library** opens that theme as the atelier's first selection (`app/library/LibraryView.tsx:56-61`).

### PresetRail lane: premise (library-view-B, `05-asset-management.md:473-479`)

| # | Anchor | Verdict | Evidence at `101a0ed` |
| --- | --- | --- | --- |
| 1 | `PresetRail` gains a "Foundry" lane (`05-asset-management.md:475`) | **true (unbuilt)** | `app/library/PresetRail.tsx:47` draws `PRESETS` only; no `app/library` file imports `app/foundry` or `lib/foundry` |
| 2 | Through a new `TurnClass` `"style-block-from-recipe"` (`05-asset-management.md:473`) | **false (decided away)** | Decision (a)-(f): no new turn class (`09-content-pipeline.md:166-172`); the `TurnClass` union has none (`lib/text/types.ts:179-189`) |
| 3 | The draft block is shown in SpecEditor for the human edit (`05-asset-management.md:476`) | **moved** | Adoption already makes a draft theme and opens it in the atelier (`StylesShelf.tsx:266-267`), where SpecEditor edits technique, subject and finish. The palette is not editable (`app/library/SpecEditor.tsx:50-54`), which is critic ask 8. |
| 4 | `replica`/`transfer` exemplars seeded as pending proofs (`05-asset-management.md:477`) | **false** | Proven styles have zero exemplars (`critic-2026-10-07.md:504-509`). Seeding is now the operator's text-lane rule, queued as delivery 1. |
| 5 | "Open in Library" from StylesShelf (`05-asset-management.md:488`) | **moved; delivered** | `StylesShelf.tsx:267` `router.push(/library?style=…)` |
| 6 | Untagged Foundry styles still show under a discipline filter (`05-asset-management.md:487`) | **moved** | `styleFits` is at `lib/themes.ts:141`; foundry-adopt case 5 holds it |
| 7 | Preset start (`LibraryAtelier.tsx:120-133`) | **moved** | `startFrom` is at `app/library/LibraryAtelier.tsx:121`; the rail mounts at `:196` |

**Two facts neither card records.**
1. **Adopting the same style twice makes two draft themes, and spends two recognize calls.**
   - `newTheme` mints a random id (`lib/themes.ts:148`).
   - `foundryStyleId` is written (`StylesShelf.tsx:266`) but read nowhere: a grep for `foundryStyleId`
     under `app/` and `lib/` finds only that write and the type (`lib/themes.ts:113`, `:130`, `:153`).
2. **A Foundry theme reaches a project only once it is locked.**
   - Projects are built on locked styles only (`lockedOnly`, `lib/themes.ts:251`; used at
     `app/_projects/ProjectDialog.tsx:81` and `app/_projects/wizard/CreateWizard.tsx:90`).
   - A lock needs an approved proof (`canLock`, `lib/themes.ts:241-243`).
   - So a freshly adopted draft is in the Library, but no project can pick it yet. The queued
     text-lane seeding is what gives it a proof to approve.

### What the lane adds beyond stage 1's adopt action

Under decisions (a)-(f), only the **entry point**. A creator in `/library` would see proven styles
beside the presets, without visiting `/foundry`. Everything else the card gave the lane is now
elsewhere or gone:
- the reasoning turn is declined;
- the human edit happens on the adopted draft;
- the exemplars do not exist;
- the handoff is built.

What the lane would have to solve first:
- **Re-adoption** (fact 1 above). A lane in the Library makes repeat adoption more likely, so it
  needs "open the draft already adopted from this style".
- **Posture.**
  - Kept plates exist only where the forge ran (decision (c), `09-content-pipeline.md:169`).
  - No capability says whether this server has them (`lib/capabilities.ts:48-122` declares none for
    the Foundry).
  - On a hosted Library the lane would show four styles whose adopt can only answer `paletteMissing`.
    The 2026-10-06 rule forbids that: a control is never visible and then refused
    (`README.md:114-115`).

**The C7 measure does not need the lane.** The measure promotes a proven style into the Library, and
StylesShelf's action already does that through the only door.

**Verdict: decline the lane (T6).**
- If the catalogue grows to the point where `/foundry`'s shelf is the wrong place to find a proven
  style, it comes back as a new card. That card would carry three things:
  - a server-answered "adoptable here" fact;
  - the re-adoption lookup, extracted into one `adoptIntoLibrary(uid, styleId)` that StylesShelf
    and the lane share;
  - a lane that calls the same POST.
- Neither part is needed for milestone 1. The re-adoption lookup writes `StylesShelf.tsx`, so it
  would be serial after queued delivery 1.

---

## Part 3 · C2: AIO-A's open tail

### C2 tail: premise

| # | Anchor | Verdict | Evidence at `101a0ed` |
| --- | --- | --- | --- |
| 1 | Poster goes to `/api/imaging/generate` (`critic-2026-10-07.md:115-116`; `useMusicVideoComposition.ts:22`, `:109`) | **true** | `app/_phases/frames/music-video/useMusicVideoComposition.ts:22`; the job claim at `:109`; `generateImage` at `:116` |
| 2 | Export goes to `/api/music-video/export` (`useMusicVideoExport.ts:118`) | **true** | `app/_phases/cut/music-video/useMusicVideoExport.ts:118`, a raw gated `fetch` with `accessHeader()` |
| 3 | "The runner can only call `reason()`" (`runner.ts:188`) | **false** (`8efb76b`) | `TurnSpec.dispatch` (`lib/turns/runner.ts:88-97`) lets a kind replace the single call. It must still go through the router, and `reason` is now at `:216`. |
| 4 | `settle` takes a `TextResult` (`:86`) | **moved** | `lib/turns/runner.ts:87`; `Dispatched.served: TextResult` at `:109` |
| 5 | The bell folds in only turns this browser watches (`lib/jobs.tsx:563`) | **moved** | `lib/jobs.tsx:575-577`, and the poll asks only about the projects it was given (`:632-634`) |
| 6 | Projects are per-device IndexedDB (`stepStore.ts:9`) | **true** | `app/_phases/_shared/stepStore.ts:9` |
| 7 | The slot lock is single-process (`runner.ts:30-32`) | **true** | `lib/turns/runner.ts:28-31` |
| 8 | The cloud text adapter does not abort in flight (`lib/text/types.ts:312-316`) | **true** | `lib/text/types.ts:312` "KNOWN GAP" |
| 9 | The card's stage 3 moves "the poster/export hooks" (`08-app-infrastructure.md:66-69`) | **true as written** | No poster or export kind exists. The registered kinds are recalibrate, frames and research (`app/api/turns/route.ts:42-44`), and `TURN_KINDS` matches them (`lib/jobs.tsx:510`). |

### What happens to a poster or an export today when the tab goes away

This is the fact the money question turns on, so it is stated precisely.
1. Both are client-driven jobs (`useMusicVideoComposition.ts:109`, `useMusicVideoExport.ts:101`).
   Leaving the step does not cancel them; the hook settles them whether or not it is mounted.
2. A **reload** rewrites every running localStorage job to `interrupted`, with "The prototype cannot
   reattach to it." (`lib/jobs.tsx:319-320`).
3. **The server does not stop.**
   - No route under `app/api/` reads `req.signal` (grep: none).
   - `/api/imaging/generate` awaits `generate()` with no signal (`app/api/imaging/generate/route.ts:25-41`).
   - The imaging layer's only abort is its own timeout controller (`lib/imaging/http.ts:53`, `:144`).
   - The export awaits `runExport` with no signal (`app/api/music-video/export/route.ts:115`).
4. **So after a reload:**
   - **The poster's paid image is generated, billed and thrown away.** Its only consumer was the
     closure that died (`useMusicVideoComposition.ts:116-145`).
   - **The export's file lands anyway**, with its `projectId` sidecar
     (`lib/musicVideoExport.ts:362`, through `landExport`, `lib/export/headless.ts:105-118`).
     It is listed by `GET /api/publish/exports` (`lib/publish/exports.ts:58`), while the bell says
     it was interrupted.

**So putting the poster on a turn adds no new spend.** The spend already happens after the creator
leaves. What a turn changes is that the answer is kept. This is the argument the App Master used to
extend the keep-running rule to research (`08-app-infrastructure.md:18`). It is still a paid image,
not a seat-billed text turn, so the extension is asked as T1, not assumed.

### Does a non-text kind fit the `dispatch` hook?

**No.** The hook's contract (`lib/turns/runner.ts:88-97`) says three things:
- it must go through the text router, `reason` or `retrieve`;
- it must pass `ctx.signal` on;
- it reports `served: TextResult`, whose `provenance` becomes the record's `receipt`
  (`:230`, `:242`). The receipt is typed `TextProvenance` (`lib/turns/ledger.ts:82`), and every
  served turn books one row on the *text* meter.

A poster is an imaging call:
- its receipt is the imaging `Provenance` (`lib/imaging/types.ts:155-185`);
- its spend books on the imaging meter;
- it has no `TurnClass` (`lib/text/types.ts:179-189`).

Wrapping it as a `TextResult` would forge a text receipt. An export spends nothing and has no
receipt at all. **A new seam is needed.**

**There are already two non-text durable runs in the repo, each with its own record:**
- the ads clip queue (`app/api/video/clips/route.ts:8-12`; `startClip` in
  `lib/imaging/video/clips.ts:139`, which moves with IMG-A 3a);
- the ads render (`app/api/ads/render/route.ts:12-16`; polled by `app/_phases/cut/ads/useAdRenders.ts:1-10`).

Both copied the shape of `/api/turns`, in their own words: 202, a record, a detached run under
`after()`, and polling. Neither went through `lib/turns`. A third copy for the poster would be a
fourth job record. The smallest seam goes into the kernel instead.

### The smallest seam: a *work kind* beside the text kind

This is a design for a later stage. It is **not** build-next (see T1 and the
[measures](#the-measures)).

**In `lib/turns/runner.ts`.** A second spec shape, chosen by a discriminant:

```ts
export interface WorkSpec<I = unknown, R = unknown> {
  kind: string;
  lane: "imaging" | "local";           // never "text": a text kind is a TurnSpec
  serialised: boolean;
  /** false when nothing below the kind can be aborted (the imaging router
   *  takes no signal). cancelTurn then answers `not-cancellable` and writes
   *  nothing — never `cancelled` over a vendor call still billing. */
  cancellable: boolean;
  /** Validate input; name what the record's digest covers (no prompt here). */
  prepare(input: unknown): Promise<{ input: I; digestOf: string; chars: number }>;
  work(ctx: { input: I; signal: AbortSignal }): Promise<{ result: R; receipt: WorkReceipt }>;
}
export type WorkReceipt =
  | { lane: "imaging"; provenance: import("../imaging/types").Provenance }
  | { lane: "local"; wallMs: number; detail?: Record<string, unknown> };
```

- `startTurn` and `run` take `TurnSpec | WorkSpec` and branch **once**: a work kind skips
  `reason` and `settle`, and writes `{status: "done", receipt, result}`.
- Everything else is shared, unchanged: the slot lock, `ifLive`, the boot sweep and the 202.
- `cancelTurn` (`:279`) answers `{ok: false, why: "not-cancellable"}` for a running work kind
  whose spec says so.

**In `lib/turns/ledger.ts`** (`TurnRecord` at `:59-86`), additive and still `v: 1`:
- `turn` widens from `TurnClass` to `TurnClass | "image-generate" | "local-render"`;
- `receipt` widens to `TextProvenance | WorkReceipt`;
- a new optional `uncancellable?: true`, so a watching tab can draw no Stop.

No client code reads a record's `turn` or `receipt` field. A grep for `.receipt` and `.turn` at
`101a0ed` finds only the kinds' own receipt blocks and `lib/jobs.tsx:1009`, which merges whole
records.

**The poster kind** would be a new `lib/turns/kinds/poster.ts`:
- `buildPrompt` moves server-side with its rights rule (`useMusicVideoComposition.ts:60-74`);
- `work` calls `generate()` (`lib/imaging/router.ts:504`, which moves with IMG-A 3a);
- `cancellable: false`;
- `result` is `{base64, mime, provider}`.

On the client, the poster lands the way research does (`app/_phases/research/run/live.ts:250-296`):
- the tab watches the turn;
- on `done` it writes the upload and patches `MUSIC_VIDEO_SOURCE`;
- it lands at most once per turn id, because the record mirrors the last turn taken, as
  `live.ts:131-132` does.

`TURN_KINDS` gains `poster-generate`. One cost is stated: the ledger never prunes (no prune path in
`lib/turns/ledger.ts`), so each poster leaves about 1-2 MB of base64 in `foundry-out/turns/`.

**Sequencing.**
- **After IMG-A 3a:** the kind's probe needs the new spend store's hold semantics around `generate()`.
- **After queued delivery 3** (`GET /api/spend`), so the poster's spend has a read.
- `lib/turns/` is otherwise free: AIO-A 4b has landed.

### Verdicts on the C2 sub-items

- **Poster onto turns: hold for T1, then build in a later milestone,** as the work-kind stage above.
  - Its shape is decided apart from T1.
  - The size is M: runner, ledger, one kind, the hook's landing, a probe, and census.
- **Export onto turns: decline (T3).**
  - It spends nothing.
  - Its file already lands durably, with its `projectId`, and is already listed by
    `GET /api/publish/exports`.
  - A turn would buy a Stop button and a truthful bell after a reload. The cheaper truth fix is for
    the Cut to read its own exports: `GET /api/publish/exports`, filtered by `projectId`.
  - That read belongs with frames-score-cut-B 2b's export control
    (`critic-2026-10-07-picture-chain.md:378-416`), which owns the Cut's Finish line. It is not a
    turn.
  - Recorded so the decline is not read as "done": after a reload the bell says `interrupted` while
    the file lands (`lib/jobs.tsx:319-320`).
- **Cross-device bell: hold for the operator.**
  - A second device has no IndexedDB copy of the project (`stepStore.ts:9`), so it cannot ask the
    ledger about a project it does not know.
  - It needs the vault: **AUP-A, one of the seven operator-only decisions** (`README.md:140`). The
    operator approved stage 1 only (`README.md:243`).
  - It is not in milestone 1.
- **Hosted ledger and lease: hold for the operator.**
  - This is the same hosted-state call as IMG-A's cross-process store (`critic-2026-10-07.md:998-1002`, ask 1).
  - The operator's answer is "local now, hosted later", so it is not in milestone 1.
  - The lease would replace `lib/turns/runner.ts:28-31`. The GCS adapter would sit behind
    `lib/turns/ledger.ts`'s `turnDir` (`:91-94`).

---

## The measures

### C2

> README: research-run-engine-A landed and text-engine-A merged into AIO-A; a probe drives
> /api/research through the CIP-A engine stand-in and the run survives a reload on the turn
> ledger; npm run verify exits 0.

1. **Main meets the README clause and the probe.** The `verify` clause is unconfirmed (below).
   - The README says `merged into AIO-A - landed 67beb3e (stage 4)` for research-run-engine-A
     (`README.md:195`) and `merged into AIO-A` for text-engine-A (`README.md:247`).
   - The probe is `tests/golden-path/turn-research-live.probe.spec.ts:271`, case 4: "a reload before
     the turn settles loses nothing - the remount watches, lands, and writes the notebook exactly
     once".
     - It drives `run/live.ts` over a real IndexedDB engine.
     - Its requests go through the real `reason()`, with the stand-in `claude` first on `PATH`
       (`:9-13`).
     - It passed here, with all 8 cases of that probe.
   - `npm run verify`: see the result recorded below.
2. **The minimum left:** none for the measure. AIO-A's own row still reads `partial`, because of
   the four items above, and none of them is a milestone-1 item. The proposed edit is at the end.

**`npm run verify` at `101a0ed`: exit 1 in this worktree, and the cause is the worktree.**
- 16 gates pass, including `probes` (1751 passed, 1 skipped).
- `build` fails, and `bundle` is therefore blocked.
- The build error is Turbopack refusing the worktree's `node_modules`, which is a junction into
  the main checkout: "Symlink [project]/node_modules is invalid, it points out of the filesystem
  root".

That is a property of how headless worktrees share `node_modules`, not of the tree at `101a0ed`.
This pass may not run commands in the main checkout, so **the clause is unconfirmed here, not
failed.** The App Master should take `verify`'s exit from a checkout with a real `node_modules`.
If that is red too, C2's measure is not met, whatever the README says.

### C6

> README: library-view-A landed and WORKSPACE-B landed or merged; a probe shows two projects'
> Outputs panels listing different items derived from their own step records, and Outputs no
> longer imports the Glass Harbor fixture.

1. **Main meets the probe half.**
   - `project-outputs.probe.spec.ts:214`, case 6: project A then B, none of A's outputs in B, each
     derived from its own frames record.
   - `:308`, case 9: neither StudioView nor LibraryShelves imports `app/_studio/assets`.
   - Both passed here.
   - The panel is the hook's read (`app/_library/LibraryShelves.tsx:40`), and the hook answers only
     its own project (`useProjectOutputs.ts:26`). So the read-level case is the panel's content.
   - The one thing no probe does is *photograph* two panels. `studio-outputs` has never been
     captured (`01-studio-hub.md:404`). The keep-on-shelf stage's gate captures it.
2. **The README half is not met.**
   - library-view-A reads `merged into WORKSPACE-B` (`README.md:223`). I read the measure's
     "library-view-A landed" as satisfied by that, as C7's measure allows "merged".
   - WORKSPACE-B reads `partial` (`README.md:194`).
3. **The minimum left:** the catalogue edit for WORKSPACE-B. Two ways to make it are offered as T5:
   - (a) mark it landed after keep-on-shelf, the card's own title feature;
   - (b) mark it landed now, with keep-on-shelf as a follow-on.

   Either way the residue moves (see the edits at the end).

### C7

> README: one of library-view-B / foundry-forge-B landed, the other merged or declined; a probe
> promotes a human-proven Foundry style and a project's Library lists it as a theme.

1. **Main meets it in substance.**
   - library-view-B is `merged into foundry-forge-B` (`README.md:224`).
   - `foundry-adopt.probe.spec.ts:95`, case 1, drafts the proven `cold-photoreal-cg`.
   - `:142-153`, case 5, stores that draft as a theme and reads it back with `getTheme`.
   - Both passed here.
2. **The literal gap.**
   - The Library lists themes through `listThemes(uid)` (`lib/themes.ts:354`), and no case asserts
     it.
   - The minimum is one line in case 5: `listThemes("uid-1")` contains the new id.
   - That file is in queued delivery 1's write set, so **the assertion belongs in delivery 1**, not
     in a parallel stage.
   - If "a project's Library" means *a project can be built on it*, the theme must be locked (fact 2
     in Part 2). That becomes probe-able only after delivery 1, because a seeded pending proof is
     what gets approved. That reading is ask T7.
3. **The minimum left:**
   - foundry-forge-B reads `landed` once delivery 1 lands;
   - the lane is declined (T6);
   - the palette editor stays an operator hold, outside the card.

### Cards that cannot read `landed` only because of non-milestone-1 items

| Card | Move to a later milestone | Decline | Stays an operator hold |
| --- | --- | --- | --- |
| `AIO-A` | poster onto turns (work-kind stage, after T1 and IMG-A 3a) | export onto turns (T3); its truth fix goes to FSC-B 2b | cross-device bell (AUP-A); hosted ledger and lease (hosted later) |
| `WORKSPACE-B` | Motion outputs (after V2); script outputs (after script-phase-A s2a); ads outputs (after S1d); the cut-derived stamp (after WORKSPACE-A 2a) | demo plane | point (e) is the App Master's (T4) |
| `foundry-forge-B` | none | PresetRail lane (T6) | palette editor (critic ask 8) |

---

## Collisions

The in-flight run is IMG-A 3a (write set in the header). The queued deliveries are:
1. text-lane seeding: `lib/foundry/adopt.ts`, `app/api/foundry/styles/[id]/adopt/route.ts`,
   `app/foundry/StylesShelf.tsx`, `tests/golden-path/foundry-adopt.probe.spec.ts`;
2. the MUSIC-B honest meter: `lib/sound/editPlan.ts`, `app/playground/labModel.ts`, and one new
   probe (`critic-2026-10-07-picture-chain.md:653-683`);
3. IMG-A's `GET /api/spend`.

The other critics' next stages are at:
- `critic-2026-10-07-step-record-shell.md:1108-1131`;
- `critic-2026-10-07-script-chain.md:730-750`;
- `critic-2026-10-07-picture-chain.md:833-864`.

DATA-A stage 1's write set is at `critic-2026-10-07-step-record-shell.md:477-490`.

| Stage here | Writes | IMG-A 3a (in flight) | Queued 1-3 | DATA-A 1 | Other critics' next stages | Other stages here |
| --- | --- | --- | --- | --- | --- | --- |
| **keep-on-shelf** (C6, build next) | `lib/assets.ts` (additive), new `app/_library/keepPlate.ts`, `app/_library/LibraryShelves.tsx`, new probe, census | none | none | **Soft.** DATA-A writes `lib/useAssets.ts` and a new `lib/schema.ts`; this stage touches neither. Tell DATA-A's builder that a kept plate's `meta.projectId` is a reference that deliberately does **not** cascade on `deleteProject` (case 3). | **Soft: UI-SHELL-A 1**'s ratchet 7 counts hand-wired `TALLY_TONE` (`critic-2026-10-07-step-record-shell.md:1003`). `LibraryShelves.tsx` already has three (`:88`, `:141`, `:168`), so the kept mark must be a signal part, not a fourth. **Soft: UCP-B** writes `pipeline/cx-capture.mjs`; this stage only runs it. Census serial with every `app/` stage. | T4 option (b), if chosen, rides in this stage |
| **delivery 1 + `listThemes` line** (C7 measure) | delivery 1's own files | **soft:** the adopt route's recognizer is `lib/imaging/router.ts`'s, so if 3a changes `recognize`'s booking, delivery 1's route probe reruns | it *is* delivery 1 | none (DATA-A 1 is serial with foundry-forge-B **stage 1**, which has landed; delivery 1 does not write `lib/themes.ts`) | **SIGNAL-A 1** writes four `app/foundry` files, but not `StylesShelf.tsx` | — |
| **poster work kind** (later; T1) | `lib/turns/{runner,ledger}.ts`, new `lib/turns/kinds/poster.ts`, `app/api/turns/route.ts` (one import), `useMusicVideoComposition.ts`, `lib/jobs.tsx` (`TURN_KINDS`), new probe, census | **Hard: after 3a** (`generate()`'s hold moves) | after 3 (`GET /api/spend`) | none | **script-phase-B stage 3** registers a compose kind in `app/api/turns/route.ts` and touches `lib/jobs.tsx` (`critic-2026-10-07-script-chain.md:747`). The two are **serial.** phase-shared-A writers convert "two music-video readers" (`critic-2026-10-07-step-record-shell.md:998`): serial on `useMusicVideoComposition.ts` if that is one of them. | — |
| **ads / script / Motion outputs, stamp** (later) | new `app/_phases/<step>/outputs.ts`, `projectOutputs.ts`, `StudioView.tsx` (stamp) | none | none | none | after script-phase-A s2a, WORKSPACE-A 2a or S1d, or V2, as listed above | each one writes `projectOutputs.ts`, so they are serial with each other |

**Must not run in parallel:**
- the poster work kind with IMG-A 3a, or with script-phase-B stage 3;
- any two of the later Outputs collectors (shared `projectOutputs.ts`).

Everything else can run side by side. **Keep-on-shelf runs beside all of it**; only the `census.json`
merge queues.

---

## Operator and App Master decisions

### The seven in `README.md:137-143`

| Decision | Touched here? |
| --- | --- |
| `research-run-engine-B` web tools | No |
| `AUP-B` lock-instead-of-wipe | No (declined, `README.md:244`). A kept plate is wiped on sign-out like every upload. |
| `SLP-B` dev-only `?scenario=` door | **Only as the honest alternative to the declined demo plane.** Nothing here proposes it. |
| **`AUP-A` creator data on a server** | **Yes: the cross-device bell depends on it.** It stays held. Nothing in this document builds toward it. |
| `UI-SHELL-A` stage 3 | No |
| `video-clip-pipeline-B` Motion as a phase | Decided (`a9d5975`). Motion outputs wait on V2, which is the picture-chain's ask, not this one. |
| `library-styles-atelier-A` `LOCK_PROBLEMS` | No. Locking a Foundry theme uses the existing `canLock`. |

### Asks found by this pass

These are asks, not decisions. Each has a recommended option, and each is in `result.json`.

- **T1 · Does the keep-running rule extend to the poster?** (money path)
  - (a) Yes, with `cancellable: false` declared on the kind. Today the image is generated and billed
    after a reload anyway, and then dropped (`lib/jobs.tsx:319-320`, no signal on the route). The
    turn keeps what was paid for. **Recommended.**
  - (b) No. The poster stays a tab-held job, and the poster tail is declined.
  - (c) Yes, but only after the imaging router takes an `AbortSignal`. That is a 3a-adjacent change
    to `lib/imaging/router.ts` and the providers, which would let Stop cancel a poster.
- **T2 · AIO-A's open tail and milestone 1.**
  - (a) AIO-A reads `landed 67beb3e` for milestone 1. The poster moves to a later milestone; the bell
    and hosted ledger stay operator holds; the export is declined. **Recommended.**
  - (b) AIO-A stays `partial` until the poster lands.
- **T3 · The music-video export.**
  - (a) Decline it as a turn. The Cut reads its own exports from `GET /api/publish/exports`, with FSC-B
    2b's control. **Recommended.**
  - (b) A `local` work kind with a real Stop: an `AbortSignal` through `runExport` and `killTree`.
  - (c) Copy the ads-render shape: its own record, a 202 and polling.
- **T4 · A dangling `activeTakeId` (WORKSPACE-B point (e)).**
  - (a) The score verdict receives the store listing as an input fact in WORKSPACE-A 2b. The verdict
    is then no longer a function of records alone.
  - (b) Outputs names the case `take-gone`, a code the verdict never claims, so they cannot disagree
    on a code. It rides in the keep-on-shelf stage. **Recommended now;** (a) remains open for 2b.
  - (c) Leave it as is, recorded.
- **T5 · When WORKSPACE-B reads `landed`.**
  - (a) After keep-on-shelf, the card's title feature, with the residue moved as above.
    **Recommended.**
  - (b) Now. Keep-on-shelf becomes a follow-on that does not gate the measure.
- **T6 · The PresetRail Foundry lane.**
  - (a) Decline. A new card if the catalogue outgrows `/foundry`. **Recommended.**
  - (b) A later milestone: the lane plus a server "adoptable here" fact plus the re-adoption lookup,
    after delivery 1.
  - (c) Build it in milestone 1.
- **T7 · What "a project's Library lists it" means for C7.**
  - (a) `listThemes` lists the adopted draft. That is one assertion in delivery 1. **Recommended.**
  - (b) A project can be built on it: adopt, approve a seeded proof, lock, and `lockedOnly`
    includes it. This is probe-able only after delivery 1.

---

## Ordered recommendation

**No step 0 is needed.** The base is green on every gate this work meets
([Gate state](#gate-state-of-the-base)).

1. **Keep-on-shelf (C6, WORKSPACE-B stage 2).** Build next. It is decided, and disjoint from IMG-A
   3a and the three queued deliveries. If T4 picks (b), it carries the `take-gone` case.
2. **Delivery 1 (text-lane seeding) carries the `listThemes` assertion.** No new stage; per T7.
3. **The catalogue edits below**, once 1 and delivery 1 land. With them, WORKSPACE-B,
   foundry-forge-B and AIO-A read `landed` for milestone 1, and C2, C6 and C7 close.
4. **Later milestones:**
   - the poster work kind, after T1, IMG-A 3a and delivery 3, serial with script-phase-B stage 3;
   - script outputs, after script-phase-A s2a;
   - the cut-derived stamp, after WORKSPACE-A 2a;
   - ads outputs, after S1d;
   - Motion outputs, after V2;
   - the Cut reading its own exports, with FSC-B 2b.
5. **Operator holds, unchanged:**
   - the cross-device bell (AUP-A);
   - the hosted ledger and lease (hosted later);
   - the palette editor (critic ask 8).

**One stage to run next: keep-on-shelf.** It is the only milestone-1 tail item that is both decided
and unbuilt. It can start beside IMG-A 3a today; only its `census.json` merge queues.

### Citation check

Every `path:line` in this document was checked by script against `101a0ed`. The script:
1. extracts each backticked `path:line[-line]` and each comma-continued `:N`;
2. resolves the path from the repo root, then under `docs/concepts/moonshots-2026-10-05/`, then by
   unique basename in `git ls-files`;
3. asserts that the file exists at `101a0ed` and has at least that many lines.

The result is in the commit message.

---

## Proposed catalogue edits (for the README owner; not applied here)

| ID | Proposed status |
| --- | --- |
| `WORKSPACE-B` | T5 (a): `landed <keep sha> - stage 1 (31a211d) + keep-on-shelf (bytes copied into lib/assets, content-addressed); moved: Motion outputs (after V2), script outputs (after script-phase-A s2a), ads outputs (after S1d), cut-derived stamp (after WORKSPACE-A 2a); declined: demo plane; point (e) per T4` |
| `library-view-A` | unchanged: `merged into WORKSPACE-B` |
| `foundry-forge-B` | after delivery 1: `landed <delivery 1 sha> - stage 1 (b2b6057) + text-lane proof seeding; declined: PresetRail Foundry lane (T6); held: palette editor (critic ask 8)` |
| `library-view-B` | `merged into foundry-forge-B; its PresetRail lane declined (critic-2026-10-07-m1-tails, T6)` |
| `AIO-A` | T2 (a): `landed 67beb3e - stages 1-4; moved: poster as a work kind (after T1, IMG-A 3a); declined: export onto turns (T3, the Cut reads GET /api/publish/exports with FSC-B 2b); held: cross-device bell (AUP-A), hosted ledger and lease (hosted later)` |

Also:
- **`README.md:42`, C2's row.** "Open tail: poster/export onto turns, cross-device bell, hosted
  ledger" becomes the AIO-A status above.
- **`README.md:46`, C6's row.** It still says library-view-A brings "keep-on-shelf (`plate:`
  pointer)". The decision is a byte copy; drop `plate:`.
- **`README.md:47`, C7's row.** "proof seeding and a palette editor wait on an operator call":
  seeding is decided and queued; the palette editor still waits.
- **Two stale comments, for whoever next owns those files:**
  - `app/studio/[projectId]/StudioView.tsx:14-15` says every step surface renders Glass Harbor
    "whatever project is open". Frames, Score and Cut now read this project's records.
  - `critic-2026-10-07.md:117`: "the runner can only call `reason()`" became false at `8efb76b`.
