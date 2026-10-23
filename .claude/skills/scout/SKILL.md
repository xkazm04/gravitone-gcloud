---
name: scout
memory: none
version: 1.3.0
category: Development
description: The nightly training loop - search the web and YouTube around knowledge/scout/watchlist.md for art styles, scenes and craft worth learning, bring them onto this box, replicate them as kernel jobs (extracted still styles, scene recipes with Flare replica stills and local LTX clips, craft findings) and brief up to three 3D game assets (concept -> TRELLIS mesh -> Blender finish, made on this box) and up to six stats-reel ideas (a data video authored in code on illustrative numbers), ~100 one-sentence seeds (genre, subgenre, type, audience, format) on their own packet, 20-30 rough idea artboards grown from kept seeds in the operator's Leonardo studio, Suno tracks from kept music seeds and full-song visualizers from kept tracks, and 1-3 directions to confirm - all for YouTube video (Shorts ~30 s, videos up to 5 min) - inside a $15 Gemini night, and leave ONE Board packet pkt:scout:<night> for a few minutes of K/X in the morning. Successor of train-style and of dojo's hand-run corpus study. Wraps pipeline/scout.mts; it never keeps, rejects or commits anything on the Board. Invoke with /scout night [--dry] [--until HH:MM], /scout seeds [--dry], /scout folder <dir> [extract args], /scout status [<night>].
argument-hint: "night [--dry] [--until HH:MM] | seeds [--dry] | folder <dir> | status [<night>]"
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, WebSearch, WebFetch, Monitor
---

# Scout - find it at night, decide it in the morning

One night is one bounded run: **sources** found on the web, **candidates** made from them, **one packet**
the operator triages. The CLI (`pipeline/scout.mts`) and the kernel do everything that spends or writes;
this skill does the two things only a reader can: choosing what is worth studying, and writing findings
in words. Operator doc: `docs/scout.md`. Design: spark `media-training-loop` (2026-10-22).

**The verdict is never yours.** Nothing this skill does admits a style, a scene or a finding into the
Library or `knowledge/`: only the operator's commit of `pkt:scout:<night>` does (hitl-approval,
truncated-verdict-space). You pre-filter; you never keep.

## What the night is for (read before every night)

The operator's rulings, 2026-10-23, after the first live night and the first idea batch:

- **The product is a YouTube video**: a Short (~30 s) or a short video (up to 5 minutes). Every run,
  idea and direction serves one. A style is only ever the BASELINE LOOK of such a video - nothing here
  is made to be printed, hung or sold as an image: no picture books, no posters as the product, no
  paintings, no image art. A look nobody would animate or cut is not a find.
