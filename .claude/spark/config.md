---
product: "Gravitone Studio"
stack: "Next.js 16 (App Router, Turbopack) + React 19 + TypeScript. packages/{catalog,domain,kernel,producers,ui} (@gt/*); a SQLite kernel store (GRAVITONE_STORE_PATH; never open foundry-out/gravitone.sqlite); screens in app/(studio)/ reading a _port (fixture side: _port/fixture*.ts); governed vendor seams in lib/<domain>/ run as kernel producers."
vault: [".vault"]
vault_subdir: Spark
context_map: context-map.json
base_branch: main
active_runs_ledger: ".vault/active-runs.md"
locale_count: 1
---

# spark overlay - gravitone-gcloud

Scaffolded 2026-08-27 from what this repo declares. The product brief, Class B/C registries and
Repo law are the same ones `.claude/perfect/config.md` carries - read that file's `## Product brief`,
`## Class B`, `## Class C`, `## Context sources` and `## Vetoes` sections as part of this overlay
(one copy, not two).

## Gates

- `always:` `npm run typecheck` (`tsc --noEmit`), `npm run lint` (eslint - ratcheted, see
  `npm run lint:ratchet`), and `npm run check:type` (the readable floor on the Tailwind leftovers:
  landing, root layout, dev inspector, `components/`; the (studio) world's 12px floor is held by
  `tokens:check` and the live probes). Missing from this list until 2026-10-04 - the pre-push hook
  caught a real `text-xs` violation this list would have caught earlier.
- `when lib/notebook/**, lib/script/** or the notebook schema changed:` `npm run check:notebook`,
  `npm run check:trailer-structure`.
