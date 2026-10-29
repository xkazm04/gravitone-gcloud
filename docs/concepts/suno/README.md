# Suno package: the advisor, and what it decided about hearing a take

**Status: SHIPPED as spark `suno-advisor` (2026-10-29), the thread composition.** The design, the decisions with their
rejected options, and the research below live in the vault note `.vault/Spark/ideas/suno-advisor.md`. This
file is the repo-side record: what the studio does with Suno, what it refuses to do, and why. Each claim is
marked VERIFIED (read in code, measured, or read on the vendor's own page, with the date) or NOT VERIFIED.

## What the studio does with Suno

The /audio studio (`/audio?s=studio`) is an **idea-maker** for Suno, not a Suno client. The outside agent
(`/studio-agent`, over the MCP door) turns the person's words, verdicts and confirmed taste into a **prompt
card** - style, lyrics with section tags, exclude, model, sliders, and what changed from the last version and
why. For a new direction it also renders a free **local-band sketch** of the same intent, so tempo, mood and
arrangement can be steered before a Suno credit is spent. The person pastes the card into suno.com by hand,
listens on Suno (streaming is unlimited), and comes back with a **verdict**: which take (a, b or both), keep or
drop, and what is off (tempo, energy, vocals, instruments, structure, mix, mood, lyrics). When a take is worth one
of the plan's downloads, they attach the mp3 and Gravitone **measures** it locally ($0) and, on a priced press,
has a model **listen** to it. Confirmed taste lines persist across conversations and seed every new prompt;
confirmed dislikes ride into the exclude field.

The studio never drives suno.com and never fetches audio from Suno.

## Challenge 1 - can we tell what is on a Suno track? (research 2026-10-29)

**Answer: partly, and enough not to steer blind - once the person uploads the take.**

| What | How | Reliability |
|---|---|---|
| Tempo and its octave neighbours, key | librosa (installed) in the audio sidecar's `analyze` verb | Good. The repo's own FFT tempo made octave and 2:3 errors on 2 of 3 tracks; librosa was within 1-2% (VERIFIED, vault report 2026-10-04). |
| Loudness, true peak, LRA, silences, ten defect checks | sidecar `measure` and `triage` (existing) | Measured. |
| Genre, mood, instruments with role and prominence, vocals, timestamped sections | a listener model (Gemini audio, inline) | A **hypothesis**, shown unconfirmed. Audio models over-specify instruments and misread vocal presence ("a universal weakness across all nine models", arXiv 2609.20195; Qwen3-Omni called vocal tracks instrumental, arXiv 2511.10289). It did overturn a wrong genre assumption on a real track (vault, 2026-10-04). About 32 audio tokens per second; quoted at $0.036 for a 3-minute take, most of it the output allowance (see The listener). |
| Did the prompt get followed | the verdict, the measured tempo/key against the prompt, the listener's read against the style words | Relative only. A text-audio similarity model (MuQ-MuLan, weights CC-BY-NC) is a non-goal for v1. |

Not reliably recognisable in a full mix (NOT VERIFIED here, read from the evidence above): an exact
instrument list; vocal presence from a language model alone; whether one named instrument was obeyed;
relative major vs minor; the true tempo octave of a slow or half-time song. Stem separation as an
identification step: Demucs is archived (2025-01) and its six-stem piano is poor (its own README).

## The listener

When the person presses Listen on a take they uploaded, one Gemini audio model hears the take and
writes a `StudioListen`: genre and mood words, its own tempo and key estimate, whether vocals are
heard and what they are like, the instruments with role and prominence (`lead` / `supporting` /
`background`), and timestamped sections. The page shows the read as **unconfirmed**, beside what this
server measured on the file. Audio models over-hear instruments and misjudge vocal presence. Where the
read and the measurement disagree on tempo or key, the measurement stands.

- **Code.** `lib/sound/suno/listen.ts` (`listenTake`, `quoteListen`) runs the listen.
  `lib/sound/suno/listenPrompt.ts` holds the pure half: the prompt, the schema, the quote and the
  answer door. The action is `app/(studio)/audio/studio/_live/sunoActs.ts` `listenAct`. The read is kept
  on the take by `lib/sound/suno/facts.ts` `saveListened`.
- **Model.** `gemini-3.8-flash` is pinned as `SUNO_LISTEN_MODEL` in `lib/text/providers/google.ts`. It
  serves the text router's turn class `suno-listen`, which is planned to google alone in both postures,
  because no other engine here can hear. The audio goes inline as an `inlineData` part beside the
  prompt. The claude CLI and Ollama refuse audio before dispatch.
- **Prompt.** `pipeline/SUNO-LISTEN-PROMPT.md` has one slot, the take's length. The model is not given
  the measured tempo or key, so its estimate stays independent. It may not name an artist or song, and
  it says "uncertain" rather than invent. `npm run check:suno-listen`
  (`pipeline/suno-listen-regression.mts`, offline) pins the prompt's sections and rules on LF and CRLF
  copies, holds the router's schema to the door's, and runs the worked example and recorded refusals
  through the door.
- **Price basis.** The quote is audio seconds × 32 tokens at the kernel table's `audio-input-token`
  rate, plus an allowance of 2,000 prompt tokens at the `input-token` rate and 8,000 output tokens
  (answer plus thinking, which Google bills as output) at the `output-token` rate. All three are
  `google/gemini-3.8-flash` rows in `packages/kernel/src/pricing/table.ts`. The audio row was read from
  ai.google.dev/gemini-api/docs/pricing on 2026-10-29. The 3.8 Flash input price carries no modality
  split there, so audio bills at the input rate: $0.75/M through 2026-12-31 and $1.50/M from 2027-01-01.
  A 180 s take is quoted at **$0.0358**: 5,760 audio tokens ($0.0043), 2,000 prompt tokens ($0.0015)
  and 8,000 output tokens ($0.0300). The output allowance is a ceiling, not a measurement. The settled
  receipt prices the vendor's own token counts.
- **Receipt.** Each press claims a kernel receipt (scope `suno-listen`, keyed by take, dry and live
  apart). A second press while the receipt is fresh (15 min) replays the first read, so the take is
  not paid for twice. A press while one is in flight is a conflict.

### Failure modes (each one is the press's answer, in words)

- **Unpriced.** If any of the three rates is missing, or the introductory rate has lapsed
  (after 2026-12-31 until the row is re-read), Listen refuses with the quote's own sentence, for example
  "listen is unpriced, so it is not run: no audio-input-token price is declared for
  google/gemini-3.8-flash ...". Nothing is claimed or called.
- **Too large.** Google takes at most 20 MB per request, including the prompt. Audio is sent as
  base64 (4/3 of its size), so takes over about 14 MB are refused before any claim. This server does
  not use the Files API.
- **Dry.** Under `GRAVITONE_DRY_ONLY=1` no vendor is called. The read is a stand-in: `model:
  "stand-in"`, `standIn: true`, nothing claimed as heard. It is receipted as a dry claim.
- **No engine.** If `GOOGLE_AI_API_KEY` is missing or the vendor refuses, the router's sentence is
  returned verbatim and the claim is released.
- **Unreadable read.** An answer the door refuses is not kept. Causes are a field outside the schema,
  an answer that sets `model`, `at` or `standIn`, or a section that ends before it starts or past the
  take. The refusal names the field (`listen: instruments.0.prominence: ...`), and the claim is released
  with a note that the vendor may have billed it. Nothing retries: another try is the person's next
  press.
- **Measured live once (2026-10-29, owner-approved).** A 17.7 s local-band render with known contents (synthwave, D minor, 112 bpm; 909 kit, analog pulse bass, warm pad, pluck lead; no vocals) went through `analyze` and one live `gemini-3.8-flash` listen: 8.0 s, settled at **$0.0028** against a quote of $0.032 (the output allowance is a ceiling about 11x the real count). Measured: 112.0 bpm (right), G minor at strength 0.02 (wrong, and flagged as a coin toss). Heard: 110 bpm, F minor (wrong), no vocals (right), drum machine / synth bass / synth pads (right), "synth brass" for the pluck lead (wrong), genre "electro-funk / 80s boogie" (a neighbour of synthwave). One clip, n=1: it agrees with the research above - tempo is solid, roles are plausible, key is unreliable from both sides.

## Challenge 2 - the download limit (vendor pages, read 2026-10-29)

Since 2026-09-03 Suno meters downloads: Free 7 lifetime, Pro 20 a month, Premier 60 a month; a re-download or
another format of the same song counts once; stems are included; unused downloads do not roll over; extra
downloads can be bought; **streaming and sharing stay unlimited**; Suno Studio workflows (Premier) are outside
the limit (help.suno.com articles 13614785, 13926209). There is no public API; an MCP Beta was reported on
2026-10-28 behind a signup form (NOT VERIFIED on a primary page).

**There is no legitimate way around the limit, and the studio does not try.** Suno's Terms (revised
2026-08-10, effective 2026-09-03) bar "data mining, robots, scraping, or similar data gathering or extraction
methods" and obtaining an Output other than through a Suno download channel. The design therefore budgets
downloads instead: a verdict on the stream is free and always enough to move the next prompt; an upload is
the person's choice when measured facts would change it.

