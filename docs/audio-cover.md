# Audio cover

`/audio?s=cover`: a song's section transcribed by SheetSage2 and rendered as five YuE2 takes on this box's card, judged by ear, the winner downloaded for Suno, the remix brought back by hand. Spark `track-mirror-studio`, 2026-11-07. Stage 1 and its measurements: [track-mirror-2026-11-07.md](concepts/track-mirror-2026-11-07.md).

## Rights

Every upload declares `own`, `licensed` or `third-party-uncleared`, with no default. A cover carries the source's melody whatever its style (registry `reference-track-anchoring`), and YuE2's weights are CC BY-NC 4.0. So `lib/sound/cover/rights.ts` `coverRights` never answers `publishable`: an uncleared song is `reference-only`, a declared one `unknown` with a note naming the weights. The owner chose warn-only on 2026-11-07: download is never blocked, an uncleared winner's download states the consequence once, and the Library entries carry the record. Nothing here aims at a vendor's upload screening, and a vendor saying nothing about an upload is not a clearance.

## Flow and where it lives

| Step | Code |
|---|---|
| Upload, declare, measure with ffprobe | `app/(studio)/audio/cover/source/route.ts`, `_cover/upload.ts` |
| Section on the waveform, peaks decoded in the browser | `_cover/desk/Source.tsx`, `@gt/ui` `RangePick` |
| Receipt ($0), then confirm with its token | `_cover/acts.ts` -> `lib/producers/cover.ts` `launchCover` |
| One job `job:cover:<id>`, gpu.local, engine comfy | `packages/producers/src/cover/define.ts`, `lib/producers/coverActs.ts` |
| Steps `transcribe`, `render-1`..`render-5` | `lib/sound/cover/{cut,yue2}.ts` |
| Takes A/B against the section, pick | `_cover/desk/{Takes,useAB}.tsx`, `pickCoverAct` -> `winner.mp3` 320 kbps |
| Remix and the back-filled styles | `cover/remix/route.ts`, `saveCoverStylesAct` |
| Library: section, winner, remix as `reference`, origin `cover` | `lib/library/feeds/cover.ts` |

Store: `<SOUND_STORE_DIR or foundry-out/sound>/covers/<id>/` with `cover.json`, `source.<ext>`, `section.wav`, `score.abc`, `takes/s<seed>.flac`, `winner.mp3`, `remix.<ext>`. A take reproduces from the score, its seed and `max_duration` (360).

Knobs are fixed: SheetSage2 mode full; YuE2 mode full, temperature 0.8, top_p 0.95, top_k 100, repetition_penalty 1.2, cfg_scale 1, 32 steps, dpm_2, sgm_uniform. Seeds from `sha256(<id>/<n>)`. Empty lyrics become the score's own section labels as tags.

## The brief (2026-11-08)

A draft cover offers **Brief**: one job, `job:cover-brief:<id>` on `seat.text`, that writes the cover and launches it.

1. `measure` - pipeline/track-mirror/analyze.py in `TRACK_MIRROR_PYTHON` (default `<home>/ai/tools/track-mirror-venv`): tempo, key, sections, low end, top end. Free.
2. `listen-1..3` - three Gemini reads through the `suno-listen` turn with `pipeline/cover-listen-PROMPT.md`, an open question that names no genre. Each priced on the receipt; a stand-in under `GRAVITONE_DRY_ONLY=1`.
3. `write` - one Claude Code turn on the seat with `pipeline/cover-brief-PROMPT.md`: the cover style in comma tags, the source style, the section (the whole song when it fits 360 s), empty lyrics, a reason, and how many reads agreed on the genre. Genre words only where two of three reads agree.
4. Settle applies the brief to a cover still in draft and launches its five takes. A DRY job applies nothing and says so.

The record's `brief` carries the state; the desk re-reads its view every 60 s (`COVER_POLL_MS`) only while the brief or the cover job is queued or running, and on returning to the tab.

**Agreement is not truth.** The first real write turn (2026-11-08, Tears, fed round 1's three stored reads) wrote post-rock: all three reads agreed on the genre the owner rejected, and the two-of-three rule passed it. Only the neutral listen prompt can change that, and it has not met a live song yet. Read the reason beside the style before trusting the genre; the takes cost only GPU time to redo. That turn took 51 s and $0.27 of seat time.

## Measured

The first real job (2026-11-07, a 20 s section of the Tears reference, temp stores, after an hour queued behind another tenant): transcribe 2.4 s, renders 10-12 s each, 55 s in all; five takes of 20-27 s. Stage 1 measured about a minute per two-minute take.

## Known limits

- **A failed cover or brief is retried as the same job, not relaunched.** The brief shows the existing job's id. The job id is fixed per cover, so a second launch answers `existing`; Runs' retry resumes at the first missing step. A ComfyUI failure is a vendor failure the kernel retries three times before the job fails; the take keeps ComfyUI's sentence.
- **ComfyUI's output folder keeps every rendered flac.** Its HTTP API cannot delete them; the cover's own copies are the ones the app reads.
- **Queued behind any GPU tenant.** H3 batches and benches hold the same lease, sometimes for hours.
- **Unmeasured:** a song with a sung line (both test songs transcribed with an empty Vocal voice), a section cut from inside a longer source in a real job, and the layouts on real covers. `?fixture=<state>` drives the layouts on stand-in data in development only.
- **The worker runs the code it started with:** after landing, restart the Gravitone worker task before the first cover.
