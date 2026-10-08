# Moonshot backlog · 2026-10-05

**Status: PROPOSALS. Nothing here is adopted or built.** Each card is a direction for one future
session to pick up. A card's premise was verified against the tree on 2026-10-05 with
`path:line` anchors. The builder still **re-verifies the premise first**: the tree moves, and an
anchor older than a few days is a hypothesis.

How it was made: `/scan-sweep`, ideas-only, with a *moonshot-architect* reading. That is the
challenge mode's two slots pushed to maximum ambition: one **architecture** move and one
**experience/capability** leap per context. Contexts with no user surface got a second
architecture card on a different seam. All 36 contexts in `context-map.json` were covered, with 2
cards each, giving **72 cards**. Nine read-only scouts each covered one group. No critic pass ran,
so treat the scores (effort / impact / risk) as the scout's estimate, not a graded verdict.

| File | Contexts |
| --- | --- |
| [01-studio-hub.md](01-studio-hub.md) | project-shelf · studio-data-layer · studio-logic-probes · studio-workspace |
| [02-research-script.md](02-research-script.md) | research-run-engine · research-scope-board · script-phase · trailer-script |
| [03-frames-score-cut.md](03-frames-score-cut.md) | frames-phase · frames-score-cut · phase-shared |
| [04-pipeline-probes-video.md](04-pipeline-probes-video.md) | production-script-probes · imaging-music-probes · video-clip-pipeline |
| [05-asset-management.md](05-asset-management.md) | foundry-curation · foundry-engine · library-assets-audio · library-styles-atelier · library-view |
| [06-imaging-music.md](06-imaging-music.md) | imaging-service · character-consistency-testing · vlm-frame-annotation · music-service |
| [07-design-system.md](07-design-system.md) | ui-shell · signal-vocabulary · kit-specimen-route · ui-component-probes |
| [08-app-infrastructure.md](08-app-infrastructure.md) | ai-orchestration · auth-persistence · cli-infrastructure-probes |
| [09-content-pipeline.md](09-content-pipeline.md) | text-engine · foundry-forge · foundry-dojo · probe-frame-data · pipeline-scripts · data-asset-probes |

Every card has the same shape: **Summary** · **Premise (verified)** · **The move** · **Why it is a
moonshot** · **Acceptance** (3-8 cases to write as failing tests first) · **Write set** ·
**Risks & rollback** · **First session dispatch** · a runner-up idea.

---

## Read this first: where independent scouts converged

The scouts read different contexts and did not see each other's output. When two or three of them
arrived at the **same move** from different files, that is the strongest signal in this document.
Dispatch **one** card per cluster, not all of them. They share a write set and will collide.

