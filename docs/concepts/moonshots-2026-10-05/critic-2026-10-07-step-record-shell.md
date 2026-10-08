# Critic pass · 2026-10-07 · the step-record chain and the shell chain

**Status: READ-ONLY REVIEW.** This is the third critic pass of the day over the
[moonshot backlog](README.md), after [critic-2026-10-07.md](critic-2026-10-07.md) and
[critic-2026-10-07-script-chain.md](critic-2026-10-07-script-chain.md). It covers two of
milestone 2's four chains. Neither depends on the files the C1 closing run changed.

**The base.** Every anchor below was opened at **`84b6706`**, which is local `main` and this
worktree's base. The C1 closing branch the brief names, `autopilot/accepted-idea-delivery-89ba4dfa`,
is **no longer unmerged**: `main`'s reflog records it fast-forwarded to `84b6706` ("merge
refs/heads/autopilot/accepted-idea-delivery-89ba4dfa: Fast-forward"), and the branch ref is gone.
Its commits are `bb33ed4` through `ca84723`, with the README edits in `533c944` and `84b6706`.
I read their write set with `git diff --stat 6ee4f19 84b6706` and `git show bb33ed4` wherever a
premise touches those files. Part 3 treats C1 closing as landed rather than in flight.

Nothing here changes a card, the README or any code. The status edits it proposes are listed at the
end, for whoever owns the README. Another run is editing that file now.

**Scope.**
- **Part 1, the step-record chain** (`README.md:55-56`):
  - `phase-shared-A` remainder (`03-frames-score-cut.md:199-256`);
  - `WORKSPACE-A` stage 2 and its unratified contract (`01-studio-hub.md:329-390`, `README.md:104-106`);
  - `SHELF-A`, `DATA-A` and `DATA-B` (`01-studio-hub.md:13-71`, `:124-172`, `:174-222`).
- **Part 2, the shell chain** (`README.md:61-63`):
  - `SIGNAL-A` → `UI-SHELL-B`;
  - `UI-SHELL-A` stages 1-2, reviewed with `KIT-B` and guarded by `UCP-B`;
  - `SIGNAL-B`.

  All of these are in `07-design-system.md`. `UI-SHELL-A` stage 3 is an operator-only decision
  (`README.md:139`). It is framed below as an ask and not decided.
- **Part 3.** Collisions, operator decisions, the order to build in, and catalogue edits.

**Method.** I opened every Premise anchor at `84b6706` and gave it one of three verdicts:
- `true`: it holds, at that line or within a few;
- `moved`: it holds, at the new `path:line` given;
- `false`: it no longer holds; the evidence and the sha that changed it are given.

