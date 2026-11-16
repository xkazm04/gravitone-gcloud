# Productions

A kept concept started as a Production moves through hero shots, a rough cut, casting, audio and a final cut; a finished
one proposes lessons the operator accepts and can start or join a venture, the unified model for future YouTube channels.
Built by spark concept-casting-stages, S0-S6; the design note is `.vault/Spark/ideas/concept-casting-stages.md`.

## Stages

`accepted` -> `hero` -> `rough` -> `proven` -> `casting` -> `audio` -> `cutting` -> `done`, or `dropped` from any live
stage. The legal moves are data: `productionMachine` in `packages/domain/src/production.machine.ts`.

| From | May move to |
| --- | --- |
| `accepted` | `hero`, `dropped` |
| `hero` | `rough`, `proven`, `dropped` |
| `rough` | `hero`, `proven`, `dropped` |
| `proven` | `casting`, `dropped` |
| `casting` | `audio`, `dropped` |
| `audio` | `cutting`, `casting`, `dropped` |
| `cutting` | `done`, `audio`, `casting`, `dropped` |
| `done`, `dropped` | terminal |

Rules the table carries: a take can be proven from hero shots or from a rough cut; casting comes only after proven; a
re-cast goes back to `casting` and marks later takes stale. Only the operator may enter `proven`
(`OPERATOR_ONLY_STAGES`), and `refusalOfMove` is the sentence a refused move answers with.

## Contract

`packages/domain/src/production.ts` is the zod door; `production.machine.ts` holds the zod-free table, id shapes, closed
sets and event names, so a screen can import them. Records: `Production`, `ProductionSource`, `ProductionTake`,
`ProductionRole`, `CastRound`, `CharacterRecord`, `ProductionLesson`. Absent values: omit the key.

- Production id `prdn:<slug>`. The design said `prod:`; that token is already the router's imaging posture.
- Character id `chr:<ulid>`. Name is no longer identity.
- One `CastRound` is one role: 5 character candidates (`reused` with where it was used, or `new`), 5 voice candidates, one
  pick each, `creditsUsed` and where it was read. A voice's pick stays locked until its preview was heard
  (`voicePickRefusal`). A two-role concept is two rounds.
- Lessons carry `dimension` (`beats`, `art-style`, `technique`), `state` (`proposed`, `accepted`, `nothing`) and `drawnFrom`, the pieces
  of the production's own record each rests on.
- Event types are the `PRODUCTION_EVENTS` constants. Lessons are `production.lesson-proposed` and
  `production.lesson-accepted`, because `lesson.confirmed` belongs to `lib/sound/lessons.ts`.


## The record (S1)

A kernel module, `packages/kernel/src/productions/` (migration `productions` v1): `productions`, `production_takes`.
A stage is read from this record, never from a night. Each production's concept and frames are captured at Start as
`board` and held by their bytes in the blob store; later edits to the source cannot move them. Events are
`PRODUCTION_EVENTS`; a move the machine refuses is refused here with `refusalOfMove`'s sentence, whoever asks.

Start, from `lib/producers/production.ts` `startProduction` (only the operator's press reaches it; a Start pressed twice
is one production). `lib/foundry/scout/concepts.ts` reads what can start:

- a channel episode kept on its night, or `outline-kept` with a kept Codex board. Started (dropped ones too), it stops
  being due: `episodesDue`, the storyboard door `dueEpisode`, and the taste brief read `@gt/kernel/productions/store`
  `startedEpisodes` through `lib/foundry/scout/episodeTaken.ts`.
- a kept Codex board that is not an episode, from `foundry-out/scout-codex/<date>/verdicts.json` joined to `queue.json`.
- an approved outline, from `foundry-out/scout-outlines/<date>/verdicts.json` (`{items: {<id>: {verdict}}}`, only
  `approve` offers Start) joined to `outlines.json` and `queue.json`. A folder without that file offers nothing.

Moved stores: `SCOUT_CODEX_DIR`, `SCOUT_OUTLINES_DIR`, else beside a moved `SCOUT_STORE_DIR`.

## The character record (S2)

A kernel module, `packages/kernel/src/characters/` (migration `characters` v1): `characters`, `character_sources`. Each
character has a stable `chr:<ulid>` id; name is not identity, and two may share one. A character is never deleted.

The importers are `lib/library/characterPools.ts` (reading) and `lib/library/characters.ts` `importCharacters` (writing),
run with `node pipeline/characters-import.mts` (`--dry-run`; `--store <file>` or `--real`; `--pool`). Three pools, each row
with a stable source key:

