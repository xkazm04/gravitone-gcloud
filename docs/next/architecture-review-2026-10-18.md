# Architecture review · 2026-10-18 · Gravitone Next after the cutover

Base: `main` at `6ecf6f6b`. Previous review: `a6426239`. Inputs: `docs/next/migration-plan.md` (Phase 6
exit and carry-forward, `c3ddb052`), capture pass 5 (`0dce33da`,
`docs/concepts/moonshots-2026-10-05/capture-pass-5.md`), and the code under `packages/`, `lib/` and
`app/(studio)/`. The previous critic pass (`critic-2026-10-07-m1-tails.md`, `1bd3dcff`) is settled
context and is not reopened here. Docs only: no code, test, probe or config was changed.

**Verdict labels.** CONFIRMED means the claim was read in the tree at the cited lines and needs no
run. PLAUSIBLE means the code path was read end to end but not executed. Each PLAUSIBLE finding's
first dispatch is the test that settles it.

## The three candidates the brief named

| Candidate | Verdict | One line |
| --- | --- | --- |
| (a) `lib/frames` twins of `packages/domain` | **Dismissed as a twin, confirmed as an orphan** | Next has no remove-alt op, so `canRemoveAlt` guards nothing live, and the domain steps *are* tested. → F3 |
| (b) read-then-atomic-rename deadlock elsewhere | **Confirmed once more, narrower** | The blocking-retry rename has a second copy in the spend file store, and the Ledger reads that file async in the same process. → F4 |
| (c) v1 `Hint.tsx` / `Tally.tsx` pinned by probes | **Confirmed** | Two probes and one mutant pin dead v1 files. The live `@gt/ui` Hint has no tap test. → F3 |

Two findings outrank all three candidates, and neither was on the brief's list: F1 and F2.

---

## F1 · The part editors' logic lives in a route directory, so the gate re-derives it and the two can disagree

**Verdict:** CONFIRMED (structure). PLAUSIBLE (the explainer-gate defect).

**Evidence.**
- Every editor kind except research and script has its pure module (ops, view, verdict,
  `toRecords`) in `app/(studio)/projects/[id]/_part/fixture*.ts`. The registry is
  `app/(studio)/projects/[id]/_part/kinds.ts:90-101` (`LATER`: frames, motion, score, cut, words,
  render, article, strips, voice), imported at `kinds.ts:10-16`. The directory holds 4,457 lines
  in 27 files (`wc -l`), and the `fixture*` files are about 3,000 of them.
- The **real** side runs those same modules. `realScene.ts:14-17` imports `./fixtureResearch.ts`,
  `./fixtureScript.ts`, `./fixture.ts` and `./kinds.ts`. `realScene.ts:49` takes the verdict from
  `later(kind).verdict`, and `realScene.ts:113-122` takes the op from the module. `real.ts:19`
  imports `./fixtureActs.ts`. The `fixture` prefix is not accurate: these are the production
  reducers.
- `lib/` may not import `app/`: `tests/golden-path/no-app-imports.probe.spec.ts:26-33`, with an
  allowlist that holds only the compositor's importers. So the gate opener in `lib/parts/gates.ts`
  cannot call the kind module. It re-derives the verdict in `lib/parts/verdict.ts`
  (`gates.ts:23`, `gates.ts:243`, refusing at `gates.ts:273` unless the state is `ready`).
  `verdict.ts:26-27` states the split itself.
- The two cut verdicts already differ in what they derive. The editor's verdict is at
  `fixtureCut.ts:281-292`, and for the explainer family it derives the cut from strips and voice
  (`fixtureCut.ts:49` → `fixtureExplainer.ts:211`). Its own comment says so:
  "the explainer's is its own (strips and voice), which lib's cutVerdict does not derive"
  (`fixtureCut.ts:279`). The gate's verdict reads only the `frames` record (`verdict.ts:60`) and
  returns `empty: no picture to cut` when there are no frame units (`verdict.ts:172`). The
  explainer recipe gates its cut (`packages/catalog/src/recipes.ts:149-158`,
  `gate("cut", "packet-review")`) and plans no frames part.
