# Clips — how video gets into this app without weighing it down

Three files, and the split between them is the point.

| file | what it does | what it costs |
| --- | --- | --- |
| `motion_author.py` | Reads a picture, then writes its motion prompt from what it saw | ~60 s, needs the card |
| `compose_clip.py` | Animates a still by MOVING A PIECE OF IT | ~3.5 min once, then free |
| `leonardo_reference.py` | Buys one hosted clip, to test whether the ceiling is ours | real money, one clip |
| `gpu_trace.py` | Samples what the machine is actually doing during a render | free |
| `retime.py` | Finds the part of a clip that is still moving and stretches it | free |
| `compare.py` | Puts clips side by side without lying about their durations | free |
| `render_preset_clips.py` | Renders raw clips on the local Wan stack | ~110 s per clip, needs the card |
| `clip_check.py` | Says whether the OBJECTS moved or the picture just drifted | free |
| `transcode.mjs` | Squeezes a raw clip into committed artefacts, under a byte budget | seconds, needs only ffmpeg |
| `../check-clips.mjs` | Weighs `public/clips/` on every `npm run verify` | free |

The raws live in `pipeline/runs/preset-clips/` and are **not committed**. The
committed half can be rebuilt on any box with ffmpeg, and the budget is enforced
on every rebuild rather than trusted from the last one.

## The rule

**A clip that ships in this repository is a budgeted artefact.** It has a target
size and the encoder is asked to hit it, rather than the author being asked to
notice. Each format is run at increasing CRF until the file fits; a clip that
cannot fit at the worst quality in the ladder fails, and the honest levers are
then the resolution and the duration, not the budget.

The total under `public/clips/` is a ratchet in `check-clips.mjs`, in the shape
this repo already uses for narration and for the type scale: it may only fall.
Raising it is a deliberate edit in a diff somebody reads — which is exactly the
conversation that should happen before the tenth surface adds its own video.

## The three decisions already made for you

**Not GIF.** Measured 2026-09-09 on `blueprint`, the fattest of the six, 5 s at
640×360:

| format | bytes | ratio |
| --- | --- | --- |
| GIF, 256 colours, 12 fps | 8,107,657 | 64× |
| MP4 / H.264, crf 22, 20 fps | 117,833 | 0.93× |
| WebM / VP9, crf 28, 20 fps | 126,022 | 1× |

Sixty-four times, for a worse picture at eight fewer frames a second.

GIF is also unpausable, unseekable, decodes on the main thread, and is invisible
to `prefers-reduced-motion` because the browser does not know it is motion.

**One codec, not two.** VP9-in-WebM only. A browser too old for it (Safari
before 16) shows the **poster**, which is the clip's own first frame — the still
the surface displayed before it had a clip. That is a real fallback, not a hole.
Shipping an H.264 twin roughly doubles the committed weight to serve browsers
that already see the correct picture; the six preset clips are 557 KB with one
codec. `makeClip(src, { formats: ["webm", "mp4"] })` still buys the twin where
the motion *is* the content.

**Image-to-video, not text-to-video**, for anything that animates a picture the
app already shows. The clip then begins on the exact still it replaces. A clip
generated from the prompt again is a second, different picture, and the surface
ends up selling something it does not have.

## Adding a clip to a new surface

1. Add a profile to `PROFILES` in `transcode.mjs` if `showcase` does not fit —
   one entry there, never a second set of ffmpeg flags at a call site.
2. Render the raw however that surface's content is made.
3. `makeClip(raw, { outDir: "public/clips/<surface>", slug, profile })`.
4. Write the manifest entry (see `../build-preset-clips.mts`) so `check-clips.mjs`
   can see it. A file on disk that no manifest entry claims is a gate failure —
   it is weight nothing can reach.
5. Render it with `components/ui/Clip.tsx`. Do not hand-roll a `<video>`: muted,
   `playsInline`, play-only-when-seen and the reduced-motion degrade are four
   decisions, and each is a bug if a surface makes it alone.

## Writing a motion line

