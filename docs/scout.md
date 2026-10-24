# Scout: one night of found material, decided in one packet

`/scout` is the nightly training loop (spark `media-training-loop`, 2026-10-22). A Claude-seat skill
(`.claude/skills/scout/SKILL.md`) finds pictures, videos and pages around `knowledge/scout/watchlist.md`;
`pipeline/scout.mts` brings them onto this box and turns them into **candidates** - an extracted still
style, a scene recipe with replica stills and at most two clips, a craft finding, a watchlist line,
and up to three **game assets** briefed in our own words (a concept, then a mesh made on this box) -
inside a **$15 night**. Everything one night made is ONE Board packet, `pkt:scout:<night>`, and only
that packet's commit admits anything into the Library or `knowledge/`.

The skill reads and writes words; the CLI and the kernel do everything that spends or writes files.

## The night

```
open ──> asset (early) ──> add-source ──> ingest ──> style / scene / finding / watch ──> close ──> (Board) committed
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
| `doctor [--dry] [--tracks N]` | one line per check: yt-dlp, ffmpeg, ffprobe (`-version`), `GOOGLE_AI_API_KEY` and `LEONARDO_API_KEY` set or unset (never their values), the store and night folders writable, `GRAVITONE_DRY_ONLY`. A failing line carries its remedy; exit 1 when a check the night needs fails (`--dry`: the keys and the dry pin are notes). The registry, the Leonardo studio and Playwright's `chromium` (where `chromium.launch` would start it, never launched) are always notes | no |
| `open [--ceiling 15] [--target 20] [--clips 2] [--assets 3] [--ideas 25] [--reels 6] [--tracks 4] [--visualizers 2] [--until HH:MM] [--live]` | creates the night, writes its `taste.md` and `registry.md` (below, "The registry"), prints its id. `--until` is local time today, or tomorrow once that has passed. Without `--live` the night is dry; `--live` is refused under `GRAVITONE_DRY_ONLY=1` | no |
| `add-source <night> --json <file\|->` | `[{url, kind, title, channel?, why, found, watch?, rich?} \| {fromIdea: <night>/<c-id>, why?}]`, validated (below). A `fromIdea` item brings a KEPT idea's artboard in as our own source (found `idea`, rights `ours`, already ingested, nothing downloaded) - refused for an idea not kept, a dry night's, or one any night already develops. A URL an earlier night made a candidate from is skipped and reported; one it only held is taken | no |
| `ingest <night> [--source s-NN] [--retry] [--detach]` | launches the `scout-ingest` job over the pending sources and drives it here; `--retry` first puts the failed sources in scope back to pending | no |
| `style <night> --sources s-01,s-03 --use "<content>" [--slug x] [--seed <batch>/sd-NNN] [--detach]` | an ordinary extract run (`launchExtract`, a gallery of those sources' pictures and keyframes) as one style candidate; its run id and job id go on the candidate | yes |
| `scene <night> --source s-NN --use "<content>" [--frames k-012.jpg] [--seed <batch>/sd-NNN] [--detach]` | a scene candidate read from the chosen keyframe (default the first; ingest keeps one frame per cut, so neighbouring keyframes are different shots), launched through `launchScene` (`lib/producers/scoutScene.ts`) with a clip while the night's clip cap allows | yes |
| `asset <night> --brief <file\|-> [--seed <batch>/sd-NNN] [--detach]` | one game asset from `{class, subject, use, serves: {project: pof|mage-arena|bp} | {newProject}, style?, kind?, techniques?, fromIdea?}` - `use` and `serves` required: an asset helps an existing game or opens a new kind of project, and its 3D row leads with both: its concepts drawn and gated, its mesh asset written and the mesh job QUEUED for the worker (below, "A game asset") | yes |
| `ideas <night> --json <file\|-> [--detach]` | `[{title, target: scene\|style\|asset3d\|stats, genre, prompt, anchor: {kind: watch\|gap\|free, ref}, seed?, use?, reel?}]` (`genre` required, <= 80 chars; `seed` required once any live batch kept a seed - the candidate's `fromSeed`), one `idea` candidate each. Scene, style and 3d-asset ideas are ONE `scout-ideas` job drawing a rough artboard each in the Leonardo studio (driven here unless `--detach`); stats ideas carry `reel` and are ONE `scout-reels` job on the Claude seat, always queued for the worker (below, "A stats reel"). One bad brief refuses the batch with its place; a batch over `ideaCap` or `reelCap` writes nothing | studio credits, the seat |
| `direction <night> --json <file\|->` | `{title, format: short\|video, genre, style, tone, audience, premise, basedOn: [<night>/<cell id>], use?}`: one `direction` candidate, words, rendered at once. Every `basedOn` entry must be a cell a LIVE night kept; the refusal names the entry and why | no |
| `seeds new --json <file\|-> [--dry]` | `[{sentence, genre, subgenre, type, audience: kids\|family\|adult, format: short\|video, parent?: <batch>/sd-NNN}]`, 1..150 seeds written whole as `seeds/<batch>/batch.json` and decided on `/board/pkt:seeds:<batch>` (below, "Seeds"). One bad seed refuses the batch with its place: a facet over its bound or on two lines, a sentence any batch already holds (case- and whitespace-folded), a `parent` the seed door refuses | no |
| `seeds status [<batch>]` | every batch newest first (seeds, kept, rejected, undecided, dry), or one batch's seeds with verdicts, reasons and notes | no |
| `track <night> --seed <batch>/sd-NNN [--detach]` · `track <night> --collect` | one Suno create from a kept seed's sentence (below, "Music") | Suno credits |
| `visualizer <night> --track <night>/<c-id>/<aN> [--detach]` · `visualizer <night> --collect` | a full-song visualizer of a KEPT track clip (below, "Music") | studio credits unless a kept idea's artboard is the still |
| `finding <night> --json <file\|->` | `[{sourceIds, template, step, claim, quote, restates?}]`; `knowledge/templates/<template>/` must exist, `step` is `NN-name` and need not exist yet | no |
| `watch <night> --entry "..." --why "..." [--sources s-01]` | a proposed watchlist line | no |
| `close <night> [--stop <reason>]` | settles style candidates from their runs, closes the night, prints the morning: packet id, counts by kind and status, settled and held USD | no |
| `leads [--json]` | the lead queue's pending events (`foundry-out/scout/leads.json`): key, kind, night, refs, evidence | no |
| `lead <key> --json <file\|->` | `{claim, kind: technique\|application\|subject, nearest?, confidence: low\|medium\|high}`: one line into `.ai/registry-leads.jsonl`, once per key, and the event marked filed. Refused: an unknown key, a claim outside 12-400 characters, a `nearest` the registry's media-generation index does not hold, a mature event's claim naming its genre | no |
| `status [<night>]` | every night, or one with its budget, sources and candidates, its last 15 minutes of load against the band, what waits and the night's interrupted jobs (below, "The load") | no |
| `folder <dir> [extract args]` | the train-style path: `pipeline/foundry/extract.mts <dir> ...` with its output and exit code | as extract |

`style`, `scene`, `asset`, `ideas`, `direction` and `track` take a seed only through the seed door (`seeds.ts usableSeed`): kept on a live batch, outside any paused branch; a `--seed` that names another branch than the kept idea it develops is refused. `add-source {fromIdea}` copies the idea's `fromSeed` onto the source, so what develops it inherits the branch.

Every launching command (`ingest`, `style`, `scene`, `asset`, `ideas`, `track`, `visualizer`) refuses on a night that is not open, and after the
deadline (closing the night with `stop: deadline`).

## Seeds

A SEED is one sentence naming a genre, a subgenre, a type of content, an audience (`kids`, `family`,
`adult`) and a format (`short`, `video`) - the cheapest question the loop asks. ~100 a batch, written by
`seeds new` (or the night's step 0), triaged on their own packet `pkt:seeds:<batch>`: one words row per
seed, the sentence its label, its facets the meta (`adult · comedy › office satire · animated comedy
sketch · short`), and a child seed's first line the parent it narrows (`from: <parent sentence>`, cut at
60). On the Floor an uncommitted live batch is one pile; a dry one opens by its id only.

EVERY X NEEDS A REASON. On this packet a reject is not done until it names one of `generic`, `not for us`,
`audience`, `done before`, `format` (at most two): X rejects and stays, the row's reason chips open, and a
reason key (1-5) sets it and moves on. The commit refuses a reasonless reject - the desk counts it beside
the undecided (`<n> need a reason`, flashed, the cursor on the first) and the kernel's commit refuses
`decision: <n> rejected need a reason: sd-004, sd-019` (`@gt/domain/source` `reasonOnReject`, enforced in
`planCommit`). E writes a one-line note on the row under the cursor (⏎ saves, Esc leaves); the note rides
the verdict and reads back in the next night's brief.

The commit writes `batch.committed` {at, by, kept, rejected, reasons, notes, dry} once. A kept seed is a
BRANCH ROOT: the next night derives 2-3 narrower child seeds (`parent`) and draws 1-2 idea artboards on it
(`seed` on the idea brief), and everything built from those records it (`fromSeed`). A rejected seed is a
ban the next batch is written against. A dry batch's keeps derive nothing (`usableSeed` refuses them).

`taste.md` gains, after the load and before the nights, over every live committed batch and the steer:

| Section | Lists |
|---|---|
| `## Seeds to develop` | each kept seed outside a paused branch with what it still lacks: `<ref> · <facets> (needs: child seeds, ideas) — <sentence>`; a seed with 2 child seeds lacks no children, one with an idea grown from it (a live night's) lacks no ideas, and one lacking neither is not listed |
| `## Seeds blocked` | each rejected seed, newest batch first, at most 200: `"<sentence>" · <reasons> · note: <note>` |
| `## Paused` | each paused ref with its sentence |
| `## Seed genres` | kept against rejected per audience, then per genre inside it |

