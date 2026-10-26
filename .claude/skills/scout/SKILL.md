---
name: scout
memory: none
version: 2.4.0
category: Development
description: The nightly training loop, with a stated purpose - spread genres, prove one at publishable quality, then birth a project - that develops what the operator already approved before it spreads (kept ideas become free local Flux storyboards that apply a researched execution technique; while 20+ kept ideas wait, a seed batch takes children plus at most 20 fresh seeds). It searches the web and YouTube around knowledge/scout/watchlist.md for art styles, scenes and craft worth learning, bring them onto this box, replicate them as kernel jobs (extracted still styles, scene recipes with studio replica stills and local LTX clips, craft findings) and brief up to three 3D game assets (concept -> TRELLIS mesh -> Blender finish, made on this box) and up to six stats-reel ideas (a data video authored in code on illustrative numbers), ~100 one-sentence seeds (genre, subgenre, type, audience, format) on their own packet, 20-30 rough idea artboards grown from kept seeds in the operator's Leonardo studio, storyboards of kept ideas (up to five local Flux frames, a paragraph and bullets - the root any full video needs), Suno tracks from kept music seeds and full-song visualizers from kept tracks, and 1-3 directions to confirm - all for YouTube video (Shorts ~30 s, videos up to 5 min) - inside a $15 Gemini night, and leave ONE Board packet pkt:scout:<night> for a few minutes of number keys in the morning (1 keep, 2-4 reject with a reason, 5 reject). Successor of train-style and of dojo's hand-run corpus study. Wraps pipeline/scout.mts; it never keeps, rejects or commits anything on the Board. Invoke with /scout night [--dry] [--until HH:MM], /scout seeds [--dry], /scout folder <dir> [extract args], /scout status [<night>].
argument-hint: "night [--dry] [--until HH:MM] | seeds [--dry] | folder <dir> | status [<night>]"
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, WebSearch, WebFetch, Monitor
---

# Scout - find it at night, decide it in the morning

One night is one bounded run: **sources** found on the web, **candidates** made from them, **one packet**
the operator triages. The CLI (`pipeline/scout.mts`) and the kernel do everything that spends or writes;
this skill does the two things only a reader can: choosing what is worth studying, and writing findings
in words. Operator doc: `docs/scout.md`. Design: spark `media-training-loop` (2026-10-22).

## The vision - why a night runs (read before every night)