- **Seeds come first, and they are the branches** (operator, 2026-10-23: "more generated items in text/idea
  stage for quick triage ... pushing for example 100 of main genre/directions items to evaluate, so we can
  nightly create derivations of that"). A SEED is one sentence naming a genre, a subgenre, a type of
  content, an audience (`kids`, `family`, `adult`) and a format. Each night writes ~100 (step 1a), the
  operator keeps or throws each with a reason on `pkt:seeds:<batch>`, and every kept seed is a BRANCH:
  the next night derives 2-3 narrower child seeds from it and draws 1-2 idea artboards on it, and every
  idea, run and track records the seed it grows from. `/scout` draws the whole tree with each branch's
  effort; the operator pauses branches there and sets an ADVISORY split by audience, then genre - the
  brief's `## Branches` says each branch's target against the share it took. Steer tonight's fresh seeds
  and runs toward the targets; a paused branch gets nothing (its doors refuse). The spread below now holds
  for the SEED batch: at least fifteen genres, all three audiences, at most ten seeds a genre.
- **Spread the genres first.** Until the taste brief holds three or more `## Directions confirmed`, a
  night casts wide: its ideas span at least eight genres, at most four ideas in any one (animated comedy
  sketch, music video, lyric video, data explainer, title opener, trailer or teaser, animated short for
  kids, horror micro-short, documentary short, mood reel, product-style ad, loop or ASMR short, and
  whatever the watchlist and the gaps add). Once directions are confirmed, most of the night works
  inside them and a third still explores.
- **Notes confirm a direction; they do not report statistics.** The operator decides on execution in
  video. A direction (step 4b) says, in production words, what the approved decisions add up to - *an
  animated comedy sketch, in the kept painted-3D look, dark humour for adults, a story around a
  lighthouse keeper's cat who sabotages the night shift* - for one K or X. A craft finding is at most a
  supporting line about how a shot, a cut or a beat lands in a video, never a measurement for its own
  sake (2026-10-22: two cut-list measurements were rejected `generic`).
- **The night keeps the box's CPU, RAM and GPU in 60-80%** (operator, 2026-10-23: "so we can learn from
  each run how to ideally balance scope for whole night period"). Under 60% the box sat idle and the
  night was under-scoped; over 80% it queued itself. The always-on worker samples the box every minute;
  `status` reads the last 15 minutes against the band, the morning desk draws the whole night, and
  `taste.md`'s `## Last night's load` says what sat idle last time. The band steers how much you
  LAUNCH - it never raises a cap or a ceiling (those are spend decisions), and admission's own marks
  (memory 85%, CPU 90%) still hold the top.

## The money and the rights (read before every night)

- **$15 per night; clips are local and free** - stills are Leonardo GPT Image 2.5 Flare at LOW (~$0.015 each),
  clips LTX-2.5 on this box's ComfyUI (~100 s each, $0, `--clips` caps GPU minutes, default 2). ComfyUI's
  queue is shared with any other session's jobs - a busy card stretches the night, it does not fail it.
  The operator's standing grant for this loop
  (2026-10-22). The night's ceiling is enforced by the CLI per launch; never raise `--ceiling`, `--clips`,
  `IMAGING_BUDGET_USD_PER_WINDOW` or `VIDEO_BUDGET_USD_PER_WINDOW` on your own. A refused launch is the
  ceiling working: close the night, do not retry around it.
- **Sources are reference-only.** Public, official or promotional material only: an artist's own page or
  channel, a studio's trailer, a museum, an editorial site. Never anything behind a login or a paywall,
  never a re-upload or a pirate mirror, never a private person's account. Held on this box for study;
  only frames are kept; nothing is redistributed.
- **A source seeds words, never pixels.** It is never passed to a generator as a reference; a clip
  animates our own replica still (the scene producer refuses anything else).
- **Craft, not content.** A recipe, a finding, a watch line or an asset brief never names a person, a
  title, a studio or a franchise.
- **A game asset is drawn from OUR words, never from a found picture.** Its concept is generated from the
  brief; a source never becomes a concept or geometry (`rights: publishable` depends on it).
- **Game assets: at most `--assets` a night** (default 3 while the 3D engines are being profiled), each a
  few cents of Flare concepts; the mesh and the finish are local and free, admitted by the worker by
  measured memory and GPU - never raise the cap, never start ComfyUI or Blender yourself.

## /scout night

The scheduled entry (Task Scheduler, `pipeline/scout-schedule.ps1`) runs `claude -p "/scout night"` at
the operator's hour; the operator may also type it after a workday. Either way:

### 0. Preflight - no spend

1. `npx tsx pipeline/scout.mts doctor` - with `--dry` when the night will be dry (the vendor keys and
   the dry pin are then notes, not failures). Exit 1 -> write the failing lines into the night summary
   (step 6) and stop. Never install, configure or work around a missing binary or key.
2. **Commit yesterday's kept knowledge.** The Board's apply wrote kept findings into
   `knowledge/templates/**/PATTERNS.md` and kept watch lines into `knowledge/scout/watchlist.md`.
   `git status --short knowledge/` - stage ONLY files whose diff consists of lines carrying a
   `<!-- scout:` marker (read each `git diff` first; anything else in that file is someone's WIP and the
   file is skipped), then `git commit -m "knowledge(scout): <n> findings kept from <nights>"` on the
   current branch. **Never push.** Nothing to commit is fine.
3. **File what the operator's verdicts earned for the ai-registry** (spark registry-feedback-loop). The
   Board's commit queued an event for each keep that earned one: a style turned `proven`, a genre turned
   publishable, a finding that `restates` one an earlier night kept (n=2), a keep from a source marked
   `rich`. `npx tsx pipeline/scout.mts leads` lists them (key, kind, night, refs, evidence). For each, write
   ONE claim in the registry's form - *when X, do Y, because Z* - from its evidence lines only, 12-400
   characters, and file it: `npx tsx pipeline/scout.mts lead <key> --json <file>` with `{claim, kind:
   technique|application|subject, nearest?, confidence: low|medium|high}`. `nearest` is a media-generation
   subject slug (the last night's `registry.md` names the governing ones); omit it when none fits. A
   `source-rich` event is a `kind: subject` nomination of the URL for the registry's /intake - do not mine
   it here. A MATURE event files craft only (`lead` refuses a claim carrying a word of the genre's name or
   use): what cannot be said without the content is not filed. A refused `lead` exits 1 with its reason -
   fix the claim, never the evidence; a key filed already exits 0 and writes nothing. Then
   `git add .ai/registry-leads.jsonl` and `git commit -m "leads(scout): <n> filed for the ai-registry"`.
   **Never push**; the registry's weekly drain collects them. The registry is public: a claim names craft,
   never a person, a title or a franchise.
4. `npx tsx pipeline/scout.mts status --json` - an earlier night still `open` (a killed run) is closed
   first: `close <id> --stop failure`. Untriaged packets do not stop tonight; they queue.

### 1. Open

`npx tsx pipeline/scout.mts open --live --until 06:30 --json` (a typed `/scout night --dry` drops
`--live`; `--until` from the argument when given). Note the night id. Then read, in this order:
`foundry-out/scout/<night>/taste.md` (`## Last night's load` first: how much of the band last night
filled and what sat under it - scope tonight to fill that; then what the operator kept and threw, with reasons - **a channel or a
kind of look rejected twice is not searched again, and a use under "refused as a use" is not proposed
again** unless the night has a new reason it now serves; `## Directions confirmed` are the lanes the
night works inside, `## Directions refused` are never proposed again, `## Ideas to develop` are tonight's
first work (step 4), `## Ideas blocked` are the bans of tonight's ideation (step 1d) and `## Genres`
says which genres the operator keeps and throws; `## Seeds to develop` are tonight's child seeds and ideas
(steps 1a, 1d), `## Seeds blocked` the bans of tonight's seed batch, `## Paused` the branches nothing grows
on, `## Seed genres` what the operator keeps and throws per audience and genre, `## Branches` every
branch's depth, effort and split target against the share it took, `## Tracks to visualize` tonight's
visualizers (step 4c)), `foundry-out/scout/<night>/registry.md` (what
the ai-registry says about tonight's work: `## Governs tonight` - techniques to follow when a candidate does
that thing; its ranking is by words, so read a technique's file before calling it governing; `## Gaps` -
where the registry is thin; `registry: none` means no registry resolved and changes nothing else),
`knowledge/scout/watchlist.md`, and what the Library already holds (`pipeline/foundry/styles.json`: names
and recipes - a look already there is not a find).