Then any `extra` lines the caller wires in (`tasteBrief(except, loadOf, extra)` /
`tasteOf(nights, last, {seeds, extra})`: the graph's `## Branches`, the tracks' `## Tracks to visualize`).
The four sections are absent while no live batch is committed and nothing is paused.

## The decision graph (`/scout`)

`/scout` is no longer a redirect: it is the graph of every decision the loop ever made (spark
scout-decision-graph WP-S2). Its header holds the two packets a morning opens next - the newest uncommitted
seeds batch (`pkt:seeds:<batch>`, its seeds undecided) and the newest closed night (`pkt:scout:<night>`, its
rendered candidates undecided), each a link to the Board, a zero when none is open.

**Nodes, by stage** (`packages/domain/src/scoutGraph.ts`, built by `lib/foundry/scout/graph.ts`):

| Stage | Node | State |
| --- | --- | --- |
| seed / derived | `seed:<batch>/sd-NNN` (derived: it has a `parent`) | its batch's commit: kept, rejected, else open |
| idea | `cand:<night>/<c-id>` idea artboard; a stats idea is kind `reel` | two-level triage: any kept cell kept, every cell rejected rejected; uncommitted: its render's `pending` / `failed`, else open |
| run | style, scene, asset3d, direction, finding, watch, track | as above |
| output | a kept visualizer; `out:<night>/<c-id>` for what a kept run left that is real - a style's `look`, a scene's kept clip (`c-NN/clip`), an asset's `mesh`, a finding's or watch line's `knowledge` | kept. A dry commit leaves none; a kept reel, direction or track leaves none |

