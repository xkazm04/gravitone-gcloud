<!--
  COVER-BRIEF-PROMPT - read per call by lib/sound/cover/brief/write.ts `briefPromptText` (agent turn `cover-brief`,
  cover brief WP-A), run on the seat by lib/producers/coverBriefActs.ts in an isolated workspace with Read and Write
  only. Slots: {{DURATION_S}} the song's length as uploaded; {{STYLE_MAX}} the style cap (@gt/domain/cover
  COVER_STYLE_MAX); {{SECTION_MAX_S}} and {{SECTION_MIN_S}} the section limits. Comments are stripped before sending.

  The answer, out/brief.json, passes @gt/producers/cover-brief/define parseBriefAnswer or the job fails with the door's
  sentence. The door holds the section limits and replaces the section of a song that fits whole; the genre rule (two
  of three reads) is this prompt's alone.

  Why the rules: docs/concepts/track-mirror-2026-11-07.md. Round 1 briefed the genre three reads agreed on, and it was
  the wrong one; round 2's closest takes came from comma tags naming sources (Y14, Y17). The style form below is theirs.
-->

You are writing the brief for a cover: one uploaded song, {{DURATION_S}} seconds long, re-rendered in five takes by a music model (YuE2) that keeps the song's melody and chords from a transcribed score and takes everything else - genre, instruments, production - from a style line you write. Your brief is shown to the song's owner beside the style as a hypothesis they will judge by ear.

## What you have

- `inputs/measure.json` - measurements of the song by librosa: tempo (`tempo.bpm`, with half and double), key (`key.key` with its `strength`), a chord guess per bar, `sections` with `start` and `end` in seconds and each section's loudness (`rms_db`), brightness (`centroid_hz`) and band shares, a 2 s energy curve, the spectral rolloff (`rolloff_hz`, the top end) and the overall band shares (`sub`, `bass`, `low_mid`, `high_mid`, `air`).
- `inputs/listen-1.json`, `inputs/listen-2.json`, `inputs/listen-3.json` - three independent reads of the song by an audio model, each from the same open question: genres (most specific first), mood, instruments with role, drums, bass, voice, production and energy arc. A read is a hypothesis. Audio models over-hear instruments, mishear voices, and agree with each other more often than they are right.

Read all four files before you write.

## Genre: only where two of three reads agree

Use a genre word in the style only when at least two of the three reads name that genre, or a plainly equivalent name for it, anywhere in their `genres`. Prefer the most specific genre two reads share. `agreed` is how many of the three reads named the genre you used (2 or 3). When no two reads share a genre, use no genre word at all: describe what was measured and what at least two reads heard (instruments, drums, bass, production, tempo, key) in the most neutral words, set `agreed` to 0, and say so in `why`. Never let the measurements pick a genre: tempo, form, chords and band shares fit many genres alike.

## The style

`style` is the line the five takes are rendered with, at most {{STYLE_MAX}} characters, as comma-separated tags in this order: genre (if any), `instrumental` when no read heard a voice carrying words, mood, then the instruments and production, then the tempo and key. Two lines that measured best on an earlier song, for the form only:

`<genre>, instrumental, melancholic, nostalgic, acoustic guitar, vinyl crackle, boom-bap drums, sub bass, tape saturation, rainy night`
`<genre>, instrumental, melancholic, nostalgic, clean electric guitar with vibrato, vinyl crackle, boom-bap drums, sub bass, tape saturation, rainy night`

- Name the source of a sound, not an adjective about it: "808 sub bass", not "huge low end"; "brushed snare", not "soft drums". Take instruments from what at least two reads heard, or from one read when the measurements back it (a sub-bass share, a dark top end).
- When the top end is dark (`rolloff_hz` low, little `air`), say so as a production tag ("dark top end", "rolled-off highs").
- Add the tempo as `<n> BPM` (rounded) and the key (for example `B minor`) when the measurements give them; when `key.strength` is low, leave the key out.
- No artist, band or song names. No words from the song's lyrics.

## The source style

`sourceStyle` is the same facts written as a description of the uploaded song itself, in one or two plain sentences, at most {{STYLE_MAX}} characters, with the same genre rule. It is how the owner will recognise the song they uploaded.

## The section

`section` is `{startS, endS}` in seconds, the part of the song the cover renders.

- When the song is at most {{SECTION_MAX_S}} seconds, it is the whole song: `{"startS": 0, "endS": {{DURATION_S}}}`.
- Otherwise it is one stretch of at most {{SECTION_MAX_S}} seconds that holds the song's main sections - the ones with the most energy and the most change - starting and ending on measured section boundaries (`sections[].start` / `end`) where you can.
- Never shorter than {{SECTION_MIN_S}} seconds.

## The lyrics

`lyrics` is always the empty string `""`. The cover derives its section tags from the score. Never write the song's words, even when a read heard them.

## Why

`why` is one short paragraph: the evidence for the genre (which reads named it, or that none agreed) and for the section, with the figures you used. At most 2000 characters.

## Answer

Write ONE file, `out/brief.json`, holding one JSON object with exactly these keys and nothing else:

```json
{"style": "...", "sourceStyle": "...", "section": {"startS": 0, "endS": 0}, "lyrics": "", "why": "...", "agreed": 2}
```

Write nothing else to `out/`. When the file is written, answer with the single word `done`.
