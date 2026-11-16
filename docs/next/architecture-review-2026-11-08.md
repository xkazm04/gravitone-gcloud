# Architecture review · 2026-11-08 · three weeks after the cutover review

Base: `autopilot/codebase-architecture-review-1f44f33c` at `f8bb179f`, cut from the local `main` tip.
Previous review: `docs/next/architecture-review-2026-10-18.md`, last edited at `2ad91ed5`. Every
"since" figure below is `2ad91ed5..f8bb179f` (1,709 commits).

Docs only. This review used Read, Grep and read-only git. **No gate, test, typecheck, lint, build or
dev server was run, so this document claims no gate state.** When it says a test "pins" something, it
means the test's source was read, not that it was seen to pass.

**Verdict labels.** CONFIRMED: read in the tree at the cited lines, and it needs no run. PLAUSIBLE:
the code path was read end to end but not executed. Each PLAUSIBLE item's next step is the test that
settles it.

**Constraints treated as settled.**
- The enforcing spend classes stay on the file store until the operator moves them.
- The idea loop's Codex draw uses no kernel job and never falls back to Flux (`docs/idea-loop/README.md`).
- The 400-line and door rules are laws of `packages/` only.
- Moonshot cards are no longer a goal, so the 10-18 M1 ranking is not refreshed.

**Parked, and not addressed here:** the idea loop's `fromLoop` gate, and the receipt line and receipt
behaviour. Where code from those areas is cited, it is cited for another reason.

---

## 1. What changed structurally since 2026-10-18

| Tree | Source files at `2ad91ed5` → now | Lines now |
| --- | --- | --- |
| `app/` | 316 → 443 | 51,505 |
| `lib/` | 452 → 683 | 129,840 |
| `packages/` | 491 → 665 | 85,577 |
| `pipeline/` | 96 → 122 | 24,335 |
| `tests/` | 403 → 633 | 121,712 |

Counts are `git ls-files` for `.ts`, `.tsx`, `.mts` and `.mjs`; lines are `wc -l` totals.

**Where the growth went.** `lib/foundry` went from 40 to 137 TypeScript files, almost all of it the
scout wing, and `lib/foundry/scout/` is now about 12,000 lines. New `lib/` directories include
`music-clip` (22 files), `audio` (7) and `yue2`. The `tests/next-server` lane (vitest) went from 122
to 335 files, while `tests/golden-path` (Playwright) went from 197 to 210. New work is now tested in
vitest, which matters for P1.

### The idea loop (`pipeline/idea-loop/`, `lib/foundry/scout/idea-loop/`, `codexExec.ts`, `codexDraw.ts`)

It arrived on 2026-11-08 in stages (`c7266ca1`, `f63b4789`, `6d90db16`, `63d98eb2`, `f8bb179f`) and is small:
294 lines under `idea-loop/` (`generate`, `loop`, `score`), 251 in `codexExec.ts` and `codexDraw.ts`,
and 92 in the two CLIs. Its shape:

- `pipeline/idea-loop/run.mts:22-28` asks a Codex seat for ideas, and `loop.ts:50-68` scores them and
  writes one JSON record per idea under `IDEA_LOOP_STORE_DIR`.
- `pipeline/scout.mts:517-520` binds `codexDraw`, and `storyboard.ts:397-401` draws in process with
  no job (the reasons are at `codexDraw.ts:6-8`).
- `score.ts` reuses `lib/foundry/calibration.ts` for its statuses and floor (`score.ts:10-16`,
  `:127-130`), so the bar's vocabulary cannot drift from the grader's. That is good reuse.
- `codexExec.ts:17-24,45` isolates the subscription well: every key-shaped variable is stripped and
  `--ignore-user-config` is set.
- The README records `n = 0` verdicts and a provisional bar. Nothing is calibrated yet, and the
  document says so.

Two structural weaknesses are in P2 and P5.

### The gate runner and lint ratchet

The registry and runner (`pipeline/gates.mts`, `pipeline/run-gates.mts`, `1b1a5f67`, 2026-10-05)
predate the last review and remain sound by reading:

- There is one list of gates, with projections to CI and to `verify:serial` held equal by
  `tests/golden-path/verify-ci-parity.probe.spec.ts:52-60`.
- Could-not-run is kept apart from fail (`run-gates.mts:170-175`).
- Blocked is kept apart from fail (`:232-242`).
- A registry change on 2026-10-29 moved `check:score` to advisory on input determinism (`gates.mts:161`).

The lint ratchet changed twice:

