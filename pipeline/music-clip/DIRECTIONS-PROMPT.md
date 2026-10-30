# Board A - writing the directions

You are writing `<dir>/music-clip/directions.json` and one mood-board fragment per
direction, `<dir>/music-clip/board-a/<id>.html`, for ONE track. `board a` validates
both and assembles `board-a.html` + `board-a-sheet.png`. Read before writing:

- `<dir>/music-clip/timeline.json` - sections (label, startS, endS, intensity,
  cutsPerBar, lyricTag), tempo.bpmGlobal, lyrics (text, section, confidence),
  voice (kind, `confirmed:false`), warnings.
- the folder's lyrics and style text.

## What a direction is

A direction is a treatment for the whole track, not a mood. Ground every one in
this track's map: name the sections it plays on and the intensity that earns the
move ("chorus s05, intensity 0.86: hard cut per bar"; "bridge s08, synthetic
voice: strip to type alone"). A direction that would fit any song is rejected.

Span the form ladder (music-video-production/form-follows-what-the-track-gives):
**visualizer**, **lyric video**, **concept**, **hybrid**. Performance and
narrative need a singing face or characters this pipeline cannot keep in sync,
so they appear only as a hybrid with no readable mouth. At least one direction
per rung that the track gives; say the rung in `animation`.

Vary three axes across the set: animation style, colour, story theme.

## Distinctness (board a does not check this; you do)

- No two directions share BOTH the same animation style AND the same palette.
- No two directions tell the same story with a recolour.
- Up to 10 directions (`MAX_DIRECTIONS`). Six strong ones beat ten near-copies.

## Safety

A direction that strobes, flashes or pulses brightness on the beat states its rate
in `risk`, and the rate is **<= 3 flashes per second**
(music-video-production/cut-rate-follows-the-section: the flash ceiling). At
bpmGlobal 125 a beat is 2.08 changes/s and an eighth note 4.17: beat-rate flashes
pass, eighth-note flashes do not.

## directions.json (exact keys, every field non-empty)

```json
{
  "v": 1,
  "directions": [
    {
      "id": "kebab-case-id",
      "name": "Two to four words",
      "animation": "rung + motion grammar, e.g. 'lyric video: kinetic type slammed on downbeats, held through verses'",
      "palette": ["#0b0d10", "#e8e4dc", "#ff3b1f"],
      "type": "family stack and treatment, e.g. 'Impact, Arial Black; all caps, tracked +40'",
      "story": "one line: what the picture is about, section by section",
      "transitions": ["hard cut on downbeat", "smash to white (<=2/s)"],
      "risk": "the one way this direction most likely fails on this track"
    }
  ]
}
```

- `id`: unique, kebab-case; it is what the operator quotes back (`pick a:<id>`).
- `palette`: 3-6 entries, each `#rrggbb`. First entry is the ground.
- `transitions`: the named transition vocabulary, 2-5 entries, each tied to a
  grid level (phrase, bar, downbeat, beat) - never "on every hit".
- No `null`, no empty strings, no extra keys.

## The fragment `board-a/<id>.html`

A self-contained card that renders at **480x270**:

- HTML + CSS + inline SVG only. No network (no `src`/`href` to anything outside
  the file), no web fonts (system stacks only), no script needed to render.
- Must show: palette swatches (every palette entry, with its hex); a type specimen
  of the track title and ONE lyric line from timeline.json, set in the direction's
  type; the story line; the transition vocabulary by name; the risk.
- Work text only: names, hexes, lyric words, the story, the risk. No sentence
  about the card, the board, or how to choose.
- Root element sized `width:480px;height:270px;overflow:hidden`. Body margin 0.
- Text at least 12 px; the title specimen at least 28 px.

A direction with no fragment gets a default swatch card. That is a fallback, not a
plan: write all of them.

## Then

Run `board a`, OPEN `board-a-sheet.png` and look. Fix any card that is blank,
clipped, overflowing, illegible (low contrast on its own ground), or a near-copy
of another, then run `board a` again.
