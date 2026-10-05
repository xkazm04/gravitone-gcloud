# Moonshot cards · Studio Hub

_Part of [the 2026-10-05 moonshot backlog](README.md). Each card is one dispatchable session; start from its **First session dispatch**._

Contexts, in the assigned order: project-shelf, studio-data-layer, studio-logic-probes, studio-workspace.

Map note: `context-map.json` still lists `app/_projects/ProjectsMatrix.tsx` under project-shelf. That file is gone; the race sheet replaced it on 2026-10-05. The live shelf code is `app/_projects/{RaceSheet,shelf,useShelf,surface,synthetic,ShelfHeader}.tsx|ts`, and none of it is mapped. That is drift for the operator's gate, and these cards treat those files as the shelf.

---

## project-shelf

### SHELF-A · Project digest read model: the shelf can say what is inside a project

**Context:** project-shelf · **Slot:** A architecture
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 4/10 · **Gate:** architecture
**Registry:** software-engineering/data-access#read-models-and-projections · software-engineering/multi-project#portfolio-drill-hierarchy

**Summary.** The race sheet is built for hundreds of projects, but all it knows about each one is a five-cell progress enum. Adding a per-project digest (poster thumb, runtime against target, spend, counts, searchable text) that step writes keep current would let the shelf show and search what a project actually contains without opening a 5 MB step record.

**Premise (verified).**
- `app/projects/ProjectsView.tsx:10-16`: round 2 rebuilt the shelf "for scale: the shelf has to hold hundreds of projects". `app/_projects/synthetic.ts:1-10` proves it at `?seed=300`.
- `app/_projects/shelf.ts:188-197`: the lane's only button is `nextAction(p).verb`, which is computed from `progress` alone. It can say "Unblock Frames" but never what is blocking it, what the project looks like, or how far it is from its runtime.
- `app/_projects/shelf.ts:52-53`: free-text search covers title, logline, template and discipline only. Nothing a user wrote or made inside a project can be searched.
- `lib/projects.ts:712-717` and `lib/studioDb.ts:193-199`: step records hold base64 plates, about 5 MB for a composed cut. The code reads only keys, never records, just to count them. Reading content per lane is ruled out by the code's own measurement.
- `app/_phases/frames/frames.ts:68-77` and `app/_phases/frames/useFrames.ts:116-125`: the facts a digest needs already exist on records (`Plate.src/model/costUsd`, `FramesStepData.direction` spend). No surface aggregates them.

**The move.** Add a `digests` object store (`lib/studioDb.ts`, DB_VERSION 6, keyed by projectId, `by-uid` index) with an explicit contract in new `app/_projects/digest.ts`:

```ts
ProjectDigest {
  projectId, uid, v: 1,
  poster?: { thumb: string; from: string },   // thumb is a data: URL of 12 KB or less
  runtimeS: number | null,
  spend: { usd, unpriced },
  counts: Record<string, number>,
  text: string,
  at,
}
```

- Each step owns a pure `digest(data) -> Partial<ProjectDigest>` in its own directory (`app/_phases/{research,script,frames,score,cut}/digest.ts`), which keeps the per-step directory law.
- `stepStore.saveStep` merges the step's partial into the digest in the same transaction as the step write, so a digest can never describe a record that did not land.
- `useShelf` reads `listDigests(uid)` beside `listProjects`.
- The race-sheet lane draws the poster, a runtime `BandTrack` against `targetS`, and a spend `Tally`.
- `matchesText` also searches `digest.text`.
- Blocker reasons are deliberately NOT here. They come from WORKSPACE-A's verdicts. This card is the content projection.

**Why it is a moonshot / what it unlocks.** At 300 projects the shelf becomes a portfolio you can read: posters, how far each cut is over or under, what each one cost, and search over your own words. Every future per-project fact (render queue, publish state) gets one place to land instead of one more IndexedDB read per lane. The operator and every UAT character feel it on the first screen they see.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `saveStep(p, "frames", {3 ready plates, costUsd 0.12 each})`, then `getDigest(p)` returns `counts.platesReady === 3`, `spend.usd === 0.36`, and a `poster.from` that names the first ready frame.
2. A frames save that fails mid-transaction (injected `ConstraintError`) leaves the digest unchanged, because the two writes are atomic.
3. `deriveShelf(projects, {q: "tariff"})` matches a project whose research topic, not its title, contains "tariff".
4. `listDigests(uid)` on 300 synthetic digests reads no step record (spy on `STEPS_STORE` access is 0).
5. `deleteProject(id)` removes the digest in the same transaction, and `evictIdentity(uid)` removes all of that uid's digests.
6. `render-budget` probe: a lane with a poster stays inside the existing DOM bound.
7. A digest at `v: 1` read by a build expecting v2 is treated as absent and recomputed, never cast.

**Write set.** `lib/studioDb.ts`, `app/_phases/_shared/stepStore.ts`, `lib/projects.ts` (cascade), `lib/identityEviction.ts`, `app/_projects/shelf.ts`, `app/_projects/useShelf.ts`, `app/_projects/RaceSheet.tsx`. New: `app/_projects/digest.ts`, `app/_phases/{research,script,frames,score,cut}/digest.ts`, `tests/golden-path/project-digest.probe.spec.ts`.

**Risks & rollback.** A DB_VERSION bump relies on the stale-tab yield (`lib/studioDb.ts:84-121`), so the upgrade path should be exercised in the live lane. Thumbs computed in the browser need an OffscreenCanvas path, with no thumb in Node. Rollback: the store is additive. Stop writing it and the lanes fall back to today's render.

**First session dispatch.**
1. Read `app/_projects/shelf.ts`, `app/_projects/RaceSheet.tsx`, the `saveStep` section of `app/_phases/_shared/stepStore.ts` (lines 578-660), and `lib/studioDb.ts`.
2. Write `tests/golden-path/project-digest.probe.spec.ts` (cases 1-5) on fake-indexeddb first.
3. Build the store, the contract and the frames digest, then the other four steps.
4. Gate: `npm run typecheck && npm test`, then `npm run test:live` for the version bump.