| # | The move | Cards that converged | Dispatch |
| --- | --- | --- | --- |
| C1 | **Your own notebook, downstream.** Every consumer after Step 1 (the board, scope maths, the Script gate, recalibrate, Frames figure binding) reads the 2026-08-11 Bitcoin fixture through module constants. A creator's live notebook dead-ends on the card that produced it. | `research-scope-board-A` ≡ `phase-shared-B` | `research-scope-board-A` (more detailed staging). Steal `phase-shared-B`'s stage-4 Frames binding cases. **Landed:** stages 1-4 (`f2d82b8`) and the C1 closing stage (critic-2026-10-07-script-chain), which carries `phase-shared-B`'s Frames binding, evidence log and modal, and source chip, and the C1 regressions the critic found (board triage, Step 2 opt-in, recalibrate conclusions, follow-ups, the Script race). Decided by the App Master on 2026-10-07: build under the landed replay contract (no record, a cleared record and a malformed one all resolve to the replay; a malformed one is never silent); a reasoned notebook gates Script and Frames, disclosed by the source chip; `LiveResult` carries the notebook and evidence-log pills on a reasoned-only project. |
| C2 | **AI turns as durable, server-owned jobs.** A minutes-long paid turn is one held-open request. The result lives only in a browser tab, a reload marks it `interrupted`, and Abort does not kill the engine process. | `AIO-A` ≡ `text-engine-A` ≡ `research-run-engine-A` | `AIO-A`. **Landed:** stages 1-4 (`67beb3e`): the kernel and signal plumbing, `text-engine-A`'s settle hook, and `research-run-engine-A` as the first adopter (research is a turn kind, server and client). Milestone 1 closes here (critic-2026-10-07-m1-tails, T2): the poster moves to a later milestone, after the operator answers T1 and after `GET /api/spend`; export onto turns is declined (T3); T1 is answered by the operator on 2026-10-07 (ask 61a88b35, 'Yes, keep what is paid for'): the poster becomes a server work kind with `cancellable:false`, so a reload keeps the image it has already paid for, built after `GET /api/spend` and serial with script-phase-B stage 3; the cross-device bell (AUP-A) and the hosted ledger and lease (local now, hosted later) are held. |
| C3 | **One spend meter for every vendor.** Imaging has holds. Music checks the budget, then books, with no hold. Cloud text has no ceiling at all. All three ledgers are per-process. | `IMG-A` ≡ `imaging-music-probes-A` | `IMG-A` (adds a durable cross-process store). Take `imaging-music-probes-A`'s conformance kit as its test suite. **Landed:** 3a (`42918cc` async store and meter, `717f366` file spend store, `2aaad00` one spend window per machine), after the operator's 'Local now, hosted later' (ask c4c3335e, 2026-10-07). `GET /api/spend` landed `86c0ab1` (census `bbb0f28`), and C3 closes for milestone 1: IMG-A landed, and imaging-music-probes-A is merged into IMG-A at `4eb2c41`. **Residue:** the hosted (GCS) store is held by 'Local now, hosted later'; `npm run verify` unproven on main (worktree junction), so its exits-0 measure is open as for C1 and C2; `MUSIC_BUDGET_FLOOR_SECONDS` is missing from `.env.example`. |
| C4 | **Score takes persist in the sound store.** This closes the open ADR `2026-08-29-score-take-persistence` with a fourth option: bytes in `lib/sound`, a `takeId` pointer on the spot. | `frames-score-cut-A` ≡ `MUSIC-B` | `MUSIC-B` (adds section revision and adopting lab takes). `frames-score-cut-A` adds the Cut-side `take-fit` row. |
| C5 | **Sign-out cannot destroy the only copy.** One click wipes every project, step, theme and upload. IndexedDB is the only copy and there is no export. | `SHELF-B` ≡ `AUP-B` | `AUP-B`, archive + dry-run part first (needs no policy change). The lock-instead-of-wipe half is `policy-loosen` and needs an operator call. |
| C6 | **Outputs is this project's real reel.** The studio's Outputs panel shows the same mocked Glass Harbor library for every project. | `WORKSPACE-B` ≡ `library-view-A` | `WORKSPACE-B`. `library-view-A` is merged into it: Board-style lazy adapters, keep-on-shelf (a byte copy into a content-addressed `lib/assets` upload row, the next stage) and the fixture deletion. **Landed `ba6acd1`** (stage 1 `31a211d`; stage 2 `70b55d8` and `ba6acd1`), and C6 closes for milestone 1 (critic-2026-10-07-m1-tails, T5): frames and score outputs from this project's own records, the closed tally read on mount, the fixture import gone from StudioView and LibraryShelves, keep-on-shelf (a byte copy into a content-addressed `lib/assets` upload row), and a dangling `activeTakeId` named `take-gone` in Outputs (T4); the App Master's decisions are on the WORKSPACE-B card. Residue: not seen by eye (cx-capture skipped, no project on the build machine held a ready plate); the same bytes kept from a second project overwrite the shared row's `meta.projectId` and `outputId`. Declined: demo plane. Moved: Motion outputs (after V2), script outputs (after script-phase-A s2a), ads outputs (after S1d), cut-derived stamp (after WORKSPACE-A 2a). |
| C7 | **Proven Foundry style → Library theme.** Four human-proven styles cannot reach a project. "Promote to Library" is in the Foundry README and unbuilt. | `foundry-forge-B` ≡ `library-view-B` | `foundry-forge-B`. `library-view-B` is merged into it: the preset-rail lane joins the palette deep-read. **Landed `e775376`** (stage 1 `b2b6057`; seeding `818772c`; `listThemes` `e775376`), and C7 closes for milestone 1: adopt on a proven style makes a draft theme from one kept plate and seeds the style's kept text-lane plates as pending proofs (operator, ask 7ab59516), and the measure's 'a project's Library lists it' reads as `listThemes` lists the adopted draft, asserted in the foundry-adopt probe (T7); the App Master's decisions are on the foundry-forge-B card. The PresetRail Foundry lane is declined (critic-2026-10-07-m1-tails, T6); the palette editor is held (critic ask 8); `proofsLeftOut` is not shown on the shelf. |
| C8 | **The grader is calibrated against the human.** Measured on `ledger.json` (n=87): craft ranks kept vs rejected **backwards** (AUC 0.29), style is near chance (0.58), and the text veto has never fired. The meters under every cull tile steer the curator the wrong way. | `foundry-forge-A` ≡ `foundry-curation-B` | `foundry-forge-A` first (measurement + versioned calibration). `foundry-curation-B` (pre-deciding the rest) only once calibration says a field predicts. |
| C9 | **The foundry catalogue loses writes.** Five writers read-modify-write `styles.json` / `ledger.json` / `training-ledger.json` with no lock, and the landed commit token is checked *outside* any fence. | `foundry-engine-A` (the fix) ≡ `data-asset-probes-A` (the harness that proves it) | Harness first: `data-asset-probes-A` case 4 goes red. Then `foundry-engine-A`. |
| C10 | **Run the real reasoning routes offline.** No lane has ever run `/api/recalibrate` / `/api/research` / `/api/frames` end-to-end; their refusal guards have 0 probe hits. | `CIP-A` (fake `claude` on PATH) ≡ `pipeline-scripts-B` (replay provider + cassettes) · related: `production-script-probes-B` | `CIP-A`: no production injection point, so it is the lowest risk. **Landed** (`2059833`), ahead of C2 stage 2 as the safety net for its refactor. `pipeline-scripts-B` is merged into it; residue: the live-lane PATH shim, after AIO-A 4b. |
| C11 | **Truth by construction.** Generated shots state their camera in the prompt, so that becomes a ground-truth sidecar. Today's truth set is n=2. | `probe-frame-data-B` ≡ the truth-minting half of `VLM-B` | `probe-frame-data-B`, then `VLM-B`'s certificates on top. |

Related but **not** duplicates. They share seams, so sequence them rather than running them in
parallel:
- `phase-shared-A` (step-record registry; stage 1 landed) → `WORKSPACE-A` (progress as a projection
  of records; stage 1 landed) → `SHELF-A` (digest read model) / `DATA-B` (change feed). SHELF-A and
  DATA-B share one post-commit seam with WORKSPACE-A 2b.
- `script-phase-A` (ScriptDraft) no longer waits on C1 stage 1 (landed). `script-phase-B` (Compose
  from your notebook) waits on `script-phase-A` s2b, not on C1 or on AIO-A 4a (landed).
