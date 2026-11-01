---
name: music-clip
version: 2.9.0
memory: none
category: Content
description: Turn one finished track (an mp3, its lyrics and its style prompt in a folder) into a directed music video through stop-and-resume gates - a timeline map (beats, tempo curve, bands, intensity, sections, lyric times with confidence; one Gemini call), Board A (up to 10 grounded mood directions), Board T (3-4 treatments on the picked look - characters, plot, signature device - each with GPU-shot keyframes of a lit three.js scene), Board B (story per section plus a seek-stable hero loop grown from the picked treatment's scene), then the film - our own three.js engine on the GPU (start from pipeline/music-clip/film-starter/), the edit as a beat-grid shot plan, one set module per location, proof cuts with sound, a full render muxed with the lossless master, and note rounds that go back into sets and the plan. The operator picks at every gate. Wraps pipeline/music-clip.mts (analyze / status / board / pick / shots) and pipeline/music-clip/{shoot,cut,deliver,keyframes}.mts; every film ships as a 10-bit HEVC upload copy (deliver.mts, ~0.1 GB for 4-5 min). Invoke with /music-clip <folder> [verb].
argument-hint: "<folder> [analyze|status|board a|board t|board b|pick a:<id>|pick t:<id>|pick b:<id>|pick stack:<name>|pack|compare]"
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, Agent
---

# Music clip: one track in, a directed video out, the operator picking at every gate

One session walks one track as far as the next stop, then stops. The CLI
(`pipeline/music-clip.mts`) analyses, validates, assembles boards, seals the
bake-off pack and builds the comparison; this skill writes what only a reader can
(directions, treatments and their scenes, a story, a hero loop) and looks at every sheet before it
stops. Every scene and hero author reads `pipeline/music-clip/CRAFT.md` first - it is the bar a
film is held to, the one Board B missed when it came out "a PowerPoint presentation".
Operator doc: `docs/music-clip.md`. Output: `<folder>/music-clip/`.

## The method (2.0.0) - why the boards are in this order

Version 1.0.0 went look -> hero and came out "a PowerPoint presentation": a status panel and type
on black, one rotating cone. Every one of four treatments rose to film stills once five things
changed, and they are the method now:

1. **Research the bar before the first board, not after the first miss.** The quality of current
   clips is a measured thing (CRAFT.md: one lit world and a moving camera, one post chain over
   every frame, transitions as events on the grid, faceless characters, a motif that changes, an
   arc across the choruses). A session that has not read CRAFT.md designs slides.
2. **Separate the look from the film.** Board A fixes palette and type only. Board T then decides
   what the look is FOR: characters, plot per section, ONE signature camera device, the motif and
   how it changes. A hero is never built before a treatment is picked.
3. **Every treatment is judged on rendered frames, not prose.** Keyframes at the SAME track times
   across treatments (like with like), each a real render of the scene page at t.
4. **A world on the GPU, not a page on the CPU.** Headless Chromium reaches the box's GPU through
   ANGLE/D3D11 (`lib/music-clip/gpuShot.ts`); three.js with fog, depth of field, bloom, grade and
   grain at ~0.3-0.6 s per 1080p frame. The CPU (SwiftShader) path is what made v1 flat.
5. **One Opus builder per treatment, in parallel, each self-critiquing.** Each builder opens its
   own PNGs, iterates at least three times against CRAFT.md's checklist, checks motion (t vs
   t+0.5 s) and purity (same t twice), and scores its frames honestly - those scores name the next
   upgrade (on Break the Sequence all four named primitive bodies as the ceiling).