_Runner-up:_ one draft machine (`app/_projects/draft.ts`) shared by ProjectDialog and CreateWizard, plus a single-transaction "mint style + create project" command. Today `CreateWizard.tsx:186-216` re-implements the dialog's cascade, and `:241-283` writes the theme and the project separately.

### SHELF-B · Own your work: export, import, duplicate, and a sign-out that does not destroy

**Context:** project-shelf · **Slot:** B experience
**Size:** L · **Effort:** 7/10 · **Impact:** 9/10 · **Risk:** 5/10 · **Gate:** direction
**Registry:** software-engineering/client-state#identity-scoped-eviction (corrects it: the technique assumes a server copy survives the wipe) · software-engineering/versioning-snapshots#snapshot-scope · software-engineering/import-normalization#import-validation

**Summary.** Every project lives only in this browser's IndexedDB, and one click on "Sign out" deletes all of it, with no confirmation and no export. Adding a versioned project bundle (export, import, duplicate) and putting it in front of the eviction would turn "your work survives a refresh" into "your work survives you".

**Premise (verified).**
- `lib/useAuth.tsx:206`: `signOut()` always runs `evictIdentity(uid, "signed-out")`. `lib/useAuth.tsx:140` and `lib/identityEviction.ts:196-203` also evict on any session end or revocation (`"session-ended"`).
- `lib/identityEviction.ts:5-13, 52-61`: the eviction wipes every project, step, theme, asset and upload for the uid. Over-wiping is justified as costing "a refetch", but there is nothing to refetch from.
- `lib/firebase.ts:9-13` dropped Firestore, and `lib/localMode.ts:22-24` says "it does not sync anything anywhere". IndexedDB is the only copy.
- `components/ui/UserMenu.tsx:135-139`: local mode hides sign-out because the eviction "would wipe the only copy of the shelf". In Google mode, `:150-153` is a bare `Sign out` button with no confirm. The code already knows the consequence and only guards one of the two modes.
- A grep for `exportProject|importProject|duplicateProject|navigator.storage.persist` across `app lib components` returns nothing. There is no export or duplicate, and the browser is never asked to keep the storage persistent.
- `lib/projects.ts:767-770`: a composed cut is about 5 MB of plates, so this is real work and money (`Plate.costUsd`, `frames.ts:73`).

**The move.**
- New `lib/bundle.ts` with a versioned `.gravitone.json` bundle `{manifest: {v: 1, exportedAt, counts}, project, steps[], theme (with proofs), uploads[] (base64)}`. Its closure is "everything a project owns" (if DATA-A lands, it is the same relation walk). It provides `exportProject`, `exportAll`, `importBundle`, which validates before any write and remaps ids on collision, and `duplicateProject`, which mints a new `p-` id, rewrites step `projectId`s and clears `signedOff`.
- Shelf: lane actions Duplicate and Export, a drop target on the shelf for import, and a `StaleBadge` "changed since export" with a count, driven by `lastExportAt` per uid.
- `UserMenu`: sign-out becomes a destructive confirm that states its consequence (exempt from the narration law) and offers "export, then sign out", with the export sequenced before `evictIdentity`.
- `navigator.storage.persist()` is requested on first create, and the result is shown as a chip.
- Account-switch eviction is unchanged. That is the security half and it stays.

**Why it is a moonshot / what it unlocks.** It closes the one path where the product destroys finished, paid-for work by design. It also unlocks duplicating a project ("trailer from the explainer"), moving between machines, sending a project to a collaborator, and backups. The same bundle becomes the payload a future server sync uploads, so this is the backend seam's first real contract.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. On fake-indexeddb, a project with 3 steps, a locked theme and 1 upload produces `exportProject` manifest counts `{steps: 3, themes: 1, uploads: 1}`, and the upload bytes round-trip byte-equal.
2. `importBundle(b, uidB)` makes `listProjects(uidB)` hold the project, and `readStep` returns deep-equal data for every phase. A colliding id is remapped and never overwrites.
3. A bundle with `manifest.v: 2`, or a missing `project`, is refused with a reason and writes nothing.
4. `duplicateProject(id)` creates a new id whose steps carry the new `projectId`, with `signedOff` empty. The original's record and steps are byte-identical before and after.
5. The sign-out flow with 2 user-made (non-`seed-`) projects changed since export needs a confirm (`data-testid="signout-confirm"`). Choosing "export, then sign out" calls `exportAll` before `evictIdentity` (asserted by call order).
6. The `?seed=N` synthetic rows (`synthetic.ts`) are excluded from export, and seeded demo rows are tagged as such in the manifest.
7. `storage.persist` is requested once per uid, and a refusal is recorded rather than retried every load.

**Write set.** `lib/useAuth.tsx`, `components/ui/UserMenu.tsx`, `app/projects/ProjectsView.tsx`, `app/_projects/RaceSheet.tsx`, `app/_projects/parts.tsx`. New: `lib/bundle.ts`, `tests/golden-path/project-bundle.probe.spec.ts`. Extend `tests/live/golden-path.live.spec.ts`: export, reset, import, hard reload.

**Risks & rollback.** Large bundles (many plates) stress memory, so stream per step and cap the size with a named refusal. Import is untrusted input, so validate shapes and never execute anything. Rollback: the bundle code is additive. The sign-out confirm can revert to the bare button in one hunk.

**First session dispatch.**
1. Read `lib/identityEviction.ts` (all), `lib/useAuth.tsx:120-210`, `components/ui/UserMenu.tsx`, and `lib/projects.ts:710-805`.
2. Write `tests/golden-path/project-bundle.probe.spec.ts` (cases 1-4) on fake-indexeddb.
3. Build `lib/bundle.ts` export and import first, then duplicate, then the sign-out confirm.
4. Gate: `npm run typecheck && npm test`, then `npm run test:live`.

