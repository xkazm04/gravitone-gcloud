# Clips — how video gets into this app without weighing it down

Three files, and the split between them is the point.

| file | what it does | what it costs |
| --- | --- | --- |
| `motion_author.py` | Reads a picture, then writes its motion prompt from what it saw | ~60 s, needs the card |
| `compose_clip.py` | Animates a still by MOVING A PIECE OF IT | ~3.5 min once, then free |
| `leonardo_reference.py` | Buys one hosted clip, to test whether the ceiling is ours | real money, one clip |
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

## The control: a hosted pipeline fails the same way

The local failures do not, on their own, say whether the ceiling is the CONTENT
or OUR HANDLING of it. So one clip was bought from Leonardo — the same swatch,
the same intent — and the answer is unambiguous.

**Leonardo's image-to-video runs `motionModel: "WAN21"`.** Same model family as
the local stack, behind a pipeline tuned by people whose job that is. Measured
on the same instrument:

| clip | concentration | verdict |
| --- | --- | --- |
| Leonardo, Wan 2.1 hosted | 0.38 | camera move, not objects moving |
| local, Wan 2.2 TI2V-5B | 0.42 | camera move, not objects moving |
| composited, no video model | 1.00 | objects moving |

Leonardo ignored the object instruction exactly as the local stack did, drifted
the whole frame, and grew a second ghost circle in the last second. It is not
better. **The ceiling is the content.** A video model asked to animate a
technical drawing will move the camera, whoever is holding it.

Watch `pipeline/runs/preset-clips/compare-3way.mp4` for the three side by side.

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
