# The idea loop persona

`idea-loop.persona.json` is a Personas `.persona.json` bundle, schema version 1. Import it through the Personas app's
persona import, with the app open. This build did not import it and has not run it through the importer.

The importer names it "Gravitone Idea Loop (imported)" and creates it disabled, and its trigger is stored disabled too.
Enable both once the first manual run looks right.

## What it runs

One pass, against the operator's real store, in this order:

1. `codex login status` must say "Logged in using ChatGPT".
2. `pipeline/scout.mts status` must show an open, live night today. The persona never opens a night.
3. Fewer than 3 idea-loop storyboards still wait for triage.
4. `pipeline/idea-loop/run.mts --count 3 --panels 5 --top 1 --briefs <temp>`.
5. `pipeline/scout.mts storyboard <night> --draw codex --json <temp>`.

## Schedule

Daily at 03:30 local (`30 3 * * *`), inside a night window. It stops at step 2 on a day with no open live night.

## Cost of one run

At most 5 Codex image draws and 1 Codex text call, on the ChatGPT subscription. The persona's own seat is capped at
$1.00, 20 turns and 30 minutes.

## Stop conditions

Any one ends the run, with the exact output reported:

| Condition | Why |
| --- | --- |
| The Codex login is not ChatGPT | No image may be drawn on a key |
| No open live night today | Nights are the operator's to open |
| 3 or more idea-loop storyboards await triage | Untriaged work means the loop is ahead of the human |
| The generator yields no passing idea | Nothing to draw |
| A storyboard call fails or is refused | One attempt per run; a failed panel is never retried |

Failed panels are reported, and a storyboard with no frame shows as failed.

## What it never does

Keeps or throws on the Board, uses `--detach`, draws through Flux or any other image path, sets or reads an API key,
reads `auth.json`, or calls a bar calibrated when its status is not `calibrated`.

While n is below the floor (8 keeps and 8 throws) every idea scores 0.5, so `--top 1` picks the first idea the seat
wrote. The human triage decides until then.