Every night climbs one ladder, and every act names the rung it serves (operator, 2026-10-25: "the skills don't
have high level vision why are they doing what they doing, leading often into pure brainstorm situations, with
small amount of research and lot of generity"):

1. **Spread** - while no project exists, seeds cast wide across genres, audiences and formats to find which way
   to go. This is the only rung where breadth is the goal.
2. **Prove** - a kept idea is worth nothing until it can be executed: it becomes a storyboard (free, local Flux),
   then trial clips of its beats, then an assembled 15-30 s piece the operator would publish. Research is how a
   storyboard gets good: before composing one, read how that genre is executed (pacing, shot grammar, a prompt
   technique) on public pages and apply it in the panels.
3. **Project** - only after quality is proven, the operator births a project on the Board: a channel from a
   publishable genre, an album from kept tracks, a game from its asset catalogue. From then on a night balances
   content for its projects (reused looks and characters inside the project's frame) against new genres.

**How the ladder is held (spark scout-vision S2).** A GENRE is a kernel head born when the operator keeps a
night's `genre` proposal resting on a kept storyboard; every live genre gets up to 2 TRIALS a night (storyboards of
kept ideas in that genre, every panel clipped on LTX); 4 kept trials make a PIECE due (the best trial rendered in
full and cut); a kept piece makes the genre publishable. A VENTURE (a channel, an album; a game in S4) is born when
the operator keeps a `venture` proposal. `## Genre ladder` and `## Ventures` in the taste brief say where each one
stands and what it needs next. The night never births anything: it proposes, the operator's keep births.

**Where the ladder stands today (2026-10-25): no venture, no genre yet** - the night spreads and proves, and
proposes the first genre as soon as a storyboard is kept.
**The balance is not yours to choose freely: prove before you spread.** `## Backlog` in the taste brief lists every
kept idea still waiting for a storyboard. While 20 or more wait, the seeds door takes child seeds and at most 20
fresh ones; the hours go to step 2 first.

**The test for every act**: which rung does it serve, and what can a keep of it become next? An act whose keep has
no next step (a look no idea asks for, a shot no storyboard beat needs, an asset no project lacks) is not launched.

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
  content, an audience (`kids`, `family`, `adult`) and a format. Each night writes ~100 (step 3), the
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
  video. A direction (step 10) says, in production words, what the approved decisions add up to - *an
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

- **The first seed verdicts (operator, 2026-10-23, 60 kept / 40 thrown):** "I see potential in video/image
  prompting in DOCUMENTARY and SHORT ANIMATED STORIES from the set" - weight child seeds and ideas toward those.
  And: "the stories and concepts for adults were often very safe and generic to pass, we will need to involve
  more RISK and CREATIVITY in ideas for adults." An adult seed or idea must take a creative risk a family one
  would not: a sharp satirical target, a morally grey or unlikeable lead, an uncomfortable or dark premise, an
  unreliable narrator, a twist that reframes everything before it, an absurd escalation played straight, an ending
  that refuses to resolve. Pleasant-and-safe is the adult reject (adult horror went 0/5, sci-fi 0/3, poetry 0/2,
  all `not for us` or `generic`). The hard limits do not move: no real person's likeness, no minors in anything
  mature, no sexual content.
- **Music waits for Suno** (operator, 2026-10-23: Suno's usage limit resets in two weeks, ~2026-11-06): no new
  music seeds or music ideas, no tracks (`open --tracks 0`), no visualizers. The six kept music seeds are PAUSED on
  the steer, so their doors refuse; they are resumed on `/scout` when the operator says Suno is back.

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
- **Parody is the one exception, and it is words only** (operator, 2026-10-25: "AI parody or whatif content on
  youtube and tiktok is very popular, we can forge genre of alternatives scenes with popular characters
  reshaped"). A POPULAR FICTIONAL character may be named - in a parody seed, a parody card's `origin`, and the
  storyboards that cast it - and restyled in any look. Its reference set is a CARD in craft words (silhouette,
  costume, palette, signature props), never a found picture: no source pixel reaches a generator, ever. A REAL
  person is never a character, a parody or a likeness. Parody names never go into a registry lead (the registry is
  public).
- **A game asset is drawn from OUR words, never from a found picture.** Its concept is generated from the
  brief; a source never becomes a concept or geometry (`rights: publishable` depends on it).
- **Game assets: at most `--assets` a night** (default 3 while the 3D engines are being profiled), each a
  few studio concepts at Low; the mesh and the finish are local and free, admitted by the worker by
  measured memory and GPU - never raise the cap, never start ComfyUI or Blender yourself.

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
`foundry-out/scout/<night>/taste.md` (`## Kept characters` and `## Sheets to draw` with them: the cast the
night may use and the sheets it owes; `## Genre ladder` and `## Ventures` first: every live genre's kept trials
and next step, every venture's frame - step 2's first work; then `## Backlog`: how many kept ideas wait for a
storyboard and whether the seed gate is on; then `## Last night's load`: how much of the band last night
filled and what sat under it - scope tonight to fill that; then what the operator kept and threw, with reasons - **a channel or a
kind of look rejected twice is not searched again, and a use under "refused as a use" is not proposed
again** unless the night has a new reason it now serves; `## Directions confirmed` are the lanes the
night works inside, `## Directions refused` are never proposed again, `## Ideas to develop` are tonight's
first work (step 2b), `## Ideas blocked` are the bans of tonight's ideation (step 4) and `## Genres`
says which genres the operator keeps and throws; `## Seeds to develop` are tonight's child seeds and ideas
(steps 3, 4), `## Seeds blocked` the bans of tonight's seed batch, `## Paused` the branches nothing grows
on, `## Seed genres` what the operator keeps and throws per audience and genre, `## Branches` every
branch's depth, effort and split target against the share it took, `## Tracks to visualize` tonight's
visualizers (step 9)), `foundry-out/scout/<night>/registry.md` (what
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
only if Ollama is down) and write `drafts/<pl-NN>.md` in the night: child-seed variations of a kept branch, a
storyboard paragraph to test, a research digest of a genre's execution. They are material for the next night,
listed under `## Drafts from the night` - never a candidate, never on the Board. Read them as a stranger's
notes: a draft is not a verdict.

### 2. Develop first - what the operator already approved

The night proves before it spreads (`## The vision`). Read `## Backlog` in the taste brief first: every kept idea
still waiting for a storyboard, oldest first. This step takes the night's first hours and the box's free local
lanes (Flux and LTX on ComfyUI, the Claude seat for research); seeds and new ideas come after it.

### 2a0. Genre trials - first, from the same cap

For every LIVE genre under `## Genre ladder` (perfecting or piece due), up to 2 trials tonight: a storyboard brief
(step 2a's shape) of a kept idea that fits the genre, carrying `genre: "gn-..."`. Write its panels in the genre's
look and move them through its grammar (the beats `## Genre ladder` lists); the research step applies as for any
storyboard. The door refuses a trial past the genre's 2 slots, or for a genre that is retired or already
publishable. Every panel of a trial is clipped on LTX after its frames (the job does it; ~100 s a clip), so a trial
is a rough cut the operator judges whole. Trials come out of `storyboardCap` before the backlog gets any.

### 2a. Storyboards - compose the kept ideas, applying a researched technique

A kept idea is one picture of an intent; a storyboard proves it can become a whole video. Up to
`storyboardCap` a night (`open --storyboards`, default 12, at most 20 - the operator, 2026-10-25), one per line of
the taste brief's `## Storyboards to make` (kept ideas of live committed nights that no night has composed yet),
oldest first. Each is up to five rough frames drawn by Flux 2 dev on this box's ComfyUI (gpu.local, $0, ~8 GPU
min for five frames, beside the night's clips and meshes) and the words below, judged WHOLE on the
packet. The idea's artboard is read as WORDS - its prompt under the brief line - never as a reference.

0. **Research the execution first.** For each idea, search public pages (practitioner breakdowns, an editor's or
   director's own talk, a studio's making-of; never a login, a paywall or an AI-prompt gallery) for how its genre
   is executed in a short video: how the hook lands in the first seconds, how many beats a 30 s short holds, the
   shot grammar of the genre, a prompt technique that makes Flux hold a character across frames. Pick ONE
   technique the panels will apply and name it in `technique`. The registry's
   `media-generation/narrative-craft/short-form-narrative-structure` is the first read. Research is never a row
   of its own: a keep of the storyboard files the technique; a throw says it did not help.
1. **Each storyboard** - `{fromIdea, title, paragraph, bullets, panels, technique?, use?, aim?}`:
   - `fromIdea` - the line's `<night>/<c-id>`; the door refuses an idea that is not kept on a live
     committed night, and a second storyboard for one idea (unless the first failed);
   - `title` - the video as a headline (<= 90 chars);
   - `paragraph` - the video's vision in one short paragraph (<= 480 chars): what happens, start to end;
   - `bullets` - 3-6 lines (<= 140 chars each): the beats, the format and length (`a 30 s vertical short`,
     `a 3-minute video`), the audience, the look in words, the hook;
   - `panels` - 1-5 Flux prompts, one per beat, in order, words only: the subject, the staging, the
     framing, the light. The idea's aspect carries over (a portrait idea draws 9:16 frames);
   - `technique` - `{claim, quote, url, template, step}`: the researched way of executing it (claim <= 140 chars,
     a director could act on it), the source's words verbatim, the page, and the knowledge step it belongs to
     (an EXISTING `knowledge/templates/<template>/steps/<step>/`, as a finding's). Kept, it lands in that
     PATTERNS.md for the next preflight to commit;
   - `use` / `aim` - optional; absent, the idea's `use` carries over.
   The words are craft, not content: no person, studio, title or franchise. In the `panels` write lower
   case after each sentence's first word - the door refuses a capital mid-sentence there as a name.
2. One JSON array -> `npx tsx pipeline/scout.mts storyboard <night> --json <file|->`; `--detach` leaves
   the jobs to the worker (the card is shared with the night's clips). One bad brief refuses the whole
   batch with its place and reason. On a dry night the storyboards are written as words only, no frame
   drawn. Before closing, `storyboard <night> --collect` settles any detached job.

### 2b. The kept ideas' own targets

Every `## Ideas to develop` line of the taste brief, before tonight's own finds: bring its artboard in as a source - `add-source <night> --json` with
   `[{"fromIdea": "<night>/<c-id>"}]` (our own picture: rights `ours`, nothing downloaded) - then build its
   target with the acts below, `--use` from the idea: `scene` -> `scene --source <that s-NN> --frames
   <its file>`, `style` -> `style --sources <that s-NN>`, `asset3d` -> an `asset` brief carrying
   `"fromIdea": "<night>/<c-id>"`. The candidate carries `fromIdea`, and the idea leaves the list (a
candidate that FAILS does not take it off: it comes back the next night).

### 2c. Pieces - a genre that earned one

`npx tsx pipeline/scout.mts piece <night> --detach` for every genre whose piece is due (4 kept trials; `## Genre
ladder` says `next: a piece`): the night takes the genre's best kept trial, re-makes only the clips the operator
rejected on it, and cuts all of them with their own sound into one 15-30 s video. `piece <night> --collect` before
closing. Kept, the genre is publishable - and the next night proposes its channel (step 10b).

### 2d. Sheets - a reference for every kept character

`npx tsx pipeline/scout.mts sheet <night> --detach` for every character under `## Sheets to draw` (kept, no kept
sheet yet): one neutral 1:1 still on local Flux with her kept portrait as a late reference - rest expression,
three-quarter head, even light, plain field, only the wardrobe that never changes. Judged on the packet; a kept
sheet is her reference for every Flux frame she is cast in, a rejected one is drawn again with the reason.
`sheet <night> --collect` before closing.

### 3. Seeds - children first, fresh ones within the gate

Words only: no job, no spend, allowed on a dry night. ~100 seeds (`seeds new` takes up to 150) - **unless the
seed gate is on** (`## Backlog`): then the batch is the child seeds plus at most 20 fresh ones, and the door
refuses a batch with more, naming the numbers. Do not pad a gated batch; its job is to narrow the branches the
operator kept, not to open new ones.

1. **Children first.** For every `## Seeds to develop` line that `needs: child seeds`, 2-3 child seeds
   with `parent: <its ref>`: the same branch narrowed - a subgenre, an angle, a format, an audience
   variant. A child is a new question, not a rewording of its parent.
2. **Fresh seeds fill the batch** to ~100, spread (above): at least fifteen genres, all three audiences,
   at most ten a genre; the split's audience and genre targets (`## Branches`) weight where the fresh ones
   go. Music is a genre like any other - a music seed's type is `music video`, `lyric video` or
   `visualizer`, and its sentence is the song as much as the picture (`a slow tango for two coats on a
   coat rack`). A music seed is the song's preparation step, as the artboard is the video's: it carries
   `music` (item 4), and the track's prompt is written from it.
3. **Bans.** Nothing under `## Seeds blocked` or `## Ideas blocked` again, nor a near neighbour; nothing
   under `## Paused` (the door refuses a child of it).
4. **Each seed** - `{sentence, genre, subgenre, type, audience, format, parent?, music?}`: the sentence (<= 200
   chars, one line) is the video in one line, what it IS and for whom - not a technique and never a
   person's, a studio's or a franchise's name. `music` is REQUIRED on a music seed and refused on any other:
   `{instruments: ["nylon guitar", "cello"] (1-6), tempo: 92 (bpm, 40-220), mood: "melancholic",
   vocals: "instrumental|female|male|duet|choir"}` - the genre and era come from `genre`/`subgenre`, so name
   them in a generator's words (`synthwave`, `bossa nova`), not a feeling (registry
   `audio-generation/music-prompt-composition/sonic-style-vocabulary`). The operator's keeps and throws of the
   tracks shape the preferences an album is later born from.
5. One JSON array -> `npx tsx pipeline/scout.mts seeds new --json <file>` (`--dry` on a dry night). One bad
   seed refuses the batch with its place: fix it and resend. Note the batch id and its packet link for the
   summary (step 12).

### 4. Ideas - grow them from kept seeds

Up to `ideaCap` rough idea artboards a night (`open --ideas`, default 25; the operator: "always 20-30
ideas on top of the current scope"), drawn one by one in the operator's Leonardo studio on `box.chrome`
while discovery goes on (~45 s each, studio credits, never against the night's Gemini ceiling; every
generation is deleted from the studio once its picture is held). An idea is the cheapest question the
night can ask: one picture of a rough intent, one keystroke to block it or develop it. **While the seed gate is
on, one in, one out:** draw no more ideas tonight than the storyboards step 2a composed tonight - every new idea
is another line on the backlog the night has not yet proven.

1. **Front-load the material** (registry `ad-concept-development/divergence-against-the-median`): the
   taste brief's directions and genres, the watchlist lines, `registry.md`'s `## Gaps`.
2. **Name the obvious and ban it.** Write down first the ten most obvious ideas for tonight's anchors
   (a city skyline poster, a hero on a cliff at sunset, a neon-soaked street...) and every title under
   the taste's `## Ideas blocked`; nothing you brief tonight is one of them or a near neighbour.
3. **Grow them from kept seeds.** Every `## Seeds to develop` line that `needs: ideas` gets 1-2 ideas
   first; the rest of the cap goes to kept seeds by the split's targets, mostly inside confirmed
   directions, a third still exploring. Spread the genres (above) when no seed is kept yet.
**Ventures come first once one exists.** Every live venture under `## Ventures` gets ideas inside its frame
(its tone, audience, format, look; its genres' grammar) before the spread takes the rest; such an idea, seed or
storyboard carries `venture: "vn-..."` (the door refuses an unknown or retired one).

4. **Each idea** - `{title, target, genre, seed, venture?, app, appTarget, aim, anchor, prompt}` (`seed: <batch>/sd-NNN` - required
   once any seed is kept; the door refuses an unkept or paused one):
   - `title` - the idea as a headline (<= 90 chars): what the video IS, not a technique;
   - `target` - what a keep builds next night: `scene` (a shot with a clip), `style` (the video's look),
     `asset3d` (a game asset), or `stats` (a stats reel - step 5b);
   - `genre` - one genre from the spread, in plain words (`animated comedy sketch`);
   - `app` - the application the output is for, one of `videogame|dating-sim|roleplay|companion-chat|genre-video|short|other`;
   - `appTarget` - the specific target inside it, format first: `a 30 s Short: ...`, `a 3-minute video: ...`, `a visual novel, first-meeting card` (the door stores `use` as `<app>: <appTarget>`);
   - `aim` - ONE sentence, WHY this idea and not another: extract a new artstyle, test a technique, build a scene as the baseline of a genre video, harden an existing look, or fill a graph layer the nights lack (many characters and nothing to do with them; too few artstyles to vary a genre). Read the graph's gaps first and name the layer. It is never the prompt: the prompt travels in its own field and the operator reads it only after triage;
   - `anchor` - `{kind: watch|gap|free, ref: <the line, or empty>}`;
   - `prompt` - a concept artboard of that video's key moment, in craft words (never a person, a title, a
     studio or a franchise): the subject, the staging, the look, the light.
5. One JSON array -> `npx tsx pipeline/scout.mts ideas <night> --json <file>`. One bad brief refuses the
   whole batch with its place and reason: fix it and resend. Do not wait for the drawings.

### 4b. Characters - grown from a kept character seed

The muse wing is merged into this loop (spark scout-vision S3): a character is an output like any other, and it
has a purpose before it has a face.
1. **The seed comes first.** A character seed is `{type: "character", ..., character: {for: <app>, cast: one |
   ensemble | parody}}` - `for` is what the character serves (`dating-sim`, `companion-chat`, `roleplay`,
   `videogame`, `genre-video`, `short`); a parody seed's sentence names the original in words. A character idea
   needs a KEPT character seed; its audience and app come from it.
2. **A character idea** - an `ideas` brief with `target: "character"`, a `card` and a `look` slug: `card: {name,
   age, look, personality, kind: original|parody, origin?, render: photoreal|stylised}`. `look` holds IDENTITY only
   (face, hair, build, skin, one signature garment) - it is restated verbatim wherever she is cast; `personality`
   is the state a scene plays her by. Drawn 9:16 at studio quality Low; the eye clears every still. It may cite a
   web source of tonight - `source: "s-NN"`, its words only - when a page taught the character.
3. **The rules follow the audience and the app.** For an adult seed: a stated adult (card age 25+; 50 at most for
   companion-chat, dating-sim and roleplay, whose cast is conventionally attractive - slim to curvy-fit, no age
   marks), always SFW. For a kids or family seed: any age, but under 18 is always `render: stylised`, never
   photoreal, and never cast in adult work. Never nude, never a real person, for anyone.
4. **Discovery is one-of-one**: every new character idea is a new card in a new look direction (the door refuses a
   name or look already drawn, kept ones excepted); a kept look is tried on a new character before it is trusted.
5. **Cast what was kept.** `cast: ["<name>"]` on a storyboard or a trial (her identity block leads every panel, her
   kept sheet rides as a reference), on a character SCENE idea for an app seed (a 16:9 still of her in one
   situation, its `use` the use case it develops - a first-meeting card, a morning greeting) or on an idea
   artboard (identity block only - the studio takes no reference). A character kept with nothing to do yet waits
   under `## Kept characters` for the idea that needs her.

### 5a. Game assets - a stated need, launched early

The meshes run for minutes on the card and in Blender, admitted by the worker while the rest goes on, so a
brief is LAUNCHED early when the GPU is idle - but only when it answers a stated need of a project (item 3):

1. **What the game needs** (spark scout-vision S4). The taste's `## Asset needs` lists, per game, the OPEN needs
   POF exported from the game's own files (`../pof/asset-needs/<project>.json`, written by `npx tsx
   scripts/asset-needs.ts <project>` in pof): a roster entry with no model (`missing`) or an asset the game's own
   scorecard rates low (`scored-low`), each with its id, subject, the game's budget and the game's words for why.
   **A game asset answers one of those needs, or it is not briefed.** Today the onboarded game is **bp**; pof has
   no game content to measure (its UE project is gone) and refuses; **mage-arena is developed on another device -
   gravitone no longer briefs for it.** A needs file missing or older than 7 days refuses bp briefs - say so in
   the summary, do not work around it.
2. **What exists here.** `npx tsx pipeline/mesh.mts status --json` - every asset with its class, techniques,
   verdicts. The taste's `## Game assets` block says which technique the operator keeps per class and the reasons
   a variant was thrown (`topology`, `texture`, `rig`, `scale`). Choose up to `assetCap` briefs from the open needs
   (priority 1 first), and only then a `newProject` brief for a kind of project none exists for. Ground each in the
   registry's game-production knowledge before writing it -
   `../ai-registry/knowledge/game-production/asset-production/geometry/asset-class-poly-budgeting/`
   (the class budget is an instruction the generator spends, not a ceiling),
   `.../sourcing-economics/image-to-3d-input-gating/` (one subject, plain ground, whole in frame,
   canonical view - the CLI's prompts already say it; your subject must not fight it), and
   `../ai-registry/knowledge/media-generation/visual-generation/animatable-character-design/`
   for a character (a silhouette that reads, limbs clear of the body, nothing held, no capes or strands
   the rig cannot drive).
3. **Write each brief** to a scratch file and launch it:
   `{"class": "character|weapon|prop", "subject": "<craft words: what it is, materials, silhouette, palette>", "use": "<what it is for in that project>", "serves": {"project": "bp"} | {"newProject": "<the kind of project it opens>"}, "need": "<need id - required for a project>", "style": "<optional>", "kind": "<weapon: sword|mace|axe|staff>"}`
   -> `npx tsx pipeline/scout.mts asset <night> --brief <file> --json`. **Every asset has a purpose**
   (operator, 2026-10-23, rejecting every asset of the first 3D nights for having none: "we cannot create assets
   without purpose"): it HELPS an existing game project (`serves.project`) or OPENS a new kind of project
   (`serves.newProject`, in plain words - "a cozy farming sim"), and `use` says what it is for there ("the
   starting party's ranged hero"). For a game the brief names the `need` it answers (its class must be the need's;
   its budget becomes the GAME's budget for that need, not gravitone's class budget). The door refuses a brief
   without them; the 3D row leads with the need. Leave `techniques` to the class
   default unless the taste asks a question one technique answers. One subject per brief - "a quiver"
   is a prop of its own, never part of a character's brief.
4. Read the answer: a variant written `failed` by the input gate carries its codes - that brief's
   concept did not reconstruct; do not relaunch it the same night. The mesh job is queued for the
   worker; you do not wait for it.

### 5b. Stats reels - launched early

Each stats idea is authored as a full 8 s strip in code on the Claude seat (~15 min an idea), queued for
the worker while discovery goes on, so brief them right after the assets. Up to `reelCap` a night
(`open --reels`, default 6; `status --json` -> `reels` says how many are left). Never raise it. A kept reel idea's
next step is step 5c: its real data, then its full cut.

1. **The topic passes the gates first** -
   `../ai-registry/knowledge/media-generation/narrative-craft/data-video-virality/data-video-virality.md`
   and its `techniques/`: **continuity** (fine-grained steps, or a long series of many entities, the
   screen changing at every step), **path over conclusion** (overtakes, crashes, comebacks - write the
   keep-watching reason down with names and dates; a payoff only in the last frame fails), **dated
   accelerators** (5-15 real events the data reacts to). Never a single-value ladder, a record list or
   a winners list, however famous the topic.
2. **Its `use`** - the content it serves, one line, as every run's (step 8.0) - and **its anchor**: a
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
   `{"title": "<headline, <= 90 chars>", "target": "stats", "prompt": "<direction>", "anchor": {"kind": "watch|gap|free", "ref": "<line or empty>"}, "app": "<application>", "appTarget": "<what it must fit>", "aim": "<why this run>", "reel": {...}}`
   in a JSON array -> `npx tsx pipeline/scout.mts ideas <night> --json <file>`. One bad brief refuses
   the whole batch with its place and reason: fix that brief, resend the batch. The reels job is
   always queued, never driven here; its tile (frame 120) reaches the packet's ideas tab when the
   worker has authored it. Do not wait for it.

`K` on a reel idea makes its real data due (step 5c); `X` blocks it. Either verdict and its reasons land in
`night.committed`.

### 5c. Real data for kept reels, then the full cut

The operator, 2026-10-26: "Do not stick with public datasets, we often need one wiki table, an article, or
derived data from 'what if' fantasy scenarios. We are not doing academic research but entertaining video content
with educative flavor." Two acts, each approved before the next:

1. **A kept stats idea -> an 8 s strip on real data** (`reel`). Find ONE source that carries the story: a
   table on a public page (a wiki table is fine), an article whose numbers you quote, or a WHAT-IF premise
   whose numbers you derive and label fiction. Keep the idea's approach; put the numbers in the brief's shape;
   `cut` lists the 1-12 beats the 8 s keeps (the overtakes, the crash, the comeback). `npx tsx pipeline/scout.mts
   reel <night> --json <file>` takes `[{fromIdea: "<night>/<c-id>", source: {kind: table|article|what-if, title,
   url?, quote?, premise?}, data, cut}]` - a table or article needs its https url, an article its words verbatim,
   a what-if its premise. The strip's source line then reads `Source: <title>` or `What if: <premise> (fiction)`.
   It counts against `reelCap`. A what-if is a premise played straight, never a claim about the real world.
2. **A kept real reel -> the full cut** (`reel-cut`), from `## Reels to cut` in the taste brief: `[{fromReel:
   "<night>/<c-id>", seconds}]`, 30-120 s, sized by how many beats the data really holds (a race of 20 dated
   accelerators earns 60-90 s; five earn 30). The strip is re-authored at that length and rendered to mp4.

Both are queued, never driven here; `reel <night> --collect` brings detached ones in.

### 6. Discover - your judgement, the night's quality

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

### 7. Ingest

`npx tsx pipeline/scout.mts ingest <night>` - pictures fetched, videos cut to gated keyframes, the
download deleted. A failed source keeps its tool sentence; do not retry it by another route.

### 8. Make the candidates from tonight's sources

Check `status <night> --json` before each launch - the remaining money AND `load`:

- **Under 60% on a resource, and money left: launch more work that loads it.** GPU idle - a scene with
  a clip while the clip cap allows, a game asset (step 5a); CPU idle - ingest the next sources, author a
  stats reel (step 5b), a style run. RAM follows whichever you add.
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

### 9. Music - tracks, then visualizers

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

### 10. Directions - the night's notes

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

### 10b. Proposals - a genre, a venture

The night proposes; the operator's keep births. `npx tsx pipeline/scout.mts propose <night> --json <file>`, one
array, one bad brief refuses the batch:
- **A genre** - `{kind: "genre", name, fromStoryboard: "<night>/<c-id>", look, grammar: [beats], use?, aim?}` when
  a KEPT storyboard (not a trial of an existing genre) shows a format worth repeating: name it in plain words
  (`deadpan office satire, painted 3D`), the look in words, the grammar as the 3-8 beats its videos move through
  (from the storyboard's bullets). One proposal per storyboard; never a name a live genre already holds.
- **A channel venture** - `{kind: "venture", name, ventureKind: "channel", frame: {tone, audience, format, look,
  genres: ["gn-..."]}, basedOn: ["<night>/<c-id>/video", ...]}` the night after a genre turns publishable: its kept
  piece's cell in `basedOn`, the frame what every later video of the channel keeps.
- **An album venture** - `ventureKind: "album"` when at least 4 kept track clips of music seeds share a genre
  (`basedOn` those clip cells); the frame's look is the sound in words.
A rejected proposal with its reason is a ban: never the same name or storyboard again.

### 11. Stop

Collect the music first (step 9.3). Stop launching at the first of: the deadline, a refused launch for money, ~20 rendered rows, three
consecutive failed launches (`--stop failure`), or nothing left worth studying (`sources-exhausted`).
Short of ~20 rows with time and money left, search again - another watchlist line, another gap -
before calling the sources exhausted; a short packet is a night that stopped early, and the stop
reason must say which it was (2026-10-22 rehearsal: a night closed at 15 rows by choice as
`sources-exhausted`).
`npx tsx pipeline/scout.mts close <night> [--stop <reason>]` - it prints the packet id and the counts.

**With a plan queue and time left, do not close.** End your turn after step 12 with the night open: the worker's
`night-fill` timer drains the queue and closes the night at `--until`. Close it yourself only for a reason that
ends the night now - a refused launch for money, three consecutive failures, nothing left worth studying - and
only after the queue is empty or no longer worth running.

### 12. The night summary - for the operator, not about yourself

Append to `.vault/Scout/nights.md` (create it): the date, the night id, the packet link
`/board/pkt:scout:<night>`, counts by kind, Gemini settled and held USD and the uncapped line, the stop
reason, `leads: N filed, M queued` (step 0, and `leads --json`), `seeds: batch <id> · N (C children,
F fresh) · /board/pkt:seeds:<batch>`, `ideas: N drawn across G genres from S seeds, K kept ideas developed`,
`storyboards: N composed (F frames, T trials across G genres)`, `pieces: N cut`, `plan: N queued (K kinds)`,
`reels: N on real data, C cut`, `proposals: N genres, V ventures`, `music: N tracks, V visualizers`, `directions: N proposed`, and at most three
lines of what the night could not do (a source that refused, a doctor line). No narration of your process.

## /scout seeds [--dry]

A seed batch by day, so the next night already grows from the operator's keeps. No night is opened: read
the newest night's `taste.md` (its seed sections, `## Branches`) and `seeds status --json`, write the batch
exactly as step 3, and print the packet link `/board/pkt:seeds:<batch>`.

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
