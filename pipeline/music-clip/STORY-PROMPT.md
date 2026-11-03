# Board B - writing the story and the hero loop

The operator picked a direction (`state.json` `picks.a`). You are writing
`<dir>/music-clip/story.json` and `<dir>/music-clip/board-b/hero.html`. `board b`
validates the story, lints the hero for frame purity, embeds it with the story
strip in `board-b.html`, and shoots `board-b-sheet.png` at three times of the hero
(start, mid, end), rendered cold and out of order. Read before writing:
`timeline.json`, `directions.json` (the picked entry), the lyrics and style text.

## story.json (exact keys)

```json
{
  "v": 1,
  "direction": "<the picked direction id>",
  "sections": [
    { "id": "s01", "title": "Cold pulse", "beat": "bar 1-8: ...", "visual": "...", "cutsPerBar": 0.25 }
  ],
  "hero": { "sectionId": "s05", "startS": 61.2, "endS": 68.9 }
}
```

- `sections`: one entry per timeline section, same `id`s, in track order.
- `beat`: what happens, addressed as **(section, bar, beat)** - "bar 3 beat 1:
  the door seals" - never raw seconds
  (music-video-production/track-map-before-treatment). Bars and beats are the
  timeline's `beats[].bar` / `beats[].beat`.
- `visual`: what is on screen; the direction's palette and type, by name.
- `cutsPerBar`: start from the timeline section's `cutsPerBar`
  (music-video-production/cut-rate-follows-the-section). Change it only with a
  reason written into `beat`. Above 1, keep the subject in one screen region
  across the cuts.
- `hero`: 4-8 s inside the track, on the section that carries the direction
  hardest - usually a chorus, including a downbeat and at least one lyric line.
  Start and end on downbeats (`beats[].downbeat`) so the loop seam sits on the grid.

## The hero.html contract

```js
window.render = function (t) { /* t = seconds on the TRACK clock */ };
// window.__TIMELINE__ is injected by the shell before render is called:
// the slice of timeline.json between hero.startS - 1 and hero.endS + 1 s:
// beats, bands, onsets, lyrics.
```

- `render(t)` draws the frame completely and is a **pure function of t**: same t,
  same pixels, whatever was rendered before, in any order
  (video-assembly/seek-stable-composition-authoring). The sheet renders it cold
  and out of order; three identical frames is a defect.
- Banned (the lint rejects them): `Date.now`, `performance.now`, `new Date()`,
  `Math.random`, `requestAnimationFrame`, `setTimeout`, `setInterval`, running
  CSS animations or transitions. Randomness = a seeded PRNG (mulberry32, constant
  seed) re-seeded inside each call. Particles are closed-form in t or
  re-simulated from the seed up to t on every call. Never animate from the
  current value: every property has explicit endpoints.
- No network: no `fetch`, no external `src`/`href`. Fonts are system stacks or
  inline `@font-face` with `local()`. No WebGL (headless Chromium runs with the
  GPU off): canvas 2D, SVG, DOM or CSS 3D.
- Draw frame `hero.startS` on load, so the file opened alone shows something.
- 1920x1080 layout, scaled by the shell; legible text >= 46 px at 1920 wide.
- **Flash limit: <= 3 flashes per second** - count hard light/dark changes and
  beat-driven brightness pulses over the hero, before writing them.

## Using `__TIMELINE__`

- `beats`: `{t, bar, beat, downbeat}` - cuts and hits land on these, not on onsets.
  Current beat = the last beat with `beat.t <= t`; phase within it =
  `(t - beat.t) / (next.t - beat.t)`.
- `bands`: `low`, `mid`, `high`, `rms` - per-frame arrays at 30 fps, 0..1. The
  slice starts at `__TIMELINE__.sliceStartS` (and ends at `sliceEndS`; `fps` is
  carried too). Index = `floor((t - sliceStartS) * fps)`, clamped. Use low for weight (shake, scale),
  high for sparkle; ease them, a raw band per frame jitters.
- `onsets`: seconds; texture only (sparks, grain kicks), never cuts.
- `lyrics`: `{text, startS, endS, confidence}`. Show a line only between its
  times. `section-only` lines carry their section's span, not a sung time:
  never sync type to a word on one; set them as a held block instead.

## Then

Run `board b`, OPEN `board-b-sheet.png` and look: three different frames, the
direction recognisable, type legible, nothing black. Fix and re-run until it holds.
