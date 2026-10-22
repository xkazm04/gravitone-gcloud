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
| `ingest <night> [--source s-NN] [--retry] [--detach]` | launches the `scout-ingest` job over the pending sources and drives it here; `--retry` first puts the failed sources in scope back to pending | no |
| `style <night> --sources s-01,s-03 [--slug x] [--detach]` | an ordinary extract run (`launchExtract`, a gallery of those sources' pictures and keyframes) as one style candidate; its run id and job id go on the candidate | yes |
| `scene <night> --source s-NN [--frames k-012.jpg] [--detach]` | a scene candidate read from the chosen keyframe (default the first; ingest keeps one frame per cut, so neighbouring keyframes are different shots), launched through `launchScene` (`lib/producers/scoutScene.ts`) with a clip while the night's clip cap allows | yes |
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

## A scene

A scene candidate is ONE kernel job (`job:scout-scene:<night>:<c-NN>`, `~2` after a failed one; producer `scout-scene`) waiting on the lane of its expensive half: `gpu.local` when it renders a local clip (the card, one job at a time), `cloud.leonardo` otherwise. It reads the chosen keyframe (up to five when more than one is named - only useful for frames of one shot) with Gemini, one recognize call each in time order, each handed the earlier answers as words, into a `SceneRecipe` in craft words (`pipeline/SCOUT-SCENE-PROMPT.md`; the door in `lib/foundry/scout/scene.ts` refuses a missing field, a shot size outside the six, a palette colour without a job, and any word of the source's own title or channel or a capital mid-sentence). Shot length and pace come from the source's cut timestamps when it has them. It then draws two replica stills from the recipe's prompt with no reference image attached - Leonardo GPT Image 2.5 Flare, LOW, 1376x768 (`lib/imaging/providers/leonardoFlare.ts`) - and, only when the night's clip cap still allows (the caller's `clip`), animates OUR first replica for 5 s: by default LOCALLY, LTX-2.5 distilled through this box's ComfyUI (`lib/imaging/video/comfyLtx.ts`, graph `pipeline/video/ltx-i2v-api.json`, 960x576 with its x2 pass, ~100 s a clip, free; `SCOUT_CLIP_ENGINE=hailuo` sends it to Leonardo instead); `clipSourceOf` refuses any path that is not this candidate's own replica, so a source frame never reaches a video vendor. **What it costs on its receipt:** each read at extract's $0.002 pre-call estimate (gemini-3.6-flash is unpriced in the kernel table), each still at Flare's measured 6 credits ($0.0154), and a local clip $0 (no spend row; the clip cell reads `5s · local · free`): about $0.04 a scene. A hailuo clip is held at $3.75 and books to `video-usd`. The vendor's own figure replaces each estimate when it is booked. **What is held:** the source keyframes stay on this box, reference-only; only words leave them. **What ships into the packet:** the recipe, `scenes/<c-NN>/replica-1..2`, and `scenes/<c-NN>/clip.mp4` with `clip.from` naming the replica it animates. A failed clip leaves the scene `rendered` with its stills and `error: clip: …`; a recipe that names its source, a failed read or replica, or a ceiling before the stills ends it `failed` with that sentence verbatim, and nothing is drawn after it. A dry night writes stand-ins into every cell: a committed preset poster for each replica and a placeholder clip file.

## The morning

A closed, non-dry night with anything rendered is one pile in the Floor's image lane and one packet,
`/board/pkt:scout:<night>`: a row per candidate - an extracted look (its source as reference, best
replica and transfer), a scene (keyframe as reference, two replicas, the clip), a finding or a watch
line (a text tile; Z shows the whole quote). `K` keep, `X` reject with up to three of `style, subject,
craft, motion, rights, generic` (keys 1-6), `⇧K`/`⇧X` a whole row, `⏎` shows what the commit writes and
commits. A candidate that failed is listed at the gate with its sentence and is not in the rows.

What a commit writes: kept looks become `candidate` styles through the extract run's own commit
(publishable, and the ratchet takes them on from there); kept scenes and clips become reference-only
`motion` items in the Library; a kept finding is appended to
`knowledge/templates/<template>/steps/<step>/PATTERNS.md` under `## Scout findings` and a kept watch line
to `knowledge/scout/watchlist.md`, each with its `<!-- scout:<night>/<c-NN> -->` marker; every verdict
with its reasons and note lands in `night.committed`, which is what the next night's `taste.md` reads.
The next night's skill commits the knowledge lines (never pushes). An untriaged packet waits; nothing is
ever accepted for want of an answer.

## The skill and the schedule

`/scout night` (`.claude/skills/scout/SKILL.md`) is the only reader in the loop: it chooses sources
around the watchlist and the taste, groups pictures into looks, picks the shots, and writes findings.
It never keeps or commits. `pipeline/scout-schedule.ps1` registers the nightly run on Task Scheduler -
`-Print` shows it, `-Install -At 22:30` registers it, `-Remove` takes it away; the operator installs it.
The scheduled run is `claude -p "/scout night --until 06:30"` with its tools fenced to search, read,
the CLI and committing `knowledge/`; logs land in `foundry-out/scout/logs/`.

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
