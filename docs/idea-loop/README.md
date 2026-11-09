# The idea loop

Ideas scored for what the operator will keep, storyboarded through the Codex CLI, triaged on the Board.
No video is made here.

## Stage 1: headless Codex image generation

**Proven 2026-11-08** by `pipeline/idea-loop/codex-image-proof.mts`, codex-cli 0.166.0, `codex login status`
"Logged in using ChatGPT".

| Evidence | Value |
| --- | --- |
| Exit code | 0 |
| PNG | 1672x941, 2,975,979 bytes, fully decoded |
| Content | 100,236 distinct colours in the sampled columns, luma deviation 33.09, and opened by eye: the prompted scene |
| Wall time | 46.9 s |
| Key-shaped variables in the child | none |
| Real draws used | 1 |

How it runs: `codex exec --json --ephemeral --ignore-user-config --ignore-rules --enable image_generation
--sandbox read-only`, prompt on stdin, no TTY. The built-in tool writes to
`$CODEX_HOME/generated_images/<thread>/`; the thread comes from the `thread.started` event. The tool call does
not appear among the `item.completed` events and the exit code does not depend on it, so the file is the only
evidence that counts.

The stock `reviewerEnv` pattern does not match a name like `ANTHROPIC_KEY_LANE_X`, so the image child strips
every variable whose name contains `KEY`, and every `OPENAI_*`, on top of it.

## Stage 2: generator and scorer

`lib/foundry/scout/idea-loop/`. `pipeline/idea-loop/run.mts` runs one pass.

The prediction is **what the operator will keep**. The training data is `night.committed` over idea artboards.
Each verdict is scored out of fold and measured through `lib/foundry/calibration.ts`: same statuses, same floor
(8 keeps and 8 throws).

The bar's AUC covers idea artboard prompts (title + genre + prompt) and nothing else; the loop scores storyboard
treatments, which it was not measured on. `IdeaBar.measuredOn` carries this and `barLine` prints it.

**Verdicts counted 2026-11-08: n = 0. Status `insufficient`. The bar (0.5) is provisional and nothing here is
calibrated.** This machine holds no scout night manifest (no `foundry-out/scout-nights/` or `foundry-out/scout/`),
and a temp copy of the store has 0 rows in `decisions` and `packet_commits`. The `verdict.*` events in it sit on forge
candidates, styles, improvements and cards; none is on an idea.

Under a provisional bar every idea scores 0.5 and clears it, so the bar selects nothing yet. The operator's triage on
the Board is the only gate until both classes reach the floor. `chance` and `inverted` get the same provisional bar;
only `calibrated` gets a measured cut.

## Stage 3: storyboards drawn by Codex

```bash
npx tsx pipeline/idea-loop/run.mts --count 3 --panels 3 --top 1 --briefs briefs.json
npx tsx pipeline/scout.mts storyboard <night> --draw codex --json briefs.json
```

`--draw codex` draws every panel through `lib/foundry/scout/codexDraw.ts`. Nothing changes without the option.

- A brief names `fromLoop: il-YYYYMMDD-NNN`, which the door checks against the idea's record: it must have cleared the
  bar. The candidate names `idea-loop/<id>` as its idea.
- **No kernel job.** A job can be claimed by the worker, whose bound engine is Flux, and the job books `FLUX_MODEL` on
  every panel. Drawing in-process is what makes "never falls back to Flux" true, so `--detach` is refused, and so are
  `genre` (a trial clips video) and `cast` (reference sheets).
- A panel failed by a non-zero exit, a missing or blank image, or a refusal that exited 0 stays failed. Nothing retries.
- A dry night draws nothing, and `GRAVITONE_DRY_ONLY=1` refuses a live night, as on every other launch.

**Proven 2026-11-08 on a temp store only**, not the operator's Board: the generator wrote 3 ideas (1 Codex text call),
the idea `il-20261108-001` was drawn 3/3 panels, 165 s wall, `jobIds: []`. Panels decode at 1672x941 and show the scenes.

**Real Codex draws in this build: 4** (1 in stage 1, 3 in stage 3).

Each panel is an independent Codex call with no reference image and no seed, so characters do not carry between panels:
in the proof storyboard the street cleaner is a man in panel 1 and a woman in panels 2 and 3.

## Operator rulings

**2026-11-09, machine-passed ideas go straight to storyboards.** The `fromLoop` path stands as built: a brief naming
`fromLoop: il-YYYYMMDD-NNN` is checked against the idea's record by the door, and no human step sits between the
scorer's pass and the storyboard. The human triages on the Board.

**2026-11-09, a Codex draw needs no priced receipt.** Codex is part of the monthly subscription. The receipt behaviour
stands as built: a Codex night prints one line, `no metered charge · no job`, and prices nothing.

Every storyboard panel is drawn by Codex.

### Open

- Panel character consistency: the operator has not ruled.
- The Firebase deferral: the operator has not ruled.