- `frames-phase-A` (PictureUnit; stage 1 landed) → `frames-score-cut-B` (compile an animatic MP4;
  the kernel has landed) → `video-clip-pipeline-B` (the Motion step). The chain's next link is
  `frames-phase-A` stage 2, not the animatic.
- `UI-SHELL-A` (roles, not worlds) ← reviewed with `KIT-B` (specimens per world) and guarded by
  `UCP-B` (legibility lane).
- `SIGNAL-A` (one keymap) → `UI-SHELL-B` (shell palette reads its verbs).

---

## Quick wins found on the way (S-sized, verified, not built)

These are small, concrete defects the scouts tripped over. The coordinator re-checked each one
against the tree on 2026-10-05. Each fits one stabilize-sized session (`/scan-sweep --one <ctx>`
or `/explorer`). They need no direction call.

| # | Defect | Anchor | Context |
| --- | --- | --- | --- |
| Q1 | Recalibrate POST sends no `accessHeader()`. With `IMAGING_ACCESS_SECRET` set, the real run gets a 401 and silently stages "Simulated instead". | `app/_phases/script/useVersions.ts:199-202` | script-phase / ai-orchestration |
| Q2 | `vendorFetch` clears its timeout once the headers arrive, so a stalled body read on every Sound-lab render (`composeDetailed`, `generateSfx`) has no deadline. `composeCall` already fixed and documented this exact defect. | `lib/music/elevenlabs.ts:276-302` vs `:225-232` | music-service |
| Q3 | The foundry cull's key `switch` checks neither `ctrlKey` nor `repeat`, so Ctrl+K sets a keep verdict and a held key decides many tiles. | `app/foundry/CullGrid.tsx:134-172` | foundry-curation |
| Q4 | `gate-regression.mts` counts failures and prints "REGRESSION FAILURE(S)" but never sets an exit code, and nothing wires it in. | `pipeline/gate-regression.mts:24-34` | pipeline-scripts |
| Q5 | CI's blocking job skips `check:narration`, `check:clips` and `check:style-refs`, all of which `npm run verify` runs. Meanwhile `.githooks/pre-push` claims the two sets are identical. | `.github/workflows/gates.yml:265-331`, `.githooks/pre-push:4-7` | pipeline-scripts (or do `pipeline-scripts-A`) |
| Q6 | Gemini key in a URL query string. | `pipeline/foundry/dojo_judge.py:59` | foundry-dojo |
| Q7 | Hard-coded home-directory paths of another machine (`C:\Users\kazda\…`). They are non-portable on this checkout (`mkdol`). | `pipeline/video/leonardo_reference.py:52`, `pipeline/vlm-probe/probe.py:33`, `pipeline/vlm-probe/guard.py:41`, `pipeline/vlm-probe/clips/{chain,ref2va}/lane.json:10` | vlm / video |
| Q8 | `Modal` stamps `data-world` on its portal only for Almanac. Under `WorldRoot world="obsidian"`, kit rules (`.k-confirm`, `.k-acts`) resolve outside their scope. This is the same class as the toast-scope fix ffaf025. | `components/ui/Modal.tsx:231-235` (almanac branch) vs `:266` (default branch, no `data-world`) | ui-shell |

**All eight landed 2026-10-05**, each with an instrument that was red before its fix:
Q1 `b74599a` · Q2 `528fd1c` · Q3 `a5add96` (all five foundry key handlers, not only the cull) ·
Q4 `e052187` · Q5 `3d5bb19` · Q6 `9d97950` · Q7 `be6f800` · Q8 `e098071` (latent: no Modal opens
under an Obsidian-kit root yet). Found while doing them: a test fixture run under a pre-push hook
inherited `GIT_DIR` and turned this checkout bare. Fixed in `3c43ae7` (article fixture and landing
code) and `7572284` (the hook no longer hands `GIT_DIR` to `verify`).

**Wave 1 landed and pushed 2026-10-05** (origin `6892a4d`, all 17 registry gates green): see
the catalogue Status column. Found by the builders: the imaging router settled a hold on a billed
failure and then rerouted with NO hold (dev chains only). Fixed in IMG-A stage 2: `walk` takes a
new hold before it calls the next vendor (`lib/imaging/router.ts:392-394`). Open for a later card: `npx tsx` gate scripts fetch tsx from the network in CI (tsx is not a
devDependency); `.ai/manifest.yaml:112-120` still describes the old 8-step verify chain.

**Wave 2 landed and pushed 2026-10-05** (origin `4124aba`, 17 registry gates green, 1147 probes).
Open from it: Score's two hand-rolled `<audio>` should move onto kit `Player` (census gap, ratchet
raised once); `app/kit/census.json` is a committed derived file, so every session whose commit
changes imports must re-run `npx tsx pipeline/kit-census.mts` (the gate says so).

**Wave 3 landed and pushed 2026-10-06** (origin `a9d5975`, 17 registry gates green, 1242 probes).
Operator decisions taken: the retrieval rung ships OFF behind `TEXT_RETRIEVE`; Motion is restored
as the sixth step, knowingly reversing the 2026-08-14 retirement (`80ac10c`). Open from it: a
verdict can say `review` but never `done` (WORKSPACE-A's contract - ratify before stage 2 switches
the shelf over); Motion rows draw as empty boxes until a frame has a plate; `library-sound-migration`
probe runs close to its 30s ceiling under parallel load.