_Runner-up:_ project archive instead of delete: a hidden, restorable state with a count on the shelf toolbar (entity-lifecycle#archive-restore-semantics), so "clear examples" and deletes become reversible.

_Checked:_ read in full: `app/projects/ProjectsView.tsx`, `app/_projects/shelf.ts` (exports and nextAction), `app/_projects/wizard/CreateWizard.tsx` (1-330), `app/_projects/ProjectDialog.tsx` (head and cascade), `app/_projects/synthetic.ts` (head), `app/_projects/RaceSheet.tsx` (header and nextAction uses), `lib/identityEviction.ts` (1-260), `lib/useAuth.tsx` (signOut), `components/ui/UserMenu.tsx` (menu). Hypotheses traced: shelf search fields; no export/persist anywhere (grep); eviction on session end; the wizard writes theme and project in two separate transactions.

---

## studio-data-layer

### DATA-A · One declared relation schema: cascades, blast radius, eviction and patches derived from it

**Context:** studio-data-layer · **Slot:** A architecture
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 6/10 · **Gate:** architecture
**Registry:** software-engineering/entity-lifecycle#cascade-design, #archive-restore-semantics, #blast-radius-computation · software-engineering/data-access#transactions-and-units-of-work

**Summary.** Five stores reference each other (project to steps, theme to proofs to promoted assets, asset to upload bytes, project to theme), but the relations are written only in prose. Every cascade, count and eviction is hand-assembled somewhere different, sometimes in a UI component and across several transactions. Declaring the graph once in `lib/schema.ts` lets the repository derive one-transaction deletes, blast-radius counts, eviction and patches from it.

**Premise (verified).**
- `app/library/LibraryAtelier.tsx:156-168, 181-189`: deleting a style is put together in a component. It counts dependents with its own read, then runs `removeFromTheme`, which loops `deleteAsset` one transaction at a time and swallows its error (`lib/useAssets.ts:399-415`), and then deletes the theme anyway. A failure halfway leaves orphans the code calls "the residual case" (`lib/assets.ts:259-262`).
- `lib/themes.ts:424-431`: `deleteTheme` removes the row only. Projects built on it silently fall to `miss: "deleted"` (`lib/themes.ts:300-309`), and Frames then renders in `PRESETS[0]` (`app/_phases/frames/useFrames.ts:141-143`). A locked style the user built three productions on can disappear from under them.
- `lib/board/sources/proof.ts:69-77` writes a verdict by `getTheme` then `putTheme`, two transactions. `lib/useThemes.ts:316-338` commits `{...current, proofs}` from React state. A Board tab and a Library tab overwrite each other's proofs. Themes have no `patchProject`-style in-transaction door.
- `lib/identityEviction.ts:63-66`: "every user-scoped store is listed here explicitly". It is a hand list that every new store must remember (SHELF-A's digests would be the next one).
- `lib/projects.ts:656-658`: `editProject` writes `description`, `theme` and `outputCount` onto the record through `unknown` casts. None of them is on `Project` or `ProjectDraft`.
- `app/_projects/wizard/CreateWizard.tsx:268-283`: the preset theme is minted (`putTheme`) and the project is created in separate writes. If the second fails, a locked theme is left behind.

**The move.**
- New `lib/schema.ts` declares each store with its owner key and edges: `steps.projectId -> projects (owned: cascade)`, `assets[meta.themeId] -> themes (owned: cascade)`, `uploads <- assets.src upload: (owned: cascade)`, `projects.themeId -> themes (refers: restrict-or-archive)`.
- New `lib/repo.ts` derives from it:
  - `blastRadius(kind, id)`, so confirm dialogs read one function;
  - `remove(kind, id)`, as one transaction across every store the graph reaches, returning exactly what it took;
  - `patch(store, id, mutate, guards)`, a generic in-transaction read-modify-write with `ratchetBlocker` as a theme guard;
  - `createProject({draft, style})`, which mints or reuses the theme and writes the project in one transaction.
- `evictIdentity` walks `schema` (owner `uid`, plus followed pointers) instead of its hand list.
- `projects.ts`, `themes.ts` and `assets.ts` keep their public functions as thin wrappers, so call sites do not churn.
- Decision to ratify: a locked theme that projects reference is archived (hidden from the wall, bytes kept), not deleted.

**Why it is a moonshot / what it unlocks.** Referential integrity becomes a property of the data layer instead of a habit of each surface. New stores (digests, bundles, a server mirror) get eviction, cascade and export closure for free. The style that projects are built on can no longer vanish. And SHELF-B's bundle closure is the same walk.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `blastRadius("theme", t)` with 2 promoted assets and 1 referencing project returns `{assets: 2, projects: 1}`, and `remove` reports the same numbers it acted on.
2. `remove("theme", t)` with an injected abort on the second asset delete leaves the theme and both assets present (all-or-nothing).
3. A locked theme referenced by a project is archived on `remove`, not deleted, and `projectStyle(themes, p.themeId)` still resolves.
4. Concurrent `patch("themes", t, addProof)` and `patch("themes", t, judge)` keep both changes.
5. A probe walks `openDb`'s upgrade stores. Every store must be declared in `schema`, and `evictIdentity` must empty every uid-owned store (no hand list).
6. `editProject(id, {description: "x"})` leaves no `description` key on the stored row.
7. `createProject({style: preset})` with an injected project-write failure leaves no new theme row.

**Write set.** New: `lib/schema.ts`, `lib/repo.ts`, `tests/golden-path/relation-schema.probe.spec.ts`. Edit: `lib/projects.ts`, `lib/themes.ts`, `lib/assets.ts`, `lib/useThemes.ts`, `lib/useAssets.ts`, `lib/identityEviction.ts`, `lib/board/sources/proof.ts`, `app/library/LibraryAtelier.tsx`, `app/_projects/wizard/CreateWizard.tsx`.

**Risks & rollback.** Eviction is security-critical: keep the existing `identity-eviction-idb` and `identity-and-writes` probes green and unmodified as the oracle. Wide transactions hold locks longer, but each write still opens per operation. Rollback: wrappers keep their signatures, so reverting `lib/repo.ts` restores the old paths.

**First session dispatch.**
1. Read `lib/studioDb.ts`, `lib/identityEviction.ts`, `lib/useAssets.ts:396-415`, `app/library/LibraryAtelier.tsx:150-190`, and `lib/board/sources/proof.ts`.
2. Write `relation-schema.probe.spec.ts` cases 1, 2, 4 and 5 on fake-indexeddb, all red.
3. Build `schema.ts` and `repo.remove/blastRadius/patch`, then switch eviction to the schema walk last.
4. Gate: `npm run typecheck && npm test`. The two identity probes must pass untouched.

_Runner-up:_ move theme proof bytes out of `Theme.proofs[].base64` into the uploads blob store (the `upload:` pointer doctrine). Every `listThemes` today drags every proof image through IndexedDB (`lib/useAssets.ts:130-136` admits it), and six surfaces call it.

### DATA-B · A change feed under every hook: one cache, live across components and tabs

**Context:** studio-data-layer · **Slot:** B-architecture (no UI surface)
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** architecture
**Registry:** software-engineering/client-state#invalidation-strategy, #observed-read-subscription · software-engineering/realtime-events#push-vs-refetch-reconciliation · software-engineering/client-fetch-cache#in-flight-dedup

**Summary.** Each `useProjects`, `useThemes` and `useAssets` instance keeps its own copy of the store, and nothing tells one copy that another component, another hook or another tab has written. Putting a write-emitted change feed (in-tab bus plus `BroadcastChannel`) under a shared keyed cache would make every read in the studio live and deduplicated.

**Premise (verified).**
- `lib/useProjects.ts:79-81`, `lib/useThemes.ts:244-246` and `lib/useAssets.ts:144-146`: every hook instance owns private `useState` and reloads only on mount or uid change.
- `app/studio/[projectId]/StudioView.tsx:180-198`: the rail's badges go stale while a step reports its own progress (`reportPhase`). The view's workaround is to re-read the project on the next rail click. The Stepper never sees a report from the step it is standing on.
- `getProject` is called independently 11 times across 8 files: `StudioView.tsx:128,197,236`, `CutTimeline.tsx:58`, `useCut.ts:96`, `FramesStep.tsx:55`, `useFrames.ts:212`, `ResearchStep.tsx:84`, `ScoreSpotting.tsx:370,459`, `ScriptStep.tsx:135`. Each opens its own connection with no shared result.
- `lib/studioDb.ts:96`: the only signal between connections is `onversionchange` (schema). There is no data-change signal, and a grep for `BroadcastChannel` returns nothing.
- `lib/projects.ts:551-553` concedes "Single-tab prototype". The precedent for a module-level subscribable store already exists: `app/_phases/_shared/stepStore.ts:311-337` (`onStorageTrouble` / `useStorageTrouble`) and `app/library/audio/bookStore.ts:89` (`useSyncExternalStore`).

**The move.**
- New `lib/studioStore.ts`:
  - after a transaction commits, every write in `lib/{projects,themes,assets}.ts` and `stepStore.saveStep` emits `{store, ids, op}`, carrying keys only and no payload bytes, to an in-tab emitter and to `BroadcastChannel("gravitone-studio")`;
  - a keyed snapshot cache (`list:<store>:<uid>`, `rec:<store>:<id>`) with in-flight deduplication;
  - `useList(store, uid)` and `useRecord(store, id)` built on `useSyncExternalStore`.
- Invalidation is by key, followed by a refetch. Payloads are never pushed, which keeps the 5 MB records out of the channel.
- `useProjects`, `useThemes` and `useAssets` become thin facades over the cache (unchanged return shapes). StudioView's manual re-reads are deleted.
- `evictIdentity` drops every cache entry for the uid and announces it, so the next account never sees a stale snapshot.

**Why it is a moonshot / what it unlocks.** The rail, the shelf and the bell agree with the database within one tick, in every tab, without re-reads. Two-tab work stops being a known hazard. A change feed is also exactly what a future server-sync adapter subscribes to and replays, so it is the precondition for any backend.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. Two `useList("projects", u)` subscribers mounted together make exactly one `getByIndex` call (spy).
2. `reportPhase(id, "frames", "blocked")` causes a `useRecord("projects", id)` subscriber to receive the new progress once. A no-op `patchProject` (mutate returns false) emits nothing.
3. A second module instance posting on `BroadcastChannel("gravitone-studio")` (Node has a global `BroadcastChannel`) invalidates tab A's `list:projects:u`, and the next read reflects the remote write.
4. A transaction rejected with `ConstraintError` emits no event.
5. `evictIdentity(u)` clears every `u` cache key, and subscribers read `null` or empty without a refetch under the old uid.
6. The event payload has no field longer than 256 characters (no base64 crosses the bus).

**Write set.** New: `lib/studioStore.ts`, `tests/golden-path/change-feed.probe.spec.ts`. Edit: `lib/projects.ts`, `lib/themes.ts`, `lib/assets.ts`, `lib/useProjects.ts`, `lib/useThemes.ts`, `lib/useAssets.ts`, `app/_phases/_shared/stepStore.ts`, `lib/identityEviction.ts`, `app/studio/[projectId]/StudioView.tsx`.

**Risks & rollback.** Refetch storms on bulk writes, mitigated by coalescing ids per microtask. React 19 double effects are absorbed by the cache's deduplication. Rollback: the facades keep their signatures, so reverting the store file restores per-hook state.

**First session dispatch.**
1. Read `app/_phases/_shared/stepStore.ts:305-345` (the subscription precedent) and `app/library/audio/bookStore.ts`, then the three `lib/use*.ts` hooks.
2. Write `change-feed.probe.spec.ts` cases 1-4 on fake-indexeddb with Node's `BroadcastChannel`.
3. Build emit-after-commit in `runTx` callers first, then the cache, then migrate `useProjects` and delete StudioView's re-reads.
4. Gate: `npm run typecheck && npm test`, then `npm run test:live` (hard-reload journey).

_Runner-up:_ a `Repository` port (an IndexedDB adapter now, a server adapter later), so the "one PATCH per function" migration promised at `lib/projects.ts:553` becomes a swap instead of a rewrite.

_Checked:_ read in full: `lib/studioDb.ts`, `lib/projects.ts`, `lib/useProjects.ts`, `lib/themes.ts`, `lib/useThemes.ts`, `lib/assets.ts`, `lib/useAssets.ts`, `lib/model.ts`. Sibling reads: `lib/board/sources/proof.ts`, `app/library/LibraryAtelier.tsx:125-190`, `lib/identityEviction.ts`. Hypotheses traced: no in-transaction theme patch; the cascade is composed in a component; there is no cross-tab channel (grep); the 11 independent `getProject` calls (grep).

---

## studio-logic-probes

### SLP-A · Mutation rung: every probe names the defect it guards, and a runner proves it goes red

**Context:** studio-logic-probes · **Slot:** A architecture
**Size:** M · **Effort:** 5/10 · **Impact:** 8/10 · **Risk:** 2/10 · **Gate:** none
**Registry:** software-engineering/test-harness#negative-control-tests · software-engineering/quality-gates#vacuous-by-evaluation

**Summary.** The lane's own headers record probes that were green while the defect was alive, and catching that has been a hand ritual every time. Adding a declared mutant registry plus a worktree runner turns "seed the defect and watch it go red" into a measured, ratcheted property of the whole suite.

**Premise (verified).**
- `tests/golden-path/_helpers.ts:116-121`: a probe was blinded by the comment stripper, "caught only by seeding the defect and watching it fail to go red".
- `tests/golden-path/chain-break-reaches-the-reviewer.probe.spec.ts:3-12`: a sibling probe's five cases all passed while `chainBreaks` was discarded one line later: "tested into a test".
- `tests/golden-path/sort-stability.probe.spec.ts:13-16` and `spine-rank-total.probe.spec.ts:13-18` each hand-write a "controlled counterfactual". Each probe re-invents its own negative control, or has none.
- `playwright.config.ts` (the `forbidOnly` note): one `.only` took `npm test` from 317 passed to "1 passed", exit 0. The lane has been vacuously green before.
- Measured by grep today: 101 probe files, 37 of which read source text (ratchets), 12 on fake-indexeddb. No file records which defect each probe kills.

**The move.**
- New `tests/mutants/registry.ts`: entries of the form `{id, probe, file, find, replace, why}`. Each `find` must occur exactly once in `file`.
- New `pipeline/probe-mutants.mts`:
  - creates one git worktree under `.claude/worktrees/mutants` (with a node_modules junction);
  - per mutant, writes the mutated file, runs `npx playwright test tests/golden-path/<probe>`, expects a non-zero exit, and restores the file;
  - writes `tests/mutants/ledger.json` with killed, survived and stale counts.
- New `tests/golden-path/mutant-registry.probe.spec.ts` (inside `npm test`, cheap) checks that every entry's `find` is still present exactly once, so a refactor that moves the code makes the mutant stale, not silently skipped. It also ratchets "probes with zero mutants", which may only fall, like the narration budget.
- Seed about 15 mutants from the counterfactuals the headers already describe:
  - drop the id tiebreaker (`app/_projects/shelf.ts:214`);
  - skip the upload delete (`lib/identityEviction.ts:335`);
  - remove `resetFollowUps(projectId)` (`app/_phases/research/ResearchStep.tsx:286`);
  - drop `chainBreaks` (`app/_phases/script/recalibrate.ts:398-399`).
- `npm run test:mutants` runs outside `verify` and is reported by scan-sweep.

**Why it is a moonshot / what it unlocks.** Every refactor can say which guarded defects stay guarded. Lane B workers and `/scan-sweep` get a mechanical "seed the control red" instead of prose. And a green `npm test` stops being able to mean "examined nothing".

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. Registry entry `shelf-no-tiebreak` (remove `|| a.id.localeCompare(b.id)`) makes the runner report `sort-stability.probe.spec.ts` as killed.
2. A deliberately toothless entry (mutating a comment) is reported as survived, and the runner exits non-zero.
3. An entry whose `find` no longer occurs, or occurs twice, makes `mutant-registry.probe.spec.ts` fail and name the entry.
4. The runner leaves the main worktree's `git status` byte-identical before and after (it touches only the mutant worktree).
5. The ledger records per-mutant duration, and the full run of 15 mutants completes in under 5 minutes on the dev box (measured and recorded, not asserted in CI).
6. The ratchet: adding a probe file without any registry entry raises the "unguarded probes" count, which the registry probe refuses above the committed budget.

**Write set.** New: `tests/mutants/registry.ts`, `tests/mutants/ledger.json`, `pipeline/probe-mutants.mts`, `tests/golden-path/mutant-registry.probe.spec.ts`. Edit: `package.json` (script `test:mutants`).

**Risks & rollback.** A worktree with junctioned node_modules on Windows: confirm that Playwright's transpiler resolves `@/` from the worktree. A stale worktree must be detected and recreated. Rollback: everything is additive, and the gate probe can be deleted alone.

**First session dispatch.**
1. Read `tests/golden-path/_helpers.ts`, `playwright.config.ts`, `sort-stability.probe.spec.ts` and `chain-break-reaches-the-reviewer.probe.spec.ts`.
2. Write `mutant-registry.probe.spec.ts` (cases 3 and 6) and one registry entry.
3. Build the runner and prove cases 1, 2 and 4 by hand, then seed the remaining entries.
4. Gate: `npm test` stays green, and `npm run test:mutants` reports 0 survivors.

_Runner-up:_ a derived coverage model. Join the probes' import graph to `context-map.json` contexts and fail when a context's seams have no importing probe. Today this context lists 12 probes of 101 and still names the deleted `ProjectsMatrix`.

### SLP-B · Scenario rung: product-written step scenarios so the live lane and cx-capture reach every state

**Context:** studio-logic-probes · **Slot:** B-architecture (no UI surface)
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 4/10 · **Gate:** policy-loosen
**Registry:** software-engineering/test-harness#live-app-harness, #constraint-injection-for-unreachable-tiers

**Summary.** The real browser and the screenshot tool can only see the states that the seeded Glass Harbor project derives on its own. A blocked Frames, a Cut with a take, or a music-video project cannot be put on screen without hand-driving paid renders. Adding named, dev-only scenarios that the product writes through its own `saveStep` would make every step-by-state combination reachable for `test:live` and `cx-capture`.

**Premise (verified).**
- `lib/harness/protocol.ts:95-116`: three commands only (`snapshot`, `project`, `reset`), "the door stays narrow".
- `tests/live/golden-path.live.spec.ts:29-33`: "The harness does not write fixtures into the database; it EMPTIES the account and lets the product seed itself". There is one representative journey per flow.
- `pipeline/cx-capture.mjs:31, 42-57`: every studio screen is `seed-glass-harbor`, and Score and Cut need a `via` walk because steps write downstream records. A screen in another state has no id.
- `app/_studio/projectSeed.ts:103-109`: the seed claims Frames is "blocked" ("every candidate ... came back refused"), but no frames record exists. Opening it cannot show that state, so it cannot be photographed.
- CLAUDE.md, "the gate, and the two things it cannot do": the Ghost alpha defect was caught only by photographing the screen. Unphotographable states are where that class of defect lives.
- Precedent for a dev-only data door compiled out of production: `app/projects/ProjectsView.tsx:39-43` (`?seed=N`) and `app/_projects/synthetic.ts:4-7`.

**The move.**
- New per-step `app/_phases/<step>/scenarios.ts`, each exporting named builders `(projectId) -> StepRecord` (for example `frames:refused`, `frames:review-unbound-figure`, `score:spotted`, `cut:with-offsets`, `music-video:poster-ready`).
- New `app/_studio/scenarios.ts` registers them under ids `<step>@<state>`.
- A dev-only `?scenario=<id>` on `/studio/<id>`. The branch is dead under `NODE_ENV === "production"`, as `seedOf` is. It applies the builders through `saveStep`, the product's own write path, stamped `v: SCHEMA_VERSION`, before the step mounts. The step then derives its own progress, so the harness still asserts the product's verdict and never a fixture's.
- `cx-capture.mjs` accepts `studio-frames@refused`-style ids.
- One live spec walks the scenario catalogue: hydrate, hard-reload persistence, no page error.
- A probe derives the catalogue's coverage (each step times each reachable non-empty state) and reports the gaps.

**Why it is a moonshot / what it unlocks.** Every blocked, review and empty state of every step can be photographed and reloaded in a real browser in seconds, with no vendor spend. UI work on failure states (the states users meet when things go wrong) stops being blind. The seed's unbacked "blocked" claim can be replaced by a real scenario.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `?scenario=frames@refused` in dev means that, after hydration, `control.project(id)` shows a frames record with a `refused` plate, and `snapshot()` reports `progress.frames === "blocked"`, as derived by the step.
2. The same URL in a production build writes nothing. A source probe asserts the branch is gated by `process.env.NODE_ENV`, like `seedOf`.
3. Every scenario builder's output passes the step's own reader (`readStep` returns it typed, with `v === 1`).
4. `node pipeline/cx-capture.mjs studio-frames@refused out.png` exits 0, and a missing scenario id exits non-zero, naming the catalogue.
5. The live spec runs each scenario: no `pageerror`, and the record is still present after a hard reload.
6. The coverage probe lists `(step, state)` pairs with no scenario. The count is committed as a budget that may only fall.

**Write set.** New: `app/_studio/scenarios.ts`, `app/_phases/{research,script,frames,score,cut}/scenarios.ts`, `tests/live/scenarios.live.spec.ts`, `tests/golden-path/scenario-coverage.probe.spec.ts`. Edit: `app/studio/[projectId]/StudioView.tsx` (apply before mount), `pipeline/cx-capture.mjs`, `app/_studio/projectSeed.ts` (drop or back the claim).

**Risks & rollback.** It loosens a stated harness doctrine. The mitigation is that the product, not the harness, writes the records, and only in dev. A scenario drifting from the real shape is caught by case 3. Rollback: remove the param branch, and the scenarios become inert data.

**First session dispatch.**
1. Read `tests/live/golden-path.live.spec.ts`, `lib/harness/protocol.ts`, `pipeline/cx-capture.mjs` and `app/projects/ProjectsView.tsx:39-70`.
2. Get the operator's ratification of the policy (gate: policy-loosen) before writing code.
3. Build `frames@refused` end to end first (cases 1-3), then extend `cx-capture`.
4. Gate: `npm test`, `npm run test:live`, and one PNG opened by eye.

_Runner-up:_ a two-tab live journey (two pages, one profile) that pins today's lost-update and stale-rail behaviour as negative controls for DATA-A and DATA-B.

_Checked:_ read in full: `tests/golden-path/_helpers.ts`, `tests/live/_control.ts`, `tests/live/_gallery.ts`, `playwright.config.ts`, `playwright.live.config.ts`. Read in part: the headers of all 11 probes in this context, `identity-eviction-idb.probe.spec.ts` (1-60), `tests/live/golden-path.live.spec.ts` (header and journeys), `lib/harness/protocol.ts`, `pipeline/cx-capture.mjs` (1-60). Hypotheses traced: probe counts by kind (grep); that the mutant targets exist at the cited lines.

---

## studio-workspace

### WORKSPACE-A · Step contracts: progress becomes a projection of step records, not a mounted report

**Context:** studio-workspace · **Slot:** A architecture
**Size:** XL · **Effort:** 8/10 · **Impact:** 9/10 · **Risk:** 6/10 · **Gate:** contract
**Registry:** media-generation/production-pipeline-phasing#worst-news-first-progress, #phase-order-and-graduation · software-engineering/client-state#status-fsms

Adopts and goes beyond the decked "human step sign-off and matrix status derivation". That card's `signOff` and `stateOf` reconciliation shipped (`lib/projects.ts:384-407`, `:675-708`). This one replaces the mechanism that feeds it.

**Summary.** A step's progress is written only by a React effect while the user has that step open. As a result, Cut and standard Score never report, so they can never be signed off and a real project can never reach "delivered". Cleared steps keep their old state, and the seed asserts states no record backs. The move is for every step to declare a pure `verdict(records)` in a step contract, and to recompute progress (with reasons) after every step write, whether or not the step is mounted.

**Premise (verified).**
- `app/_phases/_shared/usePhaseReport.ts:27-37` and `app/_phases/frames/useFrames.ts:744-753`: progress is written from effects inside mounted surfaces. `null` writes nothing, and `lib/projects.ts:609-633` makes `empty` unsayable, so a cleared step (Research "Clear") keeps its last state on the shelf.
- `app/_phases/cut/useCut.ts:37` has no reporter, and `app/_phases/score/ScoreSpotting.tsx:385` reports only in the music-video branch (StandardScore has none). Together with `lib/projects.ts:669-673` (`empty` blocks sign-off), and pinned by `tests/golden-path/step-sign-off.probe.spec.ts:122-140`, Score and Cut can never lock for an educational or trailer project, so `projectState` "delivered" (`lib/projects.ts:422-424`) is unreachable for user-made work.
- `app/_phases/frames/useFrames.ts:720-724` says `done` is reachable only by human sign-off. `ScoreSpotting.tsx:385` and `ScriptStep.tsx:192` assert `done` on mount. The rule is held by convention across 8 reporter call sites (grep), and two of them break it.
- `app/_phases/frames/useFrames.ts:544, 725-728`: `blocked` derives partly from `rejections`, which is session `useState`, so the reason dies on reload while the word persists.
- `app/_studio/projectSeed.ts:103-109`: the seed writes `frames: "blocked"` with no frames record. `app/studio/[projectId]/phases.tsx:22-31`: the step registry knows only `render(projectId)`, with nothing about what a step reads, produces or derives.

**The move (staged).**
- Stage 1, the contract. New `app/_phases/_shared/stepContract.ts`:
  - `StepModule { key, render, reads: StepKey[], appliesTo(discipline), verdict(input) -> {state: PhaseState | null, reasons: {code, text, ref?}[], basis: string} }`;
  - `verdict` is pure, and reads only persisted records plus the project;
  - each step's verdict lives in `app/_phases/<step>/verdict.ts`, lifted from `useFrames.ts:725-733`, `ResearchStep`, `ScriptStep`, `TrailerScript` and the music-video branches;
  - `phases.tsx` becomes `STEP_MODULES`;
  - probe `step-verdicts.probe.spec.ts`.
- Stage 2, the projection. New `app/_phases/_shared/progress.ts#recompute(projectId, changed)`:
  - `saveStep` calls it after commit for the changed step and every step whose `reads` include it;
  - it writes `progress` and a new `progressWhy` through one `patchProject`;
  - `null` from a verdict now writes `empty`, so a cleared step becomes honest;
  - non-applicable steps (Score for a music video) are excluded from `doneCount`'s denominator instead of being asserted `done`;
  - `usePhaseReport` and the 8 call sites are deleted.
- Stage 3, consumers:
  - `signOffBlocker` reads the verdict;
  - when an upstream `basis` changes after a downstream sign-off, the downstream step carries `staleSince` and the Stepper and race sheet draw `StaleBadge`;
  - `nextAction`'s verb gains the first reason as a `<Hint>` of 12 words or fewer (the work's words: "2 plates refused");
  - the seed ships the records behind its claims or drops them.

**Why it is a moonshot / what it unlocks.** Every surface (shelf, rail, bell, a future agent or CLI) can read the true state of any project without mounting React. "Delivered" becomes reachable, blocked comes with a reason, and upstream edits mark downstream work stale. Adding a sixth step means writing one module, not remembering an effect. This is also the foundation SHELF-A's lanes and the scenario rung (SLP-B) assert against.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `saveStep(p, "frames", {a refused plate})` with no component mounted results in `getProject(p).progress.frames === "blocked"` and `progressWhy.frames[0].code === "plate-refused"`.
2. A Cut record with clips, and frames present, gives `progress.cut === "working"`, and `signOff(p, "cut")` then succeeds (today it refuses).
3. Clearing Research (deleting its records) gives `progress.research === "empty"` (today it stays `working` or `done`).
4. A music-video project whose Score does not apply: no step is written `done` except by `signOff`, and `doneCount` counts out of 4.
5. Frames signed off, then a re-adopted script (`renderId` changes), gives a frames verdict with `staleSince` set, while `stateOf` still reads `done` (the lock holds, the staleness is said).
6. `verdict` functions import nothing from React (source ratchet), and each is deterministic over the same input.
7. A seeded project's shelf state after `recompute` equals what its records derive (no asserted-only states).

**Write set.** XL, in three stages:
1. `app/_phases/_shared/stepContract.ts`, new `app/_phases/{research,script,frames,score,cut}/verdict.ts`, `app/studio/[projectId]/phases.tsx`, `tests/golden-path/step-verdicts.probe.spec.ts`.
2. `app/_phases/_shared/progress.ts` (new), `app/_phases/_shared/stepStore.ts`, `lib/projects.ts` (`progressWhy`, `doneCount` applicability), and deleting `usePhaseReport.ts` plus its 8 call sites.
3. `app/studio/[projectId]/Stepper.tsx`, `app/_projects/shelf.ts`, `app/_projects/RaceSheet.tsx`, `app/_studio/projectSeed.ts`, `tests/golden-path/step-sign-off.probe.spec.ts` (case 3 inverts with the contract).

**Risks & rollback.** It changes what the shelf shows for every existing project on first recompute, which is a deliberate truth correction, so announce it in the commit. Recompute cost on large frames records stays inside the same transaction budget as `saveStep`. Rollback per stage: stage 1 is additive, and stage 2 can be backed out by restoring `usePhaseReport`.

**First session dispatch.**
1. Read `app/_phases/_shared/usePhaseReport.ts`, `app/_phases/frames/useFrames.ts:690-760`, `lib/projects.ts:384-430` and `:518-708`, and `tests/golden-path/step-sign-off.probe.spec.ts`.
2. Stage 1 only: write `step-verdicts.probe.spec.ts` (cases 1, 6), then lift the Frames verdict into `frames/verdict.ts` and the contract type.
3. Get the `contract` gate ratified (`appliesTo` and the `empty` write) before stage 2.
4. Gate: `npm run typecheck && npm test`.

_Runner-up:_ a typed upstream graph on the contract (`reads`) that makes Score and Cut read their inputs through one `useUpstream(projectId, step)`, ending the per-step `readStep`/`getProject` fan-out.

### WORKSPACE-B · Outputs becomes this project's real reel, with provenance and keep-on-shelf

**Context:** studio-workspace · **Slot:** B experience
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 4/10 · **Gate:** direction
**Registry:** media-generation/production-pipeline-phasing#asset-vs-disposable-render · software-engineering/entity-lifecycle#provenance-denormalization

**Summary.** The studio's "Outputs" button opens the same 30-odd mocked Glass Harbor assets for every project, under a "prototype · mocked data" stamp, while the steps behind it now hold real plates, spending and spotting. The move is to derive Outputs from this project's own step records (each with model, cost and step), let a plate be kept on the shelf as a pointer, and delete the fixture library.

**Premise (verified).**
- `app/studio/[projectId]/StudioView.tsx:397` prints `{ASSETS.length}`, the fixture count, on every project's Outputs tally. `:464` renders `<LibraryShelves />` with no project prop.
- `app/_library/LibraryShelves.tsx:20, 33-44` filters fixture `ASSETS` from `app/_studio/assets.ts`. Its own header (`:11-14`) says a surface "may not draw what the product cannot do".
- `app/studio/[projectId]/StudioView.tsx:330-334`: the mocked-data stamp is unconditional. Yet the Cut is derived from the project (`app/_phases/cut/deriveTimeline.ts:3-8`), and Score spots against this project's frames (`app/studio/[projectId]/phases.tsx:26-29`).
- `app/_phases/frames/frames.ts:68-77`: every plate already carries `src`, `model`, `costUsd` and `subject`, which is a complete provenance record. Takes are honestly not persisted (`deriveTimeline.ts:33-38`).
- There are two different `Asset` types: `app/_studio/types.ts:23-40` (fixture design) and `lib/assets.ts:116-129` (the real shelf). `app/_studio/runs.ts` has no importer anywhere (grep), so the mocked agent-run lineage is dead data.
- `lib/assets.ts:133-168` already implements the pointer doctrine for proofs (`proof:<themeId>/<proofId>`, content-addressed id). Plates have no such path, so a paid plate cannot reach the cross-project shelf.

**The move.**
- New pure `app/_library/projectOutputs.ts#outputsOf(records)`. It composes per-step collectors that live in each step directory (`app/_phases/{frames,script,score,cut}/outputs.ts`) and return `Output {id, kind, title, src, provenance: {model, step, costUsd}, state}`. Missing takes are listed as missing, never as outputs.
- Outputs renders these with the `Provenance` and `Tally` vocabulary, and the button's tally is this project's count.
- "Keep on shelf" writes a `lib/assets` row with `src: plate:<projectId>/<frameId>`, through a new scheme beside `proof:` and `upload:`, hydrated from the step record. A deleted project marks it `unresolved`, as `hydrateProofSrcs` does.
- The mocked-data stamp becomes derived: shown only while a visible surface reads a fixture (`deriveTimeline` `origin === "fixture"`, or the trailer beats fixture).
- Once nothing imports them, delete `app/_studio/{assets,assetsSource,assetsGenerated,runs,AssetDrawer,assetParts}.ts(x)` and the fixture `Asset` type.

**Why it is a moonshot / what it unlocks.** The disclosure stops lying and becomes the place where a creator reviews and keeps what this production made, with what each piece cost and which model made it. Plates flow into the cross-project library, which is the first real reuse path between projects. A whole fixture tree leaves the bundle.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `outputsOf({frames: 3 ready plates + 1 refused})` returns 3 image outputs whose `provenance.costUsd` sums to the plates' costs. The refused plate is not an output.
2. A project with no step records has an Outputs tally of 0 (today it is the fixture count).
3. Score spots with no persisted take appear as `state: "missing"` rows and are excluded from the count.
4. Keeping plate f2 on the shelf creates an asset `as-plate-<p>-f2` with `src: "plate:<p>/f2"`. A second keep overwrites the same id. After `deleteProject(p)`, the hydrated row is `unresolved` and named "source deleted".
5. A user project with frames and no fixture-backed surface renders no mocked-data stamp (`data-testid` absent). `seed-glass-harbor` without frames still renders it.
6. After the change, `app/_studio/assets.ts` and `runs.ts` have zero importers, and `npm run typecheck` is green with them deleted.

**Write set.** `app/studio/[projectId]/StudioView.tsx`, `app/_library/LibraryShelves.tsx`, `lib/assets.ts` (the `plate:` scheme and hydrate), `lib/useAssets.ts`. New: `app/_library/projectOutputs.ts`, `app/_phases/{frames,script,score,cut}/outputs.ts`, `tests/golden-path/project-outputs.probe.spec.ts`. Delete: `app/_studio/{assets,assetsSource,assetsGenerated,runs,AssetDrawer,assetParts}`.

**Risks & rollback.** Hydrating plates means reading the frames record (about 5 MB) when Outputs opens, so read on disclosure only and never per shelf render. `pipeline/cx-capture.mjs` screens that photograph Outputs will change. Rollback: keep the fixture files until stage acceptance, and LibraryShelves can re-point in one import.

**First session dispatch.**
1. Read `app/studio/[projectId]/StudioView.tsx`, `app/_library/LibraryShelves.tsx`, `lib/assets.ts:133-279`, `app/_phases/frames/frames.ts:60-150` and `app/_phases/cut/deriveTimeline.ts:1-60`.
2. Write `project-outputs.probe.spec.ts` (cases 1-3) against `outputsOf`.
3. Build the frames collector and the tally first, then keep-on-shelf, then delete the fixtures.
4. Gate: `npm run typecheck && npm test`, plus `cx-capture` of `studio-frames` with Outputs open, opened by eye.

_Runner-up:_ a per-project spend ledger in the studio header: plates, direction passes and proofs summed with an unpriced floor (`sheetSpend`'s honesty rule extended to the project), so a creator sees what this film has cost so far.

_Checked:_ read in full: `app/studio/[projectId]/{page,StudioView,phases,Stepper}.tsx`, `app/_studio/{types,projectTypes,assets}.ts`, `app/_studio/projectSeed.ts` (1-112). Read in part: `app/_studio/runs.ts` (head), `app/_phases/cut/deriveTimeline.ts` (1-120), `app/_phases/_shared/usePhaseReport.ts`, `app/_phases/frames/useFrames.ts` (116-146, 544, 700-775), `app/_phases/score/ScoreSpotting.tsx` (375-395), `app/_phases/script/ScriptStep.tsx` (180-192), `app/_library/LibraryShelves.tsx` (1-60). Hypotheses traced: which steps report progress (grep over `app/_phases`); importers of the `app/_studio` fixtures (grep); `runs.ts` has no reader; the registry's stale `video-assembly` deviation on `score.ts:224-235` is now partly superseded by `deriveTimeline`.
