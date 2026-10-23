---
name: music-video
memory: none
category: Content
description: Turn a folder of finished tracks (an album) into music videos, unattended, on the render box - one Leonardo still per track (GPT Image 2.5 Sunburst through the studio's credit pool), particles and low-band edge light over it, a 1080p mp4 plus a paste-ready YouTube title/description/tags written BESIDE each source file. Wraps pipeline/music-video.mts (plan / run / collect / status); each track is the same kernel job Runs (/projects/runs) shows and acts on. Invoke with /music-video <folder> [--versions all|main|instrumental] [--prompt "..."] [--limit N] [--again] [--dry] [--budget-usd X] [--detach], or /music-video status | collect <folder>.
argument-hint: "<folder> [--versions all|main|instrumental] [--prompt \"...\"] [--limit N] [--again] [--dry] [--budget-usd X] [--detach] | status | collect <folder>"
allowed-tools: Read, Bash, PowerShell, Glob, Grep
---

# Music video: an album in, a video beside every track out

A thin wrapper. Every verb is `npx tsx pipeline/music-video.mts <verb> ... --json`; the engine is
`lib/sound/mv/batch.ts`, and since Phase 4 every track is a **kernel job** on `box.render`
(`lib/producers/mv.ts`): `run` launches the tracks (a receipt, confirmed by `--yes`) and drives
them on this process. The same job ids show on /projects/runs and in the Settled column. The skill
owns no logic and never edits the store by hand.

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
`--yes` (or `--dry`, which spends nothing: every paid call is answered by a stand-in and listed
as a would-call, the free local work - analysis, render - still runs, and nothing is copied beside
the album). Always run `plan` first. Show the operator the plan's table and its last line (new
videos, retries, studio credits, text turns). Pass `--yes` only after they agree, or when their
own message already asked for the run with that scope. Never raise the scope past what they agreed
to; `--again` in particular queues a SECOND video for every finished track.

The studio provider deletes each Leonardo generation once its still is downloaded; never use this skill to Drop, Keep, regenerate or publish. Those are the operator's acts:
Keep / Drop on the Board (`/board/pkt:mv:mv/settled`); Regenerate and Send to Calendar on the
video's job in Runs (`/projects/runs?job=kernel:job:run:mv.<id>.<stamp>`); the slot then lives on
the Floor's calendar (`/floor?slot=<id>`). Never close the operator's Chrome.

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
4. **Nothing else driving box.render.** The kernel leases the lane (`foundry-out/gravitone.sqlite`,
   one slot): if the worker or another run is rendering, this run stops short with `busy` and the
   holder's host/pid, and never renders a job twice. Wait for it, or run with `--detach` and let
   the worker drive. (v1's `worker` pid lease in `mv.json` is gone.)

The CLI always uses the REAL store (`foundry-out/`), even when `.env.local` says
`NEXT_PUBLIC_GRAVITONE_DATA=fixtures`. A dev server in that fixture mode shows none of these
videos, which is easy to mistake for "nothing happened".

## Run

```bash
npx tsx pipeline/music-video.mts plan "<folder>" [--versions all|main|instrumental] [--limit N] [--prompt "..."] --json
npx tsx pipeline/music-video.mts run  "<folder>" --yes [same flags] --json      # blocks until the drive ends
npx tsx pipeline/music-video.mts run  "<folder>" --dry [same flags] --json      # a dry run: no credits, nothing collected
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
- **`--budget-usd X`:** the job ceiling. Studio credits are not dollars and are admitted under it
  (booked unpriced, with their reason); a text turn's reported cost counts against it.
- **`--detach`:** launch the jobs and return; the worker drives them. `status` then shows them.
- **Run it in a background shell.** It prints a progress line to stderr as each job's drive lands
  and one JSON document to stdout at the end (with the `receipt` it confirmed). Wait for it; don't
  poll the store. `status` is a read and starts nothing.

What a run does to each track (`plan` shows it per row):

| plan action | meaning |
|---|---|
| `queue` | a new job: fetch → analyse → treat → still → metadata → video |
| `retry` | its last job failed; it resumes at the failed step, so the still is not bought twice |
| `running` | a job is already queued, running, paused or interrupted; the run drives it (an interrupted one stops the run short: look first) |
| `skip-done` | its video exists (re-run `collect` to copy it again) |
| `skip-version` / `skip-limit` | filtered out by `--versions` / `--limit` |

## Output

Beside each source file `<track>.mp3`, the run writes:
- `<track>.mp4`: 1920×1080 h264 + aac, the track's full length.
- `<track> - youtube.txt`: TITLE, DESCRIPTION (with chapter lines when the track has three or more
  sections) and TAGS.

These two names are the batch's own output and are replaced on a re-run. There is no thumbnail:
the operator takes one from a frame of the video. Keep / Drop is the operator's verdict on the
Board: the settled videos are one pile in the Floor's video lane (`/board/pkt:mv:mv/settled`).
Every job also stays in Runs (`/projects/runs`): select the video's job, and its inspector holds
Regenerate (one part, through a receipt) and Send to Calendar (a channel and a UTC hour). Name that
place in the report; do not act there for the operator.

## Report

Show one row per track: the file, its state (done / failed and the engine's sentence, verbatim),
and the video's path. Then give the total wall time and the studio credits spent (71 × stills
actually generated, from the plan's new count less any that failed before `imaging`). If the run
stopped short, quote `paused` verbatim (`the still vendor is not ready: …`, `every box.render slot is
held (host/pid)`, or a track `was interrupted while imaging …` - a still may have been bought; the
operator checks the studio, then presses Start on the Settled column, which retries it) and say
what fixes it. A failed
track is fixed by running the same command again, which retries it from its failed step. Never
rerun with `--again` to "fix" a failure.