### 1a. Seeds - write the batch FIRST

Words only: no job, no spend, allowed on a dry night. ~100 seeds (`seeds new` takes up to 150):

1. **Children first.** For every `## Seeds to develop` line that `needs: child seeds`, 2-3 child seeds
   with `parent: <its ref>`: the same branch narrowed - a subgenre, an angle, a format, an audience
   variant. A child is a new question, not a rewording of its parent.
2. **Fresh seeds fill the batch** to ~100, spread (above): at least fifteen genres, all three audiences,
   at most ten a genre; the split's audience and genre targets (`## Branches`) weight where the fresh ones
   go. Music is a genre like any other - a music seed's type is `music video`, `lyric video` or
   `visualizer`, and its sentence is the song as much as the picture (`a slow tango for two coats on a
   coat rack`).
3. **Bans.** Nothing under `## Seeds blocked` or `## Ideas blocked` again, nor a near neighbour; nothing
   under `## Paused` (the door refuses a child of it).
4. **Each seed** - `{sentence, genre, subgenre, type, audience, format, parent?}`: the sentence (<= 200
   chars, one line) is the video in one line, what it IS and for whom - not a technique and never a
   person's, a studio's or a franchise's name.
5. One JSON array -> `npx tsx pipeline/scout.mts seeds new --json <file>` (`--dry` on a dry night). One bad
   seed refuses the batch with its place: fix it and resend. Note the batch id and its packet link for the
   summary (step 6).

