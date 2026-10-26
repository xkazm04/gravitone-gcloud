---
name: scout
memory: none
version: 3.0.0
category: Development
description: The nightly loop that makes the operator's channels' episodes (spark project-baseline, 2026-10-26) - six channels designed in session (D1 Came From Nowhere and D2 The What-If Machine as real-data reels; F1 While It Works and F2 Across the Centuries as impossible-camera documentary storyboards; S1 It Builds Itself spec ads; K1 Small Night Stories bedtime shorts). Each night storyboards (five local Flux frames, one per beat) and real-data reels (numbers from a named table, authored in code) are made only from outlines the operator accepted in session, then one third of the night explores for the channels (a channel's gap, looks for a channel's frame, new channel types in words), and ONE Board packet pkt:scout:<night> is left for the morning. Seeds, idea artboards, genres, ventures, characters, music and adult comedy are archived. Wraps pipeline/scout.mts.
argument-hint: "night [--dry] [--until HH:MM] | folder <dir> | status [<night>]"
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, WebSearch, WebFetch, Monitor
---

# Scout - make the channels' episodes at night, decide them in the morning

One night is one bounded run: **episodes** of the operator's channels made into storyboards and real-data reels,
**one third exploration** that serves those channels, and **one packet** the operator triages. The CLI
(`pipeline/scout.mts`) and the kernel do everything that spends or writes; this skill does what only a reader can:
researching how an episode is best executed, writing its panels or its data, and writing findings in words.
Operator doc: `docs/scout.md`. Design: spark `project-baseline` (2026-10-26); the spread-era steps (seeds, idea
artboards, genres, ventures, characters, music) are in `ARCHIVE-2.4.0.md` beside this file and are not run.

## The baseline - why a night runs (read before every night)

The operator, 2026-10-26: "there is so much generic shit produced ... plenty of new images are generated without
clear goal". The nights stopped spreading. They serve **channels** the operator designed in session, each with a
target group, a promise, the gap in existing media it beats, and an edge:

| Channel | Group | Made as |
|---|---|---|
| D1 Came From Nowhere - every overtake tied to the real dated event that caused it | Data explainer | real-data reel |
| D2 The What-If Machine - change one moment in history, the real line beside a line labelled FICTION | Data explainer | real-data reel |
| F1 While It Works - photoreal, real sound, a camera inside the thing while it works | Documentary | storyboard |
| F2 Across the Centuries - one humble thing in one frame while the centuries change around it | Documentary | storyboard |
| S1 It Builds Itself - spec ads for fictional brands where the product assembles the world | Ads | storyboard |
| K1 Small Night Stories - calm, original bedtime stories for ages 3-7 | Kids animation | storyboard |

`npx tsx pipeline/scout.mts channel list` and `channel show <id>` print them; the cards live in
`foundry-out/scout-channels/<id>.json`.

