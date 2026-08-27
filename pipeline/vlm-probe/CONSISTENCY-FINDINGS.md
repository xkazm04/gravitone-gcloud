# Consistency spike — what holds, at what distance, and what it costs

**Answers** `CONSISTENCY-SPIKE.md`. Run 2026-08-26 on the 4090 box.
**Short answer: there is a route.** Three shots, one character, one location,
three genuinely different camera setups, at the same identity distance real film
holds across a real cut. It needed one non-obvious trick, and the obvious version
of the same idea produces exactly the slideshow the brief was afraid of.

## The bar, and whether it was met

> Three shots. One character, one location, three different camera setups — a
> wide, a medium and a close — that a viewer accepts as the same scene.

Met, by **reference conditioning admitted late in the denoise**. The winning lane
is `shots/reference-face-e25`: a wide, a profile medium and a low-angle close of
one woman in one hangar, worst identity distance **0.371** against a real-film
floor of **0.364**. Scaling that to thirty shots is now an engineering problem.

## The ruler had to be built first, and it nearly lied

The brief said to decide measurement before generating. That instruction paid for
itself immediately, in a way worth recording because the failure was silent.

The plan was an embedding distance between character crops, anchored against real
film. Built that with DINOv2 over automatically-detected person boxes, and
calibrated it on the Duel of the Fates, where the same characters recur across
real cuts and two of them wear the same robes in the same corridor:

| anchor pair | DINOv2 distance |
|---|---|
| Qui-Gon vs Qui-Gon, across a cut, framing + lighting change | 0.50 – 0.59 |
| Qui-Gon vs **Obi-Wan**, same robes, same corridor, same light | **0.28** |

**Inverted.** Two different actors scored *closer* than one actor across a cut.
A generic image embedding reads costume, palette and framing loudly and identity
quietly, so it was measuring "is this the same kind of picture", not "is this the
same person". Every number it produced about generated shots would have meant the
opposite of what it claimed, and nothing in the output would have looked wrong.

Replacing it with a face-identity embedding (MTCNN + FaceNet/VGGFace2) turned the
ruler the right way up:

| | identity distance |
|---|---|
| **floor** — same actor across a real cut | 0.281 – **0.364** |
| **hard ceiling** — different actor, same robes, same light | **0.625** – 0.733 |

Separation **+0.26**. That is the scale every number below is read against, and
`identity.py` refuses to print a distance without it.

Where it goes blind, measured rather than assumed: **no face, no score** — Maul's
prosthetics and a back-to-camera Obi-Wan both return zero detections. And on
Pelennor Fields, with helmets, crowds and motion blur, the *same* character
across two shots reached 0.70 — worse than the Duel set's different-character
ceiling. The scale holds for clean single-face frames and not beyond.

## The lanes

Cheapest first, as the brief asked. `identity.py` is a separate program from
`consistency.py` on purpose, so a disappointing number cannot quietly become a
different measurement.

| lane | worst identity, shot-to-shot | camera obeyed? | verdict |
|---|---|---|---|
| baseline, focal length only | 0.486 | n/a — one setup, three crops | passes the wrong test |
| baseline, real camera moves | **0.764** | yes | **fails** — past the different-actor ceiling |
| reference, full hero, always on | 0.168 | **no** | **slideshow** |
| reference, face crop, always on | 0.232 | **no** | **slideshow** |
| reference, face crop, joins at 45% | 0.577 | yes | passes, loose |
| **reference, face crop, joins at 25%** | **0.371** | **yes** | **passes, at the real-film floor** |

### 1. Prompt and seed discipline — better than expected, then it breaks

Fixed seed, the character and location clauses reused byte-for-byte, only camera
and action varying. The brief expected this to be insufficient. On the first run
it scored 0.486 — comfortably inside the band — and that result was worthless,
because **a fixed seed does not give you three camera setups, it gives you three
zoom levels of one setup**. All three shots shared a background layout, a light
shaft and a body position. The camera never moved; the lens did.