Small, and the same shape every time: **what holds still, then the one thing
that moves.** Camera-led — a slow push-in, a slow drift, a parallax — plus at
most one material-level change (dust, grain, a glow rising once).

Measured 2026-09-09: a line asking for construction lines to *draw themselves*
produced a white banner sweeping the frame from frame 40 on. Wan renders camera
moves and material drift reliably and generative drawing not at all. The
negative prompt in `render_preset_clips.py` differs from
`pipeline/foundry/dojo_video.py`'s for the same reason — the dojo pushes *for*
motion because it is judged on it, and a swatch wants the least motion that
still reads as motion.

## The standing finding: Wan cannot animate flat vector art

**Do not spend another render trying.** Measured 2026-09-09 on `blueprint`, six
renders, every combination of prompt shape and sampler setting that mattered:

| render | prompt | sampler | what came out |
| --- | --- | --- | --- |
| shipped | camera-led line | cfg 5.0 shift 8.0 | drawing intact, camera drift, nothing moves |
| v1 | authored, object verbs | cfg 5.0 shift 8.0 | the trend line detaches into a squiggle |
| v2 | authored, object verbs | cfg 6.5 shift 5.0 | the circle balloons into a giant loop |
| v3 | rigid, tiny translation | cfg 5.0 shift 5.0 | drawing perfect, camera zoom again |
| v5 | rigid, large travel | cfg 5.5 shift 5.0 | the curve and circle vanish, then return |

The pattern does not vary: **ask Wan 2.2 TI2V-5B to leave the linework alone and
it moves the camera; ask it to move an element and it destroys the drawing.**
There is no window between. Flat vector art is far outside what a video model
trained on filmed footage knows how to deform, and the 5B is the small member of
the family.

MiniMax H3 fl2va, the other local video model, was tried and abandoned on cost:
one 3-second clip at 832x480 (its dimensions must divide by 32; 848 raises
`shape [...] is invalid for input of size 38160`) was still running after thirty
minutes. Six thumbnails at that rate is an evening per iteration.

What the two-pass author in `motion_author.py` DID fix is real and worth keeping:
the prompts now name the things in the picture, which is why v1/v2 engaged with
the drawing at all instead of drifting past it. The stage is sound; the renderer
underneath it is the wrong tool for this content.

## The route that works: compose_clip.py

Interpolating between two GENERATED stills was the first idea and it does not
work either: Flux at full reference strength redraws the whole scene rather than
editing one element — measured on blueprint, the bars, the curve and the corner
schematic all moved — so an interpolation between them is soft everywhere, which
is the defect being removed.

What works is to generate ONE new still and do the motion in numpy:

1. **read** the picture, choose the element and where it goes, and ground both
   as pixel boxes (`motion_author.py` plus a grounding pass; the boxes land on
   the element accurately).
2. **plate** — erase the element with Flux 2 inpainting, then composite the
   result back into the ORIGINAL so every pixel outside the erased box is
   bit-identical. Skipping that composite leaves a background that shimmers: a
   VAE round-trip moves every pixel by about 2/255 even where the noise mask is
   zero.
3. **sprite** — the element is whatever the plate removed. Alpha from the
   difference, colour from the original.
4. **frames** — composite the sprite over the plate at eased positions, forward
   then reversed so the loop closes without a snap.

Measured on blueprint: concentration 1.00 (all the change is where the element
is), retention 0.92, sharpness 1.00. The background is held *by construction* —
it is the same array in every frame — and the element stays exactly as sharp as
it was drawn, because it is the same pixels translated.

**What it cannot do yet.** One element, one straight path. The blueprint circle
therefore slides off its curve rather than riding down it, and the sprite carries
a few pixels of the curve's tip with it. A curved path needs a third grounded
point; rotation and scale need more than a translate.

## The control, and the two mistakes in the first attempt at it

The local failures do not, on their own, say whether the ceiling is the CONTENT
or OUR HANDLING of it. So one clip was bought from Leonardo — the same swatch,
the same intent — and the answer is unambiguous.

