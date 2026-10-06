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
| C1 | **Your own notebook, downstream.** Every consumer after Step 1 (the board, scope maths, the Script gate, recalibrate, Frames figure binding) reads the 2026-08-11 Bitcoin fixture through module constants. A creator's live notebook dead-ends on the card that produced it. | `research-scope-board-A` ≡ `phase-shared-B` | `research-scope-board-A` (more detailed staging). Steal `phase-shared-B`'s stage-4 Frames binding cases. |
| C2 | **AI turns as durable, server-owned jobs.** A minutes-long paid turn is one held-open request. The result lives only in a browser tab, a reload marks it `interrupted`, and Abort does not kill the engine process. | `AIO-A` ≡ `text-engine-A` ≡ `research-run-engine-A` | `AIO-A` stage 1 (kernel + signal plumbing). Then `research-run-engine-A` becomes the first adopter. `text-engine-A`'s "settle hook" idea goes into the kernel. |
| C3 | **One spend meter for every vendor.** Imaging has holds. Music checks the budget, then books, with no hold. Cloud text has no ceiling at all. All three ledgers are per-process. | `IMG-A` ≡ `imaging-music-probes-A` | `IMG-A` (adds a durable cross-process store). Take `imaging-music-probes-A`'s conformance kit as its test suite. |
| C4 | **Score takes persist in the sound store.** This closes the open ADR `2026-08-29-score-take-persistence` with a fourth option: bytes in `lib/sound`, a `takeId` pointer on the spot. | `frames-score-cut-A` ≡ `MUSIC-B` | `MUSIC-B` (adds section revision and adopting lab takes). `frames-score-cut-A` adds the Cut-side `take-fit` row. |
| C5 | **Sign-out cannot destroy the only copy.** One click wipes every project, step, theme and upload. IndexedDB is the only copy and there is no export. | `SHELF-B` ≡ `AUP-B` | `AUP-B`, archive + dry-run part first (needs no policy change). The lock-instead-of-wipe half is `policy-loosen` and needs an operator call. |
| C6 | **Outputs is this project's real reel.** The studio's Outputs panel shows the same mocked Glass Harbor library for every project. | `WORKSPACE-B` ≡ `library-view-A` | `library-view-A` (Board-style lazy adapters). `WORKSPACE-B` adds keep-on-shelf (`plate:` pointer) and the fixture deletion. |
| C7 | **Proven Foundry style → Library theme.** Four human-proven styles cannot reach a project. "Promote to Library" is in the Foundry README and unbuilt. | `foundry-forge-B` ≡ `library-view-B` | Either. `library-view-B` adds the preset-rail lane, `foundry-forge-B` the palette deep-read. |
| C8 | **The grader is calibrated against the human.** Measured on `ledger.json` (n=87): craft ranks kept vs rejected **backwards** (AUC 0.29), style is near chance (0.58), and the text veto has never fired. The meters under every cull tile steer the curator the wrong way. | `foundry-forge-A` ≡ `foundry-curation-B` | `foundry-forge-A` first (measurement + versioned calibration). `foundry-curation-B` (pre-deciding the rest) only once calibration says a field predicts. |
| C9 | **The foundry catalogue loses writes.** Five writers read-modify-write `styles.json` / `ledger.json` / `training-ledger.json` with no lock, and the landed commit token is checked *outside* any fence. | `foundry-engine-A` (the fix) ≡ `data-asset-probes-A` (the harness that proves it) | Harness first: `data-asset-probes-A` case 4 goes red. Then `foundry-engine-A`. |
| C10 | **Run the real reasoning routes offline.** No lane has ever run `/api/recalibrate` / `/api/research` / `/api/frames` end-to-end; their refusal guards have 0 probe hits. | `CIP-A` (fake `claude` on PATH) ≡ `pipeline-scripts-B` (replay provider + cassettes) · related: `production-script-probes-B` | `CIP-A`: no production injection point, so it is the lowest risk. It is also the safety net for C2's refactor, so land it **before** C2 stage 2. |
| C11 | **Truth by construction.** Generated shots state their camera in the prompt, so that becomes a ground-truth sidecar. Today's truth set is n=2. | `probe-frame-data-B` ≡ the truth-minting half of `VLM-B` | `probe-frame-data-B`, then `VLM-B`'s certificates on top. |

