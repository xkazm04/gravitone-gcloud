---
name: scout
memory: none
category: Development
description: The nightly training loop - search the web and YouTube around knowledge/scout/watchlist.md for art styles, scenes and craft worth learning, bring them onto this box, replicate them as kernel jobs (extracted still styles, scene recipes with Flare replica stills and local LTX clips, craft findings) and brief up to three 3D game assets (concept -> TRELLIS mesh -> Blender finish, made on this box) inside a $15 night, and leave ONE Board packet pkt:scout:<night> for a few minutes of K/X in the morning. Successor of train-style and of dojo's hand-run corpus study. Wraps pipeline/scout.mts; it never keeps, rejects or commits anything on the Board. Invoke with /scout night [--dry] [--until HH:MM], /scout folder <dir> [extract args], /scout status [<night>].
argument-hint: "night [--dry] [--until HH:MM] | folder <dir> | status [<night>]"
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
3. `npx tsx pipeline/scout.mts status --json` - an earlier night still `open` (a killed run) is closed
   first: `close <id> --stop failure`. Untriaged packets do not stop tonight; they queue.

### 1. Open

`npx tsx pipeline/scout.mts open --live --until 06:30 --json` (a typed `/scout night --dry` drops
`--live`; `--until` from the argument when given). Note the night id. Then read, in this order:
`foundry-out/scout/<night>/taste.md` (what the operator kept and threw, with reasons - **a channel or a
kind of look rejected twice is not searched again, and a use under "refused as a use" is not proposed
again** unless the night has a new reason it now serves), `knowledge/scout/watchlist.md`, and what the
Library already holds (`pipeline/foundry/styles.json`: names and recipes - a look already there is not a
find).

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
   `C:/Users/kazda/kiro/ai-registry/knowledge/game-production/asset-production/geometry/asset-class-poly-budgeting/`
   (the class budget is an instruction the generator spends, not a ceiling),
   `.../sourcing-economics/image-to-3d-input-gating/` (one subject, plain ground, whole in frame,
   canonical view - the CLI's prompts already say it; your subject must not fight it), and
   `C:/Users/kazda/kiro/ai-registry/knowledge/media-generation/visual-generation/animatable-character-design/`
   for a character (a silhouette that reads, limbs clear of the body, nothing held, no capes or strands
   the rig cannot drive).
3. **Write each brief** to a scratch file and launch it:
   `{"class": "character|weapon|prop", "subject": "<craft words: what it is, materials, silhouette, palette>", "style": "<optional>", "kind": "<weapon: sword|mace|axe|staff>"}`
   -> `npx tsx pipeline/scout.mts asset <night> --brief <file> --json`. Leave `techniques` to the class
   default unless the taste asks a question one technique answers. One subject per brief - "a quiver"
   is a prop of its own, never part of a character's brief.
4. Read the answer: a variant written `failed` by the input gate carries its codes - that brief's
   concept did not reconstruct; do not relaunch it the same night. The mesh job is queued for the
   worker; you do not wait for it.

### 2. Discover - your judgement, the night's quality

Aim for a packet of **about 20 rows**: ~8 style sources (grouped below into 3-5 extract runs), 3-4 scenes,
2-4 findings, 0-2 watch lines. Search around each watchlist line first, then outward for what the Library
lacks (a medium, a palette family, a lighting idiom, a cutting rhythm none of its styles covers).

- Pictures: an image URL or a page whose pictures carry one coherent look. Video: a trailer, a short, a
  music video whose SHOTS teach something - composition, light, a camera move, a cut rhythm.
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
`npx tsx pipeline/scout.mts add-source <night> --json <file>`. A URL seen in an earlier night is skipped
by the CLI; take that as information, not an error.

### 3. Ingest

`npx tsx pipeline/scout.mts ingest <night>` - pictures fetched, videos cut to gated keyframes, the
download deleted. A failed source keeps its tool sentence; do not retry it by another route.

### 4. Make the candidates

Check `status <night> --json` for the remaining money before each launch.

0. **Every run states its USE** (operator, 2026-10-22): the content it can help make - a children's
   cartoon series, a music video, a short comedy sketch, an explainer, a trailer, a film's mood reel.
   One concrete line, passed as `--use "<content>"`; it heads the run on the Board. A look or a shot you
   cannot name a use for is not launched - a run with no purpose is a mindless output, and the operator
   refuses those with the `use case` reason, which steers the next nights away from that direction.
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
3. **Findings.** From captions you read and the cut timestamps ingest recorded: a claim (<= 140 chars, a
   rule a director could follow) + the verbatim quote or the measurement + the knowledge step it
   belongs to (`knowledge/templates/<template>/steps/<step>/`) - an EXISTING step directory only
   (`ls knowledge/templates/<template>/steps`); camera, staging and shot craft go under `02-frames`
   until the knowledge numbering names motion and cut steps. `finding <night> --json <file>`.
   A finding the existing PATTERNS.md already states is not a finding.
4. **Watch lines.** A channel or site that produced two or more good sources tonight and is not on the
   watchlist: `watch <night> --entry "<channel - url>" --why "<what it teaches>"`.

### 5. Stop

Stop launching at the first of: the deadline, a refused launch for money, ~20 rendered rows, three
consecutive failed launches (`--stop failure`), or nothing left worth studying (`sources-exhausted`).
Short of ~20 rows with time and money left, search again - another watchlist line, another gap -
before calling the sources exhausted; a short packet is a night that stopped early, and the stop
reason must say which it was (2026-10-22 rehearsal: a night closed at 15 rows by choice as
`sources-exhausted`).
`npx tsx pipeline/scout.mts close <night> [--stop <reason>]` - it prints the packet id and the counts.

### 6. The night summary - for the operator, not about yourself

Append to `.vault/Scout/nights.md` (create it): the date, the night id, the packet link
`/board/pkt:scout:<night>`, counts by kind, settled and held USD, the stop reason, and at most three
lines of what the night could not do (a source that refused, a doctor line). No narration of your process.

## /scout folder <dir> [extract args]

The train-style path, kept: a folder of pictures on disk through the extract engine.
`npx tsx pipeline/scout.mts folder "<dir>" --slug <slug> --dry` first (prints the receipt), then without
`--dry` once the operator has seen the number in this session. The run is decided on its own packet,
`/board/pkt:extract:<run-id>`. Over ten minutes: launch it with `Start-Process` and poll the log with
Monitor, never a Bash background task. `--resume <run-id>` continues a stopped run; an `interrupted`
job holds `cloud.google` until the lane is acknowledged on Runs.

## /scout status [<night>]

`npx tsx pipeline/scout.mts status [<night>] --json` - render it as a short table: night, state, stop,
rendered / failed / pending, USD, and the packet link for every closed, untriaged night.

## What NOT to do

- Do not keep, reject or commit on the Board, and do not run `pipeline/decide.mts` for a scout packet.
- Do not pass a source picture or frame to any generator, and do not "improve" a replica by attaching one.
- Do not make a concept or a mesh from a found picture, by any tool; do not run `pipeline/mesh.mts new`
  or `keep`/`reject` for a night's asset - the night's asset act and the operator's packet own both.
- Do not raise a ceiling, a cap or a budget window; do not switch a dry night to live.
- Do not edit `night.json`, `styles.json` or a PATTERNS.md by hand.
- Do not push. Do not stage anything outside `knowledge/` in step 0.
- Do not re-read a source the doctor or the ingest refused through another tool.

## Lessons

Append (with Edit - the scheduled run's fence allows no shell write) to `.claude/skills/scout/LESSONS.md` only what would change the next night (a search that
always returns re-uploads, a source type the gates mangle, a prompt the scene door keeps refusing) and
the file it argues a change in. A night that went as written writes nothing there.