- So on an explainer project, the cut editor can read **ready** while its gate refuses with
  `cut is empty: no picture to cut`. `tests/next-server/parts-finish.test.ts:157` covers the
  explainer on the fixture side only. No test opens an explainer's cut gate on the real side.

**Cost of leaving it.** Every card that touches a part's behaviour (see the M1 ranking below:
IMG-B, MUSIC-A's chip, text-engine-B, research-run-engine-B, SLP-B, frames-score-cut-A) lands its
logic in a route directory. There no CLI (`pipeline/decide.mts`), no worker and no package vitest
can reach it, and every gate-bearing rule then needs a second copy in `lib/parts/verdict.ts`. The
copies have drifted once already (the explainer).

**Smallest change that fixes it.**
1. Pin the defect with a failing test, then move `explainerCut` into `lib/cut/` so that
   `lib/parts/verdict.ts` `cutVerdict` derives the explainer's cut the way the editor does
   (dispatch 1).
2. Later and staged, one kind per lot: move `kinds.ts` and each `KindModule` from `_part/fixture*.ts`
   to `lib/parts/kinds/<kind>.ts`. The route keeps only the view wiring and the in-memory fixture
   store. `lib/parts/verdict.ts` then delegates to `kind.verdict` and is deleted branch by branch.
   This is L in total. It is not a single dispatch.

**Path scope.** `app/(studio)/projects/[id]/_part/**`, `lib/parts/{verdict,gates}.ts`, `lib/cut/`,
`tests/next-server/parts-*.test.ts`.

---

## F2 · Two spend windows: the kernel counts, the v1 file store enforces

**Verdict:** CONFIRMED.

**Evidence.**
- The plan said "`lib/spend/*` … **Keep as-is.** Build its SQLite adapter first; Jobs carry their
  reservation" (`docs/next/migration-plan.md:139`), with "`lib/spend` SQLite adapter" as a Phase 2
  item (`migration-plan.md:354`). The adapter was built as `packages/kernel/src/spend/v1Port.ts`,
  but it was never switched on. Its own header reads "WHAT THE SWITCH WOULD TAKE (not done here; a
  later phase's cutover)" (`v1Port.ts:26-36`), and `v1SpendStore` (`v1Port.ts:170`) has no caller
  outside its tests.
- Every vendor meter still picks the file store. See `lib/spend/select.ts` `spendStoreFor`, used by
  `lib/imaging/budget.ts:222-264`, `lib/imaging/video/budget.ts:49-77`, `lib/music/budget.ts:175-221`
  and `lib/text/spend.ts:61`. These write `foundry-out/spend/<class>.json`
  (`lib/spend/fileStore.ts:68-71`).
- The kernel books the same calls on the count-only `job-usd` class. See
  `packages/kernel/src/spend/meter.ts:42` `JOB_USD` (`ceiling: null`) and
  `packages/kernel/src/spend/projection.ts:23-26`. A producer says so outright: "The class is the
  count-only `job-usd`: v1's routers keep their own period windows" (`packages/producers/src/extract/define.ts:137-142`).
- The kernel's enforcing path for `imaging-usd` / `video-usd` / `music-audio-s`
  (`packages/kernel/src/router/reserve.ts:35-44`, `routeAndReserve` at `:94`) is imported only by
  `packages/kernel/src/spend/meter.ts` and `packages/kernel/test/router.driver.ts`. No class id
  appears in `lib/producers` or `packages/producers/src`.
- The Ledger's spend figures come from the file, not from `spend_rows`:
  `lib/ledger/v1/sources/spend.ts:13-14,96-103`.

**Cost of leaving it.** C3's "one spend meter for every vendor" holds per machine but not per store.
One dollar lands in two records with two retention rules. The kernel's spend tables cannot refuse a
paid image, so AUP-A's retarget ("per-principal spend attribution and ceilings in
`packages/kernel/src/spend/`", capture-pass-5.md:511) would put ceilings where nothing is enforced.
On the managed posture, the file store already falls back to one memory window per instance
(`lib/spend/select.ts` header), and SQLite is the only shared window the code has.