- `03152290` (10-25) lints only what git would ship (`lint-ratchet.mjs:70-83`).
- `9c563602` (11-08) splits the walk into a per-file cache for untyped files and a whole-program
  fingerprint cache for `.ts`/`.tsx` (`:85-125`). The split is correct: `projectService` verdicts
  depend on imported types, so a per-file cache would be unsound for them. CI and `--cold` skip it (`:97`).

`lint-baseline.json` has not changed since `2ad91ed5`.

**Smaller gate observations, below the five.** Each is one small lot.

- **The short-walk floor no longer guards anything.** `lint-baseline.json:28` has `filesFloor: 150`,
  while the tree tracks 2,435 `.ts`/`.tsx` and 175 other script files and `9c563602` reports about
  2,500 walked. The baseline's only non-zero bucket is one warning. So an `ignores` line that dropped
  a warning-free tree of up to about 2,300 files would change no bucket and clear the floor. The
  gate's own message says to set the floor to "the file count of the last honest run"
  (`lint-ratchet.mjs:59`). CONFIRMED by reading.
- **The fingerprint hashes untracked JSON.** `typedFingerprint` lists `--others --exclude-standard`
  and includes `.json` (`lint-ratchet.mjs:100-104`). `.gitignore:4` is anchored (`/node_modules`), so
  in this worktree `packages/kernel/node_modules/.vite/vitest/.../results.json` is listed. A vitest
  run that rewrites it would make the next ratchet run cold for the typed half. PLAUSIBLE: the file
  was seen in the listing, but no run was timed.
- **A gate has no timeout.** `runGate` starts a child with no timer (`run-gates.mts:191-229`), so one
  hung gate holds `verify`, and the pre-push hook, indefinitely. CONFIRMED by reading. No hang was observed.
- **Liveness reads only the top level of `pipeline/`** (`run-gates.mts:144`). No gate-shaped file sits
  deeper today, so this is not a hole yet.

---

## 2. Status of the 2026-10-18 findings

| Item | Status | Evidence |
| --- | --- | --- |
| **F1** explainer cut-gate defect | **Closed** | `930d255e`. `lib/parts/verdict.ts:172-175` derives through `lib/cut/explainer.ts`. `tests/next-server/parts-explainer-gate.test.ts` drives the real side. |
| **F1** part logic in a route directory | **Open, not worse** | Staged move not begun; see P3. There is no `lib/parts/kinds/`. |
| **F2** spend: `text-usd` on the kernel store | **Closed by operator ruling** | `e92204d3`. `lib/spend/select.ts:42` holds `SQLITE_CLASSES = {text-usd}`. `lib/ledger/v1/sources/spend.ts:145` reads kernel rows for that class. |
| **F2** enforcing classes on the file store | **Open, parked with the operator** | Five callers of `spendStoreFor` (`imaging/budget.ts:270`, `imaging/video/budget.ts:78`, `music/budget.ts:221`, `music/ttsBudget.ts:57`, `text/spend.ts:69`), and only `text-usd` is on the kernel store. `routeAndReserve` still has no production caller. `job-usd` still has `ceiling: null` (`packages/kernel/src/spend/meter.ts:44`). |
| **F3** frames alternatives orphan | **Closed** | `lib/frames/alternatives/` and `lib/frames/records.ts` are gone (`f437d981`). `alt-last-one-stays.probe` is gone. |
| **F3** v1 `Hint`/`Tally` pinned, live Hint untested on tap | **Closed** | Deleted in `415b3564`. `hint-tap.probe.spec.ts:22` now bundles the `@gt/ui` Hint. `chip-key-contrast.probe.spec.ts:26` and the mutant at `tests/mutants/registry.ts:172-176` read `packages/ui`. |
| **F3** `UNGUARDED_PROBE_BUDGET` | **Improved** | 162 → 152 (`tests/mutants/registry.ts:40`). |
| **F3** AIO-A turn runner and ledger | **Open, unchanged** | `lib/turns/runner.ts` (376 lines) and `ledger.ts` (332) remain. `startTurn` has no caller outside `tests/`, and 13 golden-path probes still drive it. See the note below. |
| **F4** spend-file read | **Closed** | `lib/ledger/v1/sources/spend.ts:159` uses `readFileSync`. |
| **F4** styles-export rename inside the transaction | **Closed** | `packages/kernel/src/styles/export.ts:109-124` is the transaction and `:132` renames after it. `f49576a6` folded both blocking retries into `packages/kernel/src/renameRetrySync.ts`, the only `Atomics.wait` in those trees. |
| Candidates (a), (b), (c) | **Resolved as F3/F4** | As above. |
| Dispatches 1, 2, 3 | **Done** | As above. Of the "after these three" list, `canRemoveAlt` is done; the `lib/turns` retirement and the staged F1 move are not. |
| **Candidate:** C6 keep-on-shelf and C2 T1 poster | **Still unverified** | `lib/assets` does not exist. This review did not trace whether `pin` or a music-video path carries either. |
| Operator-only: AUP-A, `research-run-engine-B` | **Still parked** | Not re-examined. |