Card text dates from `bf0a94d` (2026-10-05). Anchors that were already off at that commit say so.
Five read-only verifiers each took a group of cards, and I re-opened the load-bearing anchors myself
with `sed -n` before writing them down. Every count below comes with the command that produced it.
Nothing executed project code except the gate run in [Gate state of the base](#gate-state-of-the-base).
No app, dev server, engine, GPU job or paid call ran.

---

## Verdicts at a glance

| Card | Premise | What main already covers | Verdict | Next stage | Shape |
| --- | --- | --- | --- | --- | --- |
| `phase-shared-A` | 20 anchors: 6 false (`27cc8f4`, `6ab78b7`), 13 moved, 1 true. Two of its data-loss paths are **still live**: the Frames `renderId` overwrite and `useBeatPicks`' read-merge-write. | Stage 1 (`27cc8f4`): registry, `readRecord`, `patchRecord`, `useRecord`. Cases 1, 3 and 4 met; case 2 met by `6ab78b7`. | **Build next** | The remaining writers onto defs, plus the literal-key ratchet (case 6). Lineage (case 5) is a later stage. | Decided |
| `WORKSPACE-A` | 16 anchors: 3 false (reporter count 8 → **16**; Frames' private reporter gone), the rest moved or true | Stage 1 (`ff36669`): `stepContract.ts`, five `verdict.ts`, the parity probe. Case 6 met; case 1 half met. | **Build next: stage 2a.** Stage 2b, the switch, is held for the operator. | 2a: verdicts that are true on today's tree, plus one post-commit seam. Nothing switches. | 2a decided. 2b needs asks S1a-S1d. |
| `SHELF-A` | 12 anchors: 1 false (`useShelf` takes rows, it does not load them), the rest true or moved | Nothing. AUP-B's archive (`a1081b1`) adds cascade owners a new store must join. | **Hold for the operator, transitively.** It hooks the seam that 2b switches. Its per-step facts merge into WORKSPACE-B's `outputs.ts`. | None now | - |
| `DATA-A` | 12 anchors: 1 wrong when written (`useThemes.ts` lines 316-338, past the file's end), 1 partly false (the error is now reported, `fdffe01`), the rest true or moved | `patchProject`, the 5-store eviction transaction, AUP-B's closure walk. **No theme patch door.** | **Build next: a narrow stage 1** | A `patchTheme` door and a one-transaction theme removal, held by a schema-declaration probe | Decided. Archive-not-delete is ask S2. |
| `DATA-B` | 10 anchors: 2 false (`getProject` is called **19** times, not 11; one anchor was invalid when written), the rest true or moved | A narrow issue-time feed: `onSaveIssued` → `useActiveNotebook`'s map | **Hold for the operator, transitively** (after WORKSPACE-A 2b), and re-scope first | None now | - |
| `SIGNAL-A` | 11 anchors: 3 false (`a5add96` fixed Ctrl+K and repeat; the listener count is 18, not 19), 1 partly false, the rest true or moved | `app/foundry/keyGuard.ts` `refusedKey` (`a5add96`); combobox-aware `typing()` in the strips (`5dc68cc`) | **Build next** | stage 1: the `keymap` kernel; the Board and the cull run on it | Decided |
| `UI-SHELL-B` | 11 anchors: 2 false (narrow screens got their nav in `e503bbd`; listener count), the rest true or moved. There are now 7 modules, 9 Board sources and 6 steps. | The narrow-screen nav (`e503bbd`) and bell deep links | **Hold for the operator.** It is gated `direction`, and its strongest premise is gone. | If approved: a pure `paletteIndex` with no UI | Ask S3 |
| `UI-SHELL-A` | 13 anchors: 1 false (`e098071`: Modal stamps every world, so case 4 is met), 1 unreproducible count (the census is now **100** by a stated grep), the rest true or moved | Q8 (`e098071`) with a probe; the `cardModel` dedupe (`ef45fce`) | **Build next: stage 1** (no pixel change); stage 2 after KIT-B 1; stage 3 is the operator's | stage 1: `ROLE_TOKENS` in three scopes, plus three ratchets | Stage 1 decided. Stage 3 is the operator's (S4). |
| `KIT-B` | 9 anchors, all true or moved | Almanac-only breach flags (`f6545f4`). The composite maths exists **four times privately**, inside node-lane probes. | **Build next: stage 1** (the instrument) | `contrast.ts` learns alpha; the four probes import it | Decided |
| `UCP-B` | 10 anchors: 2 false (node-lane contrast probes now exist; `catalog.ts` floor text changed in `f6545f4`), the rest true or moved. There are 22 cx screens, not 17. Its case 1 is false: the shipped Ghost is ≈2.12:1. | Six source-regex contrast probes, and no Ghost value probe | **Build**, after KIT-B 1 and WORKSPACE-B 1 | Ghost probe, shared `SCREENS`, one live screen | Decided |
| `SIGNAL-B` | 10 anchors, all true or moved; card case 5 already holds | Three hand-rolled pressable chips | **Build**, after UI-SHELL-A stage 2 | The zero rule and the `select` door on `Tally`, adopted on `BroadcastWeek` | Decided |

---

## Gate state of the base

I ran the three gates the brief names on the untouched base (`84b6706`, this worktree), plus
`npm test`. **All pass.** C1 closing regenerated the census (`app/kit/census.json` is in its diff),
and it is current.

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint:ratchet` | exit 0: "1021 files, 0 errors, 12 warnings, all 3 bucket(s) at baseline (measured 2026-09-05)" |
| `npm run check:kit-census` | exit 0: "538 files · 27 modules · 120 parts · 75 with no adopter" |
| `npm test` | exit 0: 1703 passed, 1 skipped (1.7 min) |

I did not run `npm run verify`. Turbopack refuses this worktree's `node_modules` junction
(`critic-2026-10-07.md:60`), and the cards here need nothing that `verify` adds over these four.

**`census.json` makes every merge below serial.** `pipeline/kit-census.mts:61` walks `app` and
`components`, and `--check` fails on any drift. Every next stage below that adds or re-imports a
`.ts`/`.tsx` file under those trees must regenerate it with `npx tsx pipeline/kit-census.mts`
(`README.md:98-100`). Builders can still run side by side; only their merges queue.

---

## Part 1 · The step-record chain

`README.md:55-56`: `phase-shared-A` (step-record registry) → `WORKSPACE-A` (progress as a
projection of records) → `SHELF-A` (digest read model) / `DATA-B` (change feed). `DATA-A` is the
same context as `DATA-B` and is reviewed here with it.

### What already sits on the seam

- **The registry** (`27cc8f4`, merged `d27f335`) is in `app/_phases/_shared/records/`:
  - `registry.ts`: `defineRecord` `:105`, `decodeRecord` `:162`, `readRecord` `:206`;
  - `patch.ts`: `patchRecord` `:43` (one transaction through `patchStep`), `saveRecord` `:77` (stamps `def.version`);
  - `useRecord.ts`: `useRecord` `:36` (a save answers `refused: "unread"` until hydrated);
  - `stepStore.ts` gained `patchStep` (`:775`).
  - `lineage.ts` was never built.
- **Each step declares its own records** in its own `records.ts`:
  - `frames/records.ts`: `FRAMES_RECORD` v2, `FRAMES_ALTS`;
  - `research/records.ts`: `RESEARCH`, `RESEARCH_BEATS`, `RESEARCH_SCOPE`, `MUSIC_VIDEO_SOURCE`;
  - `script/records.ts`, `score/records.ts`, `cut/records.ts` (the last three from `ff36669`);
  - `motion/records.ts`;
  - five `ADS_*` defs in `_shared/records/ads.ts` (`d96ad7c`). Those break the owner-directory
    rule.
- **The step contract** (`ff36669`, merged `b35a803`) is `app/_phases/_shared/stepContract.ts`:
  - `VerdictState` excludes `done` and `empty` (`:63`); the rule is stated at `:29-31`;
  - `StepModule` (`:97-103`), `STEP_MODULES` with five entries (`:108`);
  - `verdictOf` (`:120-129`), `readVerdictInput` (`:162`), `computeVerdict` (`:183`).
- **The one issue-time watcher** is `onSaveIssued` (`stepStore.ts:703`). It fires inside
  `saveStep` before the write (`:719`), never inside `patchStep`. Its only subscriber is
  `useActiveNotebook.ts:121-125` (`6200683`).

### phase-shared-A: premise

| # | Anchor (card) | Verdict | Evidence at `84b6706` |
| --- | --- | --- | --- |
| 1 | `stepStore.ts:547-561` `readStep` casts, no parse or version check | **moved** | `stepStore.ts:614-628`. The cast is unchanged; the parse and version check live in `readRecord` (`registry.ts:206-213`). |
| 2 | `stepStore.ts:578-618` `SCHEMA_VERSION` "nothing reads this yet" | **false** (`27cc8f4`) | `:674-678` now says rules 3-4 are built at the record seam; the constant is at `:682` |
| 3 | `frames/useFrames.ts:64-71` literal keys | **moved, partly false** (`27cc8f4`, `6ab78b7`) | `:74` takes `PHASE` from `FRAMES_RECORD.owner`. Literals remain for the beats and trailer reads (`:77`, `:81`). |
| 4 | `score/useSpots.ts:38-42` | **moved** | `:40`, `:44` |
| 5 | `score/ScoreSpotting.tsx:89` | **moved** | `:95` |
| 6 | `cut/useCut.ts:94-95` bare `"frames"`, `"score"` | **moved** | `app/_phases/cut/useCut.ts:100-101` |
| 7 | `script/trailer/useTrailerCut.ts:27-28` | **moved** | `:28-29`; reads at `:73-74` |
| 8 | `research/useMusicVideoSource.ts:38` | **false** (`27cc8f4`) | `:46` `useRecord(MUSIC_VIDEO_SOURCE, …)` |
| 9 | `frames/music-video/useMusicVideoComposition.ts:43` | **false** (`27cc8f4`) | `:88` `useRecord(MUSIC_VIDEO_SOURCE, …)` |
| 10 | `stepStore.ts:36-37` imports step types upward | **true** | `:36` `ScoreSpot`, `:37` `TrailerCut`, `WithholdingBudget` |
| 11 | `useMusicVideoComposition.ts:101-111` copied merge | **false** (`27cc8f4`) | `:100-103` `patch()` |
| 12 | `useMusicVideoSource.ts:62-64` copied merge | **false** (`27cc8f4`) | `:69-72` `patch()`; `patchRecord(RESEARCH)` at `:80-87` |
| 13 | `research/beats/useBeatPicks.ts:74-80` copied merge | **moved, still live** | `app/_phases/research/beats/useBeatPicks.ts:68-74`: `loadStep(…, "research")`, then `saveStep({topic: current?.topic ?? "", researched: true})`. `loadStep` turns a failed read into the seeded default (`stepStore.ts:630-640`), so a failed read writes that default over the stored topic. |
| 14 | `stepStore.ts:563-573` `loadStep` flattens a failed read | **moved** | `:630-640` (the seeded default, not literally `{}`; the effect is the same) |
| 15 | `frames/alternatives/useAlternatives.ts:58,94-102` a failed read arms a save | **false** (`27cc8f4`) | `:60` `useRecord(FRAMES_ALTS)`, save gated |
| 16 | `alts.ts:12-14` ≈1.5 MB per scene | **moved** | `app/_phases/frames/alternatives/alts.ts:16-17` |
| 17 | `useFrames.ts:296-307,333-339` a `renderId` mismatch re-derives and the save overwrites | **moved, still live** | `app/_phases/frames/useFrames.ts:356` (`sameCut`), `:359` (`derive(source)`), then `saveRecord(FRAMES_RECORD, …, {renderId: source.id})` at `:403-412`. `6ab78b7` moved the read onto the def and `c590be3` touched the file; neither removed the overwrite. |
| 18 | `stepStore.ts:156-163` `spine` lineage key | **moved** | `:162-174` |
| 19 | `frames/frames.ts:119-124` `withClips` hand migration | **false** (`6ab78b7`) | `frames.ts:119-121` is a tombstone; the migration is `picture/migrate.ts` `framesV1ToV2` |
| 20 | (runner-up) `stepStore.ts:254-255` "quota means stop and export" | **moved** | `:289` |

### phase-shared-A: what main covers, and what it does not

| Case | Status | Evidence |
| --- | --- | --- |
| 1 · future record → refused, no save armed | **met** | `tests/golden-path/step-records.probe.spec.ts:261`, `:278`, `:286`, `:306` |
| 2 · v1 frames → `emptyClip`, `withClips` deleted | **met by frames-phase-A** (`6ab78b7`) | `tests/golden-path/picture-unit.probe.spec.ts:365`, `:392` |
| 3 · two same-tick patches both land | **met** | `step-records.probe.spec.ts:323`, `:340`, `:351` |
| 4 · alternatives, failed read → zero writes | **met** | `step-records.probe.spec.ts:412` (control `:435`) |
| 5 · staleness, plates kept until a rebase | **open** | Nothing stamps `derivedFrom`, and no `staleness()` exists. `derivesFrom` is accepted and ignored (`registry.ts:22-25`, a comment that is now partly stale: the frames, score, cut and trailer defs exist). |
| 6 · literal-key ratchet | **open** | No probe. The only related regex is `tests/golden-path/script-read-failure.probe.spec.ts:20`, scoped to `ScriptStep`. |

**The census of raw step calls.** I counted every `saveStep|readStep|loadStep|useStepFor|patchStep`
call under `app/` and `lib/`, excluding comments, `_shared/records/` and the three generic
pass-throughs:
- **48** carry a hard key: 16 inline literals and 32 file-local or imported constants.
- `lib/board/sources/` adds **7** more `readOrThrow` reads with hard keys.

The writers the card names that are still raw:
- `useBeatPicks` (stage 2);
- `useSpots`, `useCut` and `useTrailerCut` (stage 3).

The rest are C1's own sites, the board sources, and Script's (`ScriptStep`, `useVersions`,
`candidates/*`).

**A hazard to name, outside the card.** `useMotion.ts:122` calls `patchStep(projectId, FRAMES_KEY, …)`
with no `v`. That stamps v1 over a v2 frames record and updates only the `frames` shadow.
`picture/migrate.ts:22-28` documents this as tolerated, because v1 → v2 re-derives units from
`frames`. It stops being safe the day shot units carry their own plates (frames-phase-A). The board's
`alternative` source writes frames the same way (`migrate.ts:22-24`).

**A fifth read-merge-write, from C1 closing.** `lib/board/sources/triage.ts:111` reads the scope
with `readOrThrow`, and `:120` saves `{scope, confirmed, digest}` through `saveStep`. This is
non-atomic against a decision made on the Research step in another tab. `bb33ed4` was right to add
the digest. The non-atomic write is the next `patchRecord(RESEARCH_SCOPE)` candidate, but it sits in
C1's just-landed file and races only across tabs. **Count it in the ratchet; do not fold it in.**

### phase-shared-A next stage: the remaining writers onto defs, and the ratchet

One session, size M. Lineage waits: a `derivedFrom` stamp is only worth anything once every writer
goes through a def. That case also changes `useFrames.ts`, which frames-phase-A and script-phase-A
s2c own next.

**Write set.**
- `app/_phases/research/beats/useBeatPicks.ts`:
  - `confirm` becomes `patchRecord(RESEARCH, …)`, keeping the stored topic;
  - the hydrate reads through `useRecord(RESEARCH_BEATS)`.
- `app/_phases/score/useSpots.ts`: `SCORE` through `useRecord`; the trailer read through `readRecord(SCRIPT_TRAILER)`.
- `app/_phases/cut/useCut.ts`: `CUT` through `useRecord`; `readRecord(FRAMES)` and `readRecord(SCORE)` replace the raw reads at `:100-101`.
- `app/_phases/script/trailer/useTrailerCut.ts`: `SCRIPT_TRAILER`; `readRecord(RESEARCH_BEATS)` replaces `:74`.
- `app/_phases/cut/music-video/MusicVideoExport.tsx` and `app/_phases/frames/music-video/MusicVideoFrames.tsx`: their `useStepFor` literals (read-only) become `useRecord(MUSIC_VIDEO_SOURCE)`.
- `app/_phases/_shared/records/registry.ts`: correct the comment at `:22-25`.
- New `tests/golden-path/step-record-writers.probe.spec.ts`:
  - it drives hooks with the existing `harness()` (`tests/golden-path/_c1-harness.ts:49`), not with an eighth private dispatcher (Part 3);
  - it holds the ratchet.
- `app/kit/census.json`.

**Acceptance (write failing first, on fake-indexeddb).**
1. **Topic kept on a failed read.** `useBeatPicks.confirm` with the `"research"` read failing → zero writes to `"research"` (saveStep spy), and the stored topic is unchanged. This is red today.
2. **Topic kept on a good read.** `confirm` over a stored `{topic: "x"}` → `{topic: "x", researched: true}`. Two confirms issued in the same tick leave one consistent record.
3. **Future records refused.** `useSpots`, `useTrailerCut` and `useCut`, each over a record stamped `v: 99` → `refused: "future"`, and no save is armed.
4. **Cut reads through the defs.** `useCut` over a v1 frames record reads the def-migrated units. A refused `"score"` record does not arm the cut save.
5. **Saves are stamped.** Each converted save stamps its def's `version`, so a read-back gives `v === def.version` for `SCORE`, `CUT` and `SCRIPT_TRAILER`.
6. **The ratchet.** Count every hard-keyed `saveStep|readStep|loadStep|useStepFor|patchStep|readOrThrow` call under `app/` and `lib/`, outside `_shared/records/`.
   - The count must stay at or below a budget pinned at this stage's base, and the budget may only fall.
   - A fixture string `saveStep(pid, "frames", …)` makes the ratchet fail (negative control).
   - C1's sites (`triage.ts:111`, `:120`; `research/run/live.ts:245`, `:298`) and Script's are **counted**, not exempted.
7. **Defs live with their owner.** A new `defineRecord` call outside an owner's directory fails. `_shared/records/ads.ts` is allowlisted, with the reason stated.
8. **Unmodified probes stay green:** `step-records`, `picture-unit`, `score-spot-origin`, `trailer-cut-lifecycle`, `cut`, `frames-cut-resolution`, `step-verdicts` and `music-video-attach-persistence`.

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/{step-record-writers,step-records,picture-unit,score-spot-origin,trailer-cut-lifecycle,cut,frames-cut-resolution,step-verdicts}.probe.spec.ts`
- `npm run check:kit-census`
- `npm test`

**Must not touch.**
- `frames/useFrames.ts`: lineage, case 5.
- `research/{ResearchStep,useScope,run/live,guided/*}`, `_shared/notebook/*`, `script/ScriptStep.tsx` and `script/useVersions.ts`: C1, and script-phase-A s2a/s2b next.
- `script/candidates/useAdoption.ts`: script-phase-A s2b's reader list (`critic-2026-10-07-script-chain.md:470-477`).
- `lib/board/sources/*`.
- The internals of `stepStore.ts`, `saveStep` and `patchStep`, which WORKSPACE-A 2a edits. The converted writers still route through them, so the two compose.

**Shape: decided.** Later stage, named: **lineage**. `derivedFrom` stamps go on every def write.
Then a pure `staleness(records)`, and the Frames `renderId` branch becomes "stale, plates kept,
rebase offered". That stage reconciles the `useMotion.ts:122` v1 stamp and the board's v1 frames
writes. It runs after frames-phase-A's shot plates and script-phase-A s2c, because all three write
`useFrames.ts`.

### WORKSPACE-A: premise

| Anchor (card) | Verdict | Evidence at `84b6706` |
| --- | --- | --- |
| `usePhaseReport.ts:27-37`: effect writes; `null` writes nothing | **moved** | `app/_phases/_shared/usePhaseReport.ts:38-60` (`0c40439` added the retry) |
| `useFrames.ts:744-753`: Frames' own reporter effect | **false** (`0c40439`) | Frames reports through the shared hook (`useFrames.ts:887`) |
| `lib/projects.ts:609-633`: `empty` is unsayable | **moved** | `lib/projects.ts:661-665`: `reportPhase` takes `Exclude<PhaseState, "empty">` |
| `useCut.ts:37` has no reporter | **moved, true outside ads** | `useCut.ts:39`. But `cut/ads/AdsFinish.tsx:257` reports `done` (`d96ad7c`). |
| `ScoreSpotting.tsx:385`: only the music-video branch reports | **moved** | `:399` `usePhaseReport(projectId, "score", "done")`; StandardScore is still silent. `score/ads/AdsScore.tsx:101` reports too (`d96ad7c`). |
| `lib/projects.ts:669-673`: `empty` blocks sign-off | **moved** | `lib/projects.ts:710-714` |
| `step-sign-off.probe.spec.ts:122-140` pins it | **true** | `tests/golden-path/step-sign-off.probe.spec.ts:122` |
| `lib/projects.ts:422-424`: "delivered" unreachable | **moved; worse** | `:463-465`. `doneCount(p) === PHASES.length`, and `PHASES` now has **six** steps (`lib/projects.ts:43`, Motion, `1c90240`). |
| `useFrames.ts:720-724`: `done` only by sign-off | **moved** | `useFrames.ts:866-870` |
| `ScriptStep.tsx:192` asserts `done` | **moved** | `app/_phases/script/ScriptStep.tsx:223` |
| "8 reporter call sites, 2 break the rule" | **false: 16 sites, 12 can write `done`** (`d96ad7c` +6 ads, `1c90240` Motion, `0c40439` Frames) | See the table below |
| `useFrames.ts:544, 725-728`: `rejections` is session state | **moved** | `:634` (`useState`) |
| `projectSeed.ts:103-109`: seed asserts `frames: "blocked"` with no record | **moved** | `app/_studio/projectSeed.ts:110` |
| `phases.tsx:22-31` knows only `render` | **true** | `app/studio/[projectId]/phases.tsx:24-36`. `STEP_MODULES` landed in `stepContract.ts:108`, not here. |
| (adopted card) `lib/projects.ts:384-407`, `:675-708` | **moved** | `stateOf`/`phaseStates` `:427-448`; `signOff`/`reopen` `:716-750` |

**The 16 reporters** (`grep -rn "usePhaseReport(" app`):

| Site | Can write `done` | Covered by a verdict module |
| --- | --- | --- |
| `research/ResearchStep.tsx:136`, `:200` | yes | research |
| `research/MusicVideoResearch.tsx:23` | yes | research |
| `script/ScriptStep.tsx:223` | yes | script |
| `script/ScriptStep.tsx:297` | no | script |
| `script/trailer/TrailerScript.tsx:53` | no | script |
| `frames/useFrames.ts:887` | no | frames |
| `frames/music-video/MusicVideoFrames.tsx:99` | yes | frames |
| `score/ScoreSpotting.tsx:399` | yes | score (not music video) |
| `motion/useMotion.ts:77` | no | **none: there is no Motion module** |
| `research/ads/AdsIdea.tsx:105`, `script/ads/AdsScenario.tsx:143`, `frames/ads/AdsFrames.tsx:30`, `motion/ads/AdsMotion.tsx:47`, `score/ads/AdsScore.tsx:101`, `cut/ads/AdsFinish.tsx:257` | yes | **none: no module branches on `ads`** |

### WORKSPACE-A: what stage 1 built, against its acceptance

| Case | Status |
| --- | --- |
| 1 · refused plate with nothing mounted → `progress.frames === "blocked"` with its reason | **half met.** The verdict says it (`tests/golden-path/step-verdicts.probe.spec.ts:86`); `progress` is not written. |
| 2 · Cut with clips → `working`, and `signOff` succeeds | **open.** The cut verdict says `working`; `signOff` still refuses on `empty` (`lib/projects.ts:712`). |
| 3 · cleared Research → `empty` | **open** |
| 4 · music video: only `signOff` writes `done`; `doneCount` out of 4 | **open.** Only the verdict-level `not-applicable` exists (`stepContract.ts:120-129`, `score/verdict.ts:33`). |
| 5 · `staleSince` after a re-adopt | **open** (stage 3) |
| 6 · verdicts import no React; deterministic | **met** (`step-verdicts.probe.spec.ts:190-232`) |
| 7 · seed state equals what records derive | **open** (stage 3) |

Nothing outside `stepContract.ts` and its probe reads `verdictOf`, `STEP_MODULES` or
`computeVerdict`. There is no `progress.ts`, `progressWhy` or `staleSince`. No `verdict.ts` contains
`"done"`. So the contract **"a verdict says review, never done"** is in force in the type
(`stepContract.ts:63`), and so far it costs nothing, because nothing reads it.

### Three defects stage 2 would publish to the shelf

Stage 2 makes these verdicts the shelf's truth. Three of them are not true on today's tree.

1. **Research judges the scope against the wrong board.**
   - `research/verdict.ts:20-30` deals `fixtureSource()` "which is what useScope deals for every
     caller today". That stopped being true at `c86dcda`: `useScope(projectId, research.source)`
     (`ResearchStep.tsx:189`) deals the active notebook.
   - For a project holding both a replay and a reasoned notebook, the scope is keyed by the live
     card ids. `scopeDiffs` (`research/scope.ts:96-98`) walks the **fixture's** cards, finds none of
     them in either scope, and reports nothing moved.
   - So a diverged live scope reads `scope-confirmed`.
   - The pure resolver the verdict needs is `activeSourceOf` (`_shared/notebook/useActiveNotebook.ts:83`).
     It sits in a `"use client"` module that imports React (`:1`, `:39`), and the verdict probe's
     import-graph closure forbids React (`step-verdicts.probe.spec.ts`, `FORBIDDEN`). So it has to
     move to a React-free module first.
   - `research-notebook` also has no record def. It is written raw (`research/run/live.ts:245`,
     `:298`).
2. **Ads and Motion have no module.**
   - For an `ads` project the research verdict falls through to `beatsVerdict` and answers `null`
     (`research/verdict.ts:107-108`).
   - A switch that writes `empty` for `null` would erase the `done` that `AdsIdea.tsx:105` wrote.
     The same holds for every ads row above and for Motion.
   - The parity probe already says this: "Stage 2 owes the table its ads rows"
     (`step-verdicts.probe.spec.ts:385-391`).
3. **The reporter list is twice the card's.**
   - Stage 2's "delete `usePhaseReport` and its 8 call sites" would delete seven reporters no module
     replaces.
   - `usePhaseReport.ts` has to stay for Motion and ads, until they have modules.

### WORKSPACE-A next stage 2a: true verdicts and one post-commit seam (nothing switches)

One session, size M. Everything in it is additive or a correctness fix. No surface changes what it
shows, and `Project.progress` keeps exactly its current writers. That is why it needs no
ratification.

**Write set.**
- New `app/_phases/_shared/notebook/active.ts`, React-free:
  - `refusalOf` and `activeSourceOf` move here from `useActiveNotebook.ts:72`, `:83`;
  - `useActiveNotebook.ts` re-exports both, so its importers (`lib/board/sources/triage.ts:22` and
    the C1 probes) do not change.
- `app/_phases/research/records.ts`: `RESEARCH_NOTEBOOK = defineRecord({key: "research-notebook", owner: "research", version: 1, …})`.
  - It parses as permissively as `refusalOf`.
  - A malformed record decodes to the replay **with** its trouble, as case 13 of C1 closing
    (`4b97ad3`) requires. It is never refused into `null`.
- `app/_phases/research/verdict.ts`:
  - `records` gains `"research-notebook"`;
  - `factsVerdict` deals `buildCards(activeSourceOf(record))` and that source's `optInIds`.
  - **Unchanged:** a project whose only notebook is its own still answers `null`. Whether it should
    say `working` is ask A3 of the script-chain pass (`critic-2026-10-07-script-chain.md:710-716`).
    Do not decide it here.
- `app/_phases/_shared/stepContract.ts`:
  - `RECORD_DEFS` gains `RESEARCH_NOTEBOOK`;
  - a new `covers(key, discipline)` answers false for `ads` on every step and for `motion` (no
    module). `readVerdictInput` is unchanged.
- `app/_phases/_shared/stepStore.ts`: one `onSaveCommitted(watcher)` beside `onSaveIssued` (`:703`).
  - It fires **after** the transaction commits, and only when the write landed: in `saveStep`
    after `wrote` (`:741-744`), and in `patchStep` on a written decision (`:775-813`).
  - It carries `{projectId, phase}` and no payload.
  - Nothing subscribes in product code yet. It is the one seam that WORKSPACE-A 2b, DATA-B and
    SHELF-A would otherwise each cut into `saveStep` differently (Part 3).
- `tests/golden-path/step-verdicts.probe.spec.ts`: the ads and Motion rows (`:385-391`), and the
  research-notebook rows.
- New `tests/golden-path/save-committed.probe.spec.ts`.
- `app/kit/census.json`.

**Acceptance (write failing first).**
1. **Diverged live scope.** On a project with a replay and a reasoned record whose scope is
   confirmed and has since moved one live card, `computeVerdict(p, "research")` gives `review` with
   `scope-diverged`, and `ref` names the live card id. This is red today: the answer is
   `scope-confirmed`.
2. **Replay unchanged.** On a replay-only project, all 41 parity rows give the same verdicts as
   before.
3. **Reasoned-only unchanged.** A project with only a reasoned record and no `research` record
   still answers `null`, with a parity row that names ask A3.
4. **Malformed record.** A malformed `research-notebook` resolves to the replay through the def,
   and a trouble is reported. `readVerdictInput` does not refuse the whole input.
5. **Coverage.** `covers("research", "ads")` is false. Every ads reporter and `useMotion.ts:77` is
   a parity row marked `uncovered`, rather than exempted by directory.
6. **The seam.** `onSaveCommitted` fires:
   - once for a landed `saveStep`;
   - once for a written `patchStep`;
   - **zero** times for a superseded save, a `skip` decision or a transaction rejected with an
     injected `ConstraintError`;
   - before the save's promise resolves, after the commit (spy order).
7. **Purity.** The verdict closure stays React-free with `active.ts` in it (the existing `FORBIDDEN`
   walk). `useActiveNotebook`'s importers compile unchanged.
8. **Unmodified probes stay green:** `active-notebook`, `c1-closing`, `notebook-surfaces`,
   `step-records`, `step-sign-off` and `phase-report-retry`.

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/{step-verdicts,save-committed,active-notebook,c1-closing,notebook-surfaces,step-records,step-sign-off,phase-report-retry}.probe.spec.ts`
- `npm run check:notebook`
- `npm run check:kit-census`
- `npm test`

**Must not touch.**
- `lib/projects.ts`, which 2b owns.
- Any `usePhaseReport` call site.
- `Stepper.tsx`, `shelf.ts`, `RaceSheet.tsx` and `projectSeed.ts`, which are stage 3.
- `lib/board/sources/*`.
- `ResearchStep.tsx`'s reporter. Its comment at `:195-199` stays true until A3 is answered.

**Shape: decided.**

### WORKSPACE-A stage 2b: the switch (held for the operator)

**Its write set when it runs:**
- new `app/_phases/_shared/progress.ts` (`recompute`), subscribed to `onSaveCommitted`;
- `lib/projects.ts`: `progressWhy`, a writer that may write `empty`, and applicability in
  `doneCount`/`projectState`;
- deleting the **nine covered** reporters (the rows marked research, script, frames and score
  above), with `usePhaseReport.ts` kept for Motion and ads;
- `step-sign-off.probe.spec.ts` case 3, which inverts.

Its acceptance is the card's cases 1-4 plus:
- an ads project keeps its `done`;
- a Motion cell is never recomputed;
- one `patchProject` per recompute.

**It cannot be dispatched until the operator answers S1a-S1d below.** Each sub-ask changes what the
shelf says about existing projects on the first recompute.

### SHELF-A: premise and verdict

| Anchor (card) | Verdict | Evidence at `84b6706` |
| --- | --- | --- |
| `app/projects/ProjectsView.tsx:10-16` "hundreds of projects" | **true** | |
| `app/_projects/synthetic.ts:1-10` `?seed=300` | **true** | |
| `app/_projects/shelf.ts:188-197` `nextAction` from `progress` alone | **true** | `shelf.ts` is unchanged since the card |
| `shelf.ts:52-53` search covers title, logline, template, discipline | **true** | `matchesText` also at `:234-239` |
| `lib/projects.ts:712-717` reads keys, never records, to count | **moved** | `lib/projects.ts:753-758` |
| `lib/studioDb.ts:193-199` ~5 MB records | **true** | |
| `frames.ts:68-77` `Plate.src/model/costUsd` | **moved** | `app/_phases/frames/frames.ts:69-78` |
| `useFrames.ts:116-125` `FramesStepData.direction` | **moved, changed** | `useFrames.ts:133-150`. The record is v2: `units` is the record, and `frames` is its shadow (`6ab78b7`). |
| (risk) `studioDb.ts:84-121` stale-tab yield | **true** | |
| (dispatch) `stepStore.ts:578-660` `saveStep` | **moved** | `stepStore.ts:708-746`, plus a second write path the card never names: `patchStep` `:775-813` |
| (move) "`useShelf` reads `listDigests` beside `listProjects`" | **false** | `useShelf(projects)` takes rows (`app/_projects/useShelf.ts:18`); `listProjects` is called in `lib/useProjects.ts` |
| `DB_VERSION` 6 | still **5** | `lib/studioDb.ts:43` |

**Why not build it now.**
- **The seam.** SHELF-A merges its digest *inside* `saveStep`'s transaction. 2a puts a post-commit
  seam at the same place, and 2b recomputes there. The card does not cover `patchStep`, which is
  `patchRecord`'s path, so its "atomic" case 2 would be false for every def-based writer.
- **A second projection.** Plate counts, spend and poster from `frames/digest.ts` are the same
  facts as WORKSPACE-B's planned `frames/outputs.ts` (`critic-2026-10-07.md:420-480`). Score counts
  duplicate `score/outputs.ts`. Blocker reasons would duplicate 2b's `progressWhy`. The earlier
  pass already said to derive one from the other (`critic-2026-10-07.md:494-496`).
- **A new store now costs five cascade sites:**
  - `deleteProject` (`lib/projects.ts:835-850`);
  - `evictIdentity` (`lib/identityEviction.ts:305-308`);
  - the archive's `SECTIONS`/`STORE_OF` (`lib/studioArchive.ts:94-103`);
  - the archive's newer-version refusal, so a v6 archive cannot import into a v5 studio;
  - the archive probe's store list.

  A digest is derived, so it should stay out of the archive and be rebuilt after an import.
- **The name collides.** "digest" in `_shared/notebook` and `research/useScope.ts` is the notebook
  digest (`6200683`).

**Verdict: hold for the operator, transitively.** It is not dispatchable before WORKSPACE-A 2b,
which waits for S1. When it returns:
- its per-step `digest.ts` files merge into WORKSPACE-B's collectors;
- what remains is a derived cache written from `onSaveCommitted`, plus `digest.text` search and the
  lane drawing;
- it is re-specified then.

One consequence for C6: the earlier pass let WORKSPACE-B's closed-panel tally come "from SHELF-A's
digest" (`critic-2026-10-07.md:470-472`). That option is not available, so WORKSPACE-B stage 1
takes the other one (tally after the first open) or measures.

### DATA-A: premise

| Anchor (card) | Verdict | Evidence at `84b6706` |
| --- | --- | --- |
| `LibraryAtelier.tsx:156-168` counts dependents in a component | **true** (off by one) | `app/library/LibraryAtelier.tsx:157` `askDelete` |
| `LibraryAtelier.tsx:181-189` `removeFromTheme`, then delete anyway | **true** | `:188-189` |
| `lib/useAssets.ts:399-415` loops `deleteAsset`, swallows the error | **moved; partly false** (`fdffe01`) | `lib/useAssets.ts:410-429`, the loop at `:421`. The catch now reports to the bell (`failed(...)`, `:426`), but does not rethrow, so the theme is still deleted. |
| `lib/assets.ts:259-262` "the residual case" | **true** | `:261-262` |
| `lib/themes.ts:424-431` `deleteTheme` removes the row only | **true** | |
| `lib/themes.ts:300-309` projects fall to `miss: "deleted"` | **true** | resolver `lib/themes.ts:334-338` |
| `useFrames.ts:141-143` Frames renders `PRESETS[0]` | **moved** | `useFrames.ts:181` |
| `lib/board/sources/proof.ts:69-77` get, then put: two transactions | **true** | `:69`, `:73-76` |
| `lib/useThemes.ts`, lines 316-338, commits from React state | **anchor invalid when written; claim true** | The file was 159 lines at `bf0a94d`, so those lines never existed. `commit` → `putTheme` is at `lib/useThemes.ts:79`; `update`, `addProof` and `judgeProof` all call it. |
| no `patchProject`-style door for themes | **true** | no `patchTheme` anywhere; `patchProject` is `lib/projects.ts:602` |
| `lib/identityEviction.ts:63-66` hand list of stores | **true** | `:63-65`; the five-store transaction `:305-308` |
| `lib/projects.ts:656-658` `unknown` casts in `editProject` | **moved** | `lib/projects.ts:697-699` |
| `CreateWizard.tsx:268-283` theme and project written separately | **true** | `app/_projects/wizard/CreateWizard.tsx:275` (`putTheme`), `:284` (`create`) |

**What main covers, and a fact the card could not know.** AUP-B (`a1081b1`) wrote a **third**
hand-copy of the relation graph. It has its own section roster (`lib/studioArchive.ts:94-103`), a
closure walk over `themeId` (`:286` onward) and id re-minting for the pointers. The graph is now
written in at least three places: eviction, the archive and the cascades in `projects`/`themes`.
That strengthens the card's case. It also means `lib/studioArchive.ts` is a fourth file a full
DATA-A would rewrite.

### DATA-A next stage 1: one theme door, one-transaction theme removal, a declared schema

One session, size M.

**Write set.**
- New `lib/schema.ts`. A **declaration only**: each store, its owner key and its edges.
- `lib/themes.ts`:
  - `patchTheme(id, mutate, guards)` with `ratchetBlocker` as a guard, in one transaction;
  - `removeTheme(id)`, which deletes the theme, its promoted assets and their `upload:` bytes in one
    transaction and returns what it took.
- `lib/useThemes.ts`: `update`, `addProof` and `judgeProof` go through `patchTheme`.
- `lib/board/sources/proof.ts`: `decide` goes through `patchTheme`.
- `lib/useAssets.ts`: `removeFromTheme` delegates to `removeTheme`, and the loop at `:421` goes.
- `app/library/LibraryAtelier.tsx`: `confirmDelete` makes one call.
- New `tests/golden-path/relation-schema.probe.spec.ts`.

**Acceptance (fake-indexeddb, write failing first).**
1. **Every store declared.** The schema's store set equals `db.objectStoreNames` after `openDb()`.
   A store added without a declaration fails the probe.
2. **Eviction checked against the schema.** For every store the schema marks uid-owned,
   `evictIdentity(u)` leaves zero `u` rows and keeps every `v` row, including `uploads` reached by
   pointer. The probe reads the schema; `identityEviction.ts` is not edited.
3. **Archive checked against the schema.** Every schema store with an exportable role is in the
   archive's `SECTIONS`.
4. **No lost update.** `Promise.all([patchTheme(t, addProof), patchTheme(t, judge)])` keeps both
   changes, as does the board's `decide` racing `useThemes.addProof`.
5. **Locked themes refuse.** A proof-state change on a locked theme is refused inside the
   transaction, and the row is unchanged.
6. **All or nothing.** With an injected abort on the second asset delete, `removeTheme` leaves the
   theme and both assets present.
7. **Blast radius.** `blastRadius("theme", t)` with 2 promoted assets and 1 referencing project
   returns `{assets: 2, projects: 1}`. `removeTheme` reports the same counts it acted on.
8. **The two identity probes pass unmodified:** `identity-eviction-idb`, `identity-and-writes`. So
   do `studio-archive`, `library-atelier-states` and `theme-ratchet`.

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/{relation-schema,identity-eviction-idb,identity-and-writes,studio-archive,library-atelier-states,theme-ratchet,board}.probe.spec.ts`
- `npm test`

**Must not touch.**
- `lib/identityEviction.ts`: it is the security oracle, and SHELF-A would edit it.
- `lib/studioDb.ts`: no `DB_VERSION` bump.
- `lib/projects.ts`: WORKSPACE-A 2b owns it.
- `lib/studioArchive.ts`.
- `CreateWizard.tsx`: the atomic `createProject` is stage 2, with `projects.ts`.

**Shape: decided,** except that a locked theme which projects reference keeps today's behaviour
(deleted, and projects fall to `miss: "deleted"`). Changing that is ask S2.

### DATA-B: premise and verdict

| Anchor (card) | Verdict | Evidence at `84b6706` |
| --- | --- | --- |
| `lib/useProjects.ts:79-81` private state per hook | **true** | |
| `lib/useThemes.ts`, lines 244-246 | **anchor invalid when written; claim true** | private state at `lib/useThemes.ts:48-49` |
| `lib/useAssets.ts:144-146` | **moved** (`fdffe01`) | `:159-161` |
| `StudioView.tsx:180-198` re-reads on a rail click | **moved** | `app/studio/[projectId]/StudioView.tsx:200-204` |
| `getProject` called 11 times in 8 files | **false: 19 calls** | `grep -rn "getProject(" app lib`, definition excluded. The new sites are 5 ads surfaces (`d96ad7c`), Motion ×2 (`1c90240`) and `stepContract.ts:166` (`ff36669`). |
| `lib/studioDb.ts:96` `onversionchange` is the only signal | **true** | |
| no `BroadcastChannel` | **true for code; prior art missed** | `lib/jobs.tsx:217` and `:828` reject `BroadcastChannel` on purpose and sync jobs through `storage` events |
| `lib/projects.ts:551-553` "Single-tab prototype" | **moved** | `:592-594` |
| `stepStore.ts:311-337` the subscription precedent | **moved** | `:341-372` |
| `app/library/audio/bookStore.ts:89` `useSyncExternalStore` | **true** | |

**What main covers.** One narrow feed: `onSaveIssued` → `useActiveNotebook`'s map
(`useActiveNotebook.ts:108-126`). Against what DATA-B wants, it falls short in five ways:
- it fires at **issue**, on purpose, to beat stale reads;
- it carries the payload;
- it hears `saveStep` only, never `patchStep`;
- it has no cross-tab path;
- `evictIdentity` never clears it.

**Verdict: hold for the operator, transitively.** The README orders it after WORKSPACE-A
(`README.md:55-56`). Its case 2 is about `reportPhase`, which 2b replaces. Before it is dispatched it
needs re-scoping:
- emit from 2a's `onSaveCommitted`, not from a third cut into `saveStep`;
- rename its `useRecord`, which collides with `records/useRecord.ts:36`;
- justify `BroadcastChannel` against `lib/jobs.tsx`'s stated choice;
- clear the notebook map on eviction;
- recount `getProject` (19).

---

## Part 2 · The shell chain

`README.md:61-63`: `UI-SHELL-A` (roles, not worlds) is reviewed with `KIT-B` and guarded by
`UCP-B`; `SIGNAL-A` (one keymap) → `UI-SHELL-B` (the palette reads its verbs).

### SIGNAL-A: premise

| Anchor (card) | Verdict | Evidence at `84b6706` |
| --- | --- | --- |
| `lib/board/keys.ts:5-9` the K conflict | **true** | |
| `keys.ts:39-50` `typing()` covers SELECT and an open combobox | **true** | `lib/board/keys.ts:39` |
| `boardKeyAction` (`:81`) refuses modifiers and repeat | **true** | `:81-82` |
| `CullGrid.tsx:128`, `DojoView.tsx:182`, `AssetLightbox.tsx:65` hand-copy a weaker guard | **moved** | `app/foundry/CullGrid.tsx:148`. Dojo and CullGrid now call `refusedKey` first (`a5add96`). `AssetLightbox` (`:66-73`) still checks neither modifier nor repeat. |
| CullGrid's `switch` checks neither `ctrlKey` nor `repeat`, so Ctrl+K keeps | **false** (`a5add96`) | `CullGrid.tsx:146` `if (refusedKey(e)) return;` |
| `CullGrid.tsx:58-63` `activatesOnEnter` covers button/link/menuitem/tab only | **partly false (misread when written)** | `:58` `ENTER_ACTIVATES` already covers BUTTON/A/SUMMARY/SELECT/TEXTAREA/INPUT. The real gap is the **checkbox and radio roles**: `CullGrid.tsx:64` vs `lib/board/keys.ts:104`. Two copies remain, and `ExtractBoard.tsx:36` imports the cull's. |
| `FoundryView.tsx:100-106` `CULL_KEYS` is a separate literal | **moved** | `app/foundry/FoundryView.tsx:103-109` |
| `components/kit/Dock.tsx:40` `KeyRow`, a third display | **true** | |
| 19 files add a window `keydown` listener | **false: 18 window listeners, 23 `keydown` listeners in all** | All 18 window listeners are under `app/`, including two new strip handlers (`22b439f`). Five more are on `document`, among them `Modal`, `NotificationBell` and `UserMenu`. |
| `cull-keys.probe.spec.ts:124` checks only `app/foundry` | **true** | `foundry-key-guard.probe.spec.ts:42-44` has the same scope |

**What main covers.**
- `app/foundry/keyGuard.ts` `refusedKey` (`a5add96`) is the chord-and-repeat rule. Seven foundry
  handlers call it, held by `foundry-key-guard.probe`. Its header says it is "the rule the Board
  already applies", which is the kernel's premise in miniature.
- `5dc68cc` gave the strips the Board's `typing()`.
- Still open:
  - the combobox rule in the cull (`CullGrid.tsx:148` checks only INPUT, TEXTAREA and contentEditable);
  - the checkbox/radio Enter rule;
  - the display-binding split;
  - an app-wide census;
  - the verb table.

### SIGNAL-A next stage 1: the kernel; the Board and the cull run on it

One session, size M.

**Write set.**
- New `components/ui/signal/keymap.ts`, pure:
  - `defineKeymap`;
  - `resolveKey(map, e, {overlay})`;
  - one `typing`, one `enterBelongsToTarget`, one chord/repeat rule and one `overlayOpen`;
  - `keycapsRows(map)`.
- `components/ui/signal/{index.ts,Keycaps.tsx,README.md}`. `Keycaps` accepts a keymap.
- `lib/board/keys.ts`: rebuilt as a definition over the kernel. `typing`, `enterBelongsToTarget`,
  `overlayOpen` and `boardKeyAction` stay exported, so `useBoardKeys` and the strips do not change.
- `app/foundry/keyGuard.ts`: re-exports the kernel's chord/repeat rule, and its name stays.
- `app/foundry/CullGrid.tsx`: the `switch` becomes `resolveKey(CULL, …)`, and `activatesOnEnter`
  is deleted.
- `app/foundry/ExtractBoard.tsx`: only its `activatesOnEnter` import (`:36`) changes.
- `app/foundry/FoundryView.tsx`: draws `keycapsRows(CULL)`, and the `CULL_KEYS` literal is deleted.
- `tests/golden-path/cull-keys.probe.spec.ts`, and new `tests/golden-path/keymap.probe.spec.ts`.
- `app/kit/census.json`.

**Acceptance (write failing first).**
1. **Chord refused.** `resolveKey(CULL, {key: "k", ctrlKey: true})` is `null`. CullGrid already
   behaves this way through `refusedKey`; this case pins the kernel.
2. **Repeat refused except arrows.** `{key: "x", repeat: true}` is `null`, and
   `{key: "ArrowRight", repeat: true}` is `"move"`.
3. **Open combobox.** A letter key aimed inside `[role=combobox][aria-expanded=true]` is `null`
   for CULL. This is **red today** (`CullGrid.tsx:148`).
4. **Checkbox and radio keep Enter.** Enter on a `role="checkbox"` or `role="radio"` target is
   `null` for every keymap. This is **red today** (`CullGrid.tsx:64`). `activatesOnEnter` no longer
   exists anywhere under `app/`.
5. **One source for the keycaps.** `keycapsRows(CULL)` deep-equals `CULL.bindings.map(({keys, does}) => ({keys, does}))`,
   and `FoundryView.tsx` declares no `CULL_KEYS` literal (source check).
6. **The Board unchanged.** `boardKeyAction`'s outputs are identical for every key in
   `board.probe.spec.ts`. The Board's `A` is declared on the map as the exception to the K
   conflict.
7. **Existing probes stay green:** `foundry-key-guard`, `cull-keys` and `board`.
8. **Census.** After regeneration, `npx tsx pipeline/kit-census.mts --check` passes. The `typing`
   suspect count for `app/foundry` does not rise.

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/{keymap,cull-keys,foundry-key-guard,board}.probe.spec.ts`
- `npm run check:kit-census`
- `npm test`

**Must not touch.**
- `DojoView`, `Lightbox`, `StylesShelf`, the strip files and `AssetLightbox`. They migrate in stage
  2, with the app-wide census (card case 6) and the verb table (case 7).
- kit `Dock`/`KeyRow`.
- `Modal`, `StudioFrame`, `app/_phases/*`.

**Shape: decided.** Name it in the commit: the cull stops reacting to a letter typed into an open
combobox, and Enter on a checkbox stops opening the compare view. Both changes are intended.

### UI-SHELL-B: premise and verdict

| Anchor (card) | Verdict | Evidence at `84b6706` |
| --- | --- | --- |
| `StudioFrame.tsx:35-58` `MODULES`, six links, is the only navigation | **moved: seven links** (`5385470`, Articles) | `components/ui/StudioFrame.tsx:35` |
| `StudioFrame.tsx:177` hidden below `md`, no small-screen alternative | **false** (`e503bbd`, "Below 768px the Obsidian nav keeps its module links") | `StudioFrame.tsx:169` `<nav aria-label="Places">`; below `md` the links drop to a scrolling row (`:183-185`). Held by `tests/golden-path/shell-nav-reflow.probe.spec.ts`. |
| No palette or global jump | **true** | no `CommandPalette`, `cmdk` or global Ctrl/⌘K handler |
| `lib/jobLinks.ts:19` `studioHref` | **moved** | `lib/jobLinks.ts:24` |
| `cx-capture.mjs:43-59` reaches every step by URL | **moved** | `pipeline/cx-capture.mjs:32-70`, now including Motion |
| `useProjects.ts:79`, `useAssets.ts:144`, `registry.ts:60`, `source.ts:80` `SOURCE_ORDER` (8 sources) | **true / moved; 9 sources** | `lib/useAssets.ts:159`; `lib/board/source.ts:80` now ends with `"articles"` (`5385470`) |
| `useJobs` in `NotificationBell` | **true** | |
| 19 window `keydown` listeners | **false** | 18 (see SIGNAL-A) |

**Verdict: hold for the operator.**
- The card is gated `direction`.
- Half of its case for being built now was "narrow screens have no navigation", and `e503bbd`
  closed that.
- Its command registry is meant to read SIGNAL-A's verbs (`README.md:63`), and those do not exist
  yet.

The palette is still a real capability: two keystrokes to any project step, and Board counts beside
running jobs. Whether to start it now is ask S3.

**If the operator says yes before SIGNAL-A lands**, the first stage is the pure index with no UI:
- **Write set:** new `components/ui/shell/palette.ts`, new
  `tests/golden-path/shell-palette.probe.spec.ts`, and `app/kit/census.json`.
- **Acceptance:**
  1. 2 projects give 2 × `PHASES.length` (**6**, `lib/projects.ts:43`) `project-step` entries, each
     with `href === studioHref(id, step)`. The step list is read from `PHASES`, not typed out.
  2. Board counts `{cull: 4, proof: 0}` give one `decision` entry with the fact `Cull · 4`, and no
     entry for a zero count.
  3. The query `"harb sco"` ranks Glass Harbor · Score first.
  4. Every `MODULES` entry (7) appears as a `place`, derived rather than copied.
  5. Every `SOURCE_ORDER` id (9) has a label.
- **Not in that stage:** `Palette.tsx`, `useShellCommands`, the Ctrl/⌘K binding and the
  `StudioFrame` mount.

### UI-SHELL-A: premise

| Anchor (card) | Verdict | Evidence at `84b6706` |
| --- | --- | --- |
| `components/ui/tokens.ts:335` three scopes | **true** | |
| `tokens.ts:283` `WORLD_OBSIDIAN_KIT` | **true** | `tokens.ts` is untouched since the card |
| `world.tsx:23` `useWorld()` | **moved** (`e098071`) | `components/ui/world.tsx:31` |
| "`useWorld()` read 20 times under `components/`" | **true as 20 lines; 19 calls in 12 files** | One of the 20 hits is a comment in `Field.tsx` |
| "~78 conditionals: Field 15, Deck 7, signal 14, Modal 4, StudioFrame 3" | **not reproducible; recounted as 100** | See the command below. The count is the same at `bf0a94d`, so the card used a different method, not an older tree. |
| `DeckCardAlmanac.tsx` is a second skin | **true** | 160 lines |
| `StaleBadge.tsx:53`, `Provenance.tsx:56` hard-wire `TALLY_TONE` | **true** | |
| `Keycaps.tsx:59` hard-wires white utilities | **true** | |
| `Tally.tsx:93` branches | **true** | `components/ui/signal/Tally.tsx:93`, `:96` |
| `components/kit/kit.css:21` "the root of a portalled Modal" | **true** | `.k-acts`/`.k-confirm` `kit.css:466-467` |
| `Modal.tsx:226-229` stamps `data-world` only for Almanac | **false** (`e098071`) | `components/ui/Modal.tsx:268` `data-world={portalWorld(world, scoped)}`; held by `tests/golden-path/modal-portal-world.probe.spec.ts`. **Acceptance 4 is met.** |
| `StudioFrame.tsx:102` the Bar vs nav fork | **moved** | `StudioFrame.tsx:107` `if (world === "almanac")`; the Obsidian nav is `:169` |
| `tokens.ts:219-222` "one surface at a time" | **true** | |

**The recount**, reproducible from the repo root:

```
P='\b(almanac|al) \?|if \(!?(almanac|al)\)|[=!]== "almanac"|\b(almanac|al) &&'
for f in $(grep -rlE "$P" components/ui); do echo "$f $(grep -oE "$P" $f | wc -l)"; done
```

| File | Count |
| --- | --- |
| `NotificationBell` | 42 (`al ?`) |
| `UserMenu` | 16 (`al ?`) |
| `Field` | 15 |
| `Deck` | 7 |
| `TabRail` | 4 |
| `Hint` | 3 |
| `Tally` | 3 |
| `DeckCard` | 2 |
| `Modal` | 2 |
| `Primitives` | 2 |
| `StackBar` | 2 |
| `StageRail` | 1 |
| `StudioFrame` | 1 |
| **Total** | **100** |

Without the `al` spelling the total is 42. Whichever pattern stage 1 pins, it must state it in the
probe.

**A finding the card did not count.** `git grep -l TALLY_TONE -- app components` names **35** files
besides `Tally.tsx` and `signal/index.ts` that hand-wire `${CHIP_CLASS} ${TALLY_TONE.x}`. That is
StaleBadge's pattern, outside the card's write set. Ten are in the phase directories. They include
C1 closing's new `app/_phases/_shared/notebook/SourceChip.tsx:31`, which also mutes its key with
`opacity-60` (`:32`).

### UI-SHELL-A next stage 1: role tokens with no visible change, and three ratchets

One session, size M. It differs from the card in one way: **the pilot conversion moves to stage 2.**
Stage 2 replaces `text-white/NN` with role classes. Four node-lane contrast probes read those
utilities with regexes (KIT-B, below), so stage 2 has to wait for the instrument that can still
measure after the swap.

**Write set.**
- `components/ui/tokens.ts`: `ROLE_TOKENS`, a closed `--r-*` vocabulary, bound inside `tokensCss()`
  in all three scopes. Every value is a `var(--gt-*|--al-*)`.
- New `tests/golden-path/role-completeness.probe.spec.ts`.
- New `tests/golden-path/world-branch-ratchet.probe.spec.ts`.
- No `roles.css` yet: the class set is stage 2.

**Acceptance (write failing first).**
1. **Bound everywhere.** Every `ROLE_TOKENS` key is declared in `:root`, `[data-world="almanac"]`
   and `[data-world="obsidian"]` of `tokensCss()`, so the missing list is `[]`.
2. **No literals.** Every role value is a `var(--gt-*)` or `var(--al-*)` that resolves in its
   scope, so the unresolved list is `[]`.
3. **No visible change.** `tokensCss()` with the `--r-*` declarations removed is byte-equal to its
   output at the stage's base.
4. **No unknown roles.** Every `--r-*` name used in `app/`, `components/` or any `.css` file is a
   `ROLE_TOKENS` key. A fixture string `var(--r-nope)` fails (negative control).
5. **`useWorld()` ratchet.** Files calling `useWorld()` under `components/` stay at or below the
   measured 12 (named list), and calls at or below 19. Both may only fall.
6. **Conditional ratchet.** The per-file world-conditional count in `components/ui` (the grep above,
   pattern stated) stays at or below the recorded table, total 100. It may only fall.
7. **`TALLY_TONE` ratchet.** Files that hand-wire `TALLY_TONE` outside `components/ui/signal/` stay
   at or below 35 (recorded list). The count may only fall.
8. **Photographs.** `node pipeline/cx-capture.mjs` for `projects`, `library-styles`, `foundry` and
   `kit-parts`, before and after, opened by eye: no change.

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/{role-completeness,world-branch-ratchet,modal-portal-world,kit-catalog}.probe.spec.ts`
- `npm run check:narration`
- `npm test`

**Must not touch.**
- `components/ui/signal/*`, `Modal.tsx`, `StudioFrame.tsx`, `deck/*`, `kit.css`, `forms.css`
  (stages 2-4).
- Any `app/_phases` file. Ratchet 7 counts them; it does not edit them.

**Shape: decided.**
- **Stage 2**, after KIT-B stage 1:
  - the role class set;
  - `signal/*`, `Primitives`, `Field`, `NotificationBell` and `UserMenu` move onto roles;
  - the visual `useWorld()` reads go.
- **Stage 3** is the operator's (S4).
- **Stage 4** narrows `kit.css`/`forms.css` selectors.

### KIT-B: premise

| Anchor (card) | Verdict | Evidence at `84b6706` |
| --- | --- | --- |
| `app/kit/KitView.tsx:47` `world="almanac"` | **moved** | `app/kit/KitView.tsx:62` |
| Other mounts default to Obsidian (`ProjectsView:181`, `LibraryView:54`, `StudioView:282`, `FoundryView:396`) | **moved** | `app/projects/ProjectsView.tsx:231`, `app/library/LibraryView.tsx:54`, `app/studio/[projectId]/StudioView.tsx:287`, `app/foundry/FoundryView.tsx:411` |
| `AudioWorkbench.tsx:553` `WorldRoot world="obsidian"` | **moved** | `app/library/audio/AudioWorkbench.tsx:572` |
| `app/kit/contrast.ts:1-3` reads `WORLD_ALMANAC` only | **true** | unchanged since `de61b8d` |
| `contrast.ts:7` `MIX` accepts only hex or `var()` operands | **true** | `app/kit/contrast.ts:7`; `resolve` returns a hex string |
| `tokens.ts:286,289,290` alpha mixes cannot be measured | **true** | |
| `Ghost.tsx:64-73` the ~0.12 alpha hole | **moved** (`aa89f37`) | `components/ui/signal/Ghost.tsx:68-77` |
| `app/kit/Identity.tsx:130` resolves only against `WORLD_ALMANAC` | **true** | |
| `app/kit/Parts.tsx:529` `DEMOS` | **moved** | `app/kit/Parts.tsx:558` |

**What main covers, and why this card now has a second job.** Four node-lane probes landed after the
card. Each defines its own `lin/lum/over/ratio` composite and reads Tailwind alphas out of source
with a regex:
- `chip-key-contrast` (`a217c2c`);
- `pip-contrast`;
- `upstream-break-contrast`;
- `bandtrack-contrast`.

`deck-text-contrast` and `notebook-text-contrast` are related. There are therefore four private
copies of the function KIT-B's case 2 asks for. UCP-B's case 1 (`effective()`) asks for it a fifth
time. **KIT-B should own it,** and UCP-B should import it, adding only the ancestor-opacity product
as a parameter.

### KIT-B next stage 1: `contrast.ts` learns alpha, and the probes share it

One session, size S-M. It changes no visible pixel on `/kit`. The Identity world switch and the
three-column Worlds face come after UI-SHELL-A stage 1: they are the visible half, and they need
the roles to converge on.

**Write set.**
- `app/kit/contrast.ts`:
  - `resolve()` returns `{rgb, alpha}`;
  - it understands `transparent`, `white` and `color-mix(… X%, transparent)`;
  - new `contrastOver(fg, ground, opacities?)`.
- `app/kit/Identity.tsx`: only as far as the new return shape requires; no world switch.
- `tests/golden-path/{chip-key-contrast,pip-contrast,upstream-break-contrast,bandtrack-contrast}.probe.spec.ts`:
  their private composites become imports. Their thresholds and their findings stay.
- New `tests/golden-path/kit-contrast.probe.spec.ts`.

**Acceptance (write failing first).**
1. **Alpha resolved.** `resolve("color-mix(in srgb, var(--gt-ink-bright) 72%, transparent)", tokens)`
   gives `{rgb: <--gt-ink-bright>, alpha: 0.72}`.
2. **The Ghost, measured.** This is the Ghost value probe that nothing holds today.
   - The first version, `contrastOver({rgb: "#ffffff", alpha: 0.30}, "#080a10", [0.40])`, gives
     ≈1.33:1.
   - The shipped fix, `(0.45, [0.55])` (`Ghost.tsx:78`, `:82`), gives ≈2.12:1.
   - The probe pins both numbers, and that the fix is the higher one. **It does not assert ≥3.**
     The shipped fix is still under WCAG 1.4.11's 3:1, which needs ≈0.34 effective alpha on
     `#080a10`. I computed these values with the standard relative-luminance formula, in a
     read-only node one-liner.
   - UCP-B's case 1 ("with (0.45, 0.55) → ≥ 3", `07-design-system.md:312`) is therefore false on
     today's tree. Whether a dashed placeholder outline is held to 3:1 is ask S5.
3. **Every Obsidian-kit text role measurable.** Each one in `WORLD_OBSIDIAN_KIT` resolves to a
   non-null ratio.
4. **One composite.** No file under `tests/golden-path/` defines its own `lum`/`over`/`ratio`
   (source check), and the four migrated probes report the same numbers as before.
5. **Almanac unchanged.** The Almanac palette table on `/kit` (`Identity.tsx`) renders the same
   ratios as at the base.

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/{kit-contrast,chip-key-contrast,pip-contrast,upstream-break-contrast,bandtrack-contrast,kit-catalog}.probe.spec.ts`
- `npm test`

**Must not touch.** `Parts.tsx`, `KitView.tsx`, `components/ui/*` and `pipeline/cx-capture.mjs`.
`app/kit/` is in the census's kit zone (`pipeline/kit-census.mts:74`), and a zone file adds no
adopters and no suspects (`:363-365`). An edit that changes no import therefore leaves
`census.json` as it is. The `kit-catalog` probe confirms it.

**Shape: decided.**

### UCP-B: premise

| Anchor (card) | Verdict | Evidence at `84b6706` |
| --- | --- | --- |
| CLAUDE.md, and `Ghost.tsx:64-73` the photographed hole | **moved** | `Ghost.tsx:68-77` |
| the fix at `Ghost.tsx:78` is protected by nothing | **moved, still true** | `opacity-55` at `:78`, `border-white/45` at `:82`; no test reads these values |
| `tests/live/` holds two specs plus `_control.ts` | **true, plus `tests/live/_gallery.ts`** (`e509911`) | |
| no axe, jsdom or happy-dom dependency | **true** | |
| `pipeline/cx-capture.mjs:32-70` `SCREENS` | **true; 22 screens**, not the 17 CLAUDE.md states | `studio-motion` and the three `kit-*` screens were added |
| `contrast.ts:1-3` Almanac only | **true** | |
| `app/kit/catalog.ts:445` "white, then vellum, both 11:1" | **false** (`f6545f4`) | `app/kit/catalog.ts:470` reads `${MUTING_FLOOR}:1`, 10.5 |
| `catalog.ts:447` "state is never a dimmer colour" | **moved** | `:472` |
| "no visual or contrast assertion in either lane" | **false for the node lane** | the six contrast probes above (`a217c2c` and later); still true for the live lane |
| (acceptance 1) the shipped Ghost values reach ≥ 3 | **false** | They composite to ≈2.12:1 (KIT-B case 2). The case must pin the measured value, and S5 decides the floor. |

**Verdict: build, after KIT-B stage 1 and after WORKSPACE-B stage 1.** KIT-B owns the composite.
WORKSPACE-B stage 1 adds a `studio-outputs` screen to the very `SCREENS` table this card extracts
(`critic-2026-10-07.md:434-435`).

### UCP-B next stage: shared screens, the measurer, one live screen

**Write set.**
- New `pipeline/cx-screens.mjs`: `SCREENS` moves out of `cx-capture.mjs:32-70`.
- `pipeline/cx-capture.mjs` imports it.
- New `tests/live/_legibility.ts`: the page-side walk, calling KIT-B's `contrastOver` with the
  ancestor-opacity product.
- New `tests/live/legibility.live.spec.ts` (the `projects` screen only) and
  `tests/live/legibility-baseline.json`.
- A Ghost negative-control fixture under a dev-only path.

**Acceptance.**
1. **One table.** `cx-capture.mjs` and the live spec import the same `SCREENS` object, and a screen
   id added in one appears in the other.
2. **Negative control.** A fixture rendering `<Ghost>` with the pre-fix classes produces exactly one
   non-text finding.
3. **Ratchet.** On `projects`, the finding count equals the committed baseline. Adding one
   `text-white/20` label goes red, naming its selector. Until S5 is answered, the Ghost's 2.12:1
   is a baseline entry, not a pass.
4. **Explicit rule for decoration.** `aria-hidden` marks are excluded from the text floor. They are
   included in the non-text floor only when they carry state (`data-state`, or a dashed border).
5. **Honest about backdrops.** Gradient and image backdrops report `unmeasured`, never a pass.
6. **Time recorded.** The run time on the live lane's port is measured and written into the spec
   header.

**Gates.** `npm test`, then `npm run test:live` for the new spec. This is a builder's live-lane run,
not a paid call.

**Must not touch.** `components/ui/*`, `app/kit/contrast.ts` (it imports only),
`playwright.config.ts`.

**Shape: decided.**

### SIGNAL-B: premise

| Anchor (card) | Verdict | Evidence at `84b6706` |
| --- | --- | --- |
| `Tally.tsx:96` renders a `<span>` | **true** | no `select`, `href`, `aria-pressed` or `zero` prop |
| `StackBar.tsx:122-129`, `:153-171` plain `<li>` | **true** | `components/ui/signal/StackBar.tsx:122-129` |
| `app/calendar/BroadcastWeek.tsx:147-149` tallies over a grid | **true** | |
| zero-tone rule hand-typed: `BroadcastWeek.tsx:148`, `ChannelsTab.tsx:165`, `StylesShelf.tsx:337`, `arrange/Board.tsx:251` | **true / moved** | `app/calendar/ChannelsTab.tsx:174` (`52b4ab6`), `app/foundry/StylesShelf.tsx:339` (`a5add96`), `app/playground/arrange/Board.tsx:251` |
| countable sets: `RunCards.tsx:118-119`, `ContactSheet.tsx:291-292`, `arrange/Board.tsx:418-419` | **true** | |
| `TabRail.tsx:229-236` nests a `Tally` inside `role="tab"` | **true** | |

**Since the card:**
- `git grep -nE 'tone=\{[^}]*\? *"(amber|cyan|emerald|rose)" *: *"neutral"' -- app components` finds
  **30** zero-tone ternaries.
- Three hand-rolled pressable chips already exist, each a `<button aria-pressed>` over
  `CHIP_CLASS + TALLY_TONE`: `_shared/ui/DispatchStrip.tsx`, the articles `CritiquePanel.tsx` and
  `StripLightbox.tsx`. That is a second spelling of the `select` door.
- **Card case 5 already holds.** `TabRail`'s `tally` prop is its own literal type
  (`TabRail.tsx:56`), so passing `select` already fails. Restate it as "TabRail's tally stays a
  non-Tally shape".

**Verdict: build, after UI-SHELL-A stage 2.** Both rewrite `Tally.tsx`, `StackBar.tsx` and
`TabRail.tsx`. Landing the door first would add a third skin to a chip that stage 2 is about to
un-fork.

### SIGNAL-B next stage: the zero rule and the `select` door, adopted on BroadcastWeek

**Write set.**
- `components/ui/signal/{Tally,StackBar,index}.tsx`/`.ts`.
- New `components/ui/signal/useCountFilter.ts`.
- `components/ui/signal/README.md`.
- `app/calendar/BroadcastWeek.tsx`.
- `pipeline/cx-capture.mjs` (or `pipeline/cx-screens.mjs`, after UCP-B): one `calendar` screen.
- New `tests/golden-path/count-door.probe.spec.ts`.
- `app/kit/census.json`.

**Acceptance.**
1. **The zero rule.** `<Tally value={0} tone="amber"/>` renders the neutral role, and
   `zero="keep"` keeps amber.
2. **The door.** `<Tally value={2} label="missed" select={{pressed: false, onToggle}}/>` renders a
   `<button aria-pressed="false">` whose accessible name is "missed 2".
3. **Zero segments are not doors.** `<StackBar onSegment>` over `[{n: 3}, {n: 0}]` gives one legend
   button and one plain item.
4. **The URL holds the selection.** `useCountFilter("only")` set to `"missed"` writes
   `?only=missed`, and re-reading restores it (pure reader).
5. **TabRail stays inert.** TabRail's tally type still refuses `select` (`@ts-expect-error`).
6. **BroadcastWeek filters.** Filtered to missed, with 2 missed of 9 slots, exactly 2 slots render
   as matched. Its three ternaries at `:147-149` are gone.
7. **The chip spelling ratchet falls by one.** That is UI-SHELL-A ratchet 7 for `TALLY_TONE`, plus
   a new count of hand-rolled `aria-pressed` chips, pinned at 3.

**Gates.**
- `npm run typecheck`
- `npx playwright test tests/golden-path/count-door.probe.spec.ts`
- `npm run check:narration`
- `npm run check:kit-census`
- `npm test`
- A photograph of `/calendar`, opened by eye. `SCREENS` has no calendar id (`pipeline/cx-capture.mjs:32-70`), and an unknown id is refused. So this stage adds a `calendar` screen. That is one more reason UCP-B's extraction of `SCREENS` should land first, or this addition rebases onto it.

**Must not touch.** The other 29 zero-tone sites. Each is its own commit, later. Also
`DispatchStrip.tsx`, which belongs to `_shared/ui`, a phase-shared file.

**Shape: decided.**

---

## Part 3

### Collisions

**The C1 closing branch has landed** (Header). Its write set was:
- `app/_phases/{frames,research,script,_shared/notebook}/`;
- `lib/turns/assemble/recalibrate.ts` and `lib/board/sources/triage.ts`;
- `tests/golden-path/` (new `_c1-harness.ts`, `c1-closing`, `frames-notebook` and
  `notebook-surfaces` probes);
- `app/kit/census.json`.

That is all confirmed with `git diff --stat 6ee4f19 84b6706`. So the C1 column below records
**which next stage edits a file C1 just changed**, not a live merge conflict. For the specified
next stages of the morning pass, I read `critic-2026-10-07.md:420-480` (WORKSPACE-B 1) and
`:947-971`, and the script chain's `critic-2026-10-07-script-chain.md:424-496`.

| Next stage here | Writes | C1 closing (landed `84b6706`) | WORKSPACE-B 1 | Other specified stages |
| --- | --- | --- | --- | --- |
| **phase-shared-A** writers + ratchet | `research/beats/useBeatPicks.ts`, `score/useSpots.ts`, `cut/useCut.ts`, `script/trailer/useTrailerCut.ts`, two music-video readers, `_shared/records/registry.ts` (comment), new `step-record-writers` probe, census | Same directories, **no shared file**. The ratchet *counts* `triage.ts` and `live.ts`. It reuses `_c1-harness.ts:49`. | Soft: WORKSPACE-B's score collector should read through `SCORE`, which this stage makes the only door. Census serial. | **production-script-probes-B 1** migrates every private dispatcher. There are now **seven** (`_c1-harness.ts`, `active-notebook`, `phase-report-retry`, `picture-unit`, `score-spot-origin`, `step-records`, `trailer-cut-lifecycle`), not the six the script-chain pass counted (`critic-2026-10-07-script-chain.md:676-680`). This stage adds none. **script-phase-A s2b** owns `candidates/useAdoption.ts`, which is excluded here. |
| **WORKSPACE-A 2a** | new `_shared/notebook/active.ts`, `_shared/notebook/useActiveNotebook.ts` (re-export only), `research/records.ts`, `research/verdict.ts`, `_shared/stepContract.ts`, `_shared/stepStore.ts` (the seam), `step-verdicts` + new `save-committed` probes, census | **Yes, one file:** `useActiveNotebook.ts`, which C1 last changed in `4b97ad3`. The edit is a move plus a re-export; C1's probes stay unmodified (acceptance 8). | Soft: WORKSPACE-B's gate runs `step-verdicts` (`critic-2026-10-07.md:456-459`), which 2a extends. Frames and score verdicts are unchanged, so `plate-refused` and `take-missing` hold. **Either order**; the second to land reruns `step-verdicts` and the census. | **script-phase-A s2a** edits `_shared/notebook/types.ts` (a different file) and `lib/notebook/validate.ts`. No file is shared, but both are in `_shared/notebook`: land one, rebase the other. **phase-shared-A** next: disjoint (`stepStore.ts` is 2a's alone). |
| **WORKSPACE-A 2b** (held) | `progress.ts`, `lib/projects.ts`, nine reporter deletions | Deletes reporters in C1 files (`ResearchStep.tsx:136`, `:200`, `ScriptStep.tsx:223`, `:297`, `useFrames.ts:887`) | **WORKSPACE-B 1 lands first.** 2b is held anyway, and WORKSPACE-B's `Output.state` never reads a step word (`critic-2026-10-07.md:482-498`). | `lib/projects.ts` with DATA-A stage 2 and SHELF-A |
| **DATA-A 1** | new `lib/schema.ts`, `lib/themes.ts`, `lib/useThemes.ts`, `lib/useAssets.ts`, `lib/board/sources/proof.ts`, `app/library/LibraryAtelier.tsx`, new probe | none | none | **Hard: foundry-forge-B 1** writes `lib/themes.ts` (`critic-2026-10-07.md:956`). Serial: either first, the other rebases. |
| **SIGNAL-A 1** | new `components/ui/signal/keymap.ts`, `Keycaps.tsx`, `index.ts`, `README.md`, `lib/board/keys.ts`, `app/foundry/{keyGuard,CullGrid,ExtractBoard,FoundryView}.ts(x)`, probes, census | none | none (census only) | **Hard: foundry-forge-A 2** writes `app/foundry/FoundryView.tsx` (`critic-2026-10-07.md:957`). Serial. foundry-forge-B 1 writes `StylesShelf.tsx`, which this stage does not touch. |
| **UI-SHELL-A 1** | `components/ui/tokens.ts`, two new probes | none edited. Ratchet 7 *counts* `SourceChip.tsx:31` and nine more phase files. | Soft: WORKSPACE-B edits `LibraryShelves.tsx`. If it hand-wires `TALLY_TONE` rather than using `<Tally>`, ratchet 7 rises. Tell its builder. | none |
| **KIT-B 1** | `app/kit/contrast.ts`, `Identity.tsx`, four contrast probes, new probe | none | none | none (`app/kit` is in the census's kit zone, `kit-census.mts:74`, `:363-365`) |
| **UCP-B** | new `pipeline/cx-screens.mjs`, `pipeline/cx-capture.mjs`, `tests/live/*`, a fixture route | none | **Hard: `pipeline/cx-capture.mjs`.** WORKSPACE-B 1 adds `studio-outputs` to `SCREENS` (`critic-2026-10-07.md:434-435`). **WORKSPACE-B 1 lands first**; UCP-B extracts after. | after KIT-B 1 (imports `contrastOver`) |
| **SIGNAL-B** | `components/ui/signal/{Tally,StackBar,index}`, new `useCountFilter.ts`, `README.md`, `BroadcastWeek.tsx`, a `calendar` cx screen, probe, census | none | soft: `SCREENS` (WORKSPACE-B adds `studio-outputs`) | **Hard: UI-SHELL-A stage 2** rewrites the same three parts, so UI-SHELL-A 2 lands first. Soft with UCP-B on `SCREENS`. |
| **UI-SHELL-B index** (if approved) | new `components/ui/shell/palette.ts`, probe, census | none | none | none |

**Which must land first, against WORKSPACE-B stage 1 (C6).**
- WORKSPACE-B 1 reads the step contracts (the reason codes) and replaces the shelf's mocked tally.
- The stages here that change those are 2a, 2b and SHELF-A:
  1. **2a, either side of WORKSPACE-B 1.** It changes no frames or score verdict, so no code WORKSPACE-B reads.
  2. **WORKSPACE-B 1 before 2b.** 2b is held for S1. It would also make `progress` the input
     WORKSPACE-B must never recompute (`critic-2026-10-07.md:489-490`). Building WORKSPACE-B first
     keeps its `Output.state` artifact-only by construction.
  3. **WORKSPACE-B 1 before SHELF-A.** SHELF-A's per-step facts should be derived from
     WORKSPACE-B's `outputs.ts`, not written beside them.
- Against AIO-A 4a and probe-frame-data-B 1: no stage here shares a file with either.

**One shared seam, three cards.** WORKSPACE-A 2b, DATA-B and SHELF-A each planned their own cut into
`saveStep`:
- 2b: a recompute after commit;
- DATA-B: an emit after commit;
- SHELF-A: a merge inside the transaction.

None of the three covers `patchStep`. Landing `onSaveCommitted` once, in 2a, turns the first two into
subscribers. SHELF-A's in-transaction merge is the one that cannot be a subscriber, and it is the
weakest of the three (above).

### Operator decisions

#### The seven in `README.md:134-141`

| Decision | Touched by the stages here? |
| --- | --- |
| `research-run-engine-B`: WebSearch/WebFetch for research | No |
| `AUP-B` lock-instead-of-wipe | No (declined, `README.md:242`). DATA-A's theme removal is a voluntary delete, not sign-out. It is ask S2 below. |
| `SLP-B` dev-only `?scenario=` door | No. Every case above seeds through `saveStep`, `saveRecord` or fake-indexeddb, as `step-verdicts` already does. UCP-B's Ghost fixture is a dev-only **route**, not a scenario door that writes step records. |
| `AUP-A` creator data on a server | No. DATA-B's cross-tab channel stays on one machine. |
| **`UI-SHELL-A` stage 3** | **Yes: the shell chain's own decision.** Framed as ask S4 below. Stages 1, 2 and 4 do not need it (`07-design-system.md:36`). |
| `video-clip-pipeline-B` (Motion) | Already decided (`a9d5975`), but it has a consequence here. Motion is the sixth step (`lib/projects.ts:43`), so "delivered" needs Motion signed off, and Motion has no verdict module. See S1c. |
| `library-styles-atelier-A` `LOCK_PROBLEMS` | No. DATA-A's `patchTheme` keeps `ratchetBlocker` as its guard; it reads the lock and does not change its rule. |

Also open, though not on the list: **WORKSPACE-A's contract, "a verdict says review, never done"**
(`README.md:104-106`). It is S1 below, broken into what each half would actually change.

#### New asks found by this pass (asks, not decisions)

- **S1 · Ratify WORKSPACE-A's projection before 2b switches the shelf over.** Four parts, each with
  its own consequence:
  - **S1a · Stored `done` with no sign-off.** Reporters have written `done` for years (12 of the 16
    can). After the switch a verdict never says it.
    - (a) Downgrade to `review` on the first recompute. The shelf shows fewer locks on existing
      projects, and the commit must say so.
    - (b) Migrate once: `progress[x] === "done"` without `signedOff[x]` becomes
      `signedOff[x] = updatedAt` before the first recompute. Locks are kept; nobody actually signed
      them.
    - (c) Recompute skips a cell whose stored word is `done` until the step is reopened. No visible
      change, but two sources of truth persist.
  - **S1b · Writing `empty`.**
    - (a) A `null` verdict writes `empty`, so a cleared step becomes honest (card case 3). This
      widens the only door into `progress` (`lib/projects.ts:661-665`).
    - (b) A `null` writes nothing, as today. Clear keeps its stale word, and case 3 is dropped.
  - **S1c · Applicability, and Motion.**
    - (a) `doneCount` takes its denominator from an applicability table in `lib/`. `lib/` cannot
      import `app/_phases`, so the table is duplicated.
    - (b) `doneCount` takes the step modules as a parameter. Every caller changes.
    - In both cases, also answer: does Motion apply to every discipline? Today "delivered" needs a
      sixth signed-off step that has no verdict.
  - **S1d · Ads.**
    - (a) Leave ads off the projection (`covers`, 2a). Its six reporters stay.
    - (b) Write ads verdict modules first. That is a new session, and 2b waits for it.
- **S2 · A locked theme that projects reference: delete or archive?** DATA-A's "decision to ratify"
  (`01-studio-hub.md:149`).
  - (a) Keep delete. Projects fall to `miss: "deleted"` and render in `PRESETS[0]`
    (`useFrames.ts:181`). This is today's behaviour, and DATA-A stage 1 builds under it.
  - (b) Archive. The theme is hidden from the wall with its bytes kept, so `projectStyle` still
    resolves. This adds a theme state, and every list of themes has to learn it.
  - (c) Refuse. Delete is blocked while any project references the theme, and the confirm names
    them. This is the smallest change, but a user cannot clear the wall without first editing
    projects.
- **S3 · Start the shell palette now?** UI-SHELL-B is gated `direction`, and the narrow-screen half
  of its reason closed in `e503bbd`.
  - (a) Not yet. Revisit after SIGNAL-A stage 2, when the verbs exist.
  - (b) Yes, index only (above). No UI, no global key, no risk to the shell.
  - (c) Yes, the full card. Ctrl/⌘K becomes the app's one global chord, claimed before SIGNAL-A's
    registry exists, so its verbs are hand registrations that SIGNAL-A later replaces.
- **S4 · UI-SHELL-A stage 3: one structure each for `DeckCard`/`DeckCardAlmanac` and the
  StudioFrame bar** (`README.md:139`; `StudioFrame.tsx:107` vs `:169`). Not decided here.
  - (a) **Keep the Almanac structures.** Delete `DeckCard`'s Obsidian body and the Obsidian nav.
    The nine Obsidian routes change shape, which is a visible redesign of the everyday shell.
  - (b) **Keep the Obsidian structures.** Delete `DeckCardAlmanac.tsx` (160 lines) and the
    `:107` branch. `/kit` and the Almanac surfaces lose their atlas chrome. This reverses the
    direction "land the Almanac one surface at a time" (`tokens.ts:219-222`).
  - (c) **Defer.** Both stay, and stages 2 and 4 still land. The `useWorld()` ratchet then stops at
    Deck, DeckCard and StudioFrame instead of reaching 1 (Modal), and a third world would still
    cost two structures.
- **S5 · Is the Ghost's dashed outline held to the non-text floor?** The 2026-09 fix lifted it from
  ≈1.33:1 to ≈2.12:1 (KIT-B case 2), which is still under 3:1. The repo law records it as fixed,
  because it was found by photograph and is now visible by eye.
  - (a) **Hold it to 3:1.** Raise the effective alpha to ≈0.34. The placeholder reads closer to a
    real row, which is the thing the Ghost must not be mistaken for.
  - (b) **Exempt it as decoration.** Its `sr-only` label carries the meaning. UCP-B's rule 4 then
    needs a named exception for the Ghost's dashed edge.
  - (c) **Record it in UCP-B's baseline** as a known finding that may only improve. Nothing changes
    now, and the number stays visible.

### Ordered recommendation

**No step 0 is needed.** The base is green on every gate this work meets
([Gate state](#gate-state-of-the-base)).

1. **phase-shared-A: the writers onto defs, and the ratchet.** It closes a live data-loss path
   (`useBeatPicks.ts:68-74`) and stops the raw-call population from growing.
2. **SIGNAL-A stage 1**, in parallel with 1. It fixes two key defects that are live now (the open
   combobox and checkbox Enter in the cull), and it is the shell chain's root. It is serial with
   foundry-forge-A stage 2 (`FoundryView.tsx`).
3. **KIT-B stage 1**, beside 1 and 2. It is the instrument UI-SHELL-A stage 2 and UCP-B both need,
   and it adds the first Ghost value probe.
4. **WORKSPACE-A stage 2a**, beside any of the above. It makes the verdicts true and lands the one
   seam.
5. **UI-SHELL-A stage 1.** No visible change, plus three ratchets.
6. **DATA-A stage 1**, serial with foundry-forge-B stage 1 (`lib/themes.ts`).
7. **UCP-B**, after 3 and after WORKSPACE-B stage 1.
8. **UI-SHELL-A stage 2**, after 3 and 5. Then **SIGNAL-B**.
9. **WORKSPACE-A stage 2b**, after S1 and after WORKSPACE-B stage 1. Then **DATA-B**, re-scoped
   onto `onSaveCommitted`, and **SHELF-A**, re-specified over WORKSPACE-B's collectors.
10. **phase-shared-A lineage**, after frames-phase-A's shot plates and script-phase-A s2c.
11. **UI-SHELL-B**, per S3. **UI-SHELL-A stage 3**, per S4.

**Two to run in parallel next: phase-shared-A (writers + ratchet) and SIGNAL-A stage 1.**
- There is one per chain, and their write sets are disjoint: `app/_phases/{research/beats,score,cut,script/trailer}`
  against `components/ui/signal`, `lib/board/keys.ts` and four `app/foundry` files.
- Neither edits a file C1 closing changed, nor any file of AIO-A 4a or WORKSPACE-B stage 1.
- Only their `census.json` merges are serial.
- Both shapes are decided.
- Both fix defects that are live on `main` today.

If a third slot exists, KIT-B stage 1 is disjoint from both. It touches only `app/kit` and
`tests/golden-path`.

---

## Proposed catalogue edits (for the README owner; not applied here)

| ID | Proposed status |
| --- | --- |
| `phase-shared-A` | `partial d27f335 - stage 1 + 3 data-loss conversions (cases 1,3,4; case 2 via 6ab78b7); next: remaining writers onto defs + literal-key ratchet (critic-2026-10-07-step-record-shell); lineage after frames-phase-A shot plates and script-phase-A s2c` |
| `WORKSPACE-A` | `partial b35a803 - stage 1 verdict modules; next: 2a true verdicts (research reads the active notebook; ads/motion uncovered) + onSaveCommitted seam; 2b switch-over held for S1a-d (done/empty/applicability/ads)` |
| `SHELF-A` | `open - held behind WORKSPACE-A 2b; per-step digests merge into WORKSPACE-B outputs.ts; re-specify as a derived cache` |
| `DATA-A` | `open - next: stage 1 patchTheme + one-tx removeTheme + schema declaration probe; archive-not-delete is ask S2; serial with foundry-forge-B 1 (lib/themes.ts)` |
| `DATA-B` | `open - held behind WORKSPACE-A 2b; re-scope onto onSaveCommitted (getProject now 19 sites; useRecord name taken)` |
| `SIGNAL-A` | `open - next: stage 1 keymap kernel, Board + cull on it (Ctrl+K/repeat already fixed by a5add96)` |
| `UI-SHELL-B` | `open - held for the operator (S3): narrow-screen nav landed e503bbd; verbs need SIGNAL-A` |
| `UI-SHELL-A` | `open - next: stage 1 ROLE_TOKENS (zero pixels) + three ratchets; stage 2 after KIT-B 1; stage 3 operator (S4); acceptance 4 met by e098071` |
| `KIT-B` | `open - next: stage 1 alpha-aware contrast.ts, owns the composite (4 probes import it); Worlds face after UI-SHELL-A 1; Ghost measures 2.12:1 (ask S5)` |
| `UCP-B` | `open - next after KIT-B 1 and WORKSPACE-B 1: cx-screens.mjs + live measurer on projects + Ghost control` |
| `SIGNAL-B` | `open - next after UI-SHELL-A stage 2: zero rule + select door on Tally, BroadcastWeek adoption` |

Also:
- **`README.md:55-56`** can say that phase-shared-A stage 1 and WORKSPACE-A stage 1 have landed,
  and that SHELF-A and DATA-B share one post-commit seam with WORKSPACE-A 2b.
- **`README.md:139`** stays as it is: UI-SHELL-A stage 3 is S4 above.
- **Five write-set corrections:**
  - WORKSPACE-A stage 2: "deleting `usePhaseReport.ts` plus its 8 call sites" becomes "deleting the
    nine reporters a module covers; `usePhaseReport.ts` stays for Motion and ads".
  - SHELF-A: its digest hook must cover `patchStep`, not only `saveStep`.
  - phase-shared-A stage 4: the ratchet goes in its own probe, not in
    `shared-notebook-contracts.probe.spec.ts` (C1's).
  - UI-SHELL-A: the stage 1 pilot conversion moves to stage 2, after KIT-B stage 1.
  - SIGNAL-B: case 5 already holds; restate it as a guard.
- **production-script-probes-B stage 1** (from the earlier passes): there are seven private
  dispatcher copies, now that `tests/golden-path/_c1-harness.ts` exists.
- **CLAUDE.md's "17 named screens"** is 22 at `84b6706`. That is a hand-written section, so this
  note goes to its owner too.
