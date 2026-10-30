# The bake-off - one clip, three stacks

You are ONE of three builders. Each builds the same music video for the same
track on a different render stack. Your stack is named in your prompt:
`kernel`, `hyperframes` or `remotion` (the `remotion` lane may use Revideo
instead; say which in `notes`). The operator picks the stack from your results,
so what you measure matters as much as what you render.

## The goal

The picked direction and story, rendered as a full-length music video of the
track: lyrics set on their timeline times, cuts on the grid, the story's
sections in order, the hero passage at least as good as the Board B hero.

## The input pack (read-only)

`<dir>/music-clip/bakeoff/pack/`, sealed by `pack`. `pack.json`
(`{v:1, files:{name:sha1}, packSha1}`) names every file in it: the timeline
(`timeline.json`), the lyrics and style text, the track's mp3, the picked
direction, `story.json`, and `hero.html` when Board B had one. Read them all.
The pack is your ONLY input: no other file of the repo, no web asset, no
generated image or video.

## Hard rules

- **Never write inside the pack.** Hash it before and after; a changed
  `packSha1` voids your run.
- **Your own directory only:** `<dir>/music-clip/bakeoff/<stack>/`. Installs,
  scratch frames, project files and outputs all live there (or in a temp dir you
  remove). Never install into the repo's `package.json`.
- **The frame is a pure function of t** on the track clock - same t, same pixels,
  in any order, from a cold start (video-assembly/seek-stable-composition-authoring).
  No `Date.now`, `Math.random` (seeded PRNG only), rAF state, running CSS
  animations, timers, network. Whatever the stack's own idiom, a frame rendered
  alone must equal the same frame rendered in sequence.
- **Flash limit: <= 3 flashes per second**, counted over every section before
  rendering it.
- **Output:** 1920x1080 @ 30 fps, h264 `yuv420p`, with the pack's mp3 muxed
  **untouched** (`-c:a copy`; no normalisation, no re-encode, no trim). Video
  length = track length to the frame. (`lib/musicVideoExport.ts`
  `muxFrameSequence` applies a loudness gain: do not use it for the mux.)
- **Lyrics:** every word shown comes from the pack's lyrics text, placed on the
  timeline's line times (`lyrics[].startS/endS`). A `section-only` line is set
  as a held block over its section, never synced word by word.
- **Cuts** land on `beats` (downbeats and bars), at the story's `cutsPerBar`
  per section (music-video-production/cut-rate-follows-the-section). Onsets are
  texture, never cuts.
- **Build for editability.** The edit round (SCORING.md) has a fresh agent
  change your build three times. Make it data-driven: one config per section
  (cutsPerBar, intensity scalars, type face and colour, cut times expressed as
  (section, bar, beat)), the timeline read at runtime, no section's numbers
  hard-coded inside drawing code.
- Never push, never commit, never touch files outside your directory.

## Per stack

- **kernel**: your own `render(t)` page, captured with the repo's headless
  kernel: `lib/export/headless.ts` (`launchHeadless`, `makeWorkDir`,
  `withEncoderFallback`) and `lib/musicVideoExport.ts` `captureFrameSequence`
  (it calls `window.renderFrameAt(i)` and expects a PNG data URL back). Mux
  yourself with ffmpeg as above.
- **hyperframes**: install it under your directory; its own render path.
- **remotion**: Remotion (or Revideo) under your directory; its own render path.

## The order of work

1. **Proof** (~25 s): a chorus including a section transition and at least two
   lyric lines. Render it, look at frames at the transition and on a lyric line,
   fix. `proofMp4`.
2. **Full clip**: the whole track. `fullMp4`. Time it: `renderSeconds` (wall
   time of the full render, capture + encode) and `framesPerSecond`
   (frames / renderSeconds).
3. Check the mux: `ffprobe` shows 1920x1080, 30 fps, yuv420p, and the audio
   stream is mp3 with the pack's duration.

## result.json (exact schema; omit a key you do not know, never null)

`<dir>/music-clip/bakeoff/<stack>/result.json`:

```json
{
  "v": 1,
  "stack": "kernel",
  "proofMp4": "proof.mp4",
  "fullMp4": "full.mp4",
  "renderSeconds": 1234.5,
  "framesPerSecond": 6.1,
  "notes": "..."
}
```

Paths are relative to your directory. `editRound` is written later, by the edit
round, not by you:
`editRound: [{ "request": "R1", "minutes": 7, "filesChanged": 2, "linesChanged": 14, "ok": true }]`.

## Report (in `notes`, and in your final reply)

- Install friction on this box (Windows ARM64, node 24): what failed, what you
  worked around, minutes spent installing.
- Blockers you hit and whether they are fixed or worked around.
- Render speed: fps for proof and full; where the time goes (capture vs encode).
- Where the per-section config lives, so the edit round can find it.
- The stack's license as it applies to this operator.
