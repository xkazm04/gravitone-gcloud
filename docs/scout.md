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
| `doctor [--dry]` | one line per check: yt-dlp, ffmpeg, ffprobe (`-version`), `GOOGLE_AI_API_KEY` and `LEONARDO_API_KEY` set or unset (never their values), the store and night folders writable, `GRAVITONE_DRY_ONLY`. A failing line carries its remedy; exit 1 when a check the night needs fails (`--dry`: the keys and the dry pin are notes). The registry, the Leonardo studio and Playwright's `chromium` (where `chromium.launch` would start it, never launched) are always notes | no |
| `open [--ceiling 15] [--target 20] [--clips 2] [--assets 3] [--ideas 25] [--reels 6] [--until HH:MM] [--live]` | creates the night, writes its `taste.md` and `registry.md` (below, "The registry"), prints its id. `--until` is local time today, or tomorrow once that has passed. Without `--live` the night is dry; `--live` is refused under `GRAVITONE_DRY_ONLY=1` | no |
| `add-source <night> --json <file\|->` | `[{url, kind, title, channel?, why, found, watch?, rich?} \| {fromIdea: <night>/<c-id>, why?}]`, validated (below). A `fromIdea` item brings a KEPT idea's artboard in as our own source (found `idea`, rights `ours`, already ingested, nothing downloaded) - refused for an idea not kept, a dry night's, or one any night already develops. A URL an earlier night made a candidate from is skipped and reported; one it only held is taken | no |
| `ingest <night> [--source s-NN] [--retry] [--detach]` | launches the `scout-ingest` job over the pending sources and drives it here; `--retry` first puts the failed sources in scope back to pending | no |
| `style <night> --sources s-01,s-03 --use "<content>" [--slug x] [--detach]` | an ordinary extract run (`launchExtract`, a gallery of those sources' pictures and keyframes) as one style candidate; its run id and job id go on the candidate | yes |
| `scene <night> --source s-NN --use "<content>" [--frames k-012.jpg] [--detach]` | a scene candidate read from the chosen keyframe (default the first; ingest keeps one frame per cut, so neighbouring keyframes are different shots), launched through `launchScene` (`lib/producers/scoutScene.ts`) with a clip while the night's clip cap allows | yes |
| `asset <night> --brief <file\|-> [--detach]` | one game asset from `{class, subject, use, style?, kind?, techniques?, fromIdea?}`: its concepts drawn and gated, its mesh asset written and the mesh job QUEUED for the worker (below, "A game asset") | yes |
| `ideas <night> --json <file\|-> [--detach]` | `[{title, target: scene\|style\|asset3d\|stats, genre, prompt, anchor: {kind: watch\|gap\|free, ref}, use?, reel?}]` (`genre` required, <= 80 chars), one `idea` candidate each. Scene, style and 3d-asset ideas are ONE `scout-ideas` job drawing a rough artboard each in the Leonardo studio (driven here unless `--detach`); stats ideas carry `reel` and are ONE `scout-reels` job on the Claude seat, always queued for the worker (below, "A stats reel"). One bad brief refuses the batch with its place; a batch over `ideaCap` or `reelCap` writes nothing | studio credits, the seat |
| `direction <night> --json <file\|->` | `{title, format: short\|video, genre, style, tone, audience, premise, basedOn: [<night>/<cell id>], use?}`: one `direction` candidate, words, rendered at once. Every `basedOn` entry must be a cell a LIVE night kept; the refusal names the entry and why | no |
| `finding <night> --json <file\|->` | `[{sourceIds, template, step, claim, quote, restates?}]`; `knowledge/templates/<template>/` must exist, `step` is `NN-name` and need not exist yet | no |
| `watch <night> --entry "..." --why "..." [--sources s-01]` | a proposed watchlist line | no |
| `close <night> [--stop <reason>]` | settles style candidates from their runs, closes the night, prints the morning: packet id, counts by kind and status, settled and held USD | no |
| `leads [--json]` | the lead queue's pending events (`foundry-out/scout/leads.json`): key, kind, night, refs, evidence | no |
| `lead <key> --json <file\|->` | `{claim, kind: technique\|application\|subject, nearest?, confidence: low\|medium\|high}`: one line into `.ai/registry-leads.jsonl`, once per key, and the event marked filed. Refused: an unknown key, a claim outside 12-400 characters, a `nearest` the registry's media-generation index does not hold, a mature event's claim naming its genre | no |
| `status [<night>]` | every night, or one with its budget, sources and candidates | no |
| `folder <dir> [extract args]` | the train-style path: `pipeline/foundry/extract.mts <dir> ...` with its output and exit code | as extract |

Every launching command (`ingest`, `style`, `scene`, `asset`, `ideas`) refuses on a night that is not open, and after the
deadline (closing the night with `stop: deadline`).

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

## Files on disk

`foundry-out/scout/<night>/` (`SCOUT_STORE_DIR` moves the root):

| Path | Written by | What |
|---|---|---|
| `night.json` | every writer, through `mutateNight` (a lock file, so processes queue) | the manifest: `lib/foundry/scout/types.ts` `Night` |
| `registry.md` | `open` | the registry digest: governing techniques and gaps, or `registry: none (<why>)` |
| `taste.md` | `open` | the last seven committed live nights' verdicts: kept and thrown per kind, reasons and notes verbatim, game assets by class and technique, channels kept and thrown |
| `sources/<s-NN>/p-NNN.<ext>` | ingest | a picture, or a page's pictures |
| `sources/<s-NN>/k-NNN.jpg` | ingest | a video's gated keyframes (`at` on the source) |
| `scenes/<c-NN>/` | the scene producer | replica stills and the clip |
| `assets/<c-NN>/concept-<k>.png` | the asset producer | a game asset's concepts (the asset itself is `foundry-out/mesh/<asset>/`) |
| `ideas/<c-NN>.png` | the ideas and reels producers | an idea's tile: its studio artboard, or a stats idea's frame 120 |
| `ideas/<c-NN>/brief.json`, `approach.json` | `ideas` | a stats idea's illustrative brief and approach, as sent |
| `ideas/<c-NN>/strip.html` | the reels producer | a stats idea's strip, once it passed the lint |

A style candidate's looks live in its extract run, `foundry-out/extract/<runId>/`. The kernel store
(`foundry-out/gravitone.sqlite`, `GRAVITONE_STORE_PATH` moves it) holds the jobs, their spend, and the
packet.

## Testing and rehearsal

The tests (`tests/next-server/scout-*.test.ts`, `packages/producers/test/scout-ingest.test.ts`) run on
temp stores, stub tools and a fake web: nothing reaches a network, a binary or a vendor. `runCli`
takes `ports` (an ingest spawn, a resolver for `safeFetch`, a clock) so a rehearsal can run a whole
dry night offline without weakening a single check.