Rewriting the three setups to move the camera somewhere the others cannot see
from — a low wide behind a foreground crate, a profile medium from her right, a
low-angle close from her left — sent the worst pair to **0.764, past the ceiling
that says "different person"**. Prompt discipline holds a zoom and does not hold
a cut. That is the honest baseline, and it is the number the later lanes beat.

One caveat, stated because it cuts against the conclusion: the worst pair is a
frontal wide against a profile, and FaceNet degrades on profiles. Face sizes were
comparable across lanes (100×135 px in the wide vs 114×158 in the zoom lane), so
resolution is not the cause — but some part of that 0.764 is pose, not drift. The
visible drift is real regardless: the scar changes cheek between the medium and
the close.

### 2. Reference conditioning, the obvious way — the slideshow

`ReferenceLatent` is already installed and Flux 2 dev chains it, so **this cost
nothing to try**. The brief budgeted a ~20 GB MiniMax H3 Ref2VA download for this
lane; for stills that download is not needed at all. (It is still needed to carry
a reference into *motion*, which is the next question, not this one.)

Feeding every shot the same hero still scored **0.168** — better than real film,
"as tight as real film" on every pair. It is worthless. Two of the three shots
came back as *the hero image itself*, with a look distance of **0.0002** between
them and the camera direction ignored entirely.

The reference at full strength does not condition the shot, it **replaces** it.
This is precisely the failure the brief named — "does it produce a slideshow?" —
and the metric called it a triumph. The naive human look at the contact sheet is
what caught it, exactly as the brief predicted it would have to.

A useful accident: the LOOK axis was built to ask "does the world hold", and it
turns out to double as a collapse detector. A near-zero look distance between two
shots means they are not two shots.

### 3. Reference conditioning, admitted late — the thing that works

Composition is decided in the early denoising steps and identity in the later
ones. So give the text prompt the frame to itself for the first quarter of the
denoise, and only then let the reference join to assert the face
(`ConditioningSetTimestepRange` + `ConditioningCombine`).

I changed two things at once — a face-only reference crop *and* the late join —
so I ablated them:

- **Face crop alone, reference always on: still a slideshow** (0.232, camera
  overridden — the medium is not a profile and the close is not a low angle).
- **The timestep gate is what restores camera control.** The face crop only stops
  the background being copied; it does not give the camera back.

Where the reference joins is a real dial, and it trades identity against camera
freedom in the direction you would expect:

| reference joins at | worst identity | camera |
|---|---|---|
| 0% (always on) | 0.232 | overridden |
| 25% | **0.371** | obeyed |
| 45% | 0.577 | obeyed |

**25% is the operating point** — three distinct setups at the real-film floor.
Two points do not make a curve, and the window between 0% and 25% is unmapped.

### 4. A trained LoRA — not reached, and not needed yet

Lanes 1–3 answered the question, so per the brief this was not started. It
remains the fallback if identity has to hold across thirty shots rather than
three, and its honest cost — a LoRA per character means the pipeline generates
trailers for characters it has been trained on, not arbitrary ones — is unchanged
and still a deliberate decision rather than a drift.

## What it costs

- **140–210 s per 1280×720 shot** at 20 steps on the 4090. A three-shot lane is
  8–10 minutes wall-clock including engine recycles. A 24-shot trailer of stills
  is roughly 70–90 minutes of GPU.
- **No download.** The winning technique uses only what was already on disk.
- Measurement is CPU-only and free: DETR + MTCNN + FaceNet, ~1 s per frame.

`guard.py` earned its place. Its headroom check fired **nine times across six
lanes** — RAM hit 0.0 GB free with commit at 137/164 GB during the first lane
alone. Every one of those would have been the silent hang the brief describes.
Commit charge, not free VRAM, was the predictor every time, as documented.

## What this does and does not license

**Does:** the structure lane can be designed against a real answer. Identity
across a hard cut is a solved-enough problem at three shots, using a hero still
and a late-joining reference, with no new model weights.

**Does not:**

- **Three shots is not thirty.** Drift is cumulative and untested past three, in
  stills and in motion alike.
- **The reference still replaces rather than conditions at the head of every
  clip.** The timestep gate that fixed exactly this in stills is untested in
  motion.
