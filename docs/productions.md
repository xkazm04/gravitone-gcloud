# Productions

A kept concept started as a Production moves through hero shots, a rough cut, casting, audio and a final cut. S0 of
spark concept-casting-stages fixes the contract and shows three layouts on scripted data. The design note is
`.vault/Spark/ideas/concept-casting-stages.md`.

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
- Lessons carry `dimension` (`beats`, `art-style`, `technique`) and `state` (`proposed`, `accepted`).
- Event types are the `PRODUCTION_EVENTS` constants. Lessons are `production.lesson-proposed` and
  `production.lesson-accepted`, because `lesson.confirmed` belongs to `lib/sound/lessons.ts`.

Stubs still to fill: `lib/music/voiceDesign.ts` (S3).

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

## The screen

`/scout/productions` is the operator's pick, graph first: columns idea, board, take, stage on the left, the inspector on
the right. The Scout graph's `NodePanel` links a kept idea or storyboard here (`?from=<ref>`). Later stages (casting,
audio, final cut, lessons, ventures) stay as a marked, scripted fold on the slate from `_port/fixture.ts` until S2-S6;
those acts live in memory and reset on reload.

- No fixture audio exists in the repo: each voice preview is a marked silent stub that only records "heard".
- The Board gate is not wired: "open on Board" is disabled and says so.
- `GRAVITONE_PRODUCE_SIDE=fixture` shows the scripted slate only and refuses every act.