### 1b. Game assets - brief them EARLY

The meshes run for minutes on the card and in Blender, admitted by the worker while discovery goes on,
so brief them right after `open`, before any search:

1. **What exists.** `npx tsx pipeline/mesh.mts status --json` - every asset with its class, techniques,
   verdicts (the Library's 3D models shelf shows the same, faceted by class and technique). The taste's
   `## Game assets` block says which technique the operator keeps per class and the reasons a variant
   was thrown (`topology`, `texture`, `rig`, `scale`).
2. **Choose up to `assetCap` briefs** from that gap and the watchlist: a class the shelf lacks, a
   technique the taste has not settled (T1 budget generation against T2 game-camera design for a hero),
   a weapon kind not yet made. Ground each in the registry's game-production knowledge before writing it -
   `../ai-registry/knowledge/game-production/asset-production/geometry/asset-class-poly-budgeting/`
   (the class budget is an instruction the generator spends, not a ceiling),
   `.../sourcing-economics/image-to-3d-input-gating/` (one subject, plain ground, whole in frame,
   canonical view - the CLI's prompts already say it; your subject must not fight it), and
   `../ai-registry/knowledge/media-generation/visual-generation/animatable-character-design/`
   for a character (a silhouette that reads, limbs clear of the body, nothing held, no capes or strands
   the rig cannot drive).
3. **Write each brief** to a scratch file and launch it:
   `{"class": "character|weapon|prop", "subject": "<craft words: what it is, materials, silhouette, palette>", "use": "<what it is for in that project>", "serves": {"project": "pof|mage-arena|bp"} | {"newProject": "<the kind of project it opens>"}, "style": "<optional>", "kind": "<weapon: sword|mace|axe|staff>"}`
   -> `npx tsx pipeline/scout.mts asset <night> --brief <file> --json`. **Every asset has a purpose**
   (operator, 2026-10-23, rejecting every asset of the first 3D nights for having none: "we cannot create assets
   without purpose"): it HELPS an existing game project (`serves.project`) or OPENS a new kind of project
   (`serves.newProject`, in plain words - "a cozy farming sim"), and `use` says what it is for there ("the
   starting party's ranged hero"). The door refuses a brief without both; the 3D row leads with them. Leave `techniques` to the class
   default unless the taste asks a question one technique answers. One subject per brief - "a quiver"
   is a prop of its own, never part of a character's brief.
4. Read the answer: a variant written `failed` by the input gate carries its codes - that brief's
   concept did not reconstruct; do not relaunch it the same night. The mesh job is queued for the
   worker; you do not wait for it.

### 1c. Stats reels - brief them EARLY

Each stats idea is authored as a full 8 s strip in code on the Claude seat (~15 min an idea), queued for
the worker while discovery goes on, so brief them right after the assets. Up to `reelCap` a night
(`open --reels`, default 6; `status --json` -> `reels` says how many are left). Never raise it.

1. **The topic passes the gates first** -
   `../ai-registry/knowledge/media-generation/narrative-craft/data-video-virality/data-video-virality.md`
   and its `techniques/`: **continuity** (fine-grained steps, or a long series of many entities, the
   screen changing at every step), **path over conclusion** (overtakes, crashes, comebacks - write the
   keep-watching reason down with names and dates; a payoff only in the last frame fails), **dated
   accelerators** (5-15 real events the data reacts to). Never a single-value ladder, a record list or
   a winners list, however famous the topic.
2. **Its `use`** - the content it serves, one line, as every run's (step 4.0) - and **its anchor**: a
   watchlist line, a `## Gaps` line of `registry.md`, or `free`.
3. **An ILLUSTRATIVE brief** in a strips fixture's shape. Read one first (`pipeline/strips/data/*.json`:
   `f1-wins.json` is a `cumulative-race`, `gdp-top.json` a `level-race`) and write the same shape of
   `data` with plausible numbers - `{case, title, hook, unit, kind, data, steps?, illustrative: true}`,
   `kind` one of `level-race | cumulative-race | counter | ranking | share`, `case` a lower-case slug.
   No source block and no research tonight: the night triages ideas, not datasets, and the strip's
   source line says "illustrative data". Under 60 KB of JSON with the approach.
4. **The seat's own approach** - free design, not one of the 20 cards, under
   `../ai-registry/knowledge/media-generation/visual-generation/data-video-art-direction/`:
   `{name, medium, grammar, density, direction, falsifier}` (`pipeline/strips/approaches.json` shows the
   fields filled; `medium` is one of `svg|canvas|dom|css3d` - never webgl, it renders black -, `grammar`
   one of `draw-on|morph|camera|stepped|particle|reflow|type`, `density` one of `low|mid|high`; the door
   refuses any other word), the falsifier written before anything renders. `prompt` is your one-paragraph
   direction to the author turn.
5. **The batch goes through the ideas door**, target `stats`, `reel: {brief, approach}`:
   `{"title": "<headline, <= 90 chars>", "target": "stats", "prompt": "<direction>", "anchor": {"kind": "watch|gap|free", "ref": "<line or empty>"}, "use": "<content>", "reel": {...}}`
   in a JSON array -> `npx tsx pipeline/scout.mts ideas <night> --json <file>`. One bad brief refuses
   the whole batch with its place and reason: fix that brief, resend the batch. The reels job is
   always queued, never driven here; its tile (frame 120) reaches the packet's ideas tab when the
   worker has authored it. Do not wait for it.

`K` on a reel idea records the keep - its real data and full render come on a later night (not built
yet); `X` blocks it. Either verdict and its reasons land in `night.committed`.

### 1d. Ideas - draw them EARLY

Up to `ideaCap` rough idea artboards a night (`open --ideas`, default 25; the operator: "always 20-30
ideas on top of the current scope"), drawn one by one in the operator's Leonardo studio on `box.chrome`
while discovery goes on (~45 s each, studio credits, never against the night's Gemini ceiling; every
generation is deleted from the studio once its picture is held). An idea is the cheapest question the
night can ask: one picture of a rough intent, one keystroke to block it or develop it.

1. **Front-load the material** (registry `ad-concept-development/divergence-against-the-median`): the
   taste brief's directions and genres, the watchlist lines, `registry.md`'s `## Gaps`.
2. **Name the obvious and ban it.** Write down first the ten most obvious ideas for tonight's anchors
   (a city skyline poster, a hero on a cliff at sunset, a neon-soaked street...) and every title under
   the taste's `## Ideas blocked`; nothing you brief tonight is one of them or a near neighbour.
3. **Grow them from kept seeds.** Every `## Seeds to develop` line that `needs: ideas` gets 1-2 ideas
   first; the rest of the cap goes to kept seeds by the split's targets, mostly inside confirmed
   directions, a third still exploring. Spread the genres (above) when no seed is kept yet.
4. **Each idea** - `{title, target, genre, seed, use, anchor, prompt}` (`seed: <batch>/sd-NNN` - required
   once any seed is kept; the door refuses an unkept or paused one):
   - `title` - the idea as a headline (<= 90 chars): what the video IS, not a technique;
   - `target` - what a keep builds next night: `scene` (a shot with a clip), `style` (the video's look),
     `asset3d` (a game asset), or `stats` (a stats reel - step 1c);
   - `genre` - one genre from the spread, in plain words (`animated comedy sketch`);
   - `use` - the video it serves, format first: `a 30 s Short: ...` or `a 3-minute video: ...`;
   - `anchor` - `{kind: watch|gap|free, ref: <the line, or empty>}`;
   - `prompt` - a concept artboard of that video's key moment, in craft words (never a person, a title, a
     studio or a franchise): the subject, the staging, the look, the light.
5. One JSON array -> `npx tsx pipeline/scout.mts ideas <night> --json <file>`. One bad brief refuses the
   whole batch with its place and reason: fix it and resend. Do not wait for the drawings.

### 2. Discover - your judgement, the night's quality

Aim for a packet of **about 20 rows**: ~8 style sources (grouped below into 3-5 extract runs), 3-4 scenes,
2-4 findings, 0-2 watch lines. Search around each watchlist line first, then outward for what the Library
lacks (a medium, a palette family, a lighting idiom, a cutting rhythm none of its styles covers).
**One search line a night goes to one `## Gaps` line of `registry.md`** (operator, 2026-10-22): name it in
that source's `why` as `gap: <subject>` (or `gap: OPEN-QUESTIONS Qn`). A source that teaches a whole
mechanism (a talk, a breakdown series), not one finding, carries `rich: "<one line on what>"` (<= 200 chars)
in its `add-source` item: a keep from it nominates it to the registry's /intake.

- Pictures: an image URL or a page whose pictures carry one coherent look that a VIDEO could wear -
  animation key art, film stills, motion-design frames; a print or painting medium only when tonight's
  idea is to animate it. Video: a trailer, a short, a music video whose SHOTS teach something -
  composition, light, a camera move, a cut rhythm.
- **Where the sources actually are** (measured 2026-10-22; a plain web search returns articles and
  AI-image marketing, never a usable picture or a video):
  - Pictures, rights-clear: museum open-access APIs give direct image URLs. The Met:
    `curl -s "https://collectionapi.metmuseum.org/public/collection/v1.1/search?hasImages=true&isPublicDomain=true&q=<words>&limit=12"`
    then `.../public/collection/v1/objects/<id>` for each; its filter is loose, so keep an object only
    when the object itself says `"isPublicDomain": true` and has `primaryImageSmall` (that URL is the
    source; the title gets the object id). Strong for print, painting and drawing media.
  - Video: `yt-dlp --js-runtimes node "ytsearch10:<words>" --flat-playlist --print "%(id)s|%(channel)s|%(duration)s|%(title)s"`
    - prefer the studio's or the creator's own channel and a duration under 20 minutes.
  - Not reachable from this box (2026-10-22): the Library of Congress (a Cloudflare challenge) and the
    Art Institute of Chicago API (504) - do not spend turns on them. Modern print media (riso, screenprint)
    is rarely public domain; the artist's own site or shop page (`kind: page`) is the source for those.
  - Never an AI-image gallery or prompt site (they are generated work, not craft), never a re-upload.
- Read a video's captions for findings when it has them: `yt-dlp --js-runtimes node --skip-download
  --write-auto-subs --sub-langs en --sub-format vtt -o <scratch>/<id> <url>` - strip the timing lines,
  quote verbatim, delete the file after. (Without `--js-runtimes node` YouTube answers 403.)
- One line of `why` per source, in your words: what it would teach that the Library does not have.

Write the sources as JSON (`[{url, kind, title, channel, why, found, watch}]` - `kind` is `image | video | page`,
`found` is exactly `watchlist` or `search`, and `watch` is the watchlist line verbatim when `found` is
`watchlist`; where you found it in prose belongs in `why`) to a scratch file and
`npx tsx pipeline/scout.mts add-source <night> --json <file>`. A URL an earlier night launched a candidate from is skipped
by the CLI; take that as information, not an error.

### 3. Ingest

`npx tsx pipeline/scout.mts ingest <night>` - pictures fetched, videos cut to gated keyframes, the
download deleted. A failed source keeps its tool sentence; do not retry it by another route.

### 4. Make the candidates

Check `status <night> --json` before each launch - the remaining money AND `load`:

- **Under 60% on a resource, and money left: launch more work that loads it.** GPU idle - a scene with
  a clip while the clip cap allows, a game asset (step 1b); CPU idle - ingest the next sources, author a
  stats reel (step 1c), a style run. RAM follows whichever you add.
- **Over 80%: hold.** Launch nothing new until the next read is back in the band.
- `load.waiting` names what admission is holding now and on what (`memory`, `comfy-queue`, ...): work
  waiting on memory is not helped by launching more of it. A job listed under `interrupted` is the
  operator's to retry, never yours.

0. **Every run states its USE** (operator, 2026-10-22): the VIDEO it can help make, format first - `a 30 s
   Short: a deadpan animated comedy sketch`, `a 4-minute music video for a slow tango track`, `a 2-minute
   data explainer`. Never a book, a print, a poster series or a painting (2026-10-23). One concrete line,
   passed as `--use "<content>"`; it heads the run on the Board. A look or a shot you
   cannot name a use for is not launched - a run with no purpose is a mindless output, and the operator
   refuses those with the `use case` reason, which steers the next nights away from that direction.
0b. **Develop the kept ideas FIRST** - every `## Ideas to develop` line of the taste brief, before
   tonight's own finds. Bring its artboard in as a source - `add-source <night> --json` with
   `[{"fromIdea": "<night>/<c-id>"}]` (our own picture: rights `ours`, nothing downloaded) - then build its
   target with the acts below, `--use` from the idea: `scene` -> `scene --source <that s-NN> --frames
   <its file>`, `style` -> `style --sources <that s-NN>`, `asset3d` -> an `asset` brief carrying
   `"fromIdea": "<night>/<c-id>"`. The candidate carries `fromIdea`, and the idea leaves the list.
1. **Styles.** Group ingested pictures/keyframes that share ONE look (technique, palette roles, finish -
   not subject) into 1-4 sources per run: `style <night> --sources s-01,s-04 --slug <look-words> --use "<content>"`.
   One extract run per group. The engine reads, replicates from words and transfers; its scores are a
   pre-filter, not a verdict - you do not re-judge them by eye.
2. **Scenes.** Ingest keeps ONE frame per cut, so neighbouring keyframes are different shots (in a
   video essay, different films). Look at the keyframes first (`Read` them, or a contact sheet:
   `ffmpeg -v error -i <night dir>/sources/s-NN/k-%03d.jpg -vf "scale=320:-1,tile=6x4" -frames:v 1 <scratch>/sheet.jpg`),
   then for the 3-4 most instructive shots: `scene <night> --source s-NN --frames k-012.jpg --use "<content>"` - one frame
   per scene. Skip frames that are a talking head, a screenshot, or carry burnt-in text (an essay's
   captions, a counter). The first two scenes in priority order get a clip while the cap allows; put the
   shot whose MOTION teaches most first.
3. **Findings - at most two a night, and only about execution in a video.** A claim a director could
   act on in a video (<= 140 chars: how a shot, a cut or a beat lands - never a statistic for its own
   sake) + the verbatim quote or measurement that backs it + the knowledge step it
   belongs to (`knowledge/templates/<template>/steps/<step>/`) - an EXISTING step directory only
   (`ls knowledge/templates/<template>/steps`); camera, staging and shot craft go under `02-frames`
   until the knowledge numbering names motion and cut steps. `finding <night> --json <file>`.
   A finding the existing PATTERNS.md already states is not a finding - except a `## Scout findings` line
   at `n=1` that tonight's source says again independently: give the item `restates: "<night>/<candidate>"`
   (the marker at the end of that line names both). Kept, its line reads n=2 and it earns a registry lead.
4. **Watch lines.** A channel or site that produced two or more good sources tonight and is not on the
   watchlist: `watch <night> --entry "<channel - url>" --why "<what it teaches>"`.

### 4c. Music - tracks, then visualizers

The song is the clock: a track is made and judged one night, its visualizer only on a later one.
1. **Tracks** - up to `trackCap` (`open --tracks`, default 4), each from a kept seed whose type is music:
   `track <night> --seed <batch>/sd-NNN --detach`. One Suno create (both models, ~4 clips) on the
   operator's signed-in Suno browser, on `box.chrome` beside the artboards - they queue, so launch tracks
   after the ideas batch. The doctor's `suno` line must pass on a live night with tracks.
2. **Visualizers** - up to `visualizerCap` (`--visualizers`, default 2), one per `## Tracks to visualize`
   line: `visualizer <night> --track <night>/<c-id>/<aN> --detach` (~20-30 min each on box.render; a
   kept idea artboard of the same seed is the still when one exists).
3. Before closing, `track <night> --collect` and `visualizer <night> --collect`: a track or visualizer
   still collecting at close is a loss on the packet.

### 4b. Directions - the night's notes

One to three DIRECTIONS a night, each the operator's confirmation question in production words: what the
APPROVED decisions add up to. Read the taste brief's kept runs, kept ideas and confirmed directions; a
direction combines them into a video someone could start making - `{title, format, genre, style, tone,
audience, premise, basedOn}`:
- `title` - one headline: `Animated comedy sketch, dark humour for adults`;
- `format` - `short` (~30 s) or `video` (up to 5 minutes);
- `genre`, `style` (a kept look's name, or the look in words), `tone` (`deadpan, dark`), `audience`;
- `premise` - the story or the bit, in a sentence or two (<= 280 chars);
- `basedOn` - the committed cells it rests on, `<night>/<cell id>` as the taste brief lists them; the
  CLI refuses a cell that night did not keep. A direction with nothing approved under it is not proposed.
`npx tsx pipeline/scout.mts direction <night> --json <file>`. A direction under `## Directions refused` is
never proposed again; a confirmed one is not re-proposed - work inside it.

### 5. Stop

Collect the music first (step 4c.3). Stop launching at the first of: the deadline, a refused launch for money, ~20 rendered rows, three
consecutive failed launches (`--stop failure`), or nothing left worth studying (`sources-exhausted`).
Short of ~20 rows with time and money left, search again - another watchlist line, another gap -
before calling the sources exhausted; a short packet is a night that stopped early, and the stop
reason must say which it was (2026-10-22 rehearsal: a night closed at 15 rows by choice as
`sources-exhausted`).
`npx tsx pipeline/scout.mts close <night> [--stop <reason>]` - it prints the packet id and the counts.

### 6. The night summary - for the operator, not about yourself

Append to `.vault/Scout/nights.md` (create it): the date, the night id, the packet link
`/board/pkt:scout:<night>`, counts by kind, Gemini settled and held USD and the uncapped line, the stop
reason, `leads: N filed, M queued` (step 0, and `leads --json`), `seeds: batch <id> · N (C children,
F fresh) · /board/pkt:seeds:<batch>`, `ideas: N drawn across G genres from S seeds, K kept ideas developed`,
`music: N tracks, V visualizers`, `directions: N proposed`, and at most three
lines of what the night could not do (a source that refused, a doctor line). No narration of your process.

## /scout seeds [--dry]

A seed batch by day, so the next night already grows from the operator's keeps. No night is opened: read
the newest night's `taste.md` (its seed sections, `## Branches`) and `seeds status --json`, write the batch
exactly as step 1a, and print the packet link `/board/pkt:seeds:<batch>`.

## /scout folder <dir> [extract args]

The train-style path, kept: a folder of pictures on disk through the extract engine.
`npx tsx pipeline/scout.mts folder "<dir>" --slug <slug> --dry` first (prints the receipt), then without
`--dry` once the operator has seen the number in this session. The run is decided on its own packet,
`/board/pkt:extract:<run-id>`. Over ten minutes: launch it with `Start-Process` and poll the log with
Monitor, never a Bash background task. `--resume <run-id>` continues a stopped run; an `interrupted`
job holds `cloud.google` until the lane is acknowledged on Runs.

## /scout status [<night>]

`npx tsx pipeline/scout.mts status [<night>] --json` - render it as a short table: night, state, stop,
rendered / failed / pending, USD, and the packet link for every closed, untriaged night. For one night,
add its load line (`load (15 min) cpu 34% · ram 52% · gpu 8% - band 60-80%`), what waits, and the
interrupted job ids.

## What NOT to do

- Do not keep, reject or commit on the Board, and do not run `pipeline/decide.mts` for a scout packet.
- Do not pass a source picture or frame to any generator, and do not "improve" a replica by attaching one.
- Do not make a concept or a mesh from a found picture, by any tool; do not run `pipeline/mesh.mts new`
  or `keep`/`reject` for a night's asset - the night's asset act and the operator's packet own both.
- Do not raise a ceiling, a cap or a budget window; do not switch a dry night to live.
- Do not edit `night.json`, `styles.json` or a PATTERNS.md by hand.
- Do not push. Do not stage anything in step 0 but `knowledge/` and `.ai/registry-leads.jsonl`.
- Do not re-read a source the doctor or the ingest refused through another tool.
- Do not research a stats idea's real data on the night that proposes it, and never send a brief that is
  not `illustrative: true`.

## Lessons

Append (with Edit - the scheduled run's fence allows no shell write) to `.claude/skills/scout/LESSONS.md` only what would change the next night (a search that
always returns re-uploads, a source type the gates mangle, a prompt the scene door keeps refusing) and
the file it argues a change in. A night that went as written writes nothing there.