**An episode's life.** The operator decides it in session: a premise, then a five-beat OUTLINE with a spec (a data
source and dated events; an impossible view and how true it is; a fictional brand and a mechanism; a look). Only an
accepted outline is imported (`episodes import`) and only an imported, not-yet-taken episode is due. The night makes
it (storyboard or reel); the operator's keep or reject on the packet marks it kept or thrown. **A night never invents
an episode, a channel or a premise** (registry ad-concept-development/llm-seat-assignment: the concept seat is the
operator's; the model is generator under procedure, translator, critic). What the night may propose - a new channel
type, a better gap - goes in words into the night summary for the operator, never into a door.

**Adult comedy is cut** (operator, 2026-10-26) until the operator brings reference videos to a session; no comedy is
written at night.

**The test for every act**: which channel, which episode or which channel gap does it serve? An act with no answer is
not launched.

**The verdict is never yours.** Nothing this skill does admits a storyboard, a reel, a style or a finding: only the
operator's commit of `pkt:scout:<night>` does. You pre-filter; you never keep.

**The night keeps the box's CPU, RAM and GPU in 60-80%** (operator, 2026-10-23). The band steers how much you LAUNCH; it
never raises a cap or a ceiling, and admission's marks still hold the top. The binding resource on this box is COMMIT
CHARGE, not RAM (LESSONS 2026-10-26): ComfyUI with Flux resident holds ~56 GB of it, Ollama's model ~26 GB while loaded.

## The money and the rights (read before every night)

- **$15 per night; stills come from the studio pool, clips are local and free** - stills (style replicas and
  transfers, scene replicas, asset concepts) are drawn in the operator's Leonardo studio at Low (8 credits each,
  unpriced, one browser tab at a time; operator, 2026-10-26: "Leonardo studio still has plenty of credits ... we
  should stick with it in future too"). The API pool is empty; `SCOUT_REPLICA_GENERATOR=leonardo-flare` or
  `comfy-flux2` switches the generator, never on your own. The studio holds no seed and no 4:5 (a 4:5 source draws
  9:16). Clips are
  LTX-2.5 on this box's ComfyUI (~100 s each, $0, `--clips` caps GPU minutes, default 2). ComfyUI's
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
- **Fictional brands only** in ads (S1); **no real person**, no franchise character, ever; **kids' episodes (K1) are
  stylised, never photoreal children**, and resolve gently.

## /scout night

The scheduled entry (Task Scheduler, `pipeline/scout-schedule.ps1`) runs `claude -p "/scout night"` at
the operator's hour; the operator may also type it after a workday. Either way:

### 0. Preflight - no spend

1. `npx tsx pipeline/scout.mts doctor` - with `--dry` when the night will be dry (the vendor keys and
   the dry pin are then notes, not failures). Exit 1 -> write the failing lines into the night summary
   (step 12) and stop. Never install, configure or work around a missing binary or key.
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
`foundry-out/scout-nights/<night>/taste.md` (`## Episodes due` first: every channel's due episodes with their
beats and spec - steps 2 and 3; `## Reels to cut` - kept real reels whose full cut is due; `## Last night's load`:
how much of the band last night filled and what sat under it - size the plan queue to fill it; then the per-night
verdicts with reasons - a kind of look or a source rejected twice is not searched again; `## Directions confirmed`
and `## Kept characters` are kept for reference only), `foundry-out/scout-nights/<night>/registry.md` (what
the ai-registry says about tonight's work: `## Governs tonight` - techniques to follow when a candidate does
that thing; its ranking is by words, so read a technique's file before calling it governing; `## Gaps` -
where the registry is thin; `registry: none` means no registry resolved and changes nothing else),
`knowledge/scout/watchlist.md`, and what the Library already holds (`pipeline/foundry/styles.json`: names
and recipes - a look already there is not a find).

### 1b. The plan queue - the night runs until `--until`, not until your turn ends

The seat's turn is shorter than the night (2026-10-25: the night ended hours early while the box sat idle and
the local models waited). So the night's work is two waves: what you launch yourself in steps 2-10, and a
QUEUE the worker launches after you are gone. `npx tsx pipeline/scout.mts plan <night> --json <file>` takes
`[{kind, payload, why}]`: `kind` one of `storyboards | ideas | extract | scenes | assets | sheets | reels | draft`,
`payload` exactly what that door takes (validated now, nothing spent), `why` the rung it serves. The worker's
`night-fill` timer launches the oldest queued item whose lane is idle whenever the box has sat under 60% for 15
minutes, one per 5-minute tick, until `--until` - then it expires what is left and closes the night itself
(`--stop deadline`). A door's cap still refuses (the item is `refused`, never retried); the queue never raises a
cap. Write the queue as you go - every batch a step below would launch beyond the first, and the storyboards,
sheets and trials the GPU lane could not take tonight - and size it from `## Last night's load`: an idle box
last night is a short queue tonight.

`draft` items (`{title, prompt}`) run on the box's local model (Ollama, the `draft` text task; the seat
only if Ollama is down) and write `drafts/<pl-NN>.md` in the night: a storyboard paragraph to test for a due episode, a research digest of a channel's format, a channel's gap. They are material for the next night,
listed under `## Drafts from the night` - never a candidate, never on the Board. Read them as a stranger's
notes: a draft is not a verdict.

### 2. Episodes due - storyboards (F1, F2, S1, K1)

