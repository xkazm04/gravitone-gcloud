# Suno package: deferred directions

**Status: DEFERRED. Nothing here is scheduled.** The owner parked this on 2026-10-28, after judging hackathon
`audio-steer-1028`, until the Suno-less studio scope (spark `audio-agent-studio`) is established. A future
session picks it up from this file. Each claim is marked VERIFIED (read in code or measured, with where) or
NOT VERIFIED (never run).

The owner's words: "Suno can be one output, but unresolved how can we backwards download and analyze the
generated track - I would put Suno into list of items to resolve separately." And for the hackathon's
instrument-ear entry: "defer into Suno focused package where the experience will yet to be defined as we
don't have good mechanisms to analyze what we generate for now."

## Why it is deferred

The studio can already ask Suno for a track. It cannot hear what came back. A Suno clip is stored as a
reference to suno.com, not as audio, so none of the repo's measurement or triage ever runs on it. Until a
take's audio is local and analysable, a Suno-centred experience would steer blind: the user would describe,
Suno would answer, and nothing would check the answer against the description.

## What exists today (VERIFIED by reading code at 942f87b0)

| Piece | Where | What it does |
|---|---|---|
| Browser driver | `lib/suno/driver.ts`, `lib/suno/selectors.ts` | Playwright over CDP (port 9334). Fills the custom form (title, style, lyrics, exclude), reads new clip ids from the page's own `/api/generate/v2-web` POST, polls `/api/clip/<id>` until complete. One run per model (v6, then v6-wild). |
| Producer + queue | `lib/producers/suno.ts`, `lib/sound/suno/{queue,store,library,propose,draft}.ts` | Metered as unpriced credits; refuses live under `GRAVITONE_DRY_ONLY=1`; dry runs use `standClipRefs` stand-ins (`fakeDriver.ts`). |
| What comes back | `SunoClipRef` in `lib/suno/types.ts:80-89` | `songId`, page URL, `audioUrl` (from `media_urls[0]`; `audio_url` is a `/api/forbidden` placeholder on finished clips), `imageUrl`, `title`, `durationS`. "A REFERENCE, never a file." Stem clips are filtered out of the library feed (`selectors.ts:58-60`). |
| Where clips live | `<sound store>/suno.json` | Records only. The one automatic download is `lib/sound/mv/fetchAudio.ts`, and only for a music-video job. `lib/library/feeds/sound.ts:96-101`: "Suno keeps the bytes, so there is no file to ingest". |
| Analysis that would run on a local file | `lib/sound/measure.ts`, sidecar `measure`, `pipeline/audio/triage.py` | Peaks, RMS, tempo, key; LUFS, true peak, LRA; ten triage detectors. `section-boundary` is experimental (recall 0.40, precision 0.36). No instrument identification, no vocal presence, no stem split, no brief-vs-result check. |
| Section-tag lyrics (hackathon e1) | branch `hackathon/audio-steer-1028/e1`: `packages/ui/src/components/audio/shape.ts`, `steer.ts` | Writes `[Instrumental]`, one `[Section: level words, N bars]` per painted section, `[End]`. NOT VERIFIED: whether Suno follows section tags on an instrumental. |
| Instrument ear (hackathon e3) | branch `hackathon/audio-steer-1028/e3`: `pipeline/audio/samples.py`, `atlas.py`, `lib/audio/atlas/classify.ts` | Measures isolated instrument samples: pitch (median 1.9 cents over 55 instruments), spectral centroid, attack, decay, ring, flatness, air. Words are ranks within the installed library. Applies to isolated sound or separated stems, not to a full mix. |

One outside result matters (vault `.vault/Spark/ideas/suno-prompts-report.html`): an LLM listener (Gemini
audio) returned instruments with roles, vocal character and timestamped sections, and overturned an
instrumentation assumption entirely. The repo's own FFT tempo had octave and 2:3 errors where librosa's beat
tracker was within 1-2%. librosa is installed on this machine but no repo code uses it.

## Directions

Direction A comes first: B, C, D, F and G all need the take's audio on disk.

| # | Direction | Blocking unknown | First probe (no spend) |
|---|---|---|---|
| A | **Bring the take home.** Download a clip's `audioUrl` once into the blob store as a take, then run the existing measure and triage on it. | Does the `media_urls` CDN URL work without a Suno login, stay valid, and serve full quality? Do Suno's terms allow keeping the file? | Fetch one `audioUrl` from a real `suno.json` record with no cookies, again 24 h later; run sidecar `measure` and `triage` on it. |
| B | **Brief vs result.** Check the asked tempo, key, length and section tags against the measured take. | How far Suno drifts from asked bpm, key and tags; whether the repo's tempo estimate is good enough on Suno mixes or librosa is needed. | On 5 kept clips, compare `measure.ts` and librosa `beat_track` / chroma against the style line that was sent. |
| C | **Stem split as the analysis step.** Suno's own stems, or a local separator. | Whether Suno's stem action costs credits and whether the driver can reach it; separator speed on this machine. | (a) Watch network traffic during one manual stem request in the Suno tab. (b) Time a local separator on one downloaded clip. |
| D | **Instrument ear on generated audio** (hackathon e3, closing its loop). Did the instruments we asked for arrive? | Whether instruments can be identified in a full mix at all: a tagger model on the mix, or e3's descriptors on separated stems. | 3 clips whose prompts name known instruments: tagger on the mix, e3 descriptors on stems, score both against the prompt words. |
| E | **LLM listener as analyst.** Structured instrument, vocal and section read from an audio-capable model. | Cost, repeatability, and whether it is grounded in the audio or guessing from genre. The repo's Gemini provider has no inline-audio path (`lib/text/providers/google.ts`). | Same 3 clips, 3 calls each, one schema; compare against D and B and against a person listening. |
| F | **Vocals that leak into "[Instrumental]" takes.** | The leakage rate. | Vocal-stem energy from a separator across the existing library clips; check the top hits by ear. |
| G | **Recalibrate taste from Suno verdicts** (e3's dropped B3). Which axis really changed in a kept or dropped clip? | Needs D or E. | After D/E: kept vs dropped clips' measured centroid and flatness against the duel answers. |
| H | **Suno as one output of the studio.** Once A-D exist, the Suno-less studio's track document (the agent's score) can render a Suno brief from the same intent, bring the take home, and show it beside the local render with the same measurements. | Everything above. | None until A lands. |

## What the hackathon left for this package

- Branch `hackathon/audio-steer-1028/e3` is kept (not merged): the measured instrument atlas, swap with
  "what changes", the suggest band, the taste duel, the team hand. Arena record:
  `.hackathon/arena/audio-steer-1028/entries/e3/` (gitignored, local).
- Branch `hackathon/audio-steer-1028/e1` holds the section-tag lyrics writer and the dry Suno/ElevenLabs
  previews.
- The registry subject that governs acceptance of a delivered generated track is
  `media-generation/generated-music-acceptance` (read it before designing B).