**Note on `lib/turns`.** Retirement is harder than the 10-18 review implied, for two reasons:

1. `lib/turns/kinds/{frames,recalibrate,research}.ts` import `registerTurnKind` from the runner
   (e.g. `kinds/frames.ts:29`), and the producers reuse those kinds' specs. The runner module is
   therefore still linked into production even though nothing starts a turn. The specs must be lifted first.
2. The Ledger still projects the turn directory (`lib/ledger/v1/sources/turns.ts:91`, wired at
   `lib/ledger/v1/sources.ts:35`), but no non-test code writes it: the only imports of
   `lib/turns/ledger` outside `lib/turns/` are that source and a type in `pipeline/fixtures/work.ts:38`.
   A source over a directory with no production writer shows old records only, or none.

---

## 3. Five structural problems worth competing with product work

Ranked by how much they weaken what the project relies on, divided by the cost of the first step.

### P1 · The builder merge gate runs one of two test lanes, and the one it skips is where new tests go

**Verdict:** CONFIRMED for the repo's side. The merge gate's definition is outside this repo; it is
taken from this run's brief.

**Evidence.**
- The brief's merge gate is `typecheck`, `lint:ratchet` and `npm test`.
- `npm test` is `playwright test` (`package.json:45`) with `testDir: "./tests/golden-path"`
  (`playwright.config.ts:85`).
- Vitest owns `packages/*/test`, `tests/next-gates` and `tests/next-server` (`vitest.config.mts:12`).
  It is a separate registered gate (`pipeline/gates.mts:199-204`).
- Since 10-18, `tests/next-server` gained 213 files and `tests/golden-path` 13. The explainer-gate
  fix, the verdict rules and both idea-loop test files (`tests/next-server/idea-loop-*.test.ts`) are
  vitest-only.
- The full set runs at `npm run verify`, on the pre-push hook, and only for a push to `main`
  (`.githooks/pre-push:3-8,104`), or in CI after a push.

**Cost of leaving it.** A builder branch that breaks the vitest lane can pass the merge gate and land.
The failure then surfaces at the owner's next push, attached to whoever pushes rather than whoever
broke it. This is the same drift the gate registry
was built to end (`gates.mts:3-10`), recurring in a list the registry does not project to.

**Smallest next step.** Add `npm run test:unit` to the App Master's merge gate for this project, and
ideally make that gate read `run-gates.mts --list --json`. Its cost is known: 186 to 215 s at 10
workers on 2026-10-28 (`vitest.config.mts` comment). The machine's memory limit is a real input, so
this is the App Master's decision (see Questions).

**Measured by.** The number of `next-unit` failures first seen at pre-push that were introduced by an
already-merged builder branch, going to zero.

### P2 · The in-process Codex draw has no recovery from a killed process, and its timeout may not hold

**Verdict:** CONFIRMED (no recovery). PLAUSIBLE (the timeout).

**Evidence.**
- A live storyboard is written as `pending` (`lib/foundry/scout/storyboard.ts:362`), and settled only
  after its last panel (`codexDraw.ts:75-80`).
- Everything else that settles a pending storyboard needs a job: `collectStoryboards` filters on
  `c.jobId !== undefined` (`storyboard.ts:495`). A Codex board has no `jobId` by design.
- If the process dies mid-draw, the candidate stays `pending` with no route out. `storyboardOf` treats
  anything not `failed` as held (`storyboardKept.ts:46`), so `heldFor` refuses a redraw of that idea
  (`storyboard.ts:231-245`). The night-close projection drops it as `pending when the night closed`
  (`lib/decision/v1/sources/scoutPlan.ts:589-592`), panels and all.
