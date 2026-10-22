# `ltx-i2v-api.json` - LTX-2.5 image-to-video, as an API prompt

The graph `lib/imaging/video/comfyLtx.ts` queues on the ComfyUI running on this box: one of OUR
stills in, a 5 s clip with LTX's own generated soundtrack out. /scout's scene clip renders through
it (`SCOUT_CLIP_ENGINE=ltx-local`, the default), on the kernel lane `gpu.local`, priced at $0.

## Where it came from

Converted once, 2026-10-22, from the ComfyUI blueprint
`C:\Users\kazda\ai\ComfyUI\ComfyUI\blueprints\Image to Video (LTX-2.5).json` with
`node C:/Users/kazda/ai/lynx-bench/media/to-api.mjs <blueprint> <out>` (the ComfyUI 0.42.1 frontend,
headless: `loadGraphData` then `graphToPrompt`). Then, by script, and nothing else:

- **The prompt enhancer is gone** (nodes `452:405` CLIPLoader gemma4_e2b, `452:406`
  TextGenerateLTX2Prompt, `452:407` its switch, `452:410` ComfySwitchNode, `452:412` PreviewAny):
  `gemma4_e2b_it_int8_convrot.safetensors` is not on this box, and the bench removed the same
  branch from `ltx-t2v-api.json` for the same reason. `452:408` CLIPTextEncode reads the raw prompt
  `452:409` directly - the motion line is sent as written, never rewritten.
- **The blueprint's subgraph inputs became nodes**: `1` LoadImage feeds `452:433`, and `2`
  SaveVideo takes `452:451` CreateVideo.
- **Defaults** set to the values below.

Every model file it names was on disk when it was converted (`/object_info`); the doctor checks
them again before a live night (`lib/foundry/scout/doctor.ts`, `ltx weights`).

## What it does

Two passes, the blueprint's own "generate low, then x2": the first samples at HALF the output size
(`452:434`/`452:435` divide `452:418`/`452:421` by two) with eight distilled sigmas
(`452:424`), the image laid in at strength 0.7 (`452:429`); `452:438` upscales the latent x2
(`ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors`), and a second pass of three sigmas
(`452:444`) re-lays the image at strength 1 (`452:439`). VAE decode is tiled (`452:449`).

| | file |
|---|---|
| transformer | `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors` (`452:411`) |
| text encoder | `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors` (`452:420`) |
| video VAE | `ltx-2.5-video-vae-bf16.safetensors` (`452:416`) |
| audio VAE | `ltx-2.5-audio-vae-bf16.safetensors` (`452:417`) |
| latent upscaler | `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors` (`452:426`) |

## The nodes the engine sets

`comfyLtx.ts` `LTX_NODES` holds this table and refuses a graph whose node is missing or of another
class - re-converting the blueprint renumbers its nodes, so the table moves with the file.

| what | node | class | input | default |
|---|---|---|---|---|
| image | `1` | LoadImage | `image` | the uploaded still, `gravitone/<sha16>.<ext>` |
| prompt | `452:409` | PrimitiveStringMultiline | `value` | the recipe's motion line (scene.ts `clipRequestOf`) |
| width | `452:418` | PrimitiveInt | `value` | 960 |
| height | `452:421` | PrimitiveInt | `value` | 576 |
| length | `452:413` | PrimitiveInt | `value` | 5 (seconds; frames = s x fps + 1 = 121) |
| fps | `452:425` | PrimitiveInt | `value` | 24 |
| seed, pass 1 | `452:423` | RandomNoise | `noise_seed` | the request's seed |
| seed, pass 2 | `452:442` | RandomNoise | `noise_seed` | the request's seed + 1 |
| output | `2` | SaveVideo | `filename_prefix` | `gravitone/ltx-<sha16>` |

**Why 960x576 and not the plan's 960x544.** Both sides must be multiples of 64: the first pass runs
at half size and `EmptyLTXVLatentVideo` steps in 32. 544 halves to 272, which the latent floors to
256, and the x2 pass then comes out 512 tall. 960x576 is exactly 16:9 - the aspect the replicas are
drawn at - and halves to 480x288 cleanly.

The negative prompt (`452:419`) is the blueprint's, verbatim: "pc game, console game, video game,
cartoon, childish, ugly". It leans against illustrated looks; a painted replica that animates
toward photoreal is the first thing to try it against.

## Timing

Measured 2026-10-22, ComfyUI alone on the card: one 5 s clip at the defaults, from
`B03-ltx-flf2v-keyframe-chain/key1_00001_.png` with "slow push-in, dust drifting right to left",
took **101 s** from upload to the mp4 in hand (99 s of it executing): h264 960x576, 121 frames at
24 fps, an AAC track, 3.4 MB. That is the receipt's seconds per clip (`lib/producers/scoutScene.ts`
`LOCAL_CLIP_SECONDS`). For scale, the Lynx bench's single-pass 1280x704 clip (`B03-clip1`,
2026-10-20) took 373 s: 252 s sampling, 99 s tiled decode. With another session's prompts in the
same queue the bench saw wall time stretch 2-3x; the engine's 20-minute cap counts that wait.

What the smoke showed: the still's look held (painted lanterns, the figure, the palette, through
the "cartoon" negative), the figure walked on a step, and the camera tilted up rather than pushing
in - and LTX filled the sky it revealed with two glowing discs no one asked for. A short motion
line leaves the model room to invent; the recipe's motion line restates camera and light for that
reason (scene.ts `clipRequestOf`).
