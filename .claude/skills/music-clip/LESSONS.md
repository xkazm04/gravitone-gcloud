# music-clip lessons

## 1.0.0 - 2026-10-30 - gravitone-gcloud
- Look -> hero with no treatment layer produced a slideshow (operator: "a PowerPoint presentation"): a hero written before characters, plot and a camera device exist defaults to type on panels.
- The strips' GPU-off Chromium was reused for scenes; headless Chromium here reaches the RTX Spark via `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`, and `file://` refuses ES module scripts - serve the clip folder on 127.0.0.1.
- Gemini line times were onset-accurate to ~95 s and drifted 15-40 s late after it in one run, not in the next; a line time may confirm a boundary, never move one alone (lib/music-clip/anchor.ts).

## 2.0.0 - 2026-10-30 - gravitone-gcloud
- Research-first + Board T (3-4 treatments, GPU keyframes at shared times, one Opus builder per treatment iterating on its own PNGs) lifted every treatment from slide to film still in one round; the operator picked unit-0451 ("looks great").
- All four builders scored themselves 4-7/10 and named the same ceiling: bodies from primitives read as toys. Next lever: CC0 rigged models (Quaternius) driven by mixer.setTime(t), plates, AI video inserts.
- The operator's win condition is music in the BODIES: beat-locked head nodding in the refrains. Stills cannot show it; cut.mts renders a span with the audio (0.46 s/frame, NVENC).

## 2.1.0 - 2026-10-30 - gravitone-gcloud
- The bake-off was never run: the treatment stage needed a renderer at once, ours reached the GPU, and every approved frame came from it. The operator retired the bake-off: quality, not render speed, decides; perfect the proven stack scene by scene.
- The operator's edit rule for this track: no shot over 3 s, something always happens; army only in refrains and the intense second half. Made enforceable as data (shotplan -> shotlist, `shots` refuses >3 s): 139 shots, longest 2.0 s.

## 2.2.0 - 2026-10-30 - gravitone-gcloud
- Film v1 (139 shots, 4:10, 48 min on NVENC) came back "almost oneshotted"; the operator's notes were all set-level: a pile-up where a line stopped (1:12, 1:30), a hand clipping through a lever grip (2:10), white-slab inserts, an unreadable outro, and an intro that cut where the music does not build.
- Every note went into a set or the plan, never the render: the line flows round 0451 nodding; the fingers close on a wrap circle (chords of radius 52 mm round the grip); the visor-bench strip became glass with an LED line under the bloom threshold; the outro silhouettes the dark army against an emergency-red shutter glow; s01 became one 15 s take (`oneTake` in the plan).
- A contact sheet of shot midpoints did not show the pile-up or the clipping hand: both read only in motion or at full size. Shoot the start, middle and end of every shot that has contact (hands on props, crowds that stop) at 1080p and open them.

## 2.3.0 - 2026-10-31 - gravitone-gcloud
- Film v2 approved except the outro: the s13 cycle ran twice, so "visors going off" and "Signal lost" played again 13 s after they happened, and the last 0.69 s was a hard-cut fragment. The fix was the opening's fix: the ending is one take (`tailTake`), the bars before it each carry one story beat.
- The Suno wav and the mp3 lined up to the sample (lag 0 ms, r 0.999); the master goes under the picture as one AAC generation (320 kb/s; 384 kb/s from 2.4.0) instead of mp3 -> AAC.

## 2.4.0 - 2026-10-31 - gravitone-gcloud
- Break the Sequence shipped after three note rounds (v1 "almost oneshotted", v2 outro only, v3 "very well done"). Every note was a timestamp plus a symptom and every fix landed in a set or the plan; the skill now carries the round as a procedure (Stage 3, Note rounds).
- The proven engine lived only in the operator's Downloads folder, out of reach of the next track. It is now `pipeline/music-clip/film-starter/` (core + router + the one-take exemplar).
- The upload: 513 MB for 4:10 (H.264 16 Mb/s, AAC 384 kb/s); YouTube's cap is 256 GB / 12 h.
