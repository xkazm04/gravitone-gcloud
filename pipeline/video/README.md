# Clips — how video gets into this app without weighing it down

Three files, and the split between them is the point.

| file | what it does | what it costs |
| --- | --- | --- |
| `render_preset_clips.py` | Renders raw clips on the local Wan stack | ~110 s per clip, needs the card |
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