**Smallest change that fixes it.** Follow `v1Port.ts:26-36` step 1 for **one** class first:
`text-usd`, which is count-only by the operator's ruling (`router/reserve.ts:30-31`), so a mistake
there refuses nothing. Prove it with the meter's conformance kit, then move `imaging-usd`. This is
the money path, so it is an operator/App Master call, not a builder's (see Questions).

**Path scope.** `lib/spend/select.ts`, `packages/kernel/src/spend/v1Port.ts`,
`lib/ledger/v1/sources/spend.ts`, `packages/kernel/test/spend.v1port.test.ts`.

**Status (2026-10-19).** The operator ruled on 2026-10-18 "text-usd only". `e92204d3` moved
`text-usd` onto the kernel store (`lib/spend/sqliteStore.ts`, through `v1Port` `spendStoreFor`).
Every enforcing class (`imaging-usd`, `video-usd`, `music-audio-s` and the rest) stays on
`lib/spend/fileStore.ts`. Moving any enforcing class is still an open money-path decision for the
operator, and it reads together with AUP-A, which is operator-only. The constraint that forced the
ruling: the kernel's spend tables cannot refuse a paid image (see Cost of leaving it), and
`text-usd` is the one class that is count-only by the operator's ruling (`router/reserve.ts:30-31`),
so a mistake there refuses nothing. The alternative that lost was a full cutover of the enforcing
classes, which would put a money-path mistake where a paid call is refused or let through.

---

## F3 · Probes and mutants pin code that production no longer runs

**Verdict:** CONFIRMED (the pinning). PLAUSIBLE (the `@gt/ui` Hint tap gap).

**Evidence, by orphan.**
- **The AIO-A turn runner and ledger** (`lib/turns/runner.ts`, 375 lines; `lib/turns/ledger.ts`,
  332 lines). The only production entry, `app/api/turns/route.ts`, and the poster work kind
  `lib/turns/kinds/poster.ts` (added in `626ce8d`) were both deleted in `ed151a11`. `startTurn`
  (`runner.ts:215`) has no caller outside `tests/`. 13 golden-path probes drive it
  (`turn-ledger`, `turn-work-kind`, `turn-research`, `turn-frames`, `turn-recalibrate`,
  `turn-preview`, `turn-assemble-parity`, `research-retrieve`, `dispatch-strip`,
  `frames-route-e2e`, `recalibrate-route-e2e`, `frames-run-bounded`, `claude-run-bounded`).
  The producers reuse only the specs: `RESEARCH_SPEC.prepare/dispatch/settle`
  (`lib/producers/research.ts:228-241`), `FRAMES_SPEC` (`lib/producers/frames.ts:199-203`) and
  `RECALIBRATE_SPEC` (`lib/producers/script.ts:138-143`). The durable unit in Next is the kernel
  job.
