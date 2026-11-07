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
| Form | 8 bars of clean guitar and pad, band enters at about 19 s, flat to a fade from 76 s, 82 s in all | energy curve, Demucs stems |
| Low end | 29% of power under 60 Hz, -8.1 LUFS | STFT bands, ffmpeg |
| Voice | Female, wordless, background, bursts at 29-38, 48-58, 67-77 s | Demucs stem + 2 of 2 Gemini reads of the stem. SheetSage2 left the Vocal voice empty |

**What each instrument got wrong.** All three Gemini reads of the full mix described a gradual crescendo; the energy curve is a step at 19 s and then flat. On the full mix they split on the voice: male tenor, none, female. They said post-rock, while the sub-bass measures closer to electronic pop. Listening to isolated stems settled the voice. So words come from a listener, numbers from measurement, and a stem resolves what a mix cannot.

## What moved the YuE2 takes

10 prompts, 3 seeds each, 3 small comparisons at n=3 per arm. "Closeness" is a weighted rank of distances, for ordering one prompt's seeds. It says a take is near in numbers, not that it sounds close.

- **The score carries pacing.** Across 30 takes: length 81.6-83.5 s, tempo within 0.6% of 100. The band entered at 19-20 s on 19 takes, at 38 s on 7, and at 0, 9, 26 and 34 s on one each. Key was less reliable: 23 read B minor, 4 D major (the relative major, same notes), 3 F# minor.
- **Seeds spread as much as prompts.** Within one prompt, closeness ranged by up to 16.7 points, while the prompts' best seeds sit within 75.8-86.7. A comparison at n=3 is a hint. This is the case for rendering several seeds.
- **Name the source of a sound, not its adjective.** Band wording, even "deep sub bass, huge low end", left the sub share at 4-28%, mostly under 17%. "808 sub bass, sidechained pad, programmed kick" gave 22-42%, against the reference's 29%. It costs the low mids: 7-24% against 35%. Adding "thick wall of overdriven guitars, dense warm low mids" did not bring them back (7-18%).
- **Stronger guidance did not help.** `cfg_scale` 1.2 gave no visible gain on palette, and one seed fell to F# minor, a 38 s entry and 66.7.
- **A vocal line in the score hurt the form.** With the stem's phrases in the Vocal voice, all three seeds moved the band's entry to 38 s.
- **Relabelling the score did not fix entries.** Late entries fall on the score's chorus label at 38 s, so a verse label went in at bar 9. 2 of 3 still entered at 38 s, so the hypothesis failed at this n.
- **Not settled:** temperature 0.8, and melody-only vs full score. Both are inside seed spread.
- **Loudness stayed under the reference,** -11.1 to -17.2 LUFS against -8.1, however hard the words asked. A mastering step would decide this rather than a prompt.

## Suno v6: what is known

Official (Suno's v6 post and help pages): three models, `v6` ("reliable, precise"), `v6-wild` ("less predictable"), `v6-mini`. Variety at 0 "to retain full control of your style tags". Exclude is under Advanced Options. Max Mode is for keeping style consistent. Up to 8 minutes per generation.

Third party only: style limit 1,000 characters, tag syntax in any form, bar counts in tags, BPM or key being honoured, total length lines. Each prompt tests one of these. Suno documents no tag specification, and no source says duration can be set, so a take is compared on its opening 82 s. **`lib/sound/suno/store.ts` caps style at `STYLE_MAX = 200`, well under what v6 appears to allow. Stage 2 must check this against the composer.**

Words cannot carry a melody (registry: `sonic-style-vocabulary`). If Suno gets close on palette and pacing without the tune, that is the more shippable result: a style mirror needs no cover licence.

## Stage-2 gate (proposed)

A tool passes on one take rated 4 or more on instruments, genre and pacing, and "close" overall, by the owner, level-matched, with figures hidden until rated. The page plays both sides at -16 LUFS and shows the count per tool.

## What stage 2 would need to decide

- A cover route needs a licence per track, and the weights are non-commercial. A style mirror needs neither of those from the reference's owner, though resemblance is judged on the output.
- The melody route and the words route are different products. The verdict says which one is worth building.
