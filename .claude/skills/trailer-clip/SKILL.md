---
name: trailer-clip
version: 0.1.0
memory: none
category: Content
description: Turn a game or film premise into a directed trailer through stop-and-resume gates - six concepts with rough scene composition and one Codex art image each (Board C, the operator picks), then a shot plan and keyframes, then MiniMax H3 clips on the box with H3's own sound, cut with true-silence blacks and per-scene gain. The /music-clip generated path without a track or a beat grid; the timeline is the concept's beats. Native audio only until that proves the quality; a custom layer (probably ElevenLabs) comes afterwards. Wraps pipeline/trailer.mts (status / art / board / pick), pipeline/trailer/cut.mts, pipeline/music-clip/clips-h3.py and deliver.mts. Invoke with /trailer-clip <folder> [verb].
argument-hint: "<folder> [status|art|board|pick <id>|cut]"
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, Agent
---

# Trailer clip: a premise in, a directed trailer out, the operator picking at every gate

One session walks one trailer to the next stop, then stops. Everything is in `<folder>/music-clip/`, the path
`clips-h3.py` and `deliver.mts` already read, so they run unchanged. Read `pipeline/music-clip/CRAFT.md` and the
generated-path sections of the `music-clip` skill before writing a shot: their lessons apply here as written.

```bash
npx tsx pipeline/trailer.mts status "<folder>" [--json]
npx tsx pipeline/trailer.mts art "<folder>" [--only a,b] [--again] [--jobs 3] --dry|--yes
npx tsx pipeline/trailer.mts board "<folder>"
npx tsx pipeline/trailer.mts pick "<folder>" <concept id>
npx tsx pipeline/trailer/cut.mts "<folder>" <out.mp4> [--edit edit.json] [--dry]
```

## What differs from /music-clip

| | /music-clip | /trailer-clip |
|---|---|---|
| Timeline | the track's beats and sections | the concept's beats, in seconds |
| Sound | the lossless master | H3's own audio, clip by clip |
| Clip speed | x1.8 inside a bar | 1x by default; speech and impacts shift audibly when sped up, so another rate goes through atempo |
| Assembly | `assemble.mts` | `trailer/cut.mts` (`assemble.mts` throws the clips' audio away) |
| Keyframes | Leonardo or Codex | Codex image_gen; each carries a `motion` line that names the sound |

## Stage 1 - Board C: six concepts, one image each

1. Write `<folder>/brief.md` in the operator's words and `music-clip/concepts.json` (`Concepts` in
   `pipeline/trailer/board.mts`): `look` (one sentence), one fixed hero phrase repeated verbatim in every prompt, a
   cast sheet prompt, and up to six concepts. All six keep the operator's plot; they vary the form device, who the
   voices are, the motif and how the sound works.
2. `art --dry`, read the prompts, then `art --yes`: the cast sheet first and alone, then the concepts with the sheet
   attached. Open every PNG; re-shoot a weak one with `--only <id> --again`.
3. `board`, open `board-sheet.png`, fix what reads badly, re-run.
4. **STOP.** Give the paths of `board.html` and the sheet. The answer is `pick <id>` or free text (revise, re-shoot,
   stop again).

## Stage 2 - sound test before the plan

Before a whole shot plan rests on it, prove on 3-4 H3 clips what the picked concept needs from native sound: speech
with a robot and no mouth, impacts, gunfire on steel, room tone. Put the sound in the `motion` line and say "no music".
Listen, or measure at the least; tell the operator what was and was not heard. This is the first gate that uses the
card: 7-8.5 min a clip alone on it, queued only on an empty ComfyUI queue. **STOP** with the takes.

## Stage 3 - keyframes and clips

1. Write `keyframes.json` (frames: id, prompt, motion, scene) from the picked concept's beats: one shot per 5.2 s H3
   clip at most, trimmed down in the edit. Codex keyframes: plate plus character sheet; a pose that matters goes on
   the plate as a drawn skeleton (Unlatched, film 3).
2. Draw first-pass keyframes, sheet them, **STOP** for approval.
3. `python -I pipeline/music-clip/clips-h3.py <folder> --plan <plan.json> [--only ids] [--dry]`: an end frame only in
   one place at one distance; a location change gets none. Look at frames at 0.1, 2.6 and 5.0 s of every clip.

## Stage 4 - the cut

1. Write `music-clip/edit.json` (`{ "scenes": [ { "id", "in", "out", "gainDb", "fadeIn", "fadeOut", "dir", "rate" } | { "black": seconds } ] }`).
   `cut.mts --dry` prints each clip's measured level: H3's swings by clip (measured -42 dB to -14 dB), and gainDb
   evens it out.
2. Render, then scan: `ffmpeg -i cut.mp4 -an -vf freezedetect=n=0.001:d=0.1 -f null -` and check the black reads as
   silence (`volumedetect` on its span).
3. `npx tsx pipeline/music-clip/deliver.mts <cut.mp4>` for the upload copy. **STOP.** Notes go back into keyframes or
   edit.json, never into a one-off patch of the render.

## Rules

- Native audio only until the operator says the trailer holds at high quality. A custom layer (probably ElevenLabs)
  is designed after that, against the native cut; no vendor audio spend before it.
- Never push; never commit the operator's folder; never delete anything outside `music-clip/`.
- Own identity: the title's type, the key art and the world are this trailer's own, never another game's logo,
  typeface, characters or poster layout.
- Violence stays impact and consequence, without gore. Flash limit everywhere: at most 3 flashes per second.
- Boards carry work text only. No sentence about the board or how to use it.
- A stop is a stop: the next session starts with `status`.