The night's first hours. Read `## Episodes due` in the taste brief: every due episode per channel with its logline,
its five beats and its spec. Take them oldest first, spread across channels, up to `storyboardCap` (`open
--storyboards`, default 12, at most 20 - never raise it). Each storyboard is five Flux frames on this box's ComfyUI
(gpu.local, free), one per beat, judged whole on the packet.

0. **Research the execution first**, once per channel per night: how this kind of video is shot and cut (a
   practitioner breakdown, an editor's or director's own talk, a making-of; never a login, a paywall or an AI-prompt
   gallery). Pick ONE technique the panels apply and name it in `technique` (`{claim, quote, url, template, step}`,
   step an EXISTING `knowledge/templates/<template>/steps/<step>/`). A keep files it.
1. **Each storyboard** - `{fromEpisode, title, paragraph, bullets, panels, technique?, use?, aim?}`:
   - `fromEpisode` - the episode id (`F1-03`); the door refuses one that is not outline-kept, one a live storyboard
     already holds, and a reel channel's episode;
   - `title` - the episode's title; `paragraph` - the video start to end (<= 480 chars), from the logline and beats;
   - `bullets` - 3-6 lines: the format and length, the audience, the look, the hook, and for F1/F2 the view's GRADE
     (Observed / Reconstructed / Modelled / Illustrative) as the spec states it;
   - `panels` - exactly one Flux prompt per beat, in order, words only: subject, staging, framing, light. **F1/F2**:
     the camera is the spec's impossible view (a probe through glass, a micro-camera riding a particle, an x-ray or
     thermal frame, a same-frame morph across centuries) - realism is the constant, the view is the episode's own.
     **S1**: the brand is the spec's fictional one; never a real brand, logo or product. **K1**: stylised, gentle,
     never photoreal children, nothing frightening left unresolved;
   - `use` / `aim` - omit them: the channel's name and promise are filled in.
   The words are craft, not content: no person, studio, title or franchise. In `panels` write lower case after each
   sentence's first word (the door refuses a capital mid-sentence as a name).
2. One JSON array -> `npx tsx pipeline/scout.mts storyboard <night> --json <file> --detach`. One bad brief refuses
   the batch with its place and reason. `storyboard <night> --collect` before you end the turn, and again in the
   morning.
3. Due episodes beyond tonight's launch go into the plan queue (step 1b, kind `storyboards`) so the night-fill takes
   them when the GPU frees.

### 3. Episodes due - real-data reels (D1, D2)

Each data episode is an 8 s strip authored in code on the seat from REAL numbers, up to `reelCap` a night (`open
--reels`, default 6; never raise it). The approval unit is the 8 s strip; a kept one makes its full cut due
(`reel-cut`, 30-120 s, sized by how many beats the data holds).

1. **The source first.** The spec names it (Our World in Data, FAO, a Wikipedia table, a UN revision). Fetch the
   table on the seat (curl the CSV or read the page), extract the series, and check every dated event in the spec
   against a public page; an event you cannot confirm is dropped, never guessed. **D2**: the real baseline line comes
   from the named series; the counterfactual line is arithmetic on ONE stated assumption, and its brief says so - the
   strip's source line reads `What if: <premise> (fiction)` and the fictional line is labelled FICTION on screen.
2. **Each reel** - `{fromEpisode, brief: {case, title, hook, unit, kind}, approach: {name, medium, grammar, density,
   direction, falsifier}, source: {kind: table|article|what-if, title, url?, quote?, premise?}, data, cut}`. `data`
   is in a strips fixture's shape (`pipeline/strips/data/*.json`); `cut` the 1-12 beats the 8 s keeps (the overtakes,
   the crash, the comeback). The approach is your own design under
   `../ai-registry/knowledge/media-generation/visual-generation/data-video-art-direction/` (`medium` svg|canvas|dom|
   css3d, never webgl; the falsifier written before anything renders).
3. One JSON array -> `npx tsx pipeline/scout.mts reel <night> --json <file> --detach`; `reel <night> --collect` before
   ending. Kept reels listed under `## Reels to cut` get their full cut with `reel-cut <night> --json
   [{fromReel, seconds}]`.

### 4. Exploration - one third of the night, for the channels

