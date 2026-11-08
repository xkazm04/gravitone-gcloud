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

**Verdicts counted 2026-11-08: n = 0. Status `insufficient`. The bar (0.5) is provisional and nothing here is
calibrated.** This machine holds no scout night manifest (no `foundry-out/scout-nights/` or `foundry-out/scout/`),
and a temp copy of the store has 0 rows in `decisions` and `packet_commits`. Those 58 keeps and 114 rejects in its
events are image-level forge verdicts, not idea verdicts.

Under a provisional bar every idea scores 0.5 and clears it, so the bar selects nothing yet. The operator's triage on
the Board is the only gate until both classes reach the floor. `chance` and `inverted` get the same provisional bar;
only `calibrated` gets a measured cut.