- This is not hypothetical on this machine: the previous attempt at this very review was killed by a reboot.
- The timeout is `setTimeout(() => child.kill(), …)` (`codexExec.ts:54`), and on Windows the launched
  process is the `node codex.js` wrapper (`lib/agent/resolveEngineBin.ts:23,45`). Awaiting `close`
  (`codexExec.ts:55-58`) waits for stdio to end. `lib/claudeCli.ts:56-68` records the measurement:
  after `child.kill()` on this spawn shape "the grandchild was alive". The sibling spawner uses
  `killTree` (`lib/agent/spawnTurn.ts:64`, `lib/agent/envelope.ts:94-96`). If the wrapper has a
  grandchild, a timed-out draw keeps the seat busy and may never return. Whether Codex's wrapper
  spawns one here was not checked.

The no-job design is settled, and this does not reopen it. Only the missing settle path is at issue.

**Cost of leaving it.** Each killed draw strands one idea permanently and discards already-drawn
frames from the Board. A headless, scheduled loop will meet this, and nothing reports it.

**Smallest next step.**
1. Replace `child.kill()` with `killTree`. Prove it with a fake binary that spawns a sleeping grandchild.
2. Stamp the owner on a Codex candidate (pid and boot id, the shape `lib/turns/ledger.ts` and
   `lib/gpu/lease.ts` `pidAlive` already use), and let `collectStoryboards` settle a dead owner's
   board through `settledBoard`, as any job's ending would be.

**Measured by.** A test that kills the draw mid-board and then collects: the board reads `rendered`
with its panels, or `failed`, never `pending`. And a test that a timed-out seat returns within a
bounded number of seconds with no surviving child.

### P3 · The part rules still live in a route directory, and the cut's finish rule is still written twice

**Verdict:** CONFIRMED. This is what remains of F1, and it is narrower than F1 stated.

**Evidence.**
- `app/(studio)/projects/[id]/_part/` is 4,602 lines, with 13 `fixture*.ts` files holding 3,273. The
  real side still runs them (`real.ts:23`; `realScene.ts:16-19,57`).
- `lib/`, `components/` and `pipeline/` may not import `app/`, now with no allowlist at all
  (`tests/golden-path/no-app-imports.probe.spec.ts`). So no CLI or worker can call these modules.
- The double-writing has shrunk. Score and the ads face delegate to the gate's own rule
  (`fixtureScoreRecs.ts:111`, `fixtureScore.ts:289`, `fixtureCut.ts:282`). What remains for cut is two
  finish-line evaluators, `fixtureCut.ts:281-292` and `lib/parts/verdict.ts:207-215`, with hold logic
  and code building written independently.
- They also choose the explainer differently: the editor by recipe family (`fixtureCut.ts:43`), the
  gate by whether a `strips` record exists (`verdict.ts:174`). Whether a non-explainer recipe that
  plans a cut can hold a `strips` record was not checked.
- The comment at `fixtureCut.ts:277-280` still says lib's `cutVerdict` does not derive the explainer's
  cut, which has been false since `930d255e`.

**Cost of leaving it.** Each new part behaviour lands where only the Next route can reach it, and a
parity bug between editor and gate remains possible for the rule that opens the cut's Board packet.

**Smallest next step.** Export one finish-rule function from `lib/parts/verdict.ts` over a derived
cut and a `plansVoice` flag, have `fixtureCut.ts` call it, and correct the comment. Then, one kind per
lot, the staged move from the 10-18 review. Not needed before that first step.

**Measured by.** Implementations of the cut finish rule, 2 → 1. Lines under `_part/fixture*`, 3,273,
falling lot by lot.

### P4 · The structure gate stops at `packages/`, and most new subsystems were built outside it

**Verdict:** CONFIRMED (scope and counts). File-level import cycles were not measured.

**Evidence.**
- `pipeline/next-gates.mts:1-15,111` walks `packages/**` only: boundaries, cycles, hygiene and size.
- `lib/` went from 452 to 683 files. It holds 57 `.ts`/`.tsx` files over 400 lines, nine of them new
  since 10-18, led by `lib/foundry/scout/types.ts` (880), `lib/articles/trial/store.ts` (822),
  `lib/decision/v1/sources/scoutPlan.ts` (705).
- Environment-named file stores in code went from 8 to 14. New: `SCOUT_STORE_DIR`,
  `SCOUT_MUSE_STORE_DIR`, `SCOUT_PREBASELINE_STORE_DIR`, `MESH_STORE_DIR`, `TRAINING_STORE_DIR`,
  `IDEA_LOOP_STORE_DIR`. Those stores default under the operator's output tree
  (`lib/fixtures/roots.ts:9-10`, `loop.ts:24`), and only the store path and `SPEND_STORE` are set
  centrally (`playwright.config.ts:63,72`). Each test must remember the others.
