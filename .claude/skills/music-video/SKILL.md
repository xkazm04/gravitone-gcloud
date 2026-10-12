---
name: music-video
memory: none
category: Content
description: Turn a folder of finished tracks (an album) into music videos, unattended, on the render box - one Leonardo still per track (GPT Image 2.5 Sunburst through the studio's credit pool), particles and low-band edge light over it, a 1080p mp4 plus a paste-ready YouTube title/description/tags written BESIDE each source file. Wraps pipeline/music-video.mts (plan / run / collect / status) over the same queue the /foundry Settled column drives. Invoke with /music-video <folder> [--versions all|main|instrumental] [--prompt "..."] [--limit N] [--again], or /music-video status | collect <folder>.
argument-hint: "<folder> [--versions all|main|instrumental] [--prompt \"...\"] [--limit N] [--again] | status | collect <folder>"
allowed-tools: Read, Bash, PowerShell, Glob, Grep
---

# Music video: an album in, a video beside every track out

A thin wrapper. Every verb is `npx tsx pipeline/music-video.mts <verb> ... --json`; the engine is
`lib/sound/mv/batch.ts` over the music-video queue (`lib/sound/mv/queue.ts`). The skill owns no
logic and never edits the store by hand.

## What one track costs and takes (measured 2026-10-12, Windows studio box)

- **One studio still:** GPT Image 2.5 Sunburst, quality High, 1376×768, style Dynamic. The
  studio's button read **"Generate 71"**, so a track costs ~71 Leonardo **studio** credits. That
  is the web studio's pool, which is not the API key's pool; the API's answers 402.
- **Two text turns,** treatment and metadata, routed `mv-treatment` / `mv-metadata` (local:
  claude-cli, then google). With `--prompt` there is no treatment turn, only metadata.
- **The render is the long part.** A 5:02 track took 31.5 min with libx264 on a box whose ffmpeg
  has no NVENC. Frame capture in headless Chromium dominates the time, and NVENC only speeds up
  the mux. A 12-track album at ~4 min per track is therefore a several-hour run: start it and
  leave it.

## The one rule: say the spend, get a yes

`run` spends the operator's studio credits and text turns, and the CLI refuses it without
`--yes`. Always run `plan` first. Show the operator the plan's table and its last line (new
videos, retries, studio credits, text turns). Pass `--yes` only after they agree, or when their
own message already asked for the run with that scope. Never raise the scope past what they agreed
to; `--again` in particular queues a SECOND video for every finished track.

Never use this skill to delete, Drop, Keep, regenerate or publish. Those are the operator's acts in
/foundry → Pipeline → Audio → Settled. Never close the operator's Chrome.

## Before the first run on a machine (check, then say what is missing)

1. **The repo installed** (`npm install`), and `ffmpeg`/`ffprobe` on PATH (`ffmpeg -encoders |
   grep nvenc` shows whether the GPU encoder is there; libx264 is the fallback).
2. **The Leonardo studio browser.** It is a dedicated Chrome profile with a debugging port, signed
   in once by the operator:
   ```powershell
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="$HOME\.leonardo-chrome" --remote-debugging-port=9333 --no-first-run https://app.leonardo.ai/generate
   ```
   The profile must stay signed in and the window open for the whole run. It is a real window,
   not a headless one: the studio is the operator's signed-in account. `LEONARDO_STUDIO_CDP`
   names the port and defaults to 9333. `status` reports `studio ready` or the reason it is not.
3. **A text engine:** the `claude` CLI logged in, or `GOOGLE_AI_API_KEY` in `.env.local`.
4. **Nothing else draining the store.** Only one process runs the queue at a time
   (the `worker` lease in `foundry-out/sound/mv.json`). If a dev server on the same store has its queue switched
   on, the run stops short naming that pid. Stop that queue (Settled → Stop videos) or the server.

The CLI always uses the REAL store (`foundry-out/`), even when `.env.local` says
`NEXT_PUBLIC_GRAVITONE_DATA=fixtures`. A dev server in that fixture mode shows none of these
videos, which is easy to mistake for "nothing happened".

## Run

```bash
npx tsx pipeline/music-video.mts plan "<folder>" [--versions all|main|instrumental] [--limit N] [--prompt "..."] --json
npx tsx pipeline/music-video.mts run  "<folder>" --yes [same flags] --json      # blocks until the drain ends
npx tsx pipeline/music-video.mts collect "<folder>" --json
npx tsx pipeline/music-video.mts status --json
```

- **`--versions`:** a file named `… (instrumental)` or `… Instrumental` is the instrumental and
  everything else is the main version. An album folder often holds both, so ask which the operator
  wants when the plan shows pairs. Don't default to `all` silently: it doubles the spend.
- **`--prompt` / `--prompt-file`:** one still prompt for every NEW track, used as written. The
  no-text clause is welded on and no treatment turn runs. Without it, the treatment turn writes a
  prompt per track from the title and the measured analysis only, never the lyrics.
- **`--limit N`:** queue at most N tracks this run. Use it for a first trial on a new machine.
- **Run it in a background shell.** It prints a progress line to stderr every 15 s while anything
  changes and one JSON document to stdout at the end. Wait for it; don't poll the store.

What a run does to each track (`plan` shows it per row):

| plan action | meaning |
|---|---|
| `queue` | a new job: fetch → analyse → treat → still → metadata → video |
| `retry` | its last job failed; it resumes at the failed step, so the still is not bought twice |
| `running` | a job is already queued or active; the drain runs it |
| `skip-done` | its video exists (re-run `collect` to copy it again) |
| `skip-version` / `skip-limit` | filtered out by `--versions` / `--limit` |

## Output

Beside each source file `<track>.mp3`, the run writes:
- `<track>.mp4`: 1920×1080 h264 + aac, the track's full length.
- `<track> - youtube.txt`: TITLE, DESCRIPTION (with chapter lines when the track has three or more
  sections) and TAGS.

These two names are the batch's own output and are replaced on a re-run. There is no thumbnail:
the operator takes one from a frame of the video. Every job also stays in /foundry → Pipeline →
Audio → Settled → Videos, where Keep / Drop / Regenerate / Send to Calendar live.

## Report

Show one row per track: the file, its state (done / failed and the engine's sentence, verbatim),
and the video's path. Then give the total wall time and the studio credits spent (71 × stills
actually generated, from the plan's new count less any that failed before `imaging`). If the run
stopped short, quote `paused` verbatim (`the still vendor is not ready: …`,
`the music-video queue is being run by another process (pid N)`) and say what fixes it. A failed
track is fixed by running the same command again, which retries it from its failed step. Never
rerun with `--again` to "fix" a failure.
