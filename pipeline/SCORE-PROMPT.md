<!--
  SCORE-PROMPT — read per call by lib/sound/scorePropose.ts `buildScorePrompt` / `proposeScoreSpec`.
  One required slot: {{IDEA}}, the operator's words (1..400 characters, trimmed).

  Every schema bound and every A0 catalog instrument in @gt/domain/audio.score.ts is written out
  below. pipeline/score-regression.mts (`npm run check:score`) reads the bounds and catalog
  OFF THE SCHEMA, fails when any bound or instrument here drifts, parses every worked example
  through `parseScoreSpec`, compiles each example's MIDI to verify exact tempo and sample length,
  and runs stub-agent refusal cases offline with zero model calls.
-->

<!-- section: shared -->
You design a deterministic local music score (`ScoreSpec`, one stem per track, up to 8 tracks) for the Local Band engine (`box.render`, `$0` local VST3 + sample pack renderer).

Answer with ONE JSON object and nothing else - no prose, no code fence, no comment.

The object has `v` (`v` is always 1) and the exact keys below - no other keys, every required key present, every number inside its range (inclusive):

- `v` - `1`
- `title` - `1..120` characters
- `style` - one of `chill-hiphop`, `calm-bed`, `synthwave-pulse`, `warm-acoustic`
- `seed` - integer `0..2147483647`
- `tempoBpm` - `40..220`
- `key` - one of `C major`, `G major`, `D major`, `F major`, `Bb major`, `Eb major`, `A minor`, `E minor`, `D minor`, `C minor`, `G minor`, `F# minor`
- `loop` - boolean (`true` for bar-aligned loop seam, `false` for multi-section cue with tail fade)
- `controls` - closed object with `density` 0..1, `brightness` 0..1, `lift` 0..1, `swing` 0..0.5, `humanise` 0..1
- `sections` - `sections` holds 1..8 sections, each with `name` 1..40 chars, `bars` 1..32, `energy` 0..1, optional `progression` of 1..8 scale degrees in 0..6, and total bars in 2..64
- `tracks` - `tracks` holds 1..8 tracks, each with `role` from `drums`, `percussion`, `bass`, `chords`, `pad`, `lead`, `texture`, `instrument` from the ready catalog for that role, optional `id`, optional `enters`, optional `gainDb` -24..12, optional `pan` -1..1, optional `pattern` 1..40 chars, optional `fx`, and optional `notes` (0..512 items, each with `bar` 1..64, `beat` 0..3.99, `durationBeats` 0.1..16, `midi` 12..108, `velocity` 1..127)

Tracks:
- A track's `id` is 1..24 lower-case letters, digits or dashes, unique across the tracks; without one, the track is known by its role. A role may appear twice (two leads) only when EVERY track of that role has an `id`.
- `enters` holds one boolean per section (the same count as `sections`): `true` where the track plays, `false` where it rests. Leave it out for a track that plays everywhere (never write it all `true`); a track must play somewhere.
- Which catalog roles each track role plays: `drums` <- `drums`; `percussion` <- `drums`; `bass` <- `bass`; `chords` <- `chords`; `pad` <- `chords`; `lead` <- `lead`; `texture` <- `lead` or `chords`.