- `scout-character`, the kept Scout characters through `keptCharacters`, keyed by folded name.
- `muse-army`, the structured cards in `muse-army/*/ratings.json` with their image.
- `codex-kept`, the `keep` sets in `scout-codex/<date>/t6/char-*`, joined to `verdicts.json` and, where `char-` stripped matches,
  to its muse-army card. That join is one person: a kept set and its muse-army card are one record, whichever pool
  imported first, and the set's pictures win. A rejected set is not imported.

`parody-cast` is refused by name in code (`refusalOfPool`): its references are fan-site images. Importing a pool twice
changes nothing; an edited source updates its record by its key, keeping the id. Pictures are held by their bytes in
the blob store. Every import, and every operator save (`saveCharacterToLibrary`, `saveCastCharacter`), sets
`savedToLibrary`. A `createCastCharacter` character lives only in its production until saved.

Search is `matchCharacters`: text scoring over card and slots with field weights and rarity, in a scorer of its own
(`packages/kernel/src/characters/match.ts`) rather than the Library's FTS, which ANDs prefixes over facets and cannot say
why a word hit. Each match names the fields its words hit. A character the operator rated `no` still matches, after all
others.

`recordCharacterUse` appends one `character.used` event per character and production; `usedBy` reads them, so a use outlives
the Library's pruning. The character feed shelves every saved record as `character:<chr id>`; a record imported from a
kept Scout character stays that night's Library item and takes its used-by. A used-by line links to
`/scout/productions?from=<id>`. Night casting (`castStillOf`, `keptCharacters`) is untouched: a new record is castable only
through a production's round (S4).

## Video iterations (S1)

`requestTake` is a receipt, then a confirm, like every launch. It appends a `take-N` (rendering) and enqueues one job,
`production-take`, on `gpu.local` under the `comfy` engine: `packages/producers/src/production-take/define.ts` (steps)
and `lib/producers/productionActs.ts` (acts). A dry job is answered by stand-ins and books a would-call; a live one
renders on `lib/imaging/video/comfyH3.ts`, clips-h3.py's graph and settings.

- `hero`: one clip from the 1-2 frames the operator picks (first-and-last when two). The clip is the take.
- `rough`: refused until a hero take has landed; one clip per panel, each from its own panel, cut in order with ffmpeg.
  A clip's failure is that clip's; a rough cut with no clip at all fails the take.
- Every clip of a take runs on one seed, recorded on the take; takes are appended, never replaced.

Each take records prompt, frames, seed, engine, duration and GPU seconds. Only the operator marks a take proven: an
agent is refused by the machine. A proven take takes the production to `proven`.

A live render has not been run. It needs the tracked `pipeline/video/h3-fl2v-api.json` on the worker's
checkout, ComfyUI at `COMFY_URL` with the H3 weights, and about 20 minutes a clip alone on the card.

## Voices (S3)

Ported from PoF's mechanism. `lib/music/voiceDesign.ts` is the vendor door; one job, `production-voices`, runs a round on
`cloud.elevenlabs` (`packages/producers/src/production-voices/define.ts` the steps, `lib/producers/productionVoices.ts` the
acts and the launches). No live call has been made: every test runs a fake fetch and a fake ffmpeg spawn.

A round is two `design:k` calls (`eleven_multilingual_ttv_v2`, 3 previews a call, so 3 then 2) and one `level:i` per preview.
Each design step stores its bought previews as blobs; levelling is a separate, free step, so a failure there never pays
for the design again. Every candidate speaks one audition line, written by an `AuditionWriter` (`writeAudition`; the fake is
`fakeAuditionWriter`, S4 binds the real one): 100-1000 characters and no audio tags, because the design model would speak
them. A brief is described, not spoken, so it may carry tags.

Previews are compared at one level: two-pass ffmpeg loudnorm to -18 LUFS, -2 dBTP, the second pass applying what the
first measured, spawned without a shell. `preview.lufs` is the level ffmpeg reports for the written file.

`pickVoice` is the only way a vendor voice is created (`POST /v1/text-to-voice`, a voice slot, 17 of 30 used): operator only,
after the preview was heard, on a finished round. Picking twice is the same job's conflict.

Credits: no budget and no refusal. Each call reads what it consumed: the `character-cost` response header, else the
subscription `character_count` delta (polled, because the balance lags). `voiceRoundOf` sums them with the weakest source as
`creditsRead`, or `unread` with `unreadCalls` when neither answered. The delta counts anything else the account spent meanwhile.