- **One character, one location, one grade.** Nothing here says the technique
  survives a costume change, a location change, or a character whose face the
  detector cannot find — and the ruler goes silent on that last case rather than
  reporting a bad score.
- **The ruler is calibrated on live-action.** The corpus lane's stylised
  animation is exactly where both the annotator and this ruler are least trusted.

## Motion — the second half, run after the Ref2VA download landed

The stills answer said nothing about whether a character survives being
*animated*. `motion.py` asks the two questions stills cannot, using the same face
ruler, because a frame is a face.

The Ref2VA checkpoint (20.96 GB) and the ref2v 4-step turbo LoRA (1.96 GB) are
now on disk. **This is the only part of the whole spike that genuinely needed a
download.**

### A third rung on the ruler, and a floor under it

Motion introduces a failure stills cannot have: drift *within* one clip. That
needs a tighter anchor than "across a cut", so the scale gained one — frames 022
and 023 of the Duel are two moments of a **single continuous shot**.

| rung | identity distance |
|---|---|
| **within one continuous take** | **0.188** |
| same actor across a real cut | 0.364 |
| different actor, same robes | 0.625 |

The ruler also gained a refusal. Every "reads as a different person" verdict in
the first motion scoring involved a face of **12×15, 15×19 or 21×28 px** — wide
shots, where FaceNet's 160×160 input is fed pure interpolation and returns
confident noise. Every frame with a real face measured 125 px or more. The two
populations sit so far apart that `MIN_FACE_PX = 80` is not a tuned parameter,
and below it the honest output is "cannot be scored", not a number.

This corrected a conclusion drawn before the floor existed: the chain lane's
0.947 between one clip's first and middle frame looked like identity collapsing
inside a single take. It was a 12 px face. **Wide shots are routinely unscoreable
for identity, and that is a fact about trailers rather than a bug** — a wide
shot's identity is carried by silhouette and costume, which is what the LOOK axis
reads.

### The two techniques, scored only on pairs the ruler can actually see