## Existing code that conflicts with those Terms (recorded, not changed by this spark)

- `lib/suno/driver.ts` + `selectors.ts`: a Playwright driver over CDP that fills Suno's form and polls
  `/api/clip/<id>` - automated access.
- `lib/sound/mv/fetchAudio.ts`: the music-video job downloads a clip's `audioUrl` (`media_urls[0]`) from Suno's
  CDN - an Output obtained outside a download channel, and outside the metered count.
- The old Direction A of this file ("download a clip's `audioUrl` ... without a Suno login") is withdrawn for
  the same reason.

The owner chose to record this and decide it in a separate spark (wave 1, 2026-10-29). The Floor's Suno lane,
scout's track step and the music-video job still reach these paths until then.

## Directions after this spark

| # | Direction | State |
|---|---|---|
| A | Bring the take home | **Replaced**: the person uploads the mp3 they downloaded (`POST /audio/studio/take`). No CDN fetch. |
| B | Brief vs result | **Partly in S1**: measured tempo/key beside the prompt; the listener's read beside the style words. A formal check against `media-generation/generated-music-acceptance` (brief-conformance listen, structure against plan) is open. |
| C | Stem split | Open. On Premier, Suno's own stem export (3 types) counts inside the same download and Suno Studio exports sit outside the limit - the cheapest stems this owner has. |
| D | Instrument ear on generated audio | Open; needs C. Hackathon e3's descriptors apply to separated stems, not mixes. |
| E | LLM listener | **In S1** (button per take, priced, unconfirmed). |
| F | Vocal leakage into instrumental takes | Open; a vocal-stem energy check after C beats a listener's yes/no. |
| G | Taste from verdicts | **In S1** as a profile the agent proposes and the person confirms. Measured taste axes (e3's B3) stay open. |
| H | Suno as one output of the studio | **This spark.** |

## What the hackathon left (unchanged)

- Branch `hackathon/audio-steer-1028/e3`: the measured instrument atlas, swap with "what changes", the taste duel.
- Branch `hackathon/audio-steer-1028/e1`: the section-tag lyrics writer. NOT VERIFIED: whether Suno follows
  section tags on an instrumental.
