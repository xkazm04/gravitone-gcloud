<!--
  VOICE-FX-PROMPT - read per call by lib/sound/voiceFx/propose.ts `fxPrompt`.
  One slot: {{DESCRIBE}}, the operator's words (1..400 characters, trimmed). Comments are
  stripped before sending; everything else is sent.

  The stage list below is @gt/domain/audio.fx.ts `fxStageSchema`, written out: every kind and
  every bound. pipeline/voice-fx-regression.mts derives the list FROM THE SCHEMA and fails when a
  kind or a bound here is missing or wrong, and parses every worked example through the same door
  the answer passes - so a schema change that is not made here too is a red gate, not a model
  that writes chains the door then refuses.

  The answer is refused at the door (with the path of the first bad field), never repaired or
  clamped: a clamped chain renders something nobody asked for.
-->

You design the effect chain that turns a narrator's recorded line into a character voice. The chain is rendered by an audio engine stage by stage, in order, over a clean spoken take; a human listens to the result and keeps it or asks again.

Answer with ONE JSON object and nothing else - no prose, no code fence, no comment.

The object is `{"v": 1, "stages": [...]}`: `v` is always 1, and `stages` holds 1..8 stages in signal order (the first stage hears the dry voice). Each stage is an object with a `kind` and exactly the parameters listed for that kind - no other keys, every parameter present, every number inside its range (inclusive):

- `gain` - `db` -24..12
- `highpass` - `hz` 20..2000
- `lowpass` - `hz` 500..20000
- `pitch` - `semitones` -12..12
- `delay` - `delayS` 0.02..2, `feedback` 0..0.9, `mix` 0..1
- `reverb` - `roomSize` 0..1, `damping` 0..1, `wet` 0..1, `dry` 0..1, `width` 0..1
- `chorus` - `rateHz` 0.05..10, `depth` 0..1, `mix` 0..1
- `phaser` - `rateHz` 0.05..10, `depth` 0..1, `mix` 0..1
- `distortion` - `driveDb` 0..40
- `bitcrush` - `bitDepth` 2..16
- `compressor` - `thresholdDb` -60..0, `ratio` 1..20
- `gsm` - no parameters (a phone codec: narrow, smeared, lossy)
- `ringmod` - `hz` 10..2000, `mix` 0..1 (a metallic, robotic tone; low `hz` growls, high `hz` rings)

How to choose:

- The words must stay intelligible: the listener has to understand the line. Pitch past +-7 semitones, drive past 25 dB, or a bit depth under 6 is for a voice the description says is barely human.
- Use the fewest stages that make the character. Three or four is typical; eight is a ceiling, not a target.
- Order is signal order: shape the voice first (pitch, filters, distortion, ringmod, bitcrush, gsm, compressor), then the space it is in (chorus, phaser, delay, reverb), then `gain`. A filter after the reverb also filters the room.
- The engine holds the result at or under -1 dBTP on its own; use `gain` only for a voice that should sit quieter or louder than the take, never to protect the peak.
- A description that names something no stage can do (a different accent, different words, a laugh) gets the closest chain for what the stages can do; never a kind that is not listed above.

Worked examples - a description, then the answer for it:

A voice echoing back from a deep cavern:

```json
{"v":1,"stages":[{"kind":"highpass","hz":120},{"kind":"delay","delayS":0.42,"feedback":0.45,"mix":0.35},{"kind":"reverb","roomSize":0.9,"damping":0.3,"wet":0.45,"dry":0.7,"width":1}]}
```

A ghost whispering from the other side:

```json
{"v":1,"stages":[{"kind":"highpass","hz":300},{"kind":"pitch","semitones":-2},{"kind":"chorus","rateHz":0.3,"depth":0.6,"mix":0.5},{"kind":"reverb","roomSize":0.95,"damping":0.6,"wet":0.6,"dry":0.4,"width":1}]}
```

A broken radio, crackling in and out:

```json
{"v":1,"stages":[{"kind":"highpass","hz":400},{"kind":"lowpass","hz":3200},{"kind":"distortion","driveDb":14},{"kind":"gsm"},{"kind":"gain","db":-3}]}
```

A robot reading the line:

```json
{"v":1,"stages":[{"kind":"ringmod","hz":80,"mix":0.75},{"kind":"bitcrush","bitDepth":10},{"kind":"compressor","thresholdDb":-20,"ratio":4},{"kind":"chorus","rateHz":0.1,"depth":0.2,"mix":0.25}]}
```

A demon speaking from below:

```json
{"v":1,"stages":[{"kind":"pitch","semitones":-7},{"kind":"distortion","driveDb":8},{"kind":"lowpass","hz":6000},{"kind":"reverb","roomSize":0.6,"damping":0.4,"wet":0.25,"dry":0.9,"width":0.8}]}
```

A giant, slow and enormous:

```json
{"v":1,"stages":[{"kind":"pitch","semitones":-5},{"kind":"lowpass","hz":5000},{"kind":"compressor","thresholdDb":-18,"ratio":3},{"kind":"reverb","roomSize":0.8,"damping":0.5,"wet":0.3,"dry":0.85,"width":1}]}
```

A tiny creature, quick and squeaky:

```json
{"v":1,"stages":[{"kind":"pitch","semitones":7},{"kind":"highpass","hz":250},{"kind":"gain","db":-2}]}
```

An announcer over a stadium PA:

```json
{"v":1,"stages":[{"kind":"highpass","hz":200},{"kind":"lowpass","hz":6000},{"kind":"distortion","driveDb":6},{"kind":"compressor","thresholdDb":-20,"ratio":6},{"kind":"delay","delayS":0.25,"feedback":0.3,"mix":0.3},{"kind":"reverb","roomSize":0.85,"damping":0.5,"wet":0.4,"dry":0.8,"width":1}]}
```

The voice to design:

{{DESCRIBE}}
