# Reel sound: ten lofi hip hop beds

Music beds for `/reel`, made with Suno. A reel has no narrator, so the bed has one job: keep a calm pulse
under a moving chart without ever asking for attention. Ten directions follow, each a `style` string for one
Suno create. None has been generated or listened to yet: these are prompts, and which of them is a stable
direction is the operator's ear to decide.

## How a bed is made and attached

- **The whole track plays.** A bed is made at the cut's length and the cut is then planned to the track's real
  length, so nothing is trimmed, looped or faded mid-phrase. Short: `duration` 60. Long: `duration` 240.
- **One create returns two songs**, charged to the account's credits. Ten prompts at one length is twenty
  songs. Say the spend and get a yes before a batch.
- The call, through the Suno MCP `audio-create`:

  ```json
  { "instrumental": true, "duration": 60, "title": "Reel bed 01 - dusty keys",
    "style": "<the style string below>" }
  ```

  `instrumental: true` with a `style` and no `lyrics` is custom mode with no vocal. `duration` is a target the
  clip will not exceed; most end naturally a few seconds under it. `negative_style` needs a plan with advanced
  controls (403 without it), so each style below also says what to leave out in its own words.
- Attach a downloaded track before planning, then plan, brief and cut as usual:

  ```bash
  npx tsx pipeline/reel.mts track <folder> short --file bed-01.mp3   # refuses a track outside 30-60 s
  npx tsx pipeline/reel.mts plan <folder>
  ```

  `cut` lays the bed under the picture as `<cut>/render/final.mp4`, levelled to -14 LUFS with a 1.2 s tail fade.

## What every bed has in common

Written into each style string, because a tag list alone drifts:

- instrumental, no vocals, no vocal chops, no spoken samples;
- 70 to 90 BPM, a steady groove from the first bar (the reel's question is on screen in the first two seconds,
  so no long intro and no build);
- no drop, no breakdown, no key change: the level and the energy stay even from start to end;
- one simple melodic idea that repeats, soft enough to sit under on-screen text;
- a natural ending on the tonic, not a cut.

## The ten directions

| # | Title | `style` |
|---|---|---|
| 01 | Dusty keys | `lofi hip hop instrumental, 82 bpm, dusty boom bap drums with soft swing, warm Rhodes electric piano chords, round sub bass, light vinyl crackle, tape saturation, calm and steady, no vocals, no vocal chops, starts on the beat, even energy throughout, no drop, simple repeating melody, gentle ending` |
| 02 | Late jazz | `jazzy lofi hip hop instrumental, 78 bpm, brushed drums, upright bass walking softly, mellow jazz piano voicings, muted trumpet answering phrases far back in the mix, smoky and relaxed, no vocals, no vocal samples, steady groove from the first bar, no build, no drop, soft resolved ending` |
| 03 | Rain piano | `lofi hip hop instrumental, 72 bpm, felt upright piano playing a slow simple motif, soft rain ambience, muted kick and rimshot, deep warm bass, tape wobble, quiet and reflective, no vocals, no speech, constant level, no drop, no key change, ends on a held chord` |
| 04 | Nylon afternoon | `lofi hip hop instrumental, 80 bpm, fingerpicked nylon string guitar loop, warm tape hiss, laid back boom bap drums, soft electric bass, sunny and unhurried, no vocals, no vocal chops, starts immediately, even energy, no drop, simple repeating guitar melody, natural ending` |
| 05 | Tape pads | `chillhop lofi instrumental, 84 bpm, analog synth pads with slow filter movement, gentle side-chained pulse, clean snappy lofi drums, plucked synth melody, smooth sub bass, clear and modern, no vocals, no vocal samples, steady from the first bar, no drop, no breakdown, soft fade ending` |
| 06 | City evening | `lofi hip hop instrumental with a city pop touch, 86 bpm, clean chorus electric guitar chords, glassy electric piano, tight soft drums, melodic bass line, warm night-drive feeling, no vocals, no vocal chops, even energy, no solo, no drop, short repeating hook, resolved ending` |
| 07 | Study bell | `minimal lofi hip hop instrumental, 75 bpm, sparse kick and soft snare, long sub bass notes, kalimba and soft bell melody with lots of space, faint room noise, very calm and uncluttered, no vocals, no speech, constant quiet level, no drop, no build, ends gently` |
| 08 | Slow tape | `ambient lofi downtempo instrumental, 70 bpm, looping tape piano fragments, soft pad drones, barely there drums with brushed hats, warm low bass, hazy and still, no vocals, no vocal samples, no drop, no rhythm changes, slow steady pulse throughout, long soft ending` |
| 09 | Warm soul | `soulful lofi hip hop instrumental, 80 bpm, warm seventh chords on electric piano with vinyl texture, mellow tenor saxophone playing short quiet phrases, dusty drums, soft bass, comforting and unhurried, no vocals, no vocal chops, no sampled voices, even energy, no drop, natural ending` |
| 10 | Bossa dust | `bossa nova lofi hip hop instrumental, 82 bpm, gentle bossa rhythm on nylon guitar, soft shaker and rim clicks over a lofi kick, upright bass, light vinyl crackle, breezy and calm, no vocals, no humming, steady from the first bar, no drop, simple repeating guitar figure, soft resolved ending` |

## Listening for a stable direction

For each direction, the two songs of one create and one more create later should sound like the same room.
What to listen for under a reel, and write beside the direction once heard:

- Does anything pull the ear at a moment the chart does not: a fill, a solo, a sudden instrument?
- Is there a voice or a voice-like sample? If so the direction is out.
- Does it start in time, or is there a bar of nothing?
- Does it end, or stop?
- At phone-speaker level, is there still a pulse?

| # | Heard | Verdict | Notes |
|---|---|---|---|
| 01-10 | not yet | - | - |