- The door rule does not apply here. A single-line grep finds 58 `JSON.parse(...) as X` casts in 45
  `lib/` files, including `loop.ts:33`, whose unvalidated record is read by the storyboard door
  (`storyboard.ts:454-456`).
- `lib/foundry/scout` and `lib/producers` depend on each other in both directions (`codexDraw.ts:13-14`,
  `storyboard.ts:76-77`, `scoutStoryboard.ts:25`, `scoutStoryboardActs.ts:15-17`). This is a
  directory-level finding, and no file-level cycle has been proven.

The 400-line law's scope is settled and this does not propose extending it. `lib/` is meant to hold
adapters. It has also become where product subsystems live, without the checks that made `packages/`
trustworthy.

**Cost of leaving it.** Store isolation depends on memory, which is the exact failure recorded in
CLAUDE.md's store rule. Each new JSON store is another place a test can touch operator data. Cycles
and oversized files in the fastest-growing area accumulate with no number to say so.

**Smallest next step.** A report-only pass of the existing `cycles` and `size` checks over `lib/foundry`
and `lib/producers`, with today's counts written to a committed baseline, and a probe that fails when
a `*_STORE_DIR` name read from `lib/` is absent from one central test-isolation list.

**Measured by.** Cycle count and over-400 count in `lib/foundry` + `lib/producers` held by a ratchet.
`*_STORE_DIR` names without central isolation, going to zero.

### P5 · The idea scorer trains on one kind of text and scores another, and the loop never sees its own results

**Verdict:** CONFIRMED by reading. The effect on a calibrated bar cannot be measured yet (`n = 0`).

This concerns what the number measures. It takes no position on the parked `fromLoop` gate.

**Evidence.**
- Training text is `title + genre + prompt` from idea artboards (`score.ts:40`), where `prompt` is
  "The studio prompt, verbatim" (`types.ts:398-399`), meaning image-generation text.
- Scored text is `title + paragraph + bullets + panels` (`loop.ts:58`), meaning a storyboard treatment.
- The out-of-fold AUC (`score.ts:81-87,127-130`) is measured entirely on the training population. When
  `bar.status` reaches `calibrated`, `barLine` will report a measured AUC (`score.ts:147-150`) about a
  population the scored ideas are not drawn from.
- `ideaVerdicts` skips everything but `kind === "idea"` (`score.ts:31`). What the loop produces reaches
  the Board as `kind: "storyboard"` (`storyboard.ts:360`), so keeps and throws of the loop's own output
  never train the scorer.

**Cost of leaving it.** Harmless today, since the provisional bar selects nothing (`docs/idea-loop/README.md`).
It becomes misleading on the day both classes reach the floor: the label will change from provisional
to calibrated, and the number will read as validated for a text type it never saw.

**Smallest next step.** Before the floor is reachable, record on `IdeaBar` what population it was
measured on, and have `barLine` print it. Then decide whether loop-drawn storyboard verdicts should
join the training set; that decision needs a small count of real verdicts first.

**Measured by.** AUC of `predictedKeep` on loop-drawn storyboards the operator has judged, reported
separately from the artboard AUC.

---

## 4. What this review could not verify

- **Any gate state.** No gate, test or lint was run, and no result in this document depends on one.
- **The merge gate's actual definition.** Only the builder brief's statement of it was read.
- **Whether the Codex wrapper spawns a grandchild** on this machine, so P2's timeout half stays PLAUSIBLE.
- **Whether a non-explainer recipe with a cut part can hold a `strips` record** (P3's dispatch difference).
- **Whether the frames and motion verdicts** (`fixtureFramesView.ts` `framesVerdict`, `fixtureMotion.ts`)
  are free of the double-writing found for cut. Only cut and score were read closely.
- **File-level import cycles in `lib/`.** Only directory-level dependency was checked.
- **The real count of scout verdicts or stores.** No operator store or `foundry-out` content was opened;
  `n = 0` is the README's figure.
- **The fingerprint cache's practical hit rate.** No lint run was timed.
- **The C6 and C2 carry-forward questions** from 10-18.
- **The line counts' currency:** all figures are at `f8bb179f`; another builder may have moved `main` since.

## 5. Questions (none decided here)

- **App Master:** add `test:unit` to this project's merge gate (P1)? It costs about 3 to 4 minutes and
  significant memory on a memory-limited machine.
- **Operator, standing:** moving any enforcing spend class onto the kernel store, read together with
  AUP-A (F2). Unchanged since 10-18.
- **Parked, not reopened:** the idea loop's `fromLoop` gate and the receipt line and behaviour.