The first attempt got a clip that failed exactly like the local stack, and
concluded from it that the ceiling was the content. **That conclusion was wrong,
and it was wrong because of two mistakes in how the clip was bought.**

**MISTAKE 1: THE MODEL WAS NEVER NAMED.** The request went to v1
`/generations-image-to-video` with no model field and silently took the default,
which came back as `motionModel: "WAN21"`. So the "hosted control" was the same
model family as the local stack. Naming the model is not optional — it IS the
experiment. The v2 endpoint takes an explicit id (`hailuo-03`, `veo-3`,
`kling-2-5`) and `leonardo_reference.py` now requires one.

**MISTAKE 2: THE PROMPT WAS TOO LONG.** It sent the authored sentence — *"The
circle with arrow slides left across the top. Everything else in the drawing
holds perfectly still, and the camera does not move."* — and got a camera drift.
A bare **"Animate the image"** does far better on the same picture. That reads
backwards until you count what the long version actually says: one clause of
motion and two of stillness, aimed at an element the model may not be able to
ground. A model that cannot find "the circle with arrow" still understands
"holds perfectly still" and "the camera does not move", so the instruction
lands as a description of a nearly frozen frame. **A longer prompt is not a
stronger instruction; here it was mostly a list of things not to do.**

Measured on the same instrument:

| clip | energy | concentration | retention |
| --- | --- | --- | --- |
| Leonardo `hailuo-03`, "Animate the image" | **1.718** | **0.54** | 0.17 |
| local Wan 2.2, authored sentence | 0.368 | 0.42 | 0.81 |
| Leonardo Wan 2.1, authored sentence | 0.263 | 0.38 | 0.91 |
| composited, no video model | 0.143 | 1.00 | 0.92 |

`hailuo-03` produces roughly **six times** the motion of either Wan clip, and it
is motion with intent: the bars fill with drafting hatch in sequence, a highlight
sweeps across them, the circle becomes an animated reticle, and annotation marks
tick in around the frame. It animates the blueprint AS a blueprint. The low
retention is the honest cost — it does not preserve the drawing, it redraws it in
its own idiom.

So the earlier conclusion is retracted: the content is not the ceiling. The model
and the prompt were.

Watch `pipeline/runs/preset-clips/compare-4way.mp4` for all four side by side.

## Two places this pipeline is biased toward "move at least something"

Both are real, both are ours, and neither is the cause of the failure above —
the hosted control rules that out. They are worth fixing anyway.

**1. The author cannot decline.** `motion_author.py`'s schemas make a move
mandatory: `moves` is required with `minItems: 1`, and the keyframe pass must
return a `moving` element and a `path`. There is no way for the reading stage to
say *this picture has nothing that should move* or *this one needs a different
treatment*. Handed a swatch with no separable movable element, it will invent
one, and everything downstream will faithfully animate the invention.