Exploration serves a channel's gap, never the old spread. Three kinds, at most one or two of each a night:

- **A channel's gap** - research what exists in one channel's format (incumbent channels, what they do, what they
  leave), and write the finding into the night summary (`gap: <channel>: <one line>` with its URLs); a finding about
  how a shot or a cut lands in such a video goes through `finding` as before.
- **Looks for a channel's frame** - style sources studied for ONE channel's look (`style --use "<channel id>: <what
  the look is for>"`), steps 6-8 below. Never general style hunting.
- **New channel types** - in words only, in the night summary: a channel the operator could add (group, target, the
  gap, one example episode). Never launched, never written into a door.

### 6. Discover - sources for a channel's look or gap (exploration)

Every source serves one channel: a look its frame needs, or a shot or cut its episodes need. Name the channel
first in the source's `why` (`F1: ...`). A few good sources beat a full packet: 1-2 style runs and 1-2 scenes a
night is enough; the episodes are the night's main work.
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

### 7. Ingest

`npx tsx pipeline/scout.mts ingest <night>` - pictures fetched, videos cut to gated keyframes, the
download deleted. A failed source keeps its tool sentence; do not retry it by another route.

### 8. Make the candidates from tonight's sources

Check `status <night> --json` before each launch - the remaining money AND `load`:

- **Under 60% on a resource, and money left: launch more work that loads it.** GPU idle - a scene with
  a clip while the clip cap allows, a due storyboard from the plan queue; CPU idle - ingest the next sources, author a
  stats reel (step 5b), a style run. RAM follows whichever you add.
- **Over 80%: hold.** Launch nothing new until the next read is back in the band.
- `load.waiting` names what admission is holding now and on what (`memory`, `comfy-queue`, ...): work
  waiting on memory is not helped by launching more of it. A job listed under `interrupted` is the
  operator's to retry, never yours.

0. **Every run states its USE** (operator, 2026-10-22): the CHANNEL and the video it can help make, format first -
   `F2: a 90 s Short, one street corner across three centuries`, `K1: a 3-minute bedtime short, the moth's round`. Never a book, a print, a poster series or a painting (2026-10-23). One concrete line,
   passed as `--use "<content>"`; it heads the run on the Board. A look or a shot you
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

### 11. Stop

Collect first (`storyboard --collect`, `reel --collect`). Stop launching at the first of: the deadline, a refused
launch for money, every due episode taken, three consecutive failed launches (`--stop failure`).
`npx tsx pipeline/scout.mts close <night> [--stop <reason>]` - it prints the packet id and the counts.

**With a plan queue and time left, do not close.** End your turn after step 12 with the night open: the worker's
`night-fill` timer drains the queue and closes the night at `--until`. Close it yourself only for a reason that
ends the night now - a refused launch for money, three consecutive failures, nothing left worth studying - and
only after the queue is empty or no longer worth running.

### 12. The night summary - for the operator, not about yourself

Append to `.vault/Scout/nights.md` (create it): the date, the night id, the packet link
`/board/pkt:scout:<night>`, counts by kind, Gemini settled and held USD and the uncapped line, the stop
reason, `leads: N filed, M queued`, `episodes: N storyboards, R reels taken (per channel), M made`,
`plan: N queued (K kinds)`, `reels: N on real data, C cut`, then `gap:` lines (a channel's gap with URLs) and
`new channel:` lines (a channel type in words for the operator), and at most three
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
- Do not research a stats idea's real data on the night that proposes it, and never send an ideas-door brief
  that is not `illustrative: true`: real data goes through `reel`, for a KEPT idea only.
- **Do not run a full-video act for an idea without a kept storyboard** - the idea must be under
  `## Ready for full video` in the taste brief (lib/foundry/scout/storyboard.ts `keptStoryboardFor`), and
  the act names that storyboard. A scene clip is not a full video and stays ungated.

## Lessons

Append (with Edit - the scheduled run's fence allows no shell write) to `.claude/skills/scout/LESSONS.md` only what would change the next night (a search that
always returns re-uploads, a source type the gates mangle, a prompt the scene door keeps refusing) and
the file it argues a change in. A night that went as written writes nothing there.
