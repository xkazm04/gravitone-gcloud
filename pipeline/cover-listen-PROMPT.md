<!--
  COVER-LISTEN-PROMPT - read per call by lib/sound/cover/brief/listen.ts `coverListenPrompt` (turn `suno-listen`,
  cover brief WP-A). The audio of ONE uploaded song rides beside this text as an inline audio part; the same prompt is
  sent three times, one read per call. One slot: {{DURATION_S}}, the song's length as the upload measured it. Comments
  are stripped before sending (line ends normalised first); everything else is sent.

  THIS PROMPT NAMES NO GENRE, and must not. docs/concepts/track-mirror-2026-11-07.md "Round 1 failed on genre": asked
  for a ranking, three reads put slowcore or post-rock first; asked yes or no about boom-bap, the same model and file
  said yes three times. A listener follows its question, so the question offers nothing to agree with. The measured
  tempo and key are not given either: the writer compares the reads with the measurements, and a read handed the
  answer agrees with it.

  The answer is held to lib/sound/cover/brief/listen.ts `coverReadSchema` (model and at are set by code) and refused -
  with the path of the first bad field - never repaired.
-->

You are listening to one finished song. The audio is attached. It lasts {{DURATION_S}} seconds. Describe what you actually hear in the recording, in plain musical words. Your description is one of three independent reads of the same song; where the reads disagree, the disagreement itself is useful, so describe what you hear rather than what a song like this usually has.

## Never name an artist or a song

Do not name any artist, band, producer, composer, label or song - not as a comparison, not as "in the style of", not anywhere in the answer.

## Never write the words

If the song has lyrics, do not write any of them down, not a line and not a phrase. Say whether there are words, and what the voice is like; never what it says.

## Genres

`genres`: up to 6 genre names for what you hear, the most specific first and the broadest last. Use the names you would use yourself; there is no list to pick from. When the song sits between genres, name each of them. When you cannot place it, give the broadest name you are sure of, or leave the list empty.

## Mood

`mood`: up to 8 short mood or energy words.

## Instruments, drums and bass

`instruments`: up to 16, each `{name, role}`. `name` is what is playing, named for its source where you can tell it ("upright piano", "sampled string section", "detuned synth lead"). `role` is what it does in the song ("carries the melody", "pads under the verse"). List only what you hear; a sound you cannot place is named for what it sounds like, with role "uncertain".

`drums`: one or two sentences on the drums: acoustic, programmed or sampled, the pattern and feel, where they enter and leave. Empty when there are none.

`bass`: one or two sentences on the bass: what makes it, how low it sits, what it plays. Empty when there is none.

## Voice

`voice.present` is true only when you hear a human or human-like voice, singing or speaking, wordless included. When present, `voice.kind` says in a few words what it is (register, texture, delivery), and `voice.words` is `words` when it carries words, `wordless` when it does not. When absent, `voice.words` is `none`. When you are not sure whether a sound is a voice, set `present` to what you most believe and write "uncertain" in `kind`.

## Production and energy

`production`: up to 10 short phrases on how it is recorded and mixed (the space, the top end, saturation, noise, width, loudness).

`energyArc`: two or three sentences on how the energy moves from start to end, with rough times in seconds.

## When you are not sure

Say "uncertain" rather than invent. A short honest read is worth more than a long wrong one.

## Answer

Answer with ONE JSON object and nothing else - no prose, no code fence. Its keys are exactly `genres`, `mood`, `instruments`, `drums`, `bass`, `voice`, `production`, `energyArc`. Do not add `model`, `at` or any other key. The shape, with the values left for you:

```json
{"genres": ["<most specific>", "<broader>"], "mood": ["<word>"],
 "instruments": [{"name": "<what plays>", "role": "<what it does>"}],
 "drums": "<sentence>", "bass": "<sentence>",
 "voice": {"present": true, "kind": "<few words>", "words": "wordless"},
 "production": ["<phrase>"], "energyArc": "<sentences with times>"}
```
