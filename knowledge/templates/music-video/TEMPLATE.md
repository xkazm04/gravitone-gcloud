# Template — music video (one track, one poster)

The fourth discipline, not a fifth studio step. Research attaches an mp3 (and an optional style
note) instead of running the notebook; Script and Score auto-pass-through; Frames generates one
poster and animates it against a once-baked beat/onset envelope; Cut exports an mp4. See
`.vault/Spark/ideas/music-video-project-type.md` for the full design brief this template was cut
from — this file exists only to make `lib/formatBrief.ts`'s citation real, per
`tests/golden-path/format-brief.probe.spec.ts`.

## ⚠ The corpus is n=0

Nothing about music videos — beat-detection, particle overlays, export bitrates — is measured in
this repo or carried by the AI registry's `media-generation` bundle (checked 2026-10-04: no
music-video subject exists there). Every claim below is either a design decision made for this
spark or a fact verified live during the spark's own research (the `agy` provider's measured
resolution and latency), never a craft-library measurement. No `steps/` subfolder — `free-form`
already establishes that one is not required for a template to function.

## The format

| Property | Value | Source |
|---|---|---|
| Source material | one attached mp3, decoded once for its real duration | design decision — never estimated from bitrate |
| Visual material | one generated poster (not a shot list) | design decision |
| Motion | a baked, deterministic audio envelope — never a live analyser | design decision, `seek-stable-composition-authoring` (registry) |
| Duration | 60–240s, following the track | `lib/projects.ts` `TEMPLATES["music-video"]` — not a craft-library measurement |
| Poster resolution ceiling | ~1376×768 | OBSERVED · `agy` CLI, verified live by generating and reading back real images |
| Poster generation latency | ~57s per image | OBSERVED · `agy` CLI, measured live |
| Export resolutions | 1080p / 1440p / 4K (4K is an upscale of the poster, stated honestly) | design decision |

## What makes this template different

Every other template in this catalogue directs a sequence of composed scenes. This one directs
nothing scene-by-scene: there is one still, and the "direction" is the deterministic mapping from
`(frameIndex, envelope, seed)` to a frame of that still with effects applied. A format brief for
this discipline therefore carries rules about reproducibility and honesty (upscale ceiling, no
live state) rather than rules about shot composition.