**Lane 08 (app infrastructure) worked 2026-10-06** (local main `9fcc7e5`, not pushed). Operator
decisions: a recalibrate or scene-direction turn keeps running when the creator leaves the step
(explicit stop kills the engine); AUP-A stage 1 only - no spend attribution, no vault; AUP-B dialog
only - an involuntary session end still wipes. Capabilities are now the server's answer
(`/api/capabilities`, `useCapabilities`), so a control is never visible-and-503 by posture or key.

## Map drift the scouts reported (operator's call; this session ran no scan)

- `project-shelf` still lists `app/_projects/ProjectsMatrix.tsx` (gone). The live shelf
  (`RaceSheet`, `shelf`, `useShelf`, `surface`, `synthetic`, `ShelfHeader`) is unmapped.
- `signal-vocabulary` lists `components/ui/signal/Tally.tsx` **twice**. That is the dup-in-one
  ingest bug CLAUDE.md describes, and it lives in the database, so a scan will not fix it.
- `frames-score-cut` lists only `cut/CutTimeline.tsx`, while `app/_phases/cut/` holds 18 files.
  `frames/renderPlan.ts` is in no context.
- `music-service` description still says "/playground provides four benches". It is now the
  three-module Sound lab over `lib/sound/*`, which is unmapped.
- `video-clip-pipeline` lists `pipeline/video/flux_still.py`, which does not exist (stale).
- `probe-frame-data`'s 14 manifests are gitignored (`.gitignore:102-104`), so no clone has them.
  `probe-frame-data-A` addresses this.
- `research-scope-board` and `kit-specimen-route` have no row in `.ai/registry-map.json`.

## Decisions only the operator can make

Cards gated `policy-loosen`, `direction` outside today's scope, or `irreversible` are not
something a session should start on its own. The ones that need a yes first:

- `research-run-engine-B`: give the research engine `WebSearch,WebFetch` (prompt-injection surface).
- `AUP-B` lock-instead-of-wipe on an involuntary session end (resident data on a shared machine).
- `SLP-B`: dev-only `?scenario=` door that writes step records (loosens the harness doctrine).
- `AUP-A`: creator data on a server (the vault). This is the "no backend" posture change.
- `UI-SHELL-A` stage 3: pick one structure each for `DeckCard`/`DeckCardAlmanac` and the StudioFrame bar.
- `video-clip-pipeline-B`: a sixth studio phase, `motion`.
- `library-styles-atelier-A`: the `LOCK_PROBLEMS` number (how many trial problems a lock needs).

---

## Suggested order

1. **Wave 0, quick wins.** Q1-Q8. One or two sessions. Cheap, and Q1 and Q2 are user-facing.
2. **Wave 1, foundations that unblock the most.** Each card is safe to run in parallel with the
   others in this wave (disjoint write sets):
   `research-scope-board-A` stage 1 (C1) · `CIP-A` (C10) · `IMG-A` stage 1 (C3) ·
   `pipeline-scripts-A` · `data-asset-probes-A` (C9 harness) · `KIT-A`.
3. **Wave 2, the product spine.** `AIO-A` (C2) · `script-phase-A` · `MUSIC-B` (C4) · `AUP-B`
   archive half (C5) · `phase-shared-A` · `foundry-engine-A` · `foundry-forge-A` (C8).
4. **Wave 3, the leaps.** `script-phase-B` (compose from your own notebook) · `frames-phase-A` ·
   `frames-score-cut-B` (animatic export) · `WORKSPACE-A` · `research-run-engine-B` (after its
   policy call) · `video-clip-pipeline-B`.

> `lib/jobs.tsx` and `components/ui/NotificationBell.tsx` had uncommitted edits from another
> session when this backlog was written. `AIO-A` writes `lib/jobs.tsx`, so check the tree first.

## Dispatching a card

Hand a fresh session this, with the card id filled in:

```
Read docs/concepts/moonshots-2026-10-05/README.md, then card <ID> in <file>.
Re-verify every Premise anchor against the current tree first; if a premise is false, stop and
report which one. Then follow the card's "First session dispatch": write its Acceptance cases as
failing tests, build the first stage only, run the gates it names with asserted exit codes, and
commit on the current branch (pathspec only, never push). When done, set the card's Status in
the README catalogue to `landed <sha>` or `partial <what is left>`.
```

Cards gated `architecture` / `direction` / `contract`: the dispatch itself is the approval for
the **first stage**. Later stages of an XL card each get their own session.

## Catalogue

Status values: `open` · `dispatched <date>` · `landed <sha>` · `partial <note>` · `declined <reason>`.
Scores are effort / impact / risk, each out of 10, as the scout estimated them. Cluster = the
convergence table above.

