# Track mirror, stage 1: can Suno or YuE2 get close to a given track?

**Status: 2026-11-07. Machine figures only: the owner's listening verdict is the result, and it is pending.** Spark `track-mirror`, outside Gravitone. Tooling in `pipeline/track-mirror/`, audio and prompts in `foundry-out/track-mirror/<track>/` (gitignored). Stage 2, mirroring in the audio studio, follows only if a verdict says close.

**Rights.** The reference is a third party's recording. Every YuE2 take here uses the cover route, so it is a cover of that work whatever its style (registry: `reference-track-anchoring`). The owner chose this on 2026-11-07, for a test that may fail, and will settle the licence only if it succeeds. The weights are CC BY-NC as well. Nothing leaves this machine: the page is a local server, not a hosted artifact. The arms are not like for like: YuE2 gets the transcribed melody, Suno gets words only.

## Run it

```bash
node --env-file=.env.local pipeline/track-mirror/listen.mts <track>/source/x.mp3 <track>/listen.json   # Gemini words, 3 reads
$VENV -m demucs -n htdemucs -d cpu -o <track>/stems <track>/source/x-44k.wav                           # about 3 min for 82 s, emulated
$VENV -I pipeline/track-mirror/analyze.py <track>/source/x-44k.wav <track>/analysis.json --stems <dir>
python pipeline/track-mirror/transcribe.py <track>/source/x-44k.wav <track>/abc                        # takes the card's lease
python pipeline/track-mirror/render.py <track> Y01 Y02                                                 # 3 seeds each, takes the lease
node pipeline/track-mirror/server.mts <track>                                                          # http://127.0.0.1:3199/
```

`$VENV` is `C:/Users/kazda/ai/tools/track-mirror-venv/Scripts/python.exe`: x64 Python 3.12, emulated, with librosa, demucs and torch (CPU). The ARM64 Python has none of them. `compare.py` and the file names assume `source/tears.mp3` and `source/tears-44k.wav`, which a second track would have to generalise.

## The reference, by instrument

| Fact | Reading | From |
|---|---|---|
| Tempo | 99.99 BPM, 99.9-100.3 across every window | librosa; SheetSage2 `Q:1/4=100` agrees |
| Key | B minor, strength 0.23, runner-up F# minor | librosa; SheetSage2 `K:Bm` agrees |
| Harmony | Bm, A, F#m, G, two bars each | chroma templates; SheetSage2 agrees |
| Form | 8 bars of guitar and warm chords, beat and bass enter at about 19 s, flat to a fade from 76 s, 82 s in all | energy curve, Demucs stems |
| Low end | 29% of power under 60 Hz, -8.1 LUFS | STFT bands, ffmpeg |
| Top end | Dark: 95% of energy under 3.4 kHz in the intro, 4.8 kHz with the band | spectral rolloff |
| Hats | Straight eighths: offbeat at 0.45 of the beat (0.50 straight, 0.67 swung), n=53 | Demucs drum stem |
| Genre | Lo-fi hip-hop, on the owner's ear | The owner, against Gemini: see below |
| Lead | Guitar with vibrato, acoustic or electric open. The burst stem at 29-38, 48-58, 67-77 s is probably this, not a voice | 2 of 3 Gemini reads, when guitar was offered. Unsettled |

## Round 1 failed on genre, and no instrument caught it

Round 1 briefed post-rock, from three Gemini reads, and scored up to 86.7 "closeness" on the wrong genre. **The owner heard it at once.** What that showed:

- **The audio listener follows its question.** Asked for a neutral ranking, three reads put slowcore or post-rock first and lo-fi hip-hop at 8-12 of 100. Asked yes or no, the same model and the same file said boom-bap yes, swing yes, three times. A vinyl crackle question split 2-1. The owner's own Gemini answer said lo-fi. So a listener's genre is a hypothesis to put to the owner, never a finding. The same applies to the "wordless female voice" round 1 reported as settled: asked with guitar on the list, it went to guitar.
- **The figures cannot see genre.** Tempo, form, chords and bands fit post-rock and lo-fi alike. Round 1 even measured the dark top end and the sub-bass and read them as "electronic pop", with rock guitars left in every prompt.
- **Ask the owner what they hear before writing a prompt.** It costs one question. Round 1 cost 30 renders.

Round 1 is in `foundry-out/track-mirror/tears/archive/round1-postrock/`. Its findings on the score, seeds and `cfg_scale` still stand, at n=3 per arm, and closeness is not comparable between rounds: round 2 added the top end to it.

## What moved the YuE2 takes (round 2, lo-fi)

10 prompts, 3 seeds each, the same transcribed score. "Closeness" is a weighted rank of distances, for ordering one prompt's seeds. It says a take is near in numbers, not that it sounds close.

- **The score carries tempo.** All 30 takes read 100 BPM. Length 75.0-83.2 s, most at about 82. The beat entered at 19 s on 20 takes, at 38 s on 3, from the start on 3, and at 14, 18, 29 and 41 s on one each.
- **Lo-fi words reach the palette unaided.** Median sub share 29% against the reference's 29%, without naming an 808, and median top end 4.7 kHz against 4.4. Each take still varies, 1.8 to 8.7 kHz. Low mids stay thin: median 17% against 35%.
- **Lo-fi words pull against the harmony.** Chord match fell to a median 63%, from about 85% in round 1, as low as 7%. Key: 19 B minor, 6 F# minor, 5 D major. The score and the words are arguing.
- **A melody-only score made it worse:** chords 18-47%.
- **Stating B minor did not hold the key** (Y16: 2 of 3). **Lower temperature looks useful:** at 0.8 (Y20) all three seeds read B minor and entered at 19 s, with the narrowest spread, 2.4 points. n=3.
- **Measured closest:** Y17, an electric lead with vibrato, at 90.2. The same prompt's other seeds sit at 80.9 and 77.9, so this is a seed as much as a prompt.
- **Seeds spread as much as prompts.** Up to 22.1 points within one prompt. Compare prompts by ear on several seeds, or not at all.
- **Loudness stayed under the reference,** -12.5 to -17.1 LUFS against -8.1. A mastering step would decide this rather than a prompt.

## Suno v6: what is known

Official (Suno's v6 post and help pages): three models, `v6` ("reliable, precise"), `v6-wild` ("less predictable"), `v6-mini`. Variety at 0 "to retain full control of your style tags". Exclude is under Advanced Options. Max Mode is for keeping style consistent. Up to 8 minutes per generation.

Third party only: style limit 1,000 characters, tag syntax in any form, bar counts in tags, BPM or key being honoured, total length lines. Each prompt tests one of these. Suno documents no tag specification, and no source says duration can be set, so a take is compared on its opening 82 s. **`lib/sound/suno/store.ts` caps style at `STYLE_MAX = 200`, well under what v6 appears to allow. Stage 2 must check this against the composer.**

The prompts are written to be pasted with the Instrumental toggle off, because the structure sits in the Lyrics box, and whether v6 follows that is itself untested. Words cannot carry a melody (registry: `sonic-style-vocabulary`). If Suno gets close on palette and pacing without the tune, that is the more shippable result: a style mirror needs no cover licence.

## Stage-2 gate (proposed)

A tool passes on one take rated 4 or more on instruments, genre and pacing, and "close" overall, by the owner, level-matched, with figures hidden until rated. The page plays both sides at -16 LUFS and shows the count per tool.

## What stage 2 would need to decide

- A cover route needs a licence per track, and the weights are non-commercial. A style mirror needs neither of those from the reference's owner, though resemblance is judged on the output.
- The melody route and the words route are different products. The verdict says which one is worth building.