Related but **not** duplicates. They share seams, so sequence them rather than running them in
parallel:
- `phase-shared-A` (step-record registry) → `WORKSPACE-A` (progress as a projection of records) →
  `SHELF-A` (digest read model) / `DATA-B` (change feed).
- `script-phase-A` (ScriptDraft) needs C1 stage 1. `script-phase-B` (Compose from your notebook)
  needs both.
- `frames-phase-A` (PictureUnit) → `frames-score-cut-B` (compile an animatic MP4) →
  `video-clip-pipeline-B` (the Motion step).
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
the catalogue Status column. Found by the builders, open for a later card: the imaging router
settles a hold on a billed failure and then reroutes with NO hold (`lib/imaging/router.ts:429`,
IMG-A stage 2); `npx tsx` gate scripts fetch tsx from the network in CI (tsx is not a
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
| `SHELF-A` | [Project digest read model: the shelf can say what is inside a project](01-studio-hub.md) | project-shelf | L | 6/8/4 | architecture |  | open |
| `SHELF-B` | [Own your work: export, import, duplicate, and a sign-out that does not destroy](01-studio-hub.md) | project-shelf | L | 7/9/5 | direction | C5 | open |
| `DATA-A` | [One declared relation schema: cascades, blast radius, eviction and patches derived from it](01-studio-hub.md) | studio-data-layer | L | 7/8/6 | architecture |  | open |
| `DATA-B` | [A change feed under every hook: one cache, live across components and tabs](01-studio-hub.md) | studio-data-layer | L | 6/8/5 | architecture |  | open |
| `SLP-A` | [Mutation rung: every probe names the defect it guards, and a runner proves it goes red](01-studio-hub.md) | studio-logic-probes | M | 5/8/2 | none |  | open |
| `SLP-B` | [Scenario rung: product-written step scenarios so the live lane and cx-capture reach every state](01-studio-hub.md) | studio-logic-probes | L | 6/8/4 | policy-loosen |  | open |
| `WORKSPACE-A` | [Step contracts: progress becomes a projection of step records, not a mounted report](01-studio-hub.md) | studio-workspace | XL | 8/9/6 | contract |  | partial b35a803 - stage 1 verdict modules; switch-over (stage 2) open; contract: verdict says review, never done |
| `WORKSPACE-B` | [Outputs becomes this project's real reel, with provenance and keep-on-shelf](01-studio-hub.md) | studio-workspace | L | 6/8/4 | direction | C6 | open |
| `research-run-engine-A` | [The real research run becomes a server-owned durable job with a run ledger](02-research-script.md) | research-run-engine | L | 7/9/6 | architecture | C2 | open |
| `research-run-engine-B` | [Researched, not reasoned: a search-capable research rung with source receipts and a real trace](02-research-script.md) | research-run-engine | XL | 8/9/7 | policy-loosen |  | partial 9e81447 - stages 1-2 behind TEXT_RETRIEVE (off); trace + chip open; no live run yet |
| `research-scope-board-A` | [The board deals any notebook: a per-project NotebookSource replaces the fixture constant](02-research-script.md) | research-scope-board | XL | 8/10/7 | contract | C1 | partial ca6ddbe - stage 1 (NotebookSource); stages 2-4 open |
| `research-scope-board-B` | [Follow-ups that land: a per-project revision ledger the creator applies, rejects and undoes](02-research-script.md) | research-scope-board | L | 7/8/5 | direction |  | open |
| `script-phase-A` | [ScriptDraft: renders become per-project data, and the hand tables become derivations](02-research-script.md) | script-phase | L | 8/9/7 | contract |  | partial 1099deb - session 1 (draft, impactOf, editPlanSchema, derived ledgerFor) |
| `script-phase-B` | [Compose: the creator's own notebook in, three gated candidate renders out](02-research-script.md) | script-phase | XL | 9/10/7 | direction |  | partial 901198a - stages 1-2 (prompt, parseDraft, /api/script + gate); UI action + durable job open |
| `trailer-script-A` | [The trailer cut as an edit log: spine + ordered ops, so edits survive recompose and undo is free](02-research-script.md) | trailer-script | L | 7/8/5 | architecture |  | open |
| `trailer-script-B` | [Notes and a model edit plan for the trailer: bring the stack-and-recalibrate loop to the cut, structure-checked before accept](02-research-script.md) | trailer-script | L | 8/8/6 | direction |  | open |
| `frames-phase-A` | [One picture-unit contract: trailer shots own plates and reach Score and Cut](03-frames-score-cut.md) | frames-phase | XL | 8/9/6 | architecture + direction |  | partial eff57ca - stage 1 (units, v2 record); Score/Cut readers, shot plates open |
| `frames-phase-B` | [The direction pass becomes a proposal: per-beat diff, keep my edits, stale plates marked](03-frames-score-cut.md) | frames-phase | L | 6/8/4 | direction |  | open |
| `frames-score-cut-A` | [Cue takes become sound-store rows: the music lane survives a reload, and agents can fill it](03-frames-score-cut.md) | frames-score-cut | L | 6/8/5 | contract (closes ADR 2026-08-29-score-take-persistence) | C4 | merged into MUSIC-B 6997be6 (Cut resolution); take-fit row open |
| `frames-score-cut-B` | [Compile the cut: an animatic MP4 from the derived timeline](03-frames-score-cut.md) | frames-score-cut | L | 7/8/5 | architecture + direction |  | partial 38bfc82 - CutDocument + export kernel + /api/cut/export; Finish-line button, drawn layers open |
| `phase-shared-A` | [Step records get a registry: typed keys, a versioned read seam, atomic patch, lineage](03-frames-score-cut.md) | phase-shared | XL | 8/9/6 | architecture |  | partial d27f335 - stage 1 + 3 data-loss conversions; lineage/ratchet open |
| `phase-shared-B` | [Your own notebook, downstream: one resolver replaces the Bitcoin fixture everywhere](03-frames-score-cut.md) | phase-shared | XL | 8/9/6 | direction + architecture | C1 | open |
| `production-script-probes-A` | [Turn contracts: one server-owned schema, prompt and validator per TurnClass](04-pipeline-probes-video.md) | production-script-probes | L | 7/8/5 | contract |  | open |
| `production-script-probes-B` | [Studio journey lane: one hook harness, cross-step joins, derived hook coverage](04-pipeline-probes-video.md) | production-script-probes | L | 7/8/4 | architecture |  | open |
| `imaging-music-probes-A` | [One meter kernel for every vendor balance, proven by one conformance kit](04-pipeline-probes-video.md) | imaging-music-probes | XL | 8/8/5 | architecture | C3 | open |
| `imaging-music-probes-B` | [Spend-invariant lane: one vendor boundary, generated adversarial traffic, global invariants](04-pipeline-probes-video.md) | imaging-music-probes | L | 6/8/3 | architecture |  | open |
| `video-clip-pipeline-A` | [Clip take ledger: N seeds, persisted verdicts, adoption with waivers](04-pipeline-probes-video.md) | video-clip-pipeline | L | 6/7/3 | architecture |  | open |
| `video-clip-pipeline-B` | [The Motion step: frames become clips, graded and adopted inside the studio](04-pipeline-probes-video.md) | video-clip-pipeline | XL | 9/9/7 | direction |  | partial a9d5975 - stage 1, Motion restored as step 6 (operator decision, reverses 80ac10c); queue/takes/Cut open |
| `foundry-curation-A` | [One gate kernel: Cull, Extract and Dojo sit on the Board's source adapters](05-asset-management.md) | foundry-curation | L | 6/7/5 | architecture |  | open |
| `foundry-curation-B` | [Cull by exception: the grader is calibrated against you while you cull](05-asset-management.md) | foundry-curation | L | 7/8/6 | direction | C8 | open |
| `foundry-engine-A` | [The catalogue gets one write path: journaled, revisioned, honoured by Python and the Dojo loop](05-asset-management.md) | foundry-engine | L | 6/8/5 | architecture | C9 | landed c5e5e1d - lock + journal + _rev; race cases green; sound store re-point open |
| `foundry-engine-B` | [Verdicts become keyed, revisioned patches with an append-only gate log](05-asset-management.md) | foundry-engine | M | 5/7/4 | contract |  | open |
| `library-assets-audio-A` | [One sound vocabulary: the Terms spine and "the team's hand" move into lib/sound](05-asset-management.md) | library-assets-audio | L | 6/7/5 | architecture |  | open |
| `library-assets-audio-B` | [Compose renders in place: an ElevenLabs draft becomes a take without a round trip](05-asset-management.md) | library-assets-audio | M | 5/8/5 | direction |  | open |
| `library-styles-atelier-A` | [Proofs carry their lineage, and the lock gate reads coverage, not a count](05-asset-management.md) | library-styles-atelier | L | 6/8/6 | contract |  | open |
| `library-styles-atelier-B` | [The trial matrix is the wall: compare six presets on five problems, then run yours as one slate](05-asset-management.md) | library-styles-atelier | L | 7/8/5 | direction |  | open |
| `library-view-A` | [The studio's Outputs shelf is a fixture: derive it from the project's real step records](05-asset-management.md) | library-view | L | 7/8/5 | architecture | C6 | open |
| `library-view-B` | [The Foundry's catalogue reaches projects: start a Library style from a proven Foundry style](05-asset-management.md) | library-view | L | 6/8/5 | direction | C7 | open |
| `IMG-A` | [One spend kernel for every paid call: a durable ledger shared by imaging, music and text](06-imaging-music.md) | imaging-service | L | 7/9/6 | architecture | C3 | partial c8f399f - stage 1 (lib/spend + imaging); music/text/file store open |
| `IMG-B` | [Plates that inspect and repair themselves: free local-eye QC plus instruction edits as plate versions](06-imaging-music.md) | imaging-service | L | 6/8/4 | direction |  | open |
| `CC-A` | [The ruler graduates: a frozen, digest-pinned scale with JSON verdicts and a resident worker](06-imaging-music.md) | character-consistency-testing | M | 5/8/3 | architecture |  | open |
| `CC-B` | [GPU tenancy lease: one cross-process turn broker replaces look-then-kill recycling](06-imaging-music.md) | character-consistency-testing | L | 7/8/6 | architecture |  | open |
| `VLM-A` | [One cinematography vocabulary, derived everywhere: a versioned vocab file plus a drift gate](06-imaging-music.md) | vlm-frame-annotation | M | 5/7/3 | architecture |  | open |
| `VLM-B` | [Eye certificates: a self-minted truth corpus, and recognize routed by per-field trust](06-imaging-music.md) | vlm-frame-annotation | L | 7/8/5 | architecture | C11 | open |
| `MUSIC-A` | [Cue receipts: one stored render path, verified against the plan before anyone listens](06-imaging-music.md) | music-service | M | 5/8/4 | contract |  | open |
| `MUSIC-B` | [Score cues become takes: they survive the reload, a note re-renders one section, and lab takes can be spotted to picture](06-imaging-music.md) | music-service | L | 7/9/5 | direction | C4 | landed 6997be6 - takes in the sound store, Score adopts/revises, Cut resolves; metering of kept ranges open |
| `UI-SHELL-A` | [Roles, not worlds: delete every `almanac ?` branch and theme by binding only](07-design-system.md) | ui-shell | XL | 8/9/7 | direction |  | open |
| `UI-SHELL-B` | [Go anywhere from anywhere: a shell palette over projects, steps, decisions](07-design-system.md) | ui-shell | L | 6/8/4 | direction |  | open |
| `SIGNAL-A` | [One keymap, declared once: bind, guard and draw from the same object](07-design-system.md) | signal-vocabulary | L | 6/8/5 | architecture |  | open |
| `SIGNAL-B` | [Every count is a door: tallies and rails that filter what they count](07-design-system.md) | signal-vocabulary | L | 5/7/4 | direction |  | open |
| `KIT-A` | [The kit census: adoption, gaps and the migration map derived from the tree](07-design-system.md) | kit-specimen-route | L | 6/8/3 | architecture |  | landed b0d1d5b + 6892a4d (wired) |
| `KIT-B` | [Specimens in the world they ship in: every part, every world, measured](07-design-system.md) | kit-specimen-route | L | 6/7/3 | direction |  | open |
| `UCP-A` | [Probes query the program, not the text: one AST layer for every source probe](07-design-system.md) | ui-component-probes | L | 7/8/4 | architecture |  | open |
| `UCP-B` | [The legibility lane: assert what only photographs caught](07-design-system.md) | ui-component-probes | L | 7/8/5 | architecture |  | open |
| `AIO-A` | [AI turns run as server-owned durable jobs; the tab only watches them](08-app-infrastructure.md) | ai-orchestration | XL | 8/9/6 | architecture | C2 | partial ac96f1d - stages 1-3: kernel; recalibrate (ab1df8c) and scene direction on the ledger, survive reload, stop kills the engine; harness reads the ledger. Open: poster/export/research onto turns, cross-device bell, hosted ledger (GCS) + lease |
| `AIO-B` | [Dispatch manifest: see what the engine will read, and which engine, before you spend](08-app-infrastructure.md) | ai-orchestration | L | 6/7/3 | direction |  | landed 2832c85 + session 2 (2026-10-06) - pure assemblers + golden-prompt parity, POST /api/turns/preview, stats ring; DispatchStrip beside Recalibrate and "direct the cut" (render include toggles, run disabled on refusal or no engine), engineRun.manifest on versions (dispatch-strip.probe) |
| `AUP-A` | [Verified principal and account vault: the server knows who is calling, and holds the work](08-app-infrastructure.md) | auth-persistence | XL | 9/9/7 | direction |  | partial 7b36c9f - stage 1 (operator: stage 1 only): verified principal, PRINCIPAL_MODE default legacy, principal-keyed rate buckets; credential door 5e66af4. Stage 2 spend attribution and stage 3 vault not approved |
| `AUP-B` | [Sign-out cannot destroy work: preview the wipe, take a studio archive, bring it back](08-app-infrastructure.md) | auth-persistence | L | 6/9/5 | policy-loosen | C5 | partial ef42e6f - archive + dry-run; sign-out dialog + archive import. Lock-instead-of-wipe declined by operator 2026-10-06 |
| `CIP-A` | [Engine stand-in lane: a fake `claude` on PATH replays recorded envelopes through real routes](08-app-infrastructure.md) | cli-infrastructure-probes | L | 6/8/3 | none | C10 | landed 2059833 - recalibrate (76d4c80) and frames routes end to end through the stand-in |
| `CIP-B` | [Deployment-cell matrix: every route and capability judged per posture cell, derived](08-app-infrastructure.md) | cli-infrastructure-probes | M | 5/7/2 | none |  | landed 9e275ad - 7 cells x every route; posture coherence 9fcc7e5 closed its 3 findings. Open: acceptance 6 |
| `text-engine-A` | [Durable turns: reason() becomes submit/settle over a server-side turn ledger](09-content-pipeline.md) | text-engine | L | 7/9/6 | architecture | C2 | open |
| `text-engine-B` | [Repair, don't discard: a failed validation becomes a draft with a repair turn](09-content-pipeline.md) | text-engine | L | 6/8/5 | direction |  | open |
| `foundry-forge-A` | [Calibrated grading: the human ledger scores, gates and versions the grader](09-content-pipeline.md) | foundry-forge | L | 6/8/4 | architecture | C8 | partial 2276df9 - calibration (craft inverted 0.288); commit-time write + thumbnails open |
| `foundry-forge-B` | [Proven style to Library theme in one move](09-content-pipeline.md) | foundry-forge | L | 6/8/5 | direction | C7 | open |
| `foundry-dojo-A` | [Improvement lifecycle derived from git: owed, merged, pinned and live as one state machine](09-content-pipeline.md) | foundry-dojo | L | 6/8/4 | architecture |  | open |
| `foundry-dojo-B` | [Blind gate: the human picks per pair before seeing the judges](09-content-pipeline.md) | foundry-dojo | M | 5/8/3 | direction |  | open |
| `probe-frame-data-A` | [Corpus lockfile: frames addressed by content, manifests tracked, any clone re-materializes](09-content-pipeline.md) | probe-frame-data | M | 5/7/3 | architecture |  | open |
| `probe-frame-data-B` | [Truth by construction: every generated shot emits its own ground-truth sidecar](09-content-pipeline.md) | probe-frame-data | M | 5/8/4 | architecture | C11 | open |
| `pipeline-scripts-A` | [One gate registry: verify, CI and hooks projected from a single declaration](09-content-pipeline.md) | pipeline-scripts | M | 5/8/4 | architecture |  | landed 82e7c13 - registry + runner; --changed skip open |
| `pipeline-scripts-B` | [Recorded-engine lane: drive the real reasoning routes end-to-end without a model](09-content-pipeline.md) | pipeline-scripts | L | 7/8/5 | architecture | C10 | open |
| `data-asset-probes-A` | [Effect-log harness: enumerate every crash point and interleaving of the foundry commits](09-content-pipeline.md) | data-asset-probes | L | 7/8/4 | architecture | C9 | landed 548ea81; race cases flipped green by c5e5e1d |
| `data-asset-probes-B` | [Notebook corpus lane: every tracked notebook walks the one validation door](09-content-pipeline.md) | data-asset-probes | M | 5/7/3 | architecture |  | open |