| lane | worst scoreable identity pair | verdict |
|---|---|---|
| chain (FL2VA, clip N opens on clip N-1's last frame) | **0.6262** | **at the different-actor ceiling — a different person by clip 3** |
| **ref2va (every clip references the same hero)** | **0.1887** | **tighter than one continuous take of real film** |

**Chaining does not survive a hard cut, and the way it fails is specific.** It
holds beautifully through continuous action — within the settled part of a clip
distances reach 0.05. But because clip N is *forced* to open on clip N-1's last
frame, a hard cut makes the model spend the head of the clip morphing away from
an image belonging to a different shot. Clip 2 opens on the back of a head and
passes through a mangled, distorted scar on the way out. Cumulatively, clip 1 to
clip 3 lands at 0.6262 — the number that means a viewer sees someone else.

**Reference conditioning survives it.** Worst pair 0.1887 across three hard cuts,
tighter than the same actor within one continuous take of real film. Same face,
same scar on the same cheek, same jacket, in a profile medium, a wide, and a
low-angle close-up.

### The stills failure comes back, in a new place

Ref2VA has one clear flaw, and it is the slideshow again wearing a different hat:
**every clip opens on the hero still.** The first frames of all three clips sit
at 0.02–0.04 from each other on the look axis — they are the same picture. The
clip then escapes to its actual shot by mid-clip.

So the stills finding generalises: *a reference at full strength does not
condition, it replaces*. In stills it replaced the whole frame; in motion it
replaces the opening of the clip. In stills the fix was to admit the reference
late in the denoise. That fix is untested here and is the obvious next
experiment; the cheap workaround meanwhile is to trim the head of each clip,
which a trailer edit does anyway.

### What motion costs

- **15–27 minutes per 3-second clip** at 832×480, 73 frames, 4 turbo steps.
  Clips get *slower* through a lane on identical work — 1243s, 1642s, then past
  2400s, where the third timed out and its job vanished from history, costing the
  full 40 minutes. The per-clip timeout is now 7200s: a client that gives up
  early throws away work the GPU has already finished.
- A 24-shot trailer at this setting is roughly **8–10 GPU-hours**, against 70–90
  minutes for the same trailer as stills.
- **VRAM, not host memory, is what binds.** Clip 2 of the first chain lane died
  with 20.23 GiB still allocated from clip 1 while RAM and commit both looked
  healthy — `headroom_ok()` could not see it. `guard.vram_ok()` now exists and
  `motion.py` recycles the engine before every clip; against a 20-minute
  generation a 30-second restart is free.

### A disk finding that has nothing to do with the download

Free space fell from 262 GB to 100 GB during the stills lanes while nothing was
downloading. **Windows had grown `pagefile.sys` to 146 GB** in real time to
absorb the commit charge, then released it back to 118 GB when the load dropped.

This closes a loop in the brief's own ops notes. Commit charge is the number that
predicts failure; disk is where commit charge *lives*. A full disk means the
pagefile cannot grow, which means commit hits its limit, which is the
`HostBuffer.read_file_slice failed` hang. `guard.py` now reports disk and
pagefile in `--status` and refuses a heavy stage below a 40 GB floor.
**Do not "fix" a large pagefile by capping it — it is load-bearing.**

### This box is not ours alone, and `guard.py` assumed it was

Discovered at the end of the session, and the most expensive mistake in it. A
second workload — `forge.py plans/sweep-01.json`, writing `foundry-*` images —
was driving the **same ComfyUI** throughout. Its dry-run produced ten images
between 19:52 and 20:16, which overlaps the motion lanes exactly.

`guard.recycle_comfy()` is `Stop-Process -Force`. It fired **nine times across
the stills lanes and once before every motion clip**. Any foundry job in flight
at those moments died silently, and from that pipeline's point of view for no
reason at all. A `free_comfy()` call made at the end to tidy the card was
followed immediately by ComfyUI going down — with host RAM at 0.7 GB free, which
is the documented failure mode on its own, so this is not provable either way,
but it is not exculpatory either.

ComfyUI is a shared singleton with no notion of tenancy. The only available
courtesy is to look before killing, so `guard.foreign_job()` now inspects the
running queue and identifies jobs by the `filename_prefix` they will write;
`recycle_comfy()` raises rather than restarting when a job that is not ours is
running, unless explicitly forced. Verified against the live foundry job.

**Anything on this machine that restarts ComfyUI must check first.** The
alternative is two pipelines quietly destroying each other's work for hours.

### Getting 21 GB onto the disk was harder than generating with it

Worth recording, because all three failures were silent in the way this project
keeps meeting:

- **hf_xet** — process alive 30 minutes, "fetching" logged, **zero bytes
  written**, no error. Disabled with `HF_HUB_DISABLE_XET=1`.
- **plain `huggingface_hub` HTTP** — burst to 93 MB/s, reached 7 GB, then froze
  with the process still alive.
- **`curl -C -`** — ran, but restarted from zero instead of resuming, then
  decayed to 500 kB/s.

What worked was `hf_hub_download` wrapped in a retry loop: the `.incomplete` in
the cache is resumable, so a stall costs a resume rather than the file.
`fetch_ref2va.py --check` verifies both files by size.

## Reproducing it

```bash
python identity.py                                    # print the scale, verify it separates
python consistency.py --lane baseline                 # the honest baseline
python consistency.py --lane reference --ref-crop face --late 0.25 --tag=-face-e25
python identity.py --set shots/reference-face-e25     # score against the scale

python fetch_ref2va.py                                # 23 GB, resumable; --check verifies
python motion.py --lane chain  --width 832 --height 480 --length 73 --steps 4
python motion.py --lane ref2va --width 832 --height 480 --length 73 --steps 4
python identity.py --set clips/ref2va                 # same ruler, motion frames
```

H3 accepts clip lengths congruent to 5 mod 17; `motion.py` warns and names the
nearest valid value rather than failing deep inside ComfyUI.

`--zoom` reruns the easy setups that vary only focal length, kept because it is
the version of this test that looks like it passes.