6. **Music is felt in the bodies, not only the lights.** A beat-locked motion of the characters
   (heads nodding on the beat in the refrains, down-stroke landing on the beat, downbeats harder,
   amplitude from the low band) is a closed-form function of `beats` and t - the operator's
   "we would ultimately win" on Unit 0451. Prove it with `cut.mts` (a span as mp4 with the
   track's own audio) before the bake-off, never by stills alone.

## Commands

Proof cut of any scene span with the track under it (GPU, NVENC):
`npx tsx pipeline/music-clip/cut.mts <folder> <scene.html> <startS> <endS> <out.mp4>`; keyframes alone:
`npx tsx pipeline/music-clip/shoot.mts <scene.html> <timeline.json> <outDir> <t...>`.

```bash
npx tsx pipeline/music-clip.mts analyze "<folder>" [--audio "<file>"] --dry|--yes   # --dry: no vendor call; --yes: ONE live Gemini call
npx tsx pipeline/music-clip.mts status "<folder>" --json
npx tsx pipeline/music-clip.mts board a "<folder>"
npx tsx pipeline/music-clip.mts board t "<folder>" [--only <treatment-id>]          # shoots scene keyframes on the GPU
npx tsx pipeline/music-clip.mts board b "<folder>"
npx tsx pipeline/music-clip.mts pick "<folder>" <a:<id> | t:<id> | b:<id> | stack:<kernel|hyperframes|remotion>>
npx tsx pipeline/music-clip.mts pack "<folder>"
npx tsx pipeline/music-clip.mts compare "<folder>"
```

The folder holds exactly one `*.mp3` (or name it with `--audio`), `lyrics.txt|lyrics.md`
and `style.txt|style.md|prompt.md|prompt.txt`. A missing file is named by the CLI. Ask for the
track's lossless master too (Suno exports a wav): put it beside the mp3 and every render muxes it.

## Resume first, always

Every session starts with `status`. It prints the stage, the picks, which
artifacts exist and the next verb. Continue from there; never redo a stage the
state says is done unless the operator asks.

| stage | next |
|---|---|
| (none) | Stage 0 |
| `analyzed` | Stage 1 |
| `board-a` | STOP: waiting for `pick a:<id>` |
| `picked-a` | Stage 1b |
| `board-t` | STOP: waiting for `pick t:<id>` |
| `picked-t` | Stage 2 |
| `board-b` | STOP: waiting for `pick b:<id>` |
| `picked-b` | Stage 3 |
| `bakeoff` | Stage 3 (resume the stacks without a result.json), or STOP for `pick stack:<name>` |

## Stage 0 - analyze. The one rule: say the spend

The only vendor is Gemini: ONE call that times the lyric lines against the audio.
Everything else is local DSP and costs nothing.

1. Run `analyze` dry first. It spends nothing and writes a valid timeline
   with every lyric line `section-only`. With neither flag the CLI refuses and
   prints the plan.
2. Say to the operator: "one Gemini call (lyric line times) on <file>, ~<MB> MB
   of audio" and what the dry map already shows (bpm, section count).
3. Re-run `analyze` live only when the operator agrees, or when their own
   message already asked for it. Never on your own judgement.
4. Read `timeline.json` `warnings` and say every one, verbatim. Then say: bpmGlobal
   (and bpmPrior if present), the sections (label, start-end, intensity,
   cutsPerBar) and the lyric confidence tally (high / medium / low /
   section-only). A changed mp3 resets state to `analyzed`; the CLI says so.

## Stage 1 - Board A

1. Write `music-clip/directions.json` and `music-clip/board-a/<id>.html`
   following `pipeline/music-clip/DIRECTIONS-PROMPT.md`: up to 10 directions
   across the form ladder (lyric video, concept, hybrid, visualizer), varying
   animation style, colour and story theme, each grounded in THIS track's map
   (cite sections and intensity).
2. Run `board a`. A refusal lists every violation: fix them all and re-run.
3. OPEN `music-clip/board-a-sheet.png` with Read and look. Fix blank, clipped,
   illegible or near-duplicate cards; re-run.
4. **STOP.** Tell the operator the path of `board-a.html` and of the sheet, and
   that the answer is `pick a:<id>` or free text. Free text ("the third one but
   colder") means: revise directions.json, re-run `board a`, stop again.

## Stage 1b - Board T (after `pick a:<id>`)

Board A chose the look; Board T chooses the film before any hero is built.

1. Read `pipeline/music-clip/CRAFT.md`, then write `music-clip/treatments.json` following
   `pipeline/music-clip/TREATMENTS-PROMPT.md`: 3-4 treatments that keep the picked palette and
   type and vary characters, plot and signature device; one plot beat per section in (section,
   bar, beat); keyframes at the same 4 track times in every treatment.
2. Run `board t` once with no scenes: it validates (every violation listed - fix them all) and
   draws each treatment text-only.
3. Spawn one Opus builder per treatment, in parallel, in ONE message, each building
   `board-t/<id>/scene.html` on the gpuShot contract and iterating with `board t --only <id>`
   (the prompt is in TREATMENTS-PROMPT.md).
4. Run `board t`. A `warnings` entry naming a console error, a frame that did not load, or a
   `SwiftShader` renderer is a defect, not a note.
5. OPEN `music-clip/board-t-sheet.png` and every keyframe PNG; rebuild a blank, black or
   slideshow-still treatment with `--only <id>`.
6. **STOP.** Tell the operator the path of `board-t.html` and of the sheet, and that the answer is
   `pick t:<id>` or free text (revise treatments.json / a scene, re-run `board t`, stop again).

## Stage 2 - Board B (after `pick t:<id>`)

1. Write `music-clip/story.json` and `music-clip/board-b/hero.html` following
   `pipeline/music-clip/STORY-PROMPT.md` and CRAFT.md. The story carries the picked treatment's
   plot into its sections and may name it (`"treatment": "<picks.t>"`; `board b` refuses any other
   id). The hero starts FROM the picked treatment's `board-t/<id>/scene.html` - its world,
   characters, camera device and post chain - not from a blank page. `board b` refuses before a
   treatment is picked.
2. Run `board b`. It refuses a bad story and lints the hero for frame purity.
   The lint only warns; treat every finding as must-fix and re-run. A `warnings` entry saying the three frames are
   identical is a defect, not a note.
3. OPEN `music-clip/board-b-sheet.png` and look; fix; re-run.
4. **STOP.** Tell the operator the path of `board-b.html` and of the sheet, and
   that the answer is `pick b:<id>`, where the id is `story.json`'s `direction`
   (an unknown id makes `pick` list the valid ones) or free text, which means revise and stop again.

## Stage 3 - the film (after `pick t:<id>`)

The stack is decided: our own engine - a `film/index.html` whose frame is a pure function of t,
three.js on the box's GPU (`lib/music-clip/gpuShot.ts`), captured and muxed by `cut.mts`. The
operator settled it on 2026-10-30 after every approved frame of Break the Sequence came from it:
"render speed will not be factor if we can achieve the quality ... stick to this proven variant and
perfect with each scene and clip". The three-stack bake-off (`pack`, `compare`, `pick stack:`)
stays in the CLI, unused by default.

1. **The edit as data.** Write `film/shotplan.json` (per section: the grid unit and a cycle of
   shots, each a set + cam + note) and run `shots`: it expands on the beat grid into
   `film/shotlist.json` and refuses any shot over `maxShotS`. Break the Sequence's rule, from the
   operator: no shot over 3 s, something always happens. Intimate sets build between refrains;
   the army only in refrains and the intense second half. The one exception is the operator's to
   make: a section marked `"oneTake": true` is a single shot exempt from the ceiling (Break the
   Sequence's intro, 15 s, "the music in this phase does not build up and switching scenes in
   intro does not work well there"). A one-take is a camera path over timed keys, monotone cubic
   (a Catmull-Rom tangent overshoots and swings the look target off the subject), with an event
   on every onset or beat along the way. An ending is the same call: `"tailTake"` makes a
   section's last N bars one shot (Break the Sequence: the last 14 s, the camera rising off 0451
   over the army to the green wave). A cycle of shots repeated through a long outro tells the
   story twice; give each bar of an outro its own beat, timed to its lyric.
   Sound: put the track's lossless master (wav/flac) beside the mp3; renders mux it, analysis
   stays on the mp3 (check they line up: cross-correlate, expect 0 ms).
   Crowds keep moving: a unit that stops in a marching line is walked into by the next one. Route
   the line round the stopped unit and let the walkers nod as they walk (operator, film v1 at 1:12).
2. **Core first, then sets in parallel.** Start from `pipeline/music-clip/film-starter/` (Break the
   Sequence's proven core: post chain, material library, the robot factory with the approved nod,
   kit, env with the monotone `hermite` camera path, the router, and the one-take exemplar
   `sets/cable-room/onetake.js`; its README says what to keep and what is per-track). Copy it to
   `<folder>/music-clip/film/`, keep what serves this track, rewrite the sets. One builder owns
   `film/core/` and the router and leaves a stub per set so the film plays end to end; then one
   Opus builder per set group, in parallel, each touching only its `film/sets/<set>.js`, each
   shooting every one of its shots (start, middle, end) and 4K crops, iterating against CRAFT.md.
3. **Proof cuts with sound** (`cut.mts`) on the refrains, on every new set and on every one-take
   before the full render; the operator judges motion and sync by ear and eye, not by stills.
4. **The full render:** `cut.mts <folder> film/index.html 0 <duration> music-clip/film-vN-1080p.mp4`
   (1080p 47-53 min on the RTX Spark; `--size 3840x2160` ~4 h). Version every render (v1, v2, ...)
   and keep the previous one for comparison. Never run the test suite during a render: the box is
   saturated and timed tests fail. Check frames pulled FROM THE ENCODED FILE.
5. **STOP.** The final's path, duration, the ffprobe line, a contact sheet. Notes from the operator
   go back into a set or the plan, never into a one-off patch of the render.

### Note rounds - how the operator's notes become fixes

Break the Sequence took three rounds (v1 -> v3); every note was a timestamp and a symptom.

- **Timestamp -> shot -> set.** Map each time to its shot in `film/shotlist.json`, pull frames at
  the time from the encoded file (full size, not a contact-sheet thumbnail), find the cause in the
  set, fix the set or the plan, shoot the fix at the note's time AND at every other shot of that
  set/cam (a fix in a set fixes all its repeats).
- **What thumbnails hide:** contact (a hand through a grip, units walking into each other) and
  motion only show at full size or in motion. Shoot start/middle/end of every contact shot at 1080p.
- **Exposure traps, all seen:** an HDR emissive prop near the lens is a white slab (keep close props
  under the bloom threshold; a thin LED line may bloom, a face may not); a dark set whose light
  source dies (visors off) goes black - give the silhouettes a backdrop light; a light hitting a
  glossy lid at grazing angle is a hot white patch.
- **A camera path through keys** overshoots with Catmull-Rom tangents (the look target swung off
  the gauge and the frame went black): use `hermite` from core/env.js (monotone, never overshoots).
- **Openings and endings:** cutting every bar where the music does not build reads as random.
  Look at the low band of the intro and the outro before writing the plan; where it is flat,
  propose a one-take (`oneTake` / `tailTake`) to the operator. A shot cycle repeated through a long
  section repeats its story notes - check every note's time against its lyric time.

### The generated path - keyframes for image-to-video (after a baseline film)

The three.js film is the baseline: it fixes story, edit and timing cheaply. The next version can be shot as
generated stills animated by an image-to-video model (Stay Here, 2026-10-31: "we can prompt the keyframes and
afford to enhance the story or detail of scenes"). Its plan is `music-clip/storyboard-vN.md` (one keyframe per
4-6 s clip, cut on bar downbeats) and `music-clip/keyframes.json`:

```bash
npx tsx pipeline/music-clip/keyframes.mts <folder> --dry            # the plan, nothing sent
npx tsx pipeline/music-clip/keyframes.mts <folder> --only K05 --yes # one frame first: read its credits line
npx tsx pipeline/music-clip/keyframes.mts <folder> --yes            # the rest (skips frames already on disk)
npx tsx pipeline/music-clip/keyframes.mts <folder> --via studio --yes   # the same through the web studio's pool
```

- The operator's setup (2026-10-31): Leonardo v2, `openai/gpt-image-2.5-sunburst`, `quality: LOW`,
  2048x1136, one `style_ids` entry, `prompt_enhance: OFF` - in `keyframes.json` `request`. Every frame is
  deleted from the Leonardo library after download; `keyframes/ledger.jsonl` keeps generation id and credits.
- It draws on the API key's own pool (`apiSubscriptionTokens` / `apiPaidTokens` in `/v1/me`), NOT the web
  studio's subscription tokens. On 2026-10-31 that pool was 0 and v2 answered 402 "Insufficient tokens" with
  6,844 studio tokens unused: check the pool before promising a batch. Then use `--via studio` (the operator's
  pick that day): the same model, LOW and size MEDIUM 2048x1136 through the signed-in web studio
  (`lib/imaging/studio/`, Chrome on CDP 9333, one tab at a time under the studio lock the scout shares),
  paid from the studio pool - measured 20 credits and ~30 s a frame; the script deletes each generation
  through the API afterwards. The studio's default style (Dynamic) is the operator's style id.
- Clips: `npx tsx pipeline/music-clip/clips.mts <folder> --dry | --yes` - each keyframe plus its `motion` line
  (keyframes.json) through the box's LTX-2.5 i2v (lib/imaging/video/comfyLtx.ts, ComfyUI, $0) into
  `clips/<id>.mp4`, from its t to the next keyframe's in whole seconds (2-10), 1280x704, ~6-7 min per 5 s
  alone on the card (Stay Here: 46 clips, 288 s, ~6 h - a night). It queues only on an EMPTY ComfyUI queue (it
  waits out another session's run) and frees the models only when nothing else is waiting. Motion lines:
  one gentle move per clip, "no zoom, no cuts". NOT "puppets of black card on wire rods": LTX draws it
  literally and melts the figures into floating black rectangles by the clip's end (Stay Here run 1: 12 of 46
  drifted, most broke at 20-50% of the clip). Say instead that every silhouette stays whole and keeps its
  outline from the first frame to the last and nothing new enters the frame.
- Pace follows the section's intensity, not the keyframe count (Stay Here v3, operator: "the song is much
  more fast paced, whereas the scene movement and closeups are almost static"). From intensity ~0.6 up, one
  shot per bar (2.9 s at 83 BPM), each its own keyframe and its own action verb ("snaps", "hurls",
  "sprints", "drops"), camera locked off; a story beat that held one 9-11 s clip becomes 3-4 bars of
  action (the climb: hook, haul, slip, vault). A gentle LTX move over 6+ s reads as a slow zoom.
- Never write rods or strings into the STYLE sentence ("thin wire rods holding the puppets"): the image
  model draws them on some frames and not others, and the inconsistency shows (Stay Here v3 at 1:01,
  1:20, 1:30). Write "the figures stand free with no rods, strings or wires anywhere above them".
- Look before the edit: a contact sheet of frames at 0/20/40/60/80/100% of each clip. A clip whose clean
  part covers its span is trimmed (`assembly.json`); one that breaks earlier than that is re-rendered with
  `--only <ids> --again --seed 2000` (keep the first takes in `clips/v1/`). Slowing a clean 40% to fill a
  span reads as slow motion; the climb shots at x0.87 read fine.
- Assembly: `npx tsx pipeline/music-clip/assemble.mts <folder> <folder>/music-clip/film-vN-1080p.mp4 [--dry]`
  - each keyframe's t snapped to the nearest beat (within half a beat; past the beat grid the t stands),
  clip i fills [cut i, cut i+1) frame-exact, a clip shorter than its span is slowed to fill it,
  `music-clip/assembly.json` `{ "K25": { "in": 0, "out": 6.5 } }` picks a source window, 1920x1080 24 fps
  NVENC + AAC 384k from the master. ~30 s for 4:44. Then deliver.mts as for any render.
- Prompts: ONE style sentence and ONE fixed phrase per character, repeated verbatim in every frame (the model
  keeps what it is told the same way); the act's gel named in each; type in the world named in capitals
  (SEIZED, BANK, OPEN); hands "at natural scale". Rules the baseline's notes taught: no push-in from wide to
  close inside a clip (frame the keyframe at the distance the shot holds); every cut carries something across
  it (an object, a screen direction, a gel).

#### Generated-first, with no three.js baseline (Count Us All, 2026-11-01)

A track can go straight from Board T to generated keyframes when the operator says so. Count Us All did:
the "Tally Marks" look, the two-colour screenprint, 48 scenes, Leonardo keyframes and local LTX, delivered
in one session plus one night. What it taught:

- **Plan on the bar grid, not the lyrics,** when the whole track is sung. Gemini timed the lines only to
  150 s and placed the bridge and the last choruses past the end of the 195 s track. The style prompt was a
  reference to a similar track: use neither its wording nor its "instrumental" sections. The result was
  48 scenes, every cut on a bar line, at 2.6 s, 5.2 s or 8 s (1, 2 or 3 bars at 92 BPM).
- **Keyframes go in two rounds.** Round 1 is drawn for approval: studio Small 1376x768 at Low, 8 credits a
  frame. Round 2 is drawn for the film: Medium 2048x1136 at Low, 17 credits plus 3 for an Image Reference,
  with the round 1 frame as that reference. Medium quality costs 44 credits, and the operator saw "marginal"
  gain and chose Low. Prices are read off the Generate button; Large 3584x2016 at Medium is 137.
- **An Image Reference locks the composition,** so a prompt fix sent with it is ignored. That happened with
  S35 and S41. To change what a frame shows, regenerate it with no reference, draw two variants and let the
  operator pick.
- **The studio driver that adds a reference** (upload through Select Media, `UploadImage` returns the
  `uploadId`) lived in the session scratchpad; `keyframes.mts --via studio` has no reference yet. Its
  cleanup deletes ONLY the id the run's own `UploadImage` or `Generate` returned, refuses when it holds more
  than one, and deletes nothing in a dry run. The 2026-10-31 incident: a dry run deleted every init-image id
  seen in page traffic, 50 of the operator's own uploads, and they could not be recovered.
- **The operator has no hailuo for clips:** all 48 went through local LTX, with weak ones redone by hand in
  Leonardo. The clips ran overnight at 3 seeds per scene, in seed-major order (all 48 at seed 1 first, so
  a short night still covers the film). That was 144 clips at 1024x576 (vs `clips.mts` 1280x704), median
  165 s each cold and 86 s with the models already loaded, about 6 h.
- **Review with one sheet per scene:** rows are seeds; columns are the keyframe and frames at 0, 1, 2.5 and
  4 s. Then a rough cut with seed 1 everywhere, and notes against it.
- **Where LTX held:**
  - camera moves and crowds
  - light pulses racing along a cable
  - a stream of marks flying out of a horn
  - a push-in to a lone figure
- **Where LTX broke, on every seed:**
  - two hands resting on or drawing on a surface (they melt by 1.5 s)
  - a hand taking an object
  - any number or name changing: a counter jumped from 0 to 5, a name turned to UNIT 87, and the other
    names were wiped off the board
  - turning heads
- **A motion line names continuous action.** The operator's note was "closeups with slow or no movement,
  where some activity would be expected". The cause was motion lines like "...; the robot stays still".
  Write action that runs through the whole shot instead: marks appear one after another, the visor pulses
  with each, a wave races out.
- **A short scene shows the dead start of the clip.** LTX moves least in its first second, and a 2.6 s scene
  trimmed from 0 s shows only that. Start the trim inside the clip (pick `seed-2@1.2`). `assemble.mts`
  `assembly.json` `in` does the same.
- **A held last frame reads as lag.** LTX clips run 5.04 s, but bar-line scenes run 5.1-5.5 s. Holding the
  last frame for 0.1-0.27 s before the cut came back as "transitions look like lag" at 0:20 and 0:26.
  Slow the clip to fill the scene instead (1-4% is invisible). Before handing over a cut, scan it with
  `ffmpeg -i cut.mp4 -an -vf freezedetect=n=0.001:d=0.1 -f null -`: no freeze may sit at a cut.
- **Share the GPU politely.** When another job holds ComfyUI, check every hour, and take the card only
  after two readings two minutes apart show it idle (under 15% utilization and 12 GB, queue empty). Use
  the running ComfyUI rather than starting a second one, and never stop a process you did not start.

### Delivery - always the same encode

The render (`cut.mts`, NVENC H.264 ~16 Mb/s + AAC 384 kb/s from the master) is the ARCHIVE, about 0.5 GB for
4-5 minutes. It is never the upload. Every film ships through one command:

```bash
npx tsx pipeline/music-clip/deliver.mts <folder>/music-clip/film-vN-1080p.mp4   # -> film-vN-upload.mp4
```

It encodes x265 10-bit CRF 22 (AAC 256 kb/s 48 kHz, `+faststart`) and measures VMAF against the render; it
exits 1 under a mean of 95 (lower `--crf` and re-run). Measured on Stay Here v2 (284 s, grain over smooth
backlit gradients), VMAF mean / worst frame: x265 10-bit CRF 22 **106 MB, 97.0 / 81.4**; x264 CRF 18 363 MB,
96.4 / 85.4; x264 CRF 23 162 MB, 94.7 / 79.0. YouTube re-encodes every upload and recommends 8 Mb/s for
1080p30, so the render's extra bits buy nothing; 10-bit keeps the gradients from banding; grain is what
costs the bits. Say the size and the VMAF line when you hand a film over.
A textured look (paper tooth, halftone, ink grain) costs about twice that: on Count Us All (195 s
screenprint) CRF 22 gave 193 MB at VMAF 97.5, so it shipped at `--crf 25`: **134 MB, 96.4**. When the
mean clears 96 at CRF 22, try 25 before handing over.

## Rules

- Never push unless the operator asks; never commit the operator's folder, never delete the operator's
  files (the mp3, lyrics, style, anything outside `music-clip/`).
- The live analysis is the only spend until the generated path. There, every keyframe batch is priced
  off the Generate button and approved by the operator before it runs, and clips run on the local GPU.
- A Leonardo cleanup deletes only the id its own call returned (one, count-checked) and nothing in a dry run.
- Boards carry work text only: names, palettes, lyric words, story beats,
  numbers, risks. No sentence about the board or how to use it.
- Flash limit everywhere: <= 3 flashes per second.
- A stop is a stop: the session ends at it, and the next one starts with `status`.
