---
name: train-style
memory: none
category: Development
description: Extract art styles from a folder of screenshots/images on the LOCAL stack - run the foundry's Extract engine over a gallery (read back → group → replicate from words with self-critique → transfer onto a neutral scene), read the results back with Claude's own eyes, then cull row by row and write the kept styles into pipeline/foundry/styles.json. Same engine the /foundry Extract tab drives in the browser; this is the operator's path when the gallery is a folder on disk. Invoke with /train-style <folder> [--slug name] [--rounds n] [--replicas n] [--transfers n] [--max n].
argument-hint: "<folder with images> [--slug name]"
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, Monitor
---

# Train Style — extract, replicate, transfer, keep

**The official path (operator's decision, 2026-08-28, after three measured runs):** GROUPED extraction — the
default `grouping: "engine"` — with the readbacks on the cloud eye and the synthesis turn on the LOCAL reasoning
model (rung 1 of the text ladder). `--singletons` is the diagnostic mode: best per-source replication, recipes that
overfit their one image; use it when grouping keeps failing or to build merge evidence for a cull, not as the
default.

One logical layer serves two postures. In the hosted app the browser drives
`lib/foundry/extract/engine.ts` one unit per request; here the CLI
`pipeline/foundry/extract.mts` drives the same engine in-process. Nothing in
this skill re-implements a stage — if a stage needs to change, change the
engine, and both postures get it.

What the run produces, under `foundry-out/extract/<run-id>/`:

```
run.json                       the manifest (every unit's result; the only state)
sources/sNN.jpg                the gallery as given
styles/<style>/replica-sNN-rK.jpg   round K of replicating source sNN from WORDS ONLY
styles/<style>/transfer-1.jpg       the recipe on a scene the gallery never showed
```

## Step 0 — preflight (no spend)

1. Confirm the folder exists and count the images: `Get-ChildItem "<folder>" | Measure-Object`.
2. Dry run — prints the count, the worst-case cost, the budget window and which keys are set:
   ```
   npx tsx pipeline/foundry/extract.mts "<folder>" --slug <slug> --dry
   ```
   - `GOOGLE_AI_API_KEY` must be set (pixels, and eyes on the hosted plan). `QWEN_API_KEY` is the dev-posture eye; without it recognition falls to Google — fine.
   - Words (the one `style-synthesis` turn) go through the text ladder: the local `claude` binary first, Gemini behind it. No key needed for rung 1.
   - The imaging budget window defaults to **$5 per hour**. A gallery of ~35 that groups into ~6–8 styles at 2×2 rounds + 1 transfer is ≈ $2. Over the window the run STOPS with an `over-budget` sentence; `--resume` continues when the window has moved. Raise `IMAGING_BUDGET_USD_PER_WINDOW` in `.env.local` only if the user says so.
3. Say what it will cost and how long (≈ 5 s per read, ≈ 25 s per generate+read; 35 sources → ~3 min reads + ~15–20 min per 8 styles). Do not start a spend without the user having seen the number at least once in the session.

## Step 1 — run it, detached

Anything over ten minutes must not run in a Bash background task (it is killed at the ceiling — see the repo memory). Launch detached and watch the log:

```powershell
$log = "pipeline/foundry/logs/extract-<slug>.log"
Start-Process -FilePath "npx" -ArgumentList 'tsx','pipeline/foundry/extract.mts','"<folder>"','--slug','<slug>' -RedirectStandardOutput $log -RedirectStandardError "$log.err" -NoNewWindow
```

Then poll with Monitor (or `Get-Content $log -Tail 5`) until the summary table prints. The run id is the first line (`created <id>`). If the process dies or the budget trips, resume:

```
npx tsx pipeline/foundry/extract.mts --resume <run-id>
```

`--status <run-id>` prints the summary table at any time; it is also what the manifest's `progress` shows in the app.

## Step 2 — read it back with your own eyes

The engine's scores are a grader's — a pre-filter, never a verdict. Before the cull, LOOK:

1. For each style in the table, `Read` 1–2 sources, the best replica, and the transfer.
2. Write a three-line read per style: *does the replica carry the sources' look* (materials, light, palette, edges — not the subject), *does the transfer still read as the same look on a scene the gallery never showed*, and *any veto* (text, a recognisable franchise element the generator smuggled in, a collapse to generic "AI painting").
3. Check the grouping against your eyes: a style with `grouped by partition` means the reasoning turn's answer was unusable — say so; two styles that look the same to you are a merge the user may want (they can keep both; the forge will show whether they diverge).
4. Note when the score and your eye disagree — that is the finding worth keeping (Step 4).

## Step 3 — the cull

Prefer the app: `http://localhost:3001/foundry` → **Extract** → the run. Same keys as the Cull: ↑↓ move, **K** keep, **X** reject, **U** clear, **Enter** inspects the focused row (any tile zooms with its prompt/critique/readback behind it), then **Commit the kept styles**. The dev server is usually already on :3001 (repo memory); do not start a second one.

Headless, when the user has decided from your read:

```
npx tsx pipeline/foundry/extract.mts --commit <run-id> --keep <id,id> --reject <id>
```

Either way the kept styles land in `pipeline/foundry/styles.json` as `candidate` entries with `origin.kind: "extracted"` and `exemplars`, and appear on `/foundry` → Styles. Undecided counts as rejected. Nothing is deleted.

## Step 4 — harden

Append to `.claude/skills/train-style/LESSONS.md` (create it) one dated block per run: gallery, n, styles found, what the eye disagreed with the score on, any prompt/vocabulary change this argues for. A lesson that names a file in `lib/foundry/extract/` (`prompts.ts`, `vocabulary.ts`) is actionable; "the model was weird" is not. When a change is made, say which posture it also affects — every prompt edit ships to the hosted Extract tab too.

## What NOT to do

- Do not pass sources as reference images to the generator. The whole measurement is whether the RECIPE carries the look; a reference lets the pixels carry it and proves nothing.
- Do not raise the budget ceiling, change model ids, or edit `styles.json` by hand to "fix" a result. The catalogue is written by commits.
- Do not run two extractions concurrently on one key — they share the budget window and one will trip it.