- **Frames alternatives.** `canRemoveAlt`, `SYNTH_MARK` and `isSynthetic`
  (`lib/frames/alternatives/alts.ts:96-100`) are read only by
  `tests/golden-path/alt-last-one-stays.probe.spec.ts:21` and the mutant
  `alt-last-one-removable` (`tests/mutants/registry.ts:132-138`). Next's frames ops
  (`fixtureFrames.ts:120-258`) include `adopt-alt` and `render-alternative` but no removal, so the
  invariant guards nothing live. `lib/frames/records.ts` is read only by
  `step-records.probe` and `picture-unit.probe` (its header says "They go when the v1 step store
  does", `records.ts:1-8`). Candidate (a)'s "no vitest for steps" does not hold:
  `packages/kernel/test/parts.test.ts:4` drives `@gt/domain/steps/registry`, and the unit mutants
  `steps-future-downgraded` / `steps-frames-base64-kept` target `packages/domain/src/steps/{record,frames}.ts`
  (`tests/mutants-unit/registry.ts:2033-2048`). Nothing in `packages/domain` needs a twin before
  the lib copy goes.
- **v1 signal components.** `components/ui/signal/Hint.tsx` (285 lines) and `Tally.tsx` (168) have
  no production importer. The only `components/ui/signal` import in `app/` is `StaleBadge`
  (`app/_landing/parts.tsx:12`). `hint-tap.probe.spec.ts:62` transpiles the v1 Hint, and
  `chip-key-contrast.probe.spec.ts:25` plus the mutant `tally-key-opacity-low`
  (`tests/mutants/registry.ts:180-186`) read the v1 Tally. The live `@gt/ui` Hint
  (`packages/ui/src/components/hint/Hint.tsx:39-46`) opens on `pointerenter`/`focus` and closes on
  `pointerleave`, and its only test is the word-count law (`packages/ui/test/components/law.test.ts:68-83`).
  The defect the v1 probe was written for ("a touch user never saw the disclosure",
  `hint-tap.probe.spec.ts:1-7`) is unguarded on the component the screens draw.

**Cost of leaving it.** The probe count and the mutant kill rate both include retired code, so
"probes 1440 passed" and the per-wave kill counts (`c3ddb052`) overstate how much of the running
product they guard. Cards are also being retargeted onto the dead seam: production-script-probes-A's
retarget names `lib/turns/runner.ts` and a registry "beside" it (capture-pass-5.md:289-291).

**Smallest change that fixes it.** One orphan per lot. Retarget the probe onto the live code if it
guards a live rule (the Hint tap, the Tally contrast), and delete it with the orphan if it does not
(`canRemoveAlt`). Keep `UNGUARDED_PROBE_BUDGET` honest (`7ecf8eee` lowered it to 162). A probe that
moves must not raise it.

**Path scope.** `components/ui/signal/{Hint,Tally}.tsx`, `tests/golden-path/{hint-tap,chip-key-contrast,alt-last-one-stays}.probe.spec.ts`,
`tests/mutants/registry.ts`, `lib/frames/alternatives/alts.ts`, later `lib/turns/{runner,ledger}.ts`
and its 13 probes.

---

## F4 · The 6ecf6f6b deadlock shape has one more copy, on the spend ledger

**Verdict:** PLAUSIBLE (read end to end, not run).

**Evidence.**
- `6ecf6f6b` fixed an async `readFile` holding `styles.json` open while `renameRetrying`
  blocked the same thread in `Atomics.wait` (`packages/kernel/src/styles/export.ts:92-102`). That
  is the only `Atomics.wait` in `lib/`, `packages/`, `workers/`, `pipeline/` and `app/`. Other
  atomic-rename stores retry **asynchronously** (`packages/kernel/src/blob.ts:56-66`,
  `lib/imaging/video/store.ts:65`, `lib/sound/store.ts:202`), and a yielding retry lets the
  pending read finish, so those stores cannot self-deadlock.
- The second blocking retry is `lib/spend/fileStore.ts:90-107` `writeAtomic`: `renameSync` with a
  busy-wait `while (Date.now() < until);`, 21 tries of 5 ms each. It is the same shape as
  `export.ts`, with a shorter bound.
- The same file is read asynchronously by `lib/ledger/v1/sources/spend.ts:103`
  (`await readFile(file)`). It is walked by `liveNow` (`lib/ledger/v1/sources.ts:11,34`), which the
  `(studio)` shell calls on every page (`app/(studio)/_shell/live.ts:6,18`).
- The same Next process also writes that file. `lib/producers/style.ts:303-306` drives a style job
  "on this process", and it calls `lib/imaging/router` `generate` / `recognize`
  (`style.ts:46`), which settles through the imaging meter onto the file store.
- So if a page render's async read is in flight during a style job's settle, the rename can fail
  EPERM through every busy-wait retry, and the settle throws. A lost booking under-reports spend,
  which is the dangerous direction for an error here.
- A related residual on the fixed path: `writeStylesExport` renames **inside** `store.tx`
  (`export.ts:113-133`), so a retrying export holds the SQLite write lock and blocks the event loop
  for up to 10·(2⁹−1) ms ≈ 5.1 s.

**Cost of leaving it.** It is rare, and it hits the money path in the dev server and in the
single-process posture. A builder seeing EPERM in a probe will chase SQLite first, as happened
before `6ecf6f6b`.

**Smallest change that fixes it.** Read the spend file synchronously at
`lib/ledger/v1/sources/spend.ts:103` (`readFileSync`), as `6ecf6f6b` did for `ensureStyles`. Pin it
with a repeat test that interleaves a `writeAtomic` with `readSpend`. Moving the styles export's
rename out of the transaction is a separate, later lot.

**Path scope.** `lib/ledger/v1/sources/spend.ts`, one new test under `tests/next-server/`.

**Status (2026-10-19).** Landed `ca636fd2`: `lib/ledger/v1/sources/spend.ts` reads class files with
`readFileSync`, and `tests/next-server/spend-read-interleave.test.ts` runs 50 write/read rounds.
The rule: in one process, a read of a file that a writer replaces with a BLOCKING rename retry
(`renameRetrying` or `writeAtomic`'s busy-wait) must be synchronous, as `6ecf6f6b` did for
`ensureStyles` and `ca636fd2` did for spend. The residual that remains: `writeStylesExport` renames
inside `store.tx` (`packages/kernel/src/styles/export.ts`). That is a separate lot, being delivered
now; it has not landed.

---

## Milestone 1 against Next: the seam each cluster builds on

Capture pass 5 did not re-examine landed rows ("whether Next carries each of them forward is a
question for a later pass", capture-pass-5.md:44-46). All five M1 lead cards are landed rows (README
rows C1, C2, C3, C6, C7, `README.md:96-102`). Below, ordered from most to least ready, are the seam
each cluster now stands on and the open cards (pass-5 table, `README.md:27-50`) that still build on
it.

| Rank | Cluster | The seam in Next | Exists? | Open cards on it | Blocker |
| --- | --- | --- | --- | --- | --- |
| 1 | **C7** Foundry style → Library theme | style producer `adopt` (`packages/producers/src/style/define.ts:42`, `lib/producers/style.ts:241`), Atelier act (`app/(studio)/library/style/[id]/_atelier/Atelier.tsx:146,201`) | **Yes, wired** | `foundry-forge-A` (kernel `calibration/series.ts` built, no caller: capture-pass-5.md:545-557), `foundry-dojo-A`, `foundry-curation-B` (held) | none structural |
| 2 | **C1** your own notebook downstream | `NotebookSource` (`lib/notebook/source`, read by `_part/realResearch.ts:4` and `lib/producers/research.ts:35`); later kinds read the same project through `KCtx.rec` (`_part/kinds.ts:24-28`) | **Yes** | `research-run-engine-B` (trace + chip), `text-engine-B` (repair act) | F1: both land in `_part/`; operator decision on WebSearch |
| 3 | **C6** Outputs is this project's reel | kernel Library index with a `project` collection (`packages/domain/src/library.ts:83`), acts `pin` / `use-in-project` (`library.ts:371`), studio feed (`lib/library/feeds/studio.ts`) | **Yes, carry-forward unverified** | `SHELF-A` (poster, runtime, search on `ProjectSummary`), `library-assets-audio-A` | WORKSPACE-B's keep-on-shelf wrote a `lib/assets` upload row; `lib/assets` no longer exists. Whether `pin` is that act has not been checked. |
| 4 | **C2** durable server-owned turns | the kernel job (queue, worker, producers); turn kinds reused as specs only (F3) | **Yes, but cards target the dead runner** | `production-script-probes-A` (retarget names `lib/turns/runner.ts`), `pipeline-scripts-B` (tests/live fake-claude shim) | F3: retarget onto the producer path. T1's poster work kind ("keep what is paid for") left with `lib/turns/kinds/poster.ts` in `ed151a11`, and no Next carrier is cited. |
| 5 | **C3** one spend meter | kernel spend ledger + `v1Port` | **Half** (F2) | `AUP-A` (per-principal ceilings in kernel spend), `IMG-B`, `MUSIC-A` (both book through file windows) | F2 cutover (money path); AUP-A is an operator decision |

---

## Next three dispatches (in order, each one a single Sonnet lot)

1. **Explainer cut gate: prove it, then fix it.** First add `tests/next-server/parts-explainer-gate.test.ts`
   on the real side (temp `GRAVITONE_STORE_PATH`, dry). It seeds an explainer project whose strips
   and voice make the editor's cut verdict `ready`, then calls the gate opener in
   `lib/parts/gates.ts`. Expect a refusal today. If it is red, move `explainerCut` from
   `app/(studio)/projects/[id]/_part/fixtureExplainer.ts` into a new `lib/cut/explainer.ts`
   (re-imported by `fixtureExplainer.ts`), and give `lib/parts/verdict.ts` `cutVerdict` an
   explainer branch that derives from it. If it is green, write down why F1's PLAUSIBLE half was
   wrong and stop. *Paths:* `tests/next-server/parts-explainer-gate.test.ts`, `lib/cut/explainer.ts`,
   `lib/parts/verdict.ts`, `app/(studio)/projects/[id]/_part/fixtureExplainer.ts`. *Gates:*
   typecheck, `npm run test:unit`, `npm test`.
2. **Spend ledger read: close the 6ecf6f6b shape.** Write a test that interleaves
   `lib/spend/fileStore.ts` writes with `readSpend` (`lib/ledger/v1/sources/spend.ts`) in one
   process at `--repeat-each` ≥ 30, against a temp `SPEND_STORE_DIR`. Then make the read at
   `spend.ts:103` synchronous. Record the before and after failure counts in the commit. No change
   to the meter, the classes or `select.ts`. *Paths:* `lib/ledger/v1/sources/spend.ts`, one new
   test under `tests/next-server/`.
3. **Retarget the v1 signal probes onto `@gt/ui`, then delete the v1 Hint and Tally.** Point
   `hint-tap.probe.spec.ts` at `packages/ui/src/components/hint/Hint.tsx`. It must fail first if
   a tap closes the tip; if it does, fix the component in the same lot. Point the Tally case of
   `chip-key-contrast.probe.spec.ts` and the mutant `tally-key-opacity-low` at
   `packages/ui/src/components/tally/`. Delete `components/ui/signal/{Hint,Tally}.tsx`, keep
   `StaleBadge.tsx` (the landing still imports it), and leave `UNGUARDED_PROBE_BUDGET` no higher.
   *Paths:* the two probes, `tests/mutants/registry.ts`, `components/ui/signal/{Hint,Tally}.tsx`,
   `packages/ui/src/components/{hint,tally}/`.

After these three: retire `canRemoveAlt` and `alt-last-one-stays` (F3), then plan the
`lib/turns/{runner,ledger}.ts` retirement against its 13 probes, then the staged F1 move.

## Open questions (none decided here)

- **F2 spend cutover (money path).** Should `select.ts` move a class onto the kernel store through
  `v1Port`, starting with count-only `text-usd`? This is a risk on the money path, so it needs the
  operator or the App Master.
  **Status (2026-10-19):** the operator ruled on 2026-10-18 "text-usd only". `e92204d3` moved
  `text-usd` onto the kernel store (`lib/spend/sqliteStore.ts` via `v1Port` `spendStoreFor`); every
  enforcing class (`imaging-usd`, `video-usd`, `music-audio-s` and the rest) stays on
  `lib/spend/fileStore.ts`. Moving any enforcing class is still an open money-path decision for the
  operator, read together with AUP-A. A full cutover of the enforcing classes lost to the
  count-only-first ruling.
- **AUP-A** (operator-only, "creator data on a server"): its retarget assumes kernel spend enforces
  ceilings. Under F2 it does not yet. The decision and the cutover should be read together.
- **research-run-engine-B** (operator-only, WebSearch/WebFetch): this blocks the C1/C2 residue at
  rank 2.
- **C6 keep-on-shelf and C2's T1 poster ruling**: do the Library's `pin` act and the music-video
  producer carry them in Next? A later pass-5 follow-up over landed rows should answer this. This
  review did not verify either.
- The remaining operator-only items (`SLP-B` harness doctrine, `video-clip-pipeline-B` V2,
  `LOCK_PROBLEMS` ratification, `AUP-B` declined, `UI-SHELL-A` superseded) block no M1 card ranked
  above.