- `the whole set:` `npm run verify` - declared once in `pipeline/gates.mts`.
- `when routing/layout/server code changed:` `npm run build` - once per spark, on the spark branch.
- `test:` `npm test` (Playwright golden-path probes; offline, no vendor billed) - run the FULL
  suite before any push, not a single spec. `npm run test:live` starts its own `next dev` on 3187 -
  never port 3000. 2026-10-04: a Director ran only `kit-catalog.probe.spec.ts` at each work package
  and before merge; the pre-push hook's full run caught a chrome-colour-literals failure
  (v1's `app/library/audio/audio-workbench.css` spelling hex/rgba instead of declaring tokens in
  v1's `components/ui/tokens.ts`; the CSS is deleted, and that tokens file now serves only the landing) that a full local run would have caught the same day it was written,
  not at push time two fix-commits later.
- `builder:` `npm run typecheck` AND `npm run lint:ratchet` (repo-wide: errors are held at 0; promoted 2026-10-14 after a `no-empty-object-type` error passed three builders' green reports and surfaced only at the Director's run - the second time a builder-scoped gate list missed a repo-wide check). For anything under `packages/`, also `npm run next-structure`, `npm run typecheck:next`, `npm run test:unit` and `npm run tokens:check`; a builder that changed a rendered surface must also drive it on a
  dev server of its own (`next dev -p 31xx`) and report what it saw. Builders NEVER stage and NEVER stash - only the
  Director touches the index. Smoke via a prod build on 31xx (a second `next dev` is refused while :3000 is held).
  **"Never stash" has now been violated twice** (2026-08-27, 2026-10-04 - the second a `git stash
  push -u` run WHILE a parallel builder was actively writing files in the same shared worktree,
  caught and recovered by the builder itself, no corruption found on Director verification - but
  "recovered cleanly" is not evidence the rule is optional). State it as an absolute in every builder
  brief's Rules section, not just the overlay: "never git stash, for any reason, even to diff against
  a clean baseline - a parallel package may be writing files in this same worktree right now."
  **Any `next dev`/`next build` run auto-appends `.next-<name>/types/**` entries to `tsconfig.json`
  as a side effect** - a builder claiming it reverted this needs it verified by the Director reading
  the actual committed diff, not trusted from the report (seen twice: 2026-09-05 as a bare lesson,
  2026-10-03 as a real leaked commit the Director caught and amended out).
- `worktree:` Turbopack refuses a worktree whose `node_modules` is a junction to the main checkout
  ("Symlink [project]/node_modules is invalid, it points out of the filesystem root"), for `next dev`
  AND `next build`. Builders run `next dev --webpack`. The Director's build is NOT `next build
  --webpack`: webpack's route-export typecheck is stricter and fails on untouched pre-existing routes
  (measured on v1's `api/foundry/extract` and `api/frames`, both deleted in Phase 6 wave C). Build with Turbopack after a TEMPORARY, never-committed line
  in next.config.ts: `nextConfig.turbopack = { ...nextConfig.turbopack, root: "<main checkout>" }`,
  then `npm run check:bundle`, then restore the file (copy it aside first). Measured 2026-10-05.
  **When the worktree is NOT under the main checkout** (the fleet guard now forces short paths, `git worktree add
  C:/t/<id>`), `root: "<main checkout>"` fails "distDirRoot should not navigate out of the projectPath": set `root` to
  the common ancestor (`"C:/"`), and before `check:bundle` strip the `[project]/t/<id>/` prefix that root puts on every
  key of `.next/server/**/*client-reference-manifest*` (sizes and env-name scans read the chunks, not the keys).
  The build also leaves symlinks in `.next/node_modules/` pointing INTO the main checkout's node_modules: rmdir every
  reparse point in the worktree (`Get-ChildItem -Recurse -Attributes ReparsePoint`) before `git worktree remove --force`.
  Measured 2026-10-24 (audio-postproduction-research).
  2026-10-23: that build now SUCCEEDS but `check:bundle` cannot read the worktree's manifest ("COULD NOT RUN: ... names no
  (studio) layout entry"). Measure on main right after the ff with `NEXT_DIST_DIR=.next-landing npm run build && NEXT_DIST_DIR=.next-landing npm run check:bundle`
  - the operator's dev server keeps `.next` - and land the budget raise as the next commit.
- `exit codes and the shared main (promoted 2026-10-24, scout-storyboards; the chained-exit trap's second bite after 2026-10-14):`
  never pipe a gate into `tail`/`grep` and then chain on it (`check:bundle | tail -2 && git commit` committed a partial budget
  raise because `tail` exited 0 and the truncated list hid ten routes) - run the gate bare or read `$?`/`PIPESTATUS`. And never
  `git commit --amend` (or rebase) on main in the main checkout: parallel sessions commit there every few minutes, and an amend
  meant for your commit rewrote another session's (repaired by `reset --soft <theirs>`). Land a follow-up commit instead.
- `tests/mutants-unit/registry.ts` on a busy main: put a spark's new mutants NEXT TO a related entry, never at the file's tail -
  every rebase onto a sweeping main conflicts on the tail append (two conflicts in one landing, 2026-10-24).
- `before merge:` re-run the landing overlap (`git status --short` of the main checkout against the branch's files) before
  the LAST package, not only at the gate: an unregistered session's uncommitted edit appeared mid-build (2026-10-23) and
  blocked the ff; tell the operator then.

## Rituals

- Phase 0: read `.vault/active-runs.md`, add an entry under `## Active` with declared paths, in the
  same bash invocation (never edit-then-commit across sessions). Always `git status` first.
  **Check BOTH directions of divergence before cutting a worktree**: `rev-list --count
  main..origin/main` AND `rev-list --count origin/main..main`. This repo routinely carries dozens
  of unpushed local commits (measured 2026-10-03: local 53 ahead, origin 3 ahead, both nonzero) -
  checking only the "behind" direction found real work (a whole theme system) sitting on the wrong
  side of a worktree cut, discovered only after two scouts ran against it and one had to
  self-correct mid-report.
- Phase 5: if source files were added/moved/deleted, run the map gate in `docs/context-map.md`; only
  the machine that owns the map scans (else append to `.vault/map-drift.md`).
- Phase 6: move the ledger entry to `## Recently completed` with the SHA and declared/not-touched
  paths.

## Repo law

See `.claude/perfect/config.md` `## Repo law` verbatim, plus:
- **A vendor-billing batch is rendered from an explicit id list, spawned WITHOUT a shell, after one
  dry call proves the arguments arrive whole** (measured 2026-10-24: `spawnSync(..., { shell: true })` split every
  prompt at its first space and ~7,650 ElevenLabs credits bought one-word takes; a title-matching rerun then
  re-rendered kept items). Say "live" in a commit or a report only for a path that made a real vendor call; a
  fake-fetch test is a stand-in and is called one.
- A step surface MUST be scouted against `knowledge/templates/<template>/steps/<step>/PATTERNS.md`
  and `params.json` before it is designed. "Commission the craft research" is a valid answer.
- `WORK_KINDS` and `RECIPES` in `packages/catalog/src/recipes.ts` are append-only registries
  (v1's `PHASES`/`TEMPLATES` in `lib/projects.ts` survive only for `lib/` readers).
- **Tree-wide probes judge files a builder never opens — name them in every brief.** An API route
  goes through `app/_server/route.ts` (`route()` and its `guard`), or is a reasoned public exemption
  in `imaging-auth.probe.spec.ts`; the probe derives the route list from disk. NO client-reachable module may
  spell a server-only env var NAME, not even in a dev fixture or a label (`check:bundle`; a dynamic
  import behind an inline NODE_ENV test did NOT keep the chunk out). All three surfaced only at the
  Director's verify on 2026-10-05, after six builders reported green.
- **Two more tree-wide probes a builder never opens (promoted 2026-10-23, bitten twice that day):** a new
  exported method on an API route needs its row in `tests/golden-path/deployment-cells.probe.spec.ts` AND, when
  `guard: "public"`, its stated reason in `tests/golden-path/access-only-401.probe.spec.ts`; and every test file
  under `packages/*/test` needs a mutant in `tests/mutants-unit/registry.ts` (its gate matches `find` with line endings NORMALISED, so a find carrying `
` never matches - write single-line finds; and the FILE's own endings follow the checkout - LF in the main checkout, CRLF in a spark worktree - so a scripted insert detects the file's newline before searching for an anchor; promoted 2026-10-25, the CRLF trap's second and third bites) - a changed line a mutant
  `find`s must be re-pointed - verified with `node pipeline/unit-mutants.mts --only <id>` AFTER the commit
  (it runs on HEAD in its own worktree, so an uncommitted edit reads `stale`).
- **A new packet source or ledger source has four homes no builder brief names by default (promoted 2026-10-23,
  scout-decision-graph - the third "tree-wide probe" trap):** its row in `tests/golden-path/runs-live.probe.spec.ts`
  `predicates()` AND `ledger-reconcile.probe.spec.ts` `SOURCES`; real work for it in `pipeline/fixtures/` (ledger-reconcile
  fails a source that tallies nothing); and every sibling pile that could show the same work twice (a scout-launched Suno
  take sat in pkt:suno and the Floor's suno pile). A page that stops being a redirect needs its bundle budget raised with
  the reason.
- **One builder per shared dispatch file.** When two packages add commands to one CLI (`pipeline/scout.mts`), the Director
  pre-wires EVERY block in WP-0 and builders fill modules only; otherwise a per-package commit needs a hand-built blob.
- **A new surface is built in the Watershed from `@gt/ui`** (`packages/ui/src/components/<dir>/`,
  `INVENTORY.md`; specimens at `/kit`), inside `app/(studio)/<route>/` with its `_port`. Dropdowns are
  `@gt/ui`'s `field/Field.tsx` `Select`, never a native `<select>`. (History: v1's Almanac
  `components/kit`, briefed as a reuse target on 2026-10-05, drew "like looking at wireframes"; it
  was deleted in Phase 6.)
- **Every new golden-path probe needs a probe mutant (promoted 2026-10-24, the second time - 5f45006c articles-medium, then
  mcp-conformance):** `tests/golden-path/mutant-registry.probe.spec.ts` holds UNGUARDED_PROBE_BUDGET (159) and fails the full
  `npm test` when a new `*.probe.spec.ts` has no entry in `tests/mutants/registry.ts` (probe mutants, not tests/mutants-unit).
  Name it Director-owned in every brief that adds a probe; verify with `npx tsx pipeline/probe-mutants.mts --only <id>`.
- **A lib/ consumer of a produce receipt imports the Floor's lane doors from `lib/produce/laneDoors.ts`** (moved out of app/
  2026-10-24); a design that puts a Board adapter or worker over a server function must check, at scout time, that the
  function is importable from lib/ (no-app-imports) - liveness rule 5 applies to adapters, not only to screens.
- **New wire identifiers are grepped for collisions before the brief names them** (event types, packet/ledger source ids,
  env vars): `spend.*` and the ledger source `spend` were both taken (2026-10-24).
- Prompts live in `pipeline/*-PROMPT.md` and are read by the code (`lib/<domain>/`, run by
  `lib/producers/`); a prompt change is a code change and its regression control
  (`pipeline/*-regression.mts`) runs.

## Wave defaults

One AskUserQuestion call of up to 4 questions per wave.

## Question taste

- 2026-08-27: operator picks the fuller surface over the minimal seam when the types already exist (overrode "persist + minimal read" → full trailer Script; "no cue" → fixture cue). Offer the full option first when the vocabulary is already in the repo.
- Decide by convention, do not ask: untagged records = visible everywhere (honest-absence law); verdict panels follow GatePanel.
- 2026-08-30 (dojo): operator prefers keeping cross-machine workflows INSIDE the product (a second gravitone checkout on the GPU box) over external glue (file sync, upload routes), and prefers the measured option over the pre-decided one (ship both judges, let cycle data pick). Offer "the app travels to the data" and "measure it in v1" options explicitly.
- 2026-08-30 (card-decision-engine): on visual/motion ambition the operator picks the BOLDER option — framer-motion physics over the CSS-only recommendation, and “prototype all three art variants behind a switcher, we pick or fuse” over choosing one. Offer the ambitious option as a first-class choice, not a warning-wrapped afterthought; a real dependency cost stated in the option text is an acceptable price, not a veto.
- 2026-08-30 (card-decision-engine, round 2): showcase card art is for CURATED choices (few, fixed, art-worthy); GENERATED content gets the dense reading face — scannable title in the body font, icon watermark instead of an art zone, metadata behind an expand, front limited to the decision state + the honest downside. “The title carries the idea; the user expands if not certain.” Long generated titles are a data-contract defect to fix at the prompt (claim = headline ≤ 90 chars), with a UI splitter only as the reader for old data.

- 2026-10-24 (audio-postproduction-research): operator keeps ONE spark over a recommended 4-way split when the parts
  share a seam (6 WPs shipped fine); picks the LLM-driven creative path (chain written from a description) over a preset
  library; picks the smaller infra option (catalog default voice) when the creative part is elsewhere; keeps risky options
  (static analysis of trial binaries) as a named contingency rather than dropping them. Mid-build scope additions that
  close a dead end ("add WP5") are welcome as one targeted question.
- 2026-10-23 (scout-decision-graph): the operator stages generated media as a LADDER judged per rung (track -> visualizer -> full video -> Short; a Short never from the cheap rung) - offer the staged option first. Reasons are mandatory even on cheap words, with an optional note; offer `required + note` rather than `optional`.
- 2026-10-23 (scout-muse): on a new generative lane the operator defers what research can decide ("decide based on the research" for reject reasons), stops at concept until the end goal is known (3D = Leonardo concept stills, no mesh), and prefers a cheap direction check over quality (50 stills at studio quality Low). Offer `research first, then decide` and `concept only` as options, and size a first batch as a direction check.

- 2026-10-24 (athena-control-mcp): on INFRASTRUCTURE the operator picks the simplest mechanism over the recommended richer one - hand-rolled over an SDK dependency, poll over subscribe, fewer gate cards for speed, and no spend authority for an agent (dry + a confirm packet) - while on SCOPE picking everything (all four families) and accepting a staged split. Offer the no-dependency / simplest option as a first-class choice; scout a pricing field's real shape (priced vs unpriced lines) BEFORE asking a '$0' question.

- 2026-10-24 (scout-storyboards): every pick Recommended except the header, where the operator kept spend GLOBAL while moving NEXT into the Scout header - a
  number the operator watches everywhere stays everywhere; offer "move X, keep Y global" when a spark relocates shell chrome.
- 2026-10-30: for creative pipelines the operator judges at the frame, and wants options shown as rendered artefacts (boards), not described; ask 'which of these' over 'which approach'.

## Skill improvement log

- 2026-08-27 · Next 16 refuses a second `next dev` while :3000 is held — builders must smoke via `NEXT_PUBLIC_LOCAL_MODE=1 npm run build && npx next start -p 31xx`; say so in every builder brief. Builder briefs must forbid `git stash` explicitly (one ran it). Bridge auth = header `x-personas-local-token`.
- 2026-08-30 · A UI builder's smoke server outlived its "killed" report and held next-swc, blocking worktree deletion — before `git worktree remove`, check the builder's port is dead (`Get-NetTCPConnection -LocalPort 31xx`). Also: the harness shell cwd persists across calls — a merge run while cwd is inside the worktree merges the branch into itself ("Already up to date" is the tell); cd to the main checkout explicitly. `.ai/manifest.yaml` skills-list additions can ride a concurrent session's WIP commit when that session is already appending to the same list — say so in both ledgers.
- 2026-08-30 · Parallel builders running tree-wide gates cross-attribute failures (WP2's ratchet run caught WP3's committed lint rise; WP4 was transiently blamed) — keep requiring every builder report to split “my files” vs “the tree”, it made attribution instant. Pre-committing shared-file types (stepStore) as a Director commit before the parallel fan-out prevented the only write collision. Scout rule worth asking: “what does the consumer write on MERE hydration?” — useVersions saves an empty record on open, which killed a brief's record-existence default. The active-runs `## Active` entry can be dropped by a concurrent session's rewrite — re-read it at wrap and restate completion under Recently completed rather than assuming the entry survived.
- 2026-10-05 (platform-consolidation, 6 parallel builders) · WP0 Director commit of wire types + an explicit HTTP contract (shapes, status codes, error body) let engine, UI and a third consumer build in parallel with zero contract drift; SendMessage to running builders delivered a mid-flight decision (access header) without a rework round. Every wave answer was the Recommended option — the operator delegates shape when options are scouted. A literal reading of "keep ported, delete Live" would have shipped a static iframe; the scout's naming check (which variant is the real implementation?) was the highest-value question of the run. Promoted to Gates/Repo law this run: Turbopack-in-worktree build recipe; tree-wide probes list.
- 2026-10-05 (platform-consolidation round 3) · Giving each parallel builder its OWN scratch subdir in the brief (round 2 shared one: a builder overwrote another's capture script and rm -rf'd a mangled path) produced zero collisions across three builders. A Director audit diffing the old surface (`git show <sha>^:file`) against the chosen variant turned "it seems we don't display data anymore" into an exact restore list in one scout pass — use it whenever an operator reports lost information after a redesign.
- 2026-10-06 (ads-project-type, 4 builders, base moved 21 commits mid-spark) · Re-run the FULL suite after every rebase onto a moving base: each rebase surfaced a tree-wide probe no package could have seen (bell-doors hand-lists JobKinds; a new step-verdicts probe pinned "cut has no reporter"; gate-registry wants every regression as an npm script), and one parallel merge added a SIXTH studio step with no discipline routing — a mid-build design fork the operator had to answer. A builder's "I looked at the extracted frame" missed a 43px off-centre CTA the Director saw at a glance: a visual acceptance criterion must name the MEASUREMENT (content bbox centre within N px), not the act of looking. The operator-approved live smoke earned its cost on its first call: one of three vendor model ids copied from a reference script was invalid at the vendor, invisible to every fake-backed probe.
- 2026-10-14 (watershed-code-quality, 3 builders in the main checkout) · A design brief's own rules can contradict each other: "@gt/ui sees @gt/domain type-only" plus "JSON.parse only in the domain door" left the token pipeline no legal door - the new structure gate caught it on its first real-tree run. Check a brief's invariants against each other before dispatch. Also: a one-line `cmd /c a & echo %ERRORLEVEL%` chain prints 0 after a failure (expansion happens at parse time) - read the runner's summary line, never a chained exit code. The overlay's `vault:` still names the other machine; this run used the repo's `.vault/Spark`.
- 2026-10-22 (game-3d-assets WP1, worktree) · A node_modules JUNCTION to the main checkout makes @gt/* resolve to MAIN's packages/, so tsc/vitest in a worktree never see the worktree's package edits (typecheck:next failed on a lane the worktree added). The builder rebuilt node_modules as per-entry junctions with @gt/{catalog,domain,kernel,producers,ui} pointing at the worktree's packages. Do that at worktree creation. Also: when the main checkout is on another session's branch, land a fast-forward with `git fetch . <branch>:main` - no checkout touched.
- 2026-10-24 (audio-postproduction-research, 5 builders in one short-path worktree) · Scout traced the CONSUMERS of a
  new record but not the DELIVERABLE's entry: the explainer export died at `cutView` counting frames ("no picture to
  cut"), found by a builder, added as WP5 mid-build - apply liveness rule 1 to the output path (user action -> artefact),
  not only to surfaces. A Director WP0 contract shipped a ledger key the event door refuses (`audio.accept:`); a WP0 that
  names a key/id format needs one test through the door it will pass. A "live arming" wave must list every act whose
  purpose needs a live call (fx-line shipped dry until review). Mutant entries returned as scratch `mutants.ts` and merged
  by the Director: zero registry collisions across 5 builders. Resuming a finished builder with SendMessage for a test
  rework cost a fraction of a new brief.
- 2026-10-24 (explainer-real-article-strips) · A gate shipped green in the previous spark was red on main: its builder
  wrote the prompt LF in the worktree, a checkout gives CRLF, the parser matched only 
. **After every ff-merge, re-run
  the spark's new check:* gates in the MAIN checkout** (fresh files from git), and prove any text-parsing gate on a CRLF
  copy. Also: a fan-out of a priced act must state in the brief how the confirmed ceiling divides (a builder copied it
  to every job); one real unit at the go-gate ($2.67) surfaced a gate near-miss no fake could (rounds 1 -> 2); inline
  nested quoting mangled paths three times in one session - write scripts to files.
- 2026-10-24 (audio session, end) · The repo-specific lesson seen twice - nested shell quoting corrupting a path or an argument
  (junction targets, a .cmd, a Python regex, then a spawn that split prompts) - is promoted to Repo law above. A plan
  document is worth a verified / not-verified ledger: this session's "live" TTS, LLM chains and voice FX were all
  exercised only by fakes or fixtures, which commit messages alone did not show. When the operator redirects the whole
  session's scope, stop building, write the plan, and end - do not widen the next spark.
- 2026-10-23 (registry-feedback-loop, 3 builders, one in a sibling repo) · The brief hung an event on a function that does not exist (`planExtractCommit().promotions`); the builder stubbed it as a hook rather than invent it - liveness rule 6 should name the function for every EVENT, not just every field. Two builders hand-rolled a second reader of the sibling repo's location; name the existing reader (`lib/articles/registryRead` `manifestRegistryLocal`) in the brief. An agent shell's `npm run verify` lacks the winget ffmpeg: put the `.env.local` FFMPEG folder on PATH first (3 false reds otherwise).
- 2026-10-23 (stats-reels, 2 builders in a worktree) · Before removing a worktree, count junctions whose target lies outside it in a SEPARATE step and read the count first; build the root with `Resolve-Path` (backslashes) - a `pwd -W` root (forward slashes) never prefixes a junction's target, so every junction reads as outward and the check is noise. Also: an active-runs `BUILDING` entry went stale within the hour (its spark had landed) - check `git log main` for a sibling's WP commits before designing beside it.
- 2026-10-23 (scout-idea-artboards WP-I4) · Read a gate run's FULL failure list - a head -20 of the log hid access-only-401 behind deployment-cells and I reported the rest green. The operator's purpose doctrine (YouTube video only; notes as direction confirmations) arrived after a triage: for a generative loop, wave 1 should ask what the output is FOR.
- 2026-10-23 (night-load-band, 3 parallel builders) · `tests/mutants-unit/registry.ts` is a shared file every package's new test needs an entry in - all three builders found it red and proposed an entry they could not write. Name it Director-owned in every brief that adds a package test, and ask each builder to return its entry (find/replace/why, verified by hand) in the report.
- 2026-10-23 (scout-decision-graph, 3 builders, 4 waves) · Promoted to Repo law: a new packet/ledger source's probe rows, fixture work and sibling piles; one builder per shared CLI dispatch file. Promoted to Gates: check:bundle on main via NEXT_DIST_DIR after the ff; the landing overlap re-checked before the last package. A wave-1 contradiction (a scope pick against a firmness pick) was settled by one synthesis question; the operator's two 'Other' answers were doctrines (mandatory reason + note; a media LADDER judged per rung) and the second split the spark.
- 2026-10-23 (scout-muse, 3 builders in a worktree) · A vendor UI driver's VALUES are a liveness item: the brief chose a 4:5 poster from the project's Aspect type, and the studio page has no 4:5 radio - found on the first live still (no spend: the driver refuses before Generate). Scout the control values the driver can click (its recon comments, or a CDP read of the page) before a brief names one. A Board source binds at most 11 reason keys (packages/domain source.test) and `scout` uses all 11 - a design that adds reasons must check that first. A long-lived worker (Gravitone worker task) keeps pre-merge producer code: restart it after a merge that changes a producer's request schema, and kill the node child by pid (Stop-ScheduledTask leaves it). The registry map had no row for the scout contexts, so the subjects were read late and rewrote the brief's prompt order; search the bundle index by keyword before wave 1 when the map is silent.
- 2026-10-24 (athena-control-mcp, 3 builders + 2 Director packages, worktree) · `pipeline/unit-mutants.mts` has NO help flag: any unrecognised argument runs the WHOLE unit registry (~1h, CPU that flakes worker-lanes/publish-timers in a parallel gate run); always pass `--only <id>...`. Killing it mid-run leaves a mutated file in its scratch tree - restore it and remove the tree (junctions first) before the next run, which otherwise fails 'already exists'. Measured: `git worktree remove --force` on a tree whose node_modules entries junction to main's unlinked them without following (main 418 -> 418), but count first anyway. Briefs as scratch files paid off again: WP2 took post-WP1 amendments as an appended section. The kernel refuses non-operator actors for retry / requeueing reroute / ackLane (job.ts:316,359, job-queue.ts:112) - a design that hands an agent those verbs must widen the kernel, not just the door.
- 2026-10-24 (scout-storyboards, 5 builders) · The scout reported a policy (idea door names rule) from a COMMENT; liveness rule 6 (a policy exists only if something computes it) caught it at review, not at scout time - ask the scout to name the function. Briefs said "drive a fixture packet" but the Board reads the real side only: scout the route's port SIDE before writing a drive step. Promoted to Gates this run: exit codes through pipes + no amend on main; mutant entries not at the tail.
- 2026-10-25 (scout-vision S1, 2 builders, worktree) · This repo mixes CRLF and LF: a Director's scripted replace that did not ASSERT its match count silently missed on CRLF (types.ts) and a field shipped under the old name; every scripted edit asserts count==1 and normalizes line endings. Git Bash heredocs failed twice on prose with quotes - write edit scripts with the Write tool and run them. A compound spark (operator picked every scope item) staged as gated stages in one spark kept wave 3 focused on S1 only; asking at each stage's gate defers questions until the earlier stage has taught something.
- 2026-10-25 (scout-vision S2, 4 builders + Director packages, worktree) · `node pipeline/unit-mutants.mts` run from INSIDE a spark worktree creates a nested `.claude/worktrees/mutants-unit` worktree there; after removing the spark worktree, `git worktree prune --dry-run -v` then `prune` (it only drops entries whose directory is gone). WP0 stubs that export no ModuleMigrations kept kernel.test green while the kernel builder ran in parallel (a stub migration would have failed the DECLARED-set check). Holding a UI package's commit until the lib package whose stub it calls has landed avoided a committed state where the real Library feed throws.
- 2026-10-25 (scout-vision S3, 3 parallel builders) · Worktree hygiene, both traps hit in one cut: `git worktree remove --force` LEFT the directory behind (the nested `.claude/worktrees/mutants-unit` that unit-mutants creates inside a spark worktree survived), and a failed `git worktree add -b` still CREATED the branch; the junction script then wrote 416 junctions into a plain directory. Fix used and to repeat: guard the junction script on `<wt>/.git` being a file; before `remove`, unlink EVERY reparse point under the worktree (deepest first), then remove, then `test -e` the path; re-add on an existing branch without `-b`. Three packages that import each other (doors <-> cast door <-> readers) landed as ONE commit naming them, rather than a split whose middle states do not build.
- 2026-10-30 music-clip: landing overlap must include the BASE's lag - local main 100 behind origin with operator WIP in files that gap touches blocked the ff although every brief file was new; check `git diff --name-only main origin/main` against `git status --short` at the go-gate. Also: a docs builder briefed to report contract inconsistencies caught 3 wire gaps while the code builders were still running.
- 2026-10-30 music-clip (2): a creative-output spark must research the QUALITY BAR before wave 1, not only feasibility - the dialog accepted 'pure web tech' with no reference for what good looks like and Board B shipped a slideshow; after three research passes + rendered treatments the operator picked within one board. Also: check the render HARDWARE path at scout time (headless Chromium could reach the GPU all along; the reused strips flags turned it off).