| ID | Card | Context | Size | E/I/R | Gate | Cluster | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SHELF-A` | [Project digest read model: the shelf can say what is inside a project](01-studio-hub.md) | project-shelf | L | 6/8/4 | architecture |  | open - held behind WORKSPACE-A 2b; per-step digests merge into WORKSPACE-B outputs.ts; re-specify as a derived cache |
| `SHELF-B` | [Own your work: export, import, duplicate, and a sign-out that does not destroy](01-studio-hub.md) | project-shelf | L | 7/9/5 | direction | C5 | open |
| `DATA-A` | [One declared relation schema: cascades, blast radius, eviction and patches derived from it](01-studio-hub.md) | studio-data-layer | L | 7/8/6 | architecture |  | open - next: stage 1 patchTheme + one-tx removeTheme + schema declaration probe; archive-not-delete is ask S2; serial with foundry-forge-B 1 (lib/themes.ts) |
| `DATA-B` | [A change feed under every hook: one cache, live across components and tabs](01-studio-hub.md) | studio-data-layer | L | 6/8/5 | architecture |  | open - held behind WORKSPACE-A 2b; re-scope onto onSaveCommitted (getProject now 19 sites; useRecord name taken) |
| `SLP-A` | [Mutation rung: every probe names the defect it guards, and a runner proves it goes red](01-studio-hub.md) | studio-logic-probes | M | 5/8/2 | none |  | open |
| `SLP-B` | [Scenario rung: product-written step scenarios so the live lane and cx-capture reach every state](01-studio-hub.md) | studio-logic-probes | L | 6/8/4 | policy-loosen |  | open |
| `WORKSPACE-A` | [Step contracts: progress becomes a projection of step records, not a mounted report](01-studio-hub.md) | studio-workspace | XL | 8/9/6 | contract |  | partial b35a803 - stage 1 verdict modules; next: 2a true verdicts (research reads the active notebook; ads/motion uncovered) + onSaveCommitted seam; 2b switch-over held for S1a-d (done/empty/applicability/ads) |
| `WORKSPACE-B` | [Outputs becomes this project's real reel, with provenance and keep-on-shelf](01-studio-hub.md) | studio-workspace | L | 6/8/4 | direction | C6 | landed `ba6acd1` - stage 1 (`9accab6`, `637b459`, `7999dce`, `31a211d`): frames and score outputs from this project's own records, the closed tally read on mount, the Glass Harbor fixture import removed from StudioView and LibraryShelves; stage 2 (`70b55d8`, `ba6acd1`): keep-on-shelf (a byte copy into a content-addressed `lib/assets` upload row) and `take-gone` for a dangling `activeTakeId` (T4, T5); residue: not seen by eye (cx-capture skipped, no ready plate on the build machine), and the same bytes kept from a second project overwrite the shared row's `meta.projectId` and `outputId`; declined: demo plane; moved: Motion outputs (after V2), script outputs (after script-phase-A s2a), ads outputs (after S1d), cut-derived stamp (after WORKSPACE-A 2a) |
| `research-run-engine-A` | [The real research run becomes a server-owned durable job with a run ledger](02-research-script.md) | research-run-engine | L | 7/9/6 | architecture | C2 | merged into AIO-A - landed 67beb3e (stage 4) |
| `research-run-engine-B` | [Researched, not reasoned: a search-capable research rung with source receipts and a real trace](02-research-script.md) | research-run-engine | XL | 8/9/7 | policy-loosen |  | partial 9e81447 - stages 1-2 behind TEXT_RETRIEVE (off); trace + chip open; no live run yet |
| `research-scope-board-A` | [The board deals any notebook: a per-project NotebookSource replaces the fixture constant](02-research-script.md) | research-scope-board | XL | 8/10/7 | contract | C1 | landed f2d82b8 - stages 1-4 (54c720d via ca6ddbe, 8b5a956, 6200683+c86dcda+736c2fd+2dc6b45, f2d82b8); closing stage landed: C1 closing stage (critic-2026-10-07-script-chain) |
| `research-scope-board-B` | [Follow-ups that land: a per-project revision ledger the creator applies, rejects and undoes](02-research-script.md) | research-scope-board | L | 7/8/5 | direction |  | open - next: stage 1 pure applyRevisions; stage 2 needs a scope-key call (A4: a new digest orphans the scope); stage 3 after AIO-A 4a/4b, IMG-A 3b and A6 |
| `script-phase-A` | [ScriptDraft: renders become per-project data, and the hand tables become derivations](02-research-script.md) | script-phase | L | 8/9/7 | contract |  | partial 1099deb - session 1 (draft, impactOf, editPlanSchema, derived ledgerFor); next: s2a draft record + Unknown.probe + derived ledger panel, s2b Step 2 reads the draft, s2c Frames/Board resolve the adopted draft render |
| `script-phase-B` | [Compose: the creator's own notebook in, three gated candidate renders out](02-research-script.md) | script-phase | XL | 9/10/7 | direction |  | partial 901198a - stages 1-2 (prompt, parseDraft, /api/script + gate); next: stage 3 compose as a turn kind + Candidates action (stage 4 merged in), after AIO-A 4a and script-phase-A s2b; asks A3, A5 |
| `trailer-script-A` | [The trailer cut as an edit log: spine + ordered ops, so edits survive recompose and undo is free](02-research-script.md) | trailer-script | L | 7/8/5 | architecture |  | open |
| `trailer-script-B` | [Notes and a model edit plan for the trailer: bring the stack-and-recalibrate loop to the cut, structure-checked before accept](02-research-script.md) | trailer-script | L | 8/8/6 | direction |  | open |
| `frames-phase-A` | [One picture-unit contract: trailer shots own plates and reach Score and Cut](03-frames-score-cut.md) | frames-phase | XL | 8/9/6 | architecture + direction |  | partial eff57ca - stage 1 (units, v2 record); trailer shot units are derived but never saved (useFrames.ts:407); next: stage 2 shot units persist + Score/Cut read units (after phase-shared-A writers; serial with script-phase-A s2c); stage 3 shot plates after phase-shared-A lineage (P1) |
| `frames-phase-B` | [The direction pass becomes a proposal: per-beat diff, keep my edits, stale plates marked](03-frames-score-cut.md) | frames-phase | L | 6/8/4 | direction |  | open |
| `frames-score-cut-A` | [Cue takes become sound-store rows: the music lane survives a reload, and agents can fill it](03-frames-score-cut.md) | frames-score-cut | L | 6/8/5 | contract (closes ADR 2026-08-29-score-take-persistence) | C4 | merged into MUSIC-B 6997be6 (Cut resolution); next: take-fit row + active take measured on bind, after frames-phase-A stage 2; case 6 (bindableTakes) declined - MUSIC-B runner-up auto-spot |
| `frames-score-cut-B` | [Compile the cut: an animatic MP4 from the derived timeline](03-frames-score-cut.md) | frames-score-cut | L | 7/8/5 | architecture + direction |  | partial 38bfc82 - CutDocument + kernel + /api/cut/export (plates only, no Chromium); 2a landed `d818535` (tests/golden-path/cut-export-render.probe.spec.ts proves the animatic exports offline); next: 2b Finish-line control after phase-shared-A writers; drawn layers P3 |
| `phase-shared-A` | [Step records get a registry: typed keys, a versioned read seam, atomic patch, lineage](03-frames-score-cut.md) | phase-shared | XL | 8/9/6 | architecture |  | partial d27f335 - stage 1 + 3 data-loss conversions (cases 1,3,4; case 2 via 6ab78b7); next: remaining writers onto defs + literal-key ratchet (critic-2026-10-07-step-record-shell); lineage after frames-phase-A shot plates and script-phase-A s2c |
| `phase-shared-B` | [Your own notebook, downstream: one resolver replaces the Bitcoin fixture everywhere](03-frames-score-cut.md) | phase-shared | XL | 8/9/6 | direction + architecture | C1 | merged into research-scope-board-A - C1 closing stage (critic-2026-10-07-script-chain): cases 1, 2, 5, 7 were met by research-scope-board-A; 3, 4, 6 are answered by its replay fallback (ask A1, case 13 makes a malformed record visible); the Frames binding, evidence log/modal and chip landed in the closing stage |
| `production-script-probes-A` | [Turn contracts: one server-owned schema, prompt and validator per TurnClass](04-pipeline-probes-video.md) | production-script-probes | L | 7/8/5 | contract |  | open |
| `production-script-probes-B` | [Studio journey lane: one hook harness, cross-step joins, derived hook coverage](04-pipeline-probes-video.md) | production-script-probes | L | 7/8/4 | architecture |  | open - next: stage 1 harness + hook coverage (no router seam); journey after C1 |
| `imaging-music-probes-A` | [One meter kernel for every vendor balance, proven by one conformance kit](04-pipeline-probes-video.md) | imaging-music-probes | XL | 8/8/5 | architecture | C3 | merged into IMG-A 4eb2c41; residue (shared settle line / error core) optional |
| `imaging-music-probes-B` | [Spend-invariant lane: one vendor boundary, generated adversarial traffic, global invariants](04-pipeline-probes-video.md) | imaging-music-probes | L | 6/8/3 | architecture |  | open |
| `video-clip-pipeline-A` | [Clip take ledger: N seeds, persisted verdicts, adoption with waivers](04-pipeline-probes-video.md) | video-clip-pipeline | L | 6/7/3 | architecture |  | open - next: stage 1 ledger.py + stdlib selftest + takes/regrade + build refusal; check:clips rule after V1 (two shipped palette failures) |
| `video-clip-pipeline-B` | [The Motion step: frames become clips, graded and adopted inside the studio](04-pipeline-probes-video.md) | video-clip-pipeline | XL | 9/9/7 | direction |  | partial a9d5975 - stage 1, Motion restored as step 6 (operator decision, reverses 80ac10c); stage 2 held for V2 (local runner vs the ads Leonardo queue 710240a); stage 4 after frames-phase-A stage 2 |
| `foundry-curation-A` | [One gate kernel: Cull, Extract and Dojo sit on the Board's source adapters](05-asset-management.md) | foundry-curation | L | 6/7/5 | architecture |  | open |
| `foundry-curation-B` | [Cull by exception: the grader is calibrated against you while you cull](05-asset-management.md) | foundry-curation | L | 7/8/6 | direction | C8 | open - held: no calibrated field (LOO 0.78 < 0.9); by-field slice moves to foundry-engine-B |
| `foundry-engine-A` | [The catalogue gets one write path: journaled, revisioned, honoured by Python and the Dojo loop](05-asset-management.md) | foundry-engine | L | 6/8/5 | architecture | C9 | landed c5e5e1d - lock + journal + _rev; race cases green; sound store re-point open |
| `foundry-engine-B` | [Verdicts become keyed, revisioned patches with an append-only gate log](05-asset-management.md) | foundry-engine | M | 5/7/4 | contract |  | open |
| `library-assets-audio-A` | [One sound vocabulary: the Terms spine and "the team's hand" move into lib/sound](05-asset-management.md) | library-assets-audio | L | 6/7/5 | architecture |  | open |
| `library-assets-audio-B` | [Compose renders in place: an ElevenLabs draft becomes a take without a round trip](05-asset-management.md) | library-assets-audio | M | 5/8/5 | direction |  | open |
| `library-styles-atelier-A` | [Proofs carry their lineage, and the lock gate reads coverage, not a count](05-asset-management.md) | library-styles-atelier | L | 6/8/6 | contract |  | open |
| `library-styles-atelier-B` | [The trial matrix is the wall: compare six presets on five problems, then run yours as one slate](05-asset-management.md) | library-styles-atelier | L | 7/8/5 | direction |  | open |
| `library-view-A` | [The studio's Outputs shelf is a fixture: derive it from the project's real step records](05-asset-management.md) | library-view | L | 7/8/5 | architecture | C6 | merged into WORKSPACE-B |
| `library-view-B` | [The Foundry's catalogue reaches projects: start a Library style from a proven Foundry style](05-asset-management.md) | library-view | L | 6/8/5 | direction | C7 | merged into foundry-forge-B; its PresetRail lane declined (critic-2026-10-07-m1-tails, T6) |
| `IMG-A` | [One spend kernel for every paid call: a durable ledger shared by imaging, music and text](06-imaging-music.md) | imaging-service | L | 7/9/6 | architecture | C3 | landed `86c0ab1` - stages 1-2 (`0010c56`), 3a (`42918cc`, `717f366`, `2aaad00`: local file spend store behind one async interface, one spend window per machine; operator c4c3335e 'Local now, hosted later') 3b (`7cc10c4`: text-usd counted, no ceiling, operator 2026-10-07) and `GET /api/spend` (`86c0ab1`, census `bbb0f28`); residue: the hosted store is held, `npm run verify` unproven on main |
| `IMG-B` | [Plates that inspect and repair themselves: free local-eye QC plus instruction edits as plate versions](06-imaging-music.md) | imaging-service | L | 6/8/4 | direction |  | open |
| `CC-A` | [The ruler graduates: a frozen, digest-pinned scale with JSON verdicts and a resident worker](06-imaging-music.md) | character-consistency-testing | M | 5/8/3 | architecture |  | open |
| `CC-B` | [GPU tenancy lease: one cross-process turn broker replaces look-then-kill recycling](06-imaging-music.md) | character-consistency-testing | L | 7/8/6 | architecture |  | open |
| `VLM-A` | [One cinematography vocabulary, derived everywhere: a versioned vocab file plus a drift gate](06-imaging-music.md) | vlm-frame-annotation | M | 5/7/3 | architecture |  | open |
| `VLM-B` | [Eye certificates: a self-minted truth corpus, and recognize routed by per-field trust](06-imaging-music.md) | vlm-frame-annotation | L | 7/8/5 | architecture | C11 | open - truth minting merged into probe-frame-data-B; certify after VLM-A; router stage needs an operator call |
| `MUSIC-A` | [Cue receipts: one stored render path, verified against the plan before anyone listens](06-imaging-music.md) | music-service | M | 5/8/4 | contract |  | open |
| `MUSIC-B` | [Score cues become takes: they survive the reload, a note re-renders one section, and lab takes can be spotted to picture](06-imaging-music.md) | music-service | L | 7/9/5 | direction | C4 | landed 6997be6 - takes in the sound store, Score adopts/revises, Cut resolves; section edits book the full length (elevenlabs.ts:436), comments claim otherwise; next: honest-meter stage; the rate is M1 |
| `UI-SHELL-A` | [Roles, not worlds: delete every `almanac ?` branch and theme by binding only](07-design-system.md) | ui-shell | XL | 8/9/7 | direction |  | open - next: stage 1 ROLE_TOKENS (zero pixels) + three ratchets; stage 2 after KIT-B 1; stage 3 operator (S4); acceptance 4 met by e098071 |
| `UI-SHELL-B` | [Go anywhere from anywhere: a shell palette over projects, steps, decisions](07-design-system.md) | ui-shell | L | 6/8/4 | direction |  | open - held for the operator (S3): narrow-screen nav landed e503bbd; verbs need SIGNAL-A |
| `SIGNAL-A` | [One keymap, declared once: bind, guard and draw from the same object](07-design-system.md) | signal-vocabulary | L | 6/8/5 | architecture |  | open - next: stage 1 keymap kernel, Board + cull on it (Ctrl+K/repeat already fixed by a5add96) |
| `SIGNAL-B` | [Every count is a door: tallies and rails that filter what they count](07-design-system.md) | signal-vocabulary | L | 5/7/4 | direction |  | open - next after UI-SHELL-A stage 2: zero rule + select door on Tally, BroadcastWeek adoption |
| `KIT-A` | [The kit census: adoption, gaps and the migration map derived from the tree](07-design-system.md) | kit-specimen-route | L | 6/8/3 | architecture |  | landed b0d1d5b + 6892a4d (wired) |
| `KIT-B` | [Specimens in the world they ship in: every part, every world, measured](07-design-system.md) | kit-specimen-route | L | 6/7/3 | direction |  | open - next: stage 1 alpha-aware contrast.ts, owns the composite (4 probes import it); Worlds face after UI-SHELL-A 1; Ghost measures 2.12:1 (ask S5) |
| `UCP-A` | [Probes query the program, not the text: one AST layer for every source probe](07-design-system.md) | ui-component-probes | L | 7/8/4 | architecture |  | open |
| `UCP-B` | [The legibility lane: assert what only photographs caught](07-design-system.md) | ui-component-probes | L | 7/8/5 | architecture |  | open - next after KIT-B 1 and WORKSPACE-B 1: cx-screens.mjs + live measurer on projects + Ghost control |
| `AIO-A` | [AI turns run as server-owned durable jobs; the tab only watches them](08-app-infrastructure.md) | ai-orchestration | XL | 8/9/6 | architecture | C2 | landed `67beb3e` for milestone 1 - stages 1-4 (research is a turn kind, server and client); moved: poster as a work kind (after `GET /api/spend`, serial with script-phase-B stage 3); declined: export onto turns (T3, the Cut reads `GET /api/publish/exports` with FSC-B 2b); held: cross-device bell (AUP-A), hosted ledger and lease (local now, hosted later); T1 was answered by the operator on 2026-10-07 (ask 61a88b35, 'Yes, keep what is paid for'): the poster becomes a server work kind with `cancellable:false`, so a reload keeps the image it has already paid for, built after `GET /api/spend` and serial with script-phase-B stage 3 |
| `AIO-B` | [Dispatch manifest: see what the engine will read, and which engine, before you spend](08-app-infrastructure.md) | ai-orchestration | L | 6/7/3 | direction |  | landed 2832c85 + session 2 (2026-10-06) - pure assemblers + golden-prompt parity, POST /api/turns/preview, stats ring; DispatchStrip beside Recalibrate and "direct the cut" (render include toggles, run disabled on refusal or no engine), engineRun.manifest on versions (dispatch-strip.probe) |
| `AUP-A` | [Verified principal and account vault: the server knows who is calling, and holds the work](08-app-infrastructure.md) | auth-persistence | XL | 9/9/7 | direction |  | partial 7b36c9f - stage 1 (operator: stage 1 only): verified principal, PRINCIPAL_MODE default legacy, principal-keyed rate buckets; credential door 5e66af4. Stage 2 spend attribution and stage 3 vault not approved |
| `AUP-B` | [Sign-out cannot destroy work: preview the wipe, take a studio archive, bring it back](08-app-infrastructure.md) | auth-persistence | L | 6/9/5 | policy-loosen | C5 | partial ef42e6f - archive + dry-run; sign-out dialog + archive import. Lock-instead-of-wipe declined by operator 2026-10-06 |
| `CIP-A` | [Engine stand-in lane: a fake `claude` on PATH replays recorded envelopes through real routes](08-app-infrastructure.md) | cli-infrastructure-probes | L | 6/8/3 | none | C10 | landed 2059833 - recalibrate (76d4c80) and frames routes end to end through the stand-in |
| `CIP-B` | [Deployment-cell matrix: every route and capability judged per posture cell, derived](08-app-infrastructure.md) | cli-infrastructure-probes | M | 5/7/2 | none |  | landed 9e275ad - 7 cells x every route; posture coherence 9fcc7e5 closed its 3 findings. Open: acceptance 6 |
| `text-engine-A` | [Durable turns: reason() becomes submit/settle over a server-side turn ledger](09-content-pipeline.md) | text-engine | L | 7/9/6 | architecture | C2 | merged into AIO-A (settle hook, digest-only record, sweep landed) |
| `text-engine-B` | [Repair, don't discard: a failed validation becomes a draft with a repair turn](09-content-pipeline.md) | text-engine | L | 6/8/5 | direction |  | open |
| `foundry-forge-A` | [Calibrated grading: the human ledger scores, gates and versions the grader](09-content-pipeline.md) | foundry-forge | L | 6/8/4 | architecture | C8 | partial 2276df9 - calibration inert for stamped runs (ledger rows unstamped); next: stage 2 stamp + commit-time write |
| `foundry-forge-B` | [Proven style to Library theme in one move](09-content-pipeline.md) | foundry-forge | L | 6/8/5 | direction | C7 | landed `e775376` - stage 1 (`7f11d97`, `d4e0181`, `c5ab058`, `6f207b9`, `b2b6057`): adopt on a proven style makes a draft theme (origin foundry, discipline unset), palette read off one kept plate, palette sentences stripped from finish, POST styles/[id]/adopt behind the money door; ?style= opens it in the Library; seeding (`818772c`): kept text-lane forge plates as pending proofs, each labelled with its model, `ref-early` never seeded; `listThemes` lists the adopted draft (`e775376`, T7); PresetRail Foundry lane declined (T6); residue: palette editor held (critic ask 8), `proofsLeftOut` not shown on the shelf |
| `foundry-dojo-A` | [Improvement lifecycle derived from git: owed, merged, pinned and live as one state machine](09-content-pipeline.md) | foundry-dojo | L | 6/8/4 | architecture |  | open |
| `foundry-dojo-B` | [Blind gate: the human picks per pair before seeing the judges](09-content-pipeline.md) | foundry-dojo | M | 5/8/3 | direction |  | open |
| `probe-frame-data-A` | [Corpus lockfile: frames addressed by content, manifests tracked, any clone re-materializes](09-content-pipeline.md) | probe-frame-data | M | 5/7/3 | architecture |  | open |
| `probe-frame-data-B` | [Truth by construction: every generated shot emits its own ground-truth sidecar](09-content-pipeline.md) | probe-frame-data | M | 5/8/4 | architecture | C11 | open - next: stage 1 labelled clauses + sidecars (acceptance 1-2 corrected) |
| `pipeline-scripts-A` | [One gate registry: verify, CI and hooks projected from a single declaration](09-content-pipeline.md) | pipeline-scripts | M | 5/8/4 | architecture |  | landed 82e7c13 - registry + runner; --changed skip open |
| `pipeline-scripts-B` | [Recorded-engine lane: drive the real reasoning routes end-to-end without a model](09-content-pipeline.md) | pipeline-scripts | L | 7/8/5 | architecture | C10 | merged into CIP-A; residue: live-lane PATH shim after AIO-A 4b |
| `data-asset-probes-A` | [Effect-log harness: enumerate every crash point and interleaving of the foundry commits](09-content-pipeline.md) | data-asset-probes | L | 7/8/4 | architecture | C9 | landed 548ea81; race cases flipped green by c5e5e1d |
| `data-asset-probes-B` | [Notebook corpus lane: every tracked notebook walks the one validation door](09-content-pipeline.md) | data-asset-probes | M | 5/7/3 | architecture |  | open |
