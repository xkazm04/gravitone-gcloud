# Scout: one night of found material, decided in one packet

`/scout` is the nightly training loop (spark `media-training-loop`, 2026-10-22). A Claude-seat skill
(`.claude/skills/scout/SKILL.md`) finds pictures, videos and pages around `knowledge/scout/watchlist.md`;
`pipeline/scout.mts` brings them onto this box and turns them into **candidates** - an extracted still
style, a scene recipe with replica stills and at most two clips, a craft finding, a watchlist line -
inside a **$15 night**. Everything one night made is ONE Board packet, `pkt:scout:<night>`, and only
that packet's commit admits anything into the Library or `knowledge/`.

The skill reads and writes words; the CLI and the kernel do everything that spends or writes files.

## The night

```
open ──> add-source ──> ingest ──> style / scene / finding / watch ──> close ──> (Board) committed
 │                                    each launch: open? before deadline? worst case <= remaining?
 └─ dry unless --live                 past the deadline: closed, stop "deadline"
```

| State | Means | Moves to |
|---|---|---|
| `open` | sources and candidates are being added; launches are admitted | `closed` by `close`, or by a launch after the deadline |
| `closed` | nothing more is launched; `stop` says why | `committed` by the Board's apply |
| `committed` | the operator's verdicts are on `night.committed` (kept, rejected, reasons, notes) | - |

Stop reasons: `deadline`, `budget`, `target` (rendered candidates reached `--target`), `failure`,
`sources-exhausted` (the default when `close` is given none and the target was not met), `operator`.

A night id is the calendar day, `2026-10-22`, then `2026-10-22-2` for a second run that day.

## The CLI

`npx tsx pipeline/scout.mts <command>`. `--json` prints one JSON document on stdout and moves progress
to stderr. Exit `0` done, `1` failed or refused, `2` usage.

| Command | Does | Spends |
|---|---|---|
| `doctor [--dry]` | one line per check: yt-dlp, ffmpeg, ffprobe (`-version`), `GOOGLE_AI_API_KEY` and `LEONARDO_API_KEY` set or unset (never their values), the store and night folders writable, `GRAVITONE_DRY_ONLY`. A failing line carries its remedy; exit 1 when a check the night needs fails (`--dry`: the keys and the dry pin are notes) | no |
| `open [--ceiling 15] [--target 20] [--clips 2] [--until HH:MM] [--live]` | creates the night, writes its `taste.md`, prints its id. `--until` is local time today, or tomorrow once that has passed. Without `--live` the night is dry; `--live` is refused under `GRAVITONE_DRY_ONLY=1` | no |
| `add-source <night> --json <file\|->` | `[{url, kind, title, channel?, why, found, watch?}]`, validated (below). A URL any earlier night holds is skipped and reported | no |
| `ingest <night> [--source s-NN] [--detach]` | launches the `scout-ingest` job over the pending sources and drives it here | no |
| `style <night> --sources s-01,s-03 [--slug x] [--detach]` | an ordinary extract run (`launchExtract`, a gallery of those sources' pictures and keyframes) as one style candidate; its run id and job id go on the candidate | yes |
| `scene <night> --source s-NN [--frames k-003.jpg,k-007.jpg] [--detach]` | a scene candidate over those keyframes (default the first five), launched through `launchScene` (`lib/producers/scoutScene.ts`) with a clip while the night's clip cap allows | yes |
| `finding <night> --json <file\|->` | `[{sourceIds, template, step, claim, quote}]`; `knowledge/templates/<template>/` must exist, `step` is `NN-name` and need not exist yet | no |
| `watch <night> --entry "..." --why "..." [--sources s-01]` | a proposed watchlist line | no |
| `close <night> [--stop <reason>]` | settles style candidates from their runs, closes the night, prints the morning: packet id, counts by kind and status, settled and held USD | no |
| `status [<night>]` | every night, or one with its budget, sources and candidates | no |
| `folder <dir> [extract args]` | the train-style path: `pipeline/foundry/extract.mts <dir> ...` with its output and exit code | as extract |

Every launching command (`ingest`, `style`, `scene`) refuses on a night that is not open, and after the
deadline (closing the night with `stop: deadline`).

## The money

- **The night's ceiling** (`--ceiling`, default $15, the operator's standing grant for this loop) is a
  promise, not a stop point. `lib/foundry/scout/budget.ts` reads it from the kernel's own records over
  `night.jobs`:
  - **settled** - what the meter booked against each job (spend rows by job id, kernel
    `spend/projection.ts meterOf`);
  - **held** - an unfinished live job's worst case (its Run row's confirmed estimate, capped by its
    ceiling; or the ceiling) less what it booked, and any meter reservation still held or lapsed;
  - **remaining** = ceiling - settled - held.
- **Every launch's job ceiling is the remaining money**, and a launch whose receipt's worst case is over
  it is refused before anything is written, with the numbers:
  `style over s-01: its worst case $0.15 is over the night's remaining $0.01 of $0.01 (settled $0.00, held $0.00) · clips 0/2; nothing launched`.