<!-- section: music -->
A0 measured instrument catalog (pick only `ready` instruments whose catalog role the track's `role` plays; `refused` entries are rejected at the door):

- `kit-808-warm` - role `drums`, engine `sample-pack`, pitchRange 35..81 (Deep sub kick, crisp snare, warm vinyl hats)
- `kit-909-pulse` - role `drums`, engine `sample-pack`, pitchRange 35..81 (Punchy electronic kick, snappy clap, bright hats)
- `kit-acoustic-brush` - role `drums`, engine `sample-pack`, pitchRange 35..81 (Gentle acoustic kick, soft rimshot, brushed hats)
- `vital-sub-bass` - role `bass`, engine `vital-vst3`, pitchRange 24..60 (Deep, smooth low-end anchor from Vital synth)
- `sample-mamas-bass` - role `bass`, engine `sample-pack`, pitchRange 24..64 (Warm sampled bass guitar with natural pluck)
- `vital-pulse-bass` - role `bass`, engine `vital-vst3`, pitchRange 24..64 (Rhythmic synth bass with warm filter sweep)
- `sample-felt-piano` - role `chords`, engine `sample-pack`, pitchRange 36..88 (Intimate upright home piano with soft felt hammers)
- `vital-warm-pad` - role `chords`, engine `vital-vst3`, pitchRange 36..84 (Floating stereo synth pad that fills the room)
- `sample-lofi-keys` - role `chords`, engine `sample-pack`, pitchRange 36..84 (Warm vintage electric piano with gentle warble)
- `sample-grand-piano` - role `chords`, engine `sample-pack`, pitchRange 28..96 (Clear acoustic grand piano across full range)
- `vital-pluck-lead` - role `lead`, engine `vital-vst3`, pitchRange 48..96 (Crisp, bell-like synth pluck for clear melodies)
- `sample-ikembe-bell` - role `lead`, engine `sample-pack`, pitchRange 48..88 (Organic metallic thumb piano with woody resonance)
- `sample-mallet-guitar` - role `lead`, engine `sample-pack`, pitchRange 40..84 (Muted plucked acoustic guitar with soft decay)
- `vital-glass-lead` - role `lead`, engine `vital-vst3`, pitchRange 48..96 (Smooth, breathy synth melody that sits gently)
- `minigrand-vst3` - role `chords`, refused (`instrument render is silent (note-on C4 vel 100 measured null LUFS)`)
- `hybrid-vst3` - role `lead`, refused (`cold load 77.6 s exceeds 5.0 s ceiling and licence note is empty`)

Harmony and mix rules:
- Every explicit note on a pitched track (any track not played by a `drums` kit) MUST belong to the declared `key` scale and stay inside the instrument's `pitchRange`. The door refuses any out-of-key note with the bar and track path.
- Keep `drums` and `bass` centred (`pan: 0`); spread two tracks of one role apart with `pan`. When a piece has 2 or more sections (`intro` -> `lift` -> `outro`) and `loop: false`, give `lift` at least `+0.40` higher `energy` than `intro` so the arrangement clears `section-boundary` triage.

Worked examples - a brief, then the answer for it:

Chill hip-hop loop at 84 bpm in A minor with warm keys and thumb bell:

```json
{"v":1,"title":"Midnight Study Loop","style":"chill-hiphop","seed":108,"tempoBpm":84,"key":"A minor","loop":false,"controls":{"density":0.55,"brightness":0.45,"lift":0.68,"swing":0.16,"humanise":0.35},"sections":[{"name":"intro","bars":2,"energy":0.35,"progression":[0,5,3,4]},{"name":"lift","bars":4,"energy":0.82,"progression":[0,5,2,6]},{"name":"outro","bars":2,"energy":0.38,"progression":[0,3,4,0]}],"tracks":[{"role":"drums","instrument":"kit-808-warm","gainDb":-1.5,"pan":0,"pattern":"boom-bap"},{"role":"bass","instrument":"vital-sub-bass","gainDb":-2.5,"pan":0,"pattern":"root-fifth"},{"role":"chords","instrument":"sample-lofi-keys","gainDb":-3,"pan":-0.12,"pattern":"warm-voicing"},{"role":"lead","instrument":"sample-ikembe-bell","gainDb":-3.5,"pan":0.15,"pattern":"call-response","notes":[{"bar":1,"beat":0.5,"durationBeats":0.75,"midi":69,"velocity":84},{"bar":3,"beat":0,"durationBeats":1,"midi":72,"velocity":92},{"bar":5,"beat":1.5,"durationBeats":1,"midi":76,"velocity":94},{"bar":7,"beat":0,"durationBeats":1.5,"midi":69,"velocity":82}]}]}
```

Calm narrative bed at 92 bpm in C major with felt piano and gentle lift in the middle:

```json
{"v":1,"title":"Quiet Horizon Bed","style":"calm-bed","seed":42,"tempoBpm":92,"key":"C major","loop":false,"controls":{"density":0.42,"brightness":0.4,"lift":0.72,"swing":0.04,"humanise":0.4},"sections":[{"name":"settled","bars":2,"energy":0.32,"progression":[0,4,5,3]},{"name":"gentle-lift","bars":4,"energy":0.8,"progression":[3,0,4,5]},{"name":"resolve","bars":2,"energy":0.3,"progression":[0,3,0,0]}],"tracks":[{"role":"drums","instrument":"kit-acoustic-brush","gainDb":-3,"pan":0,"pattern":"gentle-pulse"},{"role":"bass","instrument":"sample-mamas-bass","gainDb":-2.5,"pan":0,"pattern":"warm-anchor"},{"role":"chords","instrument":"sample-felt-piano","gainDb":-2,"pan":-0.08,"pattern":"arpeggio-bed"},{"role":"lead","instrument":"vital-glass-lead","gainDb":-4,"pan":0.1,"pattern":"sparse-motif","notes":[{"bar":2,"beat":0,"durationBeats":1.5,"midi":72,"velocity":78},{"bar":4,"beat":1,"durationBeats":1.5,"midi":76,"velocity":88},{"bar":6,"beat":0,"durationBeats":1.5,"midi":79,"velocity":90},{"bar":8,"beat":0,"durationBeats":2,"midi":72,"velocity":76}]}]}
```

Punchy synthwave pulse at 112 bpm in D minor with 909 drums and Vital synth pluck:

```json
{"v":1,"title":"Neon Grid Runner","style":"synthwave-pulse","seed":777,"tempoBpm":112,"key":"D minor","loop":false,"controls":{"density":0.72,"brightness":0.7,"lift":0.82,"swing":0,"humanise":0.15},"sections":[{"name":"pulse-in","bars":2,"energy":0.4,"progression":[0,5,6,4]},{"name":"full-drive","bars":4,"energy":0.9,"progression":[0,5,3,6]},{"name":"tail","bars":2,"energy":0.38,"progression":[0,4,0,0]}],"tracks":[{"role":"drums","instrument":"kit-909-pulse","gainDb":-1,"pan":0,"pattern":"four-floor"},{"role":"bass","instrument":"vital-pulse-bass","gainDb":-1.8,"pan":0,"pattern":"eighth-drive"},{"role":"chords","instrument":"vital-warm-pad","gainDb":-3.2,"pan":-0.1,"pattern":"wide-pad"},{"role":"lead","instrument":"vital-pluck-lead","gainDb":-2.8,"pan":0.12,"pattern":"arp-lead","notes":[{"bar":1,"beat":0,"durationBeats":0.5,"midi":62,"velocity":90},{"bar":3,"beat":0,"durationBeats":0.75,"midi":69,"velocity":98},{"bar":5,"beat":1,"durationBeats":0.75,"midi":74,"velocity":100},{"bar":7,"beat":0,"durationBeats":1,"midi":65,"velocity":88}]}]}
```

Warm acoustic sketch at 104 bpm in G major with grand piano and mallet guitar:

```json
{"v":1,"title":"Morning Workshop","style":"warm-acoustic","seed":204,"tempoBpm":104,"key":"G major","loop":false,"controls":{"density":0.5,"brightness":0.55,"lift":0.65,"swing":0.08,"humanise":0.45},"sections":[{"name":"opening","bars":2,"energy":0.35,"progression":[0,3,4,0]},{"name":"chorus-lift","bars":4,"energy":0.82,"progression":[4,5,3,0]},{"name":"outro","bars":2,"energy":0.34,"progression":[3,4,0,0]}],"tracks":[{"role":"drums","instrument":"kit-acoustic-brush","gainDb":-2,"pan":0,"pattern":"studio-groove"},{"role":"bass","instrument":"sample-mamas-bass","gainDb":-2.2,"pan":0,"pattern":"walking-root"},{"role":"chords","instrument":"sample-grand-piano","gainDb":-2.4,"pan":-0.1,"pattern":"open-chords"},{"role":"lead","instrument":"sample-mallet-guitar","gainDb":-2.6,"pan":0.14,"pattern":"plucked-hook","notes":[{"bar":1,"beat":1,"durationBeats":1,"midi":67,"velocity":84},{"bar":3,"beat":0,"durationBeats":1,"midi":71,"velocity":92},{"bar":5,"beat":2,"durationBeats":1,"midi":74,"velocity":94},{"bar":7,"beat":0,"durationBeats":1.5,"midi":67,"velocity":82}]}]}
```

The full band: the same groove for eight tracks, two leads told apart by id, a pad, percussion and a texture, parts resting in some sections:

```json
{"v":1,"title":"Midnight Study, Full Band","style":"chill-hiphop","seed":108,"tempoBpm":84,"key":"A minor","loop":false,"controls":{"density":0.55,"brightness":0.45,"lift":0.7,"swing":0.18,"humanise":0.35},"sections":[{"name":"intro","bars":2,"energy":0.35,"progression":[0,5,3,4]},{"name":"lift","bars":4,"energy":0.85,"progression":[0,5,2,6]},{"name":"outro","bars":2,"energy":0.4,"progression":[0,3,4,0]}],"tracks":[{"role":"drums","instrument":"kit-808-warm","pattern":"boom-bap","enters":[false,true,true]},{"role":"percussion","instrument":"kit-909-pulse","pan":0.2,"enters":[false,true,false]},{"role":"bass","instrument":"vital-sub-bass","pattern":"root-fifth"},{"role":"chords","instrument":"sample-lofi-keys","gainDb":-3,"pan":-0.1,"pattern":"warm-voicing"},{"role":"pad","instrument":"vital-warm-pad","gainDb":-6,"enters":[true,true,false]},{"role":"lead","id":"lead-bell","instrument":"sample-ikembe-bell","gainDb":-3.5,"pan":0.15,"pattern":"call-response"},{"role":"lead","id":"lead-guitar","instrument":"sample-mallet-guitar","gainDb":-4,"pan":-0.2,"enters":[false,true,true]},{"role":"texture","instrument":"vital-glass-lead","gainDb":-9,"enters":[true,false,true]}]}
```

The score brief to design:

{{IDEA}}