A dry round answers with silent stand-ins, books a would-call per design and runs no ffmpeg. A stand-in's `lufs` is the
target, not a measurement. Speech is `speakWithVoice` on `eleven_v3`, `direction` as audio tags; a model that would speak tags
aloud is refused. It has no default voice (`castVoiceIdOf`); George remains the explainer narration's, which expires 2026-12-31.

A crash holds `cloud.elevenlabs` like every paid lane (`holdLaneIn`): the step in flight may have spent, so the operator
acknowledges and retries. Stored steps are not repeated.

## Casting (S4)

`/scout/productions`: `CastingPanel` in the inspector replaces the scripted casting panel. Nothing here has run live: the
text seat, Codex, the safety judge and ElevenLabs are injected fakes in every test (`tests/next-server/casting.test.ts`), and
the only non-fake path is a dry round (stand-ins, no vendor).

`productions` migration 2 adds `roles` and `cast_jobs` columns and the `cast_rounds`, `cast_candidates` tables
(`packages/kernel/src/productions/cast.ts`). A proven production opens casting (`proven -> casting`, the machine's move).
The seat proposes roles and each role's audition line; the operator edits them (`saveRolesIn`).

One round per role (`requestRound`) is one receipt and one transaction: `openRoundIn` writes the five candidates (usable
`matchCards` hits above `USABLE_MATCH_SCORE`, adult only, then new designs), the `production-cast` job draws the new
ones on `seat.text` (a seat turn for the cards, then `draw:<slot>`: `drawCodex` at 1:1 with the first two board frames
as references, then `judgeStill` and `judgeFailure`), and S3's voices job makes five previews. A slot's failure is booked as
that step's (`failed`, or `refused` with `judge: <why>`); the still of a refused design is never stored. `retryDesigns` is a
new job for only the failed and refused slots.

A pick (`pickCast`, operator only) needs its preview played to the end (`markHeard` on the audio's `ended`). It enqueues
S3's create job in the pick's transaction beside the round's picks. The role is cast when that job lands (the voices producer's
`settle` calls `completeCastIn`): the character record (a new design only now), `recordCharacterUse`, the optional save, and
`cast.picked`. A create job that fails leaves the role open with its retry. Credits come from `voiceRoundOf`,
labelled by `creditsRead`, including `unread`.

`moveProductionIn` to `audio` needs every role cast, and refuses a dry cast (a dry voice is a stand-in, as a dry take is).
The way back to `casting` is only `recastRoleIn`, which clears the role's cast and round picks and marks takes at or after
the old pick stale. A picked voice is reused if the operator picks it again; the slot is not spent twice.

## Audio and the final cut (S5)

`productions` migration 3 adds the `audio` column, `production_cuts`, `production_voice_proof`, and `production_takes.speaking`. Nothing here has run
live: the craft scripts and ffmpeg are fakes in every test (`tests/next-server/production-cut.test.ts`); the scripts were run
for real only with `--dry` over the folders this door writes (no encode), and no ComfyUI prompt, GPU or vendor call was made.

**Audio decision.** One record per production at stage `audio`, operator only (`decideAudioIn`): dialogue route (`ref-audio`,
`dub`, `none`), music route (`score`, `track`, `none`) with `musicRef` (a blob address or sha256; required for `score` and
`track`), the picture's own sound (`native`, `none`), who decided. `audio -> cutting` is refused until it exists. A dry cast
still cannot reach audio (S4).

**The voice route, behind a switch.** `productionVoiceRoute` (`lib/producers/productionAudio.ts`) is `dub` until
`recordVoiceProofIn` stores a held proof (`node pipeline/productions-voice-proof.mts --store <file> --set held|failed`), operator
only: the decision door and the panel both read it, so `ref-audio` and a speaking take are refused, by name, until then. A
speaking take (`requestSpeakingTake`, rendered at `audio`, appended, walks no stage) renders ref2va with `ref_images` set to
the character's still and `ref_audios` to the cast voice's line (`lib/imaging/video/comfyH3Ref.ts`, the graph proved in the test
without a submission). The design for the banked proof: `foundry-out/spark-casting-s5/ref-audios-proof.md`.

The dub route lays each cast role's line, its picked voice's own mastered preview, over the picture in the cut: one line per
scene from its opening; a line past the picture's end is cut there and named on the cut.

**The final cut.** A receipt, one resumable job on `box.render` (`packages/producers/src/production-cut/define.ts`,
`lib/producers/productionCutActs.ts`), `$0`. A track picks the music-clip craft, anything else the trailer's (`cutFormatOf`). It
WRAPS `pipeline/trailer/cut.mts` and `pipeline/music-clip/assemble.mts`, unedited: `writeFolder` builds the folder each reads
and the door runs it with `process.execPath` and no shell, then ffmpeg lays any dub lines or a score bed. Each uses `h264_nvenc`.
A dry job asks no script and no ffmpeg and rehearses (`rehearsed`: no video, no packet).

A live cut lands as `pkt:final:<production>/<cut>`, a kernel-native packet source (`lib/decision/v1/sources/final.ts`, read beside
`liveNow`, as the proofs' and spend's are), so `runs-live` and `ledger-reconcile` have no row for it. Keep approves (`done`); reject
must name a reason and returns the cut, the production staying at `cutting`. `done` is only ever reached through that approval.

## Ventures (S6)

Ventures unify what `project` used to mean three ways: a kernel venture (`channel`, `album`, `game`; `packages/domain/src/genre.ts`) is the
future YouTube channel. Migration `ventures` 2 adds `channel_id` and lets a channel name no genre (the rebuild keeps the rows and ties
of v1; `bornVenture` holds who may). Three new grounds, each the operator's, each a `proposal` prefix, beside a night's kept proposal:

- `channel/<id>`, an imported channel. `node pipeline/ventures-import.mts --dry-run | --store <file> | --real`, one per channel file; a
  repeat run changes nothing. Its frame is what was imported and fixed; the screen reads the live card from the channel file.
- `production/<id>`, a proven video, started from the done state's panel (or any stage after proven).
- `operator/<slug>`, the Start button on `/scout/ventures`.

**Nights do not read these** (`isNightVenture`, read in `lib/foundry/scout/genres.ts` `headsOf` and `ventureRefusal`, and the /scout filter): the channel
files stay what nights read until parity is proven, and a night's brief naming one of these ventures is refused as unknown. A night's own proposal
door is unchanged: a channel it proposes still rests on a publishable genre.

`joinVentureIn` and `startVentureIn` (`packages/kernel/src/productions/venture.ts`) are operator only and need a proven take; a production joins one
venture, once (`production.venture` event; a trigger holds it). `/scout/ventures` (linked from Scout's head) lists every venture with its channel card,
its productions and its accepted lessons.

## Lessons (S6)

`productions` migration 4: `production_lessons`, one row per dimension, per production. Nothing here has run live: the text seat is a fake in
`tests/next-server/ventures-lessons.test.ts` and no vendor or seat was called.

The Board's approval of a final cut (`lib/decision/v1/sources/final.ts`, the same transaction that reaches `done`) enqueues one `production-lessons` job
on `seat.text`, armed live by the operator's own approval unless the box is dry-only. It runs `pipeline/LESSONS-PROMPT.md`'s turn over the production's
own record (what the operator said on its cuts and audio, its episode's verdict, each take) and writes one proposal per dimension (`lib/producers/productionLessons.ts`). A
proposal must cite that record: a ref the production does not hold fails the turn. Where the record says nothing on a dimension the seat answers
`nothing` and the row says so; it can never be accepted. The regression control is `pipeline/lessons-regression.mts` (`npm run check:lessons`).

The operator edits and accepts (agents are refused by name); accepted rows are fixed. A job that failed, or a dry rehearsal, is the panel's Propose lessons, a
receipt then a confirm; a dry job writes stand-ins that can never be accepted. Accepting queues one registry lead (kinds `lesson-beats`, `lesson-art-style`,
`lesson-technique`, keyed by production and dimension, so pressing again never writes twice; the queue sits in a different store than the
kernel, so a queue failure says so and Accept is pressed again) and feeds the taste brief's `## Accepted lessons` section per project
(`lib/foundry/scout/tasteLessons.ts`), under the production's venture, or the channel of its episode, read on each brief. No accepted lesson is no section, so a brief with none is byte for byte what it was.

## The screen

`/scout/productions` is the operator's pick, graph first: columns idea, board, take, stage on the left, the inspector on
the right. The Scout graph's `NodePanel` links a kept idea or storyboard here (`?from=<ref>`). Every panel reads the record.

- No fixture audio exists in the repo: each voice preview is a marked silent stub that only records "heard".
- `GRAVITONE_PRODUCE_SIDE=fixture` shows the scripted slate (`_port/fixture.ts`) and refuses every act; no other path reads it.
