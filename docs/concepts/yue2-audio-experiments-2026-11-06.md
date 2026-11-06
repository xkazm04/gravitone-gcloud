# Experimenting with YuE2: a local open-weights song model

**Status: first measurements, 2026-11-06, Lynx. Nothing in gravitone calls YuE2 yet.** Every number below is from a real render on this box. Nothing here says the songs are good: no one has judged them by ear yet, and the blind steps verdict is still open.

**Licence first: the weights are CC BY-NC 4.0 (non-commercial).** Experiments are fine. Do not put YuE2 output in a monetized video or a shipped game until the licence question has been answered for that use. This is the main reason it is not a drop-in supplier next to ElevenLabs and Suno.

## What it is

Two sampling stages after an optional notation step:

1. **Notation** (`YuE2GenerateABC`): style and lyrics become ABC, plain-text sheet music with chords, per-section comments and two voices.
2. **Tokens** (`YuE2GenerateMusic`): notation, style and lyrics become about 25 semantic tokens per second of audio. This decides the performance and the arrangement. It has its own `seed`, and it is the slow stage.
3. **Sound** (`KSampler`, `VAEDecodeAudio`): tokens become audio. It has a second seed, and it is the stage `steps` controls.

The reference route replaces step 1: `SheetSage2AudioToABC` transcribes a song into melody notation.

## Setup on Lynx

ComfyUI 0.42.1 has the nodes and two blueprints (`Text to Music (YuE2)`, `Music Cover (YuE2)`). Models, downloaded from `Comfy-Org/YuE2` on Hugging Face, sha256 checked:

| File | Size | Folder under `ai\ComfyUI\ComfyUI\models` |
|---|---|---|
| `yue2_3b_int8_convrot.safetensors` | 3.96 GB | `checkpoints` |
| `sheetsage2_bf16.safetensors` | 1.39 GB | `audio_encoders` (cover route only) |

Tenancy: take the card's lease (`pipeline/gpu/hold.py`) and submit through ComfyUI's queue.

## Run it through the API

```json
{
  "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "yue2_3b_int8_convrot.safetensors"}},
  "2": {"class_type": "YuE2GenerateMusic", "inputs": {"clip": ["1", 1], "style": "...", "lyrics": "[Verse]\n...\n\n[Chorus]\n...", "abc": "", "seed": 4201, "mode": "full", "max_duration": 360, "temperature": 1, "top_p": 0.95, "top_k": 100, "repetition_penalty": 1.2}},
  "3": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["2", 0]}},
  "4": {"class_type": "EmptyYuE2LatentAudio", "inputs": {"seconds": ["2", 1], "batch_size": 1}},
  "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0], "seed": 4201, "steps": 32, "cfg": 1, "sampler_name": "dpm_2", "scheduler": "sgm_uniform", "denoise": 1}},
  "6": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveAudio", "inputs": {"audio": ["6", 0], "filename_prefix": "audio/<run>/<name>"}}
}
```

- Lyrics use `[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]`, and carry only the words to sing.
- To get notation, wire `YuE2GenerateABC` into `PreviewAny`. It takes `clip, style, lyrics, seed, mode, max_abc_tokens 8192, temperature 0.7, top_p 0.9, top_k 30, repetition_penalty 1.005, penalty_window 100`. The text returns in `/history` under the preview node's `text`.
- ComfyUI caches identical prompts, so a repeat render needs a real change. A 0.04 s change to `max_duration` forced one on this version and gave identical audio.

## What we measured

Three original songs, so n is small. "Sound" is mean log-mel distance per bar, "notes" is chroma distance per bar: they show that two files differ, never which is better.

**Speed, for about 120 s of audio.** 2.5x real time at full settings. No sign of trouble at 64 GB unified.

| Stage | Time |
|---|---|
| Notation | about 20 s |
| Tokens | about 33 s |
| Sound, 32 steps / 6 steps | 15.7 s / 4.0 s |
| Whole fresh render, 32 steps / 6 steps | 47.9 s / 36.8 s |
| Transcribe a 120 s reference | 6.3 s |

**The rules that came out of it:**

1. **A render reproduces exactly from notation + both seeds + `max_duration`.** Sample-identical on two songs. Store all four. `max_duration` belongs on that list: see 4.
2. **The seeds split notes from sound.** Same tokens with a new sound seed keeps the notes (0.006-0.007) and changes the sound (0.26-0.30). For another take of a song you like, change the `KSampler` seed and keep the tokens.
3. **A chord edit is not a partial edit.** Changing one chord moved the whole song as far as a new seed did: 1.07 vs 1.02 on one song, 0.68 vs 0.65 on the other. Bars *before* the edit moved as much as bars after it. The edit changes what every token is conditioned on. It guides a new take; it does not repair an approved one. **If you like the audio, keep the audio file**, and splice instead of regenerating.
4. **`max_duration` is a ceiling for length and a seed for everything else.** On song 1, length stayed near 120 s at 180, 300 and 720, but the audio changed each time (sound 0.53-1.26). Set it once and leave it; 360 has been enough. Why 360.04 does not change it was not investigated.
5. **Too low a ceiling cuts the song off.** At 60 it stopped at -10 dB, where natural endings fade to about -60 dB. Measure the delivered length; never use this control to fit a song to picture. The second output of `YuE2GenerateMusic` is the true length.
6. **Six steps saves about a quarter of a render, not most of it.** 36.8 s vs 47.9 s. The gain is large only when tokens are cached, which fits rule 2: audition with 6 steps, re-render the keeper at 32. The 6-step result differed from 32 by less than a different sound seed does (0.07-0.08 vs 0.26-0.30). Whether anyone can hear it awaits the blind pick.
7. **The cover route carries the reference's melody strongly.** Different style and lyrics, reference's notation: notes 0.107 from the reference, against 0.407 without it, closer than the reference's own notation at a new seed (0.143). n=1, using our own song as the reference. "It's not a copy" is not a safe assumption, so use only material we own or have cleared.

## What to try next

- **Blind verdict on 6 vs 32 steps** (open).
- **Listening pass:** do lyrics come through, does the vocal hold, is any take usable under a clip? The trust question for gravitone, and unmeasured.
- **Fit to the trailer pipeline:** render a cue for a real clip, compare to the same brief from ElevenLabs on the same review page. Cost is near zero per take, so generate takes rather than iterating on one.
- **Stems:** nothing here separates voice from instruments. Instrumental via style or empty lyrics is untried.
- **Temperature, `cfg_scale`:** untouched.
- **Memory:** peak use was not read during renders.
- **Longer forms:** nothing over 2.5 minutes has been tried.

## Fit against the plan

[Our own music and local voice post-production](audio-own-music-and-voice-2026-10-24.md) builds music from a score, compiled through instruments, where one note can change and the rest truly stays. YuE2 is the opposite trade: a complete sung song for under a minute of local GPU, with no local edit. They answer different needs, so this does not replace that plan. Its A3 listening pass would apply here too.

Sources: [YuE2 ComfyUI docs](https://docs.comfy.org/tutorials/audio/yue2/yue2.md), [model card](https://huggingface.co/m-a-p/YuE2-3B), [paper](https://arxiv.org/html/2609.33757). The tutorial video that prompted the test is `youtube:vvM4OLYe72I`. Raw figures are kept in the registry's local shift state, in `yue2-notation-1/results.md`.