- **Clips**: at most `--clips` (default 2, 5 s each) per night. A scene launch asks for a clip while
  `clipsUsed < clipCap`; the asking is what counts (`clipRequested`), rendered or not.
- **Dry and live.** A night is dry unless opened with `--live`. Its launches inherit its mode: a dry
  night's jobs answer every paid call with a stand-in, spend nothing, and its packet commits nothing.
  `GRAVITONE_DRY_ONLY=1` refuses a live night and every live launch.
- **Ingest is free**: a `box.render` job priced at $0 per unit, enqueued without a receipt, as
  media-facts is. It still appears on `night.jobs` and on Runs.
- The CLI confirms its own receipts, as `pipeline/foundry/extract.mts` does: invoking a night's act is
  the consent, inside the standing grant.

## Rights

- A source is **reference-only** by construction (`ScoutSource.rights`); no field can say otherwise.
- Public, official or promotional material only - an artist's own page or channel, a studio's
  trailer, a museum, an editorial site. Nothing behind a login or a paywall, no re-upload, no private
  person's account.
- **Frames are what a night keeps.** A video is downloaded at <=1080p into the source's `.media/`,
  cut into keyframes, and the download is deleted in the same unit, kept or failed
  (`pipeline/vlm-probe/README.md`, "What is not versioned").
- **A source seeds words, never pixels.** It is never sent to a generator as a reference; a clip
  animates our own replica still. Recipes, findings and watch lines name craft, never a person, a
  title or a franchise.

## Ingest

One unit per pending source (`packages/producers/src/scout-ingest/define.ts`, engine
`lib/foundry/scout/ingest.ts`):

| Kind | What happens |
|---|---|
| `image` | `safeFetch`, capped at 12 MB (extract's own cap), sniffed by its bytes (PNG, JPEG, WebP) -> `p-001.<ext>` |
| `page` | `safeFetch` the HTML (4 MB cap); `og:image` and up to 8 `<img>` srcs, made absolute, each fetched as an image; one under 160 px on its short side is skipped -> `p-NNN.<ext>` |
| `video` | `yt-dlp --print duration` (over 20 min: refused with the length), then `yt-dlp --no-playlist -f bestvideo[height<=1080]/best[height<=1080]`; `ffprobe` for the length; `ffmpeg select='gt(scene,0.3)',showinfo` for one frame per cut with its timestamp; the gates; at most 24 kept, spread evenly -> `k-NNN.jpg` with `at`; the download deleted |

The gates are `pipeline/vlm-probe/ingest.py`'s, ported in `packages/producers/src/scout-ingest/gates.ts`:
**blank** (grey standard deviation < 12 - fades, blackouts), **no-detail** (mean edge energy < 1.6 -
dissolves, smear), **duplicate** (dHash within 6 bits of a kept frame). They are measured on one
160x90 grey thumbnail per frame (one ffmpeg pass); the dHash is a box average of it.

Every fetch goes through `lib/imaging/safeUrl.ts` `safeFetch` (scheme, literal and resolved address on
every redirect hop); a video URL passes `assertFetchable` at `add-source`. Binaries come from `PATH`,
or `YTDLP`, `FFMPEG`, `FFPROBE`. Every spawn has a timeout and an output cap. A source that fails is
`failed` with the tool's last stderr lines verbatim (`ffmpeg: ...`, `yt-dlp: ...`); it fails the
source, not the job.

## Files on disk

`foundry-out/scout/<night>/` (`SCOUT_STORE_DIR` moves the root):

| Path | Written by | What |
|---|---|---|
| `night.json` | every writer, through `mutateNight` (a lock file, so processes queue) | the manifest: `lib/foundry/scout/types.ts` `Night` |
| `taste.md` | `open` | the last seven committed live nights' verdicts: kept and thrown per kind, reasons and notes verbatim, channels kept and thrown |
| `sources/<s-NN>/p-NNN.<ext>` | ingest | a picture, or a page's pictures |
| `sources/<s-NN>/k-NNN.jpg` | ingest | a video's gated keyframes (`at` on the source) |
| `scenes/<c-NN>/` | the scene producer | replica stills and the clip |

A style candidate's looks live in its extract run, `foundry-out/extract/<runId>/`. The kernel store
(`foundry-out/gravitone.sqlite`, `GRAVITONE_STORE_PATH` moves it) holds the jobs, their spend, and the
packet.

## Testing and rehearsal

The tests (`tests/next-server/scout-*.test.ts`, `packages/producers/test/scout-ingest.test.ts`) run on
temp stores, stub tools and a fake web: nothing reaches a network, a binary or a vendor. `runCli`
takes `ports` (an ingest spawn, a resolver for `safeFetch`, a clock) so a rehearsal can run a whole
dry night offline without weakening a single check.
