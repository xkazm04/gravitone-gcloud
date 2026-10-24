# Our own music and local voice post-production

**Status: PLAN. Nothing in it is built. Written to end a session that drifted; every claim below is
marked VERIFIED (a measurement or a run, with where) or NOT VERIFIED (never run, or only run against a
stand-in).** Read [What this session actually established](#what-this-session-actually-established)
before trusting any other section.

Author: `/spark` session, 2026-10-24. Idea notes (the vault, not versioned):
`.vault/Spark/ideas/audio-postproduction-research.md` (market, trials, EULAs, REAPER and Youlean recon),
`.vault/Spark/ideas/audio-triage.md` (detectors, eval, the labelling session).

The two goals the session started with, in the operator's words: **(1)** create our own music using the
instruments and tooling learned from the downloaded free and trial tools; **(2)** use local tools for
voice post-production. Both are for headless media pipelines (YouTube clips: music, effects, narration;
later game effects). Commercial generators (Suno, ElevenLabs) are *suppliers of raw material*, not the
thing under test.

---

## What this session actually established

### Verified

| Fact | Evidence |
|---|---|
| The audio sidecar measures loudness, true peak, loudness range, clipping and edge silence, within 0.05 LU/dB of ffmpeg `ebur128` | six generated files incl. a clipping square and an AAC copy, `C:\t\recon-youlean\comparison.txt` |
| Ten triage detectors run on a take against its brief. On a seeded corpus of **injected** defects, nine checks reach recall 1.00 at medium+high with 0 false alarms on 40 clean controls; `section-boundary` does not (recall 0.40, 1/8 false alarms) and is marked experimental | `check:audio-triage`, `docs/audio-sidecar.md`, seed 7, 220 files. **Synthetic defects only** |
| **pedalboard 0.9.26 renders MIDI through VST3 instruments on this box**: Vital (7.8 s for 3.5 s of audio), Hybrid (77.6 s, mostly load). MiniGrand returned silence | probe run 2026-10-24; the sidecar then measured both (Vital -14.15 LUFS, Hybrid -19.21, no clipping) |
| REAPER 7.82 (60-day evaluation) renders unattended: `-batchconvert` 1.1 s per 10 s file; effects verified by measurement (bit-exact null when bypassed); 224 JSFX as readable source; Lua, web remote and OSC present | `C:\t\recon-reaper\` (rpp, batch, scripts, logs) |
| ffmpeg here has the voice filters: `rubberband afir afftfilt aecho chorus flanger vibrato acrusher deesser speechnorm afftdn arnndn sidechaincompress loudnorm ebur128` | `ffmpeg -filters`, 2026-10-24 |
| ElevenLabs bills music at 13.75 credits per asked second and sound effects at 11.0, each measured twice from the account balance (which lags a render by 10-60 s) | `lib/music/pricing.ts` rows, 2026-10-24 |
| Free Youlean has no scriptable output (its CLI and every export are Pro); ffmpeg `ebur128` is the automated independent cross-check | `C:\t\recon-youlean\` |
| Every EULA read bans reverse engineering; FabFilter and Waves forbid automated/server processing; Sonible's demo forbids commercial use | `.vault/.../audio-postproduction-research.md`, trial table |

### Built, but NOT VERIFIED the way a reader would assume

- **ElevenLabs text-to-speech "live".** `lib/music/elevenlabs.ts` `speak()` and the live voice act were
  tested against a **fake fetch only**. No real TTS call was made this session (the 49 takes are music
  and effects).
- **LLM-written voice chains.** `pipeline/VOICE-FX-PROMPT.md` and `lib/sound/voiceFx/propose.ts` were run
  only with a stub agent. The text router has never been asked to write a real chain; chain quality is
  unknown.
- **Whether any voice effect sounds like its character.** Nothing was listened to. All voice-FX evidence
  is structural (the stages ran, duration held, peak held).
- **Reachability.** The voice features live inside the explainer project's voice part. A real explainer
  cannot reach it: its `article` and `strips` parts have no real producer (`no producer is bound for a
  strips part yet`, `real.ts:151`; the attempt to bind them was reverted, `921cc7db`). The only surfaces
  that show voice FX are the fixture side and tests. **There is no way today to run voice FX on a
  narration file from a terminal.**
- **Detector-vs-ear agreement.** The 49-take ElevenLabs labelling session exists but nothing has been
  judged; whether the detectors' flags on real takes (section-boundary 17, broken-ending 11, true-peak 10,
  clipping 3, tempo 3, loop-seam 2, mono 1, loudness 1) are right is unmeasured.
- **Music from symbolic input.** Nothing has been composed. The instrument probe above is four notes.

### Where the session misled us (so this plan does not repeat it)

1. A retro footnote (card images) became a whole article/strip-card spark. Reverted, `921cc7db`.
2. My batch runner passed prompts through a shell: 16 takes were generated from one word (~7,650
   credits), and a second runner re-rendered kept items (~1,856). ~9,500 of 23,380 credits spent.
3. `check:voice-fx` shipped green from a worktree whose files the builder had written with LF; it was
   red on `main` (CRLF checkout). Fixed, `de633401`.
4. Commit messages said "live" for paths exercised only by fakes.
5. The first packaging of voice features was "inside the explainer", which is why goal 2 has no
   headless entry point.

---

## The spine both goals share

Everything below is built the way triage was, because that is the part of the session that worked:
**a bounded data contract, a deterministic renderer, a seeded measurement, an offline gate whose floors
are never lowered to fit the code, and a human labelling pass before anything is allowed to rank
things.**

| Piece | State | Plan |
|---|---|---|
| Sidecar (`pipeline/audio/`, pedalboard + pyloudnorm) with `measure`, `fx`, `triage`, `doctor` | built, verified | add verbs `render` (A0), `mix` (B4), `behaviour` (R0) |
| `FxChain` schema (13 bounded stage kinds) | built, verified | reused for per-stem mixing and voice characters |
| Acceptance profiles (`voice-take`, `youtube`) and the `audio.accept` ledger row | built | add a `game` profile (A4) |
| Triage + Board cull with **use / aim** per run | built | judges our own music and voice outputs too |
| Behaviour cards (what a plugin or chain *does*, measured on calibrated signals) | **not built** | R0 |
| REAPER as a render host | recon done | the trial rig, never the production lane |

**Rule for trials and commercial plugins:** reference instruments only. Their output teaches us what to
build on open DSP; it never enters a production render (EULAs above). Black-box measurement first;
static analysis (`rea`/Ghidra) only as a named contingency, per product, after its EULA and EU Art. 6
scope are read, for control-surface evidence, never for DSP or models.

---

## R0 · Behaviour cards - the measurement rig (build first; trials wait for it)

**Why first:** trial clocks are 10-30 days. Opening a trial before the rig exists spends the clock on
installs. The REAPER recon already proved the host half (batch render, effects applied, log parsing);
what is missing is the *measurement*.

`pipeline/audio/behaviour.py` + `docs/behaviour-cards.md`. A **card** is JSON describing a chain or
plugin preset by its measured effect on a fixed signal set: log sweep and pink noise (frequency
response), tone at stepped levels (compression transfer curve, saturation harmonics), impulse
(delay times, reverb decay), a harmonic tone and a speech-like signal (pitch and formant shift),
a decorrelated stereo pair (width). Output: numbers, not adjectives.

Acceptance: (1) the card of a chain **we** wrote recovers its own parameters within tolerance
(a delay of 0.35 s measures 0.35 s ±5 ms; a +5 semitone shift measures +5 ±0.1; a 6 dB shelf measures
6 ±0.5); (2) the same card through REAPER's batch render of an equivalent chain agrees with ours
(proves the rig sees through a host); (3) a card of a hand-built *wrong* chain is distinguishable.
Size: about 1 week. Dispatch: this card, alone, no dependency.

## Goal 1 · Our own music

**Shape:** an LLM (or a person) writes a *score spec*; deterministic code compiles it to MIDI; local
instruments render one stem per instrument; the existing chain/loudness/triage machinery mixes,
masters and judges it. Our music is also the best corpus the triage detectors will ever get: the spec
is **exact ground truth** for tempo, section boundaries and length (this is how `section-boundary`,
today the weak detector, gets fixed against labels instead of guesses).

### A0 · Instrument catalog and a render verb (about 1 week)

- `pipeline/audio/render.py` + sidecar verb `render --midi <file> --instrument <catalog id> --out <wav>`
  and `lib/audio/sidecar.ts renderMidi()`. pedalboard hosts the VST3; an instrument whose render is
  silent is **refused with that sentence** (MiniGrand today: silent, cause unknown - likely a missing
  sample library or preset).
- **The library of instruments is a measured catalog, not a folder:** a data file listing, per entry,
  the plugin path, a preset state (pedalboard `raw_state`), role (drums, bass, chords, lead, pad),
  usable pitch range, licence note, and **an audition card** produced by the render (note-on works,
  loudness at velocity 100, tail length, render time, determinism: two renders compared).
- Candidate stack, free first: Vital (installed; EULA allows commercial output, forbids redistributing
  unaltered presets/wavetables), Hybrid (installed; an AIR plugin whose output licence is **unread**, so it is not catalog-eligible until it is), Surge XT and Dexed (GPL-3, would need installing),
  sampled instruments through sfizz (BSD-2, repo archived 2024-01) with the CC0 VCSL set, or FluidSynth
  2.6.1 (LGPL) with MuseScore_General (MIT). **NOT VERIFIED:** sfizz and FluidSynth on this box;
  Spitfire LABS / BBC SO Discover are royalty-free for output but whether *unattended* rendering is
  allowed is unaddressed by the vendor - ask before any is in the catalog.
- Acceptance: three instruments (one synth, one sampled, one drum kit) pass their audition cards;
  a silent instrument is refused; a catalog entry whose licence note is empty cannot be selected.

### A1 · Score spec, compiler, and the writer prompt (about 1 week, after A0)

- `@gt/domain/audio.score.ts`: a closed, bounded schema (tempo, key, time signature, sections with
  bar counts, tracks `{instrument, role, pattern|notes}`, humanise amounts), parsed only at the door;
  an out-of-range value is refused with its path, never clamped - exactly the `FxChain` discipline.
- Compiler: score spec to one MIDI file per track (`mido`, `pretty_midi`: MIT; `music21`, BSD-3, for
  key and chord checks). A spec whose notes leave the key it declares is refused with the bar.
- `pipeline/SCORE-PROMPT.md` (worked examples across genres, every bound derived from the schema, like
  `VOICE-FX-PROMPT.md`) and an offline regression gate `check:score` (examples parse; refusals hold).
- Acceptance: the gate; the compiled MIDI of each worked example has the declared tempo and length
  to the sample; **no model call in the gate**.

### A2 · Stems, mix, master, accept (about 1 week, after A1)

- Sidecar `render-score`: render every track, **write stems** (WAV per instrument), measure each,
  mix with per-stem `FxChain`s (the schema already exists), sidechain where the spec asks
  (ffmpeg `sidechaincompress`, already in the export), master to the profile's loudness and ceiling,
  then run **triage against the spec as the brief** (duration, tempo, sections known exactly).
- Output is a take in the sound store with `use` and `aim` set (`35cc8733`) and the stems filed beside
  it. Provider is the `local` engine row already declared in `lib/sound/engines.ts` ("declared, not
  installed, with what it would take") - this plan is what installs it. **NOT VERIFIED:** that
  `ProviderId`/`TakeOrigin` accept it without a union change; check in A0 before building on it.
- Acceptance: a 60 s piece from a worked example lands at -14 ±1 LUFS, -1 dBTP, no clipped samples,
  tempo within ±1 bpm of the spec, every section boundary within 0.1 s of the spec (measured,
  not listened), and its triage reads clean; the same spec rendered twice differs by less than a stated
  tolerance (VST3 synths may not be bit-exact: **measure it and write the number down**).

### A3 · Listening pass (the only evidence that it is music)

12 pieces from 12 specs (varied genre, tempo, length), labelled on the Board with use/aim shown:
keep/reject plus a defect code (Q W E R technical codes exist). Cost: LLM calls only, **$0 in
ElevenLabs credits**. Pass bar, set now: at least 6 of 12 kept as usable background beds. If fewer, the
finding is "the writer prompt or the instrument set is the problem" with the rejected codes as the
evidence; the schema and renderer are not the thing to tune.

### A4 · Profiles and placement

A `game` acceptance profile (loop-friendly, different loudness regime, 48 kHz/WAV), loop rendering
from a spec (bar-aligned loop points, tested by the loop-seam detector), and layered effect
construction per `sound-effect-generation/layered-element-assembly` (weight, definition, air layers
as separate instrument renders). Game rights for **ElevenLabs** are restricted on self-serve
(from an excerpt of the Music v1 terms: commercial video games prohibited on self-serve plans without written approval; read the full terms before relying on either reading); our own render has no such
limit but inherits each instrument's licence - hence the licence column in A0.

**Non-goals:** separating or "completing" Suno tracks (Suno has no public API, its terms prohibit
automation, and the usage limit is exhausted); local generative music models (the operator's ruling:
far from commercial quality); stem separation of generated audio (a later use of
`python-audio-separator`, MIT code, **checkpoint licences unread**).

## Goal 2 · Local voice post-production

**Today (on `main`):** the pieces exist but sit behind the explainer project (see above). Standalone,
the useful unit is **files in, files out**: an existing narration (ElevenLabs TTS or imported) goes in;
a processed file plus a report comes out. That is also what a headless pipeline wants.

### B0 · A headless voice CLI (about 1 week, no dependency)

`pipeline/voice.mts` (logic in `lib/audio/voice.ts`, one call into the existing sidecar and router, as
`pipeline/sound.mts` owns no logic):

- `voice fx --in a.wav --describe "ghost whispering from the other side" --out dir` - the chain comes
  from the text router through the existing `proposeChain` (refused at the door with its path, never
  clamped); or `--chain chain.json` / `--preset <name>` with no model at all. Writes `out.wav`,
  `chain.json`, `report.json` (measure, `voice-take` acceptance, the chain's label).
- `voice batch --manifest lines.json` - many lines, many descriptions, one report; resumable.
- `voice speak --text/--file --voice <id>` - ElevenLabs TTS **through the existing per-character meter**
  (`tts-chars`, ceiling default 50,000 characters an hour; $0.08 per 1,000 characters for
  `eleven_multilingual_v2`). **This is the first real vendor call of that path; run exactly one,
  small, labelled, before anything else relies on it.**
- Acceptance: with a stub agent the chain path is byte-reproducible; with the real router one
  description yields a chain the door accepts (log the answer verbatim, expected to sometimes refuse -
  report the refusal rate over 20 descriptions, do not hide it); a `speak` of one 40-character line
  costs what the receipt said.

### B1 · Does it sound like what was asked? (the missing evidence)

- 8 characters (echo hall, ghost, broken radio, robot, demon, giant, tiny, stadium PA) by 3 narration
  lines = 24 renders from a single TTS batch (~600 characters, under $0.10).
- **Make "words must stay intelligible" a measurement** (today it is a sentence in a prompt):
  round-trip intelligibility per `generated-speech-acceptance/round-trip-intelligibility` - transcribe
  the processed take with a local recogniser and compare to the script; the *delta* against the
  unprocessed take is the number. **NOT VERIFIED:** which recogniser runs on this box
  (faster-whisper is the candidate; check install, CUDA and licence in B0, not here).
- Operator labelling: per render, character match (1-5), intelligible (y/n), artifacts (y/n). Two
  producers compared: LLM-written chains vs hand-built presets from B2. Pass bar, set now: at least
  14 of 24 LLM chains rated 4+ on character match **and** intelligibility delta within 10 points of
  word error rate for each.

### B2 · A preset library of characters, as data

Each preset: a chain, its behaviour card (R0), its intelligibility delta, its loudness change, and
its labels from B1. Presets are what a person selects when they do not want to ask a model, and what
the model's examples are built from. Gate: `check:voice-presets` (every preset parses, renders on a
fixed line, and keeps its recorded numbers within tolerance).

### B3 · The trial sprint (once, after R0 and B1)

One sequential sprint through REAPER's batch render, same 8 targets by the same 3 lines, signal set
from R0: **Soundtoys** (30-day trial, email code, no iLok; Little AlterBoy, EchoBoy, Crystallizer),
**Krotos Dehumaniser 2** (10 days, iLok account), **iZotope VocalSynth 2** (10 days). Prepare the
REAPER projects and the comparison script **before starting a clock**; start them one at a time.
Output is a **gap list**: which character our open stages cannot reach (formant control, granular,
vocoder - `ReaPitch` and `ReaVocode` are in REAPER already, ffmpeg `rubberband` has formant options),
each with its behaviour-card difference and an operator A/B. The deliverable is new stage kinds
proposed for `FxChain` with numbers behind them, **not** plugin output in a production render.
REAPER's own evaluation clock started when it was installed (on or before 2026-10-24; Help > About
shows the day) and ends 60 days later; a studio licence is $225 ($60 under $20k revenue).

### B4 · Narration under music, headless

`cutExport` already ducks music under narration (measured: 10.7 dB of ducking, -14.0 LUFS delivered,
TP set to -1.5 because speech-shaped audio measured -0.8 dBTP at TP=-1 after the AAC encode). Move
that graph (`lib/cut/narrationMix.ts`) behind a sidecar `mix` verb so it runs on two files without a
project: acceptance is the same three measurements the export test makes, on generated signals.

### B5 · Cleanup and enhancement, local only

ffmpeg's `afftdn`, `arnndn`, `deesser` and `speechnorm` are present (verified). Evaluate them on a
dirty-speech set built by adding noise, reverb and clipping to clean TTS (so the answer is known):
measure round-trip WER and loudness before and after. ElevenLabs audio isolation is a paid cloud call
and out of scope. **NOT RESEARCHED:** learned local enhancers; list candidates with licences before
picking one, and compare against the ffmpeg baseline with the same numbers.

**Non-goals:** voice cloning or speech-to-speech conversion (ElevenLabs Voice Changer, RVC-style
tools) - identity change, not effects; unresearched, and a consent question this plan does not open.
Re-entering the explainer project: only if its article and strips parts get real producers for their
own reasons.

---

## Sequencing

```
R0 behaviour cards ───────────────────────────────┐
A0 instrument catalog + render verb ── A1 score ── A2 stems/mix/accept ── A3 listening ── A4 profiles
B0 voice CLI ── B1 listening + intelligibility ── B2 presets ───────────── B3 trial sprint (needs R0)
                                      B4 mix verb · B5 cleanup (independent of the above)
```

R0, A0 and B0 touch disjoint files and can run as three parallel builders. Nothing spends money until B0's
single TTS call; A is free. The hard gates: A1 and B2 do not start before their predecessor's measured
acceptance; A3 and B1 are the only steps that need the operator's ears, and each is capped at about an
hour (12 pieces; 24 renders).

## Decisions the operator owns

1. **Instrument licences:** until a vendor answers about unattended rendering, the catalog is
   Vital plus the open stack only (Spitfire/Splice excluded). Agree or override.
2. **Local recogniser** for round-trip intelligibility: allow a pip install of faster-whisper (MIT) on
   the 4090? The alternative is no measured intelligibility gate.
3. **Triage ranking** stays off until the 49-take labelling pass is committed; it is a prerequisite for
   trusting detector flags on our own output, and it is already staged
   (`C:\t\label\label.cmd`, then `pipeline/audio-triage-agreement.mts`).
4. **Trial sprint timing:** B3 only after R0; confirm you want the three named trials and no others.

## State left behind

- `main` is at the commit after `35cc8733`, **not pushed** (many commits ahead of origin; read the log
  before pushing).
- The labelling stores are in `C:\t\label` (49 takes with use/aim, triaged, nothing judged);
  `C:\t\tw2` (1.3 GB) holds the seeded triage corpus; `C:\t\recon-reaper` and `C:\t\recon-youlean` hold
  the recon artefacts. All scratch, none tracked; delete freely except `C:\t\label` until labelled.
- ElevenLabs Creator tier, resets 2026-11-13, no overage; this session used 23,380 credits.
- Open defects not owned by this plan: `runs-live` Playwright probe red on `main` before any of this
  work; `section-boundary` experimental; the reverted explainer path.
