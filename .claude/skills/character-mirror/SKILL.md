---
name: character-mirror
version: 1.0.0
category: Development
description: Mirror a fictional film character on local Flux 2 from film stills used as reference images, then extend it into new scenes and styles for parody. Measured on the parody cast 2026-10-27, where Vader and Yoda came out as copies, Chewbacca came close and Gollum stayed far. Masked, costumed and creature characters are mirrored whole. A human character played by an actor is mirrored neck-down, with an invented face. Invoke with /character-mirror <character> [<character> ...].
argument-hint: "<character> [<character> ...]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Monitor
---

# Character mirror - film stills in, an on-model character out

Words carry a style, but they do not carry an identity (ai-registry `character-identity-continuity`). Bibles written
from film study got the costume close and the face and body wrong. Three film stills passed to Flux 2 as reference
latents fixed that for Vader and Yoda.

## The line (read first)

- **A real person's face is never mirrored.** For a human character played by an actor, the face on screen IS the
  actor. Their refs are cropped neck-down: costume, build, props and hands. The card's `kind` is `human`, and
  `queue.mjs` then writes an invented face into every prompt. Never pass a still that shows an actor's face, and
  never crop one in later. The same holds for a creature or masked character: a still where the performer shows
  (unmasked, behind the scenes) is not a ref.
- This skill overrides the repo's rule "a source seeds words, never pixels" for parody characters, at the operator's
  request (2026-10-27). Stills stay in `foundry-out/parody-cast/refs/` for study and are never redistributed.
- Output for publishing follows channel P1's edge (`foundry-out/scout-channels/P1.json`): no logo, title mark or
  score, and never a real actor's likeness.

## 1. Gather stills - 6 to 8 per character

Folder: `foundry-out/parody-cast/refs/<key>/01.jpg ...`, with a `sources.json` that has `{file, url, page, shows}`
per still. Use official or editorial pages (a studio press kit, a fan wiki's file page of a film frame). Never use a
login page, a paywall, an AI gallery or a re-upload.

Cover these views: a full body from the front and from 3/4, a head close-up (masked or creature only), a back or
side view, and the hands and props. Write `bible.md` alongside: the invariants only (silhouette, colours, materials,
proportions, props).

## 2. Downscale - always

A 21 MP still hung a draw for over 10 minutes. Scale every ref to at most 1024 px:

```bash
mkdir -p refs1024/<key>; for f in refs/<key>/*.jpg; do ffmpeg -loglevel error -y -i "$f" -vf "scale='min(1024,iw)':'min(1024,ih)':force_original_aspect_ratio=decrease" "refs1024/<key>/$(basename "$f")"; done
```

## 3. Cards - pick 3 refs, write the core

`cards.json`, one entry per character:

```json
[{ "key": "yoda", "kind": "creature", "core": "<invariants in words: build, height, colours, materials, props>",
   "rules": "<what the model drifts on, as negatives: 'eyes never glow', 'face fully furred'>",
   "refs": ["refs1024/yoda/02.jpg", "refs1024/yoda/01.jpg", "refs1024/yoda/07.jpg"],
   "scene": "standing on a stool behind a cafe counter, frothing milk at an espresso machine" }]
```

- **Ref choice:** one head close-up, one full body from the front, and one from 3/4 or the side. The runner holds
  at most 3 (FLUX_REFS_MAX).
- **No names in prompts:** no character, actor or title names. Describe what is seen.
- **Rules:** add one each time a draw drifts. Measured examples: Vader's lenses glowing red, Chewbacca's muzzle
  reading as an ape, Gollum's skin turning pink.

## 4. Queue and draw

```bash
node .claude/skills/character-mirror/queue.mjs cards.json foundry-out/parody-cast/<date>-mirror
npx tsx .claude/skills/character-mirror/runner.mts foundry-out/parody-cast/<date>-mirror <deadline ISO>
```

- **Shots:** each character gets three, on one seed: a turnaround `sheet` (16:9), a `portrait` (1:1) and a `scene`
  (16:9, the extension test).
- **Late:** `late 0`, references for the whole denoise, won on all four characters. `late 0.25` drifts toward a
  cartoon. Use `--arms 0,0.25` only to re-measure.
- **Time:** ~3-4.5 minutes per draw with refs, against ~70 s without.
- **ComfyUI:** never restart it under a live worker. Stop a runner by its pid, and never the pid of
  `workers\runner.mts`.

## 5. Judge - contact sheet per character

```bash
ffmpeg -i img/m-<k>-sheet-l00.png -i img/m-<k>-portrait-l00.png -i img/m-<k>-scene-l00.png -filter_complex "[0]scale=-1:400[a];[1]scale=-1:400[b];[2]scale=-1:400[c];[a][b][c]hstack=3" <k>.jpg
```

Open it and set each still beside its refs. Grade the character a **mirror**, **close** or **far**, and write the
grade into `REVIEW.md` with the drift named.

- **Close:** add a rule for the drift and redraw on the same seed.
- **Far after two rule passes:** the model does not know the creature (Gollum, 2026-10-27). Try tighter head-crop
  refs. If it is still far, raise it with the operator as a case for another model (Qwen-Image-Edit for more refs,
  HunyuanImage 3 when its memory and non-commercial licence are accepted). Never switch models on your own.

## 6. Derive

Derive only from a mirror. Keep its 3 refs and `late 0`, and change only the words: a new scene, a style ("as a
1950s tin toy", "as a watercolor storybook figure") or a parody situation. If the identity breaks in a derivation,
the style words are too strong; say the style in fewer words.

## Measured (parody-cast r3, `foundry-out/parody-cast/2026-10-27-r3/REVIEW.md`)

| Character | Grade | Drift left |
|---|---|---|
| vader | mirror | the lenses glow red |
| yoda | mirror | none |
| chewbacca | close | the muzzle reads as an ape; staging in the scene |
| gollum | far | pink skin, cartoon eyes |