**2. The negative prompt forbids the motion the positive prompt asks for.**
`render_preset_clips.py`'s NEG carries `morphing shapes, shapes appearing,
shapes disappearing, added elements` — added to stop a gloved hand entering the
chalkboard, which it did. But a bar rising IS a shape changing, so a prompt
asking for it is arguing with itself. (The dojo's own NEG opens with `static
frame, frozen image, no motion`, which pushes the other way for the other
reason; it was removed here early, and it is worth knowing it was ever there.)

## The 30x: two ComfyUI launch flags

**`--disable-pinned-memory --disable-dynamic-vram` cost this repo a factor of
thirty on every render it has ever made.** `guard.start_comfy` added them to
every start, justified by a line nobody had measured: they "do not fall over
when host memory is tight, which on a 64 GB box sharing one card is the trade
worth making".

Three renders of the SAME MiniMax H3 clip, 640x384x73, 8 steps, same seed:

| run | loader | host RAM free at start | wall clock | commit peak | RAM min |
| --- | --- | --- | --- | --- | --- |
| 1 | legacy | 35.1 GB | 1646 s | 99% of 133 GB | 0.0 GB |
| 2 | **plain** | 42.5 GB | **48 s** | 79% of 126 GB | 3.3 GB |
| 3 | legacy (control) | 40.7 GB | 1465 s | 98% of 126 GB | 0.2 GB |

Runs 2 and 3 differ in the flags and nothing else — the control was run at the
same freed-RAM state precisely so the flags were the only variable. **30x.** And
the clips are identical on every quality measure (concentration 0.80, retention
0.92, same seed, same output), so the flags bought nothing whatsoever.

They also CAUSED the condition they were meant to survive. With them, host RAM
reaches zero and commit charge reaches 98-99% of its limit. Without them, commit
peaks at 79% and RAM never drops below 3 GB. The legacy path holds weights in
host memory instead of letting the driver manage pinned and dynamic VRAM, so on
a tight box it is the thing doing the squeezing.

`COMFY_LEGACY_LOADER=1` puts them back for a machine where the old reasoning
turns out to hold.

**A local 3-second H3 clip now costs 48 seconds instead of 27 minutes.**

### H3 front-loads: it arrives, then repaints

A clip that measured well still read as broken — "it stops slightly after 1s,
then stays stale for the rest of 3s", and the operator was right. Frame-to-frame
energy could not see it, because the tail is not still, it is noise. The measure
that sees it is DISPLACEMENT FROM THE FIRST FRAME. As a percentage of each
clip's own peak, by decile:

| clip | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| local H3 | 21 | 33 | 65 | 94 | 98 | 99 | 99 | 99 | 99 | 99 |
| hosted hailuo-03 | 10 | 33 | 79 | 100 | 88 | 94 | 95 | 96 | 95 | 96 |
| local H3, **retimed** | 12 | 18 | 22 | 28 | 33 | 40 | 61 | 79 | 92 | 99 |

The local clip has ARRIVED by 40% of its length; every frame after is the same
picture being repainted. The hosted one keeps moving around instead of settling.

**No generation setting fixed it.** 25 steps without the turbo LoRA was weaker
(mean 0.285 against 0.378). Pinning `first_frame == last_frame` — the fl2va node
takes a `last_frame` that `chain_workflow` never passed — flattened the profile
but reduced the motion to a slow breath. 124 frames wandered off the style, into
a teal infographic with the LoRA and a dashboard of invented pie charts and text
without it. The node has no negative prompt input, so the wandering cannot be
forbidden either.

So `retime.py` does it after the fact: find the arrival frame, keep what came
before, slow it with optical-flow interpolation to fill the run. Blueprint keeps
30 of 73 frames and plays them 2.48x slower, and the bottom row of the table is
the result — a steady build with no plateau. `build-preset-clips.mts` runs it
whenever a sidecar carries `retime`.

### Length is the quality ceiling, not resolution

With the flags gone it became cheap enough to isolate. Same swatch, same prompt,
same seed, three renders:

| size | frames | seconds | result |
| --- | --- | --- | --- |
| 640x384 | **73** | 48 s | stays in the blueprint: drafting hatch, annotation rings |
| 832x480 | 124 | 84 s | repaints yellow, adds sun, clouds and plants, ends blank |
| 640x384 | 124 | 48 s | becomes a teal infographic with legend cards |

**73 frames is inside the safe window and 124 is not, at either resolution.**
H3 drifts progressively away from its start frame, so the horizon — not the
pixel count — is what decides whether the style survives. A five-second clip is
therefore not available directly from this engine; 73 frames is 3.04 s, and a
loop is how it becomes five. Every
"H3 is too slow" conclusion in this file and in the dojo's history was measured
through those flags and should be re-read with that in mind — including the one
immediately below, which is kept as written because being wrong in public is the
point of writing measurements down.

## Local H3 is memory-bound, and the render size is not the lever

Measured 2026-09-09 with `gpu_trace.py`, one local MiniMax H3 fl2va render:
3 seconds (73 frames, the mod-17 length) at **640x384** — smaller than the
832x480 the motion spike used — 8 steps with the fl2v 8-step turbo LoRA.

| | |
| --- | --- |
| wall clock | **1646 s** (27 min) |
| GPU utilisation | median 100%, under 50% for only 7% of the run |
| GPU power | median **116 W of a 450 W cap — 26%** |
| SM clock | 2670 MHz of 3105 (86%) |
| VRAM peak | 23829 MiB of 24564 — **97%** |
| host RAM free, minimum | **0.0 GB** |
| commit charge peak | **132.1 GB of 133 — 99%** |
| driver throttling | none |

**The card is not the bottleneck and neither is the resolution.** A GPU pinned at
100% while drawing a quarter of its power cap is waiting on memory, not
computing. Host RAM reached zero and commit charge reached 99% of its limit —
which is exactly the failure `pipeline/vlm-probe/guard.py` spends a paragraph
on: "exhaustion presents as a hang, never as an error", and commit predicts it
better than free physical memory does. One ComfyUI process was holding a 31.9 GB
working set. Shrinking the frame from 832x480 to 640x384 did not help, because
the cost is dominated by paging a 20 GB video model and a 32-billion-parameter
text encoder through a box already at its commit ceiling.

**The past runs were real, and the record was honest.** Nine H3 clips from
2026-08-26 are still on disk under `pipeline/vlm-probe/clips/{chain,ref2va}/`,
832x480, 73 frames, 3.04 s each, all three of each lane. Their file timestamps
give the per-clip cost directly: 25, 19, then 22, 28 and 58 minutes. And the
dojo cycle `foundry-out/training/2026-09-03-serial-ref2va` wrote the diagnosis
into its own log on the day, unprompted:

> MEASURED: H3 ref2va on this box is ~63 min per 3s clip (first clip 75 min with
> load, first warm-fill clip 63 min) — the registry row's ~300s/clip assumed the
> full ~62 GB host RAM; Wolf's ~28 GB free forces expert paging. Not contention
> (queue exclusively ours, verified).

and closed with *"the RAM, not the model, is what makes it slow here."* That is
the same conclusion `gpu_trace.py` reached independently today, and the cycle was
truncated by the operator with a stated reason rather than quietly abandoned. **H3
has never been fast on this machine, nothing regressed, and nothing was
overstated.**

It also puts a number on the prize: **~300 s/clip at ~62 GB free host RAM against
~3800 s at ~28 GB.** Roughly twelvefold, bought with memory rather than silicon.
Today's run began with 35 GB free and hit 0.0. As this is written, an idle
ComfyUI is still holding a 23.2 GB working set and 99% of VRAM with nothing
queued — that alone is most of the gap.

**And it is NOT slower than it used to be.** The spike's 1243 s was at 4 steps;
this was at 8. Per sampling step that is 206 s now against 311 s then, at a
smaller frame — faster, not slower. (4 was `motion.py`'s default, but `FL_LORA`
is the *8-step* turbo LoRA, so 8 is its design point and the older runs were
under-stepping it.) The felt regression is a step count, not a machine.

The levers worth trying, in order, none of them the render size:

1. **The loader flags.** `guard.start_comfy` always adds
   `--disable-pinned-memory --disable-dynamic-vram`, and its own docstring calls
   that path "slower to load ... the trade worth making" on a memory-tight box.
   Nothing has ever measured the trade.
2. **The commit ceiling.** 133 GB against 63 GB of RAM is roughly a 70 GB
   pagefile. Raising it costs disk and buys headroom directly.
3. **Not both engines at once.** H3 loads a 20 GB video model beside a 20 GB
   text encoder. That is the working set, and it is most of the problem.

### What the local clip looks like

Better motion than any Wan attempt — concentration 0.80 against 0.42 — and it
holds the composition. But it **recolours the drawing**: the bars fill with
orange, red and yellow, colours that are not in the Blueprint palette. For a
STYLE swatch that is disqualifying, because the swatch exists to show the style.

Note the gap this exposes in `clip_check.py`: retention scored 0.92 on a clip
whose colours were replaced wholesale, because retention reads edge energy and
edges survived. **It is blind to colour.** A palette check belongs beside it.
