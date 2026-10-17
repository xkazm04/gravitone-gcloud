---
name: train-style
memory: none
category: Development
description: Extract art styles from a folder of screenshots/images on the LOCAL stack - run the foundry's Extract engine over a gallery (read back → group → replicate from words with self-critique → transfer onto a neutral scene), read the results back with Claude's own eyes, then cull row by row and commit the kept styles into the kernel's style store (pipeline/foundry/styles.json is re-exported from it). Same engine as the kernel's extract producer (the browser Extract tab retired with /foundry); this is the operator's path when the gallery is a folder on disk. Invoke with /train-style <folder> [--slug name] [--rounds n] [--replicas n] [--transfers n] [--max n].
argument-hint: "<folder with images> [--slug name]"
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, Monitor
---

# Train Style — extract, replicate, transfer, keep

**The official path (operator's decision, 2026-08-28, after three measured runs):** GROUPED extraction — the
default `grouping: "engine"` — with the readbacks on the cloud eye and the synthesis turn on the LOCAL reasoning
model (rung 1 of the text ladder). `--singletons` is the diagnostic mode: best per-source replication, recipes that
overfit their one image; use it when grouping keeps failing or to build merge evidence for a cull, not as the
default.

A run is a kernel JOB (Phase 4: `lib/producers/extract.ts`, lane `cloud.google`). The CLI
`pipeline/foundry/extract.mts` enqueues it and drives it in-process; the worker (`workers/runner.mts`) drives it when the CLI is given `--detach`. Every path runs the same
engine (`lib/foundry/extract/engine.ts`), one unit at a time, and the job's slot lease means two drivers can
never step one run. Nothing in this skill re-implements a stage — if a stage needs to change, change the
engine, and every posture gets it.

What the run produces, under `foundry-out/extract/<run-id>/`:

```
run.json                       the manifest (every unit's result; the only state)
sources/sNN.jpg                the gallery as given
styles/<style>/replica-sNN-rK.jpg   round K of replicating source sNN from WORDS ONLY
styles/<style>/transfer-1.jpg       the recipe on a scene the gallery never showed
```

## Step 0 — preflight (no spend)

1. Confirm the folder exists and count the images: `Get-ChildItem "<folder>" | Measure-Object`.
2. Dry run — prints the receipt (the count, the worst-case cost, the queue position) and which keys are set,
   then runs the whole job on stand-ins: no vendor is called and nothing is spent, but a run directory IS
   created, marked `dry`, and it can never be committed (the Board shows no pile for it). Add `--json` for one
   machine-readable document:
   ```
   npx tsx pipeline/foundry/extract.mts "<folder>" --slug <slug> --dry
   ```
   - `GOOGLE_AI_API_KEY` must be set (pixels, and eyes on the hosted plan). `QWEN_API_KEY` is the dev-posture eye; without it recognition falls to Google — fine.
   - Words (the one `style-synthesis` turn) go through the text ladder: the local `claude` binary first, Gemini behind it. No key needed for rung 1.
   - The imaging budget window defaults to **$5 per hour**. A gallery of ~35 that groups into ~6–8 styles at 2×2 rounds + 1 transfer is ≈ $2. Over the window the run STOPS with an `over-budget` sentence; `--resume` continues when the window has moved. Raise `IMAGING_BUDGET_USD_PER_WINDOW` in `.env.local` only if the user says so.
3. A live run takes `--budget-usd <n>`: the job's own ceiling. The job stops before the unit that would cross
   it (the receipt refuses a launch whose WORST case is already over it — use a ceiling above the printed worst
   case, or fewer sources). `--resume <run-id> --budget-usd <higher>` continues a run stopped by it.
4. Say what it will cost and how long (≈ 5 s per read, ≈ 25 s per generate+read; 35 sources → ~3 min reads + ~15–20 min per 8 styles). Do not start a spend without the user having seen the number at least once in the session.

## Step 1 — run it, detached

Anything over ten minutes must not run in a Bash background task (it is killed at the ceiling — see the repo memory). Launch detached and watch the log:

```powershell
$log = "pipeline/foundry/logs/extract-<slug>.log"
Start-Process -FilePath "npx" -ArgumentList 'tsx','pipeline/foundry/extract.mts','"<folder>"','--slug','<slug>' -RedirectStandardOutput $log -RedirectStandardError "$log.err" -NoNewWindow
```

Then poll with Monitor (or `Get-Content $log -Tail 5`) until the summary table prints. The run id is on the
`launched <run-id> as job:run:<run-id>` line. If the budget trips or a vendor wall stops it (the job is `failed`),
resume — this is the operator's retry of the job: failed units are pruned and taken again, finished ones never
re-spent:

```
npx tsx pipeline/foundry/extract.mts --resume <run-id>
```

If the PROCESS died mid-unit the job is `interrupted` and its lane (`cloud.google`) is HELD: a step may have
been paid for. Look at the run first (`--status`), then acknowledge the lane on Runs (or the kernel's
`ackLane`) and `--resume`. Exit codes: 0 done · 1 failed, stopped or held · 2 usage.

`--status <run-id>` prints the job's state and the summary table at any time.

## Step 2 — read it back with your own eyes

The engine's scores are a grader's — a pre-filter, never a verdict. Before the cull, LOOK:

1. For each style in the table, `Read` 1–2 sources, the best replica, and the transfer.
2. Write a three-line read per style: *does the replica carry the sources' look* (materials, light, palette, edges — not the subject), *does the transfer still read as the same look on a scene the gallery never showed*, and *any veto* (text, a recognisable franchise element the generator smuggled in, a collapse to generic "AI painting").
3. Check the grouping against your eyes: a style with `grouped by partition` means the reasoning turn's answer was unusable — say so; two styles that look the same to you are a merge the user may want (they can keep both; the forge will show whether they diverge).
4. Note when the score and your eye disagree — that is the finding worth keeping (Step 4).

## Step 3 — the cull

Prefer the Board: the run is a pile in the Floor's image lane (`/floor?lane=image`), and it opens as `/board/pkt:extract:<run-id>`. A row is a look, a tile a cell: **K** keep, **X** reject, **1-4** the reasons (style, subject, text, craft), **U** clear, **Z** the lens, **⌫** undo, **⏎** shows what the commit will write (the looks kept into the style store, the rest deleted) before it is committed. A look is kept if any of its cells is. The Board refuses to commit while a cell is undecided, so decide them all (⇧K / ⇧X do a row). The kernel records the decision and delivers it to v1's own commit.

Headless, when the user has decided from your read:

```
npx tsx pipeline/foundry/extract.mts --commit <run-id> --keep <id,id> --reject <id>
```

Either way the commit (`lib/foundry/extract/store.ts`) writes the kept styles into the kernel store's `styles` table through `commitExtractStylesIn` (`packages/kernel/src/styles/writers.ts`): one transaction per commit, each style a row with its `style_ops` entry and ledger event, `candidate` with `origin.kind: "extracted"` and its exemplars as blobs. `pipeline/foundry/styles.json` is then re-exported from the store (`exportStyles`) for the Python readers; it is an EXPORT, never the record. The styles appear in the Library (`/library?kind=style`). Undecided counts as rejected. Nothing is deleted.

## Step 4 — harden

Append to `.claude/skills/train-style/LESSONS.md` (create it) one dated block per run: gallery, n, styles found, what the eye disagreed with the score on, any prompt/vocabulary change this argues for. A lesson that names a file in `lib/foundry/extract/` (`prompts.ts`, `vocabulary.ts`) is actionable; "the model was weird" is not. When a change is made, say which posture it also affects — every prompt edit ships to every extract run the kernel's producer drives too.

## What NOT to do

- Do not pass sources as reference images to the generator. The whole measurement is whether the RECIPE carries the look; a reference lets the pixels carry it and proves nothing.
- Do not raise the budget ceiling, change model ids, or edit `styles.json` by hand to "fix" a result. The catalogue is the store, written by commits; the next export overwrites a hand edit.
- Do not run two extractions concurrently on one key — they share the budget window and one will trip it.