Links: parent seed -> child seed, seed -> idea (`fromSeed`), idea -> what develops it (`fromIdea`), seed -> a
run that names a seed but no idea, each `basedOn` cell's candidate -> its direction, a restated finding -> the
finding, a track's clip -> its visualizer, a kept run -> its output. A candidate inherits its `fromSeed` seed's
audience, genre and subgenre and sits under that seed's pause; a candidate with no seed is **before seeds**.

**Bands**: an audience, its genres inside it, then *before seeds* last. Each band says how many nodes it holds,
how far its live nodes reached (live = open, pending or kept, not paused; dead = rejected or failed), its share
of the last 7 live nights' run-stage candidates against the split's target (a genre's target is its audience's
share times the genre's), and its effort. A band with no live node starts folded; a folded band draws nothing.
`live | all`: live hides the dead and their links, each column's head counting what it hid (`+N`).

**Effort** (`lib/foundry/scout/effort.ts`, from the kernel store, never from a night's own figures): per
candidate `geminiUsd` = its job's spend rows the night ceiling caps (`budget.ts jobMoney` settled),
`uncappedUsd` the rest of its booked rows, `gpuMin` = `job.claimed` to `job.done | failed | stopped | yielded |
interrupted` of its job on `gpu.local` (an open claim counts to now), read through `@gt/kernel/events-query`;
`runs` = 1 per candidate. A job that served a batch (the ideas job, the reels job: every candidate carrying its
id) is divided evenly and each share marked `shared`.

**The steer, on this screen**: select a node (click, or Enter on it) for its words, stage, verdict, packet,
branch and effort, `open on Board`, and **Pause** its seed - or **Resume** the paused seed above it that holds
it. The split editor sets a whole percent per audience and per genre inside it; Save goes through `steer.ts
setSplit` and a refusal is its sentence verbatim (`the audience split sums to 105; it must sum to 100`). Every
change is appended to `steer.json`'s history. The split is advisory: the next night's brief carries it as
`## Branches` (`graph.ts branchesSection`):

```
## Branches

- kids · live 11 · dead 0 · reached output · kept 8 · 6 runs, 15 GPU min, $0.15 Gemini · split 60% / took 29%
  - kids/comedy · live 11 · dead 0 · reached output · kept 8 · 6 runs, 15 GPU min, $0.15 Gemini · split 60% / took 29%
- before seeds · live 5 · dead 2 · reached output · kept 5 · 0 runs, 0 GPU min, $0.00 Gemini
```

(a group the split names no target for omits `split ... / took ...`; one with no live node says `reached nothing
live`). The brief's effort is only what `branchesSection` is handed: build the graph with the kernel store
(`buildGraph({ store })`) or every line says `0 runs`.

Rehearsal: `GRAVITONE_PRODUCE_SIDE=fixture` draws a generated universe (~200 nodes: every verdict, a paused family
branch, a shared ideas job, work before seeds) through the same builder; `SCOUT_FIXTURE_SCALE=N` repeats it N
times (15 = ~3,000 nodes, the scale measure). The screen id is `scout` (`pipeline/cx-screens.mjs`).

## Music

The song is the clock: a track is made and judged on one night, and its visualizer only on a later one, once the track is final (registry music-video-production).

| command | what it does |
|---|---|
| `track <night> --seed <batch>/sd-NNN [--detach]` | One Suno create (v6 + v6-wild, about 4 clips) from a kept seed's sentence. The seed goes through `usableSeed`, so it must be kept, on a live batch, and outside any paused branch. Refused past the night's `--tracks` cap (default 4, max 8). The Suno producer's own job is the job (`job:run:suno.sj-scout-<night>-<c-id>`, on box.chrome). Each clip lands in `tracks/<c-id>/a<N>.mp3`. |
| `track <night> --collect` | Collects every pending track whose Suno job is done, for a detached one. |
| `visualizer <night> --track <night>/<c-id>/<aN> [--detach]` | A full-song visualizer of a track clip that a live night's commit KEPT. Refused for any other clip, for a clip a visualizer already plays, and past `--visualizers` (default 2, max 4). Runs as the mv producer's own job on box.render. The mp4 lands in `visualizers/<c-id>/visualizer.mp4`, with `visualizer - youtube.txt` beside it. |
| `visualizer <night> --collect` | Collects every pending visualizer whose mv job is done. |

**Money.** Suno and the studio bill credits, which the night's ceiling does not cap. Both jobs launch with no job ceiling, so an open job holds none of the night's Gemini. A track's proposal turn (sentence -> Suno form) runs before its job exists, so no meter could book it. It is therefore pinned to the Claude seat (`avoid: "google"`): a seat that is down fails the track with the router's sentence. A visualizer's two text turns run inside its mv job, so a Gemini fallback books a spend row on a job the night lists, and `budget.ts` counts it. A track or a visualizer is refused by its cap, never by the night's money.

**Dry.** A dry track asks no turn (the sentence stands in) and runs on the Suno producer's stand-in refs. Collect writes `STAND_MP3` for each clip: one second of a 440 Hz tone, plainly not a song.

**The still.** The visualizer looks for a kept idea artboard under the same seed (ours). If it finds one, it copies it to `visualizers/<c-id>/still.<ext>` and hands it over as the mv record's `stillFrom`, so no studio credits are spent. If it finds none, the studio buys a still, and collect copies it to `visualizers/<c-id>/studio.<ext>`.

**On the Board.**
- A track is one run under `music` (the audio tab). Its row is the seed's sentence. Each clip is a cell `<c-id>/aN` (audio/mpeg) with the meta `track · <genre> › <subgenre> · <N> clips · <model> · <m:ss>`.
- A visualizer is one run under `videos`. Its cell is `<c-id>/video`, its row is the song's title, its still is the reference, and its meta is `visualizer · <m:ss> · still: idea|studio`.
- Kept track clip: "the next night renders its visualizer". Kept visualizer: "rung 1 of the music ladder: the full video and its Short are next". Rejects keep their reasons.
- Nothing is written but `night.committed`.
- A track or visualizer still collecting at close is a loss: "still collecting when the night closed".
- An idea grown from a seed shows `seed: <first 40 chars>` in its meta.

**Brief.** `tracksSection(nights)` writes the next night's `## Tracks to visualize`. It lists each kept clip of a live night that no visualizer plays yet, as `<night>/<c-id>/<aN> · <model> · <m:ss> - <sentence>`.

**Doctor.** The `suno` line attaches to the Suno Chrome on 9334 (read-only, never launched). It is a FAIL only for a live doctor with `tracks > 0`. Otherwise it is a note and no browser is asked.

## What the nights are for

The operator's rulings (2026-10-23): every run, idea and direction serves a **YouTube video** - a Short
(~30 s) or a short video (up to 5 minutes); a style is only the baseline look of such a video, never a
print, a book, a painting or image art. Until three directions are confirmed, a night's ideas spread
across at least eight genres, at most four each. The notes a night leaves are **directions** - what the
approved decisions add up to, in production words, for one K or X - and at most two craft findings about
execution in a video. A kept idea is developed on the next night FIRST: its artboard comes in as our own
source (`add-source {fromIdea}`) and the act its target names builds it. The taste brief carries
`## Directions confirmed`, `## Directions refused`, `## Ideas to develop`, `## Ideas blocked` (the next
ideation's bans) and `## Genres`.

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
- **Game assets**: at most `--assets` (default 3 while the 3D engines are being profiled) per night.
  One counts once it may reach the GPU - pending, or handed off to a mesh asset; one whose concepts the
  input gate refused, or whose job failed before the hand-off, spent no GPU minute and gives its place
  back. The check and the candidate's row are one write under the night's lock.
- **Ideas and stats reels**: at most `--ideas` studio artboards (default 25) and `--reels` stats ideas
  (default 6, at most 12) per night, each counted toward its own cap only and never toward `--target` or
  the clips; a failed one still counts. Both are uncapped by the ceiling (studio credits, the seat), so a
  batch is refused by its caps and never by the night's money.
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

## A game asset

`asset <night> --brief <file|->` (spark `game-3d-assets` WP4; the mesh store is `docs/mesh.md`). The
brief is the skill's words, never a found picture: `{class: character|weapon|prop, subject, style?,
kind?, techniques?}` - `subject` in craft words (materials, silhouette, palette), never a franchise, a
studio or a person; `kind` a weapon's sword, mace, axe or staff (the M1 touch-up keys on it);
`techniques` defaulting to the class's (character `T1,T2` rigged onto UE5 Mannequin chains, weapon
`T1,M1`, prop `T1`). One `asset3d` candidate and ONE kernel job, `job:scout-asset:<night>:<c-NN>`
(producer `scout-asset`, lane `cloud.leonardo`, `lib/producers/scoutAsset.ts`):

1. **concept** - one GPT Image 2.5 Flare still per concept, from OUR words with no reference image
   (`lib/foundry/scout/concept.ts`): a character's orthographic front A-pose with open empty hands, a
   weapon's strict flat side profile with exactly one blade or head on one straight shaft, a prop's
   front view - each whole in frame on a plain flat light ground. A character whose T2 is asked gets a
   SECOND concept written for the game camera: chunky proportions, thick solid shapes with no thin
   parts, flat colour blocks. `assets/<c-NN>/concept-<k>.png` in the night. **Costs** Flare's 6 credits
   ($0.0154) a concept, on the receipt and under the night's ceiling.
2. **handoff** (free) - every concept through the image-to-3D input gate (`lib/foundry/mesh/inputGate.ts`);
   the mesh asset `<night>-<c-NN>-<subject words>` written with one variant per technique, T2 made from
   its own design. A variant whose concept failed the gate (or could not be decoded) is written
   `failed` with the gate's codes and never reaches the GPU; M1 rides on T1's. Every concept refused:
   no asset, no job, the candidate `failed` with the codes. Otherwise the **mesh job is queued, never
   driven here**: the worker admits it on `gpu.local` by the `comfy` engine's measured profile, its
   settle queues the Blender finish on `box.blender`, and the night's discovery carries on meanwhile -
   so the skill launches its assets EARLY.

A dry night draws stand-in concepts (`standConcept`: the class's silhouette on a plain ground, drawn in
code so the input gate runs on it for real) and its mesh and finish jobs run dry.

**In the packet** each asset is a row under `3d` with its concept as the reference, and each FINISHED
variant a cell (`c-05/t2`): the tile is the poster render, `Z` orbits the finished glb (the rigged one
when rigged), and the words carry the work - `T2 · game-camera design`, `18,000 / 40,000 tris · input
pass 100 · mesh warn 85 · rig pass 92`, the variant's approach. A variant that failed or has not
finished is listed at the gate with its own sentence. **A commit** writes each judged variant's
`verdict` into its asset (`kept` / `rejected`), which is what the Library's 3D models shelf reads
(the scout feed never shelves an asset: the mesh feed does, once); a dry night records the verdicts
only. `taste.md` tallies the verdicts by class and technique - `character T1: kept 0 · thrown 1
(topology 1)` beside `character T2: kept 1 · thrown 0` - the T1-against-T2 question the 3D rounds left open.

## A stats reel

A stats idea (spark `stats-reels`) is a data video the seat judged worth making, proposed in the same
`ideas` batch as the artboards with `target: "stats"` and a `reel` the door requires on that target and
refuses on any other:

- `reel.brief` - `{case, title, hook, unit, kind, data, steps?, illustrative: true}` in a strips
  fixture's shape (`pipeline/strips/data/*.json`); `kind` is `level-race`, `cumulative-race`, `counter`,
  `ranking` or `share`, `case` a lower-case slug (the fixture's name once kept).
- `reel.approach` - the seat's own design, `{name, medium, grammar, density, direction, falsifier}`, the
  fields of a strips approach card (`pipeline/strips/approaches.json`).
- `prompt` - the seat's one-paragraph direction to the author turn.

Strings are bounded (200 characters a line, 400 a direction, falsifier or step, at most 12 steps) and the
whole reel is at most 60 KB of JSON.

**The illustrative rule.** A night triages ideas, not datasets: the brief's numbers are plausible, not
researched, and `illustrative: false` or an absent mark is refused. The strip holds every number in ONE
inline `<script id="strip-data" type="application/json">` block and its source line reads "illustrative
data", so a kept reel's real data swaps in whole.

**What is written where.** The door writes `ideas/<c-NN>/brief.json` and `ideas/<c-NN>/approach.json` and
sets the candidate's `reel` to those paths before the job is launched. The job,
`job:scout-reels:<night>:<first c-NN>` (producer `scout-reels`, lane `seat.text`, `lib/producers/scoutReel.ts`),
is always left queued for the worker - an author turn is ~15 minutes an idea - with its receipt said
like the artboards': `receipt (live): reels c-05..c-07 · 3 strip(s) on seat.text · claude seat · ~N min`.
Per idea it authors the strip (`ideas/<c-NN>/strip.html`), lints it, and renders frame 120 to
`ideas/<c-NN>.png`, the idea's tile; a failed turn fails that idea with its sentence, and the batch goes on.

**In the packet** a stats idea is one tile in the ideas tab like an artboard, its meta `stats reel ·
<anchor>`. `K` records the keep (`develops next night as a stats reel`); developing it - the real data
researched into a fixture, the block swapped, the full 240-frame render with its gates - is not built yet.
`X` blocks it. Both land in `night.committed` with their reasons.

## Storyboards

The rung between a kept idea and a full video (spark `scout-storyboards`): an idea is one picture of an
intent, and clips are made in isolation; a storyboard proves the idea can become a whole video before one
is made. A storyboard grows from a KEPT idea - the next night, one per idea - and holds up to five rough
frames and the seat's words: a title, a paragraph of the vision (<= 480 characters) and 3-6 bullets
(<= 140 each: the beats, the format and length, the audience, the look, the hook).

**The act.** `scout.mts storyboard <night> --json <file|->` takes a batch
`[{fromIdea, title, paragraph, bullets, panels, use?, aim?}]` (`lib/foundry/scout/storyboard.ts`). The door
is the batch's: one bad brief refuses it whole, before a candidate exists - `fromIdea` not kept on a live
committed night (`direction.ts keptIdea`), a second storyboard for one idea (unless the first failed),
bounds broken, more than five panels, or a name in the words (`scene.ts namesIn`: no person, studio or
franchise; a capital mid-sentence reads as one). The candidate copies the idea's `fromSeed` and its
aspect (a portrait idea draws 9:16 frames, any other 16:9).

**The cap.** At most `storyboardCap` a night (`open --storyboards N`, default 6, at most 12; the muse
wing has none), every storyboard counting, a failed one too; checked under the night's lock.

**The frames.** One job per storyboard, `job:scout-storyboard:<night>:<c-NN>` (producer `scout-storyboard`,
`lib/producers/scoutStoryboard.ts`), steps `panel:1..N`, on `gpu.local` naming the `comfy` engine, so it is
admitted beside the night's LTX clips and TRELLIS meshes, never on top of them. Each panel is one Flux 2 dev
frame (`lib/imaging/local/flux2.ts`: `flux2_dev_fp8mixed`, the Mistral 3 small text encoder, the Flux 2
VAE, 20 steps, 1280x720 or 720x1280) from the panel's words alone - the idea's artboard is read as words,
never handed in as a reference: the frames are a plan, not the final video's baseline. Each panel's seed is
chosen at launch and recorded, so a retry draws the same frame. **$0**: a local model, priced
`free: a local model` on the receipt, no spend row, never against the night's Gemini ceiling; the cost is
**GPU minutes** (~96 s a frame, illustrative until measured: ~8 min for five), which the decision graph's
effort reads off the job's gpu.local events. A panel ComfyUI refused leaves its frame empty and its
sentence in `error` (`panel N: ...`); the storyboard goes on. With no frame at all it is `failed`. Frames
land in `storyboards/<c-NN>/panel-N.png`; `storyboard <night> --collect` settles detached jobs. The client
never POSTs `/free` - the ComfyUI is shared. `doctor` lists the three Flux files as a note.

**A dry night** writes its storyboards `rendered` with no frame and launches nothing: the packet triages
the words alone.

**The gate.** A storyboard is judged WHOLE: its frames are `c-NN/panel-N` cells and its words `c-NN/words`.
It is kept when its words cell is kept, or when any cell is kept and none rejected, on a live committed
night (a night committed in parts counts only its committed cells). A kept storyboard is the root any
full-video act must name - `keptStoryboardFor(nights, <night>/<c-id>)` is the code check, and the skill's
rule is that no full-video act runs for an idea not under `## Ready for full video`. No full-video act
exists yet; scene clips stay ungated. The taste brief lists `## Storyboards to make` (kept ideas with no
storyboard) and `## Ready for full video` (kept storyboards, with their idea, title and paragraph). A
storyboard does not take its idea off `## Ideas to develop`: the idea's scene, style or asset act is
independent of it. On the graph a storyboard sits in its own `board` column between idea and run, linked
from its idea; a kept one leaves no output node (nothing real exists until the video is made).

## The morning

A closed, non-dry night with anything rendered is one pile in the Floor's image lane and one packet,
`/board/pkt:scout:<night>`: a row per candidate - an extracted look (its source as reference, best
replica and transfer), a scene (keyframe as reference, two replicas, the clip), a finding or a watch
line (a text tile; Z shows the whole quote). `K` keep, `X` reject with up to three of `style, subject,
craft, motion, rights, generic, use case` (keys 1-7; `use case`: the run serves no content worth making, and the next nights steer away from it) and, for a game asset's variant, `topology, texture, rig, scale` (keys 8, 9, 0, -), `⇧K`/`⇧X` a whole row, `⏎` shows what the commit writes and
commits. A candidate that failed is listed at the gate with its sentence and is not in the rows.

What a commit writes: kept looks become `candidate` styles through the extract run's own commit
(publishable, and the ratchet takes them on from there); kept scenes and clips become reference-only
`motion` items in the Library; a kept finding is appended to
`knowledge/templates/<template>/steps/<step>/PATTERNS.md` under `## Scout findings` and a kept watch line
to `knowledge/scout/watchlist.md`, each with its `<!-- scout:<night>/<c-NN> -->` marker; every verdict
with its reasons and note lands in `night.committed`, which is what the next night's `taste.md` reads.
A live commit also queues, once by key, what the keeps EARNED for the ai-registry (below); the consequence
names each (`queues a registry lead: <kind> <ref>`, or `already queued`). The next night's skill commits the
knowledge lines and the filed leads (never pushes). An untriaged packet waits; nothing is
ever accepted for want of an answer.

## The load

The operator keeps the box's CPU, RAM and GPU in **60-80%** over a night (2026-10-23: "so we can learn
from each run how to ideally balance scope for whole night period"). The band (`LOAD_BAND`,
`packages/domain/src/load.ts`) is a TARGET for how much a night launches, apart from admission's
protective marks (memory 85/75%, CPU 90%, `packages/domain/src/resource.ts`), which still hold the top.

- **Sampled** by the always-on worker's `load-sample` timer, one row a minute into the kernel store's
  load table (`@gt/kernel/resources/load`; the sampler and the worker service are in
  `docs/resources.md`): CPU busy, physical RAM used of its total, GPU utilisation, the commit charge and
  its limit, ComfyUI's queue, and the jobs admission was holding and on what. A reading the probe could
  not take is absent, never zero.
- **The window** of a night (`lib/foundry/scout/load.ts nightLoad`) runs from `startedAt` to the latest
  of `closedAt`, the deadline once passed (or now) for a night still open, and the last move of any job
  the night launched (its newest kernel event) - work that ran past the close is the night's load. None
  ends after now.
- **The summary** (`summarizeLoad`, pure, computed on read and never stored): per resource the average,
  the nearest-rank p95 and the share of readings inside the band, over the samples that READ it (`read`
  says how many); a strip of five-minute means, `-1` where nothing was read; the commit peak against
  its newest limit; the minutes jobs waited, by what held them (one sample's minute per job seen
  waiting). A night with no samples has no load (a night before the sampler): nothing is drawn.
- **The desk**: `present.load` on the night's Board packet, open and committed - the adapter puts it on
  the packet it plans (`lib/decision/v1/sources/scout.ts`), and for a committed night, which the
  adapter refuses to plan, the Board port reads it itself (`app/(studio)/board/_port/real.ts`).
- **status** prints `load (15 min) cpu 34% · ram 52% · gpu 8% - band 60-80%`, then `waiting: memory 2 ·
  comfy-queue 1` from the newest sample when anything waits, and `interrupted: <job ids>` - an
  interrupted job's outcome is unknown and only the operator retries it. `--json`: `load: {last15: {cpu,
  ram, gpu} (each absent when unread), band, waiting: [{jobId, resource}], samples}` and `interrupted`.
- **taste.md** opens with `## Last night's load`: the newest closed or committed night with samples
  (a dry night too, marked dry - the stand-ins skip vendors, not the box), its averages and time in
  band, what waited, and the one resource that sat longest under the band (`gpu under 60% for 88% of
  the night`) - the scope the next night has room to add.

## The registry

The nights read the ai-registry and send it back only what a verdict earned (spark
`registry-feedback-loop`, 2026-10-22). The registry is public; nothing here writes into it.

- **Read.** `open` writes `<night>/registry.md` (`lib/foundry/scout/registry.ts`) from the registry's
  `knowledge/media-generation/index.json` - `AI_REGISTRY_DIR`, else `.ai/manifest.yaml` `registry.local`:
  `## Governs tonight`, at most 12 techniques ranked by word overlap of slug and use_when with the watchlist
  and the scout vocabulary, tripled inside the subjects scout's acts are governed by (`GOVERNING_SUBJECTS`),
  at most 4 a subject; `## Gaps`, at most 8 - draft subjects, thin visual-generation / production-ops subjects,
  the headings of `knowledge/OPEN-QUESTIONS.md`. One search line a night goes to a gap. Each digest appends
  one `.ai/consults.jsonl` line. No registry: `registry: none (<why>)`, a doctor note, the night unchanged.
- **Earn.** A live commit queues an event in `foundry-out/scout/leads.json` (`lib/foundry/scout/leads.ts`,
  `leadEvents.ts`) for: a kept finding whose `restates` names a finding an earlier night kept and committed
  live (its PATTERNS line reads `n=2`); a keep from a source marked `rich` (a nomination for the registry's
  /intake); a style turned `proven` and a genre turned publishable - hooks only today, since a scout commit
  never promotes a style (only the forge's does) and the genre forge is not built. Dry nights queue nothing.
- **File.** The next night's step 0 writes each event as one claim (*when X, do Y, because Z*) and files it
  with `lead`: `{ts, bundle: media-generation, nearest?, kind, claim, because, confidence, from: scout@<v>}`,
  `because` ending `[scout:<key>]`. A mature genre's lead carries craft only.
- **Drain.** The registry's weekly drain (`ai-registry/scripts/drain-schedule.ps1`, registered by the
  operator) collects every project's leads, rules at most 12 open media-generation rows and opens one pull
  request; nothing lands in the registry until the operator merges it.

## The skill and the schedule

`/scout night` (`.claude/skills/scout/SKILL.md`) is the only reader in the loop: it chooses sources
around the watchlist and the taste, groups pictures into looks, picks the shots, and writes findings.
It never keeps or commits. `pipeline/scout-schedule.ps1` registers the nightly run on Task Scheduler -
`-Print` shows it, `-Install -At 22:30` registers it, `-Remove` takes it away; the operator installs it.
The scheduled run is `claude -p "/scout night --until 06:30"` with its tools fenced to search, read,
the CLI and committing `knowledge/` and `.ai/registry-leads.jsonl`; logs land in `foundry-out/scout/logs/`.

## Muse

The loop's second wing (spark `scout-muse`, 2026-10-23; skill `/scout-muse`): an SFW study of how
fictional adult women are drawn as characters - ultra-photoreal portrait, cinematic still, fashion
editorial, semi-real painterly, anime/cel, stylised 3D, real-time 3D companion, toon-shaded 3D - crossed
with character cards as 9:16 posters and 16:9 roleplay-situation scenes. Craft notes:
`knowledge/scout-muse/techniques.md`.

- **A wing is a root.** `foundry-out/scout-muse/` (`SCOUT_MUSE_STORE_DIR`) beside `foundry-out/scout/`;
  every CLI line takes `--wing muse` (`lib/foundry/scout/wing.ts`, the active wing in `wingScope.ts`).
  Taste, ideas blocked, steer, source dedupe and leads never cross wings. The `/scout` screen switches
  wings (`/scout?wing=muse`); the Board packet is `pkt:scout:muse:<night>`; a Floor pile reads `muse <night>`.
- **What the muse wing runs:** doctor, open, add-source, ideas, finding, direction, watch, close, status,
  style. Ingest, scenes, clips, assets, reels, seeds and music are refused under `--wing muse`.
- **Ideas** take `target: style | scene | character`, an `aspect` (muse default 9:16; the studio draws only 16:9, 1:1 and 9:16) and, for a character,
  a `card` `{name, age 25-50, look, personality}`. The door refuses a prompt without `aged NN` (25+), a
  character prompt whose age is not her card's, and youth or nudity words.
- **The eye.** After the pixels are held, `lib/foundry/scout/judge.ts` reads adult / apparent age /
  clothing / real-person / hands (`muse.ts` `judgeFailure`). Not adult, read under 21, nude, or a possible
  real person: the still is deleted and the candidate fails `judge: <field>`. The eye is local first.
- **Money.** Studio credits at quality Low (refused over 25 credits a still); `--ideas` default 25, max 50;
  the night's Gemini ceiling defaults to $2 (only a judge fallback spends it). A refused studio generation
  is deleted like a delivered one.
- **Landing.** A kept `style` idea develops through the extract into the SHARED catalogue (either wing may
  use the look); kept findings land in `knowledge/scout-muse/techniques.md`, kept watch lines in its
  `watchlist.md`, kept characters in `characters.md` (`appendCharacter`). Muse stills are not Library
  material through the scout feed; kept characters reach the Library as the `character` kind
  (`lib/library/feeds/character.ts`), one item per woman, her stills as its looks.
- **Reasons.** The scout source binds all eleven Board keys, so muse throws ride `craft` (anatomy),
  `rights` (likeness), `subject` (young, drift - in the note), `style` (plastic - in the note), `generic`.
- Not scheduled: `pipeline/scout-schedule.ps1` runs `/scout night` only.

## Files on disk

`foundry-out/scout/<night>/` (`SCOUT_STORE_DIR` moves the root):

| Path | Written by | What |
|---|---|---|
| `night.json` | every writer, through `mutateNight` (a lock file, so processes queue) | the manifest: `lib/foundry/scout/types.ts` `Night` |
| `registry.md` | `open` | the registry digest: governing techniques and gaps, or `registry: none (<why>)` |
| `taste.md` | `open` | the seed sections, the last seven committed live nights' verdicts: kept and thrown per kind, reasons and notes verbatim, game assets by class and technique, channels kept and thrown |
| `sources/<s-NN>/p-NNN.<ext>` | ingest | a picture, or a page's pictures |
| `sources/<s-NN>/k-NNN.jpg` | ingest | a video's gated keyframes (`at` on the source) |
| `scenes/<c-NN>/` | the scene producer | replica stills and the clip |
| `assets/<c-NN>/concept-<k>.png` | the asset producer | a game asset's concepts (the asset itself is `foundry-out/mesh/<asset>/`) |
| `ideas/<c-NN>.png` | the ideas and reels producers | an idea's tile: its studio artboard, or a stats idea's frame 120 |
| `ideas/<c-NN>/brief.json`, `approach.json` | `ideas` | a stats idea's illustrative brief and approach, as sent |
| `ideas/<c-NN>/strip.html` | the reels producer | a stats idea's strip, once it passed the lint |
| `storyboards/<c-NN>/panel-<k>.png` | the storyboard producer | a storyboard's Flux frames, ours |
| `tracks/<c-NN>/a<N>.mp3` | `track` (collect) | a track's Suno clips, ours |
| `visualizers/<c-NN>/visualizer.mp4`, `visualizer - youtube.txt`, `still.<ext>` or `studio.<ext>` | `visualizer` (collect) | a full-song visualizer, its YouTube text and the still it played over |
| `../seeds/<batch>/batch.json` | `seeds new` (whole, once); the Board's apply (`committed`, once) - under the batch's lock | one seed batch: `SeedBatch` |
| `../steer.json` | `/scout`'s actions | the operator's split and paused seeds, every change in `history` |

A style candidate's looks live in its extract run, `foundry-out/extract/<runId>/`. The kernel store
(`foundry-out/gravitone.sqlite`, `GRAVITONE_STORE_PATH` moves it) holds the jobs, their spend, and the
packet.

## Testing and rehearsal

The tests (`tests/next-server/scout-*.test.ts`, `packages/producers/test/scout-ingest.test.ts`) run on
temp stores, stub tools and a fake web: nothing reaches a network, a binary or a vendor. `runCli`
takes `ports` (an ingest spawn, a resolver for `safeFetch`, a clock) so a rehearsal can run a whole
dry night offline without weakening a single check.
